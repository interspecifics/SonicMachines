# Viverse Marching Cubes

An interactive audio-visual experience that combines dynamic marching cubes visualization with real-time audio synthesis. Built with PlayCanvas and Tone.js, this project creates blend of visual and audio elements that respond to user interaction.

## Features

- **Dynamic Marching Cubes**: Real-time generation of marching cubes mesh with smooth animations
- **Audio Synthesis**: Each blob generates unique sounds using Tone.js
- **Interactive Controls**:
  - Material selection (Plastic/Default)
  - Chord selection with various musical scales
  - Adjustable simulation speed
  - Configurable number of blobs
  - Resolution control
  - Reverb mix adjustment
- **Audio Effects**:
  - Real-time reverb
  - Delay effects
  - Low-pass and high-pass filters (controlled via arrow keys)
- **Visual Feedback**:
  - Real-time waveform visualization
  - Audio level meters
  - Debug information panel

## Controls

### UI Controls
- **Material**: Switch between plastic and default materials
- **Chord**: Select from various musical scales and chord progressions
- **Speed**: Adjust simulation speed (0.1 - 10)
- **Number of Blobs**: Control the number of active blobs (1 - 20)
- **Resolution**: Adjust marching cubes resolution (8 - 64)
- **Reverb Mix**: Control the amount of reverb effect (0 - 1)

### Keyboard Controls
- **Arrow Up**: Increase low-pass filter cutoff
- **Arrow Down**: Decrease low-pass filter cutoff
- **Arrow Right**: Increase high-pass filter cutoff
- **Arrow Left**: Decrease high-pass filter cutoff

## Technical Details

### Dependencies
- PlayCanvas: 3D graphics and rendering
- Tone.js: Audio synthesis and processing

### Audio Features
- Real-time audio synthesis for each blob
- Dynamic frequency mapping based on blob position
- Amplitude modulation based on vertical position
- Delay effects that intensify near the floor
- Master limiter to prevent audio clipping

### Visual Features
- Dynamic marching cubes mesh generation
- Real-time mesh updates
- Debug visualization of blob positions
- Waveform visualization
- Audio level meters

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`
5. Click the "Start" button to initialize audio

## Browser Compatibility

This project uses modern web technologies and is best experienced in:
- Chrome (recommended)
- Firefox
- Safari
- Edge

## Performance Considerations

- Higher resolution settings will impact performance
- More blobs will increase CPU usage
- Audio processing may be affected by system resources

## License

[Add your license information here]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 