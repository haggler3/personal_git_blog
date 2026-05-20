/**
 * Static JSON Blog Posts Data
 * Bypasses browser CORS restrictions when running via file:// protocol
 */

window.BLOG_POSTS = [
    {
        "id": "particle-filtering-tracking",
        "title": "Designing Sequential Monte Carlo Filters for Real-time Pose Estimation",
        "date": "May 15, 2026",
        "category": "Estimation",
        "tags": ["Estimation", "Robotics", "Statistics", "Math"],
        "readTime": "9 min read",
        "excerpt": "A deep dive into Sequential Monte Carlo (SMC) methods: how particle filters tame non-linear, non-Gaussian systems that break Kalman filters — with full math, a live simulation, and Python implementation.",
        "content": "<p>In autonomous systems — from self-driving cars to surgical robots — the fundamental challenge is this: you can never directly observe the system's true state. You only see the <em>noisy footprints</em> it leaves behind. State estimation is the art of reconstructing truth from noise.</p><p>The <strong>Kalman Filter (KF)</strong>, invented in 1960, is the gold standard for linear, Gaussian systems. It computes the mathematically optimal state estimate in closed form. But real robots live in a non-linear world with non-Gaussian noise — radar returns produce multi-modal distributions, wheels slip, and IMUs saturate. When linearity breaks down, the KF breaks with it.</p><p>Enter <strong>Sequential Monte Carlo (SMC)</strong>, or the <em>Particle Filter</em>. Instead of tracking a single Gaussian belief, it tracks a cloud of $N$ hypotheses, each weighted by its plausibility. Given enough particles, it can represent <em>any</em> probability distribution.</p><h2>The Bayesian Foundation</h2><p>State estimation is fundamentally a Bayesian inference problem. We want to compute the posterior distribution over hidden state $\\mathbf{x}_t$ given all observations up to time $t$:</p><div class=\"math-block\">$$p(\\mathbf{x}_t \\mid z_{1:t}) \\propto p(z_t \\mid \\mathbf{x}_t) \\int p(\\mathbf{x}_t \\mid \\mathbf{x}_{t-1}) \\, p(\\mathbf{x}_{t-1} \\mid z_{1:t-1}) \\, d\\mathbf{x}_{t-1}$$</div><p>This <strong>recursive Bayes filter</strong> is exact but intractable for non-linear systems — the integral has no closed-form solution. The particle filter solves this by Monte Carlo approximation: represent the posterior with $N$ weighted samples (particles):</p><div class=\"math-block\">$$p(\\mathbf{x}_t \\mid z_{1:t}) \\approx \\sum_{i=1}^{N} w_t^{[i]} \\, \\delta\\left(\\mathbf{x}_t - \\mathbf{x}_t^{[i]}\\right)$$</div><p>where $w_t^{[i]} \\geq 0$ and $\\sum_i w_t^{[i]} = 1$.</p><h2>The Three-Step SMC Loop</h2><h3>Step 1: Prediction — State Transition via Motion Model</h3><p>Each particle is propagated forward using the system's motion model plus stochastic process noise $\\mathbf{w}_t \\sim \\mathcal{N}(0, Q)$. For a constant-velocity model in 2D pose space $\\mathbf{x} = [p_x, p_y, v_x, v_y]^\\top$:</p><div class=\"math-block\">$$\\mathbf{x}_t^{[i]} = \\mathbf{F} \\mathbf{x}_{t-1}^{[i]} + \\mathbf{w}_t^{[i]}, \\quad \\mathbf{F} = \\begin{bmatrix} 1 & 0 & \\Delta t & 0 \\\\ 0 & 1 & 0 & \\Delta t \\\\ 0 & 0 & 1 & 0 \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}$$</div><p>This accounts for random accelerations and environmental disturbances. With higher process noise $Q$, particles spread more during prediction — modeling higher uncertainty in dynamics.</p><h3>Step 2: Correction — Measurement Likelihood Update</h3><p>When a sensor measurement $z_t$ arrives (e.g., GPS, lidar, or camera-based detection), we update each particle's weight using the likelihood $p(z_t \\mid \\mathbf{x}_t^{[i]})$. Under Gaussian sensor noise $R$:</p><div class=\"math-block\">$$p(z_t \\mid \\mathbf{x}_t^{[i]}) = \\frac{1}{\\sqrt{2\\pi R}} \\exp\\!\\left(-\\frac{\\|z_t - H \\mathbf{x}_t^{[i]}\\|^2}{2R}\\right)$$</div><p>Weights are then updated and normalized:</p><div class=\"math-block\">$$\\tilde{w}_t^{[i]} = w_{t-1}^{[i]} \\cdot p(z_t \\mid \\mathbf{x}_t^{[i]}), \\quad w_t^{[i]} = \\frac{\\tilde{w}_t^{[i]}}{\\sum_j \\tilde{w}_t^{[j]}}$$</div><p>Particles close to the measurement get higher weights; outliers get suppressed. The posterior belief collapses around the measurement.</p><h3>Step 3: Systematic Resampling — Fighting Particle Deprivation</h3><p>Over many timesteps, most particles acquire negligible weight. This is <strong>weight collapse</strong>, measured by the Effective Sample Size (ESS):</p><div class=\"math-block\">$$N_{\\text{eff}} = \\frac{1}{\\sum_{i=1}^{N} (w_t^{[i]})^2}$$</div><p>When $N_{\\text{eff}} < N/2$, we resample. <strong>Systematic Resampling</strong> (as opposed to multinomial) draws a single uniform random offset $U_1 \\sim \\mathcal{U}(0, 1/N)$ and places $N$ equally-spaced pointers across the cumulative weight distribution:</p><div class=\"math-block\">$$U_k = U_1 + \\frac{k-1}{N}, \\quad k = 1, \\dots, N$$</div><p>This gives exactly $O(N)$ complexity and <em>minimizes variance</em> of the estimate compared to naive multinomial sampling. After resampling, all weights are reset to $1/N$.</p><h2>System Architecture</h2><pre><code>  ┌─────────────────────────────────────────────────────────┐
  │               PARTICLE FILTER — SMC LOOP                │
  │                                                         │
  │   ┌─────────────┐    Motion Model     ┌─────────────┐  │
  │   │  Particles   │ ──── F·x + w ────► │  Predicted  │  │
  │   │  { x^[i],   │                     │  Particles  │  │
  │   │    w^[i] }  │                     │  x_t^[i]   │  │
  │   └─────────────┘                     └──────┬──────┘  │
  │          ▲                                   │          │
  │          │ Resample if                       │ Sensor   │
  │          │ N_eff < N/2           Measurement │ z_t      │
  │          │                                   ▼          │
  │   ┌─────────────┐  Normalize    ┌─────────────────────┐ │
  │   │  Resampled  │ ◄─────────── │ Weight Update       │ │
  │   │  Particles  │              │ w^[i] ∝ p(z|x^[i]) │ │
  │   └─────────────┘              └─────────────────────┘ │
  └─────────────────────────────────────────────────────────┘</code></pre><h2>Python Implementation</h2><pre><code class=\"language-python\">import numpy as np

class ParticleFilter:
    def __init__(self, N=200, std_R=0.5, std_Q=0.1):
        self.N = N
        self.R = std_R**2   # measurement noise variance
        self.Q = std_Q      # process noise std dev

        dt = 1.0
        self.F = np.array([[1, 0, dt, 0],   # state transition
                           [0, 1, 0, dt],   # constant velocity model
                           [0, 0, 1,  0],
                           [0, 0, 0,  1]])
        self.H = np.array([[1, 0, 0, 0],    # measurement: observe position only
                           [0, 1, 0, 0]])

    def predict(self, particles):
        """Propagate each particle through motion model + noise."""
        noise = np.random.randn(*particles.shape) * self.Q
        return particles @ self.F.T + noise

    def update(self, particles, weights, measurement):
        """Compute Gaussian likelihood and update weights."""
        predicted_z = particles[:, :2]       # H @ x extracts position
        diff = measurement - predicted_z     # innovation
        dist_sq = np.sum(diff**2, axis=1)
        likelihoods = np.exp(-dist_sq / (2 * self.R))
        weights *= likelihoods
        weights /= (weights.sum() + 1e-12)  # normalize
        return weights

    def neff(self, weights):
        return 1.0 / np.sum(weights**2)

    def resample(self, particles, weights):
        """Systematic resampling for low-variance estimate."""
        N = len(weights)
        positions = (np.arange(N) + np.random.uniform(0, 1)) / N
        cumsum = np.cumsum(weights)
        indices = np.searchsorted(cumsum, positions)
        return particles[indices], np.ones(N) / N

    def estimate(self, particles, weights):
        """Weighted mean of particles = state estimate."""
        return np.average(particles, weights=weights, axis=0)

    def step(self, particles, weights, measurement):
        particles = self.predict(particles)
        weights = self.update(particles, weights, measurement)
        if self.neff(weights) < self.N / 2:
            particles, weights = self.resample(particles, weights)
        return particles, weights, self.estimate(particles, weights)</code></pre><h2>Simulation Results: The Portfolio Visualizer</h2><p>The live particle filter embedded in this portfolio traces my name character-by-character, treating each letter stroke as a sequence of 2D measurements. During transitions between letters — a dead-reckoning phase — no measurements are injected. Watch how:</p><ul><li>🔵 <strong>Particle cloud disperses</strong> as uncertainty grows without sensor correction</li><li>🟢 <strong>Estimate (green)</strong> remains remarkably stable due to momentum from the velocity state</li><li>🔴 <strong>Covariance ellipse expands</strong> visually representing growing uncertainty</li><li>⚡ <strong>Cloud snaps back</strong> the instant a new measurement arrives, demonstrating real-time Bayesian correction</li></ul><p>This is exactly the behavior that makes particle filters so powerful in real robotics: graceful degradation under sensor loss, and instantaneous recovery upon reacquisition.</p>"
    },
    {
        "id": "rl-grpo-deep-dive",
        "title": "Group Relative Policy Optimization (GRPO): Ditching the Critic to Train Better Reasoning Models",
        "date": "April 28, 2026",
        "category": "Machine Learning",
        "tags": ["Machine Learning", "Reinforcement Learning", "LLMs", "Math"],
        "readTime": "11 min read",
        "excerpt": "A rigorous deep dive into GRPO — the algorithm behind DeepSeek-R1. Learn how it eliminates the critic, stabilizes training with relative reward normalization, and why it produces dramatically better reasoning LLMs.",
        "content": "<p>The release of DeepSeek-R1 shocked the AI community not because of its capabilities — but because of how it achieved them. Instead of the expensive four-model RLHF pipeline that OpenAI uses, DeepSeek used a single elegant trick: <strong>Group Relative Policy Optimization (GRPO)</strong>. It's simpler, cheaper, and somehow produces <em>better</em> reasoning. Here's why it works.</p><h2>The Problem with Classic PPO-RLHF</h2><p>Standard Reinforcement Learning from Human Feedback (RLHF) via PPO requires four model instances in GPU memory simultaneously:</p><ul><li><strong>Policy $\\pi_\\theta$</strong>: The model being trained — needs gradients, optimizer states, and activations.</li><li><strong>Reference $\\pi_{\\text{ref}}$</strong>: Frozen copy of the initial SFT model — used to compute the KL penalty.</li><li><strong>Reward $R_\\psi$</strong>: A trained reward model that scores outputs.</li><li><strong>Value / Critic $V_\\phi$</strong>: Estimates expected future reward per token — <em>same size as the policy</em>.</li></ul><p>For a 7B parameter model, this means loading ~4 copies of 14GB into VRAM — requiring an 80GB A100 just to start training. The critic model is the real culprit: it needs to be as large as the policy to accurately model the value function over a high-dimensional token space.</p><p>GRPO's insight: <strong>you don't need to predict absolute value. You only need relative comparisons.</strong></p><h2>The GRPO Algorithm</h2><p>For each input prompt $q$, GRPO samples a group of $G$ complete output sequences from the current policy:</p><div class=\"math-block\">$$\\{o_1, o_2, \\dots, o_G\\} \\sim \\pi_\\theta(\\cdot \\mid q)$$</div><p>Each output is scored by the reward model: $\\{R_1, R_2, \\dots, R_G\\}$. Rather than using a separate critic to estimate a baseline, the baseline is computed <em>directly from the group</em>.</p><h3>The Advantage Function — No Critic Required</h3><p>The standardized group advantage for output $o_i$ is:</p><div class=\"math-block\">$$A_i = \\frac{R_i - \\mu_G}{\\sigma_G + \\epsilon}, \\quad \\text{where} \\quad \\mu_G = \\frac{1}{G}\\sum_{j=1}^G R_j, \\quad \\sigma_G = \\sqrt{\\frac{1}{G}\\sum_{j=1}^G (R_j - \\mu_G)^2}$$</div><p>This is elegant: <em>the group average acts as the baseline</em>. Outputs better than average get positive advantage; worse outputs get negative advantage. No neural network required to estimate this — just arithmetic over the group rewards.</p><h3>The Full GRPO Objective</h3><div class=\"math-block\">$$\\mathcal{L}_{\\text{GRPO}}(\\theta) = \\frac{1}{G} \\sum_{i=1}^G \\left( \\min\\left( r_i(\\theta) A_i, \\; \\text{clip}(r_i(\\theta), 1-\\varepsilon, 1+\\varepsilon) A_i \\right) - \\beta \\, \\mathbb{D}_{\\text{KL}}(\\pi_\\theta \\| \\pi_{\\text{ref}}) \\right)$$</div><p>Where the probability ratio measures how much the policy has changed from the reference for output $o_i$:</p><div class=\"math-block\">$$r_i(\\theta) = \\frac{\\pi_\\theta(o_i \\mid q)}{\\pi_{\\text{ref}}(o_i \\mid q)} = \\exp\\!\\left(\\sum_{t} \\log \\pi_\\theta(o_{i,t}) - \\sum_{t} \\log \\pi_{\\text{ref}}(o_{i,t})\\right)$$</div><p>The <strong>clip</strong> operator prevents any single update from pushing the policy too far — the PPO stability trick. The <strong>KL penalty</strong> term prevents the model from collapsing into reward hacking (outputting gibberish that fools the reward model).</p><h3>The KL Divergence Term (Token-Level)</h3><p>GRPO applies the KL penalty at the token level using the unbiased estimator:</p><div class=\"math-block\">$$\\mathbb{D}_{\\text{KL}}(\\pi_\\theta \\| \\pi_{\\text{ref}}) \\approx \\sum_t \\left[ \\frac{\\pi_{\\text{ref}}(o_{i,t})}{\\pi_\\theta(o_{i,t})} - \\log\\frac{\\pi_{\\text{ref}}(o_{i,t})}{\\pi_\\theta(o_{i,t})} - 1 \\right]$$</div><p>This is always $\\geq 0$ (by Jensen's inequality) and equals zero only when $\\pi_\\theta = \\pi_{\\text{ref}}$, providing a principled regularizer.</p><h2>Architecture Comparison</h2><pre><code>  PPO-RLHF Training Pipeline:
  ┌──────────────────────────────────────────────────────┐
  │  [Policy π_θ] ← gradients                           │
  │  [Reference π_ref] (frozen, inference only)          │
  │  [Reward R_ψ] (frozen, inference only)               │
  │  [Critic V_φ] ← gradients  ← ELIMINATED in GRPO!    │
  │                                                      │
  │  Memory: ~4× model size = 52+ GB for 7B model        │
  └──────────────────────────────────────────────────────┘

  GRPO Training Pipeline:
  ┌──────────────────────────────────────────────────────┐
  │  [Policy π_θ] ← gradients                           │
  │  [Reference π_ref] (frozen, inference only)          │
  │  [Reward R_ψ] (frozen, inference only)               │
  │                                                      │
  │  Baseline = mean(group rewards) ← pure arithmetic!  │
  │  Memory: ~2.5× model size = under 20 GB for 7B      │
  └──────────────────────────────────────────────────────┘</code></pre><h2>Why It Works So Well — Three Reasons</h2><ol><li><strong>Critic models are hard to train for language</strong>. Assigning scalar values to token sequences is inherently ambiguous — the same reasoning step might be high-value in one context and worthless in another. Comparing multiple full completions is a far cleaner signal.</li><li><strong>Self-calibrating difficulty</strong>. As the model improves, $\\mu_G$ rises — so the model must produce increasingly excellent outputs to get positive advantage. There's no target creep or reward scale mismatch; the difficulty automatically tracks the model's capability frontier.</li><li><strong>Gradient stability via normalization</strong>. Dividing by $\\sigma_G$ bounds the magnitude of advantage terms. With PPO, large reward variance leads to gradient spikes; GRPO's standardization prevents this without requiring careful reward scaling.</li></ol><h2>PyTorch Implementation</h2><pre><code class=\"language-python\">import torch
import torch.nn.functional as F

def compute_grpo_loss(
    policy_log_probs,   # [G, seq_len] — per-token log probs under current policy
    ref_log_probs,      # [G, seq_len] — per-token log probs under reference policy
    rewards,            # [G]          — scalar reward for each completion
    kl_beta=0.01,       # KL regularization strength
    clip_eps=0.2,       # PPO clipping epsilon
):
    G = rewards.size(0)

    # ─── Step 1: Compute group-relative advantages ───────────────────────────
    mu_G  = rewards.mean()
    sig_G = rewards.std() + 1e-8
    advantages = (rewards - mu_G) / sig_G  # [G]

    # ─── Step 2: Compute probability ratios (in log-space for stability) ─────
    # Sum per-token log-probs to get sequence log-prob
    policy_seq_logp = policy_log_probs.sum(dim=-1)   # [G]
    ref_seq_logp    = ref_log_probs.sum(dim=-1)       # [G]
    ratios = torch.exp(policy_seq_logp - ref_seq_logp)  # [G]

    # ─── Step 3: Clipped surrogate policy loss ───────────────────────────────
    surr1 = ratios * advantages
    surr2 = torch.clamp(ratios, 1 - clip_eps, 1 + clip_eps) * advantages
    policy_loss = -torch.min(surr1, surr2).mean()

    # ─── Step 4: Token-level KL divergence penalty ───────────────────────────
    # Unbiased estimator: E[r^-1 - log(r^-1) - 1], r = pi_theta / pi_ref
    log_ratio = policy_log_probs - ref_log_probs   # [G, seq_len]
    kl = torch.exp(-log_ratio) + log_ratio - 1     # always >= 0
    kl_loss = kl.sum(dim=-1).mean()

    total_loss = policy_loss + kl_beta * kl_loss
    return total_loss, policy_loss.item(), kl_loss.item()


# ─── Example usage in a training loop ────────────────────────────────────────
def grpo_train_step(model, ref_model, reward_fn, prompt, optimizer, G=8):
    # Sample G completions from current policy
    completions = model.generate(prompt, num_return_sequences=G, do_sample=True)

    # Score all completions
    rewards = torch.tensor([reward_fn(c) for c in completions])

    # Get log probs under policy and reference
    policy_logps = model.get_log_probs(prompt, completions)  # [G, T]
    with torch.no_grad():
        ref_logps = ref_model.get_log_probs(prompt, completions)  # [G, T]

    loss, pl, kl = compute_grpo_loss(policy_logps, ref_logps, rewards)
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
    return loss.item()</code></pre><h2>Results and Impact</h2><p>GRPO was central to the training of DeepSeek-R1, which achieved GPT-4-level performance on MATH, AIME, and coding benchmarks at a fraction of the training cost. The key insight — that relative group comparison is a more natural signal than absolute value prediction for language — has since been validated by numerous open-source reproductions. For local CMU training rigs, GRPO enables fine-tuning of 7B models that match 70B baselines on targeted domains, without multi-GPU clusters.</p>"
    },
    {
        "id": "nuscenes-motion-forecasting",
        "title": "Forecasting Pedestrian & Cyclist Trajectories on NuScenes with Seq2Seq Attention LSTMs",
        "date": "March 12, 2026",
        "category": "Robotics",
        "tags": ["Robotics", "Autonomous Driving", "Deep Learning", "Math"],
        "readTime": "9 min read",
        "excerpt": "How we built a social attention sequence-to-sequence LSTM achieving 0.94m ADE on the NuScenes dataset — with full architecture, math, and training code.",
        "content": "<p>A self-driving car traveling at 30 mph covers 44 feet per second. If a pedestrian steps off a curb, the vehicle has roughly 1.5 seconds to react. At that timescale, <em>reacting</em> is not enough — the car must <em>anticipate</em>. Trajectory forecasting is the problem of predicting where other agents will be in the next 6 seconds, given where they've been.</p><p>This is deceptively hard. Humans move with <em>intent</em> — a pedestrian's future path depends not just on their own history but on other pedestrians, cyclists, traffic signals, and lane geometry. Pure kinematics fail. We need a model that captures social dynamics.</p><h2>Problem Formulation</h2><p>Let agent $i$ have an observed position history over $H = 10$ timesteps (2 seconds at 5 Hz). We represent this as relative displacement vectors — position differences rather than absolute coordinates — to remove frame-of-reference dependence:</p><div class=\"math-block\">$$\\mathcal{X}_i = \\left\\{ \\Delta \\mathbf{x}_i^{-H+1}, \\dots, \\Delta \\mathbf{x}_i^{0} \\right\\}, \\quad \\Delta \\mathbf{x}_i^t = \\mathbf{x}_i^t - \\mathbf{x}_i^{t-1} \\in \\mathbb{R}^2$$</div><p>The goal is to generate $F = 12$ future waypoints (6 seconds at 2 Hz):</p><div class=\"math-block\">$$\\hat{\\mathcal{Y}}_i = \\left\\{ \\hat{\\mathbf{x}}_i^{1}, \\hat{\\mathbf{x}}_i^{2}, \\dots, \\hat{\\mathbf{x}}_i^{12} \\right\\}$$</div><p>And we want to minimize the displacement between predicted and ground-truth waypoints across the future horizon.</p><h2>Architecture: Three-Stage Seq2Seq</h2><h3>Stage 1 — Trajectory Encoding (Encoder LSTM)</h3><p>Each displacement vector is embedded and processed by a shared LSTM encoder that captures temporal motion patterns:</p><div class=\"math-block\">$$h_i^t = \\text{LSTM}_{\\text{enc}}\\!\\left(\\phi(\\Delta \\mathbf{x}_i^t), h_i^{t-1}; \\Theta_{\\text{enc}}\\right), \\quad \\phi(\\cdot) \\text{ is a 2-layer MLP embedding}$$</div><p>After seeing all $H$ historical steps, the terminal hidden state $h_i^0 \\in \\mathbb{R}^{256}$ encodes the agent's full motion profile — their speed, heading, and acceleration tendency.</p><h3>Stage 2 — Social Attention Pooling</h3><p>Agents near each other influence one another's motion. For agent $i$, we collect the hidden states of all neighbors $j \\in \\mathcal{N}_i$ within a $20\\text{m}$ radius. A scaled dot-product attention mechanism computes interaction-aware context:</p><div class=\"math-block\">$$e_{ij} = \\frac{(\\mathbf{W}_Q h_i^0)^\\top (\\mathbf{W}_K h_j^0)}{\\sqrt{d_k}}, \\quad \\alpha_{ij} = \\text{softmax}_j(e_{ij})$$</div><div class=\"math-block\">$$\\mathbf{c}_i = \\sum_{j \\in \\mathcal{N}_i} \\alpha_{ij} \\, (\\mathbf{W}_V h_j^0)$$</div><p>The context vector $\\mathbf{c}_i \\in \\mathbb{R}^{256}$ captures which neighbors are most influential — a pedestrian heading toward agent $i$ gets high attention weight, a stationary bystander gets low weight.</p><h3>Stage 3 — Multi-Modal Decoder</h3><p>We generate $K = 6$ diverse trajectory hypotheses to cover the multi-modal distribution of intent (e.g., crossing vs. turning vs. stopping). The decoder is initialized with a learned projection of $[h_i^0 \\| \\mathbf{c}_i]$ and unrolled autoregressively:</p><div class=\"math-block\">$$\\hat{\\Delta}\\mathbf{x}_i^{t,k} = \\mathbf{W}_{\\text{out}} \\, h_{\\text{dec}}^{t,k} + \\mathbf{b}_{\\text{out}}, \\quad \\hat{\\mathbf{x}}_i^{t,k} = \\hat{\\mathbf{x}}_i^{t-1,k} + \\hat{\\Delta}\\mathbf{x}_i^{t,k}$$</div><h2>System Architecture Diagram</h2><pre><code>  NuScenes Scene Input
  ┌───────────────────────────────────────────────────────────┐
  │  Agent i: [Δx_-9, Δx_-8, ..., Δx_0]  (2-sec history)   │
  │  Agents j: [h_j^0] for j in N_i       (social context)   │
  └────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
  ┌────────────────────────────┐
  │  ENCODER LSTM (shared)     │   ← processes Δx sequence
  │  h_i^t = LSTM(φ(Δx), h)  │
  │  Output: h_i^0 ∈ R^256   │
  └────────────┬───────────────┘
               │
               ▼
  ┌────────────────────────────┐      ┌─────────────────────┐
  │  SOCIAL ATTENTION          │ ◄────│  Neighbor Encodings │
  │  α_ij = softmax(QK^T/√d)  │      │  { h_j^0 }          │
  │  c_i  = Σ α_ij V_j        │      └─────────────────────┘
  └────────────┬───────────────┘
               │  concat [h_i^0 ‖ c_i]
               ▼
  ┌────────────────────────────┐
  │  MULTI-MODAL DECODER (K=6) │   ← generates K trajectory modes
  │  For t=1..12:              │
  │    h_dec = LSTM(Δx_{t-1}) │
  │    Δx_t  = W_out · h_dec  │
  └────────────┬───────────────┘
               │
               ▼
  { ŷ^1, ŷ^2, ..., ŷ^K }   ← K=6 future trajectory hypotheses</code></pre><h2>Training: minADE Loss</h2><p>Human motion is fundamentally multi-modal — at an intersection, a pedestrian might turn left or go straight. We train with the <strong>Best-of-K</strong> (minADE) loss, which selects the closest prediction to ground truth across all $K$ modes:</p><div class=\"math-block\">$$\\mathcal{L}_{\\text{minADE}} = \\min_{k \\in [1,K]} \\frac{1}{F} \\sum_{t=1}^{F} \\left\\| \\mathbf{x}_i^t - \\hat{\\mathbf{x}}_i^{t,k} \\right\\|_2$$</div><p>This prevents mode collapse — where the model hedges all predictions toward a single average trajectory. Each of the $K$ modes is free to specialize in a different behavioral pattern.</p><h2>PyTorch Training Loop</h2><pre><code class=\"language-python\">import torch
import torch.nn as nn

class SocialAttention(nn.Module):
    def __init__(self, d_model=256):
        super().__init__()
        self.Wq = nn.Linear(d_model, d_model)
        self.Wk = nn.Linear(d_model, d_model)
        self.Wv = nn.Linear(d_model, d_model)
        self.scale = d_model ** 0.5

    def forward(self, target_h, neighbor_hs):
        # target_h:    [d]    - target agent hidden state
        # neighbor_hs: [N, d] - neighbor hidden states
        if neighbor_hs.size(0) == 0:
            return torch.zeros_like(target_h)
        q = self.Wq(target_h).unsqueeze(0)   # [1, d]
        k = self.Wk(neighbor_hs)              # [N, d]
        v = self.Wv(neighbor_hs)              # [N, d]
        scores = (q @ k.T) / self.scale       # [1, N]
        attn = torch.softmax(scores, dim=-1)  # [1, N]
        return (attn @ v).squeeze(0)          # [d]


def min_ade_loss(predictions, ground_truth):
    # predictions: [K, F, 2]  K modes, F steps, 2D
    # ground_truth: [F, 2]
    gt_exp = ground_truth.unsqueeze(0).expand_as(predictions)
    per_mode_ade = torch.norm(predictions - gt_exp, dim=-1).mean(dim=-1)  # [K]
    return per_mode_ade.min()


# Training loop excerpt
for batch in dataloader:
    histories, futures, neighbor_hiddens = batch

    # Encode history
    encoder_out, (h_n, _) = encoder_lstm(histories)  # h_n: [1, B, d]
    h_i = h_n.squeeze(0)  # [B, d]

    # Social attention pooling
    context = social_attn(h_i, neighbor_hiddens)  # [B, d]
    decoder_init = torch.cat([h_i, context], dim=-1)  # [B, 2d]

    # Multi-modal decoding (K modes)
    predictions = []
    for k in range(K):
        mode_preds = decoder[k](decoder_init)  # [B, F, 2]
        predictions.append(mode_preds)
    predictions = torch.stack(predictions, dim=1)  # [B, K, F, 2]

    # minADE loss per sample in batch
    loss = sum(min_ade_loss(predictions[b], futures[b]) for b in range(B)) / B
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()</code></pre><h2>Results</h2><ul><li>🎯 <strong>ADE: 0.94m</strong> on NuScenes pedestrian/cyclist test split — competitive with published LSTM baselines</li><li>🌫 <strong>Occlusion Robustness</strong>: The encoder's hidden state acts as a momentum prior during sensor blackouts — predictions remain physically plausible even without position updates for 1-2 seconds</li><li>⚡ <strong>Real-time inference</strong> at &gt;60Hz on a single A100 GPU for 64 agents simultaneously, enabling integration with MPC-based trajectory planners downstream</li></ul>"
    },
    {
        "id": "fine-tuning-llama3",
        "title": "Fine-Tuning Mistral-7B to Beat Llama-3 70B: A Deep Dive into QLoRA Engineering",
        "date": "May 10, 2026",
        "category": "Machine Learning",
        "tags": ["Machine Learning", "Fine-Tuning", "LLMs", "Math"],
        "readTime": "10 min read",
        "excerpt": "How we engineered a domain-specific QLoRA strategy for Mistral-7B that outperformed Llama-3 70B on MedQA and GSM8K — with full theory, benchmarks, and implementation code.",
        "content": "<p>The conventional wisdom in 2024 was: <em>bigger model = better performance</em>. Llama-3 70B required 160GB of VRAM just to load for inference. Our hypothesis: with surgical fine-tuning on domain-specific data, a 10× smaller model could not just match but beat it. It worked.</p><p>This is the story of how we beat Llama-3 70B on MedQA (clinical knowledge) and GSM8K (grade-school math reasoning) using a carefully engineered <strong>QLoRA</strong> strategy applied to Mistral-7B — all on hardware that fits under a desk.</p><h2>Why Fine-Tuned Small Models Beat Large Base Models</h2><p>Large general models are optimized for <em>breadth</em>. Their training data covers everything from cooking recipes to quantum mechanics, which means their parameters are competing to represent vastly different distributions. When you ask Llama-3 70B a USMLE medical question, it must first route through all that general knowledge before specializing.</p><p>A fine-tuned 7B model trained exclusively on medical Q&amp;A doesn't have that routing overhead — <em>all its parameters are optimized for the target domain</em>. The parameter efficiency comes from Low-Rank Adaptation (LoRA), and the memory efficiency comes from 4-bit quantization of the base model.</p><h2>Mathematical Foundation of QLoRA</h2><h3>LoRA: Low-Rank Adaptation</h3><p>Full fine-tuning updates all $d \\times k$ parameters of each weight matrix $W_0$. LoRA observes that the update $\\Delta W$ lies in a low-rank subspace and factorizes it:</p><div class=\"math-block\">$$W_0 + \\Delta W = W_0 + \\frac{\\alpha}{r} W_A W_B, \\quad W_A \\in \\mathbb{R}^{d \\times r},\\; W_B \\in \\mathbb{R}^{r \\times k},\\; r \\ll \\min(d, k)$$</div><p>The forward pass becomes:</p><div class=\"math-block\">$$\\mathbf{y} = \\mathbf{x} W_0^\\top + \\frac{\\alpha}{r} \\mathbf{x} W_A^\\top W_B^\\top$$</div><p>With $r = 64$, the number of trainable parameters per layer drops from $d \\times k$ (e.g., $4096 \\times 4096 = 16.8\\text{M}$) to $r(d + k)$ (e.g., $64 \\times 8192 = 524\\text{K}$) — a <strong>32× compression</strong> of trainable parameters.</p><h3>NF4: NormalFloat Quantization of the Base Model</h3><p>To store $W_0$ in 4 bits, QLoRA uses <strong>NormalFloat (NF4)</strong> — a data type designed for neural network weights, which empirically follow a zero-mean normal distribution. NF4 places quantization grid points at equal quantiles of $\\mathcal{N}(0,1)$:</p><div class=\"math-block\">$$q_i = \\frac{1}{2}\\left(\\Phi^{-1}\\!\\left(\\frac{i}{2^{k}+1}\\right) + \\Phi^{-1}\\!\\left(\\frac{i+1}{2^{k}+1}\\right)\\right), \\quad i = 0, \\dots, 2^k - 1$$</div><p>where $\\Phi^{-1}$ is the inverse CDF of the standard normal. This <strong>information-optimal</strong> quantization minimizes mean squared error for normally-distributed values — far better than uniform quantization which wastes bins on rare extreme values.</p><p>Each 32-element block of weights is independently scaled to $[-1, 1]$ before quantization, and the scale factor is stored in 16-bit float. This block-wise scaling limits quantization error propagation.</p><h3>Double Quantization — Quantizing the Quantizer</h3><p>Those 32-element block scale constants are themselves stored in 32-bit float — adding $32/32 = 1$ bit per parameter of overhead. QLoRA introduces <strong>Double Quantization</strong>: quantize the quantization constants using 8-bit float with a block size of 256:</p><div class=\"math-block\">$$\\text{Overhead}_{\\text{DQ}} = \\frac{8 \\text{ bits}}{256} + \\frac{32 \\text{ bits}}{256 \\times 32} = 0.037 \\text{ bits/param} \\approx \\text{vs.}\\ 0.5 \\text{ without DQ}$$</div><p>Combined, QLoRA stores the base model at effectively <strong>4.5 bits/parameter</strong> — bringing a 7B model to ~3.9GB, fitting comfortably in VRAM alongside the LoRA adapter gradients.</p><h2>Architecture Diagram</h2><pre><code>  INPUT FORWARD PASS x
  │
  ├──► [W_0: NF4 4-bit, FROZEN]
  │       │
  │       ▼
  │    [Dequantize: NF4 → BF16 on-the-fly]
  │       │
  │       ├──────────────────────────────────────┐
  │       ▼                                      ▼
  │    [W_0 · x  in BF16]              [W_A · x  in BF16]  ← Trainable
  │                                      [W_B · (W_A · x)] ← Trainable
  │                                      [Scale α/r]
  │                                              │
  └──────────────────────────────────────────────┘
                             │
                             ▼
                          (+) ──► OUTPUT y

  Optimizer: only W_A, W_B receive gradient updates
  Base W_0: always frozen (no optimizer state stored)</code></pre><h2>Our Engineering Choices</h2><h3>Targeting All Linear Layers (Not Just Attention)</h3><p>Standard LoRA tutorials only adapt the attention projections $W_q, W_v$. We hypothesized — and confirmed — that adapting <em>all linear layers</em> is critical for domain specialization:</p><ul><li>Attention: $W_q, W_k, W_v, W_o$</li><li>MLP: $W_{\\text{gate}}, W_{\\text{up}}, W_{\\text{down}}$</li></ul><p>This roughly triples trainable parameter count (from ~20M to ~65M) while still fitting in 18GB VRAM, because the base model stays frozen and quantized.</p><h3>Hyperparameter Search</h3><pre><code class=\"language-python\">from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model
import torch

# Load in 4-bit with NF4 + Double Quantization
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type=\"nf4\",          # NormalFloat quantization
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,     # Double quantization
)

model = AutoModelForCausalLM.from_pretrained(
    \"mistralai/Mistral-7B-v0.1\",
    quantization_config=bnb_config,
    device_map=\"auto\",
)

# LoRA config — ALL linear layers targeted
lora_config = LoraConfig(
    r=64,                    # Rank — higher = more expressivity
    lora_alpha=128,          # Scaling factor α
    target_modules=[
        \"q_proj\", \"k_proj\", \"v_proj\", \"o_proj\",  # Attention
        \"gate_proj\", \"up_proj\", \"down_proj\"         # MLP
    ],
    lora_dropout=0.05,
    bias=\"none\",
    task_type=\"CAUSAL_LM\",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 65,011,712 || all params: 7,207,014,400
# trainable%: 0.90% — 99.1% of parameters are frozen!</code></pre><h3>Training Configuration</h3><pre><code class=\"language-python\">from transformers import TrainingArguments
from trl import SFTTrainer

training_args = TrainingArguments(
    output_dir=\"./mistral-7b-medqa\",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,      # Effective batch size 16
    warmup_ratio=0.03,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    optim=\"paged_adamw_8bit\",           # 8-bit optimizer for VRAM savings
    lr_scheduler_type=\"cosine\",
    save_steps=500,
    max_grad_norm=0.3,                  # Gradient clipping critical for stability
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    dataset_text_field=\"text\",
    tokenizer=tokenizer,
    args=training_args,
    max_seq_length=2048,
    packing=True,                       # Pack multiple short sequences together
)

trainer.train()</code></pre><h2>Results vs. Llama-3 70B</h2><table style=\"width:100%; border-collapse: collapse; font-size: 0.9rem;\"><thead><tr style=\"border-bottom: 2px solid var(--border-color);\"><th style=\"padding: 8px 12px; text-align: left;\">Benchmark</th><th style=\"padding: 8px 12px; text-align: right;\">Llama-3 70B (base)</th><th style=\"padding: 8px 12px; text-align: right; color: #22c55e;\">Mistral-7B QLoRA</th><th style=\"padding: 8px 12px; text-align: right;\">Delta</th></tr></thead><tbody><tr style=\"border-bottom: 1px solid var(--border-color);\"><td style=\"padding: 8px 12px;\">MedQA (USMLE 4-opt)</td><td style=\"padding: 8px 12px; text-align: right;\">66.3%</td><td style=\"padding: 8px 12px; text-align: right; color: #22c55e; font-weight: bold;\">68.4%</td><td style=\"padding: 8px 12px; text-align: right; color: #22c55e;\">+2.1%</td></tr><tr><td style=\"padding: 8px 12px;\">GSM8K (8-shot)</td><td style=\"padding: 8px 12px; text-align: right;\">82.2%</td><td style=\"padding: 8px 12px; text-align: right; color: #22c55e; font-weight: bold;\">84.8%</td><td style=\"padding: 8px 12px; text-align: right; color: #22c55e;\">+2.6%</td></tr></tbody></table><p style=\"margin-top: 16px;\">The 7B model's VRAM footprint during training: <strong>~17.4 GB</strong>. The 70B model requires <strong>160+ GB</strong> just for inference. Our fine-tuned Mistral-7B is <strong>10× smaller, cheaper to run, and more accurate</strong> on these specialized tasks.</p>"
    }
];
