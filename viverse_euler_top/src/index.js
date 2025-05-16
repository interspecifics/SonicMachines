import * as pc from 'playcanvas';
import GUI from 'lil-gui';
import * as Tone from 'tone';

// Create canvas
const canvas = document.getElementById('app');

// Constants and configuration
const MAX_TRIANGLES = 1000;
const TRIANGLE_DETECTION_INTERVAL = 5;
const MAX_VERTICES = 40000;
const MAX_LINE_VERTICES = Math.floor(MAX_VERTICES / 2);
const MAX_LINE_CONNECTIONS = Math.floor(MAX_LINE_VERTICES / 2);

// Scene scale
const r = 800;
const rHalf = r / 2;

// System state variables
let frameCounter = 0;
let lastTime = performance.now();
let dt = 0;

// Particle system parameters
const maxParticleCount = 1000;
let particleCount = 500;
let minDistance = 100;
let maxConnections = 10;
let showDots = true;
let showLines = true;
let limitConnections = true;

// Particle system data
const particles = [];
const positions = new Float32Array(maxParticleCount * 3);
const linePositions = new Float32Array(maxParticleCount * maxConnections * 6);
const particleConnections = new Map();
let currentTriangles = new Set();
let previousTriangles = new Set();

// Mesh instances
let pointMesh, pointMeshInstance;
let lineMesh, lineMeshInstance;

// Create the app
const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    keyboard: new pc.Keyboard(window),
    graphicsDeviceOptions: {
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance'
    }
});

// Fill the available space at the start
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

// Create camera
const camera = new pc.Entity();
camera.addComponent('camera', {
    clearColor: new pc.Color(0.1, 0.1, 0.1),
    clearColorBuffer: true,
    clearDepthBuffer: true,
    fov: 45,
    nearClip: 1,
    farClip: 8000
});
camera.setPosition(0, 0, 1750);
app.root.addChild(camera);

// Create camera script
const CameraController = pc.createScript('cameraController');

CameraController.attributes.add('distance', { type: 'number', default: 1750 });
CameraController.attributes.add('rotateSpeed', { type: 'number', default: 0.3 });

CameraController.prototype.initialize = function() {
    this.pitch = 0;
    this.yaw = 0;
    
    this.targetPitch = 0;
    this.targetYaw = 0;
    
    // Mouse state
    this.isRotating = false;
    
    // Bind event handlers
    this.onMouseDown = this._onMouseDown.bind(this);
    this.onMouseUp = this._onMouseUp.bind(this);
    this.onMouseMove = this._onMouseMove.bind(this);
    
    // Add event listeners
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    
    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());
};

CameraController.prototype._onMouseDown = function(event) {
    this.isRotating = true;
    event.preventDefault();
};

CameraController.prototype._onMouseUp = function(event) {
    this.isRotating = false;
};

CameraController.prototype._onMouseMove = function(event) {
    if (this.isRotating) {
        this.targetYaw -= event.movementX * this.rotateSpeed * 0.2;
        this.targetPitch -= event.movementY * this.rotateSpeed * 0.2;
        
        // Clamp pitch to avoid flipping
        this.targetPitch = Math.max(-89, Math.min(89, this.targetPitch));
    }
};

CameraController.prototype.update = function(dt) {
    // Smooth camera movement
    this.pitch = pc.math.lerp(this.pitch, this.targetPitch, 0.1);
    this.yaw = pc.math.lerp(this.yaw, this.targetYaw, 0.1);
    
    // Convert to radians
    const rad = pc.math.DEG_TO_RAD;
    const pitchRad = this.pitch * rad;
    const yawRad = this.yaw * rad;
    
    // Calculate position
    const sinPitch = Math.sin(pitchRad);
    const cosPitch = Math.cos(pitchRad);
    const sinYaw = Math.sin(yawRad);
    const cosYaw = Math.cos(yawRad);
    
    const x = this.distance * sinPitch * sinYaw;
    const y = this.distance * cosPitch;
    const z = this.distance * sinPitch * cosYaw;
    
    // Update camera
    this.entity.setPosition(x, y, z);
    this.entity.lookAt(0, 0, 0);
};

CameraController.prototype.destroy = function() {
    // Remove event listeners
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('contextmenu', (e) => e.preventDefault());
};

// Add camera controller to camera
camera.addComponent('script');
camera.script.create('cameraController');

// Create box helper function
function createBoxHelper(size) {
    const format = new pc.VertexFormat(app.graphicsDevice, [
        { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 }
    ]);

    const s = size / 2;
    // Define box vertices
    const vertices = [
        [-s,-s,-s], [s,-s,-s], [s,s,-s], [-s,s,-s],
        [-s,-s,s], [s,-s,s], [s,s,s], [-s,s,s]
    ];

    // Create lines array for all edges (24 vertices for 12 lines)
    const lineVertices = new Float32Array(72); // 24 vertices * 3 components
    let offset = 0;

    // Bottom square
    for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 4];
        lineVertices.set(v1, offset); offset += 3;
        lineVertices.set(v2, offset); offset += 3;
    }

    // Top square
    for (let i = 0; i < 4; i++) {
        const v1 = vertices[i + 4];
        const v2 = vertices[((i + 1) % 4) + 4];
        lineVertices.set(v1, offset); offset += 3;
        lineVertices.set(v2, offset); offset += 3;
    }

    // Vertical edges
    for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[i + 4];
        lineVertices.set(v1, offset); offset += 3;
        lineVertices.set(v2, offset); offset += 3;
    }

    // Create vertex buffer
    const vertexBuffer = new pc.VertexBuffer(app.graphicsDevice, format, 24, pc.BUFFER_STATIC);
    const positions = new Float32Array(vertexBuffer.lock());
    positions.set(lineVertices);
    vertexBuffer.unlock();

    // Create mesh
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.vertexBuffer = vertexBuffer;
    mesh.primitive[0].type = pc.PRIMITIVE_LINES;
    mesh.primitive[0].base = 0;
    mesh.primitive[0].count = 24;
    mesh.primitive[0].indexed = false;

    // Create material
    const material = new pc.BasicMaterial();
    material.color = new pc.Color(0.28, 0.28, 0.28); // 0x474747
    material.blendType = pc.BLEND_ADDITIVE;
    material.depthWrite = false;
    material.update();

    // Create mesh instance
    const meshInstance = new pc.MeshInstance(mesh, material);
    
    // Create entity and add to scene
    const entity = new pc.Entity('boxHelper');
    entity.addComponent('render', {
        meshInstances: [meshInstance],
        castShadows: false,
        receiveShadows: false
    });
    
    return entity;
}

// Create scene group
const group = new pc.Entity();
app.root.addChild(group);

// Add box helper to group
const boxHelper = createBoxHelper(r);
group.addChild(boxHelper);

// Initialize particles
for (let i = 0; i < maxParticleCount; i++) {
    const x = Math.random() * r - r / 2;
    const y = Math.random() * r - r / 2;
    const z = Math.random() * r - r / 2;
    
    particles[i] = {  // Use direct array indexing instead of push
        pos: new pc.Vec3(x, y, z),
        vel: new pc.Vec3(
            -1 + Math.random() * 2,
            -1 + Math.random() * 2,
            -1 + Math.random() * 2
        ),
        connections: 0
    };

    // Set initial positions
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
}

// Triangle detection helper functions
function getTriangleId(p1Index, p2Index, p3Index) {
    const indices = [p1Index, p2Index, p3Index].sort((a, b) => a - b);
    return `${indices[0]}-${indices[1]}-${indices[2]}`;
}

function areParticlesConnected(p1Index, p2Index) {
    const dx = positions[p1Index * 3] - positions[p2Index * 3];
    const dy = positions[p1Index * 3 + 1] - positions[p2Index * 3 + 1];
    const dz = positions[p1Index * 3 + 2] - positions[p2Index * 3 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < minDistance;
}

function calculateTriangleCenter(p1Index, p2Index, p3Index) {
    const centerX = (positions[p1Index * 3] + positions[p2Index * 3] + positions[p3Index * 3]) / 3;
    const centerY = (positions[p1Index * 3 + 1] + positions[p2Index * 3 + 1] + positions[p3Index * 3 + 1]) / 3;
    const centerZ = (positions[p1Index * 3 + 2] + positions[p2Index * 3 + 2] + positions[p3Index * 3 + 2]) / 3;
    return new pc.Vec3(centerX, centerY, centerZ);
}

function calculateTriangleArea(p1Index, p2Index, p3Index) {
    // Create vectors for the triangle edges
    const v1x = positions[p2Index * 3] - positions[p1Index * 3];
    const v1y = positions[p2Index * 3 + 1] - positions[p1Index * 3 + 1];
    const v1z = positions[p2Index * 3 + 2] - positions[p1Index * 3 + 2];
    
    const v2x = positions[p3Index * 3] - positions[p1Index * 3];
    const v2y = positions[p3Index * 3 + 1] - positions[p1Index * 3 + 1];
    const v2z = positions[p3Index * 3 + 2] - positions[p1Index * 3 + 2];
    
    // Calculate cross product manually
    const crossX = v1y * v2z - v1z * v2y;
    const crossY = v1z * v2x - v1x * v2z;
    const crossZ = v1x * v2y - v1y * v2x;
    
    // Calculate magnitude of cross product
    return Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ) / 2;
}

function findTriangles() {
    const triangles = new Set();
    // Only process if we have enough particles
    if (particleCount < 3) return triangles;
    // Clear and rebuild connection map
    particleConnections.clear();
    // First pass: build connection map from line detection we already do
    for (let i = 0; i < particleCount - 1; i++) {
        if (!particles[i]) continue;
        const connections = new Set();
        for (let j = i + 1; j < particleCount; j++) {
            if (!particles[j]) continue;
            const dx = positions[i * 3] - positions[j * 3];
            const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
            const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < minDistance) {
                connections.add(j);
            }
        }
        if (connections.size > 0) {
            particleConnections.set(i, connections);
        }
        // Debug: log number of connections for this particle
        console.log(`Particle ${i} has ${connections.size} connections`);
    }
    // Second pass: find triangles only between connected particles
    let trianglesConsidered = 0;
    let trianglesSkippedArea = 0;
    let trianglesSkippedConnection = 0;
    for (const [i, connections] of particleConnections) {
        const connectedParticles = Array.from(connections);
        const len = connectedParticles.length;
        if (len < 2) continue;
        for (let j = 0; j < len - 1; j++) {
            const p2Index = connectedParticles[j];
            const p2Connections = particleConnections.get(p2Index);
            if (!p2Connections) continue;
            for (let k = j + 1; k < len; k++) {
                const p3Index = connectedParticles[k];
                // Check if p2 and p3 are connected
                if (!p2Connections.has(p3Index)) {
                    trianglesSkippedConnection++;
                    continue;
                }
                try {
                    const id = getTriangleId(i, p2Index, p3Index);
                    if (triangles.has(id)) continue;
                    const area = calculateTriangleArea(i, p2Index, p3Index);
                    trianglesConsidered++;
                    if (isNaN(area) || area < 0.01) {
                        trianglesSkippedArea++;
                        continue;
                    }
                    const center = calculateTriangleCenter(i, p2Index, p3Index);
                    triangles.add({
                        id,
                        particles: [i, p2Index, p3Index],
                        center,
                        area,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    console.warn('Error processing triangle:', error);
                    continue;
                }
            }
        }
    }
    // Debug: log triangle stats
    console.log(`findTriangles: considered=${trianglesConsidered}, skippedArea=${trianglesSkippedArea}, skippedConnection=${trianglesSkippedConnection}, found=${triangles.size}`);
    return triangles;
}

// Create materials
const pointMaterial = new pc.StandardMaterial();
pointMaterial.emissive = new pc.Color(0.2, 0.8, 1); // Bright cyan
pointMaterial.emissiveIntensity = 2;
pointMaterial.opacity = 0.8;
pointMaterial.blendType = pc.BLEND_ADDITIVE;
pointMaterial.depthWrite = false;
pointMaterial.update();

const lineMaterial = new pc.BasicMaterial();
lineMaterial.color = new pc.Color(0.7, 0.7, 1, 0.7);
lineMaterial.blend = true;
lineMaterial.blendSrc = pc.BLENDMODE_SRC_ALPHA;
lineMaterial.blendDst = pc.BLENDMODE_ONE_MINUS_SRC_ALPHA;
lineMaterial.depthWrite = false;
lineMaterial.depthTest = true;
lineMaterial.useLighting = false;
lineMaterial.update();

// Create meshes
function createMeshes() {
    const format = new pc.VertexFormat(app.graphicsDevice, [
        { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 }
    ]);

    // Points
    const pointBuffer = new pc.VertexBuffer(app.graphicsDevice, format, maxParticleCount, pc.BUFFER_DYNAMIC);
    pointMesh = new pc.Mesh(app.graphicsDevice);
    pointMesh.vertexBuffer = pointBuffer;
    pointMesh.primitive[0] = { type: pc.PRIMITIVE_POINTS, base: 0, count: particleCount, indexed: false };
    pointMeshInstance = new pc.MeshInstance(pointMesh, pointMaterial);

    const pointEntity = new pc.Entity();
    pointEntity.addComponent('render', {
        meshInstances: [pointMeshInstance],
        castShadows: false,
        receiveShadows: false
    });
    group.addChild(pointEntity);

    // Lines - adjust buffer size to prevent overflow
    const lineBuffer = new pc.VertexBuffer(app.graphicsDevice, format, MAX_LINE_VERTICES, pc.BUFFER_DYNAMIC);
    lineMesh = new pc.Mesh(app.graphicsDevice);
    lineMesh.vertexBuffer = lineBuffer;
    lineMesh.primitive[0] = { type: pc.PRIMITIVE_LINES, base: 0, count: 0, indexed: false };
    lineMeshInstance = new pc.MeshInstance(lineMesh, lineMaterial);

    const lineEntity = new pc.Entity();
    lineEntity.addComponent('render', {
        meshInstances: [lineMeshInstance],
        castShadows: false,
        receiveShadows: false
    });
    group.addChild(lineEntity);
}

// Add debug panel
const debugPanel = document.createElement('div');
debugPanel.style.position = 'fixed';
debugPanel.style.left = '10px';
debugPanel.style.bottom = '10px';
debugPanel.style.background = 'rgba(0,0,0,0.7)';
debugPanel.style.color = '#ffffff';
debugPanel.style.font = '12px monospace';
debugPanel.style.padding = '10px';
debugPanel.style.borderRadius = '5px';
debugPanel.style.zIndex = 1000;
debugPanel.style.textShadow = '1px 1px 1px rgba(0,0,0,0.5)';
document.body.appendChild(debugPanel);

// === Tone.js Sonification Integration ===
// 1. Add Start Audio button
const startAudioBtn = document.createElement('button');
startAudioBtn.textContent = 'Start Audio';
startAudioBtn.style.position = 'fixed';
startAudioBtn.style.bottom = '20px';
startAudioBtn.style.right = '20px';
startAudioBtn.style.zIndex = 10001;
startAudioBtn.style.padding = '12px 24px';
startAudioBtn.style.fontSize = '18px';
startAudioBtn.style.background = '#222';
startAudioBtn.style.color = '#fff';
startAudioBtn.style.border = 'none';
startAudioBtn.style.borderRadius = '8px';
startAudioBtn.style.cursor = 'pointer';
document.body.appendChild(startAudioBtn);

// 2. Global Tone.js synth, effects, gain, limiter, analyser
let synth;
let analyser;
let reverb;
let delay;
let chorus;
let phaser;
let autoFilter;
let audioStarted = false;

// 3. Add waveform visualization canvas
const waveformCanvas = document.createElement('canvas');
waveformCanvas.width = 330;
waveformCanvas.height = 120;
waveformCanvas.style.width = '330px';
waveformCanvas.style.height = '120px';
waveformCanvas.style.position = 'fixed';
waveformCanvas.style.left = '20px';
waveformCanvas.style.bottom = '100px';
waveformCanvas.style.transform = '';
waveformCanvas.style.background = 'transparent';
waveformCanvas.style.borderRadius = '8px';
waveformCanvas.style.zIndex = 10001;
waveformCanvas.style.right = '';
document.body.appendChild(waveformCanvas);
const ctx = waveformCanvas.getContext('2d');

function drawWaveform() {
    if (!analyser) {
        ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        requestAnimationFrame(drawWaveform);
        return;
    }
    const waveform = analyser.getValue();
    ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);

    // Draw center line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, waveformCanvas.height / 2);
    ctx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
    ctx.stroke();

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    for (let i = 0; i < waveform.length; i++) {
        const x = (i / waveform.length) * waveformCanvas.width;
        const y = ((waveform[i] + 1) / 2) * waveformCanvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Add subtle gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, waveformCanvas.height);
    gradient.addColorStop(0, 'rgba(0,255,255,0.1)');
    gradient.addColorStop(1, 'rgba(0,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.lineTo(waveformCanvas.width, waveformCanvas.height);
    ctx.lineTo(0, waveformCanvas.height);
    ctx.closePath();
    ctx.fill();

    requestAnimationFrame(drawWaveform);
}

async function setupAudio() {
    if (audioStarted) return;
    await Tone.start();
    console.log('Tone.context.state:', Tone.context.state);
    // Create synth
    synth = new Tone.PolySynth(Tone.Synth);
    // Create effects
    reverb = new Tone.Reverb({ decay: 6, wet: 0.5 }).toDestination();
    delay = new Tone.FeedbackDelay("8n", 0.4);
    chorus = new Tone.Chorus(1.5, 2.5, 0.4).start();
    phaser = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 400 });
    autoFilter = new Tone.AutoFilter("4n").start();
    // Connect chain
    synth.chain(autoFilter, phaser, chorus, delay, reverb);
    analyser = new Tone.Analyser('waveform', 256);
    reverb.connect(analyser);
    analyser.toDestination();
    Tone.Destination.volume.value = -12;
    drawWaveform();
    audioStarted = true;
    startAudioBtn.style.display = 'none';
}

startAudioBtn.addEventListener('click', setupAudio);

// GUI setup
const gui = new GUI();
const params = {
    particleCount: 500,
    showDots: true,
    showLines: true,
    minDistance: 100,
    limitConnections: true,
    maxConnections: 10,
    cameraDistance: 1750,  // Camera distance control
    rotationSpeed: 0.3,    // Add rotation speed control
    rootMidi: 60,          // MIDI note number for root (C4)
    maxTriangles: 1000,    // Max triangles for network analysis
    speed: 1.0             // General speed multiplier
};

// Add all GUI controls
gui.add(params, 'showDots').onChange(value => {
    showDots = value;
    if (pointMeshInstance) {
        pointMeshInstance.visible = value;
    }
    updateDebugInfo();
});

gui.add(params, 'showLines').onChange(value => {
    showLines = value;
    if (lineMeshInstance) {
        lineMeshInstance.visible = value;
    }
    updateDebugInfo();
});

gui.add(params, 'minDistance', 10, 300).onChange(value => {
    minDistance = value;
    updateDebugInfo();
});

gui.add(params, 'limitConnections').onChange(value => {
    limitConnections = value;
    updateDebugInfo();
});

gui.add(params, 'maxConnections', 0, 30, 1).onChange(value => {
    maxConnections = value;
    updateDebugInfo();
});

gui.add(params, 'particleCount', 0, maxParticleCount, 1).onChange(value => {
    particleCount = value;
    if (pointMesh) {
        pointMesh.primitive[0].count = particleCount;
    }
    updateDebugInfo();
});

// Add camera distance control
gui.add(params, 'cameraDistance', 1000, 6000).onChange(value => {
    if (camera && camera.script && camera.script.cameraController) {
        camera.script.cameraController.distance = value;
    }
    updateDebugInfo();
});

// Add rotation speed control
gui.add(params, 'rotationSpeed', 0.1, 1.0).onChange(value => {
    if (camera && camera.script && camera.script.cameraController) {
        camera.script.cameraController.rotateSpeed = value;
    }
    updateDebugInfo();
});

// Add root MIDI control
gui.add(params, 'rootMidi', 24, 83, 1).name('Root MIDI (C1-B5)');

// Handle window resize
window.addEventListener('resize', () => {
    app.resizeCanvas();
});

// Cleanup function for proper resource management
function cleanup() {
    if (pointMesh && pointMesh.vertexBuffer) {
        pointMesh.vertexBuffer.destroy();
    }
    if (lineMesh && lineMesh.vertexBuffer) {
        lineMesh.vertexBuffer.destroy();
    }
}

// Add cleanup handler
window.addEventListener('unload', cleanup);

// Initialize and start
app.once('start', () => {
    // Initialize triangle tracking
    currentTriangles = new Set();
    previousTriangles = new Set();
    
    // Create meshes first
    createMeshes();
    
    // Add title element with more prominent styling
    const titleElement = document.createElement('div');
    titleElement.style.position = 'fixed';
    titleElement.style.left = '20px';
    titleElement.style.top = '20px';
    titleElement.style.color = '#ffffff';
    titleElement.style.fontFamily = 'Courier, monospace';
    titleElement.style.fontSize = '14px';
    titleElement.style.textAlign = 'left';
    titleElement.style.zIndex = 9999;
    titleElement.style.textShadow = 'none';
    titleElement.style.letterSpacing = '0px';
    titleElement.style.lineHeight = '1.2';
    titleElement.style.fontWeight = 'normal';
    titleElement.style.pointerEvents = 'none';
    titleElement.style.userSelect = 'none';
    titleElement.style.whiteSpace = 'pre';
    titleElement.innerHTML = `INTERSPECIFICS
SONIC MACHINES /
EULER TONNETZ \\_`;
    document.body.appendChild(titleElement);
    
    // Force initial particle positions update
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = particles[i].pos.x;
        positions[i * 3 + 1] = particles[i].pos.y;
        positions[i * 3 + 2] = particles[i].pos.z;
    }

    // Force initial buffer updates
    if (pointMesh) {
        const pointData = new Float32Array(pointMesh.vertexBuffer.lock());
        pointData.set(positions.subarray(0, particleCount * 3));
        pointMesh.vertexBuffer.unlock();
        pointMesh.primitive[0].count = particleCount;
    }

    // Force initial line connections
    let lineCount = 0;
    for (let i = 0; i < particleCount; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particleCount; j++) {
            const p2 = particles[j];
            const dx = p1.pos.x - p2.pos.x;
            const dy = p1.pos.y - p2.pos.y;
            const dz = p1.pos.z - p2.pos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < minDistance) {
                linePositions[lineCount * 6] = p1.pos.x;
                linePositions[lineCount * 6 + 1] = p1.pos.y;
                linePositions[lineCount * 6 + 2] = p1.pos.z;
                linePositions[lineCount * 6 + 3] = p2.pos.x;
                linePositions[lineCount * 6 + 4] = p2.pos.y;
                linePositions[lineCount * 6 + 5] = p2.pos.z;
                lineCount++;
            }
        }
    }

    if (lineMesh && lineCount > 0) {
        const lineData = new Float32Array(lineMesh.vertexBuffer.lock());
        lineData.set(linePositions.subarray(0, lineCount * 6));
        lineMesh.vertexBuffer.unlock();
        lineMesh.primitive[0].count = lineCount * 2;
    }

    // Start update loop
    app.on('update', update);
    
    // Force initial debug info update
    updateDebugInfo();
});

// Add a post-initialization check
app.on('update', () => {
    // Check if meshes are properly initialized
    if (pointMeshInstance && !pointMeshInstance.visible && showDots) {
        pointMeshInstance.visible = true;
    }
    if (lineMeshInstance && !lineMeshInstance.visible && showLines) {
        lineMeshInstance.visible = true;
    }
}, this);

app.start();

// Add window focus handler to ensure proper state
window.addEventListener('focus', () => {
    if (camera && camera.script && camera.script.orbitCamera) {
        // Force mesh visibility
        if (pointMeshInstance && showDots) {
            pointMeshInstance.visible = true;
        }
        if (lineMeshInstance && showLines) {
            lineMeshInstance.visible = true;
        }
        
        camera.script.orbitCamera._onEnable();
        // Trigger a small camera movement to refresh the view
        camera.script.orbitCamera.targetYaw += 0.001;
    }
});

// Track previous triangle areas for novelty prioritization
const previousTriangleAreas = {};

// Modify the update function to include frame counting and throttling
function update() {
    const currentTime = performance.now();
    dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    frameCounter++;

    // Calculate network state
    const networkState = {
        triangleDensity: calculateTriangleDensity(),
        averageArea: calculateAverageTriangleArea(),
        networkComplexity: calculateNetworkComplexity(),
        spatialDistribution: calculateSpatialDistribution(),
        particleVelocity: calculateAverageParticleVelocity(),
        connectionDensity: calculateConnectionDensity(),
        spatialCoherence: calculateSpatialCoherence()
    };

    // Reset connections
    for (let i = 0; i < particleCount; i++) {
        if (particles[i]) {
            particles[i].connections = 0;
        }
    }

    // Update particles with safety checks
    for (let i = 0; i < particleCount; i++) {
        if (!particles[i]) continue;
        const particle = particles[i];
        positions[i * 3] += particle.vel.x * params.speed;
        positions[i * 3 + 1] += particle.vel.y * params.speed;
        positions[i * 3 + 2] += particle.vel.z * params.speed;
        if (positions[i * 3 + 1] < -rHalf || positions[i * 3 + 1] > rHalf)
            particle.vel.y = -particle.vel.y;
        if (positions[i * 3] < -rHalf || positions[i * 3] > rHalf)
            particle.vel.x = -particle.vel.x;
        if (positions[i * 3 + 2] < -rHalf || positions[i * 3 + 2] > rHalf)
            particle.vel.z = -particle.vel.z;
        particle.pos.x = positions[i * 3];
        particle.pos.y = positions[i * 3 + 1];
        particle.pos.z = positions[i * 3 + 2];
    }

    // Update points
    if (showDots && pointMesh) {
        try {
            const pointData = new Float32Array(pointMesh.vertexBuffer.lock());
            pointData.set(positions.subarray(0, particleCount * 3));
            pointMesh.vertexBuffer.unlock();
            pointMesh.primitive[0].count = particleCount;
        } catch (error) {
            console.error('Error updating point buffer:', error);
            if (pointMesh.vertexBuffer.locked) {
                pointMesh.vertexBuffer.unlock();
            }
            pointMesh.primitive[0].count = 0;
        }
    }

    // Update lines with vertex limit checks
    if (showLines && lineMesh) {
        let lineCount = 0;
        const maxPossibleLines = Math.floor(MAX_LINE_VERTICES / 2);
        for (let i = 0; i < particleCount && lineCount < maxPossibleLines; i++) {
            const p1 = particles[i];
            if (limitConnections && p1.connections >= maxConnections) continue;
            for (let j = i + 1; j < particleCount && lineCount < maxPossibleLines; j++) {
                const p2 = particles[j];
                if (limitConnections && p2.connections >= maxConnections) continue;
                const dx = positions[i * 3] - positions[j * 3];
                const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
                const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < minDistance) {
                    if (lineCount >= maxPossibleLines) {
                        console.warn('Max line limit reached');
                        break;
                    }
                    linePositions[lineCount * 6] = positions[i * 3];
                    linePositions[lineCount * 6 + 1] = positions[i * 3 + 1];
                    linePositions[lineCount * 6 + 2] = positions[i * 3 + 2];
                    linePositions[lineCount * 6 + 3] = positions[j * 3];
                    linePositions[lineCount * 6 + 4] = positions[j * 3 + 1];
                    linePositions[lineCount * 6 + 5] = positions[j * 3 + 2];
                    lineCount++;
                    p1.connections++;
                    p2.connections++;
                    if (limitConnections && p1.connections >= maxConnections) break;
                }
            }
        }
        if (lineCount > 0) {
            try {
                const lineData = new Float32Array(lineMesh.vertexBuffer.lock());
                lineData.set(linePositions.subarray(0, Math.min(lineCount * 6, MAX_LINE_VERTICES * 3)));
                lineMesh.vertexBuffer.unlock();
                lineMesh.primitive[0].count = Math.min(lineCount * 2, MAX_LINE_VERTICES);
            } catch (error) {
                console.error('Error updating line buffer:', error);
                if (lineMesh.vertexBuffer.locked) {
                    lineMesh.vertexBuffer.unlock();
                }
                lineMesh.primitive[0].count = 0;
            }
        } else {
            lineMesh.primitive[0].count = 0;
        }
    }

    // Always update currentTriangles before using it
    currentTriangles = findTriangles();

    // Only update previousTriangles conditionally
    if (currentTriangles.size < params.maxTriangles && frameCounter % TRIANGLE_DETECTION_INTERVAL === 0) {
        try {
            const oldTriangleIds = previousTriangles;
            previousTriangles = new Set([...currentTriangles].map(t => t.id));
            // Update previousTriangleAreas for next frame
            for (const tri of currentTriangles) {
                previousTriangleAreas[tri.id] = tri.area;
            }
        } catch (error) {
            console.error('Error in triangle detection:', error);
            currentTriangles = new Set();
        }
    }

    if (frameCounter > 1000000) frameCounter = 0;
    group.setEulerAngles(0, currentTime * 0.05 * params.speed, 0);
    updateDebugInfo(networkState);
}

// Update the debug info function to include network state
function updateDebugInfo(networkState) {
    if (!debugPanel) return;
    
    const lineCount = lineMesh ? lineMesh.primitive[0].count / 2 : 0;
    const bufferUsage = ((lineCount * 2) / MAX_LINE_VERTICES * 100).toFixed(1);
    const triangleCount = currentTriangles ? currentTriangles.size : 0;
    
    // Create default network state if none provided
    const defaultNetworkState = {
        triangleDensity: 0,
        averageArea: 0,
        networkComplexity: 0,
        spatialDistribution: 0,
        particleVelocity: 0,
        connectionDensity: 0,
        spatialCoherence: 0
    };

    // Use provided networkState or default
    const state = networkState || defaultNetworkState;
    
    debugPanel.innerHTML = `
        <div style="margin-bottom: 10px;">
            <h3 style="margin: 0 0 5px 0; color: #4CAF50;">Network State</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                <div>Triangle Density:</div>
                <div>${(state.triangleDensity * 100).toFixed(1)}%</div>
                <div>Average Area:</div>
                <div>${state.averageArea.toFixed(2)}</div>
                <div>Network Complexity:</div>
                <div>${(state.networkComplexity * 100).toFixed(1)}%</div>
                <div>Spatial Distribution:</div>
                <div>${state.spatialDistribution.toFixed(2)}</div>
                <div>Particle Velocity:</div>
                <div>${state.particleVelocity.toFixed(2)}</div>
                <div>Connection Density:</div>
                <div>${(state.connectionDensity * 100).toFixed(1)}%</div>
                <div>Spatial Coherence:</div>
                <div>${state.spatialCoherence.toFixed(2)}</div>
            </div>
        </div>
        <div style="margin-top: 10px;">
            <h3 style="margin: 0 0 5px 0; color: #2196F3;">System Stats</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                <div>Particles:</div>
                <div>${particleCount}</div>
                <div>Min Distance:</div>
                <div>${minDistance.toFixed(1)}</div>
                <div>Max Connections:</div>
                <div>${maxConnections}</div>
                <div>Active Connections:</div>
                <div>${lineCount}</div>
                <div>Buffer Usage:</div>
                <div>${bufferUsage}%</div>
                <div>Active Triangles:</div>
                <div>${triangleCount}/${params.maxTriangles}</div>
                <div>FPS:</div>
                <div>${Math.round(1/dt)}</div>
            </div>
        </div>
    `;
}

// Euler Tonnetz pitch mapping function
function getTonnetzPitch(rootMidi, i, j, k) {
    // rootMidi: MIDI number of the selected root note
    // i, j, k: integer steps along each axis
    return rootMidi + i * 7 + j * 4 + k * 3;
}

// Helper to get MIDI number from note name and octave
function noteToMidi(note, octave) {
    return Tone.Frequency(note + octave).toMidi();
}

// Map triangle indices to Tonnetz coordinates (simple version)
function triangleToTonnetz(triangleId) {
    // Use the three indices as (i, j, k) offsets from the root
    // This is a simple mapping; you can refine it for your network
    const parts = triangleId.split('-').map(Number);
    // Center the mapping around 0
    const i = parts[0] % 3 - 1;
    const j = parts[1] % 3 - 1;
    const k = parts[2] % 3 - 1;
    return { i, j, k };
}

// Helper: get distance from triangle center to camera
function getDistanceToCamera(center) {
    const camPos = camera.getPosition ? camera.getPosition() : {x: 0, y: 0, z: params.cameraDistance};
    return Math.sqrt(
        Math.pow(center.x - camPos.x, 2) +
        Math.pow(center.y - camPos.y, 2) +
        Math.pow(center.z - camPos.z, 2)
    );
}

// Network State Analysis Functions
function calculateTriangleDensity() {
    return currentTriangles.size / params.maxTriangles;
}

function calculateAverageTriangleArea() {
    if (currentTriangles.size === 0) return 0;
    let totalArea = 0;
    currentTriangles.forEach(triangle => {
        totalArea += triangle.area;
    });
    return totalArea / currentTriangles.size;
}

function calculateNetworkComplexity() {
    let totalConnections = 0;
    let maxPossibleConnections = particleCount * (particleCount - 1) / 2;
    
    for (let i = 0; i < particleCount; i++) {
        if (particles[i]) {
            totalConnections += particles[i].connections;
        }
    }
    
    return totalConnections / maxPossibleConnections;
}

function calculateSpatialDistribution() {
    if (currentTriangles.size === 0) return 0;
    
    let centerOfMass = new pc.Vec3();
    let totalArea = 0;
    
    currentTriangles.forEach(triangle => {
        centerOfMass.add(triangle.center.scale(triangle.area));
        totalArea += triangle.area;
    });
    
    centerOfMass.scale(1 / totalArea);
    
    let spatialSpread = 0;
    currentTriangles.forEach(triangle => {
        const distance = triangle.center.distance(centerOfMass);
        spatialSpread += distance * triangle.area;
    });
    
    return spatialSpread / totalArea;
}

function calculateAverageParticleVelocity() {
    let totalVelocity = 0;
    let activeParticles = 0;
    
    for (let i = 0; i < particleCount; i++) {
        if (particles[i]) {
            const velocity = Math.sqrt(
                particles[i].vel.x * particles[i].vel.x +
                particles[i].vel.y * particles[i].vel.y +
                particles[i].vel.z * particles[i].vel.z
            );
            totalVelocity += velocity;
            activeParticles++;
        }
    }
    
    return activeParticles > 0 ? totalVelocity / activeParticles : 0;
}

function calculateConnectionDensity() {
    const lineCount = lineMesh ? lineMesh.primitive[0].count / 2 : 0;
    const maxPossibleConnections = particleCount * (particleCount - 1) / 2;
    return lineCount / maxPossibleConnections;
}

function calculateSpatialCoherence() {
    if (particleCount < 2) return 0;
    
    let totalVelocityAlignment = 0;
    let totalConnections = 0;
    
    for (let i = 0; i < particleCount; i++) {
        if (!particles[i]) continue;
        
        for (let j = i + 1; j < particleCount; j++) {
            if (!particles[j]) continue;
            
            const dx = positions[i * 3] - positions[j * 3];
            const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
            const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (dist < minDistance) {
                const dotProduct = 
                    particles[i].vel.x * particles[j].vel.x +
                    particles[i].vel.y * particles[j].vel.y +
                    particles[i].vel.z * particles[j].vel.z;
                
                const vel1 = Math.sqrt(
                    particles[i].vel.x * particles[i].vel.x +
                    particles[i].vel.y * particles[i].vel.y +
                    particles[i].vel.z * particles[i].vel.z
                );
                
                const vel2 = Math.sqrt(
                    particles[j].vel.x * particles[j].vel.x +
                    particles[j].vel.y * particles[j].vel.y +
                    particles[j].vel.z * particles[j].vel.z
                );
                
                if (vel1 > 0 && vel2 > 0) {
                    totalVelocityAlignment += dotProduct / (vel1 * vel2);
                    totalConnections++;
                }
            }
        }
    }
    
    return totalConnections > 0 ? totalVelocityAlignment / totalConnections : 0;
}

// Drone Modulation Mapping Functions
function mapNetworkToDrone(networkState) {
    return {
        // Frequency mapping
        baseFrequency: mapTriangleDensityToFrequency(networkState.triangleDensity),
        harmonicRatio: mapAverageAreaToHarmonicRatio(networkState.averageArea),
        detuneAmount: mapNetworkComplexityToDetune(networkState.networkComplexity),
        
        // Timbre mapping
        filterFrequency: mapSpatialDistributionToFilter(networkState.spatialDistribution),
        filterResonance: mapParticleVelocityToResonance(networkState.particleVelocity),
        waveShape: mapConnectionDensityToWaveShape(networkState.connectionDensity),
        
        // Spatial mapping
        panPosition: mapSpatialCoherenceToPan(networkState.spatialCoherence),
        reverbAmount: mapNetworkComplexityToReverb(networkState.networkComplexity),
        delayTime: mapParticleVelocityToDelay(networkState.particleVelocity),
        delayFeedback: mapConnectionDensityToFeedback(networkState.connectionDensity)
    };
}

// Frequency mapping functions
function mapTriangleDensityToFrequency(density) {
    // Map density (0-1) to frequency range (20-2000 Hz)
    return 20 + Math.pow(density, 2) * 1980;
}

function mapAverageAreaToHarmonicRatio(area) {
    // Map area to harmonic series ratio (1-8)
    return 1 + Math.min(7, area / 100);
}

function mapNetworkComplexityToDetune(complexity) {
    // Map complexity (0-1) to detune amount (0-50 cents)
    return complexity * 50;
}

// Timbre mapping functions
function mapSpatialDistributionToFilter(spatialDist) {
    // Map spatial distribution to filter frequency (20-20000 Hz)
    return 20 + Math.pow(spatialDist / r, 2) * 19980;
}

function mapParticleVelocityToResonance(velocity) {
    // Map velocity to filter resonance (0-20)
    return Math.min(20, velocity * 10);
}

function mapConnectionDensityToWaveShape(density) {
    // Map density (0-1) to wave shape (0-1)
    return density;
}

// Spatial mapping functions
function mapSpatialCoherenceToPan(coherence) {
    // Map coherence (-1 to 1) to pan position (-1 to 1)
    return coherence;
}

function mapNetworkComplexityToReverb(complexity) {
    // Map complexity (0-1) to reverb amount (0-0.8)
    return complexity * 0.8;
}

function mapParticleVelocityToDelay(velocity) {
    // Map velocity to delay time (0-2 seconds)
    return Math.min(2, velocity * 0.5);
}

function mapConnectionDensityToFeedback(density) {
    // Map density (0-1) to delay feedback (0-0.9)
    return density * 0.9;
} 