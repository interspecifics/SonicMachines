import * as Tone from 'tone';

export class AudioManager {
    constructor() {
        this.audioStarted = false;
        this.lastRootChange = 0;
        this.rootMidi = 60; // Default to Middle C
        this.rootNote = 'C4'; // Default root note as string
        this.contextStarted = false;
        this.scale = 'Major';
        this.microtuning = '12-TET';
        this.networkRootModulation = false;
        this.networkRootInterval = null;
        this.glideTime = 2.0; // seconds for frequency glide
        this.setupSynths();
    }

    async start() {
        if (this.audioStarted) return;
        
        try {
            // Start Tone.js context
            await Tone.start();
            console.log('Tone.context.state:', Tone.context.state);
            
            // Only proceed if context is running
            if (Tone.context.state === 'running') {
                this.contextStarted = true;
                
                // Start the drone
                this.fmSynth.triggerAttack(this.rootNote);
                this.amSynth.triggerAttack(this.rootNote);
                this.membraneSynth.triggerAttack(this.rootNote);
                this.duoSynth.triggerAttack(this.rootNote);
                
                // Start modulation effects
                this.chorus.start();
                this.autoFilter.start();
                
                // Fade in master gain to -16 dB (linear ~0.16) over 1.5 seconds
                this.masterGain.gain.cancelAndHoldAtTime();
                this.masterGain.gain.setValueAtTime(0, Tone.now());
                this.masterGain.gain.linearRampToValueAtTime(0.16, Tone.now() + 1.5);
                
                this.audioStarted = true;
                console.log('Audio system started successfully');
            } else {
                console.warn('AudioContext not running, waiting for user interaction');
                throw new Error('AudioContext not running');
            }
        } catch (error) {
            console.error('Failed to start audio:', error);
            this.audioStarted = false;
            this.contextStarted = false;
            throw error;
        }
    }

    stop() {
        if (!this.audioStarted) return;
        
        try {
            // Stop all synths
            this.fmSynth.triggerRelease();
            this.amSynth.triggerRelease();
            this.membraneSynth.triggerRelease();
            this.duoSynth.triggerRelease();
            
            // Stop modulation effects
            this.chorus.stop();
            this.autoFilter.stop();
            
            this.audioStarted = false;
            this.contextStarted = false;
            console.log('Audio system stopped');
        } catch (error) {
            console.error('Error stopping audio:', error);
            throw error;
        }
    }

    setupSynths() {
        // Four synths for vectorial synthesis
        this.fmSynth = new Tone.FMSynth({
            harmonicity: 3.01,
            modulationIndex: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.5, decay: 0.2, sustain: 0.5, release: 1 },
            modulation: { type: "square" },
            modulationEnvelope: { attack: 0.5, decay: 0.2, sustain: 0.5, release: 1 }
        });
        this.amSynth = new Tone.AMSynth({
            harmonicity: 2.5,
            oscillator: { type: "triangle" },
            envelope: { attack: 0.8, decay: 0.3, sustain: 0.6, release: 1.2 },
            modulation: { type: "sine" },
            modulationEnvelope: { attack: 0.7, decay: 0.2, sustain: 0.5, release: 1 }
        });
        this.membraneSynth = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 4,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.5, sustain: 0.1, release: 1.4 }
        });
        this.duoSynth = new Tone.DuoSynth({
            harmonicity: 1.5,
            voice0: { oscillator: { type: "sawtooth" }, envelope: { attack: 0.2, release: 1 } },
            voice1: { oscillator: { type: "triangle" }, envelope: { attack: 0.2, release: 1 } },
            vibratoAmount: 0.5,
            vibratoRate: 0.03 // ultra slow vibrato
        });

        // Effects chain
        this.reverb = new Tone.Reverb({ decay: 6, wet: 0.5 });
        this.delay = new Tone.FeedbackDelay("8n", 0.4);
        this.chorus = new Tone.Chorus({ frequency: 0.03, delayTime: 8, depth: 0.4 }); // ultra slow
        this.phaser = new Tone.Phaser({ frequency: 0.02, octaves: 3, baseFrequency: 400 }); // ultra slow
        this.autoFilter = new Tone.AutoFilter({ frequency: 0.01 }); // ultra slow
        this.analyser = new Tone.Analyser('waveform', 256);
        this.masterGain = new Tone.Gain(0); // Start silent
        this.masterGain.toDestination();

        // Connect all synths to the same effect/master chain
        [this.fmSynth, this.amSynth, this.membraneSynth, this.duoSynth].forEach(synth => {
            synth.chain(this.autoFilter, this.phaser, this.chorus, this.delay, this.reverb, this.analyser, this.masterGain);
        });
        
        // Set master volume
        Tone.Destination.volume.value = -12;
    }

    updateFromNetwork(networkState) {
        this.latestNetworkState = networkState;
        if (!this.audioStarted || !this.contextStarted) return;

        try {
            // All frequency modulations are now relative to this.rootFreq
            const baseFreq = this.rootFreq || 261.63; // fallback to C4
            // Vectorial mapping: use 4 network metrics as weights
            const v1 = Math.max(0, Math.min(1, networkState.triangleDensity));
            const v2 = Math.max(0, Math.min(1, networkState.averageArea / 1000));
            const v3 = Math.max(0, Math.min(1, networkState.networkComplexity));
            const v4 = Math.max(0, Math.min(1, networkState.spatialDistribution));
            // Volumes (blend, scale as needed)
            this.fmSynth.volume.value = -12 + v1 * 6;
            this.amSynth.volume.value = -20 + v2 * 12;
            this.membraneSynth.volume.value = -18 + v3 * 10;
            this.duoSynth.volume.value = -22 + v4 * 14;
            // Modulate synth params
            this.fmSynth.set({
                detune: this.mapNetworkComplexityToDetune(networkState.networkComplexity),
                harmonicity: 3.01 + v1 * 2,
                modulationIndex: 10 + networkState.particleVelocity * 5,
                envelope: { sustain: Math.max(0, Math.min(1, 0.5 + 0.3 * (networkState.spatialCoherence || 0))) },
                oscillator: { frequency: baseFreq }
            });
            this.amSynth.set({
                harmonicity: 2.5 + v2 * 2,
                envelope: { sustain: Math.max(0, Math.min(1, 0.6 + 0.2 * (networkState.connectionDensity || 0))) },
                oscillator: { frequency: baseFreq * (1 + v2 * 0.02) }
            });
            this.membraneSynth.set({
                pitchDecay: 0.05 + v3 * 0.2,
                envelope: {
                    decay: 0.5 + v3 * 0.5,
                    sustain: Math.max(0, Math.min(1, 0.1 + v3 * 0.3))
                },
                oscillator: { frequency: baseFreq * (1 - v3 * 0.01) }
            });
            this.duoSynth.set({
                harmonicity: 1.5 + v4 * 2,
                vibratoAmount: 0.5 + v4 * 0.5,
                voice0: { oscillator: { type: "sawtooth" }, envelope: { attack: 0.2, release: 1 } },
                voice1: { oscillator: { type: "triangle" }, envelope: { attack: 0.2, release: 1 } },
                voice0: { oscillator: { frequency: baseFreq * (1 + v4 * 0.01) } },
                voice1: { oscillator: { frequency: baseFreq * (1 - v4 * 0.01) } }
            });
            // Effects
            this.autoFilter.set({
                baseFrequency: Math.max(0, Math.min(20000, this.mapSpatialDistributionToFilter(networkState.spatialDistribution))),
                octaves: Math.max(0, Math.min(8, 2 + networkState.networkComplexity * 3))
            });
            this.reverb.set({
                wet: Math.max(0, Math.min(1, this.mapNetworkComplexityToReverb(networkState.networkComplexity)))
            });
            this.delay.set({
                delayTime: Math.max(0, Math.min(2, this.mapParticleVelocityToDelay(networkState.particleVelocity))),
                feedback: Math.max(0, Math.min(1, this.mapConnectionDensityToFeedback(networkState.connectionDensity)))
            });
            // Update root note based on network complexity
            const now = performance.now();
            if (networkState.networkComplexity > 0.3 && now - this.lastRootChange > 8000) {
                this.shiftRoot();
                this.lastRootChange = now;
            }
        } catch (error) {
            console.warn('Error updating network state:', error);
        }
    }

    // Mapping functions
    mapNetworkComplexityToDetune(complexity) {
        return complexity * 50;
    }

    mapSpatialDistributionToFilter(spatialDist) {
        return 300 + Math.pow(spatialDist, 2) * 1500;
    }

    mapParticleVelocityToDelay(velocity) {
        return 0.1 + velocity * 0.4;
    }

    mapConnectionDensityToFeedback(density) {
        return 0.2 + density * 0.3;
    }

    mapNetworkComplexityToReverb(complexity) {
        return 0.3 + complexity * 0.4;
    }

    // Tonnetz helper functions
    getTonnetzPitch(rootMidi, i, j, k) {
        // Defensive: ensure all are numbers
        if (typeof rootMidi !== 'number' || isNaN(rootMidi)) rootMidi = 60;
        if (typeof i !== 'number' || isNaN(i)) i = 0;
        if (typeof j !== 'number' || isNaN(j)) j = 0;
        if (typeof k !== 'number' || isNaN(k)) k = 0;
        // Convert Tonnetz coordinates to pitch
        return rootMidi + (i * 4 + j * 3 + k * 5);
    }

    triangleToTonnetz(triangleId) {
        // Convert triangle ID to Tonnetz coordinates
        const i = (triangleId % 3) - 1;
        const j = Math.floor(triangleId / 3) % 3 - 1;
        const k = Math.floor(triangleId / 9) % 3 - 1;
        return { i, j, k };
    }

    shiftRoot() {
        // Random walk in Tonnetz space
        const i = Math.floor(Math.random() * 3) - 1;
        const j = Math.floor(Math.random() * 3) - 1;
        const k = Math.floor(Math.random() * 3) - 1;
        const newRoot = this.getTonnetzPitch(this.rootMidi, i, j, k);
        if (typeof newRoot === 'number' && !isNaN(newRoot)) {
            this.fmSynth.setNote(Tone.Frequency(newRoot, "midi").toNote());
            this.amSynth.setNote(Tone.Frequency(newRoot, "midi").toNote());
            this.membraneSynth.setNote(Tone.Frequency(newRoot, "midi").toNote());
            this.duoSynth.setNote(Tone.Frequency(newRoot, "midi").toNote());
        } else {
            this.fmSynth.setNote(Tone.Frequency(60, "midi").toNote());
            this.amSynth.setNote(Tone.Frequency(60, "midi").toNote());
            this.membraneSynth.setNote(Tone.Frequency(60, "midi").toNote());
            this.duoSynth.setNote(Tone.Frequency(60, "midi").toNote());
        }
    }

    setScale(scale) {
        this.scale = scale;
    }

    setMicrotuning(microtuning) {
        this.microtuning = microtuning;
    }

    setNetworkRootModulation(enabled) {
        this.networkRootModulation = enabled;
        if (enabled) {
            if (!this.networkRootInterval) {
                this.networkRootInterval = setInterval(() => this.modulateRootFromNetwork(), 2000);
            }
        } else {
            if (this.networkRootInterval) {
                clearInterval(this.networkRootInterval);
                this.networkRootInterval = null;
            }
        }
    }

    modulateRootFromNetwork() {
        // Example: use network complexity to select a scale degree
        if (!this.latestNetworkState) return;
        // Clamp complexity to [0,1]
        let complexity = this.latestNetworkState.networkComplexity || 0;
        complexity = Math.max(0, Math.min(1, complexity));
        const scaleDegrees = this.getScaleDegrees(this.scale);
        const idx = Math.floor(complexity * (scaleDegrees.length - 1));
        const degree = scaleDegrees[idx];
        // Always use C as tonic for simplicity, or use current root
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const note = noteNames[degree % 12];
        const octave = 4; // Or modulate octave as well
        this.setRootNoteAndOctave(note, octave);
    }

    getScaleDegrees(scale) {
        // Return scale degrees for common modes
        const scales = {
            'Major':      [0, 2, 4, 5, 7, 9, 11],
            'Minor':      [0, 2, 3, 5, 7, 8, 10],
            'Dorian':     [0, 2, 3, 5, 7, 9, 10],
            'Phrygian':   [0, 1, 3, 5, 7, 8, 10],
            'Lydian':     [0, 2, 4, 6, 7, 9, 11],
            'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
            'Locrian':    [0, 1, 3, 5, 6, 8, 10]
        };
        return scales[scale] || scales['Major'];
    }

    // Override setRootNoteAndOctave to quantize to scale and apply microtuning
    setRootNoteAndOctave(note, octave) {
        // Quantize note to scale
        const scaleDegrees = this.getScaleDegrees(this.scale);
        const noteMap = {
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3,
            'E': 4, 'F': 5, 'F#': 6, 'G': 7,
            'G#': 8, 'A': 9, 'A#': 10, 'B': 11
        };
        let midi = noteMap[note] + (octave + 1) * 12;
        // Quantize to nearest scale degree
        const tonic = midi - (midi % 12);
        let closest = scaleDegrees[0];
        let minDist = Math.abs((midi % 12) - scaleDegrees[0]);
        for (let deg of scaleDegrees) {
            const dist = Math.abs((midi % 12) - deg);
            if (dist < minDist) {
                minDist = dist;
                closest = deg;
            }
        }
        midi = tonic + closest;
        // Apply microtuning
        let freq = Tone.Frequency(midi, 'midi').toFrequency();
        if (this.microtuning === '19-TET') {
            freq = 440 * Math.pow(2, (midi - 69) / 19);
        } else if (this.microtuning === '24-TET') {
            freq = 440 * Math.pow(2, (midi - 69) / 24);
        } else if (this.microtuning === 'Just Intonation') {
            const justRatios = [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8];
            freq = 261.63 * justRatios[closest % 12] * Math.pow(2, octave - 4); // C4 = 261.63 Hz
        }
        // Defensive: only set if freq is finite and valid
        if (isFinite(freq) && typeof freq === 'number' && !isNaN(freq)) {
            this.rootMidi = midi;
            this.rootNote = note + octave;
            this.rootFreq = freq;
            if (this.audioStarted) {
                // Smoothly glide all synths' frequency to the new root
                [this.fmSynth, this.amSynth, this.membraneSynth, this.duoSynth].forEach(synth => {
                    if (synth.oscillator && synth.oscillator.frequency) {
                        synth.oscillator.frequency.linearRampToValueAtTime(freq, Tone.now() + this.glideTime);
                    }
                });
            }
        } else {
            console.warn('Invalid frequency calculated for root note:', freq, note, octave, midi);
        }
    }

    noteToMidi(note, octave) {
        const noteMap = {
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3,
            'E': 4, 'F': 5, 'F#': 6, 'G': 7,
            'G#': 8, 'A': 9, 'A#': 10, 'B': 11
        };
        return noteMap[note] + (octave + 1) * 12;
    }
} 