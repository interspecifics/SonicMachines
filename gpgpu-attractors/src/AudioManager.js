import * as Tone from 'tone';

export class AudioManager {
    constructor() {
        this.initialized = false;
        this.attractorType = 0; // default
        this.isTransitioning = false;
        
        // Add root note and octave properties
        this.rootNote = 'C';
        this.octave = 4;
        
        // Note to frequency mapping
        this.noteFrequencies = {
            'C': 261.63,  // C4
            'C#': 277.18,
            'D': 293.66,
            'D#': 311.13,
            'E': 329.63,
            'F': 349.23,
            'F#': 369.99,
            'G': 392.00,
            'G#': 415.30,
            'A': 440.00,
            'A#': 466.16,
            'B': 493.88
        };
        
        // Simplified stability parameters
        this.stabilityParams = {
            smoothingFactor: 0.8,    // Less smoothing for more direct response
            minFrequency: 30,        // Higher minimum for cleaner sound
            maxFrequency: 1000,      // Lower maximum to prevent harshness
            minFilterFreq: 200,      // Higher minimum for cleaner sound
            maxFilterFreq: 2000,     // Lower maximum to prevent harshness
            minGain: 0.1,            // Higher minimum for better presence
            maxGain: 0.25,           // Lower maximum to prevent distortion
            transitionTime: 0.3      // Faster transitions
        };
        
        // Initialize analyzer first for waveform visualization
        this.analyzer = new Tone.Analyser('waveform', 256);
        this.setupAudio();
        this.setupWaveformVisualizer();
    }

    setupWaveformVisualizer() {
        // Create canvas for waveform visualization
        this.waveformCanvas = document.createElement('canvas');
        this.waveformCanvas.style.position = 'fixed';
        this.waveformCanvas.style.left = '20px';
        this.waveformCanvas.style.bottom = '170px';
        this.waveformCanvas.style.width = '300px';
        this.waveformCanvas.style.height = '60px';
        this.waveformCanvas.style.borderRadius = '5px';
        this.waveformCanvas.style.zIndex = '1000';
        document.body.appendChild(this.waveformCanvas);

        // Set canvas size to match terminal width exactly
        this.waveformCanvas.width = 300;
        this.waveformCanvas.height = 60;
    }

    animateWaveform() {
        if (!this.initialized) return;

        const ctx = this.waveformCanvas.getContext('2d');
        const waveform = this.analyzer.getValue();
        
        // Clear canvas with transparency
        ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
        
        // Draw waveform
        ctx.beginPath();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        const middle = height / 2;
        
        for (let i = 0; i < waveform.length; i++) {
            const x = (i / waveform.length) * width;
            const y = middle + (waveform[i] * middle);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Continue animation
        requestAnimationFrame(() => this.animateWaveform());
    }

    async setupAudio() {
        try {
            // Create two voices instead of three for simpler, clearer sound
            this.voices = [];
            const baseFreq = this.noteFrequencies[this.rootNote] * Math.pow(2, this.octave - 4);
            const fifthFreq = baseFreq * 1.5; // Perfect fifth interval
            const baseFreqs = [baseFreq, fifthFreq];
            const types = ['sine', 'sine']; // Both sine waves for cleaner sound
            
            // === Add master gain and limiter ===
            this.masterGain = new Tone.Gain(0.8);
            this.masterLimiter = new Tone.Volume(-6).toDestination();
            this.masterGain.connect(this.masterLimiter);

            for (let i = 0; i < 2; i++) {
                const voice = {
                    osc: new Tone.FMOscillator({
                        frequency: baseFreqs[i],
                        type: types[i],
                        modulationType: 'sine',
                        modulationIndex: 1 + (i * 0.5),
                        harmonicity: 0.3
                    }),
                    filter: new Tone.Filter({
                        type: 'lowpass',
                        frequency: 800 + (i * 400),
                        Q: 0.5
                    }),
                    gain: new Tone.Gain(0.15),
                    panner: new Tone.Panner(0)
                };
                
                voice.osc.connect(voice.filter);
                voice.filter.connect(voice.panner);
                voice.panner.connect(voice.gain);
                // Route each voice gain to master gain
                voice.gain.connect(this.masterGain);
                this.voices.push(voice);
            }

            // === Add noise-modulated voice for Thomas attractor ===
            this.noise = new Tone.Noise('white');
            this.noiseFilter = new Tone.Filter({
                type: 'bandpass',
                frequency: 1200,
                Q: 1.2
            });
            this.noiseGain = new Tone.Gain(0); // Start silent
            this.noise.connect(this.noiseFilter);
            this.noiseFilter.connect(this.noiseGain);
            // Route noise gain to master gain
            this.noiseGain.connect(this.masterGain);

            // Simplified effects chain
            this.reverb = new Tone.Reverb({
                decay: 4,
                wet: 0.2,
                preDelay: 0.1
            });

            this.delay = new Tone.FeedbackDelay({
                delayTime: 0.2,
                feedback: 0.2
            });

            // Connect all voices to effects (parallel)
            this.voices.forEach(voice => {
                voice.gain.connect(this.delay);
                voice.gain.connect(this.reverb);
            });
            // Connect noise to effects
            this.noiseGain.connect(this.delay);
            this.noiseGain.connect(this.reverb);

            // Connect effects to master gain
            this.delay.connect(this.masterGain);
            this.reverb.connect(this.masterGain);

            // Connect analyzer to the first voice for visualization
            this.voices[0].gain.connect(this.analyzer);

            console.log('Simplified drone synth setup complete (with master gain and limiter)');
        } catch (error) {
            console.error('Error setting up simplified drone synth:', error);
            throw error;
        }
    }

    updateFromAttractor(particleData) {
        if (!this.initialized) return;
        try {
            const avgPos = {
                x: particleData.avgPosX || 0,
                y: particleData.avgPosY || 0,
                z: particleData.avgPosZ || 0
            };
            const avgVel = {
                x: particleData.avgVelX || 0,
                y: particleData.avgVelY || 0,
                z: particleData.avgVelZ || 0
            };

            // Calculate movement metrics with enhanced sensitivity
            const speed = Math.sqrt(
                avgVel.x * avgVel.x + 
                avgVel.y * avgVel.y + 
                avgVel.z * avgVel.z
            ) * 1.5;

            const spread = Math.sqrt(
                avgPos.x * avgPos.x + 
                avgPos.y * avgPos.y + 
                avgPos.z * avgPos.z
            ) * 1.2;

            // Get current attractor type and scaling
            const attractorType = ['lorenz', 'rossler', 'thomas', 'halvorsen', 'dadras', 'aizawa'][this.attractorType];
            const scaling = this.getAttractorScaling(attractorType);

            // Calculate base frequency from root note and octave
            const baseFreq = this.noteFrequencies[this.rootNote] * Math.pow(2, this.octave - 4);
            const fifthFreq = baseFreq * 1.5; // Perfect fifth interval

            // === Ensure noise is stopped for non-Thomas attractors ===
            if (attractorType !== 'thomas' && this.noise) {
                if (this.noise.state === 'started') {
                    this.noise.stop();
                }
                if (this.noiseGain) {
                    this.noiseGain.gain.rampTo(0, 0.2);
                }
            }

            // Special handling for Thomas attractor
            if (attractorType === 'thomas') {
                // Calculate additional metrics specific to Thomas patterns
                const symmetry = Math.abs(avgPos.x + avgPos.y + avgPos.z) / 3;
                const density = Math.abs(avgVel.x * avgVel.y * avgVel.z);
                const rotation = Math.atan2(avgPos.y, avgPos.x);
                
                // New metrics for dispersion
                const dispersion = Math.sqrt(
                    Math.pow(avgPos.x - avgPos.y, 2) + 
                    Math.pow(avgPos.y - avgPos.z, 2) + 
                    Math.pow(avgPos.z - avgPos.x, 2)
                );
                const centralDeviation = Math.abs(avgPos.x) + Math.abs(avgPos.y) + Math.abs(avgPos.z);

                // === Noise voice modulation ===
                const noiseActivity = Math.min(1, (dispersion * 1.5) + (centralDeviation * 0.5));
                this.noiseGain.gain.rampTo(noiseActivity * 0.18, this.stabilityParams.transitionTime);
                // Scale noise filter frequency based on root note
                const noiseFreq = baseFreq * 4 + dispersion * baseFreq * 8;
                this.noiseFilter.frequency.rampTo(noiseFreq, this.stabilityParams.transitionTime);
                
                if (this.noise && this.noise.state !== 'started') {
                    this.noise.start();
                }

                this.voices.forEach((voice, i) => {
                    // Use root note-based frequencies
                    const voiceBaseFreq = i === 0 ? baseFreq : fifthFreq;
                    const dispersionFactor = Math.pow(dispersion, 1.5);
                    const centralFactor = Math.pow(centralDeviation, 2);
                    
                    // Scale frequency modulation based on root note
                    const freqMod = this.clamp(
                        voiceBaseFreq * (
                            1 + 
                            (symmetry * 0.8) + 
                            (density * 0.4) +
                            (dispersionFactor * 1.2) +
                            (centralFactor * 0.8) +
                            (Math.sin(rotation * 2) * 0.3)
                        ),
                        this.stabilityParams.minFrequency,
                        this.stabilityParams.maxFrequency
                    );
                    voice.osc.frequency.rampTo(freqMod, this.stabilityParams.transitionTime);

                    // Scale filter frequency based on root note
                    const filterFreq = this.clamp(
                        baseFreq * 3 + (i * baseFreq) + 
                        (spread * baseFreq * 4) + 
                        (Math.abs(rotation) * baseFreq * 2) +
                        (dispersionFactor * baseFreq * 3) +
                        (centralFactor * baseFreq * 1.5),
                        this.stabilityParams.minFilterFreq,
                        this.stabilityParams.maxFilterFreq
                    );
                    voice.filter.frequency.rampTo(filterFreq, this.stabilityParams.transitionTime);

                    // Rest of the Thomas attractor modulation remains the same
                    const modIndex = this.clamp(
                        1 + (i * 0.5) + 
                        (density * 2) + 
                        (speed * 0.5) +
                        (dispersionFactor * 1.5) +
                        (centralFactor * 0.8),
                        0.1,
                        5
                    );
                    voice.osc.modulationIndex.rampTo(modIndex, this.stabilityParams.transitionTime);

                    const gainValue = this.clamp(
                        0.15 + 
                        (symmetry * 0.2) + 
                        (spread * 0.1) +
                        (dispersionFactor * 0.15) +
                        (centralFactor * 0.1),
                        this.stabilityParams.minGain,
                        this.stabilityParams.maxGain
                    );
                    voice.gain.gain.rampTo(gainValue, this.stabilityParams.transitionTime);

                    const panValue = this.clamp(
                        Math.sin(rotation) * 0.7 + 
                        (dispersionFactor * 0.3) * Math.sin(rotation * 2),
                        -0.5,
                        0.5
                    );
                    voice.panner.pan.rampTo(panValue, this.stabilityParams.transitionTime);
                });

                // Effects remain the same
                const reverbWet = this.clamp(
                    0.2 + 
                    (symmetry * 0.3) + 
                    (density * 0.2) +
                    (dispersionFactor * 0.2),
                    0.1,
                    0.6
                );
                this.reverb.wet.rampTo(reverbWet, this.stabilityParams.transitionTime);

                const delayFeedback = this.clamp(
                    0.2 + 
                    (density * 0.3) + 
                    (spread * 0.2) +
                    (dispersionFactor * 0.15),
                    0.1,
                    0.5
                );
                this.delay.feedback.rampTo(delayFeedback, this.stabilityParams.transitionTime);

                const delayTime = this.clamp(
                    0.2 + 
                    (Math.abs(rotation) * 0.3) +
                    (dispersionFactor * 0.2),
                    0.1,
                    0.5
                );
                this.delay.delayTime.rampTo(delayTime, this.stabilityParams.transitionTime);

            } else {
                // Original mapping for other attractors, now scaled by root note
                this.voices.forEach((voice, i) => {
                    // Use root note-based frequencies
                    const voiceBaseFreq = i === 0 ? baseFreq : fifthFreq;
                    
                    // Scale frequency modulation based on root note
                    const freqMod = this.clamp(
                        voiceBaseFreq * (1 + (speed * 0.4 * scaling.speedScale) + (Math.abs(avgPos.z) * 0.2)),
                        this.stabilityParams.minFrequency,
                        this.stabilityParams.maxFrequency
                    );
                    voice.osc.frequency.rampTo(freqMod, this.stabilityParams.transitionTime);

                    // Scale filter frequency based on root note
                    const filterFreq = this.clamp(
                        baseFreq * 3 + (i * baseFreq) + 
                        (spread * baseFreq * 2 * scaling.spreadScale) + 
                        (Math.abs(avgPos.y) * baseFreq),
                        this.stabilityParams.minFilterFreq,
                        this.stabilityParams.maxFilterFreq
                    );
                    voice.filter.frequency.rampTo(filterFreq, this.stabilityParams.transitionTime);

                    // Rest of the modulation remains the same
                    const modIndex = this.clamp(
                        1 + (i * 0.5) + (Math.abs(avgPos.x) * scaling.modScale) + (speed * 0.3),
                        this.stabilityParams.minModIndex || 0.1,
                        this.stabilityParams.maxModIndex || 5
                    );
                    voice.osc.modulationIndex.rampTo(modIndex, this.stabilityParams.transitionTime);

                    const gainValue = this.clamp(
                        0.15 + (Math.abs(avgPos.y) * 0.15 * scaling.gainScale) + (speed * 0.1),
                        this.stabilityParams.minGain,
                        this.stabilityParams.maxGain
                    );
                    voice.gain.gain.rampTo(gainValue, this.stabilityParams.transitionTime);

                    const panValue = this.clamp(avgPos.x * 0.7, -0.5, 0.5);
                    voice.panner.pan.rampTo(panValue, this.stabilityParams.transitionTime);
                });

                // Effects remain the same
                const reverbWet = this.clamp(
                    0.2 + (speed * 0.15 * scaling.speedScale) + (spread * 0.1),
                    0.1,
                    0.4
                );
                this.reverb.wet.rampTo(reverbWet, this.stabilityParams.transitionTime);

                const delayFeedback = this.clamp(
                    0.2 + (spread * 0.15 * scaling.spreadScale) + (speed * 0.1),
                    0.1,
                    0.4
                );
                this.delay.feedback.rampTo(delayFeedback, this.stabilityParams.transitionTime);
            }

        } catch (error) {
            console.warn('Error updating simplified drone synth parameters:', error);
        }
    }

    async start() {
        if (!this.initialized && !this.isTransitioning) {
            try {
                await Tone.start();
                
                // Start all voices
                this.voices.forEach(voice => {
                    voice.osc.start();
                    voice.gain.gain.value = 0;
                    voice.gain.gain.rampTo(0.15, 1);
                });
                
                this.initialized = true;
                console.log('Simplified drone synth started');
                
                this.animateWaveform();
            } catch (error) {
                console.error('Failed to start simplified drone synth:', error);
                throw error;
            }
        }
    }

    async fadeOut(duration = 2) {
        if (!this.initialized) return;
        
        this.isTransitioning = true;
        
        // Fade out all voices
        const fadePromises = this.voices.map(voice => {
            return new Promise(resolve => {
                voice.gain.gain.rampTo(0, duration);
                setTimeout(resolve, duration * 1000);
            });
        });

        // Fade out effects
        this.reverb.wet.rampTo(0, duration);
        this.delay.feedback.rampTo(0, duration);

        // Wait for fade out to complete
        await Promise.all(fadePromises);
        
        // Stop all oscillators
        this.voices.forEach(voice => {
            voice.osc.stop();
        });
        
        this.initialized = false;
        this.isTransitioning = false;
    }

    async resetAndStart() {
        // Stop current sound if playing
        if (this.initialized) {
            await this.fadeOut(1);
        }

        // Reset all parameters to initial values
        this.voices.forEach((voice, i) => {
            const baseFreq = [55, 82.5][i];
            voice.osc.frequency.value = baseFreq;
            voice.filter.frequency.value = 800 + (i * 400);
            voice.gain.gain.value = 0.15;
            voice.osc.modulationIndex.value = 1 + (i * 0.5);
            voice.panner.pan.value = 0;
        });

        // Reset effects
        this.reverb.wet.value = 0.2;
        this.delay.feedback.value = 0.2;

        // Start everything again
        await this.start();
    }

    getAttractorScaling(type) {
        const scaling = {
            default: {
                speedScale: 1.0,
                spreadScale: 1.0,
                gainScale: 1.0,
                modScale: 1.0
            },
            thomas: {
                speedScale: 1.8,    // Increased for more dynamic frequency changes
                spreadScale: 2.0,   // Increased for more filter movement
                gainScale: 1.5,     // Increased for more volume variation
                modScale: 2.0       // Increased for more timbre changes
            },
            halvorsen: {
                speedScale: 1.2,    // Increased for more dynamic frequency changes
                spreadScale: 1.5,   // Increased for more filter movement
                gainScale: 1.3,     // Increased for more volume variation
                modScale: 1.4       // Increased for more timbre changes
            },
            dadras: {
                speedScale: 1.1,    // Slightly increased
                spreadScale: 1.3,   // Increased for more filter movement
                gainScale: 1.2,     // Increased for more volume variation
                modScale: 1.3       // Increased for more timbre changes
            }
        };
        return scaling[type] || scaling.default;
    }

    // Add method to set attractor type
    setAttractorType(type) {
        this.attractorType = type;
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Camera distance modulation: call this from your camera update/render loop
    setCameraDistance(distance) {
        // Clamp and normalize distance (adjust min/max as needed for your scene)
        const minDist = 5;
        const maxDist = 80;
        const norm = Math.max(0, Math.min(1, (distance - minDist) / (maxDist - minDist)));

        // Map to reverb wetness (0.1 = dry, 0.6 = very wet)
        const reverbWet = 0.1 + norm * 0.5;
        this.reverb.wet.rampTo(reverbWet, 0.3);

        // Map to filter cutoff (2000 Hz = close/bright, 400 Hz = far/dark)
        const minCutoff = 400;
        const maxCutoff = 2000;
        const cutoff = maxCutoff - norm * (maxCutoff - minCutoff);
        this.voices.forEach(voice => {
            voice.filter.frequency.rampTo(cutoff, 0.3);
        });
        // Also apply to noise filter if present
        if (this.noiseFilter) {
            this.noiseFilter.frequency.rampTo(cutoff, 0.3);
        }
    }

    // Camera azimuth modulation: call this from your camera update/render loop
    setCameraAzimuth(angleRadians) {
        // Map angle to panning: -π → -0.5, 0 → 0, π → +0.5
        const pan = Math.max(-0.5, Math.min(0.5, Math.sin(angleRadians) * 0.5));
        this.voices.forEach(voice => {
            voice.panner.pan.rampTo(pan, 0.3);
        });
        // Optionally, pan noise as well
        if (this.noiseGain && this.noiseFilter && this.noiseFilter.pan) {
            this.noiseFilter.pan.rampTo(pan, 0.3);
        }
    }

    // Camera elevation modulation: call this from your camera update/render loop
    setCameraElevation(elevationRadians) {
        // Normalize elevation: -π/2 (down) to +π/2 (up) → 0 to 1
        const norm = Math.max(0, Math.min(1, (elevationRadians + Math.PI / 2) / Math.PI));
        // Map to modulationIndex and harmonicity
        const modIndex = 0.5 + norm * (5 - 0.5); // 0.5 to 5
        const harmonicity = 0.2 + norm * (2 - 0.2); // 0.2 to 2
        this.voices.forEach(voice => {
            voice.osc.modulationIndex.rampTo(modIndex, 0.3);
            voice.osc.harmonicity.rampTo(harmonicity, 0.3);
        });
    }

    // Camera movement speed modulation: call this from your camera update/render loop
    setCameraMovementSpeed(speed) {
        // Clamp and normalize speed (adjust min/max as needed for your scene)
        const minSpeed = 0;
        const maxSpeed = 10;
        const norm = Math.max(0, Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed)));

        // Map to delay feedback (0.1 = stable, 0.5 = chaotic)
        const feedback = 0.1 + norm * 0.4;
        this.delay.feedback.rampTo(feedback, 0.2);

        // Optionally, map to LFO rate if LFO exists
        if (this.lfo) {
            const lfoRate = 0.05 + norm * (2 - 0.05); // 0.05 to 2 Hz
            this.lfo.frequency.rampTo(lfoRate, 0.2);
        }
    }

    // Add method to set root note and octave
    setRootNoteAndOctave(note, octave) {
        this.rootNote = note;
        this.octave = octave;
        
        if (this.initialized) {
            // Calculate new base frequencies
            const baseFreq = this.noteFrequencies[note] * Math.pow(2, octave - 4);
            const fifthFreq = baseFreq * 1.5; // Perfect fifth interval
            
            // Update voice frequencies
            this.voices.forEach((voice, i) => {
                const newFreq = i === 0 ? baseFreq : fifthFreq;
                voice.osc.frequency.rampTo(newFreq, 0.3);
            });
        }
    }
} 