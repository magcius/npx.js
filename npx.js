(function(exports) {
    "use strict";

    function compileShader(gl, str, type) {
        var shader = gl.createShader(type);

        gl.shaderSource(shader, str);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    function M(X) {
        return X.join('\n');
    }

    var VERT_SHADER_SOURCE = M([
        'uniform mat4 u_modelView;',
        'uniform mat4 u_localMatrix;',
        'uniform mat4 u_projection;',
        'attribute vec3 a_position;',
        '',
        'varying float v_lightIntensity;',
        'uniform float u_modelHeight;',
        '',
        'void main() {',
        '    v_lightIntensity = abs(a_position.y / u_modelHeight);',
        '',
        '    gl_Position = u_projection * u_modelView * u_localMatrix * vec4(a_position, 1.0);',
        '}',
    ]);

    var FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform vec3 u_modelColor;',
        'varying float v_lightIntensity;',
        '',
        'void main() {',
        '    vec3 color = u_modelColor;',
        '    vec3 lit = mix(color, vec3(0), v_lightIntensity);',
        '    gl_FragColor = vec4(lit, 1.0);',
        '}',
    ]);

    function createProgram(gl) {
        var vertShader = compileShader(gl, VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = compileShader(gl, FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        prog.modelViewLocation = gl.getUniformLocation(prog, "u_modelView");
        prog.projectionLocation = gl.getUniformLocation(prog, "u_projection");
        prog.localMatrixLocation = gl.getUniformLocation(prog, "u_localMatrix");
        prog.positionLocation = gl.getAttribLocation(prog, "a_position");
        prog.modelColorLocation = gl.getUniformLocation(prog, "u_modelColor");
        prog.modelHeightLocation = gl.getUniformLocation(prog, "u_modelHeight");

        return prog;
    }

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
        var vertShader = compileShader(gl, PICK_VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = compileShader(gl, PICK_FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

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

    var TAU = Math.PI * 2;

    function clamp(v, min, max) {
        return Math.max(Math.min(v, max), min);
    }

    var GREEN  = [0.6, 0.8, 0.2];
    var PURPLE = [0.4, 0.2, 0.8];
    var PINK   = [1.0, 0.2, 0.8];

    var VERT_N_ITEMS = 3;
    var VERT_N_BYTES = VERT_N_ITEMS * Float32Array.BYTES_PER_ELEMENT;

    function createPlatform(gl) {
        var N = 16;
        var RADIUS = 10;
        var EXTRUDE_LENGTH = .5;
        var TAPER_LENGTH = 3;

        // Our construction for the platform has a set of N "surface"
        // vertices, which are then extruded below by EXTRUDE_LENGTH, connected
        // a final "central point" which is then down TAPER_LENGTH.

        // We also have two central points, one to form the top of the
        // platform, and one for the bottom of the platform. So, two sets
        // of N vertices, and two centers brings us to N+N+2.

        var SURFACE_N_VERTS = (N + 1);

        var verts = new Float32Array(VERT_N_ITEMS * (SURFACE_N_VERTS * 2));

        // The construction itself consists of a primitive for the "surface",
        // N primitives for the extruded walls, and one primitive for the
        // bottom taper, which has a similar layout to the surface.

        // The "surface" primitive is a TRIANGLE_FAN, which starts with the
        // central vert, goes through N outer verts, and then goes back to
        // the first outer vert.
        var SURFACE_N_INDXS = 1 + N + 1;

        // Each wall takes 4 indexes in TRIANGLE_STRIP mode.
        var WALL_N_INDXS = 4;
        var indxs = new Uint8Array(SURFACE_N_INDXS * 2 + WALL_N_INDXS * N);

        var model = {};
        model.name = 'platform';
        model.height = TAPER_LENGTH + EXTRUDE_LENGTH;
        model.localMatrix = mat4.create();
        model.primitives = [];
        model.surface = {};

        // Build the "surface".

        var surfaceVerts, i, vert, prim;

        // Start with the top central vert.
        vert = new Float32Array(verts.buffer, 0 * VERT_N_BYTES, VERT_N_ITEMS * 1);
        vert[0] = 0;
        vert[1] = 0;
        vert[2] = 0;

        surfaceVerts = new Float32Array(verts.buffer, 1 * VERT_N_BYTES, VERT_N_ITEMS * N);
        for (i = 0; i < N; i++) {
            var theta = (i / N) * TAU;
            var y = Math.sin(theta) * RADIUS;
            var x = Math.cos(theta) * RADIUS;
            surfaceVerts[i * VERT_N_ITEMS + 0] = x;
            surfaceVerts[i * VERT_N_ITEMS + 1] = 0;
            surfaceVerts[i * VERT_N_ITEMS + 2] = y;

            indxs[i+1] = i+1;
        }

        // Cap off the top of the surface.
        indxs[i+1] = 1;

        prim = {};
        prim.color = GREEN;
        prim.start = 0;
        prim.count = (N + 2);
        prim.drawType = gl.TRIANGLE_FAN;
        model.primitives.push(prim);

        model.surface.prim = prim;
        model.surface.normal = vec3.clone([0, 1, 0]);
        model.surface.origin = vec3.clone([0, 0, 0]);

        // Now extrude down and build the bottom surface cap.
        var vert = new Float32Array(verts.buffer, (SURFACE_N_VERTS) * VERT_N_BYTES, VERT_N_ITEMS * 1);
        vert[0] = 0;
        vert[1] = -EXTRUDE_LENGTH - TAPER_LENGTH;
        vert[2] = 0;

        indxs[SURFACE_N_INDXS] = N+1;

        surfaceVerts = new Float32Array(verts.buffer, (SURFACE_N_VERTS + 1) * VERT_N_BYTES, VERT_N_ITEMS * N);
        for (i = 0; i < N; i++) {
            var theta = (i / N) * TAU;
            var y = Math.sin(theta) * RADIUS;
            var x = Math.cos(theta) * RADIUS;
            surfaceVerts[i * VERT_N_ITEMS + 0] = x;
            surfaceVerts[i * VERT_N_ITEMS + 1] = -EXTRUDE_LENGTH;
            surfaceVerts[i * VERT_N_ITEMS + 2] = y;

            indxs[SURFACE_N_INDXS + i+1] = (N+2) + i;
        }

        // Cap off the top of the surface.
        indxs[SURFACE_N_INDXS + i+1] = N+2;

        prim = {};
        prim.color = PURPLE;
        prim.start = (N + 2);
        prim.count = (N + 2);
        prim.drawType = gl.TRIANGLE_FAN;
        model.primitives.push(prim);

        // Now build all the walls.
        for (var i = 0; i < N; i++) {
            // The walls do not require any new vertices. We simply use
            // the same surface vertices. The top and bottom surface vertices
            // start at 1 and N+2, respectively, so we simply chain around those.
            var topVert = 1 + i;
            var bottomVert = N+2 + i;

            // Now calculate the wall clockwise of us.
            var topVert2 = topVert + 1;
            if (topVert2 >= SURFACE_N_VERTS)
                topVert2 = 1;

            var bottomVert2 = bottomVert + 1;
            if (bottomVert2 >= (SURFACE_N_VERTS * 2))
                bottomVert2 = SURFACE_N_VERTS + 1;

            var startIndx = (SURFACE_N_INDXS * 2) + (WALL_N_INDXS*i);
            indxs[startIndx+0] = topVert;
            indxs[startIndx+1] = topVert2;
            indxs[startIndx+2] = bottomVert;
            indxs[startIndx+3] = bottomVert2;

            prim = {};
            prim.color = PINK;
            prim.start = startIndx;
            prim.count = WALL_N_INDXS;
            prim.drawType = gl.TRIANGLE_STRIP;
            model.primitives.push(prim);
        }

        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        var elementBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indxs, gl.STATIC_DRAW);

        model.buffer = buffer;
        model.elementBuffer = elementBuffer;

        var prog = createProgram(gl);
        model.program = prog;

        return model;
    }

    function createBox(gl, w, l, h) {
        var WIDTH = w;
        var LENGTH = l;
        var HEIGHT = h;
        var hw = WIDTH/2, hl = LENGTH/2;

        var model = {};
        model.name = 'box';
        model.height = HEIGHT * 2;
        model.localMatrix = mat4.create();

        var SURFACE_N_VERTS = 4;

        var verts = new Float32Array(VERT_N_ITEMS * (SURFACE_N_VERTS * 2));
        var indxs = new Uint8Array(4 * 6);

        verts[0]  = -hw;
        verts[1]  = 0;
        verts[2]  = -hl;
        verts[3]  =  hw;
        verts[4]  = 0;
        verts[5]  = -hl;
        verts[6]  = -hw;
        verts[7]  = 0;
        verts[8]  =  hl;
        verts[9]  =  hw;
        verts[10]  = 0;
        verts[11] =  hl;

        verts[12+0]  = -hw;
        verts[12+1]  = -HEIGHT;
        verts[12+2]  = -hl;
        verts[12+3]  =  hw;
        verts[12+4]  = -HEIGHT;
        verts[12+5]  = -hl;
        verts[12+6]  = -hw;
        verts[12+7]  = -HEIGHT;
        verts[12+8]  =  hl;
        verts[12+9]  =  hw;
        verts[12+10] =  -HEIGHT;
        verts[12+11] =  hl;

        model.primitives = [];
        var prim;

        // top surface
        indxs[0] = 0;
        indxs[1] = 1;
        indxs[2] = 2;
        indxs[3] = 3;

        prim = {};
        prim.color = GREEN;
        prim.start = 0;
        prim.count = 4;
        prim.drawType = gl.TRIANGLE_STRIP;
        model.primitives.push(prim);

        model.surface = {};
        model.surface.prim = prim;
        model.surface.normal = vec3.clone([0, 1, 0]);
        model.surface.origin = vec3.clone([0, 0, 0]);

        // bottom surface
        indxs[4] = 4;
        indxs[5] = 5;
        indxs[6] = 6;
        indxs[7] = 7;

        prim = {};
        prim.color = PURPLE;
        prim.start = 4;
        prim.count = 4;
        prim.drawType = gl.TRIANGLE_STRIP;
        model.primitives.push(prim);

        // walls
        indxs[8]  = 0;
        indxs[9]  = 1;
        indxs[10] = 4;
        indxs[11] = 5;

        prim = {};
        prim.color = PINK;
        prim.start = 8;
        prim.count = 4;
        prim.drawType = gl.TRIANGLE_STRIP;
        model.primitives.push(prim);

        indxs[12] = 0;
        indxs[13] = 2;
        indxs[14] = 4;
        indxs[15] = 6;

        prim = {};
        prim.color = PINK;
        prim.start = 12;
        prim.count = 4;
        prim.drawType = gl.TRIANGLE_STRIP;
        model.primitives.push(prim);

        indxs[16] = 1;
        indxs[17] = 3;
        indxs[18] = 5;
        indxs[19] = 7;

        prim = {};
        prim.color = PINK;
        prim.start = 16;
        prim.count = 4;
        prim.drawType = gl.TRIANGLE_STRIP;
        model.primitives.push(prim);

        indxs[20] = 2;
        indxs[21] = 3;
        indxs[22] = 6;
        indxs[23] = 7;

        prim = {};
        prim.color = PINK;
        prim.start = 20;
        prim.count = 4;
        prim.drawType = gl.TRIANGLE_STRIP;
        model.primitives.push(prim);

        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        var elementBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indxs, gl.STATIC_DRAW);

        model.buffer = buffer;
        model.elementBuffer = elementBuffer;

        var prog = createProgram(gl);
        model.program = prog;

        return model;
    }

    function createScene(gl) {
        var cameraPos = vec3.create();
        var cameraLook = vec3.create();

        var modelView = mat4.create();

        var projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.2, 256);

        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

        var pickProgram = createPickProgram(gl);

        var prog = null;
        function setProgram(program) {
            prog = program;
            gl.useProgram(prog);
        }

        function renderModelPrologue(model) {
            gl.bindBuffer(gl.ARRAY_BUFFER, model.buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.elementBuffer);
            gl.uniform1f(prog.modelHeightLocation, model.height);
            gl.uniformMatrix4fv(prog.projectionLocation, false, projection);
            gl.uniformMatrix4fv(prog.modelViewLocation, false, modelView);
            gl.uniformMatrix4fv(prog.localMatrixLocation, false, model.localMatrix);
            gl.vertexAttribPointer(prog.positionLocation, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.positionLocation);
        }
        function renderModelEpilogue(model) {
            gl.disableVertexAttribArray(prog.positionLocation);
        }
        function renderPrimitive(prim, i) {
            gl.uniform3fv(prog.modelColorLocation, prim.color);
            gl.drawElements(prim.drawType, prim.count, gl.UNSIGNED_BYTE, prim.start);
        }

        function renderModel(model) {
            setProgram(model.program);
            renderModelPrologue(model);
            model.primitives.forEach(renderPrimitive);
            renderModelEpilogue(model);
        }

        var models = [];
        function attachModel(model) {
            models.push(model);
        }
        function setCamera(cameraPos_, cameraLook_) {
            vec3.copy(cameraPos, cameraPos_);
            vec3.copy(cameraLook, cameraLook_);
            mat4.lookAt(modelView, cameraPos, cameraLook, [0, 1, 0]);
        }
        function render() {
            gl.enable(gl.DEPTH_TEST);
            gl.clearColor(0.2, 0.2, 0.4, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            models.forEach(renderModel);
            renderModel(rayCastModel);
        }

        var rayCastModel = createBox(gl, 1, 1, 1);

        function pickSurface(x, y) {
            if (x < -1 || x > 1) return null;
            if (y < -1 || y > 1) return null;

            gl.enable(gl.DEPTH_TEST);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            setProgram(pickProgram);
            models.forEach(function(model, i) {
                var color = new Float32Array([0, 0, 0, 1.0]);
                color[0] = i / 255.0;
                gl.uniform4fv(prog.pickIdLocation, color);
                renderModelPrologue(model);
                var prim = model.surface.prim;
                gl.drawElements(prim.drawType, prim.count, gl.UNSIGNED_BYTE, prim.start);
                renderModelEpilogue(model);
            });

            var pixel = new Uint8Array(4);

            // xxx: pass through viewport mouse rather than clip space?
            var viewport = gl.getParameter(gl.VIEWPORT);
            var px = ((x+1)/2 * viewport[2]) | 0;
            var py = ((y+1)/2 * viewport[3]) | 0;
            gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            // if we aren't opaque, we didn't hit anything
            if (pixel[3] == 0)
                return null;

            var i = pixel[0];
            return models[i];
        }

        function unprojRay(out, x, y) {
            var rayClip = vec4.clone([x, y, -1, 1]);
            var rayEye = vec4.create();
            var projInv = mat4.create();
            mat4.invert(projInv, projection);
            vec4.transformMat4(rayEye, rayClip, projInv);
            rayEye = vec4.clone([rayEye[0], rayEye[1], -1, 0]);

            var rayWorld = vec4.create();
            var mvInv = mat4.create();
            mat4.invert(mvInv, modelView);
            vec4.transformMat4(rayWorld, rayEye, mvInv);
            rayWorld = vec3.clone([rayWorld[0], rayWorld[1], rayWorld[2]]);
            vec3.normalize(out, rayWorld);
        }

        function castRay(x, y) {
            var model = pickSurface(x, y);
            if (!model)
                return;

            var surface = model.surface;

            var direction = vec3.create();
            unprojRay(direction, x, y);
            var pos = cameraPos;

            var surfacePlaneN = surface.normal;

            var denom = vec3.dot(direction, surfacePlaneN);
            var t = -vec3.dot(pos, surfacePlaneN) / denom;
            var out = vec3.create();
            vec3.scale(out, direction, t);
            vec3.add(out, pos, out);

            mat4.identity(rayCastModel.localMatrix);
            // mat4.multiply(rayCastModel.localMatrix, rayCastModel.localMatrix, model.localMatrix);
            // XXX: hack it so that the model is centered around the cursor
            mat4.translate(rayCastModel.localMatrix, rayCastModel.localMatrix, out);
        }

        var scene = {};
        scene.attachModel = attachModel;
        scene.setCamera = setCamera;
        scene.castRay = castRay;
        scene.render = render;
        return scene;
    }

    window.addEventListener('load', function() {
        var canvas = document.querySelector("canvas");
        var gl = canvas.getContext("experimental-webgl");
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;

        var scene = createScene(gl);

        var platform = createPlatform(gl);
        scene.attachModel(platform);

        var bridge = createBox(gl, 20, 6, .2);
        mat4.translate(bridge.localMatrix, bridge.localMatrix, [0, 2, 0]);
        scene.attachModel(bridge);

        function setCameraFromTP(theta, phi) {
            var camera = mat4.create();
            var rad = 25;
            var mx = Math.cos(theta) * Math.cos(phi) * rad;
            var my = Math.cos(theta) * Math.sin(phi) * rad;
            var mz = Math.sin(theta) * rad;
            scene.setCamera([mx, my, mz], [0, 0, 0]);
        }
        setCameraFromTP(0.35, 0.10);

        var mouseX = 0, mouseY = 0;
        function update() {
            var cbr = canvas.getBoundingClientRect();
            var cx = clamp((mouseX - cbr.left) / cbr.width, 0, 1);
            var cy = clamp((mouseY - cbr.top) / cbr.height, 0, 1);
            var rx = cx * 2 - 1;
            var ry = -(cy * 2 - 1);

            scene.castRay(rx, ry);
            scene.render();
        }

        window.addEventListener('mousemove', function(event) {
            mouseX = event.clientX;
            mouseY = event.clientY;
            update();
        });

        update();
    });

})(window);
