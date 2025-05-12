precision highp float;

uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform float uDelta;
uniform vec2 uResolution;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 pos = texture2D(uPosition, uv).xyz;
    vec3 vel = texture2D(uVelocity, uv).xyz;
    
    // Update position based on velocity
    vec3 newPos = pos + vel * uDelta;
    
    // Output new position
    gl_FragColor = vec4(newPos, 1.0);
} 