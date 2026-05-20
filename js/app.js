/**
 * Main Application Logic & HUD Dashboard Controller
 * Handles visualizer loop, sliders, navigation, and theme switches
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
    const btnReset = document.getElementById('btn-reset');
    const btnPause = document.getElementById('btn-pause');
    const selectTheme = document.getElementById('select-pf-theme');
    
    // HUD Sliders & Text Values
    const slider1 = document.getElementById('input-slider-1');
    const valSlider1 = document.getElementById('val-slider-1');
    
    const slider2 = document.getElementById('input-slider-2');
    const valSlider2 = document.getElementById('val-slider-2');
    
    const slider3 = document.getElementById('input-slider-3');
    const valSlider3 = document.getElementById('val-slider-3');
    
    // HUD Dashboard Display Values
    const valNeff = document.getElementById('val-neff');
    const valRmse = document.getElementById('val-rmse');
    const valState = document.getElementById('val-state');

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
        canvas.height = Math.round(containerWidth * 0.30); // Slimmer height for tighter header look

        // Recompile path coordinate mapping on resize
        if (pfEngine) {
            pfEngine.compileTextPath();
            pfEngine.reset();
        }
    }

    // Instantiate engine objects
    let pfEngine = null;
    let isPaused = false;

    // Load canvas
    setTimeout(() => {
        pfEngine = new ParticleFilter(canvas);
        
        resizeCanvas();
        loadingScreen.classList.add('hidden');
        
        // Start animation loop
        requestAnimationFrame(loop);
    }, 800);

    window.addEventListener('resize', resizeCanvas);

    // Simulation Reset
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (pfEngine) {
                pfEngine.reset();
            }
        });
    }

    // Simulation Pause
    if (btnPause) {
        btnPause.addEventListener('click', () => {
            isPaused = !isPaused;
            btnPause.innerHTML = isPaused ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
            lucide.createIcons();
        });
    }

    // Theme selector change
    if (selectTheme) {
        selectTheme.addEventListener('change', (e) => {
            if (pfEngine) {
                pfEngine.theme = e.target.value;
            }
        });
    }

    // 6. Handle Slider Value Changes
    if (slider1) {
        slider1.addEventListener('input', () => {
            let val = parseFloat(slider1.value);
            if (pfEngine) {
                pfEngine.stdR = val;
                valSlider1.innerText = val.toFixed(2);
            }
        });
    }

    if (slider2) {
        slider2.addEventListener('input', () => {
            let val = parseInt(slider2.value);
            if (pfEngine) {
                pfEngine.numParticles = val;
                pfEngine.reset(); // Need re-init for particles length
                valSlider2.innerText = val;
            }
        });
    }

    if (slider3) {
        slider3.addEventListener('input', () => {
            let val = parseFloat(slider3.value);
            if (pfEngine) {
                pfEngine.stdQ = val;
                valSlider3.innerText = val.toFixed(3);
            }
        });
    }

    // ==========================================================================
    // ANIMATION & SIMULATION LOOP
    // ==========================================================================
    function loop() {
        if (!isPaused) {
            // Update models
            if (pfEngine) {
                pfEngine.step();
            }
        }

        // Render Canvas
        if (pfEngine) {
            pfEngine.draw(isLightTheme);
            
            // Update Dashboard values
            if (valNeff) valNeff.innerText = pfEngine.nEff.toFixed(1);
            if (valRmse) valRmse.innerText = (pfEngine.rmse / 10).toFixed(3) + "m";
            if (valState) valState.innerText = `[${pfEngine.estimate.px.toFixed(0)}, ${pfEngine.estimate.py.toFixed(0)}]`;
        }

        requestAnimationFrame(loop);
    }
});
