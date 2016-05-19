// Contains the main rendering logic.

(function(exports) {
    "use strict";

    // A dumb hack to have "multiline strings".
    function M(X) { return X.join('\n'); }

    // A simply coarse picking program for coarse collision detection.
    var PICK_VERT_SHADER_SOURCE = M([
        'uniform mat4 u_modelView;',
        'uniform mat4 u_localMatrix;',
        'uniform mat4 u_projection;',
        'attribute vec3 a_position;',
        '',
        'void main() {',
        '    gl_Position = u_projection * u_modelView * u_localMatrix * vec4(a_position, 1.0);',
        '}',
    ]);

    var PICK_FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform vec4 u_pickId;',
        '',
        'void main() {',
        '    gl_FragColor = u_pickId;',
        '}',
    ]);

    function createPickProgram(gl) {
        var vertShader = GLUtils.compileShader(gl, PICK_VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = GLUtils.compileShader(gl, PICK_FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        prog.modelViewLocation = gl.getUniformLocation(prog, "u_modelView");
        prog.projectionLocation = gl.getUniformLocation(prog, "u_projection");
        prog.localMatrixLocation = gl.getUniformLocation(prog, "u_localMatrix");
        prog.positionLocation = gl.getAttribLocation(prog, "a_position");
        prog.pickIdLocation = gl.getUniformLocation(prog, "u_pickId");

        return prog;
    }

    var RenderContext = new Class({
        Name: 'RenderContext',

        initialize: function(gl) {
            this._gl = gl;

            this.currentProgram = null;
        },

        setProgram: function(prog) {
            var gl = this._gl;

            this.currentProgram = prog;
            gl.useProgram(this.currentProgram);
        },
    });

    // The main renderer.
    var Scene = new Class({
        initialize: function(gl) {
            this._gl = gl;

            this._cameraPos = vec3.create();
            this._cameraLook = vec3.create();
            this._modelView = mat4.create();

            this._projection = mat4.create();
            mat4.perspective(this._projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.2, 256);

            gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

            this._contactPlane = new Models.ContactPlane(gl);

            this._renderCtx = new RenderContext(gl);
            this._renderCtx.modelView = this._modelView;
            this._renderCtx.projection = this._projection;

            this._pickProgram = createPickProgram(gl);

            this.models = [];
            this._contactPoints = [];
        },

        setCamera: function(pos, look) {
            var gl = this._gl;

            vec3.copy(this._cameraPos, pos);
            vec3.copy(this._cameraLook, look);
            mat4.lookAt(this._modelView, this._cameraPos, this._cameraLook, [0, 1, 0]);
        },

        _unprojRay: function(out, x, y) {
            var rayClip = vec4.clone([x, y, -1, 1]);
            var rayEye = vec4.create();
            var projInv = mat4.create();
            mat4.invert(projInv, this._projection);
            vec4.transformMat4(rayEye, rayClip, projInv);
            rayEye = vec4.clone([rayEye[0], rayEye[1], -1, 0]);

            var rayWorld = vec4.create();
            var mvInv = mat4.create();
            mat4.invert(mvInv, this._modelView);
            vec4.transformMat4(rayWorld, rayEye, mvInv);
            rayWorld = vec3.clone([rayWorld[0], rayWorld[1], rayWorld[2]]);
            vec3.normalize(out, rayWorld);
        },

        setPickCoordinates: function(x, y) {
            this._pickX = x;
            this._pickY = y;
        },
        _pickModel: function(x, y) {
            var gl = this._gl;

            if (x < -1 || x > 1) return null;
            if (y < -1 || y > 1) return null;

            var pixel = new Uint8Array(4);

            // xxx: pass through viewport mouse rather than clip space?
            var viewport = gl.getParameter(gl.VIEWPORT);
            var px = ((x+1)/2 * viewport[2]) | 0;
            var py = ((y+1)/2 * viewport[3]) | 0;
            gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            // if we aren't opaque, we didn't hit anything
            if (pixel[3] != 255)
                return null;

            var i = pixel[0];
            return this.models[i];
        },

        _castRay: function(x, y) {
            var model = this._pickModel(x, y);
            if (!model)
                return;

            // XXX: pick surfaces, not models
            var surface = model._surface;

            var direction = vec3.create();
            this._unprojRay(direction, x, y);
            var pos = this._cameraPos;

            var surfacePlaneN = surface.normal;
            var surfacePlaneV = vec3.clone(surface.origin);
            vec3.transformMat4(surfacePlaneV, surfacePlaneV, model.localMatrix);

            var denom = vec3.dot(direction, surfacePlaneN);
            var p = vec3.create();
            vec3.subtract(p, pos, surfacePlaneV);
            var t = -vec3.dot(p, surfacePlaneN) / denom;
            var out = vec3.create();
            vec3.scale(out, direction, t);
            vec3.add(out, pos, out);

            model.setContactPoint(out);
            this._contactPoints.push(out);
        },

        attachModel: function(model) {
            this.models.push(model);
        },

        _renderPickBuffer: function() {
            var gl = this._gl;
            var ctx = this._renderCtx;

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.FRONT);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this._renderCtx.setProgram(this._pickProgram);
            this.models.forEach(function(model, i) {
                var pickId = new Float32Array([0, 0, 0, 1.0]);
                pickId[0] = i / 255.0;
                gl.uniform4fv(ctx.currentProgram.pickIdLocation, pickId);
                model.pick(this._renderCtx, pickId);
            }.bind(this));
            gl.disable(gl.CULL_FACE);
        },
        _render: function() {
            var gl = this._gl;

            gl.enable(gl.DEPTH_TEST);
            gl.clearColor(0.2, 0.2, 0.4, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this.models.forEach(function(model) {
                model.render(this._renderCtx);
            }.bind(this));
        },
        _renderContactPoints: function() {
            var gl = this._gl;

            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-1.0, 1.0);
            this._contactPoints.forEach(function(contactPoint) {
                var model = this._contactPlane;
                mat4.identity(model.localMatrix);
                mat4.translate(model.localMatrix, model.localMatrix, contactPoint);
                model.render(this._renderCtx);
            }.bind(this));
            gl.disable(gl.POLYGON_OFFSET_FILL);
            gl.disable(gl.BLEND);
        },
        update: function() {
            this._contactPoints = [];
            this.models.forEach(function(model) {
                model.setContactPoint(null);
            });

            this._renderPickBuffer();
            this._castRay(this._pickX, this._pickY);
            this._render();

            this._renderContactPoints();
        },
    });

    function clamp(v, min, max) {
        return Math.max(Math.min(v, max), min);
    }

    window.addEventListener('load', function() {
        var canvas = document.querySelector("canvas");
        var gl = canvas.getContext("experimental-webgl");
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;

        var scene = new Scene(gl);

        var platform = new Models.Platform(gl);
        scene.attachModel(platform);

        var bridge = new Models.Box(gl, 20, 6, .2);
        mat4.translate(bridge.localMatrix, bridge.localMatrix, [0, 2, 0]);
        scene.attachModel(bridge);

        var keysDown = {};
        function isKeyDown(key) {
            return !!keysDown[key.charCodeAt(0)];
        }

        window.addEventListener('keydown', function(e) {
            keysDown[e.keyCode] = true;
        });
        window.addEventListener('keyup', function(e) {
            delete keysDown[e.keyCode];
        });

        var T = 0.35, P = 0.10;

        function setCameraFromTP(theta, phi) {
            var camera = mat4.create();
            var rad = 25;
            var mx = Math.cos(theta) * Math.cos(phi) * rad;
            var my = Math.cos(theta) * Math.sin(phi) * rad;
            var mz = Math.sin(theta) * rad;
            scene.setCamera([mx, my, mz], [0, 0, 0]);
        }

        var mouseX = 0, mouseY = 0;
        var t = 0;

        function update(nt) {
            var dt = nt - t;
            t = nt;

            var cbr = canvas.getBoundingClientRect();
            var cx = clamp((mouseX - cbr.left) / cbr.width, 0, 1);
            var cy = clamp((mouseY - cbr.top) / cbr.height, 0, 1);
            var rx = cx * 2 - 1;
            var ry = -(cy * 2 - 1);

            if (isKeyDown('A'))
                T += 0.05;
            if (isKeyDown('D'))
                T -= 0.05;
            if (isKeyDown('W'))
                P += 0.05;
            if (isKeyDown('S'))
                P -= 0.05;

            setCameraFromTP(T, P);

            scene.setPickCoordinates(rx, ry);
            scene.update();

            requestAnimationFrame(update);
        }

        window.addEventListener('mousemove', function(event) {
            mouseX = event.clientX;
            mouseY = event.clientY;
        });

        update(0);
    });

})(window);
