import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { AudioManager } from './AudioManager';

// Shader imports
import posUpdateShader from '../shaders/posUpdate.frag?raw';
import velUpdateShader from '../shaders/velUpdate.frag?raw';
import renderShader from '../shaders/render.frag?raw';

class AttractorSimulation {
    constructor() {
        this.init();
        this.setupUI();
        this.animate();
        this.updateTerminal('System initialized.');
        // Initialize audio manager
        this.audioManager = new AudioManager();
        // Initial full reset for default attractor
        setTimeout(() => this.fullReset(document.getElementById('attractorType').value), 0);
    }

    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 80);
        this.camera.lookAt(0, 0, 0);
        
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('application-canvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        
        // GPGPU setup
        this.setupGPGPU();
        
        // Window resize handler
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupGPGPU() {
        // Create data textures
        const particleCount = 1000000; // Adjust based on performance
        const textureSize = Math.ceil(Math.sqrt(particleCount));
        this.textureSize = textureSize;
        
        // Position texture
        const posArray = new Float32Array(textureSize * textureSize * 4);
        for (let i = 0; i < posArray.length; i += 4) {
            posArray[i] = (Math.random() - 0.5) * 2;
            posArray[i + 1] = (Math.random() - 0.5) * 2;
            posArray[i + 2] = (Math.random() - 0.5) * 2;
            posArray[i + 3] = 1.0;
        }
        
        this.posTexture = new THREE.DataTexture(
            posArray,
            textureSize,
            textureSize,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.posTexture.needsUpdate = true;
        
        // Velocity texture
        const velArray = new Float32Array(textureSize * textureSize * 4);
        this.velTexture = new THREE.DataTexture(
            velArray,
            textureSize,
            textureSize,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.velTexture.needsUpdate = true;
        
        // Create ping-pong render targets
        const rtOpts = {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        };
        this.posRenderTargetA = new THREE.WebGLRenderTarget(textureSize, textureSize, rtOpts);
        this.posRenderTargetB = new THREE.WebGLRenderTarget(textureSize, textureSize, rtOpts);
        this.velRenderTargetA = new THREE.WebGLRenderTarget(textureSize, textureSize, rtOpts);
        this.velRenderTargetB = new THREE.WebGLRenderTarget(textureSize, textureSize, rtOpts);
        this.currentPosRT = this.posRenderTargetA;
        this.nextPosRT = this.posRenderTargetB;
        this.currentVelRT = this.velRenderTargetA;
        this.nextVelRT = this.velRenderTargetB;
        
        // Create shader materials
        this.posUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.posTexture },
                uVelocity: { value: this.velTexture },
                uDelta: { value: 0.016 },
                uResolution: { value: new THREE.Vector2(textureSize, textureSize) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: posUpdateShader
        });
        
        this.velUpdateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.posTexture },
                uVelocity: { value: this.velTexture },
                uDelta: { value: 0.016 },
                uResolution: { value: new THREE.Vector2(textureSize, textureSize) },
                uAttractorPos: { value: new THREE.Vector3() },
                uAttractorParams: { value: new THREE.Vector3(10, 28, 8/3) },
                uAttractorType: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: velUpdateShader
        });
        
        this.renderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.posTexture },
                uVelocity: { value: this.velTexture },
                uResolution: { value: new THREE.Vector2(textureSize, textureSize) },
                uTrailLength: { value: 10.0 },
                uColor: { value: new THREE.Color(0.5, 0.8, 1.0) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: renderShader,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        
        // Create fullscreen quad for rendering
        this.quad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            this.renderMaterial
        );
        this.scene.add(this.quad);

        // Initialize targets with initial data
        this._initTargets();

        // --- Points geometry for rendering ---
        const numParticles = this.textureSize * this.textureSize;
        const positions = new Float32Array(numParticles * 3);
        const uvs = new Float32Array(numParticles * 2);
        let p = 0, u = 0;
        for (let y = 0; y < this.textureSize; y++) {
            for (let x = 0; x < this.textureSize; x++) {
                positions[p++] = 0; // will be set in vertex shader
                positions[p++] = 0;
                positions[p++] = 0;
                uvs[u++] = x / (this.textureSize - 1);
                uvs[u++] = y / (this.textureSize - 1);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        // --- Points shader ---
        const pointVertexShader = `
            precision highp float;
            uniform sampler2D uPosition;
            uniform float uPointSize;
            varying vec3 vColor;
            varying float vAlpha;
            void main() {
                vec2 uvCoord = uv;
                vec3 pos = texture2D(uPosition, uvCoord).xyz;
                // Color gradient: purple to orange
                float t = (pos.x + 30.0) / 60.0;
                vColor = mix(vec3(0.56, 0.0, 1.0), vec3(1.0, 0.67, 0.34), t);
                vAlpha = 1.0;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = uPointSize;
            }
        `;
        const pointFragmentShader = `
            precision highp float;
            varying vec3 vColor;
            varying float vAlpha;
            void main() {
                float d = length(gl_PointCoord - 0.5);
                float alpha = smoothstep(0.5, 0.2, d) * vAlpha;
                gl_FragColor = vec4(vColor, alpha);
            }
        `;
        this.pointsMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.currentPosRT.texture },
                uPointSize: { value: 2.5 }
            },
            vertexShader: pointVertexShader,
            fragmentShader: pointFragmentShader,
            transparent: true,
            depthTest: true,
            blending: THREE.AdditiveBlending
        });
        this.points = new THREE.Points(geometry, this.pointsMaterial);
        this.scene.add(this.points);

        // Remove the quad from the scene (only used for GPGPU updates)
        if (this.quad) this.scene.remove(this.quad);
    }

    _initTargets() {
        // Helper to initialize the ping-pong targets with the initial textures
        // Render posTexture to posRenderTargetA
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const material = new THREE.MeshBasicMaterial({ map: this.posTexture });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(quad);
        this.renderer.setRenderTarget(this.posRenderTargetA);
        this.renderer.render(scene, camera);
        material.map = this.velTexture;
        this.renderer.setRenderTarget(this.velRenderTargetA);
        this.renderer.render(scene, camera);
        this.renderer.setRenderTarget(null);
    }

    setupUI() {
        // Attractor type selection
        const attractorTypeSelect = document.getElementById('attractorType');
        attractorTypeSelect.addEventListener('change', async (e) => {
            // Fade out current audio before changing attractor
            if (this.audioManager) {
                // Set the new attractor type in audio manager
                const typeMap = {
                    'lorenz': 0,
                    'rossler': 1,
                    'thomas': 2,
                    'halvorsen': 3,
                    'dadras': 4,
                    'aizawa': 5
                };
                this.audioManager.setAttractorType(typeMap[e.target.value]);
                await this.audioManager.resetAndStart();
            }
            this.fullReset(e.target.value);
        });
        
        // Parameter controls
        const controls = ['sigma', 'rho', 'beta'];
        controls.forEach(param => {
            const slider = document.getElementById(param);
            const value = document.getElementById(`${param}Value`);
            
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                value.textContent = val.toFixed(2);
                
                const params = this.velUpdateMaterial.uniforms.uAttractorParams.value;
                switch(param) {
                    case 'sigma': params.x = val; break;
                    case 'rho': params.y = val; break;
                    case 'beta': params.z = val; break;
                }
            });
        });

        // Add root note and octave controls
        const rootNoteSelect = document.getElementById('rootNote');
        const octaveSlider = document.getElementById('octave');
        const octaveValue = document.getElementById('octaveValue');

        rootNoteSelect.addEventListener('change', (e) => {
            if (this.audioManager) {
                this.audioManager.setRootNoteAndOctave(e.target.value, parseInt(octaveSlider.value));
            }
        });

        octaveSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            octaveValue.textContent = val;
            if (this.audioManager) {
                this.audioManager.setRootNoteAndOctave(rootNoteSelect.value, val);
            }
        });

        if (this.controls) {
            this.controls.addEventListener('change', () => {
                this.updateTerminal(`Camera moved: [${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)}] Target: [${this.controls.target.x.toFixed(2)}, ${this.controls.target.y.toFixed(2)}, ${this.controls.target.z.toFixed(2)}]`);
            });
        }

        // Reset button logic
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.fullReset(attractorTypeSelect.value);
        });

        // Add audio controls
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

        const startButton = document.createElement('button');
        startButton.textContent = 'Start Audio';
        startButton.style.padding = '5px 10px';
        startButton.style.backgroundColor = '#4CAF50';
        startButton.style.border = 'none';
        startButton.style.borderRadius = '3px';
        startButton.style.cursor = 'pointer';
        startButton.style.fontFamily = 'monospace';
        startButton.addEventListener('click', async () => {
            try {
                await this.audioManager.start();
                startButton.textContent = 'Audio Running';
                startButton.style.backgroundColor = '#45a049';
            } catch (error) {
                console.error('Failed to start audio:', error);
                startButton.textContent = 'Start Failed';
                startButton.style.backgroundColor = '#f44336';
            }
        });
        audioControls.appendChild(startButton);

        const stopButton = document.createElement('button');
        stopButton.textContent = 'Stop Audio';
        stopButton.style.padding = '5px 10px';
        stopButton.style.backgroundColor = '#f44336';
        stopButton.style.border = 'none';
        stopButton.style.borderRadius = '3px';
        stopButton.style.cursor = 'pointer';
        stopButton.style.fontFamily = 'monospace';
        stopButton.addEventListener('click', () => {
            this.audioManager.stop();
            startButton.textContent = 'Start Audio';
            startButton.style.backgroundColor = '#4CAF50';
        });
        audioControls.appendChild(stopButton);

        document.body.appendChild(audioControls);
    }

    update() {
        // 1. Update velocities (GPGPU pass)
        this.velUpdateMaterial.uniforms.uPosition.value = this.currentPosRT.texture;
        this.velUpdateMaterial.uniforms.uVelocity.value = this.currentVelRT.texture;
        this.quad.material = this.velUpdateMaterial;
        this.renderer.setRenderTarget(this.nextVelRT);
        this.renderer.render(this.quad, this.camera);

        // 2. Update positions (GPGPU pass)
        this.posUpdateMaterial.uniforms.uPosition.value = this.currentPosRT.texture;
        this.posUpdateMaterial.uniforms.uVelocity.value = this.nextVelRT.texture;
        this.quad.material = this.posUpdateMaterial;
        this.renderer.setRenderTarget(this.nextPosRT);
        this.renderer.render(this.quad, this.camera);

        // 3. Calculate particle statistics for audio
        if (this.currentPosRT && this.currentVelRT) {
            this.calculateParticleStats();
        }

        // 4. Render points to screen (3D view)
        this.pointsMaterial.uniforms.uPosition.value = this.nextPosRT.texture;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);

        // 5. Swap
        let temp = this.currentPosRT;
        this.currentPosRT = this.nextPosRT;
        this.nextPosRT = temp;
        temp = this.currentVelRT;
        this.currentVelRT = this.nextVelRT;
        this.nextVelRT = temp;
    }

    calculateParticleStats() {
        // Check if render targets are initialized
        if (!this.currentPosRT || !this.currentVelRT || 
            !this.currentPosRT.texture || !this.currentVelRT.texture) {
            return;
        }

        try {
            // Read back a small sample of particles for audio control
            const sampleSize = 32 * 32; // Match the render target size
            const posData = new Float32Array(sampleSize * 4);
            const velData = new Float32Array(sampleSize * 4);
            
            // Create temporary render targets for reading back data
            const tempPosRT = new THREE.WebGLRenderTarget(32, 32, {
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter
            });
            const tempVelRT = new THREE.WebGLRenderTarget(32, 32, {
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter
            });

            // Create a temporary scene and camera for reading back data
            const tempScene = new THREE.Scene();
            const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

            // Create materials for reading position and velocity
            const posMaterial = new THREE.MeshBasicMaterial({
                map: this.currentPosRT.texture
            });
            const velMaterial = new THREE.MeshBasicMaterial({
                map: this.currentVelRT.texture
            });

            // Create a quad for rendering
            const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), posMaterial);
            tempScene.add(quad);

            // Render position data
            quad.material = posMaterial;
            this.renderer.setRenderTarget(tempPosRT);
            this.renderer.render(tempScene, tempCamera);

            // Render velocity data
            quad.material = velMaterial;
            this.renderer.setRenderTarget(tempVelRT);
            this.renderer.render(tempScene, tempCamera);

            // Reset render target
            this.renderer.setRenderTarget(null);

            // Read back the data
            this.renderer.readRenderTargetPixels(
                tempPosRT,
                0, 0,
                32, 32,
                posData
            );
            this.renderer.readRenderTargetPixels(
                tempVelRT,
                0, 0,
                32, 32,
                velData
            );

            // Calculate averages
            let avgPosX = 0, avgPosY = 0, avgPosZ = 0;
            let avgVelX = 0, avgVelY = 0, avgVelZ = 0;

            for (let i = 0; i < sampleSize; i++) {
                avgPosX += posData[i * 4];
                avgPosY += posData[i * 4 + 1];
                avgPosZ += posData[i * 4 + 2];
                avgVelX += velData[i * 4];
                avgVelY += velData[i * 4 + 1];
                avgVelZ += velData[i * 4 + 2];
            }

            // Update audio manager with particle statistics
            if (this.audioManager) {
                this.audioManager.updateFromAttractor({
                    avgPosX: avgPosX / sampleSize,
                    avgPosY: avgPosY / sampleSize,
                    avgPosZ: avgPosZ / sampleSize,
                    avgVelX: avgVelX / sampleSize,
                    avgVelY: avgVelY / sampleSize,
                    avgVelZ: avgVelZ / sampleSize
                });
            }

            // Clean up temporary resources
            tempPosRT.dispose();
            tempVelRT.dispose();
            posMaterial.dispose();
            velMaterial.dispose();
            quad.geometry.dispose();
        } catch (error) {
            console.warn('Error calculating particle stats:', error);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.update();
        this.controls.update();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateTerminal(message) {
        const panel = document.getElementById('terminal-panel');
        if (!panel) return;
        // Gather system status
        const attractorType = document.getElementById('attractorType').value;
        const sigma = document.getElementById('sigma').value;
        const rho = document.getElementById('rho').value;
        const beta = document.getElementById('beta').value;
        const numParticles = this.textureSize * this.textureSize;
        const cam = this.camera.position;
        const status = `
            [${attractorType.toUpperCase()}]  σ: ${sigma}  ρ: ${rho}  β: ${beta}  |  Particles: ${numParticles}
            Camera: [${cam.x.toFixed(2)}, ${cam.y.toFixed(2)}, ${cam.z.toFixed(2)}]
            Status: ${message}
        `;
        panel.textContent = status;
    }

    fullReset(type) {
        // Re-initialize the GPGPU system (reset particles)
        if (this.points && this.scene) this.scene.remove(this.points);
        this.setupGPGPU();
        // Now set uniforms, sliders, and camera for the new materials
        const paramPresets = {
            'lorenz':    { sigma: 10,   rho: 28,   beta: 2.67 },
            'rossler':   { sigma: 0.2,  rho: 0.2,   beta: 5.7 }, // classic chaotic
            'thomas':    { sigma: 0.2, rho: 0, beta: 0 },
            'halvorsen': { sigma: 1.9, rho: 0, beta: 0 },
            'dadras':    { sigma: 3,    rho: 2.7,  beta: 1.7 },
            'aizawa':    { sigma: 0.95, rho: 0.7,  beta: 0.6 }
        };
        const params = paramPresets[type];
        if (params) {
            // Set slider values
            document.getElementById('sigma').value = params.sigma;
            document.getElementById('sigmaValue').textContent = params.sigma;
            document.getElementById('rho').value = params.rho;
            document.getElementById('rhoValue').textContent = params.rho;
            document.getElementById('beta').value = params.beta;
            document.getElementById('betaValue').textContent = params.beta;
        }
        // Update uniforms
        if (this.velUpdateMaterial && params) {
            const attractorParams = this.velUpdateMaterial.uniforms.uAttractorParams.value;
            attractorParams.x = params.sigma;
            attractorParams.y = params.rho;
            attractorParams.z = params.beta;
        }
        // Set attractor type uniform
        const typeMap = {
            'lorenz': 0,
            'rossler': 1,
            'thomas': 2,
            'halvorsen': 3,
            'dadras': 4,
            'aizawa': 5
        };
        if (this.velUpdateMaterial) {
            this.velUpdateMaterial.uniforms.uAttractorType.value = typeMap[type];
        }
        // Camera presets
        const cameraPresets = {
            'lorenz':   { pos: [0, 0, 80], look: [0, 0, 0] },
            'rossler':  { pos: [0, 30, 120], look: [0, 0, 0] },
            'thomas':   { pos: [-4.46, 2.16, 5.74], look: [0, 0, 0] },
            'halvorsen':{ pos: [-20.44, -16.50, -9.20], look: [0, 0, 0] },
            'dadras':   { pos: [0, 0, 40], look: [0, 0, 0] },
            'aizawa':   { pos: [0, 0, 30], look: [0, 0, 0] }
        };
        const preset = cameraPresets[type];
        if (preset) {
            this.camera.position.set(...preset.pos);
            this.camera.lookAt(...preset.look);
            if (this.controls) {
                this.controls.target.set(...preset.look);
                this.controls.update();
            }
        }
        this.updateTerminal('System reset to optimal setup for ' + type + ' attractor.');
    }
}

// Initialize simulation
new AttractorSimulation(); 