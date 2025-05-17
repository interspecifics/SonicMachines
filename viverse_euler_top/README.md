# Euler Topology Synth

A sophisticated audio-visual synthesis system that explores the relationship between geometric topology and sound generation through dynamic particle networks. This project implements a real-time 3D particle system that generates both visual and sonic outputs based on the topological relationships between particles.

## Core Concepts

### Euler Topology
The system is based on Euler's topological principles, where particles form dynamic networks that create emergent geometric patterns. These patterns are analyzed in real-time to generate both visual and sonic outputs.

### Particle Network
- Dynamic 3D particle system with up to 1000 particles
- Real-time connection formation based on spatial proximity
- Triangle detection and analysis for topological features
- Adaptive connection density based on system parameters

### Audio Synthesis
- Real-time audio generation based on particle dynamics
- Frequency modulation through particle velocity
- Delay effects mapped to particle connections
- Spatial audio processing based on particle positions

## Technical Implementation

### Particle System
- GPU-accelerated particle calculations using PlayCanvas
- Efficient buffer management for dynamic updates
- Spatial partitioning for optimized connection detection
- Adaptive LOD (Level of Detail) system

### Topology Analysis
- Real-time triangle detection and tracking
- Geometric feature extraction (areas, centers, normals)
- Spatial coherence calculation
- Dynamic topology mapping to audio parameters

#### Triangle Detection Implementation
```javascript
function findTriangles() {
    const triangles = new Set();
    // Only process if we have enough particles
    if (particleCount < 3) return triangles;
    
    // First pass: build connection map
    for (let i = 0; i < particleCount - 1; i++) {
        const connections = new Set();
        for (let j = i + 1; j < particleCount; j++) {
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
    }
    
    // Second pass: find triangles between connected particles
    for (const [i, connections] of particleConnections) {
        const connectedParticles = Array.from(connections);
        for (let j = 0; j < connectedParticles.length - 1; j++) {
            const p2Index = connectedParticles[j];
            const p2Connections = particleConnections.get(p2Index);
            if (!p2Connections) continue;
            
            for (let k = j + 1; k < connectedParticles.length; k++) {
                const p3Index = connectedParticles[k];
                if (!p2Connections.has(p3Index)) continue;
                
                const area = calculateTriangleArea(i, p2Index, p3Index);
                if (isNaN(area) || area < 0.01) continue;
                
                const center = calculateTriangleCenter(i, p2Index, p3Index);
                triangles.add({
                    id: getTriangleId(i, p2Index, p3Index),
                    particles: [i, p2Index, p3Index],
                    center,
                    area,
                    timestamp: Date.now()
                });
            }
        }
    }
    return triangles;
}
```

### Audio Processing
- Web Audio API integration for real-time synthesis
- Velocity-based delay modulation
- Connection density affecting audio parameters
- Spatial audio mapping based on particle positions

#### Vectorial Synthesis Approach
The system implements a vectorial synthesis approach where each particle's movement and connections contribute to a multi-voice synthesis engine. The number of active voices is dynamically managed based on the system's topology and performance capabilities.

```javascript
class VectorialSynthesizer {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.maxVoices = 32; // Maximum number of simultaneous voices
        this.activeVoices = new Map();
        this.voicePool = [];
        
        // Initialize voice pool
        for (let i = 0; i < this.maxVoices; i++) {
            this.voicePool.push({
                oscillator: this.audioContext.createOscillator(),
                gain: this.audioContext.createGain(),
                filter: this.audioContext.createBiquadFilter(),
                isActive: false
            });
        }
    }

    // Map particle properties to voice parameters
    mapParticleToVoice(particle, index) {
        const voice = this.voicePool[index % this.maxVoices];
        if (!voice.isActive) {
            voice.oscillator.connect(voice.filter);
            voice.filter.connect(voice.gain);
            voice.gain.connect(this.audioContext.destination);
            voice.oscillator.start();
            voice.isActive = true;
        }

        // Map particle velocity to frequency
        const speed = Math.sqrt(
            particle.vel.x * particle.vel.x +
            particle.vel.y * particle.vel.y +
            particle.vel.z * particle.vel.z
        );
        const frequency = 220 + speed * 880; // 220Hz to 1100Hz range
        voice.oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

        // Map particle position to filter cutoff
        const cutoff = 1000 + (particle.pos.y + 8) * 1000; // 1000Hz to 17000Hz range
        voice.filter.frequency.setValueAtTime(cutoff, this.audioContext.currentTime);

        // Map connection count to gain
        const gain = 0.1 + (particle.connections / 10) * 0.4; // 0.1 to 0.5 range
        voice.gain.gain.setValueAtTime(gain, this.audioContext.currentTime);
    }

    // Update all active voices based on particle system state
    updateVoices(particles) {
        // Sort particles by connection count for priority
        const sortedParticles = [...particles].sort((a, b) => b.connections - a.connections);
        
        // Update voices for top N particles
        for (let i = 0; i < Math.min(sortedParticles.length, this.maxVoices); i++) {
            this.mapParticleToVoice(sortedParticles[i], i);
        }

        // Mute unused voices
        for (let i = sortedParticles.length; i < this.maxVoices; i++) {
            const voice = this.voicePool[i];
            if (voice.isActive) {
                voice.gain.gain.setValueAtTime(0, this.audioContext.currentTime);
                voice.isActive = false;
            }
        }
    }
}
```

#### Voice Management and Synthesis Parameters
The system manages multiple synthesis parameters that are mapped from the particle system:

1. **Frequency Mapping**:
   - Base frequency: 220Hz
   - Range: 220Hz - 1100Hz
   - Controlled by particle velocity

2. **Filter Modulation**:
   - Cutoff range: 1000Hz - 17000Hz
   - Controlled by particle Y position
   - Resonance: 4-8 based on connection density

3. **Amplitude Control**:
   - Base gain: 0.1
   - Maximum gain: 0.5
   - Modulated by connection count

4. **Voice Allocation**:
   - Maximum voices: 32
   - Priority based on connection count
   - Dynamic voice stealing for new particles

5. **Spatial Distribution**:
   - Stereo panning based on X position
   - Reverb send based on Z position
   - Delay time modulated by particle velocity

```javascript
// Spatial audio processing
function setupSpatialAudio(voice, particle) {
    // Stereo panning
    const pan = (particle.pos.x + 8) / 16; // -8 to 8 mapped to -1 to 1
    voice.panner.setPosition(pan, 0, 0);

    // Reverb send
    const reverbSend = (particle.pos.z + 8) / 16;
    voice.reverbGain.gain.setValueAtTime(reverbSend * 0.3, audioContext.currentTime);

    // Delay time
    const delayTime = 0.1 + Math.sqrt(
        particle.vel.x * particle.vel.x +
        particle.vel.y * particle.vel.y +
        particle.vel.z * particle.vel.z
    ) * 0.4;
    voice.delay.delayTime.setValueAtTime(delayTime, audioContext.currentTime);
}
```

## Features
- Real-time 3D particle network visualization
- Dynamic topology-based audio synthesis
- Interactive parameter control
- Performance-optimized rendering
- WebGL/WebXR ready implementation
- Responsive design for various screen sizes

## Technical Requirements
- Modern browser with WebGL 2.0 support
- Web Audio API support
- Minimum 4GB RAM
- GPU with hardware acceleration

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm start
   ```
3. Open your browser to `http://localhost:3000`

## Project Structure
- `src/` - Main source code
  - `scripts/` - PlayCanvas scripts and components
  - `shaders/` - Custom GLSL shaders
  - `audio/` - Audio processing utilities
- `public/` - Static assets (HTML, CSS)
- `assets/` - 3D models and textures

## Performance Considerations
- Dynamic particle count adjustment
- Adaptive connection density
- Efficient buffer management
- GPU-accelerated calculations

