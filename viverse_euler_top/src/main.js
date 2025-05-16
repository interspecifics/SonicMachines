import * as pc from 'playcanvas';

// Get the canvas element
const canvas = document.getElementById('app');

// Create the application and start the update loop
const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    keyboard: new pc.Keyboard(window)
});

app.start();

// Set the canvas to fill the window and automatically resize
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas(), false);

// Set the scene's ambient light
app.scene.ambientLight = new pc.Color(0.2, 0.2, 0.2);

// Create a camera
const cameraEntity = new pc.Entity('camera');
cameraEntity.addComponent('camera', {
    clearColor: new pc.Color(0.1, 0.1, 0.1)
});
cameraEntity.setPosition(0, 0, 20);
app.root.addChild(cameraEntity);

// === Particle System Setup ===

const maxParticles = 1000;
let particleCount = 500;
const boxSize = 16; // Size of the bounding cube

// Particle data: { pos: pc.Vec3, velocity: pc.Vec3, connections: number }
const particles = [];

for (let i = 0; i < maxParticles; i++) {
    const pos = new pc.Vec3(
        Math.random() * boxSize - boxSize / 2,
        Math.random() * boxSize - boxSize / 2,
        Math.random() * boxSize - boxSize / 2
    );
    particles.push({
        pos: pos,
        velocity: new pc.Vec3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1),
        connections: 0
    });
}

// === Geometry & Buffers ===

// For points (particle positions)
const pointPositions = new Float32Array(maxParticles * 3);

// For lines (connections)
const maxConnections = maxParticles * maxParticles;
const linePositions = new Float32Array(maxConnections * 3 * 2); // 2 points per line
const lineColors = new Float32Array(maxConnections * 4 * 2); // RGBA per vertex

// PlayCanvas mesh and buffer setup will go here
let pointMesh, pointMeshInstance, lineMesh, lineMeshInstance;

// Helper: create a simple unlit material for points
function createPointMaterial() {
    const mat = new pc.StandardMaterial();
    mat.emissive = new pc.Color(1, 1, 1);
    mat.blendType = pc.BLEND_ADDITIVE;
    mat.update();
    return mat;
}

// Helper: create a simple unlit material for lines
function createLineMaterial() {
    const mat = new pc.StandardMaterial();
    mat.emissive = new pc.Color(0.7, 0.7, 1);
    mat.blendType = pc.BLEND_ADDITIVE;
    mat.opacity = 0.7;
    mat.update();
    return mat;
}

// === Initialization of Meshes ===
function initMeshes() {
    // Points
    for (let i = 0; i < maxParticles; i++) {
        pointPositions[i * 3] = particles[i].pos.x;
        pointPositions[i * 3 + 1] = particles[i].pos.y;
        pointPositions[i * 3 + 2] = particles[i].pos.z;
    }
    const pointVertexFormat = new pc.VertexFormat(app.graphicsDevice, [
        { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 }
    ]);
    const pointVertexBuffer = new pc.VertexBuffer(app.graphicsDevice, pointVertexFormat, maxParticles, pc.BUFFER_DYNAMIC);
    pointVertexBuffer.lock();
    new Float32Array(pointVertexBuffer.lockedBuffer).set(pointPositions);
    pointVertexBuffer.unlock();
    pointMesh = new pc.Mesh();
    pointMesh.vertexBuffer = pointVertexBuffer;
    pointMesh.primitive[0].type = pc.PRIMITIVE_POINTS;
    pointMesh.primitive[0].base = 0;
    pointMesh.primitive[0].count = particleCount;
    pointMeshInstance = new pc.MeshInstance(pointMesh, createPointMaterial());
    app.scene.addModel(new pc.Model());
    app.scene.models[0].meshInstances.push(pointMeshInstance);

    // Lines
    const lineVertexFormat = new pc.VertexFormat(app.graphicsDevice, [
        { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 }
    ]);
    const lineVertexBuffer = new pc.VertexBuffer(app.graphicsDevice, lineVertexFormat, maxConnections * 2, pc.BUFFER_DYNAMIC);
    lineMesh = new pc.Mesh();
    lineMesh.vertexBuffer = lineVertexBuffer;
    lineMesh.primitive[0].type = pc.PRIMITIVE_LINES;
    lineMesh.primitive[0].base = 0;
    lineMesh.primitive[0].count = 0; // Will be set dynamically
    lineMeshInstance = new pc.MeshInstance(lineMesh, createLineMaterial());
    app.scene.models[0].meshInstances.push(lineMeshInstance);
}

initMeshes();

// === Update Loop ===
app.on('update', function(dt) {
    // Move particles and apply boundary reflection
    for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        p.pos.add(p.velocity.clone().scale(dt * 2));
        // Reflect at boundaries
        ['x', 'y', 'z'].forEach(axis => {
            if (p.pos[axis] < -boxSize / 2 || p.pos[axis] > boxSize / 2) {
                p.velocity[axis] *= -1;
                p.pos[axis] = Math.max(Math.min(p.pos[axis], boxSize / 2), -boxSize / 2);
            }
        });
        // Update point buffer
        pointPositions[i * 3] = p.pos.x;
        pointPositions[i * 3 + 1] = p.pos.y;
        pointPositions[i * 3 + 2] = p.pos.z;
        p.connections = 0;
    }

    // Connection logic
    let lineCount = 0;
    const minDistance = 2.5; // Example value, can be parameterized
    const maxConnections = 20;
    for (let i = 0; i < particleCount; i++) {
        const a = particles[i];
        if (a.connections >= maxConnections) continue;
        for (let j = i + 1; j < particleCount; j++) {
            const b = particles[j];
            if (b.connections >= maxConnections) continue;
            const dx = a.pos.x - b.pos.x;
            const dy = a.pos.y - b.pos.y;
            const dz = a.pos.z - b.pos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < minDistance) {
                a.connections++;
                b.connections++;
                // Add line segment
                linePositions[lineCount * 6 + 0] = a.pos.x;
                linePositions[lineCount * 6 + 1] = a.pos.y;
                linePositions[lineCount * 6 + 2] = a.pos.z;
                linePositions[lineCount * 6 + 3] = b.pos.x;
                linePositions[lineCount * 6 + 4] = b.pos.y;
                linePositions[lineCount * 6 + 5] = b.pos.z;
                lineCount++;
                if (a.connections >= maxConnections) break;
            }
        }
    }

    // Update point mesh
    pointMesh.vertexBuffer.lock();
    new Float32Array(pointMesh.vertexBuffer.lockedBuffer).set(pointPositions);
    pointMesh.vertexBuffer.unlock();
    pointMesh.primitive[0].count = particleCount;

    // Update line mesh
    if (lineCount > 0) {
        lineMesh.vertexBuffer.lock();
        new Float32Array(lineMesh.vertexBuffer.lockedBuffer).set(linePositions.subarray(0, lineCount * 6));
        lineMesh.vertexBuffer.unlock();
    }
    lineMesh.primitive[0].count = lineCount * 2;
});

// TODO: Add orbit camera controls, stats, and the rest of the demo logic 