# GPGPU Attractors with Sonic Sonification

A real-time visualization and sonification of strange attractors using WebGL GPGPU techniques and Web Audio API. This project combines mathematical chaos with musical expression through a sophisticated audio synthesis system.

## Features

- Real-time GPGPU-based particle simulation
- Multiple attractor types (Lorenz, Thomas, Halvorsen, Dadras)
- Interactive parameter controls
- Musical sonification with root note and octave control
- Camera-based audio modulation
- Waveform visualization

## Technical Overview

### Visualization
- Uses WebGL GPGPU techniques for efficient particle simulation
- Real-time particle position and velocity updates
- Smooth particle rendering with additive blending
- Interactive camera controls

### Sonification System

The audio system is built around a drone synth architecture that maps attractor behavior to musical parameters. Here's a detailed breakdown:

#### 1. Core Synthesis
- Two FM (Frequency Modulation) oscillators tuned to a perfect fifth interval
- Base frequency determined by root note and octave selection
- Sine wave oscillators for clean, pure tones
- Modulation index and harmonicity for timbre control

#### 2. Per-Voice Processing
Each voice (oscillator) goes through:
```
FM Oscillator → Filter → Panner → Gain → Master Chain
```
- **FM Oscillator**: 
  - Frequency modulated by particle behavior
  - Modulation index affects timbre richness
  - Harmonicity set to 0.3 for subtle overtones

- **Filter**:
  - Lowpass filter with gentle resonance
  - Frequency modulated by particle spread and position
  - Q factor of 0.5 for smooth filtering

- **Panner**:
  - Stereo positioning based on particle movement
  - Range: -0.5 (left) to 0.5 (right)
  - Creates spatial movement in the sound

- **Gain**:
  - Individual volume control per voice
  - Modulated by particle behavior
  - Base level of 0.15 with dynamic modulation

#### 3. Special Thomas Attractor Voice
- Additional noise-based voice for the Thomas attractor
- White noise → Bandpass filter → Gain chain
- Filter frequency scaled by root note
- Activity level based on particle dispersion

#### 4. Effects Processing
Parallel effects chain:
```
Voice Outputs → Delay → Master Gain
             → Reverb → Master Gain
```
- **Delay**:
  - Feedback delay with dynamic timing
  - Time and feedback modulated by particle movement
  - Range: 0.1-0.5s delay time

- **Reverb**:
  - 4-second decay for spacious sound
  - Wet level modulated by particle behavior
  - Pre-delay of 0.1s for clarity

#### 5. Master Processing
```
Effects → Master Gain → Limiter → Output
```
- Master gain at 0.8 for optimal level
- Limiter at -6dB for protection

#### 6. Parameter Mapping

The system maps various attractor behaviors to audio parameters:

- **Frequency Modulation**:
  - Base frequency from root note and octave
  - Modulated by particle speed and position
  - Attractor-specific scaling factors

- **Filter Modulation**:
  - Frequency scaled by root note
  - Modulated by particle spread and position
  - Enhanced by rotation and dispersion

- **Gain Modulation**:
  - Base level of 0.15
  - Modulated by particle symmetry and spread
  - Enhanced by dispersion for Thomas attractor

- **Panning Modulation**:
  - Based on particle rotation
  - Enhanced by dispersion for Thomas attractor

#### 7. Camera Interaction
The audio system responds to camera movement:
- Distance affects reverb wetness and filter cutoff
- Azimuth (horizontal rotation) affects panning
- Elevation affects modulation index and harmonicity
- Movement speed affects delay feedback

#### 8. Stability Parameters
The system maintains stability through:
```javascript
{
    smoothingFactor: 0.8,    // Smooth parameter changes
    minFrequency: 30,        // Prevent too low frequencies
    maxFrequency: 1000,      // Prevent too high frequencies
    minFilterFreq: 200,      // Minimum filter cutoff
    maxFilterFreq: 2000,     // Maximum filter cutoff
    minGain: 0.1,           // Minimum volume
    maxGain: 0.25,          // Maximum volume
    transitionTime: 0.3     // Smooth parameter transitions
}
```

## Usage

1. Select an attractor type from the dropdown
2. Adjust the attractor parameters (σ, ρ, β)
3. Set the root note and octave for the sonification
4. Use the camera controls to explore the visualization
5. The audio will respond to both parameter changes and camera movement

## Controls

- **Attractor Type**: Select different attractor systems
- **σ (sigma)**: Controls the rate of particle movement
- **ρ (rho)**: Controls the system's energy level
- **β (beta)**: Controls the system's dissipation
- **Root Note**: Sets the base frequency for the sonification
- **Octave**: Adjusts the frequency range
- **Reset**: Returns to default parameters

## Technical Requirements

- WebGL 2.0 support
- Web Audio API support
- Modern web browser

## Credits

Interspecifics

