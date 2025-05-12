import * as pc from 'playcanvas';
import * as Tone from 'tone';

// ===== PlayCanvas Setup =====
// Initialize PlayCanvas Application with the canvas element
const canvas = document.getElementById('application-canvas');
const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance'
    }
});

// Configure canvas to fill window and auto-resize
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

// Start the PlayCanvas application
app.start();

// ===== Scene Setup =====
// Create and configure camera
const camera = new pc.Entity('camera');
camera.addComponent('camera', {
    clearColor: new pc.Color(0, 0, 0), // Black background
    clearColorBuffer: true,
    clearDepthBuffer: true
});
app.root.addChild(camera);
camera.setPosition(0, 0, 8); // Position camera 8 units back

// Create directional light for scene illumination
const light = new pc.Entity('light');
light.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 1, 1), // White light
    castShadows: true,
    shadowBias: 0.05,
    normalOffsetBias: 0.05
});
app.root.addChild(light);
light.setEulerAngles(45, 30, 0); // Angle the light

// Create white floor plane
const floor = new pc.Entity('floor');
floor.addComponent('render', {
    type: 'plane',
    material: (() => {
        const m = new pc.StandardMaterial();
        m.diffuse = new pc.Color(1, 1, 1); // White color
        m.useLighting = true;
        m.update();
        return m;
    })()
});
floor.setLocalScale(6, 1, 6); // Scale floor to 6x6 units
floor.setLocalPosition(0, -1.5, 0); // Position floor below scene
app.root.addChild(floor);

// ===== Marching Cubes Parameters =====
const resolution = 28; // Grid resolution for marching cubes
const size = 3.0; // Size of the marching cubes volume
const isolation = 1.0; // Surface threshold for marching cubes
const numBlobs = 8; // Number of metaballs
const speed = 5.0; // Animation speed

// ===== Blob (Metaball) Setup =====
// Available waveforms for blob synths
const waveforms = ['sine', 'square', 'triangle', 'sawtooth'];
window._selectedWaveform = 'sine'; // Default waveform

// Create waveform selector grid
const waveformGrid = document.createElement('div');
waveformGrid.style.position = 'fixed';
waveformGrid.style.bottom = '140px';
waveformGrid.style.left = '50%';
waveformGrid.style.transform = 'translateX(-50%)';
waveformGrid.style.display = 'grid';
waveformGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
waveformGrid.style.gap = '10px';
waveformGrid.style.padding = '10px';
waveformGrid.style.background = 'rgba(0,0,0,0.7)';
waveformGrid.style.borderRadius = '8px';
waveformGrid.style.zIndex = 10000;

// Create waveform buttons
waveforms.forEach(waveform => {
    const button = document.createElement('button');
    button.textContent = waveform;
    button.style.padding = '8px 16px';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.background = waveform === window._selectedWaveform ? '#0f0' : '#333';
    button.style.color = '#fff';
    button.style.cursor = 'pointer';
    button.style.fontFamily = 'monospace';
    button.style.transition = 'all 0.2s ease';
    
    button.addEventListener('click', () => {
        // Update selected waveform
        window._selectedWaveform = waveform;
        
        // Update button styles
        waveformGrid.querySelectorAll('button').forEach(btn => {
            btn.style.background = btn.textContent === waveform ? '#0f0' : '#333';
        });
    });
    
    waveformGrid.appendChild(button);
});

document.body.appendChild(waveformGrid);

// Initialize blob array with random properties
const blobs = Array.from({ length: numBlobs }, (_, i) => ({
    px: 0, py: 0, pz: 0, // Position
    vy: 0, // Vertical velocity
    mode: "oscillate", // Movement mode (oscillate or fall)
    oscPhase: Math.random() * 2 * Math.PI, // Oscillation phase
    dx: Math.random() * 2 * Math.PI, // X movement phase
    dy: Math.random() * 2 * Math.PI, // Y movement phase
    dz: Math.random() * 2 * Math.PI, // Z movement phase
    phase: Math.random() * 2 * Math.PI, // Overall phase
    freq: 0.5 + Math.random(), // Movement frequency
    waveform: waveforms[Math.floor(Math.random() * waveforms.length)], // Random waveform
    synth: null // Will be assigned after Tone.js is started
}));

// ===== Marching Cubes Container =====
// Create container for marching cubes mesh
const marchingCubesContainer = new pc.Entity('marchingCubes');
app.root.addChild(marchingCubesContainer);

// ===== Material Creation =====
// Create plastic material for blobs
function createPlasticMaterial() {
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(1, 1, 1); // Bright white
    mat.shininess = 90; // Very shiny
    mat.specular = new pc.Color(1, 0.8, 0.6); // Warm highlight
    mat.metalness = 0; // Not metallic
    mat.roughness = 0.1; // Smooth surface
    mat.useLighting = true;
    mat.update();
    return mat;
}

// Create marching cubes geometry with appropriate material
function createMarchingCubesGeometry() {
    let material;
    if (window._simMaterial === 'plastic') {
        material = createPlasticMaterial();
    } else {
        material = new pc.StandardMaterial();
        material.diffuse = new pc.Color(1, 1, 1);
        material.shininess = 80;
        material.metalness = 0.2;
        material.roughness = 0.2;
        material.useLighting = true;
        material.update();
    }
    
    // Create initial mesh (will be updated in animation loop)
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions([0, 0, 0]);
    mesh.setIndices([0]);
    mesh.update();
    
    // Create entity with mesh
    const entity = new pc.Entity('marchingCubesMesh');
    entity.addComponent('render', {
        material: material,
        meshInstances: [new pc.MeshInstance(mesh, material)],
        castShadows: true,
        receiveShadows: true
    });
    marchingCubesContainer.addChild(entity);
    return entity;
}

// Create initial marching cubes mesh
const marchingCubesMesh = createMarchingCubesGeometry();

// ===== Audio Setup =====
let analyser;
let synth;
let masterGain;
let reverb;
let limiter;
let meter;

// Create visualization canvas
const vizCanvas = document.createElement('canvas');
vizCanvas.style.position = 'fixed';
vizCanvas.style.bottom = '20px';
vizCanvas.style.left = '50%';
vizCanvas.style.transform = 'translateX(-50%)';
vizCanvas.style.width = '600px'; // Match floor width (6 units * 100px per unit)
vizCanvas.style.height = '100px';
vizCanvas.style.background = 'rgba(0,0,0,0.7)';
vizCanvas.style.borderRadius = '8px';
vizCanvas.style.zIndex = 10000;
document.body.appendChild(vizCanvas);

const ctx = vizCanvas.getContext('2d');
vizCanvas.width = 600; // Match floor width in pixels
vizCanvas.height = 100;

// Create audio meters panel
const metersPanel = document.createElement('div');
metersPanel.style.position = 'fixed';
metersPanel.style.top = '10px';
metersPanel.style.right = '200px';
metersPanel.style.background = 'rgba(0,0,0,0.7)';
metersPanel.style.color = '#0f0';
metersPanel.style.fontFamily = 'monospace';
metersPanel.style.padding = '10px';
metersPanel.style.zIndex = 10000;
metersPanel.style.fontSize = '14px';
document.body.appendChild(metersPanel);

// Initialize audio system and create synths
async function setupAudio() {
    // Start Tone.js (requires user interaction)
    await Tone.start();
    document.getElementById('startButton').style.display = 'none';

    // Create master gain for final output
    masterGain = new Tone.Gain(0.8).toDestination(); // Reduced master volume

    // Create limiter to prevent clipping
    limiter = new Tone.Limiter(-1).connect(masterGain);

    // Create analyzer for visualization
    analyser = new Tone.Analyser("waveform", 256);
    analyser.connect(limiter);

    // Create meter for monitoring levels
    meter = new Tone.Meter();
    analyser.connect(meter);

    // Create reverb effect
    reverb = new Tone.Reverb({
        decay: 4,
        wet: 0.5,
        preDelay: 0.1
    }).connect(analyser);

    // Create global delay effect
    if (window._delay) {
        window._delay.dispose();
    }
    window._delay = new Tone.FeedbackDelay(0.3, 0.4).connect(reverb);

    // Create global filters (fully open by default)
    window._lowpass = new Tone.Filter(20000, 'lowpass').connect(window._delay);
    window._highpass = new Tone.Filter(20, 'highpass').connect(window._lowpass);

    // Create synths for each blob
    for (let b of blobs) {
        createBlobSynth(b);
    }

    // Store all synths for cleanup
    window._allBlobSynths = blobs.map(b => b.synth).filter(Boolean);

    // Play test note to verify audio
    const testSynth = new Tone.Synth().toDestination();
    testSynth.triggerAttackRelease('C4', '8n');
}

// Helper function to create a blob's synth and audio routing
function createBlobSynth(blob) {
    // Create dry and wet gain nodes for each blob
    blob.dryGain = new Tone.Gain(0).connect(window._highpass);
    blob.wetGain = new Tone.Gain(0).connect(window._delay);
    
    // Create synth with blob's waveform and adjusted envelope
    blob.synth = new Tone.Synth({
        oscillator: { type: blob.waveform },
        envelope: {
            attack: 0.005,
            decay: 0.1,
            sustain: 0.3,
            release: 0.1
        },
        volume: -10 // Reduced individual synth volume
    });
    blob.synth.connect(blob.dryGain);
    blob.synth.connect(blob.wetGain);
    blob.synth.volume.value = -Infinity;
    
    // Fade in gains
    blob.dryGain.gain.rampTo(1, 0.3);
    blob.wetGain.gain.rampTo(0, 0.3);
}

// ===== Marching Cubes Field Function =====
// Calculate field value at point (x,y,z) for marching cubes
function fieldValue(x, y, z, t) {
    let sum = 0;
    const sphereRadius = 0.15;
    const floorY = -1.5;
    const minY = floorY + sphereRadius;
    
    // Sum contributions from all blobs
    for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const dx = x - b.px;
        const dy = y - b.py;
        const dz = z - b.pz;
        sum += 1.0 / (dx * dx + dy * dy + dz * dz + 0.2);
    }
    
    // Add floor contribution
    if (y < 0.1) {
        sum += 10.0 / ((y + 1.5) * (y + 1.5) + 0.1);
    }
    return sum;
}

// ===== Debug Panel =====
// Create and configure debug panel
const debugPanel = document.createElement('div');
debugPanel.style.position = 'fixed';
debugPanel.style.top = '10px';
debugPanel.style.right = '10px';
debugPanel.style.background = 'rgba(0,0,0,0.7)';
debugPanel.style.color = '#0f0';
debugPanel.style.fontFamily = 'monospace';
debugPanel.style.padding = '10px';
debugPanel.style.zIndex = 10000;
debugPanel.style.fontSize = '14px';
document.body.appendChild(debugPanel);

// Update debug panel with current stats
function updateDebugPanel({ vertCount, minField, maxField, avgField }) {
    let dbLevel = meter ? Tone.gainToDb(meter.getValue()) : -Infinity;
    if (!isFinite(dbLevel)) dbLevel = -Infinity;
    const isClipping = dbLevel > -1;
    
    debugPanel.innerHTML = `
        <b>Marching Cubes Debug</b><br>
        Vertices: ${vertCount}<br>
        Field min: ${minField.toFixed(3)}<br>
        Field max: ${maxField.toFixed(3)}<br>
        Field avg: ${avgField.toFixed(3)}<br>
        Reverb Mix: ${(reverb ? reverb.wet.value : 0).toFixed(2)}<br>
        Blobs: ${numBlobs}<br>
        LPF: ${window._lowpassCutoff} Hz<br>
        HPF: ${window._highpassCutoff} Hz<br>
        Audio Level: ${isFinite(dbLevel) ? dbLevel.toFixed(1) + ' dB' : 'Silent'}<br>
        ${isClipping ? '<span style="color: #f00">CLIPPING!</span>' : ''}
    `;

    // Update meters panel
    if (meter) {
        let level = meter.getValue();
        let db = Tone.gainToDb(level);
        if (!isFinite(db)) db = -60; // treat as silence
        const normalizedLevel = Math.max(0, Math.min(1, (db + 60) / 60));
        metersPanel.innerHTML = `
            <b>Audio Meters</b><br>
            Level: ${isFinite(db) ? db.toFixed(1) + ' dB' : 'Silent'}<br>
            <div style="width: 100px; height: 10px; background: #333; margin: 5px 0;">
                <div style="width: ${normalizedLevel * 100}%; height: 100%; background: ${isClipping ? '#f00' : '#0f0'};"></div>
            </div>
            ${isClipping ? '<span style="color: #f00">CLIPPING!</span>' : ''}
        `;
    }
}

// ===== Simulation Control Panel =====
// Create and configure simulation control panel
const simPanel = document.createElement('div');
simPanel.style.position = 'fixed';
simPanel.style.top = '10px';
simPanel.style.left = '10px';
simPanel.style.background = 'rgba(20,20,20,0.95)';
simPanel.style.color = '#fff';
simPanel.style.fontFamily = 'monospace';
simPanel.style.padding = '14px 18px';
simPanel.style.zIndex = 10001;
simPanel.style.fontSize = '15px';
simPanel.style.borderRadius = '8px';

// ===== Chord Definitions =====
// Define musical frequencies for chord mapping
const C = 261.63; // C4
const D = 293.66;
const E = 329.63;
const F = 349.23;
const G = 392.00;
const A = 440.00;
const Bb = 466.16;
const B = 493.88;
const Eb = 311.13;
const Ab = 415.30;
const Gs = 415.30;
const Df = 277.18;
const Fsharp = 369.99;
const Gb = 369.99;

// Define available chords
const CHORDS = {
    'None': null,
    'Unison × 2': [C, C],
    'Unison × 3': [C, C, C],
    'Unison × 4': [C, C, C, C],
    'Fourth': [C, F],
    'Fifth': [C, G],
    'minor': [C, Eb, G],
    'm7': [C, Eb, G, Bb],
    'madd9': [C, Eb, G, D],
    'm6': [C, Eb, G, A],
    'mb5': [C, Eb, Gb],
    'm7b5': [C, Eb, Gb, Bb],
    'm7#5': [C, Eb, Gs, Bb],
    'mMaj7': [C, Eb, G, B],
    'mb6': [C, Eb, G, Ab],
    'm9no5': [C, Eb, Bb, D],
    'dim7': [C, Eb, Gb, A],
    'Major': [C, E, G],
    'M7': [C, E, G, B],
    '7sus4': [C, F, G, Bb],
    'sus4': [C, F, G],
    'sus2': [C, D, G],
    'Maj7': [C, E, G, B],
    'Madd9': [C, E, G, D],
    'M6': [C, E, G, A],
    'Mb5': [C, E, Gb],
    'M7b5': [C, E, Gb, B],
    'M#5': [C, E, Gs],
    'M7#5': [C, E, Gs, B],
    'M9no5': [C, E, B, D],
    'Madd9b5': [C, E, Gb, D],
    'Maj7b5': [C, E, Gb, B],
    'M7b9no5': [C, E, B, Df],
    'sus4#5b9': [C, F, Gs, Df],
    'sus4add#5': [C, F, Gs],
    'Maddb5': [C, E, Gb],
    'M6add4no5': [C, E, F, A],
    'Maj7/6no5': [C, E, A, B],
    'Maj9no5': [C, E, B, D]
};

// Initialize simulation settings
window._simChord = 'None';
window._simMaterial = 'plastic';

// Create simulation control panel HTML
simPanel.innerHTML = `
    <b>Simulation</b><br>
    <label>Material 
        <select id="sim-material">
            <option value="plastic">Plastic</option>
            <option value="default">Default</option>
        </select>
    </label><br>
    <label>Chord 
        <select id="sim-chord">
            ${Object.keys(CHORDS).map(name => `<option value="${name}">${name}</option>`).join('')}
        </select>
    </label><br>
    <label>speed <input id="sim-speed" type="range" min="0.1" max="10" step="0.1" value="${speed}"> <input id="sim-speed-val" type="number" min="0.1" max="10" step="0.1" value="${speed}" style="width:40px"></label><br>
    <label>numBlobs <input id="sim-blobs" type="range" min="1" max="20" step="1" value="${numBlobs}"> <input id="sim-blobs-val" type="number" min="1" max="20" step="1" value="${numBlobs}" style="width:40px"></label><br>
    <label>resolution <input id="sim-res" type="range" min="8" max="64" step="1" value="${resolution}"> <input id="sim-res-val" type="number" min="8" max="64" step="1" value="${resolution}" style="width:40px"></label><br>
    <label>reverb mix <input id="sim-iso" type="range" min="0" max="1" step="0.01" value="0.5"> <input id="sim-iso-val" type="number" min="0" max="1" step="0.01" value="0.5" style="width:50px"></label>
`;
document.body.appendChild(simPanel);

// ===== UI Control Functions =====
// Helper function to link slider and number input
function linkSliderAndNumber(sliderId, numberId, onChange) {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(numberId);
    slider.addEventListener('input', () => {
        number.value = slider.value;
        onChange(parseFloat(slider.value));
    });
    number.addEventListener('input', () => {
        slider.value = number.value;
        onChange(parseFloat(number.value));
    });
}

// Link speed control
linkSliderAndNumber('sim-speed', 'sim-speed-val', val => {
    window._simSpeed = val;
});

// Link number of blobs control
linkSliderAndNumber('sim-blobs', 'sim-blobs-val', val => {
    window._simNumBlobs = Math.round(val);

    // Clean up removed blob synths
    if (blobs.length > window._simNumBlobs) {
        for (let i = window._simNumBlobs; i < blobs.length; i++) {
            const b = blobs[i];
            if (b.synth) {
                if (b._playing) {
                    b.synth.triggerRelease && b.synth.triggerRelease();
                    b._playing = false;
                }
                // Fade out gains
                if (b.dryGain) b.dryGain.gain.rampTo(0, 0.3);
                if (b.wetGain) b.wetGain.gain.rampTo(0, 0.3);
                setTimeout(() => {
                    b.synth.volume.value = -Infinity;
                    b.synth.dispose();
                    b.synth = null;
                    if (b.dryGain) b.dryGain.dispose();
                    if (b.wetGain) b.wetGain.dispose();
                    b.dryGain = null;
                    b.wetGain = null;
                }, 350);
            }
        }
    }

    // Recreate blobs array
    const oldLength = blobs.length;
    blobs.length = 0;
    for (let i = 0; i < window._simNumBlobs; i++) {
        const blob = {
            px: 0, py: 0, pz: 0,
            vy: 0,
            mode: "oscillate",
            oscPhase: Math.random() * 2 * Math.PI,
            dx: Math.random() * 2 * Math.PI,
            dy: Math.random() * 2 * Math.PI,
            dz: Math.random() * 2 * Math.PI,
            phase: Math.random() * 2 * Math.PI,
            freq: 0.5 + Math.random(),
            waveform: window._selectedWaveform, // Use selected waveform
            synth: null,
            _playing: false
        };
        blobs.push(blob);

        // Create synth for new blob if audio is started
        if (typeof Tone !== 'undefined' && Tone.context && Tone.context.state === 'running') {
            createBlobSynth(blob);
        }
    }

    // Clean up any remaining synths
    if (window._allBlobSynths) {
        for (const s of window._allBlobSynths) {
            if (!blobs.find(b => b.synth === s)) {
                s.triggerRelease && s.triggerRelease();
                s.volume && (s.volume.value = -Infinity);
                s.dispose && s.dispose();
            }
        }
    }
    window._allBlobSynths = blobs.map(b => b.synth).filter(Boolean);
});

// Link resolution control
linkSliderAndNumber('sim-res', 'sim-res-val', val => {
    window._simResolution = Math.round(val);
});

// Link isolation control
linkSliderAndNumber('sim-iso', 'sim-iso-val', val => {
    if (reverb) {
        reverb.wet.rampTo(val, 0.1);
    }
});

// ===== Audio Mapping Constants =====
// Frequency mapping: x position maps to frequency
const minX = -1.5, maxX = 1.5;
const minFreq = 110, maxFreq = 880; // A2 to A5

// Amplitude mapping: y position maps to volume
const minAmpY = -1.5, maxAmpY = 1.5;

// ===== Marching Cubes Update Function =====
function updateMarchingCubes(t) {
    const resolution = window._simResolution;
    const isolation = window._simIsolation;
    const vertices = [];
    const indices = [];
    let vertCount = 0;
    let minField = Infinity, maxField = -Infinity, sumField = 0, fieldSamples = 0;

    // Physics parameters
    const gravity = -9.8;
    const bounce = 0.8;
    const dt = 1 / 60;
    const sphereRadius = 0.15;
    const floorY = -1.5;
    const minY = floorY + sphereRadius;

    // Update blob positions and physics
    for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        // Update x and z positions
        b.px = Math.sin(t * b.freq + b.dx + b.phase) * 1.2;
        b.pz = Math.sin(t * b.freq + b.dz + b.phase) * 1.2;

        // Handle y position based on mode
        if (b.mode === "oscillate") {
            const oscY = Math.cos(t * b.freq + b.dy + b.phase) * 1.2 + 0.5;
            if (oscY < minY + 0.05) {
                b.mode = "fall";
                b.py = oscY;
                b.vy = -Math.sin(t * b.freq + b.dy + b.phase) * 1.2 * b.freq;
                b.oscPhase = t * b.freq + b.dy + b.phase;
            } else {
                b.py = oscY;
            }
        } else if (b.mode === "fall") {
            // Apply gravity and handle bouncing
            b.vy += gravity * dt;
            b.py += b.vy * dt;
            if (b.py < minY) {
                b.py = minY;
                b.vy = -b.vy * bounce;
                if (Math.abs(b.vy) < 0.5) b.vy += Math.random() * 2;
            }
            if (b.py > minY + 0.05 && Math.abs(b.vy) < 0.2) {
                b.mode = "oscillate";
                b.phase = Math.acos((b.py - 0.5) / 1.2) - t * b.freq - b.dy;
                b.vy = 0;
            }
        }

        // Update synth parameters based on position
        if (b.synth) {
            let freq;
            if (window._simChord && window._simChord !== 'None' && CHORDS[window._simChord]) {
                // Map x position to chord notes
                const chordNotes = CHORDS[window._simChord];
                const normX = (b.px - minX) / (maxX - minX);
                const idx = normX * (chordNotes.length - 1);
                const lowIdx = Math.floor(idx);
                const highIdx = Math.ceil(idx);
                if (lowIdx === highIdx) {
                    freq = chordNotes[lowIdx];
                } else {
                    const frac = idx - lowIdx;
                    freq = chordNotes[lowIdx] * (1 - frac) + chordNotes[highIdx] * frac;
                }
            } else {
                // Linear frequency mapping
                const normX = (b.px - minX) / (maxX - minX);
                freq = minFreq + normX * (maxFreq - minFreq);
            }

            // Map y position to amplitude with smoother curve
            const normY = (b.py - minAmpY) / (maxAmpY - minAmpY);
            const amp = Math.max(0, Math.min(1, Math.pow(normY, 1.5))); // Added power curve for smoother response

            // Update synth parameters with smoothing
            b.synth.set({ frequency: freq });
            b.synth.volume.rampTo(Tone.gainToDb(amp * 0.7), 0.05); // Reduced max amplitude and added smoothing

            // Update delay effect based on floor proximity
            const maxY = 1.5;
            const proximity = Math.max(0, 1 - (b.py - minY) / (maxY - minY));
            if (b.dryGain && b.wetGain) {
                b.dryGain.gain.rampTo(1 - proximity, 0.05);
                b.wetGain.gain.rampTo(proximity * 0.5, 0.05); // Reduced max wet level
            }

            // Start synth if not playing
            if (!b._playing) {
                b.synth.triggerAttack(freq);
                b._playing = true;
            }
        }
    }

    // Generate marching cubes mesh
    for (let i = 0; i < resolution; i++) {
        for (let j = 0; j < resolution; j++) {
            for (let k = 0; k < resolution; k++) {
                const x = (i / (resolution - 1) - 0.5) * size;
                const y = (j / (resolution - 1) - 0.5) * size;
                const z = (k / (resolution - 1) - 0.5) * size;
                const f = fieldValue(x, y, z, t);

                // Collect field statistics
                minField = Math.min(minField, f);
                maxField = Math.max(maxField, f);
                sumField += f;
                fieldSamples++;

                // Add vertices for surface
                if (f > isolation) {
                    vertices.push(x, y, z);
                    if (vertCount > 0) {
                        indices.push(vertCount - 1, vertCount);
                    }
                    vertCount++;
                }
            }
        }
    }

    // Update debug panel
    updateDebugPanel({
        vertCount,
        minField,
        maxField,
        avgField: sumField / fieldSamples
    });

    // Update mesh if vertices exist
    if (vertices.length > 0) {
        const mesh = new pc.Mesh(app.graphicsDevice);
        mesh.setPositions(vertices);
        mesh.setIndices(indices);
        mesh.update();
        const meshInstance = marchingCubesMesh.render.meshInstances[0];
        meshInstance.mesh = mesh;

        // Update debug spheres
        if (window._debugSpheres) {
            window._debugSpheres.forEach(s => s.destroy());
        }
        window._debugSpheres = [];

        // Create debug spheres at blob centers
        for (let i = 0; i < blobs.length; i++) {
            const b = blobs[i];
            const squash = b.py - minY < 0.05 ? 0.6 : 1.0;
            let sphereMaterial;
            if (window._simMaterial === 'plastic') {
                sphereMaterial = createPlasticMaterial();
            } else {
                sphereMaterial = new pc.StandardMaterial();
                sphereMaterial.diffuse = new pc.Color(1, 1, 1);
                sphereMaterial.shininess = 80;
                sphereMaterial.metalness = 0.2;
                sphereMaterial.roughness = 0.2;
                sphereMaterial.useLighting = true;
                sphereMaterial.update();
            }
            const sphere = new pc.Entity();
            sphere.addComponent('render', {
                type: 'sphere',
                material: sphereMaterial,
                castShadows: true,
                receiveShadows: true
            });
            sphere.setLocalScale(0.3, 0.3 * squash, 0.3);
            sphere.setLocalPosition(b.px, b.py, b.pz);
            marchingCubesContainer.addChild(sphere);
            window._debugSpheres.push(sphere);
        }
    }

    // Update synth list
    window._allBlobSynths = blobs.map(b => b.synth).filter(Boolean);
}

// ===== Animation Loop =====
let time = 0;
app.on('update', (dt) => {
    time += dt * window._simSpeed;
    updateMarchingCubes(time);
    marchingCubesContainer.setEulerAngles(0, time * 10, 0);

    // Draw waveform visualization
    if (analyser) {
        const waveform = analyser.getValue();
        ctx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
        
        // Draw center line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.moveTo(0, vizCanvas.height / 2);
        ctx.lineTo(vizCanvas.width, vizCanvas.height / 2);
        ctx.stroke();
        
        // Draw waveform
        ctx.beginPath();
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        
        // Draw waveform
        for (let i = 0; i < waveform.length; i++) {
            const x = (i / waveform.length) * vizCanvas.width;
            const y = ((waveform[i] + 1) / 2) * vizCanvas.height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Add subtle gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, vizCanvas.height);
        gradient.addColorStop(0, 'rgba(0,255,0,0.1)');
        gradient.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.fillStyle = gradient;
        ctx.lineTo(vizCanvas.width, vizCanvas.height);
        ctx.lineTo(0, vizCanvas.height);
        ctx.closePath();
        ctx.fill();
    }
});

// ===== Event Handlers =====
// Handle window resize
window.addEventListener('resize', () => {
    app.resizeCanvas();
});

// Handle start button click
document.getElementById('startButton').addEventListener('click', async () => {
    await setupAudio();
});

// Handle chord selection
document.getElementById('sim-chord').addEventListener('change', e => {
    window._simChord = e.target.value;
});

// Handle material selection
document.getElementById('sim-material').addEventListener('change', e => {
    window._simMaterial = e.target.value;
    applyCurrentMaterial();
});

// Initialize simulation parameters
window._simSpeed = speed;
window._simNumBlobs = numBlobs;
window._simResolution = resolution;
window._simIsolation = isolation;

// Apply current material to all meshes
function applyCurrentMaterial() {
    let material;
    if (window._simMaterial === 'plastic') {
        material = createPlasticMaterial();
    } else {
        material = new pc.StandardMaterial();
        material.diffuse = new pc.Color(1, 1, 1);
        material.shininess = 80;
        material.metalness = 0.2;
        material.roughness = 0.2;
        material.useLighting = true;
        material.update();
    }
    
    // Update marching cubes mesh
    if (marchingCubesMesh && marchingCubesMesh.render) {
        marchingCubesMesh.render.material = material;
    }
    
    // Update debug spheres
    if (window._debugSpheres) {
        for (const sphere of window._debugSpheres) {
            if (sphere.render) {
                sphere.render.material = material;
            }
        }
    }
}

// Initialize filter cutoff frequencies
window._lowpassCutoff = 20000;
window._highpassCutoff = 20;

// Handle keyboard controls for filters
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        window._lowpassCutoff = Math.min(20000, window._lowpassCutoff + 200);
        window._lowpass.frequency.rampTo(window._lowpassCutoff, 0.1);
    } else if (e.key === 'ArrowDown') {
        window._lowpassCutoff = Math.max(200, window._lowpassCutoff - 200);
        window._lowpass.frequency.rampTo(window._lowpassCutoff, 0.1);
    } else if (e.key === 'ArrowRight') {
        window._highpassCutoff = Math.min(5000, window._highpassCutoff + 20);
        window._highpass.frequency.rampTo(window._highpassCutoff, 0.1);
    } else if (e.key === 'ArrowLeft') {
        window._highpassCutoff = Math.max(20, window._highpassCutoff - 20);
        window._highpass.frequency.rampTo(window._highpassCutoff, 0.1);
    }
});