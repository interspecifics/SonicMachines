# GPGPU Attractors

A GPU-accelerated particle simulation of various attractor systems using Three.js and WebGL. This project demonstrates how to use GPGPU (General-Purpose computing on Graphics Processing Units) techniques to simulate complex dynamical systems efficiently.

## Features

- GPU-accelerated particle simulation
- Multiple attractor types (Lorenz, Rossler, Thomas, Halvorsen, Dadras, Aizawa)
- Real-time parameter adjustment
- Interactive camera controls
- Particle trail effects
- Performance optimized for large particle counts
- **Advanced audio sonification engine using Tone.js**
    - Per-voice gain structure
    - Master gain and soft limiter to prevent clipping
    - Parallel effects routing (reverb, delay)
    - Real-time waveform visualization
    - Attractor-driven sound mapping (frequency, timbre, panning, effects)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gpgpu-attractors
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm start
# or
yarn start
```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

- Use the UI controls to adjust simulation parameters:
  - Attractor Type: Select different attractor systems
  - σ (sigma): Controls the rate of mixing
  - ρ (rho): Controls the system's behavior
  - β (beta): Controls the dissipation
  - Number of Particles: Adjust the simulation scale
  - Trail Length: Control the particle trail effect

- Camera Controls:
  - Left Mouse Button: Rotate
  - Right Mouse Button: Pan
  - Mouse Wheel: Zoom

- **Audio Controls:**
  - Start/Stop Audio: Use the UI buttons to enable or disable sonification
  - Real-time waveform visualization is shown in the lower left

## Technical Details

The simulation uses a GPGPU approach with the following components:

1. Position Update Shader: Updates particle positions based on velocities
2. Velocity Update Shader: Calculates new velocities based on attractor equations
3. Render Shader: Visualizes particles with trails and color effects

The implementation uses:
- Three.js for WebGL rendering
- Data textures for particle state storage
- Render targets for GPGPU computation
- Shader-based particle updates
- **Tone.js for real-time audio synthesis and effects**

### Audio Engine Implementation (as of current version)
- Each synth/voice has its own gain node for amplitude control
- All voices and effects are routed through a master gain node
- A master limiter (Tone.Volume) prevents digital clipping
- Effects (reverb, delay) are routed in parallel and then summed at the master gain
- Analyzer node provides real-time waveform visualization
- Attractor features (spread, symmetry, density, etc.) are mapped to sound parameters (frequency, filter, modulation index, gain, panning, effects)
- All parameter changes use `.rampTo()` for smooth transitions

### Audio Processing Steps Under Test / Planned
- **Parameter scaling and smoothing:**
    - Use `Math.tanh` and exponential scaling to keep all mapped parameters in musically useful ranges
    - Avoid direct `.value` assignments for fast-changing parameters
- **Effects management:**
    - Clamp reverb and delay parameters to safe, non-destructive ranges
    - Ensure all effect transitions are smooth
- **Output monitoring:**
    - Use `Tone.Meter` to monitor output level and auto-adjust master gain if needed
- **Voice management:**
    - Detune and pan voices to avoid phase collapse and create a wide stereo image
    - Limit the number of simultaneous voices for clarity
- **Sample rate consistency:**
    - Ensure all audio is generated or resampled at 44.1kHz or 48kHz

## Performance Considerations

- The simulation is optimized for GPU computation
- Particle count can be adjusted based on hardware capabilities
- Trail length affects memory usage and performance
- Consider reducing particle count on lower-end devices
- **Audio engine is designed for stability and clarity, but further tuning may be required for extreme attractor settings**

## License


## Acknowledgments

- Three.js community for the excellent WebGL framework
- Tone.js for real-time audio synthesis
- Original attractor system research and equations 