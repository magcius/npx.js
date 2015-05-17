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
        'uniform mat4 u_projection;',
        'attribute vec3 a_position;',
        'varying vec3 v_position;',
        '',
        'void main() {',
        '    v_position = a_position;',
        '',
        '    gl_Position = u_projection * u_modelView * vec4(a_position, 1.0);',
        '}',
    ]);

    var FRAG_SHADER_SOURCE = M([
        'precision mediump float;',
        '',
        'uniform vec3 u_modelColor;',
        'varying vec3 v_position;',
        '',
        'void main() {',
        '    vec3 color = u_modelColor;',
        '    vec3 lit = mix(color, vec3(0), abs(v_position.z) / 6.0);',
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
        prog.positionLocation = gl.getAttribLocation(prog, "a_position");
        prog.modelColorLocation = gl.getUniformLocation(prog, "u_modelColor");

        return prog;
    }

    var TAU = Math.PI * 2;

    var GREEN  = [0.6, 0.8, 0.2];
    var PURPLE = [0.4, 0.2, 0.8];
    var PINK   = [1.0, 0.2, 0.8];

    function createPlatform(gl) {
        var N = 16;
        var RADIUS = 10;
        var EXTRUDE_LENGTH = .5;
        var TAPER_LENGTH = 6;

        // Our construction for the platform has a set of N "surface"
        // vertices, which are then extruded below by EXTRUDE_LENGTH, connected
        // a final "central point" which is then down TAPER_LENGTH.

        // We also have two central points, one to form the top of the
        // platform, and one for the bottom of the platform. So, two sets
        // of N vertices, and two centers brings us to N+N+2.

        var VERT_N_ITEMS = 3;
        var VERT_N_BYTES = VERT_N_ITEMS * Float32Array.BYTES_PER_ELEMENT;

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
        model.primitives = [];

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
            surfaceVerts[i * VERT_N_ITEMS + 1] = y;
            surfaceVerts[i * VERT_N_ITEMS + 2] = 0;

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

        // Now extrude down and build the bottom surface cap.
        var vert = new Float32Array(verts.buffer, (SURFACE_N_VERTS) * VERT_N_BYTES, VERT_N_ITEMS * 1);
        vert[0] = 0;
        vert[1] = 0;
        vert[2] = -EXTRUDE_LENGTH - TAPER_LENGTH;

        indxs[SURFACE_N_INDXS] = N+1;

        surfaceVerts = new Float32Array(verts.buffer, (SURFACE_N_VERTS + 1) * VERT_N_BYTES, VERT_N_ITEMS * N);
        for (i = 0; i < N; i++) {
            var theta = (i / N) * TAU;
            var y = Math.sin(theta) * RADIUS;
            var x = Math.cos(theta) * RADIUS;
            surfaceVerts[i * VERT_N_ITEMS + 0] = x;
            surfaceVerts[i * VERT_N_ITEMS + 1] = y;
            surfaceVerts[i * VERT_N_ITEMS + 2] = -EXTRUDE_LENGTH;

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

            console.log(i, topVert, topVert2, bottomVert, bottomVert2);

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

        console.log(indxs);

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
        var modelView = mat4.create();

        var projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.2, 256);

        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
        gl.clearColor(0.2, 0.2, 0.4, 1);

        gl.enable(gl.DEPTH_TEST);

        function renderModel(model) {
            var prog = null;
            function setProgram(program) {
                prog = program;
                gl.useProgram(prog);
            }

            function setColor(color) {
                gl.uniform3fv(prog.modelColorLocation, color);
            }

            function renderPrimitive(prim, i) {
                setColor(prim.color);
                gl.drawElements(prim.drawType, prim.count, gl.UNSIGNED_BYTE, prim.start);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, model.buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.elementBuffer);

            setProgram(model.program);

            gl.uniformMatrix4fv(prog.projectionLocation, false, projection);
            gl.uniformMatrix4fv(prog.modelViewLocation, false, modelView);
            gl.vertexAttribPointer(prog.positionLocation, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(prog.positionLocation);
            model.primitives.forEach(renderPrimitive);
            gl.disableVertexAttribArray(prog.positionLocation);
        }

        var models = [];
        function attachModel(model) {
            models.push(model);
        }
        function setCamera(matrix) {
            mat4.copy(modelView, matrix);
        }
        function render() {
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            models.forEach(renderModel);
        }

        var scene = {};
        scene.attachModel = attachModel;
        scene.setCamera = setCamera;
        scene.render = render;
        return scene;
    }

    window.addEventListener('load', function() {
        var canvas = document.querySelector("canvas");
        var gl = canvas.getContext("experimental-webgl");
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;

        var scene = createScene(gl);

        var tiles = createPlatform(gl);
        scene.attachModel(tiles);

        var mouseX = 0, mouseY = 0;
        function update() {
            var camera = mat4.create();
            var theta = (mouseX / window.innerWidth) * TAU;
            var mx = Math.cos(theta) * 25;
            var my = Math.sin(theta) * 25;
            mat4.lookAt(camera, [mx, my, 6], [0, 0, 0], [0, 0, 1]);
            scene.setCamera(camera);
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
