precision highp float;

uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform float uDelta;
uniform vec2 uResolution;
uniform vec3 uAttractorPos;
uniform vec3 uAttractorParams; // x = sigma, y = rho, z = beta
uniform int uAttractorType;

// Helper function to rotate a vector by Euler angles
vec3 rotateVector(vec3 v, vec3 euler) {
    float cx = cos(euler.x);
    float sx = sin(euler.x);
    float cy = cos(euler.y);
    float sy = sin(euler.y);
    float cz = cos(euler.z);
    float sz = sin(euler.z);
    
    mat3 rotX = mat3(
        1.0, 0.0, 0.0,
        0.0, cx, -sx,
        0.0, sx, cx
    );
    
    mat3 rotY = mat3(
        cy, 0.0, sy,
        0.0, 1.0, 0.0,
        -sy, 0.0, cy
    );
    
    mat3 rotZ = mat3(
        cz, -sz, 0.0,
        sz, cz, 0.0,
        0.0, 0.0, 1.0
    );
    
    return rotZ * rotY * rotX * v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 pos = texture2D(uPosition, uv).xyz;
    vec3 vel = texture2D(uVelocity, uv).xyz;
    
    // Compute relative position to attractor
    vec3 relPos = pos - uAttractorPos;
    
    // Apply inverse rotation to get local coordinates
    vec3 localPos = rotateVector(relPos, vec3(0.0)); // Add rotation params here
    
    // Calculate new velocity based on attractor type
    vec3 newVel;
    
    if (uAttractorType == 0) { // Lorenz
        float sigma = uAttractorParams.x;
        float rho = uAttractorParams.y;
        float beta = uAttractorParams.z;
        
        newVel = vec3(
            sigma * (localPos.y - localPos.x),
            localPos.x * (rho - localPos.z) - localPos.y,
            localPos.x * localPos.y - beta * localPos.z
        );
    } else if (uAttractorType == 1) { // Rossler
        float a = uAttractorParams.x;
        float b = uAttractorParams.z;
        float c = uAttractorParams.y;
        
        newVel = vec3(
            -localPos.y - localPos.z,
            localPos.x + a * localPos.y,
            b + localPos.z * (localPos.x - c)
        );
    } else if (uAttractorType == 2) { // Thomas
        float b = uAttractorParams.x;
        newVel = vec3(
            sin(localPos.y) - b * localPos.x,
            sin(localPos.z) - b * localPos.y,
            sin(localPos.x) - b * localPos.z
        );
    } else if (uAttractorType == 3) { // Halvorsen
        float a = uAttractorParams.x;
        newVel = vec3(
            -a * localPos.x - 4.0 * localPos.y - 4.0 * localPos.z - localPos.y * localPos.y,
            -a * localPos.y - 4.0 * localPos.z - 4.0 * localPos.x - localPos.z * localPos.z,
            -a * localPos.z - 4.0 * localPos.x - 4.0 * localPos.y - localPos.x * localPos.x
        );
    } else if (uAttractorType == 4) { // Dadras
        float a = uAttractorParams.x;
        float b = uAttractorParams.y;
        float c = uAttractorParams.z;
        float d = 3.0;
        float e = 0.5;
        newVel = vec3(
            localPos.y - a * localPos.x + b * localPos.y * localPos.z,
            c * localPos.y - localPos.x * localPos.z + localPos.z,
            d * localPos.x * localPos.y - e * localPos.z
        );
    } else if (uAttractorType == 5) { // Aizawa
        float a = uAttractorParams.x;
        float b = uAttractorParams.y;
        float c = uAttractorParams.z;
        float d = 0.7;
        float e = 0.6;
        float f = 3.5;
        newVel = vec3(
            (localPos.z - b) * localPos.x - d * localPos.y,
            d * localPos.x + (localPos.z - b) * localPos.y,
            c + a * localPos.z - (pow(localPos.z, 3.0)) / 3.0 - (localPos.x * localPos.x + localPos.y * localPos.y) * (1.0 + e * localPos.z) + f * localPos.z * localPos.x * localPos.x * localPos.x
        );
    }
    // Add more attractor types here...
    
    // Rotate velocity back to world space
    newVel = rotateVector(newVel, vec3(0.0)); // Add rotation params here
    
    // Output new velocity
    gl_FragColor = vec4(newVel, 1.0);
} 