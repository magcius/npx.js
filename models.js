// Contains all the models in the scene, and shader code.

(function(exports) {
    "use strict";

    var Models = {};

    var TAU = Math.PI * 2;

    var GREEN  = [0.6, 0.8, 0.2];
    var PURPLE = [0.4, 0.2, 0.8];
    var PINK   = [1.0, 0.2, 0.8];

    var VERT_N_ITEMS = 3;
    var VERT_N_BYTES = VERT_N_ITEMS * Float32Array.BYTES_PER_ELEMENT;

    // A dumb hack to have "multiline strings".
    function M(X) { return X.join('\n'); }

    var BaseModel = new Class({
        Name: 'BaseModel',

        initialize: function(gl) {
            this._gl = gl;

            this._renderProgram = null;
            this._contactPoint = null;
            this._primitives = [];
            this._surface = null;
            this.localMatrix = mat4.create();

            var args = [].slice.call(arguments, 1);
            this._buildModel.apply(this, args);
        },

        _buildModel: function() {
        },

        _setBuffers: function(verts, indxs) {
            var gl = this._gl;
            this._vertBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

            this._indxBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indxBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indxs, gl.STATIC_DRAW);
        },

        _renderPrologue: function(ctx) {
            var gl = this._gl;
            var prog = ctx.currentProgram;
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertBuffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indxBuffer);
            gl.uniformMatrix4fv(prog.projectionLocation, false, ctx.projection);
            gl.uniformMatrix4fv(prog.modelViewLocation, false, ctx.modelView);
            gl.uniformMatrix4fv(prog.localMatrixLocation, false, this.localMatrix);
            gl.vertexAttribPointer(prog.positionLocation, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.positionLocation);
        },
        _renderEpilogue: function(ctx) {
            var gl = this._gl;
            var prog = ctx.currentProgram;
            gl.disableVertexAttribArray(prog.positionLocation);
        },
        _renderPrimitive: function(ctx, prim) {
            var gl = this._gl;
            gl.drawElements(prim.drawType, prim.count, gl.UNSIGNED_BYTE, prim.start);
        },

        render: function(ctx) {
            ctx.setProgram(this._renderProgram);
            this._renderPrologue(ctx);
            this._primitives.forEach(function(prim) {
                this._renderPrimitive(ctx, prim);
            }.bind(this));
            this._renderEpilogue(ctx);
        },

        _renderPickSurface: function(ctx, surface) {
            this._renderPrimitive(ctx, surface.prim);
        },
        pick: function(ctx, pickId) {
            this._renderPrologue(ctx);
            this._renderPrimitive(ctx, this._surface.prim);
            this._renderEpilogue(ctx);
        },

        setContactPoint: function(contactPoint) {
            this._contactPoint = contactPoint;
        },
    });

    var DUMB_LIGHT_VERT_SHADER_SOURCE = M([
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

    var DUMB_LIGHT_FRAG_SHADER_SOURCE = M([
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

    function createDumbLightProgram(gl) {
        var vertShader = GLUtils.compileShader(gl, DUMB_LIGHT_VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = GLUtils.compileShader(gl, DUMB_LIGHT_FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

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

    var DumbLightModel = new Class({
        Name: 'DumbLightModel',
        Extends: BaseModel,

        _buildModel: function() {
            this.parent();
            var gl = this._gl;
            this._renderProgram = createDumbLightProgram(gl);
        },

        _renderPrologue: function(ctx) {
            this.parent(ctx);
            var gl = this._gl;
            var prog = ctx.currentProgram;
            gl.uniform1f(prog.modelHeightLocation, this._height);
        },
        _renderPrimitive: function(ctx, prim) {
            var gl = this._gl;
            var prog = ctx.currentProgram;

            var color = prim.color;
            if (this._contactPoint && this._surface.prim == prim)
                color = [0.75, 0.6, 0.4];

            gl.uniform3fv(prog.modelColorLocation, color);
            this.parent(ctx, prim);
        },
    });

    var Platform = new Class({
        Name: 'Platform',
        Extends: DumbLightModel,

        _buildModel: function() {
            this.parent();

            var gl = this._gl;

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

            this._height = TAPER_LENGTH + EXTRUDE_LENGTH;

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
            this._primitives.push(prim);

            this._surface = {};
            this._surface.prim = prim;
            this._surface.normal = vec3.clone([0, 1, 0]);
            this._surface.origin = vec3.clone([0, 0, 0]);

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
            this._primitives.push(prim);

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
                this._primitives.push(prim);
            }

            this._setBuffers(verts, indxs);
        },
    });
    Models.Platform = Platform;

    var Box = new Class({
        Name: 'Box',
        Extends: DumbLightModel,

        _buildModel: function(w, l, h) {
            this.parent();

            var gl = this._gl;

            var WIDTH = w;
            var LENGTH = l;
            var HEIGHT = h;
            var hw = WIDTH/2, hl = LENGTH/2;

            this._height = HEIGHT * 2;

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
            this._primitives.push(prim);

            this._surface = {};
            this._surface.prim = prim;
            this._surface.normal = vec3.clone([0, 1, 0]);
            this._surface.origin = vec3.clone([0, 0, 0]);

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
            this._primitives.push(prim);

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
            this._primitives.push(prim);

            indxs[12] = 0;
            indxs[13] = 2;
            indxs[14] = 4;
            indxs[15] = 6;

            prim = {};
            prim.color = PINK;
            prim.start = 12;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            indxs[16] = 1;
            indxs[17] = 3;
            indxs[18] = 5;
            indxs[19] = 7;

            prim = {};
            prim.color = PINK;
            prim.start = 16;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            indxs[20] = 2;
            indxs[21] = 3;
            indxs[22] = 6;
            indxs[23] = 7;

            prim = {};
            prim.color = PINK;
            prim.start = 20;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            this._setBuffers(verts, indxs);
        },
    });
    Models.Box = Box;

    var Plane = new Class({
        Name: 'Plane',
        Extends: BaseModel,

        _buildModel: function() {
            this.parent();

            var gl = this._gl;

            var verts = new Float32Array(VERT_N_ITEMS * 4);
            var indxs = new Uint8Array(4);

            verts[0]  = -1;
            verts[1]  = 0;
            verts[2]  = -1;
            verts[3]  = 1;
            verts[4]  = 0;
            verts[5]  = -1;
            verts[6]  = -1;
            verts[7]  = 0;
            verts[8]  = 1;
            verts[9]  = 1;
            verts[10] = 0;
            verts[11] = 1;

            indxs[0] = 0;
            indxs[1] = 1;
            indxs[2] = 2;
            indxs[3] = 3;

            var prim = {};
            prim.start = 0;
            prim.count = 4;
            prim.drawType = gl.TRIANGLE_STRIP;
            this._primitives.push(prim);

            this._setBuffers(verts, indxs);
        },
    });

    var CONTACT_VERT_SHADER_SOURCE = M([
        'uniform mat4 u_modelView;',
        'uniform mat4 u_localMatrix;',
        'uniform mat4 u_projection;',
        'attribute vec3 a_position;',
        'varying vec3 v_position;',
        '',
        'void main() {',
        '    v_position = a_position;',
        '    gl_Position = u_projection * u_modelView * u_localMatrix * vec4(a_position, 1.0);',
        '}',
    ]);

    var CONTACT_FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform vec4 u_pickId;',
        'varying vec3 v_position;',
        '',
        'void main() {',
        '    vec3 color = vec3(1.0, 1.0, 1.0);',
        '    float dist = distance(v_position.xz, vec2(0.0, 0.0));',
        '    float a = 0.5 - abs(dist - 0.5);',
        '    gl_FragColor = vec4(color, a);',
        '}',
    ]);

    function createContactProgram(gl) {
        var vertShader = GLUtils.compileShader(gl, CONTACT_VERT_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = GLUtils.compileShader(gl, CONTACT_FRAG_SHADER_SOURCE, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        prog.modelViewLocation = gl.getUniformLocation(prog, "u_modelView");
        prog.projectionLocation = gl.getUniformLocation(prog, "u_projection");
        prog.localMatrixLocation = gl.getUniformLocation(prog, "u_localMatrix");
        prog.positionLocation = gl.getAttribLocation(prog, "a_position");

        return prog;
    }

    var ContactPlane = new Class({
        Name: 'ContactPlane',
        Extends: Plane,

        _buildModel: function() {
            this.parent();
            var gl = this._gl;
            this._renderProgram = createContactProgram(gl);
        },
    });
    Models.ContactPlane = ContactPlane;

    exports.Models = Models;

})(window);
