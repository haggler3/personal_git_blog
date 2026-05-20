/**
 * Grid-based A* Pathfinding Visualizer
 * Traces out Zachary Zdobinski's professional and academic journey across Pittsburgh, PA
 * on a grid map of Pittsburgh's rivers, bridges, and key landmarks.
 * 
 * Target Points:
 * 1. University of Pittsburgh (BS in EE)
 * 2. Carnegie Mellon University (MS in ECE)
 * 3. Bechtel Plant Machinery (Advanced Data Engineer)
 * 4. Point State Park (The Point - downtown Pittsburgh)
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
        this.cellSize = 12; // Smaller cells for higher resolution map
        this.cols = Math.floor(canvas.width / this.cellSize);
        this.rows = Math.floor(canvas.height / this.cellSize);
        
        this.searchSpeed = 5; // Nodes expanded per frame
        
        // State matrices
        this.grid = [];
        this.openSet = [];
        this.closedSet = [];
        this.path = [];
        
        // Pittsburgh Milestones
        this.checkpoints = [
            {
                name: "University of Pittsburgh",
                desc: "B.S. in Electrical Engineering",
                col: Math.floor(this.cols * 0.60),
                row: Math.floor(this.rows * 0.32)
            },
            {
                name: "Carnegie Mellon University",
                desc: "M.S. in ECE (Estimation & ML Systems)",
                col: Math.floor(this.cols * 0.82),
                row: Math.floor(this.rows * 0.28)
            },
            {
                name: "Bechtel Plant Machinery",
                desc: "Advanced Data Engineer (Machine Learning)",
                col: Math.floor(this.cols * 0.65),
                row: Math.floor(this.rows * 0.80)
            },
            {
                name: "Point State Park",
                desc: "Pittsburgh PA (Dynamic Center)",
                col: Math.floor(this.cols * 0.12),
                row: Math.floor(this.rows * 0.50)
            }
        ];
        
        // Define bridges to cross rivers (open cells)
        this.bridges = [];
        this.defineBridges();

        // Start, Target, and Agent
        this.startNode = null;
        this.targetNode = null;
        this.currentNode = null;
        this.agent = { col: 0, row: 0, x: 0, y: 0, pathIdx: 0, active: false, heading: 0 };
        
        // Visualizer phases: 'INIT', 'SEARCHING', 'PATH_FOUND', 'DRIVING'
        this.phase = 'INIT';
        this.checkpointIndex = 0;
        
        this.generateGrid();
        this.selectNextCheckpoint();
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
     * Helper to determine if a cell falls within Pittsburgh's three rivers
     */
    isInRiver(c, r) {
        let c_rel = c / this.cols;
        let r_rel = r / this.rows;

        // 1. Ohio River (Left side of Point)
        if (c_rel <= 0.12) {
            return Math.abs(r_rel - 0.50) < 0.08;
        }

        // 2. Allegheny River (Flows from Top-Right to Point at 0.12, 0.50)
        // Centerline equation: y_rel = 0.50 - (c_rel - 0.12) * (0.50 - 0.05) / (1.0 - 0.12)
        let alleghenyCenter = 0.50 - (c_rel - 0.12) * 0.48;
        if (r_rel < 0.50 && Math.abs(r_rel - alleghenyCenter) < 0.06) {
            return true;
        }

        // 3. Monongahela River (Flows from Bottom-Right to Point at 0.12, 0.50)
        // Centerline equation: y_rel = 0.50 + (c_rel - 0.12) * (0.85 - 0.50) / (1.0 - 0.12)
        let monongahelaCenter = 0.50 + (c_rel - 0.12) * 0.42;
        if (r_rel > 0.46 && Math.abs(r_rel - monongahelaCenter) < 0.06) {
            return true;
        }

        return false;
    }

    /**
     * Generate the map grid: Rivers are obstacles, Bridges are open gates
     */
    generateGrid() {
        this.grid = [];
        for (let c = 0; c < this.cols; c++) {
            this.grid[c] = [];
            for (let r = 0; r < this.rows; r++) {
                let isRiver = this.isInRiver(c, r);
                this.grid[c][r] = isRiver ? 1 : 0;
            }
        }

        // Apply bridge openings
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

        // Ensure checkpoints themselves are open
        this.checkpoints.forEach(cp => {
            this.clearObstaclesAround(cp.col, cp.row, 1);
        });
    }

    /**
     * Select the next milestone destination along Zachary's career path
     */
    selectNextCheckpoint() {
        if (this.checkpoints.length === 0) return;

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
                        this.generateGrid();
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
            }, 1500);
            return;
        }

        let targetWaypoint = this.path[targetWaypointIdx];
        let targetX = targetWaypoint.col * this.cellSize + this.cellSize / 2;
        let targetY = targetWaypoint.row * this.cellSize + this.cellSize / 2;

        let dx = targetX - this.agent.x;
        let dy = targetY - this.agent.y;
        let dist = Math.hypot(dx, dy);
        let driveSpeed = 2.2; // Smooth driving speed

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
     * Draw the beautiful Pittsburgh Map Backdrop and Pathfinding
     */
    draw(isLightTheme = false) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Themes
        const colors = {
            land: isLightTheme ? '#fcfcfc' : '#0f172a',
            river: isLightTheme ? 'rgba(186, 230, 253, 0.45)' : 'rgba(30, 41, 59, 0.75)',
            riverBorder: isLightTheme ? 'rgba(14, 165, 233, 0.15)' : 'rgba(56, 189, 248, 0.12)',
            bridge: isLightTheme ? '#64748b' : '#94a3b8',
            closed: isLightTheme ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.04)',
            open: isLightTheme ? 'rgba(139, 92, 246, 0.22)' : 'rgba(139, 92, 246, 0.15)',
            path: isLightTheme ? '#4f46e5' : '#06b6d4',
            pathGlow: isLightTheme ? 'rgba(79, 70, 229, 0.4)' : 'rgba(6, 182, 212, 0.5)',
            textWatermark: isLightTheme ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.02)',
            street: isLightTheme ? 'rgba(0, 0, 0, 0.025)' : 'rgba(255, 255, 255, 0.015)',
            poiText: isLightTheme ? '#1e293b' : '#f1f5f9',
            poiDesc: isLightTheme ? '#64748b' : '#94a3b8',
            poiBg: isLightTheme ? '#ffffff' : '#1e293b',
            poiBorder: isLightTheme ? '#cbd5e1' : '#475569',
            agent: '#f59e0b'
        };

        // Draw Land Background
        this.ctx.fillStyle = colors.land;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw large elegant typography Watermark
        this.ctx.fillStyle = colors.textWatermark;
        this.ctx.font = '800 68px "Outfit", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText("ZACHARY ZDOBINSKI", this.canvas.width / 2, this.canvas.height / 2 - 40);
        this.ctx.font = '600 24px "Fira Code", monospace';
        this.ctx.fillText("PITTSBURGH, PA", this.canvas.width / 2, this.canvas.height / 2 + 35);

        // 2. Draw styled Rivers (allegheny, monongahela, ohio)
        this.ctx.fillStyle = colors.river;
        this.ctx.strokeStyle = colors.riverBorder;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        // Define river points for vector path
        let h = this.canvas.height;
        let w = this.canvas.width;

        // Monongahela River shape
        this.ctx.moveTo(w * 0.12, h * 0.50);
        this.ctx.lineTo(w, h * 0.85 + h * 0.06);
        this.ctx.lineTo(w, h * 0.85 - h * 0.06);
        this.ctx.lineTo(w * 0.12 + w * 0.03, h * 0.50 - h * 0.04);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Allegheny River shape
        this.ctx.beginPath();
        this.ctx.moveTo(w * 0.12, h * 0.50);
        this.ctx.lineTo(w, h * 0.05 + h * 0.06);
        this.ctx.lineTo(w, h * 0.05 - h * 0.06);
        this.ctx.lineTo(w * 0.12 + w * 0.03, h * 0.50 + h * 0.04);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Ohio River shape
        this.ctx.beginPath();
        this.ctx.moveTo(w * 0.12, h * 0.50 - h * 0.08);
        this.ctx.lineTo(0, h * 0.50 - h * 0.08);
        this.ctx.lineTo(0, h * 0.50 + h * 0.08);
        this.ctx.lineTo(w * 0.12, h * 0.50 + h * 0.08);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // 3. Draw Faint street lines in Oakland and Downtown
        this.ctx.strokeStyle = colors.street;
        this.ctx.lineWidth = 1;
        // Downtown grid
        for (let i = 1; i < 6; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(w * 0.12 + i * 20, h * 0.35);
            this.ctx.lineTo(w * 0.12 + i * 20 + 20, h * 0.65);
            this.ctx.stroke();
        }
        // Oakland streets (Fifth, Forbes)
        this.ctx.beginPath();
        this.ctx.moveTo(w * 0.40, h * 0.30);
        this.ctx.lineTo(w * 0.90, h * 0.25);
        this.ctx.moveTo(w * 0.40, h * 0.34);
        this.ctx.lineTo(w * 0.90, h * 0.29);
        this.ctx.stroke();

        // 4. Draw Bridges as physical bars crossing rivers
        this.bridges.forEach(bridge => {
            let colX = bridge.col * this.cellSize + this.cellSize / 2;
            let startY = bridge.rowRange[0] * h;
            let endY = bridge.rowRange[1] * h;

            this.ctx.strokeStyle = colors.bridge;
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(colX, startY);
            this.ctx.lineTo(colX, endY);
            this.ctx.stroke();

            // Bridge name
            this.ctx.fillStyle = colors.poiDesc;
            this.ctx.font = '500 8px "Fira Code", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(bridge.name, colX, startY - 4);
        });

        // 5. Draw A* Closed and Open sets
        this.closedSet.forEach(node => {
            this.ctx.fillStyle = colors.closed;
            this.ctx.fillRect(
                node.col * this.cellSize + 1,
                node.row * this.cellSize + 1,
                this.cellSize - 1,
                this.cellSize - 1
            );
        });

        this.openSet.forEach(node => {
            this.ctx.strokeStyle = colors.open;
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(
                node.col * this.cellSize + 1,
                node.row * this.cellSize + 1,
                this.cellSize - 1,
                this.cellSize - 1
            );
        });

        // 6. Draw Final optimal Path (Neon line)
        if (this.path.length > 0) {
            this.ctx.strokeStyle = colors.path;
            this.ctx.lineWidth = 3.5;
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

        // 7. Draw Driving Agent
        if (this.agent.active) {
            this.ctx.fillStyle = colors.agent;
            this.ctx.beginPath();
            let headX = this.agent.x;
            let headY = this.agent.y;
            let angle = this.agent.heading || 0;
            let rSize = 5;
            
            this.ctx.moveTo(headX + Math.cos(angle) * rSize * 1.5, headY + Math.sin(angle) * rSize * 1.5);
            this.ctx.lineTo(headX + Math.cos(angle + Math.PI * 0.8) * rSize, headY + Math.sin(angle + Math.PI * 0.8) * rSize);
            this.ctx.lineTo(headX + Math.cos(angle - Math.PI * 0.8) * rSize, headY + Math.sin(angle - Math.PI * 0.8) * rSize);
            this.ctx.closePath();
            this.ctx.fill();
        }

        // 8. Draw Checkpoint Landmark Pins and Text Boxes
        this.checkpoints.forEach((cp, idx) => {
            let x = cp.col * this.cellSize + this.cellSize / 2;
            let y = cp.row * this.cellSize + this.cellSize / 2;

            // Pin marker
            let isCurrentTarget = this.targetNode && (this.targetNode.col === cp.col && this.targetNode.row === cp.row);
            let isCurrentStart = this.startNode && (this.startNode.col === cp.col && this.startNode.row === cp.row);

            this.ctx.fillStyle = isCurrentTarget ? '#ef4444' : (isCurrentStart ? '#10b981' : '#6366f1');
            this.ctx.beginPath();
            this.ctx.arc(x, y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            // Label Card (Drawn offset)
            let textOffset = (cp.row > this.rows * 0.5) ? -24 : 16;
            this.ctx.font = 'bold 10px "Inter", sans-serif';
            this.ctx.textAlign = 'center';
            
            // Text box background
            let nameWidth = this.ctx.measureText(cp.name).width;
            this.ctx.fillStyle = colors.poiBg;
            this.ctx.strokeStyle = colors.poiBorder;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(x - nameWidth / 2 - 6, y + textOffset - 9, nameWidth + 12, 14, 4);
            this.ctx.fill();
            this.ctx.stroke();

            // Text text
            this.ctx.fillStyle = colors.poiText;
            this.ctx.fillText(cp.name, x, y + textOffset);

            // Subtitle info
            this.ctx.font = '500 7.5px "Fira Code", monospace';
            this.ctx.fillStyle = colors.poiDesc;
            this.ctx.fillText(cp.desc, x, y + textOffset + 12);
        });

        // 9. Draw current navigation HUD overlay in canvas
        if (this.startNode && this.targetNode) {
            let startCP = this.checkpoints.find(cp => cp.col === this.startNode.col && cp.row === this.startNode.row);
            let targetCP = this.checkpoints.find(cp => cp.col === this.targetNode.col && cp.row === this.targetNode.row);
            if (startCP && targetCP) {
                this.ctx.fillStyle = isLightTheme ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.85)';
                this.ctx.strokeStyle = colors.poiBorder;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.roundRect(15, 15, 260, 48, 6);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.fillStyle = '#ffffff';
                this.ctx.textAlign = 'left';
                
                this.ctx.font = 'bold 9px "Outfit", sans-serif';
                this.ctx.fillText("A* GEOGRAPHIC PATH ROUTING", 25, 28);
                
                this.ctx.font = '500 8.5px "Fira Code", monospace';
                this.ctx.fillStyle = '#67e8f9'; // Cyan text
                this.ctx.fillText(`FROM: ${startCP.name.toUpperCase()}`, 25, 40);
                this.ctx.fillStyle = '#fca5a5'; // Light red
                this.ctx.fillText(`TO:   ${targetCP.name.toUpperCase()}`, 25, 52);
            }
        }
    }
}

window.AStarVisualizer = AStarVisualizer;
