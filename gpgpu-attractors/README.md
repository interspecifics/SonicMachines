# GPGPU Attractors

A GPU-accelerated particle simulation of various attractor systems using Three.js and WebGL. This project demonstrates how to use GPGPU (General-Purpose computing on Graphics Processing Units) techniques to simulate complex dynamical systems efficiently.

## Features

- GPU-accelerated particle simulation
- Multiple attractor types (Lorenz, Rossler, and more)
- Real-time parameter adjustment
- Interactive camera controls
- Particle trail effects
- Performance optimized for large particle counts

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

## Performance Considerations

- The simulation is optimized for GPU computation
- Particle count can be adjusted based on hardware capabilities
- Trail length affects memory usage and performance
- Consider reducing particle count on lower-end devices

## License

MIT License - feel free to use this code for your own projects.

## Acknowledgments

- Three.js community for the excellent WebGL framework
- Original attractor system research and equations 