/**
 * A* Pathfinding Grid Engine - Pittsburgh Street Network Router
 * Extracts the traversable road network directly from the image pixels of 'pittsburgh_map.png'.
 * Routes exclusively along the white street lines and over bridges.
 * Employs a fixed internal resolution of 1000x600 for coordinate stability, scaled dynamically.
 */

class AStarNode {
    constructor(col, row, parent = null) {
        this.col = col;
        this.row = row;
        this.g = 0; // path cost
        this.h = 0; // heuristic cost
        this.f = 0; // total cost
        this.parent = parent;
    }

    equals(other) {
        return this.col === other.col && this.row === other.row;
    }
}

class AStarVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Fixed virtual coordinate space for resolution independence
        this.virtualWidth = 1000;
        this.virtualHeight = 600;
        this.cellSize = 10; 
        this.cols = 100;
        this.rows = 60;
        
        this.searchSpeed = 5; // number of nodes expanded per frame
        this.obstacleDensity = 0.20; // Stored density value
        
        // State matrices
        this.grid = []; // 0 = road (passable), 1 = obstacle (blocked)
        this.openSet = [];
        this.closedSet = [];
        this.path = [];
        
        // Image map properties
        this.mapImage = new Image();
        this.mapLoaded = false;
        
        this.mapImage.onload = () => {
            this.mapLoaded = true;
            this.generateGrid();
            this.selectNextCheckpoint();
        };
        this.mapImage.src = 'pittsburgh_map.png';

        // Check if already completed (cached)
        if (this.mapImage.complete) {
            setTimeout(() => {
                if (!this.mapLoaded) {
                    this.mapLoaded = true;
                    this.generateGrid();
                    this.selectNextCheckpoint();
                }
            }, 0);
        }

        // Pittsburgh Milestones with normalized coordinate percentages
        this.checkpoints = [
            {
                name: "Point State Park",
                desc: "Pittsburgh PA (The Point)",
                pctX: 0.12,
                pctY: 0.50,
                col: 12,
                row: 30
            },
            {
                name: "University of Pittsburgh",
                desc: "B.S. in Electrical Engineering",
                pctX: 0.60,
                pctY: 0.42,
                col: 60,
                row: 25
            },
            {
                name: "Carnegie Mellon University",
                desc: "M.S. in ECE (Estimation & ML)",
                pctX: 0.82,
                pctY: 0.40,
                col: 82,
                row: 24
            },
            {
                name: "Bechtel Plant Machinery",
                desc: "Advanced Data Engineer (ML)",
                pctX: 0.65,
                pctY: 0.80,
                col: 65,
                row: 48
            }
        ];

        // Start, Target, and Driving Agent
        this.startNode = null;
        this.targetNode = null;
        this.currentNode = null;
        this.agent = { col: 0, row: 0, x: 0, y: 0, pathIdx: 0, active: false, heading: 0 };
        
        this.customGoal = null;
        this.phase = 'INIT'; // 'INIT', 'SEARCHING', 'PATH_FOUND', 'DRIVING'
        this.checkpointIndex = 0;
        
        // Set up click handler to translate coordinates correctly
        this.setupClickListener();
    }

    /**
     * Unified resize handler called by app.js.
     * Prevents app.js from overwriting cols/rows, keeping grid fixed.
     */
    handleResize(canvasWidth, canvasHeight) {
        // No-op for grid resizing since we use a fixed 1000x600 coordinate mapping scaled dynamically.
        console.log(`A* Visualizer scaled dynamically to visual size: ${canvasWidth}x${canvasHeight}`);
    }

    /**
     * Store obstacle density and trigger regeneration
     */
    setObstacleDensity(val) {
        this.obstacleDensity = val;
        this.generateGrid();
    }

    /**
     * Set up canvas click listener to route to any clicked coordinate or landmark
     */
    setupClickListener() {
        this.canvas.removeEventListener('click', this.canvasClickHandler);
        this.canvasClickHandler = (event) => {
            // Check if A* mode is active in HUD
            const activeModeBtn = document.querySelector('.mode-btn.active');
            const isAStarMode = activeModeBtn && activeModeBtn.dataset.mode === 'astar';
            
            if (isAStarMode) {
                const rect = this.canvas.getBoundingClientRect();
                const clickX = event.clientX - rect.left;
                const clickY = event.clientY - rect.top;
                
                // Map screen coordinates back to virtual 1000x600 space
                const virtualX = clickX * (this.virtualWidth / this.canvas.width);
                const virtualY = clickY * (this.virtualHeight / this.canvas.height);
                
                // Check if user clicked close to any landmark pin
                let clickedIdx = -1;
                this.checkpoints.forEach((cp, idx) => {
                    let pinX = cp.col * this.cellSize + this.cellSize / 2;
                    let pinY = cp.row * this.cellSize + this.cellSize / 2;
                    let dist = Math.hypot(virtualX - pinX, virtualY - pinY);
                    if (dist < 18) { // 18 virtual pixels radius for easy click
                        clickedIdx = idx;
                    }
                });

                if (clickedIdx !== -1) {
                    const selectStart = document.getElementById('select-start-landmark');
                    const selectEnd = document.getElementById('select-end-landmark');
                    
                    if (selectStart && selectEnd) {
                        // Find closest checkpoint to current agent position as the starting landmark
                        let agentIdx = 0;
                        let minDist = Infinity;
                        this.checkpoints.forEach((cp, idx) => {
                            let dist = Math.hypot(this.agent.col - cp.col, this.agent.row - cp.row);
                            if (dist < minDist) {
                                minDist = dist;
                                agentIdx = idx;
                            }
                        });
                        
                        // Prevent routing to the same node
                        if (agentIdx === clickedIdx) {
                            // Find another index to make start different, or just use it
                            agentIdx = (clickedIdx + 1) % this.checkpoints.length;
                        }

                        selectStart.value = agentIdx;
                        selectEnd.value = clickedIdx;
                        
                        this.routeBetweenLandmarks(agentIdx, clickedIdx);
                    }
                } else {
                    this.setGoalAt(virtualX, virtualY);
                }
            }
        };
        this.canvas.addEventListener('click', this.canvasClickHandler);
    }

    /**
     * Generate the occupancy grid from the high-contrast map image
     */
    generateGridFromImage() {
        const offscreen = document.createElement('canvas');
        offscreen.width = this.virtualWidth;
        offscreen.height = this.virtualHeight;
        const oCtx = offscreen.getContext('2d');
        
        try {
            oCtx.drawImage(this.mapImage, 0, 0, this.virtualWidth, this.virtualHeight);
        } catch (e) {
            console.warn("Could not render map image offscreen. Reverting to empty grid.", e);
            this.generateEmptyGrid();
            return;
        }

        this.grid = [];
        let roadCount = 0;
        
        // Analyze image pixels for each grid cell
        for (let c = 0; c < this.cols; c++) {
            this.grid[c] = [];
            for (let r = 0; r < this.rows; r++) {
                // Sample a sub-grid of pixels inside the cell boundary
                let hasRoad = false;
                let stepX = Math.max(1, Math.floor(this.cellSize / 3));
                let stepY = Math.max(1, Math.floor(this.cellSize / 3));
                
                for (let sx = 1; sx < this.cellSize; sx += stepX) {
                    for (let sy = 1; sy < this.cellSize; sy += stepY) {
                        let px = c * this.cellSize + sx;
                        let py = r * this.cellSize + sy;
                        
                        // Bound safety
                        px = Math.max(0, Math.min(this.virtualWidth - 1, px));
                        py = Math.max(0, Math.min(this.virtualHeight - 1, py));
                        
                        let pixel = oCtx.getImageData(px, py, 1, 1).data;
                        let red = pixel[0];
                        let green = pixel[1];
                        let blue = pixel[2];
                        
                        // Check if color is bright white/light gray (streets)
                        if (red > 110 && green > 110 && blue > 110) {
                            hasRoad = true;
                            break;
                        }
                    }
                    if (hasRoad) break;
                }

                // Prevent paths from locking directly on the visual grid borders
                let isBorder = c <= 1 || r <= 1 || c >= this.cols - 2 || r >= this.rows - 2;
                
                if (hasRoad && !isBorder) {
                    this.grid[c][r] = 0; // Road: traversable
                    roadCount++;
                } else {
                    this.grid[c][r] = 1; // Obstacle (land/river): blocked
                }
            }
        }
        
        console.log(`Street network occupancy grid initialized. Total road cells: ${roadCount}/${this.cols * this.rows} (${((roadCount / (this.cols * this.rows)) * 100).toFixed(1)}%)`);
    }

    /**
     * Fallback empty grid if image drawing fails
     */
    generateEmptyGrid() {
        this.grid = [];
        for (let c = 0; c < this.cols; c++) {
            this.grid[c] = [];
            for (let r = 0; r < this.rows; r++) {
                this.grid[c][r] = 0; // All passable
            }
        }
    }

    /**
     * Snap landmark coordinates to the nearest traversable road cell to ensure path planning works
     */
    snapLandmarksToRoads() {
        this.checkpoints.forEach(cp => {
            let startCol = cp.col;
            let startRow = cp.row;
            
            // Limit bounds
            startCol = Math.max(0, Math.min(this.cols - 1, startCol));
            startRow = Math.max(0, Math.min(this.rows - 1, startRow));
            
            // If already on a road cell, done
            if (this.grid[startCol] && this.grid[startCol][startRow] === 0) {
                cp.col = startCol;
                cp.row = startRow;
                return;
            }
            
            // Spiral search for nearest road cell up to radius 30
            let found = false;
            for (let radius = 1; radius < 30 && !found; radius++) {
                for (let dc = -radius; dc <= radius && !found; dc++) {
                    for (let dr = -radius; dr <= radius && !found; dr++) {
                        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
                        
                        let nc = startCol + dc;
                        let nr = startRow + dr;
                        
                        if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                            if (this.grid[nc][nr] === 0) {
                                cp.col = nc;
                                cp.row = nr;
                                found = true;
                            }
                        }
                    }
                }
            }
            if (found) {
                console.log(`Snapped landmark "${cp.name}" to road at [${cp.col}, ${cp.row}]`);
            } else {
                console.warn(`Could not snap landmark "${cp.name}" to road network!`);
            }
        });
    }

    /**
     * Route agent to custom goal on click
     */
    setGoalAt(virtualX, virtualY) {
        let gCol = Math.floor(virtualX / this.cellSize);
        let gRow = Math.floor(virtualY / this.cellSize);
        
        gCol = Math.max(0, Math.min(this.cols - 1, gCol));
        gRow = Math.max(0, Math.min(this.rows - 1, gRow));
        
        // Find nearest road cell (snap clicked coordinate to streets)
        let snappedCol = gCol;
        let snappedRow = gRow;
        let found = false;
        
        if (this.grid[gCol] && this.grid[gCol][gRow] === 0) {
            found = true;
        } else {
            for (let radius = 1; radius < 35 && !found; radius++) {
                for (let dc = -radius; dc <= radius && !found; dc++) {
                    for (let dr = -radius; dr <= radius && !found; dr++) {
                        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
                        
                        let nc = gCol + dc;
                        let nr = gRow + dr;
                        if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                            if (this.grid[nc][nr] === 0) {
                                snappedCol = nc;
                                snappedRow = nr;
                                found = true;
                            }
                        }
                    }
                }
            }
        }
        
        if (!found) {
            console.warn("Clicked area is too far from any mapped street.");
            return;
        }

        this.customGoal = {
            name: "Custom Goal",
            desc: "User Clicked Target",
            col: snappedCol,
            row: snappedRow
        };

        // Start planning path from current agent position
        this.startNode = new AStarNode(this.agent.col, this.agent.row);
        this.targetNode = new AStarNode(snappedCol, snappedRow);
        
        this.openSet = [this.startNode];
        this.closedSet = [];
        this.path = [];
        this.phase = 'SEARCHING';
        
        this.agent.active = false;
        this.agent.pathIdx = 0;
    }

    /**
     * Route agent between two selected landmark indices
     */
    routeBetweenLandmarks(startIdx, endIdx) {
        if (startIdx < 0 || startIdx >= this.checkpoints.length) return;
        if (endIdx < 0 || endIdx >= this.checkpoints.length) return;
        
        this.customGoal = null;
        
        let startCP = this.checkpoints[startIdx];
        this.startNode = new AStarNode(startCP.col, startCP.row);
        
        let targetCP = this.checkpoints[endIdx];
        this.targetNode = new AStarNode(targetCP.col, targetCP.row);
        
        this.openSet = [this.startNode];
        this.closedSet = [];
        this.path = [];
        this.phase = 'SEARCHING';
        
        this.agent.col = this.startNode.col;
        this.agent.row = this.startNode.row;
        this.agent.x = this.startNode.col * this.cellSize + this.cellSize / 2;
        this.agent.y = this.startNode.row * this.cellSize + this.cellSize / 2;
        this.agent.pathIdx = 0;
        this.agent.active = false;
        
        console.log(`Routing between milestones: ${startCP.name} -> ${targetCP.name}`);
    }

    /**
     * Select the next destination in the automated path loop
     */
    selectNextCheckpoint() {
        if (this.checkpoints.length === 0) return;

        this.customGoal = null;

        let startCP = this.checkpoints[this.checkpointIndex];
        this.startNode = new AStarNode(startCP.col, startCP.row);

        this.checkpointIndex = (this.checkpointIndex + 1) % this.checkpoints.length;
        let targetCP = this.checkpoints[this.checkpointIndex];
        this.targetNode = new AStarNode(targetCP.col, targetCP.row);

        this.openSet = [this.startNode];
        this.closedSet = [];
        this.path = [];
        this.phase = 'SEARCHING';

        // Anchor agent to starting milestone
        this.agent.col = this.startNode.col;
        this.agent.row = this.startNode.row;
        this.agent.x = this.startNode.col * this.cellSize + this.cellSize / 2;
        this.agent.y = this.startNode.row * this.cellSize + this.cellSize / 2;
        this.agent.pathIdx = 0;
        this.agent.active = false;
    }

    /**
     * Unified interface to generate grid depending on image loading status
     */
    generateGrid() {
        // Enforce grid sizing relative to the 1000x600 virtual resolution, not canvas visual width
        this.cols = Math.floor(this.virtualWidth / this.cellSize);
        this.rows = Math.floor(this.virtualHeight / this.cellSize);
        
        // Recalculate milestone grid indices
        this.checkpoints.forEach(cp => {
            cp.col = Math.floor((cp.pctX * this.virtualWidth) / this.cellSize);
            cp.row = Math.floor((cp.pctY * this.virtualHeight) / this.cellSize);
        });

        if (this.mapLoaded) {
            this.generateGridFromImage();
            this.snapLandmarksToRoads();
        } else {
            this.generateEmptyGrid();
        }
    }

    /**
     * Step the pathfinding simulation frame
     */
    step() {
        if (this.phase === 'SEARCHING') {
            for (let step = 0; step < this.searchSpeed; step++) {
                if (this.openSet.length === 0) {
                    // Path blocked or search failed: reset
                    this.phase = 'INIT';
                    setTimeout(() => {
                        this.selectNextCheckpoint();
                    }, 1200);
                    return;
                }

                // Get lowest f-cost node
                let lowestIdx = 0;
                for (let i = 1; i < this.openSet.length; i++) {
                    if (this.openSet[i].f < this.openSet[lowestIdx].f) {
                        lowestIdx = i;
                    }
                }

                let current = this.openSet[lowestIdx];
                this.currentNode = current;

                // Goal reached
                if (current.equals(this.targetNode)) {
                    this.reconstructPath(current);
                    this.phase = 'DRIVING';
                    this.agent.active = true;
                    this.agent.pathIdx = 0;
                    return;
                }

                this.openSet.splice(lowestIdx, 1);
                this.closedSet.push(current);

                // Examine 8 neighbors
                let neighbors = this.getNeighbors(current);
                for (let i = 0; i < neighbors.length; i++) {
                    let neighbor = neighbors[i];

                    if (this.closedSet.some(c => c.equals(neighbor))) {
                        continue;
                    }

                    // Octile distance cost metric
                    let dG = (neighbor.col !== current.col && neighbor.row !== current.row) ? 1.414 : 1.0;
                    let tentativeG = current.g + dG;

                    let existingOpen = this.openSet.find(o => o.equals(neighbor));

                    if (!existingOpen || tentativeG < existingOpen.g) {
                        neighbor.g = tentativeG;
                        neighbor.h = this.heuristic(neighbor, this.targetNode);
                        neighbor.f = neighbor.g + neighbor.h;
                        neighbor.parent = current;

                        if (!existingOpen) {
                            this.openSet.push(neighbor);
                        } else {
                            existingOpen.g = neighbor.g;
                            existingOpen.f = neighbor.f;
                            existingOpen.parent = current;
                        }
                    }
                }
            }
        } else if (this.phase === 'DRIVING') {
            this.driveAgent();
        }
    }

    heuristic(a, b) {
        let dx = Math.abs(a.col - b.col);
        let dy = Math.abs(a.row - b.row);
        return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
    }

    getNeighbors(node) {
        let list = [];
        for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (dc === 0 && dr === 0) continue;

                let nc = node.col + dc;
                let nr = node.row + dr;

                if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                    if (this.grid[nc] && this.grid[nc][nr] === 0) { // On road
                        // Diagonal wall-cutting prevention
                        if (dc !== 0 && dr !== 0) {
                            if (this.grid[node.col + dc][node.row] === 1 || this.grid[node.col][node.row + dr] === 1) {
                                continue;
                            }
                        }
                        list.push(new AStarNode(nc, nr));
                    }
                }
            }
        }
        return list;
    }

    reconstructPath(endNode) {
        this.path = [];
        let temp = endNode;
        while (temp !== null) {
            this.path.push({ col: temp.col, row: temp.row });
            temp = temp.parent;
        }
        this.path.reverse();
    }

    driveAgent() {
        if (this.path.length === 0) return;

        let nextIdx = this.agent.pathIdx + 1;
        if (nextIdx >= this.path.length) {
            this.phase = 'PATH_FOUND';
            setTimeout(() => {
                this.selectNextCheckpoint();
            }, 2000);
            return;
        }

        let waypoint = this.path[nextIdx];
        let targetX = waypoint.col * this.cellSize + this.cellSize / 2;
        let targetY = waypoint.row * this.cellSize + this.cellSize / 2;

        let dx = targetX - this.agent.x;
        let dy = targetY - this.agent.y;
        let dist = Math.hypot(dx, dy);
        let speed = 2.0; // Drive speed along pixels

        if (dist <= speed) {
            this.agent.x = targetX;
            this.agent.y = targetY;
            this.agent.col = waypoint.col;
            this.agent.row = waypoint.row;
            this.agent.pathIdx++;
        } else {
            this.agent.x += (dx / dist) * speed;
            this.agent.y += (dy / dist) * speed;
            this.agent.heading = Math.atan2(dy, dx);
        }
    }

    /**
     * Draw the map, A* nodes, paths, and driving agent.
     * Uses canvas translation scaling to ensure perfect resolution-independent layouts.
     */
    draw(isLightTheme = false) {
        this.ctx.save();
        
        // Automatically scale virtual 1000x600 space to fill the physical canvas dimensions
        const scaleX = this.canvas.width / this.virtualWidth;
        const scaleY = this.canvas.height / this.virtualHeight;
        this.ctx.scale(scaleX, scaleY);

        // Color palettes
        const colors = {
            closed: isLightTheme ? 'rgba(79, 70, 229, 0.22)' : 'rgba(99, 102, 241, 0.25)',
            open: isLightTheme ? 'rgba(139, 92, 246, 0.42)' : 'rgba(168, 85, 247, 0.45)',
            path: isLightTheme ? '#1d4ed8' : '#06b6d4',
            pathGlow: isLightTheme ? 'rgba(29, 78, 216, 0.4)' : 'rgba(6, 182, 212, 0.55)',
            poiBg: isLightTheme ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.92)',
            poiBorder: isLightTheme ? '#cbd5e1' : '#334155',
            poiText: isLightTheme ? '#0f172a' : '#f8fafc',
            poiDesc: isLightTheme ? '#475569' : '#94a3b8',
            agent: '#ea580c',
            agentGlow: 'rgba(234, 88, 12, 0.5)',
            watermark: isLightTheme ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.02)'
        };

        if (this.mapLoaded) {
            // Draw high-resolution map
            this.ctx.drawImage(this.mapImage, 0, 0, this.virtualWidth, this.virtualHeight);
        } else {
            // Loading fallback state
            this.ctx.fillStyle = isLightTheme ? '#f8fafc' : '#090d16';
            this.ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);
        }

        // Draw Watermark
        this.ctx.fillStyle = colors.watermark;
        this.ctx.font = '800 68px "Outfit", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText("PITTSBURGH STREET MAP", this.virtualWidth / 2, this.virtualHeight / 2);

        // Draw search closed set (visited road nodes)
        this.closedSet.forEach(node => {
            this.ctx.fillStyle = colors.closed;
            this.ctx.beginPath();
            this.ctx.arc(
                node.col * this.cellSize + this.cellSize / 2,
                node.row * this.cellSize + this.cellSize / 2,
                3, 0, Math.PI * 2
            );
            this.ctx.fill();
        });

        // Draw search open set (frontier road nodes)
        this.openSet.forEach(node => {
            this.ctx.strokeStyle = colors.open;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(
                node.col * this.cellSize + this.cellSize / 2,
                node.row * this.cellSize + this.cellSize / 2,
                2, 0, Math.PI * 2
            );
            this.ctx.stroke();
        });

        // Draw planned route line along roads
        if (this.path.length > 0) {
            this.ctx.strokeStyle = colors.path;
            this.ctx.lineWidth = 5;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.shadowColor = colors.pathGlow;
            this.ctx.shadowBlur = 8;
            
            this.ctx.beginPath();
            this.path.forEach((pt, idx) => {
                let x = pt.col * this.cellSize + this.cellSize / 2;
                let y = pt.row * this.cellSize + this.cellSize / 2;
                if (idx === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            });
            this.ctx.stroke();
            this.ctx.shadowBlur = 0; // Reset
        }

        // Draw vehicle agent driving on roads
        if (this.agent.active) {
            this.ctx.shadowColor = colors.agentGlow;
            this.ctx.shadowBlur = 8;
            this.ctx.fillStyle = colors.agent;
            
            this.ctx.beginPath();
            let x = this.agent.x;
            let y = this.agent.y;
            let angle = this.agent.heading || 0;
            let size = 7;
            
            this.ctx.moveTo(x + Math.cos(angle) * size * 1.6, y + Math.sin(angle) * size * 1.6);
            this.ctx.lineTo(x + Math.cos(angle + Math.PI * 0.8) * size, y + Math.sin(angle + Math.PI * 0.8) * size);
            this.ctx.lineTo(x + Math.cos(angle - Math.PI * 0.8) * size, y + Math.sin(angle - Math.PI * 0.8) * size);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        // Draw landmark milestone badges
        this.checkpoints.forEach((cp) => {
            let x = cp.col * this.cellSize + this.cellSize / 2;
            let y = cp.row * this.cellSize + this.cellSize / 2;

            let isCurrentTarget = this.targetNode && (this.targetNode.col === cp.col && this.targetNode.row === cp.row) && !this.customGoal;
            let isCurrentStart = this.startNode && (this.startNode.col === cp.col && this.startNode.row === cp.row);

            // Pulse Pin
            this.ctx.fillStyle = isCurrentTarget ? '#ef4444' : (isCurrentStart ? '#10b981' : '#6366f1');
            this.ctx.beginPath();
            this.ctx.arc(x, y, 6.5, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            // Labeled Badge Card
            let textOffset = (cp.row > this.rows * 0.5) ? -22 : 16;
            this.ctx.font = 'bold 9.5px "Inter", sans-serif';
            this.ctx.textAlign = 'center';
            
            let nameWidth = this.ctx.measureText(cp.name).width;
            
            this.ctx.fillStyle = colors.poiBg;
            this.ctx.strokeStyle = colors.poiBorder;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(x - nameWidth / 2 - 6, y + textOffset - 9, nameWidth + 12, 13, 4);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = colors.poiText;
            this.ctx.fillText(cp.name, x, y + textOffset);
        });

        // Draw custom clicked goal pin
        if (this.customGoal) {
            let x = this.customGoal.col * this.cellSize + this.cellSize / 2;
            let y = this.customGoal.row * this.cellSize + this.cellSize / 2;

            this.ctx.fillStyle = '#ef4444';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 7.5, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            let textOffset = (this.customGoal.row > this.rows * 0.5) ? -22 : 16;
            this.ctx.font = 'bold 10px "Inter", sans-serif';
            this.ctx.textAlign = 'center';
            
            this.ctx.fillStyle = colors.poiBg;
            this.ctx.strokeStyle = '#ef4444';
            this.ctx.lineWidth = 1.2;
            this.ctx.beginPath();
            this.ctx.roundRect(x - 48, y + textOffset - 9, 96, 13, 4);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = '#ef4444';
            this.ctx.fillText("CUSTOM GOAL", x, y + textOffset);
        }

        // Draw live telemetry dashboard panel
        if (this.startNode && this.targetNode) {
            let startName = "START";
            let targetName = this.customGoal ? "CUSTOM GOAL" : "DESTINATION";

            let startCP = this.checkpoints.find(cp => cp.col === this.startNode.col && cp.row === this.startNode.row);
            if (startCP) startName = startCP.name;

            if (!this.customGoal) {
                let targetCP = this.checkpoints.find(cp => cp.col === this.targetNode.col && cp.row === this.targetNode.row);
                if (targetCP) targetName = targetCP.name;
            }

            this.ctx.fillStyle = isLightTheme ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.94)';
            this.ctx.strokeStyle = colors.poiBorder;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(20, 20, 310, 62, 8);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = isLightTheme ? '#0f172a' : '#ffffff';
            this.ctx.textAlign = 'left';
            
            this.ctx.font = 'bold 10px "Outfit", sans-serif';
            this.ctx.fillText("A* REAL-TIME STREET ROUTING", 30, 34);
            
            this.ctx.font = '600 9px "Fira Code", monospace';
            this.ctx.fillStyle = '#10b981'; // Green
            this.ctx.fillText(`FROM: ${startName.toUpperCase()}`, 30, 48);
            
            this.ctx.fillStyle = '#ef4444'; // Red
            this.ctx.fillText(`TO:   ${targetName.toUpperCase()}`, 30, 61);

            // Instructions text inside HUD
            this.ctx.font = 'italic 8px "Inter", sans-serif';
            this.ctx.fillStyle = colors.poiDesc;
            this.ctx.fillText("Click any road to route live", 185, 34);
        }

        this.ctx.restore();
    }
}

window.AStarVisualizer = AStarVisualizer;
