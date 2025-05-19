# SonicMachines

SonicMachines is a collection of generative audiovisual systems developed by Interspecifics. These "machines" explore the poetic potential of mathematics, physics, and topology through real-time simulations, where dynamical systems become sources for sonic and visual material. They are not instruments in the traditional sense but procedural worlds—autonomous entities unfolding complexity over time through feedback, recursion, and geometric transformations.

This project investigates how abstract mathematical systems—such as attractors, particles to networks, or scalar fields—can be rendered into experience through sound and visualization. Each Sonic Machine becomes a microcosm of motion, pattern, and rhythm that evolves continuously, suggesting an alternative approach to musical composition and computational aesthetics.

SonicMachines suggests that pure mathematics and physical systems are performative—they can behave, evolve, express. Rather than interpreting natural data, this project generates its own data-universes. These systems are both instruments and compositions, sculptures and behaviors, offering a speculative encounter with computation as a living form.

⸻

## What the Machines Share

All SonicMachines are:
- Based on continuous dynamical systems — mathematical models that evolve over time according to differential equations.
- Sound-reactive or sonification-driven — using mathematical variables as modulation sources for sound synthesis or spatialization.
- GPU-accelerated visual systems — employing shaders and simulations to render emergent complexity visually.
- Highly procedural — relying on real-time calculation of trajectories, fields, or motion rather than precomposed structures.
- Inspired by topology and physics — where rotation, flow, turbulence, or density maps become generative parameters.
- Immersive and audiovisual — designed to create a strong audiovisual presence suitable for performance, installation, or meditative interaction.

⸻

## Modules

### Attractor Generator/

![Attractor Generator](https://github.com/interspecifics/SonicMachines/blob/main/attractor_s.png)

This module simulates various strange attractors using GPU acceleration. These systems exhibit chaotic but structured behaviors, such as those seen in Lorenz or Rössler systems. The particle movements create mesmerizing visuals that are mapped to sound synthesis or modulation parameters. You can think of it as a chaos-driven audiovisual oscillator.
- Key concepts: Nonlinear dynamics, particle systems, strange attractors, GPGPU shaders.
- Output: Audio-reactive flowfields and generative motion landscapes.

### Euler Topology Synth/

![Euler Topology Synth](https://github.com/interspecifics/SonicMachines/blob/main/euler_s.png)

Inspired by the rigid-body mechanics of generated network, this module simulates spinning body dynamics and projects their motion into spatial trajectories that control sound and visuals. The feedback between rotational vectors and oscillation patterns creates a geometric choreography of forces.
- Key concepts: Classical mechanics, angular momentum, quaternions, rotation, precession.
- Output: Rhythmic and rotating audiovisual systems with feedback-controlled behavior.

### Physical Oscillators/

![Physical Oscillators](https://github.com/interspecifics/SonicMachines/blob/main/oscillator_s.png)

This module implements the marching cubes algorithm to extract isosurfaces from 3D scalar fields. The resulting forms resemble living structures but emerge from mathematical fields rather than biology. The surfaces can be deformed in real-time and used to control sound textures or ambisonic space.
- Key concepts: Volumetric data, topology, isosurface extraction, 3D spatial mappings.
- Output: Shifting digital sculptures with sonic mappings based on field topology.



⸻

## Technologies Used
- JavaScript — Core environment for the interactive simulations.
- GLSL — Used for custom shaders and GPU-accelerated computation.
- WebGL — For real-time 3D rendering.
- Three.js — Library for visualizing complex geometric systems in-browser.
- Tone.js / WebAudio — Sound synthesis and modulation (if applicable to module).

