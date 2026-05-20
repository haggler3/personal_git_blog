/**
 * Grid-based A* Pathfinding Visualizer
 * Traces out paths between checkpoints mapping letters of "ZACHARY ZDOBINSKI"
 * on a 2D occupancy grid with static obstacles.
 * 
 * Algorithm cost: f(n) = g(n) + h(n)
 * Heuristic: Euclidean or Octile distance (admissible and consistent)
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
        this.cellSize = 16;
        this.cols = Math.floor(canvas.width / this.cellSize);
        this.rows = Math.floor(canvas.height / this.cellSize);
        
        // Simulation parameters
        this.obstacleDensity = 0.22; // 22% obstacles by default
        this.searchSpeed = 6;        // Nodes expanded per frame
        
        // State matrices
        this.grid = [];             // 0: empty, 1: obstacle, 2: letter point
        this.openSet = [];
        this.closedSet = [];
        this.path = [];
        this.letters = [];          // Key coordinates representing characters
        
        // Start, Target, and Agent
        this.startNode = null;
        this.targetNode = null;
        this.currentNode = null;
        this.agent = { col: 0, row: 0, x: 0, y: 0, pathIdx: 0, active: false };
        
        // Visualizer phases: 'INIT', 'SEARCHING', 'PATH_FOUND', 'DRIVING', 'NO_PATH'
        this.phase = 'INIT';
        this.letterIndex = 0;
        
        this.generateGrid();
        this.extractLetterNodes();
        this.selectNextCheckpoint();
    }

    /**
     * Generate standard grid map with randomized obstacles
     */
    generateGrid() {
        this.grid = [];
        for (let c = 0; c < this.cols; c++) {
            this.grid[c] = [];
            for (let r = 0; r < this.rows; r++) {
                // Border cells are open. Middle cells have random obstacles based on density
                let isBorder = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
                let isObstacle = !isBorder && Math.random() < this.obstacleDensity;
                this.grid[c][r] = isObstacle ? 1 : 0;
            }
        }
    }

    /**
     * Map characters of ZACHARY ZDOBINSKI onto grid coordinates as target checkpoints
     */
    extractLetterNodes() {
        this.letters = [];
        const text = "ZACHARY ZDOBINSKI";
        const charWidth = 45;
        const charHeight = 65;
        const charSpacing = 12;
        const wordSpacing = 28;
        
        // Calculate total text width to center it on the canvas
        const words = text.split(' ');
        let totalWidth = 0;
        for (let w = 0; w < words.length; w++) {
            totalWidth += words[w].length * (charWidth + charSpacing) - charSpacing;
            if (w < words.length - 1) totalWidth += wordSpacing;
        }

        let startX = (this.canvas.width - totalWidth) / 2;
        let startY = (this.canvas.height - charHeight) / 2;
        let currentX = startX;

        for (let w = 0; w < words.length; w++) {
            const word = words[w];
            for (let c = 0; c < word.length; c++) {
                const char = word[c];
                const strokes = window.LETTER_STROKES ? window.LETTER_STROKES[char] : null;
                if (strokes) {
                    // Extract vertices of each letter to use as checkpoints
                    strokes.forEach(stroke => {
                        stroke.forEach(pt => {
                            let px = currentX + pt.x * charWidth;
                            let py = startY + pt.y * charHeight;
                            
                            // Map to grid coordinates
                            let gCol = Math.floor(px / this.cellSize);
                            let gRow = Math.floor(py / this.cellSize);
                            
                            // Ensure within bounds
                            gCol = Math.max(1, Math.min(this.cols - 2, gCol));
                            gRow = Math.max(1, Math.min(this.rows - 2, gRow));
                            
                            // Ensure not blocked by obstacle
                            this.grid[gCol][gRow] = 0; // Clear obstacle at checkpoints
                            
                            // Add node if not already present
                            if (!this.letters.some(l => l.col === gCol && l.row === gRow)) {
                                this.letters.push({ col: gCol, row: gRow });
                            }
                        });
                    });
                }
                currentX += charWidth + charSpacing;
            }
            currentX += wordSpacing - charSpacing;
        }
    }

    /**
     * Choose the next target letter checkpoint for A* to navigate towards
     */
    selectNextCheckpoint() {
        if (this.letters.length === 0) return;

        // Set start node as the previous target (or first letter if just initialized)
        if (this.targetNode) {
            this.startNode = new AStarNode(this.targetNode.col, this.targetNode.row);
        } else {
            let startChar = this.letters[0];
            this.startNode = new AStarNode(startChar.col, startChar.row);
        }

        // Choose next letter checkpoint sequentially
        this.letterIndex = (this.letterIndex + 1) % this.letters.length;
        let nextChar = this.letters[this.letterIndex];
        this.targetNode = new AStarNode(nextChar.col, nextChar.row);

        // Clear obstacles around start and target to guarantee a path is possible
        this.clearObstaclesAround(this.startNode.col, this.startNode.row);
        this.clearObstaclesAround(this.targetNode.col, this.targetNode.row);

        // Reset search states
        this.openSet = [this.startNode];
        this.closedSet = [];
        this.path = [];
        this.phase = 'SEARCHING';

        // Initialize agent position
        this.agent.col = this.startNode.col;
        this.agent.row = this.startNode.row;
        this.agent.x = this.startNode.col * this.cellSize + this.cellSize / 2;
        this.agent.y = this.startNode.row * this.cellSize + this.cellSize / 2;
        this.agent.pathIdx = 0;
        this.agent.active = false;
    }

    clearObstaclesAround(col, row) {
        for (let c = -1; c <= 1; c++) {
            for (let r = -1; r <= 1; r++) {
                let nc = col + c;
                let nr = row + r;
                if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                    this.grid[nc][nr] = 0; // Clear obstacle
                }
            }
        }
    }

    /**
     * Run search loops (representing real-time node evaluation)
     */
    step() {
        if (this.phase === 'SEARCHING') {
            // Expand multiple nodes per frame for a fast, responsive animation
            for (let iteration = 0; iteration < this.searchSpeed; iteration++) {
                if (this.openSet.length === 0) {
                    this.phase = 'NO_PATH';
                    // Re-attempt grid setup to resolve blockages
                    setTimeout(() => {
                        this.generateGrid();
                        this.extractLetterNodes();
                        this.selectNextCheckpoint();
                    }, 1500);
                    return;
                }

                // 1. Find node in openSet with lowest f(n) cost
                let lowestIdx = 0;
                for (let i = 1; i < this.openSet.length; i++) {
                    if (this.openSet[i].f < this.openSet[lowestIdx].f) {
                        lowestIdx = i;
                    }
                }

                let current = this.openSet[lowestIdx];
                this.currentNode = current;

                // 2. Goal Check: Goal reached
                if (current.equals(this.targetNode)) {
                    this.reconstructPath(current);
                    this.phase = 'DRIVING';
                    this.agent.active = true;
                    this.agent.pathIdx = 0;
                    return;
                }

                // 3. Move current node from Open to Closed list
                this.openSet.splice(lowestIdx, 1);
                this.closedSet.push(current);

                // 4. Generate Neighbors (8-way grid connectivity)
                let neighbors = this.getNeighbors(current);
                
                for (let i = 0; i < neighbors.length; i++) {
                    let neighbor = neighbors[i];

                    // Skip if neighbor is already in closedSet
                    if (this.closedSet.some(c => c.equals(neighbor))) {
                        continue;
                    }

                    // Cost of step (1.0 for straight, 1.414 for diagonal)
                    let dG = (neighbor.col !== current.col && neighbor.row !== current.row) ? 1.414 : 1.0;
                    let tentativeG = current.g + dG;

                    let existingOpen = this.openSet.find(o => o.equals(neighbor));

                    if (!existingOpen || tentativeG < existingOpen.g) {
                        neighbor.g = tentativeG;
                        // Octile Distance heuristic: h(n)
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

    /**
     * Compute Heuristic h(n): Octile Distance
     */
    heuristic(a, b) {
        let dx = Math.abs(a.col - b.col);
        let dy = Math.abs(a.row - b.row);
        // Cost of straight: 1.0, Cost of diagonal: 1.414
        return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
    }

    /**
     * Retrieve valid grid neighbors
     */
    getNeighbors(node) {
        let list = [];
        // 8-directional exploration
        for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (dc === 0 && dr === 0) continue;

                let nc = node.col + dc;
                let nr = node.row + dr;

                if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                    // Check if cell is open (not an obstacle)
                    if (this.grid[nc][nr] !== 1) {
                        // Prevent cutting corners through diagonal obstacles
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

    /**
     * Reconstruct path from goal node back to start using parent nodes
     */
    reconstructPath(endNode) {
        this.path = [];
        let temp = endNode;
        while (temp !== null) {
            this.path.push({ col: temp.col, row: temp.row });
            temp = temp.parent;
        }
        this.path.reverse(); // Standard forward path
    }

    /**
     * Animate agent along calculated path points
     */
    driveAgent() {
        if (this.path.length === 0) return;

        let targetWaypointIdx = this.agent.pathIdx + 1;
        if (targetWaypointIdx >= this.path.length) {
            // Target checkpoint reached! Select next checkpoint to repeat loop
            this.phase = 'PATH_FOUND';
            setTimeout(() => {
                this.selectNextCheckpoint();
            }, 500);
            return;
        }

        let targetWaypoint = this.path[targetWaypointIdx];
        let targetX = targetWaypoint.col * this.cellSize + this.cellSize / 2;
        let targetY = targetWaypoint.row * this.cellSize + this.cellSize / 2;

        let dx = targetX - this.agent.x;
        let dy = targetY - this.agent.y;
        let dist = Math.hypot(dx, dy);
        let driveSpeed = 3.5; // Agent movement speed in pixels per frame

        if (dist <= driveSpeed) {
            // Snap to node
            this.agent.x = targetX;
            this.agent.y = targetY;
            this.agent.col = targetWaypoint.col;
            this.agent.row = targetWaypoint.row;
            this.agent.pathIdx++;
        } else {
            // Move smoothly towards next grid point
            this.agent.x += (dx / dist) * driveSpeed;
            this.agent.y += (dy / dist) * driveSpeed;
            this.agent.heading = Math.atan2(dy, dx);
        }
    }

    /**
     * Set obstacle density from HUD slider
     */
    setObstacleDensity(density) {
        if (density !== this.obstacleDensity) {
            this.obstacleDensity = density;
            this.generateGrid();
            this.extractLetterNodes();
            this.selectNextCheckpoint();
        }
    }

    /**
     * Grid Renderer Method
     */
    draw(isLightTheme = false) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Styling tokens
        const colors = {
            obstacle: isLightTheme ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)',
            gridLines: isLightTheme ? 'rgba(0, 0, 0, 0.015)' : 'rgba(255, 255, 255, 0.01)',
            start: '#10b981',        // Green
            target: '#ef4444',       // Red
            open: isLightTheme ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.2)', // Violet border
            closed: isLightTheme ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)', // Faint blue-grey fill
            path: '#06b6d4',          // Neon Cyan
            agent: '#f59e0b',         // Orange/Amber
            letters: isLightTheme ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)'
        };

        // 1. Draw Grid GridLines and Obstacles
        this.ctx.strokeStyle = colors.gridLines;
        this.ctx.lineWidth = 0.5;
        
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                let x = c * this.cellSize;
                let y = r * this.cellSize;
                
                // Draw cells
                if (this.grid[c][r] === 1) {
                    this.ctx.fillStyle = colors.obstacle;
                    this.ctx.fillRect(x + 1, y + 1, this.cellSize - 1, this.cellSize - 1);
                }
                
                // Draw faint boundary grid
                this.ctx.strokeRect(x, y, this.cellSize, this.cellSize);
            }
        }

        // 2. Draw Letter check points faintly
        this.ctx.fillStyle = colors.letters;
        this.letters.forEach(pt => {
            this.ctx.fillRect(
                pt.col * this.cellSize + 1,
                pt.row * this.cellSize + 1,
                this.cellSize - 1,
                this.cellSize - 1
            );
        });

        // 3. Draw Closed Set (Visited nodes)
        this.ctx.fillStyle = colors.closed;
        this.closedSet.forEach(node => {
            this.ctx.fillRect(
                node.col * this.cellSize + 1,
                node.row * this.cellSize + 1,
                this.cellSize - 1,
                this.cellSize - 1
            );
        });

        // 4. Draw Open Set (Frontier nodes)
        this.ctx.strokeStyle = colors.open;
        this.ctx.lineWidth = 1;
        this.openSet.forEach(node => {
            this.ctx.strokeRect(
                node.col * this.cellSize + 1.5,
                node.row * this.cellSize + 1.5,
                this.cellSize - 2,
                this.cellSize - 2
            );
        });

        // 5. Draw Target and Start Nodes
        if (this.startNode) {
            this.ctx.fillStyle = colors.start;
            this.ctx.fillRect(
                this.startNode.col * this.cellSize + 1,
                this.startNode.row * this.cellSize + 1,
                this.cellSize - 1,
                this.cellSize - 1
            );
        }
        if (this.targetNode) {
            this.ctx.fillStyle = colors.target;
            this.ctx.fillRect(
                this.targetNode.col * this.cellSize + 1,
                this.targetNode.row * this.cellSize + 1,
                this.cellSize - 1,
                this.cellSize - 1
            );
        }

        // 6. Draw Final optimal Path (Neon line)
        if (this.path.length > 0) {
            this.ctx.strokeStyle = colors.path;
            this.ctx.lineWidth = 3;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.shadowColor = colors.path;
            this.ctx.shadowBlur = 8; // Glowing effect
            
            this.ctx.beginPath();
            this.path.forEach((pt, idx) => {
                let x = pt.col * this.cellSize + this.cellSize / 2;
                let y = pt.row * this.cellSize + this.cellSize / 2;
                if (idx === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            });
            this.ctx.stroke();
            
            this.ctx.shadowBlur = 0; // Reset shadow blur
        }

        // 7. Draw Driving Agent (Robot representation)
        if (this.agent.active) {
            this.ctx.fillStyle = colors.agent;
            this.ctx.beginPath();
            
            // Draw a neat directional triangle representating a differential drive vehicle
            let headX = this.agent.x;
            let headY = this.agent.y;
            let angle = this.agent.heading || 0;
            let rSize = 6;
            
            this.ctx.moveTo(headX + Math.cos(angle) * rSize * 1.5, headY + Math.sin(angle) * rSize * 1.5);
            this.ctx.lineTo(headX + Math.cos(angle + Math.PI * 0.8) * rSize, headY + Math.sin(angle + Math.PI * 0.8) * rSize);
            this.ctx.lineTo(headX + Math.cos(angle - Math.PI * 0.8) * rSize, headY + Math.sin(angle - Math.PI * 0.8) * rSize);
            this.ctx.closePath();
            this.ctx.fill();
        }
    }
}
window.AStarVisualizer = AStarVisualizer;
