import * as pc from 'playcanvas';
import GUI from 'lil-gui';
import * as Tone from 'tone';
import { AudioManager } from './AudioManager';

// --- Waveform Visualization Canvas ---
const waveformCanvas = document.createElement('canvas');
waveformCanvas.width = 320;
waveformCanvas.height = 80;
waveformCanvas.style.position = 'fixed';
waveformCanvas.style.left = '30px';
waveformCanvas.style.bottom = '340px'; // higher above stats panel
waveformCanvas.style.background = 'transparent'; // no background
waveformCanvas.style.border = 'none'; // no border
waveformCanvas.style.zIndex = 2000;
waveformCanvas.style.width = '320px';
waveformCanvas.style.height = '80px';
waveformCanvas.style.boxSizing = 'content-box';
document.body.appendChild(waveformCanvas);

// --- Blend Visualization Canvas (Vector) ---
const blendCanvas = document.createElement('canvas');
blendCanvas.width = 120;
blendCanvas.height = 120;
blendCanvas.style.position = 'fixed';
blendCanvas.style.right = '20px';
blendCanvas.style.bottom = '100px'; // above audio controls
blendCanvas.style.background = '#222';
blendCanvas.style.border = '1px solid #888';
blendCanvas.style.zIndex = 2000;
blendCanvas.style.width = '120px';   // Prevent CSS stretching
blendCanvas.style.height = '120px';  // Prevent CSS stretching
blendCanvas.style.boxSizing = 'content-box'; // Prevent border from affecting size
document.body.appendChild(blendCanvas);

function updateBlendViz(v1, v2, v3, v4) {
    const ctx = blendCanvas.getContext('2d');
    ctx.clearRect(0, 0, blendCanvas.width, blendCanvas.height);
    // Map v1-v4 to 2D (X = v1, Y = v3)
    const x = v1 * blendCanvas.width;
    const y = (1 - v3) * blendCanvas.height;
    // Draw background grid
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(blendCanvas.width/2, 0);
    ctx.lineTo(blendCanvas.width/2, blendCanvas.height);
    ctx.moveTo(0, blendCanvas.height/2);
    ctx.lineTo(blendCanvas.width, blendCanvas.height/2);
    ctx.stroke();
    // Draw the dot
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, 2 * Math.PI);
    ctx.fillStyle = '#4CAF50';
    ctx.shadowColor = '#4CAF50';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Label corners with synth names
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText('FM', 5, 15);
    ctx.fillText('AM', blendCanvas.width-25, 15);
    ctx.fillText('MEM', 5, blendCanvas.height-5);
    ctx.fillText('DUO', blendCanvas.width-30, blendCanvas.height-5);
}

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

// Declare audioManager and previousTriangleAreas at the top
let audioManager = new AudioManager();
const previousTriangleAreas = {};
let analyser;

// Smoothing factor for network-to-audio mapping
const SMOOTHING_FACTOR = 0.2; // 0.0 = no smoothing, 1.0 = instant
let smoothedNetworkState = null;

// Add after the other state variables
let previousParticleCount = 0;
const AUDIO_TRANSITION_SMOOTHING = 0.05; // Much slower smoothing for audio transitions
let audioTransitionState = null;

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
        // console.log(`Particle ${i} has ${connections.size} connections`);
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
    // console.log(`findTriangles: considered=${trianglesConsidered}, skippedArea=${trianglesSkippedArea}, skippedConnection=${trianglesSkippedConnection}, found=${triangles.size}`);
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
// 1. Add audio controls container
const audioControls = document.createElement('div');
audioControls.style.position = 'fixed';
audioControls.style.bottom = '20px';
audioControls.style.right = '20px';
audioControls.style.background = 'rgba(0,0,0,0.7)';
audioControls.style.padding = '10px';
audioControls.style.borderRadius = '5px';
audioControls.style.zIndex = '1000';
audioControls.style.color = 'white';
audioControls.style.fontFamily = 'monospace';
audioControls.style.display = 'flex';
audioControls.style.gap = '10px';
document.body.appendChild(audioControls);

// 2. Add Start Audio button
const startButton = document.createElement('button');
startButton.textContent = 'Start Audio';
startButton.style.padding = '5px 10px';
startButton.style.backgroundColor = '#4CAF50';
startButton.style.border = 'none';
startButton.style.borderRadius = '3px';
startButton.style.cursor = 'pointer';
startButton.style.fontFamily = 'monospace';
startButton.style.color = 'white';
audioControls.appendChild(startButton);

// 3. Add Stop Audio button
const stopButton = document.createElement('button');
stopButton.textContent = 'Stop Audio';
stopButton.style.padding = '5px 10px';
stopButton.style.backgroundColor = '#f44336';
stopButton.style.border = 'none';
stopButton.style.borderRadius = '3px';
stopButton.style.cursor = 'pointer';
stopButton.style.fontFamily = 'monospace';
stopButton.style.color = 'white';
audioControls.appendChild(stopButton);

// 4. Add audio status indicator
const audioStatus = document.createElement('div');
audioStatus.style.padding = '5px 10px';
audioStatus.style.backgroundColor = '#666';
audioStatus.style.borderRadius = '3px';
audioStatus.textContent = 'Audio: Stopped';
audioControls.appendChild(audioStatus);

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
    speed: 1.0,            // General speed multiplier
    scale: 'Major',        // Musical scale
    mode: 'Ionian',        // Musical mode (default to Ionian for Major)
    microtuning: '12-TET',  // Microtuning system
    networkRoot: false,    // Network modulates root
    scaleIndex: 0,          // Added for scale selection
    microtuningIndex: 0,     // Added for microtuning selection
    currentScaleLabel: '',  // Added for current scale label
    currentMicrotuningLabel: '',  // Added for current microtuning label
    volume: 0.16,           // Default volume (linear, about -16 dB)
    octave: 4,              // Default octave
};

// Define options for scales and microtuning
const scaleOptions = ['Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian'];
const microtuningOptions = ['12-TET', '19-TET', '24-TET', 'Just Intonation'];

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

// Add scale, mode, microtuning, and network root controls to GUI
const musicFolder = gui.addFolder('Musical Controls');
musicFolder.add(params, 'scaleIndex', 0, scaleOptions.length - 1, 1)
    .name('Scale')
    .onChange(idx => {
        params.scale = scaleOptions[idx];
        params.currentScaleLabel = scaleOptions[idx];
        if (audioManager) audioManager.setScale(params.scale);
        musicFolder.controllersRecursive().forEach(ctrl => ctrl.updateDisplay && ctrl.updateDisplay());
    });
musicFolder.add(params, 'currentScaleLabel').name('Current Scale').listen();
musicFolder.add(params, 'microtuningIndex', 0, microtuningOptions.length - 1, 1)
    .name('Microtuning')
    .onChange(idx => {
        params.microtuning = microtuningOptions[idx];
        params.currentMicrotuningLabel = microtuningOptions[idx];
        if (audioManager) audioManager.setMicrotuning(params.microtuning);
        musicFolder.controllersRecursive().forEach(ctrl => ctrl.updateDisplay && ctrl.updateDisplay());
    });
musicFolder.add(params, 'currentMicrotuningLabel').name('Current Microtuning').listen();
musicFolder.add(params, 'networkRoot').name('Network modulates root')
    .onChange(value => { if (audioManager) audioManager.setNetworkRootModulation(value); });

// Add volume control
musicFolder.add(params, 'volume', 0, 0.707, 0.01) // 0.707 linear is -3 dB
    .name('Volume (-3 dB max)')
    .onChange(value => {
        if (audioManager && audioManager.masterGain) {
            audioManager.masterGain.gain.value = value;
        }
    });

// Add octave control
musicFolder.add(params, 'octave', 1, 7, 1)
    .name('Octave')
    .onChange(value => {
        params.octave = value;
        // Update root note and octave in AudioManager
        if (audioManager) {
            // Use the current root note name
            let note = 'C';
            if (params.scale && typeof params.scale === 'string') {
                note = params.scale[0].toUpperCase();
            }
            // Try to use the note from rootMidi if available
            if (typeof params.rootMidi === 'number') {
                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                note = noteNames[params.rootMidi % 12];
            }
            audioManager.setRootNoteAndOctave(note, value);
        }
    });

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
EULER TOPOLOYCAL SYNTH_`;
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

// Modify the update function to include audio transition smoothing and blend viz update
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

    // --- Parameter smoothing ---
    if (!smoothedNetworkState) {
        smoothedNetworkState = { ...networkState };
    } else {
        for (let key in networkState) {
            smoothedNetworkState[key] = smoothedNetworkState[key] * (1 - SMOOTHING_FACTOR) + networkState[key] * SMOOTHING_FACTOR;
        }
    }

    // --- Audio transition smoothing ---
    // Check if particle count has changed
    if (previousParticleCount !== particleCount) {
        // Initialize audio transition state if needed
        if (!audioTransitionState) {
            audioTransitionState = { ...smoothedNetworkState };
        }
        
        // Apply slower smoothing to audio parameters during transitions
        for (let key in smoothedNetworkState) {
            audioTransitionState[key] = audioTransitionState[key] * (1 - AUDIO_TRANSITION_SMOOTHING) + 
                                      smoothedNetworkState[key] * AUDIO_TRANSITION_SMOOTHING;
        }
        
        // Update previous count
        previousParticleCount = particleCount;
    } else if (audioTransitionState) {
        // If no change in particle count, gradually sync audio state with network state
        for (let key in smoothedNetworkState) {
            audioTransitionState[key] = smoothedNetworkState[key];
        }
    }

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

    // Use audioTransitionState for audio updates instead of smoothedNetworkState
    if (audioManager) {
        audioManager.updateFromNetwork(audioTransitionState || smoothedNetworkState);
        // --- Blend Viz ---
        // Calculate v1-v4 as in AudioManager
        const ns = audioTransitionState || smoothedNetworkState;
        const v1 = Math.max(0, Math.min(1, ns.triangleDensity));
        const v2 = Math.max(0, Math.min(1, ns.averageArea / 1000));
        const v3 = Math.max(0, Math.min(1, ns.networkComplexity));
        const v4 = Math.max(0, Math.min(1, ns.spatialDistribution));
        updateBlendViz(v1, v2, v3, v4);
    }

    // Update previous triangles set
    previousTriangles = new Set(currentTriangles);

    if (frameCounter > 1000000) frameCounter = 0;
    group.setEulerAngles(0, currentTime * 0.05 * params.speed, 0);
    updateDebugInfo(audioTransitionState || smoothedNetworkState);

    // --- Waveform Drawing Function ---
    drawWaveform();
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
function triangleToTonnetz(triangle) {
    // Accepts either a triangle object or a string id
    let parts;
    if (typeof triangle === 'string') {
        parts = triangle.split('-').map(Number);
    } else if (triangle && triangle.particles) {
        parts = triangle.particles;
    } else {
        throw new Error('Invalid triangle input to triangleToTonnetz');
    }
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
    for (const triangle of currentTriangles) {
        totalArea += triangle.area;
    }
    return totalArea / currentTriangles.size;
}

function calculateNetworkComplexity() {
    // Combine multiple factors for complexity
    const triangleDensity = calculateTriangleDensity();
    const avgArea = calculateAverageTriangleArea();
    const spatialDist = calculateSpatialDistribution();
    const velocity = calculateAverageParticleVelocity();
    
    // Weighted combination of factors
    return (
        triangleDensity * 0.3 +
        (1 - Math.min(avgArea / 1000, 1)) * 0.2 +
        spatialDist * 0.3 +
        velocity * 0.2
    );
}

function calculateSpatialDistribution() {
    if (currentTriangles.size === 0) return 0;
    
    // Calculate center of mass
    let centerX = 0, centerY = 0, centerZ = 0;
    for (const triangle of currentTriangles) {
        const center = triangle.center;
        centerX += center.x;
        centerY += center.y;
        centerZ += center.z;
    }
    centerX /= currentTriangles.size;
    centerY /= currentTriangles.size;
    centerZ /= currentTriangles.size;
    
    // Calculate average distance from center
    let totalDist = 0;
    for (const triangle of currentTriangles) {
        const center = triangle.center;
        const dx = center.x - centerX;
        const dy = center.y - centerY;
        const dz = center.z - centerZ;
        totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    return totalDist / (currentTriangles.size * r);
}

function calculateAverageParticleVelocity() {
    let totalVelocity = 0;
    let count = 0;
    
    for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        if (p.vel) {
            const speed = Math.sqrt(
                p.vel.x * p.vel.x +
                p.vel.y * p.vel.y +
                p.vel.z * p.vel.z
            );
            totalVelocity += speed;
            count++;
        }
    }
    
    return count > 0 ? totalVelocity / count : 0;
}

function calculateConnectionDensity() {
    let totalConnections = 0;
    for (const connections of particleConnections.values()) {
        totalConnections += connections.size;
    }
    
    const maxPossibleConnections = particleCount * (particleCount - 1) / 2;
    return totalConnections / maxPossibleConnections;
}

function calculateSpatialCoherence() {
    if (currentTriangles.size === 0) return 0;
    
    // Calculate average normal vector
    let avgNormalX = 0, avgNormalY = 0, avgNormalZ = 0;
    for (const triangle of currentTriangles) {
        const [p1, p2, p3] = triangle.particles;
        const v1 = {
            x: particles[p2].pos.x - particles[p1].pos.x,
            y: particles[p2].pos.y - particles[p1].pos.y,
            z: particles[p2].pos.z - particles[p1].pos.z
        };
        const v2 = {
            x: particles[p3].pos.x - particles[p1].pos.x,
            y: particles[p3].pos.y - particles[p1].pos.y,
            z: particles[p3].pos.z - particles[p1].pos.z
        };
        
        // Cross product for normal
        const nx = v1.y * v2.z - v1.z * v2.y;
        const ny = v1.z * v2.x - v1.x * v2.z;
        const nz = v1.x * v2.y - v1.y * v2.x;
        
        // Normalize
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) {
            avgNormalX += nx / len;
            avgNormalY += ny / len;
            avgNormalZ += nz / len;
        }
    }
    
    // Normalize average normal
    const len = Math.sqrt(
        avgNormalX * avgNormalX +
        avgNormalY * avgNormalY +
        avgNormalZ * avgNormalZ
    );
    
    if (len > 0) {
        avgNormalX /= len;
        avgNormalY /= len;
        avgNormalZ /= len;
    }
    
    // Calculate coherence as dot product with camera direction
    const cameraDir = {
        x: camera.getPosition().x,
        y: camera.getPosition().y,
        z: camera.getPosition().z
    };
    
    const dot = (
        avgNormalX * cameraDir.x +
        avgNormalY * cameraDir.y +
        avgNormalZ * cameraDir.z
    );
    
    return (dot + 1) / 2; // Normalize to 0-1
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

// In your UI setup, only call audioManager.start() from the Start Audio button click handler
startButton.addEventListener('click', async () => {
    try {
        await audioManager.start();
        startButton.textContent = 'Audio Running';
        startButton.style.backgroundColor = '#45a049';
        audioStatus.textContent = 'Audio: Running';
        audioStatus.style.backgroundColor = '#4CAF50';
        // Let AudioManager handle waveform animation after audio is started
    } catch (error) {
        console.error('Failed to start audio:', error);
        startButton.textContent = 'Start Failed';
        startButton.style.backgroundColor = '#f44336';
        audioStatus.textContent = 'Audio: Failed';
        audioStatus.style.backgroundColor = '#f44336';
    }
});

stopButton.addEventListener('click', () => {
    audioManager.stop();
    startButton.textContent = 'Start Audio';
    startButton.style.backgroundColor = '#4CAF50';
    audioStatus.textContent = 'Audio: Stopped';
    audioStatus.style.backgroundColor = '#666';
});

// --- Waveform Drawing Function ---
function drawWaveform() {
    if (!audioManager || !audioManager.analyser) return;
    const ctx = waveformCanvas.getContext('2d');
    ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    const data = audioManager.analyser.getValue();
    ctx.beginPath();
    ctx.moveTo(0, waveformCanvas.height / 2);
    for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * waveformCanvas.width;
        const y = (1 - (data[i] + 1) / 2) * waveformCanvas.height;
        ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(128,192,255,0.7)'; // match network color
    ctx.lineWidth = 2;
    ctx.stroke();
} 