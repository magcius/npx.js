(function(exports) {
    "use strict";

    var GLUtils = {};

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

    GLUtils.compileShader = compileShader;

    exports.GLUtils = GLUtils;

})(window);
