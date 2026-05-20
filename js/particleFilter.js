/**
 * Robotics Particle Filter (Sequential Monte Carlo) Simulation Engine
 * Traces out the name "ZACHARY ZDOBINSKI"
 * 
 * State representation: x = [px, py, vx, vy]^T
 * Motion model: x_t = F * x_{t-1} + w_t, w_t ~ N(0, Q) (Constant Velocity + Random Walk)
 * Measurement model: z_t = H * x_t + v_t, v_t ~ N(0, R) (GPS-like position sensor)
 */

// Box-Muller transform for Gaussian noise generation
function randomNormal(mean = 0, std = 1) {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 <= 0.0000001) u1 = Math.random(); // avoid log(0)
    let z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z * std + mean;
}

// Global Stroke Definitions for Letter Tracing (Normalized coordinates 0 to 1)
const LETTER_STROKES = {
    'Z': [[{x: 0, y: 0.15}, {x: 1, y: 0.15}, {x: 0, y: 0.85}, {x: 1, y: 0.85}]],
    'A': [
        [{x: 0, y: 0.85}, {x: 0.5, y: 0.15}, {x: 1, y: 0.85}],
        [{x: 0.25, y: 0.55}, {x: 0.75, y: 0.55}]
    ],
    'C': [[{x: 0.95, y: 0.3}, {x: 0.5, y: 0.15}, {x: 0.05, y: 0.5}, {x: 0.5, y: 0.85}, {x: 0.95, y: 0.7}]],
    'H': [
        [{x: 0.05, y: 0.15}, {x: 0.05, y: 0.85}],
        [{x: 0.95, y: 0.15}, {x: 0.95, y: 0.85}],
        [{x: 0.05, y: 0.5}, {x: 0.95, y: 0.5}]
    ],
    'R': [
        [{x: 0.05, y: 0.85}, {x: 0.05, y: 0.15}, {x: 0.8, y: 0.15}, {x: 0.8, y: 0.48}, {x: 0.05, y: 0.48}],
        [{x: 0.4, y: 0.48}, {x: 0.85, y: 0.85}]
    ],
    'Y': [
        [{x: 0.05, y: 0.15}, {x: 0.5, y: 0.5}, {x: 0.95, y: 0.15}],
        [{x: 0.5, y: 0.5}, {x: 0.5, y: 0.85}]
    ],
    'D': [[{x: 0.05, y: 0.15}, {x: 0.05, y: 0.85}, {x: 0.5, y: 0.85}, {x: 0.9, y: 0.5}, {x: 0.5, y: 0.15}, {x: 0.05, y: 0.15}]],
    'O': [[{x: 0.5, y: 0.15}, {x: 0.9, y: 0.35}, {x: 0.9, y: 0.65}, {x: 0.5, y: 0.85}, {x: 0.1, y: 0.65}, {x: 0.1, y: 0.35}, {x: 0.5, y: 0.15}]],
    'B': [
        [{x: 0.05, y: 0.15}, {x: 0.05, y: 0.85}],
        [{x: 0.05, y: 0.15}, {x: 0.7, y: 0.15}, {x: 0.7, y: 0.48}, {x: 0.05, y: 0.48}],
        [{x: 0.05, y: 0.48}, {x: 0.75, y: 0.48}, {x: 0.75, y: 0.85}, {x: 0.05, y: 0.85}]
    ],
    'I': [
        [{x: 0.2, y: 0.15}, {x: 0.8, y: 0.15}],
        [{x: 0.5, y: 0.15}, {x: 0.5, y: 0.85}],
        [{x: 0.2, y: 0.85}, {x: 0.8, y: 0.85}]
    ],
    'N': [[{x: 0.05, y: 0.85}, {x: 0.05, y: 0.15}, {x: 0.95, y: 0.85}, {x: 0.95, y: 0.15}]],
    'S': [[{x: 0.9, y: 0.25}, {x: 0.5, y: 0.15}, {x: 0.1, y: 0.32}, {x: 0.5, y: 0.5}, {x: 0.9, y: 0.68}, {x: 0.5, y: 0.85}, {x: 0.1, y: 0.75}]],
    'K': [
        [{x: 0.05, y: 0.15}, {x: 0.05, y: 0.85}],
        [{x: 0.85, y: 0.15}, {x: 0.05, y: 0.5}],
        [{x: 0.05, y: 0.5}, {x: 0.9, y: 0.85}]
    ]
};

// Explicitly export to window for access by pathfinding.js
window.LETTER_STROKES = LETTER_STROKES;

class Particle {
    constructor(x, y, vx = 0, vy = 0, w = 1.0) {
        this.px = x;
        this.py = y;
        this.vx = vx;
        this.vy = vy;
        this.w = w; // weight
    }

    clone() {
        return new Particle(this.px, this.py, this.vx, this.vy, this.w);
    }
}

class ParticleFilter {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Filter Parameters (Adjustable via HUD)
        this.numParticles = 150;
        this.stdR = 0.15; // Measurement noise standard deviation (meters-scale normalized)
        this.stdQ = 0.05; // Process model noise standard dev (meters-scale normalized)
        
        // System variables
        this.particles = [];
        this.groundTruth = { x: 0, y: 0, vx: 0, vy: 0 };
        this.measurement = { x: 0, y: 0, active: true };
        this.estimate = { px: 0, py: 0, vx: 0, vy: 0 };
        this.covariance = { xx: 0, yy: 0, xy: 0 };
        this.nEff = 0;
        this.rmse = 0.0;
        this.rmseAccum = 0;
        this.rmseCount = 0;
        this.isResampling = false;
        
        // Text path settings
        this.textToTrace = "ZACHARY ZDOBINSKI";
        this.pathPoints = []; // Compiled continuous points for tracking
        this.pathIndex = 0.0; // Current float index on the path
        this.speed = 0.20;    // Tracking speed along the path (points per frame, slowed down from 0.35)
        this.isOccluded = false; // Flag to indicate signal occlusion
        
        // Initialize
        this.compileTextPath();
        this.reset();
    }

    /**
     * Compile character stroke lines into a continuous array of 2D coordinates.
     * Incorporates smooth intermediate transitions between non-connected strokes,
     * marked with isOccluded = true to demonstrate blind dead-reckoning.
     */
    compileTextPath() {
        this.pathPoints = [];
        const words = this.textToTrace.split(' ');
        
        let charWidth = 45;
        let charHeight = 65;
        let charSpacing = 12;
        let wordSpacing = 28;
        
        // Compute total width to center it on the canvas dynamically
        let totalWidth = 0;
        for (let w = 0; w < words.length; w++) {
            totalWidth += words[w].length * (charWidth + charSpacing) - charSpacing;
            if (w < words.length - 1) totalWidth += wordSpacing;
        }

        this.totalTextWidth = totalWidth;
        this.charHeight = charHeight;

        let startX = (this.canvas.width - totalWidth) / 2;
        let startY = (this.canvas.height - charHeight) / 2;
        
        let currentX = startX;
        let prevPt = null; // Track end of last stroke to connect to start of next
        
        for (let w = 0; w < words.length; w++) {
            const word = words[w];
            for (let c = 0; c < word.length; c++) {
                const char = word[c];
                const strokes = LETTER_STROKES[char];
                if (strokes) {
                    strokes.forEach((stroke) => {
                        let firstStrokePt = stroke[0];
                        let firstPtX = currentX + firstStrokePt.x * charWidth;
                        let firstPtY = startY + firstStrokePt.y * charHeight;

                        // If there was a previous stroke, compile a smooth path connecting them
                        // representing a transition zone with signal loss
                        if (prevPt) {
                            let dist = Math.hypot(firstPtX - prevPt.x, firstPtY - prevPt.y);
                            let steps = Math.max(Math.ceil(dist / 4), 1); // 4px spacing
                            for (let step = 0; step < steps; step++) {
                                let t = step / steps;
                                this.pathPoints.push({
                                    x: prevPt.x + (firstPtX - prevPt.x) * t,
                                    y: prevPt.y + (firstPtY - prevPt.y) * t,
                                    isOccluded: true
                                });
                            }
                        }

                        // Interpolate points along the actual character stroke (active measurements)
                        for (let s = 0; s < stroke.length - 1; s++) {
                            let p1 = stroke[s];
                            let p2 = stroke[s+1];
                            
                            let p1x = currentX + p1.x * charWidth;
                            let p1y = startY + p1.y * charHeight;
                            let p2x = currentX + p2.x * charWidth;
                            let p2y = startY + p2.y * charHeight;
                            
                            let dist = Math.hypot(p2x - p1x, p2y - p1y);
                            let steps = Math.max(Math.ceil(dist / 3), 1); // 3px spacing
                            
                            for (let step = 0; step < steps; step++) {
                                let t = step / steps;
                                this.pathPoints.push({
                                    x: p1x + (p2x - p1x) * t,
                                    y: p1y + (p2y - p1y) * t,
                                    isOccluded: false
                                });
                            }
                        }
                        
                        // Set prevPt to the end of this stroke
                        let lastStrokePt = stroke[stroke.length - 1];
                        prevPt = {
                            x: currentX + lastStrokePt.x * charWidth,
                            y: startY + lastStrokePt.y * charHeight
                        };
                    });
                }
                currentX += charWidth + charSpacing;
            }
            currentX += wordSpacing - charSpacing;
        }
        
        // Loop the path: connect the last point back to the first point with a transition
        if (this.pathPoints.length > 0 && prevPt) {
            let firstPt = this.pathPoints[0];
            let dist = Math.hypot(firstPt.x - prevPt.x, firstPt.y - prevPt.y);
            let steps = Math.max(Math.ceil(dist / 4), 1);
            for (let step = 0; step < steps; step++) {
                let t = step / steps;
                this.pathPoints.push({
                    x: prevPt.x + (firstPt.x - prevPt.x) * t,
                    y: prevPt.y + (firstPt.y - prevPt.y) * t,
                    isOccluded: true
                });
            }
        }
    }

    reset() {
        this.pathIndex = 0.0;
        this.isOccluded = false;
        
        // Initialize Ground Truth at start of path
        if (this.pathPoints.length > 0) {
            this.groundTruth.x = this.pathPoints[0].x;
            this.groundTruth.y = this.pathPoints[0].y;
            this.groundTruth.vx = 0;
            this.groundTruth.vy = 0;
        }

        // Initialize particles uniformly distributed near the starting position
        this.particles = [];
        for (let i = 0; i < this.numParticles; i++) {
            let px = this.groundTruth.x + randomNormal(0, 30);
            let py = this.groundTruth.y + randomNormal(0, 30);
            let vx = randomNormal(0, 0.5);
            let vy = randomNormal(0, 0.5);
            this.particles.push(new Particle(px, py, vx, vy, 1.0 / this.numParticles));
        }

        this.rmseAccum = 0;
        this.rmseCount = 0;
        this.rmse = 0.0;
        this.updateStateEstimate();
    }

    /**
     * Particle Filter Step: Predict -> Correct -> Resample
     */
    step(dt = 1.0) {
        if (this.pathPoints.length === 0) return;

        // 1. Update Ground Truth along the compiled text strokes (floating-point steps)
        let prevGT = { x: this.groundTruth.x, y: this.groundTruth.y };
        
        this.pathIndex = (this.pathIndex + this.speed) % this.pathPoints.length;
        let currentTarget = this.pathPoints[Math.floor(this.pathIndex)];
        
        this.groundTruth.x = currentTarget.x;
        this.groundTruth.y = currentTarget.y;
        this.groundTruth.vx = (this.groundTruth.x - prevGT.x) / dt;
        this.groundTruth.vy = (this.groundTruth.y - prevGT.y) / dt;
        
        // Retrieve occlusion state directly from compiled point
        this.isOccluded = currentTarget.isOccluded;

        // 2. Generate Noisy Measurement (if not occluded)
        if (!this.isOccluded) {
            // Apply Box-Muller sensor noise (stdR scaled to canvas size)
            this.measurement.x = this.groundTruth.x + randomNormal(0, this.stdR * 80);
            this.measurement.y = this.groundTruth.y + randomNormal(0, this.stdR * 80);
            this.measurement.active = true;
        } else {
            this.measurement.active = false;
        }

        // 3. Prediction Phase: Propagate particles via Constant Velocity Motion Model
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];
            
            // State Transition:
            // px_t = px_{t-1} + vx_{t-1}*dt + N(0, stdQ)
            // py_t = py_{t-1} + vy_{t-1}*dt + N(0, stdQ)
            p.px += p.vx * dt + randomNormal(0, this.stdQ * 30);
            p.py += p.vy * dt + randomNormal(0, this.stdQ * 30);
            p.vx += randomNormal(0, this.stdQ * 3);
            p.vy += randomNormal(0, this.stdQ * 3);
        }

        // 4. Correction Phase: Update weights based on sensor measurements
        if (this.measurement.active) {
            let sumWeights = 0.0;
            let R_var = Math.max(Math.pow(this.stdR * 80, 2), 1.0); // Variance

            for (let i = 0; i < this.particles.length; i++) {
                let p = this.particles[i];
                
                // Gaussian Likelihood: P(z_t | x_t) = exp(-d^2 / (2 * sigma_R^2))
                let distSq = Math.pow(this.measurement.x - p.px, 2) + Math.pow(this.measurement.y - p.py, 2);
                let likelihood = Math.exp(-distSq / (2.0 * R_var));
                
                p.w = p.w * likelihood;
                sumWeights += p.w;
            }

            // Normalize weights
            if (sumWeights > 1e-9) {
                for (let i = 0; i < this.particles.length; i++) {
                    this.particles[i].w /= sumWeights;
                }
            } else {
                // If all weights collapsed to zero due to high divergence, reinitialize weights uniformly
                let uniformW = 1.0 / this.particles.length;
                for (let i = 0; i < this.particles.length; i++) {
                    this.particles[i].w = uniformW;
                }
            }
        }

        // 5. Calculate Effective Sample Size (N_eff)
        let sumSqWeights = 0.0;
        for (let i = 0; i < this.particles.length; i++) {
            sumSqWeights += Math.pow(this.particles[i].w, 2);
        }
        this.nEff = 1.0 / sumSqWeights;

        // 6. Systematic Resampling
        this.isResampling = false;
        let resampleThreshold = this.particles.length * 0.5; // N/2
        
        if (this.nEff < resampleThreshold && this.measurement.active) {
            this.isResampling = true;
            this.resampleSystematic();
        }

        // 7. Update Filter State Estimate (Mean and Covariance)
        this.updateStateEstimate();

        // 8. Track metrics (RMSE)
        let error = Math.hypot(this.estimate.px - this.groundTruth.x, this.estimate.py - this.groundTruth.y);
        this.rmseAccum += error * error;
        this.rmseCount++;
        if (this.rmseCount > 500) { // Sliding window
            this.rmseAccum -= this.rmseAccum / 500;
            this.rmseCount = 500;
        }
        this.rmse = Math.sqrt(this.rmseAccum / this.rmseCount);
    }

    /**
     * Systematic Resampling Algorithm (Robotics textbook standard)
     */
    resampleSystematic() {
        let N = this.particles.length;
        let newParticles = [];
        
        // Random starting point in interval [0, 1/N]
        let r = Math.random() / N;
        let c = this.particles[0].w;
        let idx = 0;
        
        for (let m = 0; m < N; m++) {
            let u = r + m / N;
            while (u > c && idx < N - 1) {
                idx++;
                c += this.particles[idx].w;
            }
            
            let selected = this.particles[idx].clone();
            selected.w = 1.0 / N; // Uniform weight after resampling
            
            // Jitter to prevent sample deprivation
            selected.px += randomNormal(0, 0.5);
            selected.py += randomNormal(0, 0.5);
            
            newParticles.push(selected);
        }
        
        this.particles = newParticles;
    }

    /**
     * Calculate posterior mean estimate and spatial covariance matrix for plotting
     */
    updateStateEstimate() {
        let px_mean = 0, py_mean = 0, vx_mean = 0, vy_mean = 0;
        
        // Posterior Mean (x_hat)
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];
            px_mean += p.px * p.w;
            py_mean += p.py * p.w;
            vx_mean += p.vx * p.w;
            vy_mean += p.vy * p.w;
        }
        
        this.estimate.px = px_mean;
        this.estimate.py = py_mean;
        this.estimate.vx = vx_mean;
        this.estimate.vy = vy_mean;

        // Covariance Matrix (2D for position components: Sigma_xx, Sigma_yy, Sigma_xy)
        let xx = 0, yy = 0, xy = 0;
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];
            let dx = p.px - px_mean;
            let dy = p.py - py_mean;
            
            xx += dx * dx * p.w;
            yy += dy * dy * p.w;
            xy += dx * dy * p.w;
        }
        
        this.covariance.xx = xx;
        this.covariance.yy = yy;
        this.covariance.xy = xy;
    }

    /**
     * Set dynamic parameters from HUD sliders
     */
    setParameters(stdR, numParticles, stdQ) {
        if (numParticles !== this.numParticles) {
            this.numParticles = numParticles;
            this.reset();
        } else {
            this.stdR = stdR;
            this.stdQ = stdQ;
        }
    }

    /**
     * Canvas Renderer Method
     */
    draw(isLightTheme = false) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Styling configuration based on theme
        const colors = {
            letters: isLightTheme ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.03)',
            grid: isLightTheme ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.01)',
            particles: isLightTheme ? 'rgba(99, 102, 241, 0.35)' : 'rgba(139, 92, 246, 0.4)',
            particlesActive: isLightTheme ? 'rgba(6, 182, 212, 0.6)' : 'rgba(6, 182, 212, 0.7)',
            groundTruth: '#f59e0b', // Amber
            measurement: '#ef4444', // Red
            estimate: '#06b6d4', // Cyan
            ellipse: isLightTheme ? 'rgba(8, 145, 178, 0.25)' : 'rgba(6, 182, 212, 0.2)'
        };

        // Draw structural letters as visual reference background
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = colors.letters;
        this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the background reference strokes of the name
        this.ctx.strokeStyle = isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        let charWidth = 45;
        let charHeight = 65;
        let charSpacing = 12;
        let wordSpacing = 28;
        
        const words = this.textToTrace.split(' ');
        let startX = (this.canvas.width - this.totalTextWidth) / 2;
        let startY = (this.canvas.height - charHeight) / 2;
        let currentX = startX;
        
        for (let w = 0; w < words.length; w++) {
            const word = words[w];
            for (let c = 0; c < word.length; c++) {
                const char = word[c];
                const strokes = LETTER_STROKES[char];
                if (strokes) {
                    strokes.forEach(stroke => {
                        this.ctx.beginPath();
                        stroke.forEach((pt, idx) => {
                            let px = currentX + pt.x * charWidth;
                            let py = startY + pt.y * charHeight;
                            if (idx === 0) this.ctx.moveTo(px, py);
                            else this.ctx.lineTo(px, py);
                        });
                        this.ctx.stroke();
                    });
                }
                currentX += charWidth + charSpacing;
            }
            currentX += wordSpacing - charSpacing;
        }
        
        this.ctx.setLineDash([]); // Reset line dash

        // Draw Particles (opacity scaled by weights)
        let maxWeight = Math.max(...this.particles.map(p => p.w));
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];
            
            // Normalize alpha for visibility
            let alpha = maxWeight > 1e-9 ? Math.min((p.w / maxWeight) * 0.9 + 0.1, 1.0) : 0.5;
            
            this.ctx.fillStyle = colors.particles;
            this.ctx.beginPath();
            this.ctx.arc(p.px, p.py, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw Noisy Measurement (X mark)
        if (this.measurement.active) {
            this.ctx.strokeStyle = colors.measurement;
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            let size = 5;
            this.ctx.moveTo(this.measurement.x - size, this.measurement.y - size);
            this.ctx.lineTo(this.measurement.x + size, this.measurement.y + size);
            this.ctx.moveTo(this.measurement.x + size, this.measurement.y - size);
            this.ctx.lineTo(this.measurement.x - size, this.measurement.y + size);
            this.ctx.stroke();
        }

        // Draw Ground Truth Target (Moving vehicle simulation)
        this.ctx.fillStyle = colors.groundTruth;
        this.ctx.beginPath();
        this.ctx.arc(this.groundTruth.x, this.groundTruth.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw heading vector for ground truth
        if (Math.hypot(this.groundTruth.vx, this.groundTruth.vy) > 0.1) {
            this.ctx.strokeStyle = colors.groundTruth;
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(this.groundTruth.x, this.groundTruth.y);
            let angle = Math.atan2(this.groundTruth.vy, this.groundTruth.vx);
            this.ctx.lineTo(
                this.groundTruth.x + Math.cos(angle) * 10,
                this.groundTruth.y + Math.sin(angle) * 10
            );
            this.ctx.stroke();
        }

        // Draw Filter State Estimate (Cyan dot)
        this.ctx.fillStyle = colors.estimate;
        this.ctx.beginPath();
        this.ctx.arc(this.estimate.px, this.estimate.py, 4.5, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw Covariance Confidence Ellipse (Error uncertainty ellipse)
        this.drawCovarianceEllipse(colors.ellipse);
        
        // Draw occlusion warning
        if (this.isOccluded) {
            this.ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#ef4444';
            this.ctx.font = '10px Fira Code';
            this.ctx.fillText("SIGNAL LOSS / DEAD RECKONING MODE", 15, 25);
            
            // Draw a dashed path showing where the target is currently moving blindly
            this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([3, 3]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.groundTruth.x, this.groundTruth.y);
            let targetIdx = Math.floor(this.pathIndex);
            
            // Find next unoccluded point to draw direction vector
            for (let idx = targetIdx; idx < targetIdx + 40 && idx < this.pathPoints.length; idx++) {
                let pt = this.pathPoints[idx];
                this.ctx.lineTo(pt.x, pt.y);
                if (!pt.isOccluded) break;
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    /**
     * Draw 2D Covariance Ellipse
     */
    drawCovarianceEllipse(ellipseColor) {
        let xx = this.covariance.xx;
        let yy = this.covariance.yy;
        let xy = this.covariance.xy;

        let trace = xx + yy;
        let det = xx * yy - xy * xy;
        let discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));
        
        let lambda1 = (trace + discriminant) / 2;
        let lambda2 = (trace - discriminant) / 2;

        let axisMajor = 2.0 * Math.sqrt(Math.max(0, lambda1));
        let axisMinor = 2.0 * Math.sqrt(Math.max(0, lambda2));

        axisMajor = Math.max(axisMajor, 4.0);
        axisMinor = Math.max(axisMinor, 4.0);

        let angle = 0;
        if (Math.abs(xy) > 1e-9) {
            angle = Math.atan2(lambda1 - xx, xy);
        } else if (xx < yy) {
            angle = Math.PI / 2;
        }

        this.ctx.strokeStyle = ellipseColor;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.ellipse(this.estimate.px, this.estimate.py, axisMajor, axisMinor, angle, 0, Math.PI * 2);
        this.ctx.stroke();
        
        this.ctx.fillStyle = ellipseColor;
        this.ctx.beginPath();
        this.ctx.ellipse(this.estimate.px, this.estimate.py, axisMajor, axisMinor, angle, 0, Math.PI * 2);
        this.ctx.fill();
    }
}

window.ParticleFilter = ParticleFilter;
