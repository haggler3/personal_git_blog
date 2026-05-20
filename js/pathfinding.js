/**
 * Grid-based A* Pathfinding Visualizer
 * Traces out routes across an actual image map of Pittsburgh, PA.
 * Uses color-based water detection for obstacles, allowing routing around rivers.
 * Allows user to click anywhere on the map to set a goal.
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
        
        // Grid configuration
        this.cellSize = 12; // cell size in pixels
        this.cols = Math.floor(canvas.width / this.cellSize);
        this.rows = Math.floor(canvas.height / this.cellSize);
        
        this.searchSpeed = 6; // Nodes expanded per frame
        this.obstacleDensity = 0.22; // For vector fallback only
        
        // State matrices
        this.grid = [];
        this.openSet = [];
        this.closedSet = [];
        this.path = [];
        
        // Map Image properties
        this.mapImage = new Image();
        this.mapLoaded = false;
        
        this.mapImage.onload = () => {
            this.mapLoaded = true;
            this.generateGridFromImage();
            this.selectNextCheckpoint();
        };
        this.mapImage.src = 'pittsburgh_map.png';

        // Check if already completed (cached)
        if (this.mapImage.complete) {
            setTimeout(() => {
                if (!this.mapLoaded) {
                    this.mapLoaded = true;
                    this.generateGridFromImage();
                    this.selectNextCheckpoint();
                }
            }, 0);
        }

        // Pittsburgh Milestones (Fallback & Auto-routing loop)
        this.checkpoints = [
            {
                name: "University of Pittsburgh",
                desc: "B.S. in Electrical Engineering",
                col: Math.floor(this.cols * 0.60),
                row: Math.floor(this.rows * 0.32)
            },
            {
                name: "Carnegie Mellon University",
                desc: "M.S. in ECE (Estimation & ML)",
                col: Math.floor(this.cols * 0.82),
                row: Math.floor(this.rows * 0.28)
            },
            {
                name: "Bechtel Plant Machinery",
                desc: "Advanced Data Engineer (ML)",
                col: Math.floor(this.cols * 0.65),
                row: Math.floor(this.rows * 0.80)
            },
            {
                name: "Point State Park",
                desc: "Pittsburgh PA (The Point)",
                col: Math.floor(this.cols * 0.12),
                row: Math.floor(this.rows * 0.50)
            }
        ];
        
        // Define bridges to cross rivers (open cells)
        this.defineBridges();

        // Start, Target, and Agent
        this.startNode = null;
        this.targetNode = null;
        this.currentNode = null;
        this.agent = { col: 0, row: 0, x: 0, y: 0, pathIdx: 0, active: false, heading: 0 };
        
        // Custom goal set by clicking
        this.customGoal = null;
        
        // Visualizer phases: 'INIT', 'SEARCHING', 'PATH_FOUND', 'DRIVING'
        this.phase = 'INIT';
        this.checkpointIndex = 0;
        
        // Set up click listener on canvas
        this.setupClickListener();

        // Initialize fallback grid
        this.generateFallbackGrid();
        this.selectNextCheckpoint();
    }

    /**
     * Set up click handler to allow routing to any spot
     */
    setupClickListener() {
        // Remove existing listener if any, and bind
        this.canvas.removeEventListener('click', this.canvasClickHandler);
        this.canvasClickHandler = (event) => {
            // Only capture clicks if A* is the active tab
            const activeTab = document.querySelector('.ctrl-tab-btn.active');
            if (activeTab && activeTab.id === 'btn-astar') {
                const rect = this.canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                this.setGoalAt(x, y);
            }
        };
        this.canvas.addEventListener('click', this.canvasClickHandler);
    }

    /**
     * Define bridge crossings where paths are open
     */
    defineBridges() {
        this.bridges = [
            // West End Bridge (Ohio River)
            { name: "West End Bridge", col: Math.floor(this.cols * 0.06), rowRange: [0.44, 0.56] },
            // Fort Duquesne Bridge (Allegheny River)
            { name: "Fort Duquesne Bridge", col: Math.floor(this.cols * 0.16), rowRange: [0.38, 0.50] },
            // Andy Warhol Bridge (Allegheny River)
            { name: "Andy Warhol Bridge", col: Math.floor(this.cols * 0.30), rowRange: [0.32, 0.44] },
            // Veterans Bridge (Allegheny River)
            { name: "Veterans Bridge", col: Math.floor(this.cols * 0.44), rowRange: [0.24, 0.36] },
            // Fort Pitt Bridge (Monongahela River)
            { name: "Fort Pitt Bridge", col: Math.floor(this.cols * 0.16), rowRange: [0.50, 0.62] },
            // Smithfield Street Bridge (Monongahela River)
            { name: "Smithfield St Bridge", col: Math.floor(this.cols * 0.28), rowRange: [0.54, 0.66] },
            // Birmingham Bridge (Monongahela River)
            { name: "Birmingham Bridge", col: Math.floor(this.cols * 0.52), rowRange: [0.60, 0.72] },
            // Hot Metal Bridge (Monongahela River)
            { name: "Hot Metal Bridge", col: Math.floor(this.cols * 0.70), rowRange: [0.65, 0.78] }
        ];
    }

    /**
     * Unified interface to generate grid depending on image loading status
     */
    generateGrid() {
        if (this.mapLoaded) {
            this.generateGridFromImage();
        } else {
            this.generateFallbackGrid();
        }
    }

    /**
     * Analyze image pixels to determine where water obstacles are
     */
    generateGridFromImage() {
        const offscreen = document.createElement('canvas');
        offscreen.width = this.canvas.width;
        offscreen.height = this.canvas.height;
        const oCtx = offscreen.getContext('2d');
        
        try {
            oCtx.drawImage(this.mapImage, 0, 0, offscreen.width, offscreen.height);
        } catch (e) {
            console.warn("Could not draw map image to offscreen canvas (CORS restriction). Reverting to vector fallback map.", e);
            this.generateFallbackGrid();
            return;
        }

        this.grid = [];
        try {
            for (let c = 0; c < this.cols; c++) {
                this.grid[c] = [];
                for (let r = 0; r < this.rows; r++) {
                    // Sample center of grid cell
                    let sampleX = Math.floor(c * this.cellSize + this.cellSize / 2);
                    let sampleY = Math.floor(r * this.cellSize + this.cellSize / 2);
                    
                    // Get pixel color
                    let imgData = oCtx.getImageData(sampleX, sampleY, 1, 1).data;
                    let red = imgData[0];
                    let green = imgData[1];
                    let blue = imgData[2];

                    // Detect water: In stylized maps, water is blue-ish/cyan-ish.
                    // We test if blue is higher than red and green, or if the color matches a soft blue palette.
                    let isWater = (blue > red + 10) && (blue > green - 10) && (red < 210 || blue > 200);
                    
                    // Keep border columns passable
                    let isBorder = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
                    
                    this.grid[c][r] = (isWater && !isBorder) ? 1 : 0;
                }
            }
        } catch (e) {
            console.warn("Could not read image pixels (CORS security restriction). Reverting to vector fallback map.", e);
            this.generateFallbackGrid();
            return;
        }

        // Apply bridge openings to make sure they are traversable
        this.bridges.forEach(bridge => {
            let startRow = Math.floor(bridge.rowRange[0] * this.rows);
            let endRow = Math.floor(bridge.rowRange[1] * this.rows);
            let col = bridge.col;
            if (col >= 0 && col < this.cols) {
                for (let r = startRow; r <= endRow; r++) {
                    if (r >= 0 && r < this.rows) {
                        this.grid[col][r] = 0; // Clear river obstacle at bridge
                    }
                }
            }
        });

        // Clear obstacles around checkpoints
        this.checkpoints.forEach(cp => {
            this.clearObstaclesAround(cp.col, cp.row, 1);
        });
    }

    /**
     * Fallback mathematical rivers if image fails to load
     */
    isInRiver(c, r) {
        let c_rel = c / this.cols;
        let r_rel = r / this.rows;
        if (c_rel <= 0.12) {
            return Math.abs(r_rel - 0.50) < 0.08;
        }
        let alleghenyCenter = 0.50 - (c_rel - 0.12) * 0.48;
        if (r_rel < 0.50 && Math.abs(r_rel - alleghenyCenter) < 0.06) {
            return true;
        }
        let monongahelaCenter = 0.50 + (c_rel - 0.12) * 0.42;
        if (r_rel > 0.46 && Math.abs(r_rel - monongahelaCenter) < 0.06) {
            return true;
        }
        return false;
    }

    generateFallbackGrid() {
        this.grid = [];
        for (let c = 0; c < this.cols; c++) {
            this.grid[c] = [];
            for (let r = 0; r < this.rows; r++) {
                let isRiver = this.isInRiver(c, r);
                this.grid[c][r] = isRiver ? 1 : 0;
            }
        }

        this.bridges.forEach(bridge => {
            let startRow = Math.floor(bridge.rowRange[0] * this.rows);
            let endRow = Math.floor(bridge.rowRange[1] * this.rows);
            let col = bridge.col;
            if (col >= 0 && col < this.cols) {
                for (let r = startRow; r <= endRow; r++) {
                    if (r >= 0 && r < this.rows) {
                        this.grid[col][r] = 0;
                    }
                }
            }
        });

        this.checkpoints.forEach(cp => {
            this.clearObstaclesAround(cp.col, cp.row, 1);
        });
    }

    /**
     * Route user directly to clicked spot
     */
    setGoalAt(x, y) {
        let gCol = Math.floor(x / this.cellSize);
        let gRow = Math.floor(y / this.cellSize);
        
        gCol = Math.max(1, Math.min(this.cols - 2, gCol));
        gRow = Math.max(1, Math.min(this.rows - 2, gRow));
        
        // Clear obstacle at endpoint if clicked on water
        this.grid[gCol][gRow] = 0;
        this.clearObstaclesAround(gCol, gRow, 1);

        this.customGoal = {
            name: "Custom Goal",
            desc: "User Clicked Target",
            col: gCol,
            row: gRow
        };

        // Start planning path from current agent position
        this.startNode = new AStarNode(this.agent.col, this.agent.row);
        this.targetNode = new AStarNode(gCol, gRow);
        
        this.openSet = [this.startNode];
        this.closedSet = [];
        this.path = [];
        this.phase = 'SEARCHING';
        
        this.agent.active = false;
        this.agent.pathIdx = 0;
    }

    /**
     * Select the next milestone destination along the auto-navigation loop
     */
    selectNextCheckpoint() {
        if (this.checkpoints.length === 0) return;

        this.customGoal = null;

        // Start node is the previous target
        let startCP = this.checkpoints[this.checkpointIndex];
        this.startNode = new AStarNode(startCP.col, startCP.row);

        // Next checkpoint
        this.checkpointIndex = (this.checkpointIndex + 1) % this.checkpoints.length;
        let targetCP = this.checkpoints[this.checkpointIndex];
        this.targetNode = new AStarNode(targetCP.col, targetCP.row);

        // Clear checkpoints
        this.clearObstaclesAround(this.startNode.col, this.startNode.row, 1);
        this.clearObstaclesAround(this.targetNode.col, this.targetNode.row, 1);

        // Reset search structures
        this.openSet = [this.startNode];
        this.closedSet = [];
        this.path = [];
        this.phase = 'SEARCHING';

        // Reset driving agent position
        this.agent.col = this.startNode.col;
        this.agent.row = this.startNode.row;
        this.agent.x = this.startNode.col * this.cellSize + this.cellSize / 2;
        this.agent.y = this.startNode.row * this.cellSize + this.cellSize / 2;
        this.agent.pathIdx = 0;
        this.agent.active = false;
    }

    clearObstaclesAround(col, row, radius = 1) {
        for (let c = -radius; c <= radius; c++) {
            for (let r = -radius; r <= radius; r++) {
                let nc = col + c;
                let nr = row + r;
                if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                    this.grid[nc][nr] = 0;
                }
            }
        }
    }

    /**
     * Step the pathfinding simulation frame
     */
    step() {
        if (this.phase === 'SEARCHING') {
            for (let iteration = 0; iteration < this.searchSpeed; iteration++) {
                if (this.openSet.length === 0) {
                    this.phase = 'INIT';
                    setTimeout(() => {
                        if (this.customGoal) {
                            // If custom goal fails, clear it and resume auto loop
                            this.customGoal = null;
                        }
                        if (this.mapLoaded) {
                            this.generateGridFromImage();
                        } else {
                            this.generateFallbackGrid();
                        }
                        this.selectNextCheckpoint();
                    }, 1000);
                    return;
                }

                // Node with lowest f(n)
                let lowestIdx = 0;
                for (let i = 1; i < this.openSet.length; i++) {
                    if (this.openSet[i].f < this.openSet[lowestIdx].f) {
                        lowestIdx = i;
                    }
                }

                let current = this.openSet[lowestIdx];
                this.currentNode = current;

                // Check if target reached
                if (current.equals(this.targetNode)) {
                    this.reconstructPath(current);
                    this.phase = 'DRIVING';
                    this.agent.active = true;
                    this.agent.pathIdx = 0;
                    return;
                }

                // Move node to closed list
                this.openSet.splice(lowestIdx, 1);
                this.closedSet.push(current);

                // Check neighbors
                let neighbors = this.getNeighbors(current);
                for (let i = 0; i < neighbors.length; i++) {
                    let neighbor = neighbors[i];

                    if (this.closedSet.some(c => c.equals(neighbor))) {
                        continue;
                    }

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
                    if (this.grid[nc][nr] !== 1) { // Not in river
                        // Prevent cutting diagonal walls
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

        let targetWaypointIdx = this.agent.pathIdx + 1;
        if (targetWaypointIdx >= this.path.length) {
            this.phase = 'PATH_FOUND';
            setTimeout(() => {
                this.selectNextCheckpoint();
            }, 1800);
            return;
        }

        let targetWaypoint = this.path[targetWaypointIdx];
        let targetX = targetWaypoint.col * this.cellSize + this.cellSize / 2;
        let targetY = targetWaypoint.row * this.cellSize + this.cellSize / 2;

        let dx = targetX - this.agent.x;
        let dy = targetY - this.agent.y;
        let dist = Math.hypot(dx, dy);
        let driveSpeed = 2.4; // Smooth driving speed

        if (dist <= driveSpeed) {
            this.agent.x = targetX;
            this.agent.y = targetY;
            this.agent.col = targetWaypoint.col;
            this.agent.row = targetWaypoint.row;
            this.agent.pathIdx++;
        } else {
            this.agent.x += (dx / dist) * driveSpeed;
            this.agent.y += (dy / dist) * driveSpeed;
            this.agent.heading = Math.atan2(dy, dx);
        }
    }

    /**
     * Draw the actual Pittsburgh map backdrop and the A* routing overlays
     */
    draw(isLightTheme = false) {
        const colors = {
            closed: isLightTheme ? 'rgba(79, 70, 229, 0.12)' : 'rgba(99, 102, 241, 0.08)',
            open: isLightTheme ? 'rgba(139, 92, 246, 0.28)' : 'rgba(139, 92, 246, 0.22)',
            path: isLightTheme ? '#2563eb' : '#06b6d4',
            pathGlow: isLightTheme ? 'rgba(37, 99, 235, 0.45)' : 'rgba(6, 182, 212, 0.5)',
            textWatermark: isLightTheme ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.015)',
            poiText: isLightTheme ? '#1e293b' : '#f1f5f9',
            poiDesc: isLightTheme ? '#475569' : '#94a3b8',
            poiBg: isLightTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 41, 59, 0.95)',
            poiBorder: isLightTheme ? '#cbd5e1' : '#475569',
            agent: '#ea580c', // Orange
            agentGlow: 'rgba(234, 88, 12, 0.4)'
        };

        if (this.mapLoaded) {
            // Draw actual map image of Pittsburgh
            this.ctx.drawImage(this.mapImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Fallback plain landscape background
            this.ctx.fillStyle = isLightTheme ? '#f8fafc' : '#0f172a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw vector rivers
            this.ctx.fillStyle = isLightTheme ? '#bae6fd' : '#1e293b';
            this.ctx.beginPath();
            let h = this.canvas.height;
            let w = this.canvas.width;
            this.ctx.moveTo(w * 0.12, h * 0.50);
            this.ctx.lineTo(w, h * 0.85 + h * 0.06);
            this.ctx.lineTo(w, h * 0.85 - h * 0.06);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.moveTo(w * 0.12, h * 0.50);
            this.ctx.lineTo(w, h * 0.05 + h * 0.06);
            this.ctx.lineTo(w, h * 0.05 - h * 0.06);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.moveTo(w * 0.12, h * 0.50 - h * 0.08);
            this.ctx.lineTo(0, h * 0.50 - h * 0.08);
            this.ctx.lineTo(0, h * 0.50 + h * 0.08);
            this.ctx.lineTo(w * 0.12, h * 0.50 + h * 0.08);
            this.ctx.closePath();
            this.ctx.fill();
        }

        // Draw Watermark text
        this.ctx.fillStyle = colors.textWatermark;
        this.ctx.font = '800 64px "Outfit", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText("PITTSBURGH, PA", this.canvas.width / 2, this.canvas.height / 2);

        // Render Closed Set (Visited) as small elegant dots
        this.closedSet.forEach(node => {
            this.ctx.fillStyle = colors.closed;
            this.ctx.beginPath();
            this.ctx.arc(
                node.col * this.cellSize + this.cellSize / 2,
                node.row * this.cellSize + this.cellSize / 2,
                2.5, 0, Math.PI * 2
            );
            this.ctx.fill();
        });

        // Render Open Set (Frontier) as smaller circles
        this.openSet.forEach(node => {
            this.ctx.strokeStyle = colors.open;
            this.ctx.lineWidth = 0.75;
            this.ctx.beginPath();
            this.ctx.arc(
                node.col * this.cellSize + this.cellSize / 2,
                node.row * this.cellSize + this.cellSize / 2,
                1.5, 0, Math.PI * 2
            );
            this.ctx.stroke();
        });

        // Draw optimal path as a thick, glowing route line
        if (this.path.length > 0) {
            this.ctx.strokeStyle = colors.path;
            this.ctx.lineWidth = 4;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.shadowColor = colors.pathGlow;
            this.ctx.shadowBlur = 6;
            
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

        // Draw driving Agent with direction indicator
        if (this.agent.active) {
            this.ctx.shadowColor = colors.agentGlow;
            this.ctx.shadowBlur = 8;
            this.ctx.fillStyle = colors.agent;
            this.ctx.beginPath();
            let headX = this.agent.x;
            let headY = this.agent.y;
            let angle = this.agent.heading || 0;
            let rSize = 6;
            
            this.ctx.moveTo(headX + Math.cos(angle) * rSize * 1.5, headY + Math.sin(angle) * rSize * 1.5);
            this.ctx.lineTo(headX + Math.cos(angle + Math.PI * 0.8) * rSize, headY + Math.sin(angle + Math.PI * 0.8) * rSize);
            this.ctx.lineTo(headX + Math.cos(angle - Math.PI * 0.8) * rSize, headY + Math.sin(angle - Math.PI * 0.8) * rSize);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        // Draw Checkpoint Pins
        this.checkpoints.forEach((cp) => {
            let x = cp.col * this.cellSize + this.cellSize / 2;
            let y = cp.row * this.cellSize + this.cellSize / 2;

            let isCurrentTarget = this.targetNode && (this.targetNode.col === cp.col && this.targetNode.row === cp.row) && !this.customGoal;
            let isCurrentStart = this.startNode && (this.startNode.col === cp.col && this.startNode.row === cp.row);

            this.ctx.fillStyle = isCurrentTarget ? '#ef4444' : (isCurrentStart ? '#10b981' : '#6366f1');
            this.ctx.beginPath();
            this.ctx.arc(x, y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            // Label Card (Draw if targeted or mouse-over, here drawn cleanly for reference)
            let textOffset = (cp.row > this.rows * 0.5) ? -24 : 16;
            this.ctx.font = 'bold 9px "Inter", sans-serif';
            this.ctx.textAlign = 'center';
            
            let nameWidth = this.ctx.measureText(cp.name).width;
            this.ctx.fillStyle = colors.poiBg;
            this.ctx.strokeStyle = colors.poiBorder;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(x - nameWidth / 2 - 5, y + textOffset - 9, nameWidth + 10, 13, 4);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = colors.poiText;
            this.ctx.fillText(cp.name, x, y + textOffset);
        });

        // Draw Custom Goal Pin if exists
        if (this.customGoal) {
            let x = this.customGoal.col * this.cellSize + this.cellSize / 2;
            let y = this.customGoal.row * this.cellSize + this.cellSize / 2;

            // Target Pin (Red Pulse)
            this.ctx.fillStyle = '#ef4444';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 7, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Label Card
            let textOffset = (this.customGoal.row > this.rows * 0.5) ? -24 : 16;
            this.ctx.font = 'bold 9.5px "Inter", sans-serif';
            this.ctx.textAlign = 'center';
            
            this.ctx.fillStyle = colors.poiBg;
            this.ctx.strokeStyle = '#ef4444';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(x - 45, y + textOffset - 9, 90, 13, 4);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = '#ef4444';
            this.ctx.fillText("CUSTOM GOAL", x, y + textOffset);
        }

        // Draw live navigation HUD panel
        if (this.startNode && this.targetNode) {
            let startName = "START";
            let targetName = this.customGoal ? "CUSTOM GOAL" : "DESTINATION";

            let startCP = this.checkpoints.find(cp => cp.col === this.startNode.col && cp.row === this.startNode.row);
            if (startCP) startName = startCP.name;

            if (!this.customGoal) {
                let targetCP = this.checkpoints.find(cp => cp.col === this.targetNode.col && cp.row === this.targetNode.row);
                if (targetCP) targetName = targetCP.name;
            }

            this.ctx.fillStyle = isLightTheme ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.92)';
            this.ctx.strokeStyle = colors.poiBorder;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(15, 15, 290, 56, 8);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = isLightTheme ? '#1e293b' : '#ffffff';
            this.ctx.textAlign = 'left';
            
            this.ctx.font = 'bold 9.5px "Outfit", sans-serif';
            this.ctx.fillText("A* REAL-TIME GPS ROUTING", 25, 28);
            
            this.ctx.font = '500 8.5px "Fira Code", monospace';
            this.ctx.fillStyle = '#10b981'; // Green
            this.ctx.fillText(`FROM: ${startName.toUpperCase()}`, 25, 41);
            
            this.ctx.fillStyle = '#ef4444'; // Red
            this.ctx.fillText(`TO:   ${targetName.toUpperCase()}`, 25, 53);

            // Instructions text inside HUD
            this.ctx.font = 'italic 7.5px "Inter", sans-serif';
            this.ctx.fillStyle = colors.poiDesc;
            this.ctx.fillText("Click anywhere on the map to set a custom goal", 130, 28);
        }
    }
}

window.AStarVisualizer = AStarVisualizer;
