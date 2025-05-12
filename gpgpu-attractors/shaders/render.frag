precision highp float;

uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform vec2 uResolution;
uniform float uTrailLength;
uniform vec3 uColor;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 pos = texture2D(uPosition, uv).xyz;
    vec3 vel = texture2D(uVelocity, uv).xyz;
    
    // Calculate speed for color variation
    float speed = length(vel);
    float normalizedSpeed = min(speed / 10.0, 1.0);
    
    // Calculate trail effect
    float trail = 1.0 - (length(pos) / uTrailLength);
    trail = clamp(trail, 0.0, 1.0);
    
    // Combine color with speed and trail effects
    vec3 finalColor = uColor * (0.5 + 0.5 * normalizedSpeed) * trail;
    
    // Add some glow effect
    float glow = smoothstep(0.0, 0.1, trail);
    finalColor += vec3(0.2, 0.3, 0.5) * glow;
    
    gl_FragColor = vec4(finalColor, trail);
} 