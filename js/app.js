/**
 * Main Application Logic & HUD Dashboard Controller
 * Handles visualizer loops, sliders, tab navigation, and theme switches
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();

    // Elements
    const canvas = document.getElementById('algorithm-canvas');
    const loadingScreen = document.querySelector('.canvas-loading');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const mobileToggleBtn = document.querySelector('.mobile-nav-toggle');
    const mobileNavDrawer = document.querySelector('.mobile-nav-drawer');
    const resumeTabs = document.querySelectorAll('.resume-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const contactForm = document.getElementById('contact-me-form');
    const formFeedback = document.getElementById('form-feedback-message');
    
    // HUD Controls
    const btnPF = document.getElementById('btn-pf');
    const btnAStar = document.getElementById('btn-astar');
    const btnReset = document.getElementById('btn-reset');
    const btnPause = document.getElementById('btn-pause');
    
    // HUD Sliders & Text Values
    const slider1 = document.getElementById('input-slider-1');
    const valSlider1 = document.getElementById('val-slider-1');
    const titleSlider1 = document.querySelector('#ctrl-slider-1 .slider-title');
    
    const slider2 = document.getElementById('input-slider-2');
    const valSlider2 = document.getElementById('val-slider-2');
    const titleSlider2 = document.querySelector('#ctrl-slider-2 .slider-title');
    
    const slider3 = document.getElementById('input-slider-3');
    const valSlider3 = document.getElementById('val-slider-3');
    const titleSlider3 = document.querySelector('#ctrl-slider-3 .slider-title');
    
    // HUD Dashboard Display Values
    const valNeff = document.getElementById('val-neff');
    const barNeff = document.getElementById('bar-neff');
    const titleNeff = document.querySelector('#metric-primary .metric-title');
    
    const valRmse = document.getElementById('val-rmse');
    const barRmse = document.getElementById('bar-rmse');
    const titleRmse = document.querySelector('#metric-secondary .metric-title');
    
    const valState = document.getElementById('val-state');
    const titleState = document.querySelector('#metric-tertiary .metric-title');

    // 1. Theme Toggle Management
    let isLightTheme = localStorage.getItem('theme') !== 'dark';
    if (isLightTheme) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }

    themeToggleBtn.addEventListener('click', () => {
        isLightTheme = !isLightTheme;
        if (isLightTheme) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        }
    });

    // 2. Mobile Navigation Drawer
    mobileToggleBtn.addEventListener('click', () => {
        mobileNavDrawer.classList.toggle('open');
        const isOpen = mobileNavDrawer.classList.contains('open');
        mobileToggleBtn.innerHTML = isOpen ? '<i data-lucide="x"></i>' : '<i data-lucide="menu"></i>';
        lucide.createIcons();
    });

    // Close mobile menu on link click
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileNavDrawer.classList.remove('open');
            mobileToggleBtn.innerHTML = '<i data-lucide="menu"></i>';
            lucide.createIcons();
        });
    });

    // 3. Resume Tab Switching
    resumeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs & contents
            resumeTabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to selected tab and match id content
            tab.classList.add('active');
            const targetId = `tab-${tab.getAttribute('data-tab')}`;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // 4. Contact Form Handler (Mock submit)
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Simple client validations
            const name = document.getElementById('contact-name').value;
            const email = document.getElementById('contact-email').value;
            const subject = document.getElementById('contact-subject').value;
            const message = document.getElementById('contact-message').value;

            if (!name || !email || !subject || !message) {
                formFeedback.innerText = "Please fill in all fields.";
                formFeedback.className = "form-feedback error";
                return;
            }

            // Mocking submission
            formFeedback.innerText = "Sending message...";
            formFeedback.className = "form-feedback success";
            
            setTimeout(() => {
                formFeedback.innerText = "Thank you, Zachary will get back to you shortly!";
                contactForm.reset();
            }, 1200);
        });
    }

    // ==========================================================================
    // CANVAS SIMULATION CONFIGURATION
    // ==========================================================================
    
    // Set fixed canvas aspect resolution for internal calculations
    function resizeCanvas() {
        // Find visible width
        let containerWidth = canvas.parentElement.clientWidth;
        canvas.width = containerWidth;
        canvas.height = 480; // Fixed visual height

        // Recompile path coordinate mapping on resize
        if (pfEngine) {
            pfEngine.compileTextPath();
            pfEngine.reset();
        }
        if (astarEngine) {
            astarEngine.cols = Math.floor(canvas.width / astarEngine.cellSize);
            astarEngine.rows = Math.floor(canvas.height / astarEngine.cellSize);
            astarEngine.generateGrid();
            if (astarEngine.extractLetterNodes) {
                astarEngine.extractLetterNodes();
            }
            astarEngine.selectNextCheckpoint();
        }
    }

    // Instantiate engine objects
    let pfEngine = null;
    let astarEngine = null;
    let activeMode = 'pf'; // 'pf' or 'astar'
    let isPaused = false;

    // Load canvas
    setTimeout(() => {
        pfEngine = new ParticleFilter(canvas);
        astarEngine = new AStarVisualizer(canvas);
        
        resizeCanvas();
        loadingScreen.classList.add('hidden');
        
        // Start animation loop
        requestAnimationFrame(loop);
    }, 800);

    window.addEventListener('resize', resizeCanvas);

    // 5. Active HUD Configurations
    function setHUDMode(mode) {
        activeMode = mode;
        if (mode === 'pf') {
            btnPF.classList.add('active');
            btnAStar.classList.remove('active');
            
            // Switch Sliders Config
            titleSlider1.innerText = "Sensor Measurement Noise (σ_R)";
            slider1.min = 0.01;
            slider1.max = 0.8;
            slider1.step = 0.01;
            slider1.value = pfEngine.stdR;
            valSlider1.innerText = pfEngine.stdR;

            titleSlider2.innerText = "Active Particles (N)";
            slider2.min = 20;
            slider2.max = 350;
            slider2.step = 10;
            slider2.value = pfEngine.numParticles;
            valSlider2.innerText = pfEngine.numParticles;

            titleSlider3.innerText = "Process Model Noise (σ_Q)";
            slider3.min = 0.005;
            slider3.max = 0.2;
            slider3.step = 0.005;
            slider3.value = pfEngine.stdQ;
            valSlider3.innerText = pfEngine.stdQ;

            // Switch Display Metrics
            titleNeff.innerText = "Effective Samples (N_eff)";
            titleRmse.innerText = "Tracking Error (RMSE)";
            titleState.innerText = "State Estimate (x̂, ŷ)";
            
            pfEngine.reset();
        } else {
            btnAStar.classList.add('active');
            btnPF.classList.remove('active');
            
            // Switch Sliders Config to A* Options
            titleSlider1.innerText = "Obstacle Grid Density";
            slider1.min = 0.05;
            slider1.max = 0.45;
            slider1.step = 0.01;
            slider1.value = astarEngine.obstacleDensity;
            valSlider1.innerText = (astarEngine.obstacleDensity * 100).toFixed(0) + "%";

            titleSlider2.innerText = "Node Expansion Speed";
            slider2.min = 1;
            slider2.max = 25;
            slider2.step = 1;
            slider2.value = astarEngine.searchSpeed;
            valSlider2.innerText = astarEngine.searchSpeed + "x";

            titleSlider3.innerText = "Cell Grid Size (px)";
            slider3.min = 12;
            slider3.max = 24;
            slider3.step = 2;
            slider3.value = astarEngine.cellSize;
            valSlider3.innerText = astarEngine.cellSize + "px";

            // Switch Display Metrics to A* metrics
            titleNeff.innerText = "Frontier Nodes (Open)";
            titleRmse.innerText = "Visited Nodes (Closed)";
            titleState.innerText = "Robot Position (c, r)";
            
            astarEngine.generateGrid();
            if (astarEngine.extractLetterNodes) {
                astarEngine.extractLetterNodes();
            }
            astarEngine.selectNextCheckpoint();
        }
    }

    btnPF.addEventListener('click', () => setHUDMode('pf'));
    btnAStar.addEventListener('click', () => setHUDMode('astar'));

    // Handle Reset
    btnReset.addEventListener('click', () => {
        if (activeMode === 'pf') {
            pfEngine.reset();
        } else {
            astarEngine.generateGrid();
            if (astarEngine.extractLetterNodes) {
                astarEngine.extractLetterNodes();
            }
            astarEngine.selectNextCheckpoint();
        }
    });

    // Handle Pause
    btnPause.addEventListener('click', () => {
        isPaused = !isPaused;
        btnPause.innerHTML = isPaused ? '<i data-lucide="play"></i> Resume' : '<i data-lucide="pause"></i> Pause';
        lucide.createIcons();
    });

    // 6. Handle Slider Value Changes
    slider1.addEventListener('input', () => {
        let val = parseFloat(slider1.value);
        if (activeMode === 'pf') {
            pfEngine.stdR = val;
            valSlider1.innerText = val.toFixed(2);
        } else {
            astarEngine.setObstacleDensity(val);
            valSlider1.innerText = (val * 100).toFixed(0) + "%";
        }
    });

    slider2.addEventListener('input', () => {
        let val = parseInt(slider2.value);
        if (activeMode === 'pf') {
            pfEngine.numParticles = val;
            pfEngine.reset(); // Need re-init for particles length
            valSlider2.innerText = val;
        } else {
            astarEngine.searchSpeed = val;
            valSlider2.innerText = val + "x";
        }
    });

    slider3.addEventListener('input', () => {
        let val = parseFloat(slider3.value);
        if (activeMode === 'pf') {
            pfEngine.stdQ = val;
            valSlider3.innerText = val.toFixed(3);
        } else {
            astarEngine.cellSize = val;
            astarEngine.cols = Math.floor(canvas.width / val);
            astarEngine.rows = Math.floor(canvas.height / val);
            astarEngine.generateGrid();
            if (astarEngine.extractLetterNodes) {
                astarEngine.extractLetterNodes();
            }
            astarEngine.selectNextCheckpoint();
            valSlider3.innerText = val + "px";
        }
    });

    // ==========================================================================
    // ANIMATION & SIMULATION LOOP
    // ==========================================================================
    function loop() {
        if (!isPaused) {
            // Update models
            if (activeMode === 'pf' && pfEngine) {
                pfEngine.step();
            } else if (activeMode === 'astar' && astarEngine) {
                astarEngine.step();
            }
        }

        // Render Canvas
        if (activeMode === 'pf' && pfEngine) {
            pfEngine.draw(isLightTheme);
            
            // Update Dashboard values
            valNeff.innerText = pfEngine.nEff.toFixed(1);
            let neffPct = Math.min((pfEngine.nEff / pfEngine.numParticles) * 100, 100);
            barNeff.style.width = neffPct + "%";
            
            valRmse.innerText = (pfEngine.rmse / 10).toFixed(3) + "m";
            let rmsePct = Math.min((pfEngine.rmse / 60) * 100, 100);
            barRmse.style.width = rmsePct + "%";
            
            valState.innerText = `[${pfEngine.estimate.px.toFixed(0)}, ${pfEngine.estimate.py.toFixed(0)}]`;
            
            // Flash indicator border if resampling occurs
            const metricCardNeff = document.getElementById('metric-primary');
            if (pfEngine.isResampling) {
                metricCardNeff.style.borderColor = 'var(--accent-primary)';
                metricCardNeff.style.boxShadow = '0 0 10px rgba(139, 92, 246, 0.2)';
            } else {
                metricCardNeff.style.borderColor = 'transparent';
                metricCardNeff.style.boxShadow = 'none';
            }
            
        } else if (activeMode === 'astar' && astarEngine) {
            astarEngine.draw(isLightTheme);
            
            // Update A* Dashboard metrics
            valNeff.innerText = astarEngine.openSet.length;
            let openPct = Math.min((astarEngine.openSet.length / 100) * 100, 100);
            barNeff.style.width = openPct + "%";
            
            valRmse.innerText = astarEngine.closedSet.length;
            let closedPct = Math.min((astarEngine.closedSet.length / (astarEngine.cols * astarEngine.rows)) * 100, 100);
            barRmse.style.width = closedPct + "%";
            
            valState.innerText = `[${astarEngine.agent.col}, ${astarEngine.agent.row}]`;
        }

        requestAnimationFrame(loop);
    }
});
