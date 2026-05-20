/**
 * Static JSON Blog Posts Data
 * Bypasses browser CORS restrictions when running via file:// protocol
 */

window.BLOG_POSTS = [
    {
        "id": "particle-filtering-tracking",
        "title": "Sequential Monte Carlo: Building a Real-Time Particle Filter for Pose Estimation",
        "date": "May 15, 2026",
        "category": "Estimation",
        "tags": ["Estimation", "Robotics", "Statistics", "Math"],
        "readTime": "10 min read",
        "excerpt": "A rigorous walkthrough of Sequential Monte Carlo (SMC): the algorithm that tames non-linear, non-Gaussian estimation problems that break the Kalman filter — with Bayesian math, systematic resampling, and a live Python implementation.",
        "content": "<p>In autonomous systems, you can never directly observe true state. A GPS gives you a noisy position. A camera gives you pixels. An IMU accumulates drift. State estimation is the art of reconstructing truth from all of this noise simultaneously.</p><p>The <strong>Kalman Filter (KF)</strong>, introduced in 1960, solves this optimally for linear, Gaussian systems. But real robots operate in non-linear environments with multi-modal sensor distributions. When linearity breaks, the KF breaks with it. Enter <strong>Sequential Monte Carlo</strong>, commonly called the <em>Particle Filter</em> — a Bayesian estimator that can represent <em>any</em> posterior distribution through a cloud of weighted hypotheses.</p><h2>The Bayesian Foundation</h2><p>State estimation is fundamentally a recursive Bayesian inference problem. Given sensor measurements $z_{1:t}$, we want the posterior over hidden state $\\mathbf{x}_t$:</p><div class=\"math-block\">$$p(\\mathbf{x}_t \\mid z_{1:t}) \\propto p(z_t \\mid \\mathbf{x}_t) \\int p(\\mathbf{x}_t \\mid \\mathbf{x}_{t-1}) \\, p(\\mathbf{x}_{t-1} \\mid z_{1:t-1}) \\, d\\mathbf{x}_{t-1}$$</div><p>This integral has no analytical solution for non-linear systems. The particle filter solves this by approximating the posterior with $N$ weighted samples:</p><div class=\"math-block\">$$p(\\mathbf{x}_t \\mid z_{1:t}) \\approx \\sum_{i=1}^{N} w_t^{[i]} \\, \\delta\\left(\\mathbf{x}_t - \\mathbf{x}_t^{[i]}\\right)$$</div><p>As $N \\to \\infty$, this approximation converges to the true posterior in probability — guaranteed by the law of large numbers.</p><h2>The Three-Step SMC Loop</h2><h3>Step 1: Predict — Propagate via Motion Model</h3><p>Each particle is propagated forward through the system dynamics plus stochastic process noise $\\mathbf{w} \\sim \\mathcal{N}(0, Q)$. For a constant-velocity 2D model with state $\\mathbf{x} = [p_x, p_y, v_x, v_y]^\\top$:</p><div class=\"math-block\">$$\\mathbf{x}_t^{[i]} = \\mathbf{F} \\mathbf{x}_{t-1}^{[i]} + \\mathbf{w}_t^{[i]}, \\quad \\mathbf{F} = \\begin{bmatrix} 1 & 0 & \\Delta t & 0 \\\\ 0 & 1 & 0 & \\Delta t \\\\ 0 & 0 & 1 & 0 \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}$$</div><p>Higher process noise $Q$ means particles spread more — encoding higher model uncertainty.</p><h3>Step 2: Correct — Weight by Measurement Likelihood</h3><p>When sensor measurement $z_t$ arrives, update each particle's weight using the likelihood under Gaussian sensor noise $R$:</p><div class=\"math-block\">$$\\tilde{w}_t^{[i]} = w_{t-1}^{[i]} \\cdot p(z_t \\mid \\mathbf{x}_t^{[i]}) = w_{t-1}^{[i]} \\cdot \\frac{1}{\\sqrt{2\\pi R}} \\exp\\!\\left(-\\frac{\\|z_t - H\\mathbf{x}_t^{[i]}\\|^2}{2R}\\right)$$</div><p>After normalizing: $w_t^{[i]} = \\tilde{w}_t^{[i]} / \\sum_j \\tilde{w}_t^{[j]}$. Particles near the measurement are promoted; outliers suppressed. The posterior collapses around the evidence.</p><h3>Step 3: Resample — Fight Weight Collapse</h3><p>Over many steps, most particles acquire negligible weight (weight collapse). This is measured by the Effective Sample Size:</p><div class=\"math-block\">$$N_{\\text{eff}} = \\frac{1}{\\sum_{i=1}^N (w_t^{[i]})^2}$$</div><p>When $N_{\\text{eff}} < N/2$, resample. <strong>Systematic resampling</strong> draws a single offset $U_1 \\sim \\mathcal{U}[0, 1/N)$ and places $N$ equally-spaced pointers across the cumulative weight distribution — giving $O(N)$ complexity and minimum estimator variance:</p><div class=\"math-block\">$$U_k = U_1 + \\frac{k-1}{N}, \\quad k = 1, \\dots, N$$</div><h2>System Architecture</h2><pre><code>┌────────────────────────────────────────────────┐
│           PARTICLE FILTER — SMC LOOP           │
│                                                │
│  ┌─────────┐  x_t = F·x_{t-1} + w  ┌───────┐ │
│  │Particles│ ────────────────────►  │Predict│ │
│  │{x,w}^i │                        └───┬───┘ │
│  └─────────┘                           │ z_t  │
│       ▲                                ▼      │
│       │ Resample         ┌─────────────────┐  │
│  N_eff < N/2             │ Weight Update   │  │
│       │            ◄──── │ w∝ p(z|x^[i])  │  │
│  ┌────┴────┐             └─────────────────┘  │
│  │Resample │                                  │
│  └─────────┘                                  │
└────────────────────────────────────────────────┘</code></pre><h2>Python Implementation</h2><pre><code class=\"language-python\">import numpy as np

def systematic_resample(weights):
    \"\"\"Low-variance O(N) resampling.\"\"\"\
    N = len(weights)
    positions = (np.arange(N) + np.random.uniform(0, 1)) / N
    cumsum = np.cumsum(weights)
    return np.searchsorted(cumsum, positions)

class ParticleFilter:
    def __init__(self, N=200, std_R=0.5, std_Q=0.1):
        self.N = N
        self.R = std_R**2         # Measurement noise variance
        self.Q = std_Q            # Process noise std dev
        dt = 1.0
        # State transition: constant velocity model
        self.F = np.array([[1,0,dt,0],[0,1,0,dt],[0,0,1,0],[0,0,0,1]])
        self.H = np.array([[1,0,0,0],[0,1,0,0]])  # Observe position only

    def predict(self, particles):
        noise = np.random.randn(*particles.shape) * self.Q
        return particles @ self.F.T + noise

    def update(self, particles, weights, z):
        predicted_z = particles[:, :2]        # H @ x
        diff = z - predicted_z
        dist_sq = np.sum(diff**2, axis=1)
        likelihoods = np.exp(-dist_sq / (2 * self.R))
        weights *= likelihoods
        weights /= (weights.sum() + 1e-12)
        return weights

    def neff(self, weights):
        return 1.0 / np.sum(weights**2)

    def step(self, particles, weights, measurement):
        particles = self.predict(particles)
        weights   = self.update(particles, weights, measurement)
        if self.neff(weights) < self.N / 2:
            idx = systematic_resample(weights)
            particles = particles[idx]
            weights   = np.ones(self.N) / self.N
        estimate = np.average(particles, weights=weights, axis=0)
        return particles, weights, estimate</code></pre><h2>What the Live Simulation Shows</h2><p>The embedded particle filter above traces my name stroke by stroke, treating each character as a 2D measurement sequence. Watch the key behaviors:</p><ul><li>🔵 <strong>Particle cloud disperses</strong> during letter transitions (dead-reckoning phase — no measurements)</li><li>🟢 <strong>Weighted mean stays stable</strong> thanks to the velocity state acting as momentum prior</li><li>⚡ <strong>Cloud snaps back</strong> the instant a new measurement arrives — this is Bayesian correction at 60fps</li><li>🔄 <strong>Automatic reset</strong> when the trace loops — particles re-initialize at the start of the name cleanly</li></ul>"
    },
    {
        "id": "rl-grpo-deep-dive",
        "title": "GRPO: Ditching the Critic to Train Smarter Reasoning Models",
        "date": "April 28, 2026",
        "category": "Machine Learning",
        "tags": ["Machine Learning", "Reinforcement Learning", "LLMs", "Math"],
        "readTime": "11 min read",
        "excerpt": "A rigorous breakdown of Group Relative Policy Optimization — the algorithm behind DeepSeek-R1. How eliminating the critic network and using relative group rewards produces better reasoning at a fraction of the cost.",
        "content": "<p>The release of DeepSeek-R1 sent shockwaves through the AI community. Not just because of what it achieved — but how. Instead of the expensive four-model PPO-RLHF pipeline OpenAI uses, DeepSeek trained world-class reasoning using a single elegant insight: <strong>Group Relative Policy Optimization (GRPO)</strong>. No critic. No value function. Just arithmetic over a group of sampled completions.</p><p>Here is exactly why it works.</p><h2>The Cost of the Critic</h2><p>Standard RLHF via PPO requires four models in memory simultaneously:</p><ul><li><strong>Policy $\\pi_\\theta$</strong> — model being trained, needs full gradient computation</li><li><strong>Reference $\\pi_{\\text{ref}}$</strong> — frozen SFT copy, inference only</li><li><strong>Reward $R_\\psi$</strong> — learned reward model, inference only</li><li><strong>Critic $V_\\phi$</strong> — estimates per-token value — same scale as the policy, <em>needs gradients</em></li></ul><p>For a 7B model, this means holding ~4 copies of the 14GB weight tensor in GPU memory. The critic is the real culprit: estimating a value function over the full token-space of language is both expensive and noisy.</p><p>GRPO's core insight: <strong>you don't need to predict absolute value. You only need relative comparison across a group.</strong></p><h2>The GRPO Algorithm</h2><p>For each prompt $q$, sample $G$ full completions from the current policy:</p><div class=\"math-block\">$$\\{o_1, o_2, \\dots, o_G\\} \\sim \\pi_\\theta(\\cdot \\mid q)$$</div><p>Score each with the reward model: $\\{R_1, \\dots, R_G\\}$. Then compute the <em>group-normalized advantage</em> — the baseline is just the group mean:</p><div class=\"math-block\">$$A_i = \\frac{R_i - \\mu_G}{\\sigma_G + \\epsilon}, \\quad \\mu_G = \\frac{1}{G}\\sum_j R_j, \\quad \\sigma_G = \\sqrt{\\frac{1}{G}\\sum_j (R_j - \\mu_G)^2}$$</div><p>Outputs better than average get positive advantage. Worse outputs get negative. <strong>No neural network needed to compute this</strong> — just arithmetic.</p><h3>The Full Objective</h3><div class=\"math-block\">$$\\mathcal{L}_{\\text{GRPO}}(\\theta) = \\frac{1}{G} \\sum_{i=1}^G \\left[ \\min\\left( r_i A_i, \\; \\text{clip}(r_i, 1\\!-\\!\\varepsilon, 1\\!+\\!\\varepsilon) A_i \\right) - \\beta \\, \\mathbb{D}_{\\text{KL}}(\\pi_\\theta \\| \\pi_{\\text{ref}}) \\right]$$</div><p>where the probability ratio compares how much the policy has drifted from reference:</p><div class=\"math-block\">$$r_i(\\theta) = \\exp\\!\\left(\\sum_t \\log \\pi_\\theta(o_{i,t} \\mid q) - \\sum_t \\log \\pi_{\\text{ref}}(o_{i,t} \\mid q)\\right)$$</div><h3>KL Divergence — Token-Level Regularization</h3><p>To prevent reward hacking (the model collapsing into adversarial patterns that trick the reward model), GRPO applies a token-level KL penalty using an unbiased estimator that is always $\\geq 0$:</p><div class=\"math-block\">$$\\mathbb{D}_{\\text{KL}}(\\pi_\\theta \\| \\pi_{\\text{ref}}) \\approx \\sum_t \\left[\\frac{\\pi_{\\text{ref}}(o_{i,t})}{\\pi_\\theta(o_{i,t})} - \\log \\frac{\\pi_{\\text{ref}}(o_{i,t})}{\\pi_\\theta(o_{i,t})} - 1\\right]$$</div><h2>Architecture: PPO vs GRPO</h2><pre><code>PPO-RLHF (4-model):                GRPO (3-model):
┌──────────────────────┐           ┌──────────────────────┐
│  Policy π_θ  ←grads │           │  Policy π_θ  ←grads │
│  Ref    π_ref (frz)  │           │  Ref    π_ref (frz)  │
│  Reward R_ψ  (frz)  │           │  Reward R_ψ  (frz)  │
│  Critic V_φ  ←grads  │           │                      │
│                      │           │  Baseline = mean(R_G)│
│  ~52+ GB (7B model)  │           │  ~20 GB (7B model)   │
└──────────────────────┘           └──────────────────────┘</code></pre><h2>PyTorch Implementation</h2><pre><code class=\"language-python\">import torch

def compute_grpo_loss(policy_log_probs, ref_log_probs, rewards,
                      kl_beta=0.01, clip_eps=0.2):
    G = rewards.size(0)

    # Group-relative advantage normalization
    mu  = rewards.mean()
    sig = rewards.std() + 1e-8
    advantages = (rewards - mu) / sig          # [G]

    # Probability ratios (log-space for numerical stability)
    policy_seq = policy_log_probs.sum(dim=-1)  # [G]
    ref_seq    = ref_log_probs.sum(dim=-1)     # [G]
    ratios     = torch.exp(policy_seq - ref_seq)

    # Clipped surrogate loss (PPO-style stability)
    surr1 = ratios * advantages
    surr2 = torch.clamp(ratios, 1-clip_eps, 1+clip_eps) * advantages
    policy_loss = -torch.min(surr1, surr2).mean()

    # Token-level KL penalty (unbiased, always >= 0)
    log_ratio = policy_log_probs - ref_log_probs
    kl = torch.exp(-log_ratio) + log_ratio - 1
    kl_loss = kl.sum(dim=-1).mean()

    return policy_loss + kl_beta * kl_loss


def grpo_train_step(model, ref_model, reward_fn, prompt, optimizer, G=8):
    completions = model.generate(prompt, num_return_sequences=G, do_sample=True)
    rewards     = torch.tensor([reward_fn(c) for c in completions])
    policy_lp   = model.get_log_probs(prompt, completions)
    with torch.no_grad():
        ref_lp  = ref_model.get_log_probs(prompt, completions)
    loss = compute_grpo_loss(policy_lp, ref_lp, rewards)
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
    return loss.item()</code></pre><h2>Why It Works — Three Core Reasons</h2><ol><li><strong>Relative comparison is a cleaner signal</strong>. Ranking outputs within a group is far less ambiguous than predicting their absolute value. A critic must learn the value of every sequence across every topic — a nearly intractable function. A group mean is trivial to compute.</li><li><strong>Self-calibrating difficulty</strong>. As the model improves, $\\mu_G$ rises automatically. The bar for positive advantage tracks capability — no manual reward rescaling needed.</li><li><strong>Gradient stability by construction</strong>. Standardizing by $\\sigma_G$ bounds the advantage term magnitude. With PPO, large reward variance causes gradient spikes; GRPO's normalization handles this automatically.</li></ol><h2>Application: Engineering Design Optimization Research</h2><p>At CMU, I built a local GRPO training harness for generative AI-based engineering design. The system samples $G=8$ design candidates per prompt from 3B–14B parameter language models, evaluates them against physics-based reward functions (mechanical stress, thermal efficiency), and updates the policy without any cloud cluster — a single workstation handles the full loop. This is currently under submission as <em>Design Bench @ IDETC 2026</em>.</p>"
    },
    {
        "id": "nuscenes-motion-forecasting",
        "title": "Forecasting Pedestrian & Cyclist Trajectories on NuScenes with Social Attention Seq2Seq LSTMs",
        "date": "March 12, 2026",
        "category": "Robotics",
        "tags": ["Robotics", "Autonomous Driving", "Deep Learning", "Math"],
        "readTime": "9 min read",
        "excerpt": "How we built a social attention Seq2Seq LSTM achieving 0.94m ADE on the NuScenes dataset — full architecture, math, MinADE loss, and PyTorch training code.",
        "content": "<p>A self-driving car at 30 mph covers 44 feet per second. If a pedestrian steps off a curb, the vehicle has roughly 1.5 seconds to react. At that timescale, <em>reacting</em> is not enough — the car must <em>anticipate</em>. Trajectory forecasting is the problem of predicting where other agents will be in the next 6 seconds, given where they have been.</p><p>This is deceptively hard. Humans move with <em>intent</em>. A pedestrian's future path depends not just on their own history, but on nearby cyclists, traffic signals, and social conventions. A purely kinematic model fails instantly.</p><h2>Problem Formulation</h2><p>Let agent $i$ have a history of $H = 10$ position observations (2 seconds at 5 Hz), represented as relative displacement vectors to remove coordinate-frame dependence:</p><div class=\"math-block\">$$\\mathcal{X}_i = \\left\\{\\Delta\\mathbf{x}_i^{-H+1}, \\dots, \\Delta\\mathbf{x}_i^0\\right\\}, \\quad \\Delta\\mathbf{x}_i^t = \\mathbf{x}_i^t - \\mathbf{x}_i^{t-1} \\in \\mathbb{R}^2$$</div><p>The goal: predict $F = 12$ future waypoints (6 seconds at 2 Hz) that minimize displacement error to ground truth.</p><h2>Three-Stage Architecture</h2><h3>Stage 1 — Encoder LSTM</h3><p>A shared LSTM encodes the displacement sequence into a hidden state capturing motion history:</p><div class=\"math-block\">$$h_i^t = \\text{LSTM}_{\\text{enc}}\\!\\left(\\phi(\\Delta\\mathbf{x}_i^t),\\, h_i^{t-1}\\right), \\quad h_i^0 \\in \\mathbb{R}^{256}$$</div><p>where $\\phi$ is a 2-layer MLP embedding. After $H$ steps, $h_i^0$ captures the agent's speed, heading, and acceleration tendency.</p><h3>Stage 2 — Social Attention Pooling</h3><p>Agents influence each other's motion. For agent $i$ and neighbors $j \\in \\mathcal{N}_i$ within 20m, a scaled dot-product attention computes interaction-aware context:</p><div class=\"math-block\">$$e_{ij} = \\frac{(W_Q h_i^0)^\\top (W_K h_j^0)}{\\sqrt{d_k}}, \\quad \\alpha_{ij} = \\text{softmax}_j(e_{ij}), \\quad \\mathbf{c}_i = \\sum_j \\alpha_{ij} (W_V h_j^0)$$</div><p>A pedestrian heading toward agent $i$ gets high attention weight; a stationary bystander gets near-zero.</p><h3>Stage 3 — Multi-Modal Decoder</h3><p>We generate $K=6$ trajectory hypotheses to cover the multi-modal distribution of intent (cross vs. turn vs. stop). Decoder is initialized with $[h_i^0 \\| \\mathbf{c}_i]$ and unrolled autoregressively:</p><div class=\"math-block\">$$\\hat{\\Delta}\\mathbf{x}_i^{t,k} = W_{\\text{out}}\\, h_{\\text{dec}}^{t,k}, \\quad \\hat{\\mathbf{x}}_i^{t,k} = \\hat{\\mathbf{x}}_i^{t-1,k} + \\hat{\\Delta}\\mathbf{x}_i^{t,k}$$</div><h2>Architecture Diagram</h2><pre><code>Past trajectory history { Δx_-9 ... Δx_0 }
        │
        ▼
 [Encoder LSTM (shared)]  ──►  h_i^0 ∈ R^256
        │                           │
        │                           ▼
        │              [Social Attention]  ◄── { h_j^0 } neighbors
        │                    α_ij = softmax(QK^T/√d)
        │                    c_i  = Σ α_ij V_j
        │                           │
        └────────── concat ─────────┘
                        │  [h_i^0 ‖ c_i]
                        ▼
           [Multi-Modal Decoder (K=6)]
              For t=1..12: Δx̂_t = W_out · h_dec_t
                        │
                        ▼
           { ŷ^1, ŷ^2, ..., ŷ^6 }  ← 6 trajectory modes</code></pre><h2>Training: MinADE Loss</h2><p>Human motion is multi-modal. Training with a standard L2 loss would force the model to predict an impossible average of all intents. Instead, we use <strong>Best-of-K MinADE</strong> which selects the closest of $K$ predictions to ground truth:</p><div class=\"math-block\">$$\\mathcal{L}_{\\text{MinADE}} = \\min_{k \\in [1,K]} \\frac{1}{F} \\sum_{t=1}^F \\left\\|\\mathbf{x}_i^t - \\hat{\\mathbf{x}}_i^{t,k}\\right\\|_2$$</div><p>This allows each mode to specialize in a distinct behavioral pattern without collapsing toward the mean.</p><h2>Key Results & Code</h2><pre><code class=\"language-python\">class SocialAttention(nn.Module):
    def __init__(self, d=256):
        super().__init__()
        self.Wq = nn.Linear(d, d)
        self.Wk = nn.Linear(d, d)
        self.Wv = nn.Linear(d, d)
        self.scale = d**0.5

    def forward(self, h_i, h_neighbors):
        if h_neighbors.size(0) == 0:
            return torch.zeros_like(h_i)
        q = self.Wq(h_i).unsqueeze(0)     # [1, d]
        k = self.Wk(h_neighbors)           # [N, d]
        v = self.Wv(h_neighbors)           # [N, d]
        attn = torch.softmax((q @ k.T) / self.scale, dim=-1)
        return (attn @ v).squeeze(0)       # [d]

def min_ade_loss(preds, gt):
    # preds: [K, F, 2], gt: [F, 2]
    gt_exp  = gt.unsqueeze(0).expand_as(preds)
    per_k   = torch.norm(preds - gt_exp, dim=-1).mean(dim=-1)  # [K]
    return per_k.min()</code></pre><ul><li>🎯 <strong>ADE: 0.94m</strong> on NuScenes pedestrian/cyclist test split</li><li>🌫 <strong>Occlusion robustness</strong>: hidden state acts as momentum prior during sensor blackouts — predictions remain physically plausible for 1-2 seconds without position updates</li><li>⚡ <strong>&gt;60Hz inference</strong> on A100 for 64 simultaneous agents</li></ul>"
    },
    {
        "id": "fine-tuning-llama3",
        "title": "Fine-Tuning Mistral-7B to Beat Llama-3 70B: A Deep Dive into QLoRA Engineering",
        "date": "May 10, 2026",
        "category": "Machine Learning",
        "tags": ["Machine Learning", "Fine-Tuning", "LLMs", "Math"],
        "readTime": "10 min read",
        "excerpt": "How we engineered a domain-specific QLoRA strategy for Mistral-7B that outperformed Llama-3 70B on MedQA and GSM8K — full theory, benchmark table, and Hugging Face training code.",
        "content": "<p>The received wisdom was: bigger model = better performance. Llama-3 70B requires 160GB just to load for inference. Our hypothesis: with surgical fine-tuning on domain-specific data, a model 10× smaller could not just match it — but beat it. That hypothesis was correct.</p><p>We outperformed Llama-3 70B on MedQA (USMLE clinical reasoning) and GSM8K (grade-school math) using <strong>QLoRA</strong> on Mistral-7B — all on hardware that fits under a desk.</p><h2>Why Small Fine-Tuned Models Win on Specialized Tasks</h2><p>Large general models are optimized for breadth. Their parameters must simultaneously represent cooking, quantum mechanics, history, and medicine. A fine-tuned 7B model trained on domain-specific data has <em>all its parameters optimized for the target distribution</em> — there's no routing overhead through irrelevant knowledge.</p><h2>Mathematical Foundation of QLoRA</h2><h3>LoRA: Low-Rank Weight Adaptation</h3><p>Full fine-tuning updates all $d \\times k$ parameters per layer. LoRA observes that parameter updates tend to lie in a low-rank subspace, and factorizes the update:</p><div class=\"math-block\">$$\\mathbf{y} = \\mathbf{x} W_0^\\top + \\frac{\\alpha}{r}\\, \\mathbf{x} W_A^\\top W_B^\\top$$</div><p>where $W_A \\in \\mathbb{R}^{d \\times r}$, $W_B \\in \\mathbb{R}^{r \\times k}$, and $r \\ll d, k$. With $r=64$: from 16.8M trainable params/layer down to 524K — a <strong>32× compression</strong>.</p><h3>NF4: NormalFloat 4-bit Quantization</h3><p>The frozen base model $W_0$ is stored in 4 bits using NormalFloat (NF4), which places quantization grid points at equal quantiles of $\\mathcal{N}(0,1)$:</p><div class=\"math-block\">$$q_i = \\frac{1}{2}\\left(\\Phi^{-1}\\!\\left(\\frac{i}{2^k+1}\\right) + \\Phi^{-1}\\!\\left(\\frac{i+1}{2^k+1}\\right)\\right)$$</div><p>This is <em>information-optimal</em> for normally-distributed weights — every quantization bin contains the same expected number of parameters, minimizing mean squared quantization error.</p><h3>Double Quantization</h3><p>Block-wise scale constants add $32/32 = 1$ bit/param overhead. QLoRA quantizes these constants themselves using 8-bit float (block size 256), cutting overhead to:</p><div class=\"math-block\">$$\\text{Overhead} = \\frac{8}{256} + \\frac{32}{256 \\times 32} \\approx 0.037 \\text{ bits/param}$$</div><p>Net result: base model stored at effectively <strong>4.5 bits/param</strong> — a 7B model fits in ~3.9GB.</p><h2>Architecture</h2><pre><code>Forward pass x
│
├──► [W_0: frozen, NF4 4-bit]
│         │
│         ▼ dequantize to BF16 on-the-fly
│    [W_0 · x]  ──────────────────────────┐
│                                          ▼
└──► [W_A: trainable BF16] ──► [W_B: trainable BF16] ──► [× α/r]
                                                               │
                                                          (+ add) ──► y

Only W_A and W_B receive gradients.
W_0 never leaves quantized form.</code></pre><h2>Implementation</h2><pre><code class=\"language-python\">from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model
import torch

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type=\"nf4\",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,        # Double quantization
)

model = AutoModelForCausalLM.from_pretrained(
    \"mistralai/Mistral-7B-v0.1\",
    quantization_config=bnb_config,
    device_map=\"auto\",
)

# Target ALL linear layers — not just attention
lora_config = LoraConfig(
    r=64, lora_alpha=128,
    target_modules=[
        \"q_proj\", \"k_proj\", \"v_proj\", \"o_proj\",
        \"gate_proj\", \"up_proj\", \"down_proj\"
    ],
    lora_dropout=0.05,
    task_type=\"CAUSAL_LM\",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable: 65,011,712 / 7,207,014,400 — only 0.90% updated!</code></pre><h2>Results</h2><table><thead><tr><th>Benchmark</th><th style=\"text-align:right\">Llama-3 70B</th><th style=\"text-align:right;color:#22c55e\">Mistral-7B QLoRA</th><th style=\"text-align:right\">Δ</th></tr></thead><tbody><tr><td>MedQA (USMLE)</td><td style=\"text-align:right\">66.3%</td><td style=\"text-align:right;font-weight:bold;color:#22c55e\">68.4%</td><td style=\"text-align:right;color:#22c55e\">+2.1%</td></tr><tr><td>GSM8K (8-shot)</td><td style=\"text-align:right\">82.2%</td><td style=\"text-align:right;font-weight:bold;color:#22c55e\">84.8%</td><td style=\"text-align:right;color:#22c55e\">+2.6%</td></tr></tbody></table><p style=\"margin-top:1rem\">Training VRAM: <strong>~17.4 GB</strong>. Llama-3 70B inference alone: <strong>160+ GB</strong>. The fine-tuned 7B model is 10× smaller, cheaper to run, and more accurate on these domains.</p>"
    },
    {
        "id": "lstm-sensor-health",
        "title": "LSTM Time-Series Modeling for System Health Signals on Nuclear Instrumentation Data",
        "date": "December 10, 2024",
        "category": "Machine Learning",
        "tags": ["Machine Learning", "Time-Series", "Systems", "Math"],
        "readTime": "8 min read",
        "excerpt": "How we deployed an LSTM model on millions of rows of industrial sensor time-series data using PySpark and PyTorch to extract actionable health signals from complex dynamic systems.",
        "content": "<p>Industrial sensors tell a story — but it's buried in noise. At Bechtel Plant Machinery, I designed and deployed an LSTM-based time-series health monitoring system on millions of rows of sensor data from power infrastructure equipment. The goal was to extract actionable diagnostic signals that traditional threshold-based methods consistently missed.</p><h2>The Signal Extraction Problem</h2><p>Industrial systems generate high-frequency multivariate time-series: temperature, pressure, vibration, current, and flow readings sampled at sub-second intervals. Anomalies are rarely sharp spikes — they manifest as gradual trend deviations, subtle phase shifts, or correlations across sensors that break down before failure.</p><p>Traditional rule-based thresholds generate excessive false positives (alarm fatigue) and miss slow-developing faults. A learned temporal model can capture the normal operating manifold and flag meaningful deviations.</p><h2>Mathematical Framework</h2><h3>LSTM Cell Mechanics</h3><p>Unlike feed-forward networks, LSTMs maintain a <strong>cell state</strong> $c_t$ that flows through time with minimal disruption. The gating mechanism controls information flow:</p><div class=\"math-block\">$$f_t = \\sigma(W_f [h_{t-1}, x_t] + b_f) \\quad \\text{(forget gate)}$$</div><div class=\"math-block\">$$i_t = \\sigma(W_i [h_{t-1}, x_t] + b_i), \\quad \\tilde{c}_t = \\tanh(W_c [h_{t-1}, x_t] + b_c)$$</div><div class=\"math-block\">$$c_t = f_t \\odot c_{t-1} + i_t \\odot \\tilde{c}_t \\quad \\text{(cell state update)}$$</div><div class=\"math-block\">$$o_t = \\sigma(W_o [h_{t-1}, x_t] + b_o), \\quad h_t = o_t \\odot \\tanh(c_t)$$</div><p>The forget gate $f_t$ learns to retain long-range patterns (e.g., a slow temperature climb over 4 hours) while the input gate $i_t$ incorporates new observations. This makes LSTMs far more capable than simple exponential moving averages at capturing system health dynamics.</p><h3>Anomaly Detection via Reconstruction Error</h3><p>We train the model as an <strong>autoencoder</strong>: given a window of $T$ timesteps, predict those same $T$ steps. At inference, the reconstruction error $\\mathcal{E}_t$ signals anomalies:</p><div class=\"math-block\">$$\\mathcal{E}_t = \\frac{1}{T} \\sum_{\\tau=t-T}^{t} \\left\\|x_\\tau - \\hat{x}_\\tau\\right\\|_2^2$$</div><p>When $\\mathcal{E}_t$ exceeds a threshold $\\delta$ (set at the $99^{\\text{th}}$ percentile of training-set errors), we flag a potential health event. This approach naturally learns the normal operating envelope from data — no manual rule definition needed.</p><h2>Architecture</h2><pre><code>Multivariate sensor stream: [T=128 timesteps × D=12 sensors]
            │
            ▼
 [Linear Embedding: D → 64]
            │
            ▼
 [LSTM Encoder Layer 1: 64 → 128 hidden]
            │
            ▼
 [LSTM Encoder Layer 2: 128 → 64 hidden]
            │  bottleneck h_T ∈ R^64
            ▼
 [LSTM Decoder Layer 1: 64 → 128 hidden]
            │
            ▼
 [LSTM Decoder Layer 2: 128 → 64 hidden]
            │
            ▼
 [Linear Projection: 64 → D]   ← reconstructed sensor readings
            │
            ▼
 Reconstruction Error E_t  ──► Health Signal / Anomaly Flag</code></pre><h2>Implementation with PySpark + PyTorch</h2><pre><code class=\"language-python\">import torch
import torch.nn as nn

class LSTMAutoencoder(nn.Module):
    def __init__(self, input_dim=12, hidden_dim=128, latent_dim=64, seq_len=128):
        super().__init__()
        self.seq_len = seq_len
        self.encoder = nn.LSTM(input_dim, hidden_dim, num_layers=2,
                               batch_first=True, dropout=0.2)
        self.bottleneck = nn.Linear(hidden_dim, latent_dim)
        self.decoder = nn.LSTM(latent_dim, hidden_dim, num_layers=2,
                               batch_first=True, dropout=0.2)
        self.output = nn.Linear(hidden_dim, input_dim)

    def forward(self, x):
        # x: [B, T, D]
        enc_out, _ = self.encoder(x)           # [B, T, H]
        latent = self.bottleneck(enc_out)       # [B, T, L] — compress each step
        dec_out, _ = self.decoder(latent)       # [B, T, H]
        return self.output(dec_out)             # [B, T, D]

# PySpark preprocessing pipeline
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, window
spark = SparkSession.builder.appName(\"SensorHealth\").getOrCreate()

df = spark.read.parquet(\"s3://sensor-logs/\") \\
    .withColumn(\"timestamp\", col(\"ts\").cast(\"timestamp\")) \\
    .groupBy(window(\"timestamp\", \"1 second\")) \\
    .agg({s: \"mean\" for s in SENSOR_COLS}) \\
    .orderBy(\"window\")

# Convert to PyTorch dataset for training
windows_tensor = torch.tensor(df_pandas.values, dtype=torch.float32)
windows_tensor = windows_tensor.unfold(0, SEQ_LEN, STRIDE)  # rolling windows</code></pre><h2>Results</h2><ul><li>📊 Processed <strong>millions of rows</strong> across multiple sensor streams using distributed PySpark pipelines on AWS</li><li>🔍 Detected subtle <strong>correlational breakdown</strong> between sensor pairs up to 4 hours before traditional threshold alerts fired</li><li>⚙️ The physics-based state-space model built in parallel (transfer functions + Laplace domain analysis) validated LSTM anomaly detections against engineering first-principles</li><li>🚀 Model predictions used operationally by engineering teams to prioritize maintenance — reducing unplanned downtime</li></ul>"
    },
    {
        "id": "grpo-engineering-design",
        "title": "Generative AI for Engineering Design Optimization via Local GRPO Training",
        "date": "March 1, 2026",
        "category": "Machine Learning",
        "tags": ["Machine Learning", "Reinforcement Learning", "Research", "Math"],
        "readTime": "8 min read",
        "excerpt": "How we built a local GRPO reinforcement learning harness to fine-tune language models for physics-constrained engineering design optimization — under submission at IDETC 2026.",
        "content": "<p>Engineering design is a search problem: find parameters that satisfy performance constraints (structural, thermal, manufacturability) while optimizing an objective (weight, cost, efficiency). Traditional approaches use gradient-based optimization over explicit models. Our research explores a different direction: can large language models, trained with reinforcement learning on physics-based reward functions, learn to generate high-quality engineering designs directly?</p><p>The answer, under the right training regime, is yes — and the regime is <strong>GRPO on local hardware</strong>.</p><h2>The Core Idea</h2><p>Instead of querying a closed commercial API, we deploy a local 3B–14B parameter language model and train it using Group Relative Policy Optimization. The model generates candidate engineering design specifications in structured text/JSON format. Each candidate is evaluated by a physics simulator (FEA solver, thermal model), which returns a scalar reward. GRPO trains the model to produce higher-scoring designs over time.</p><div class=\"math-block\">$$\\text{Design: } d_i \\sim \\pi_\\theta(\\cdot \\mid \\text{problem spec } q)$$</div><div class=\"math-block\">$$R_i = f_{\\text{physics}}(d_i) \\in \\mathbb{R} \\quad \\text{(physics-based reward)}$$</div><div class=\"math-block\">$$A_i = \\frac{R_i - \\bar{R}_G}{\\sigma_G}, \\quad \\mathcal{L} = -\\mathbb{E}\\left[\\min(r_i A_i, \\text{clip}(r_i, 1\\pm\\varepsilon)A_i)\\right] + \\beta D_{\\text{KL}}$$</div><h2>System Architecture</h2><pre><code>┌──────────────────────────────────────────────────────────┐
│            GRPO Engineering Design Loop                  │
│                                                          │
│  Engineering Problem Specification (natural language)    │
│                │                                         │
│                ▼                                         │
│  ┌─────────────────────────────┐                         │
│  │  Local LLM (3B–14B, LoRA)  │  π_θ                    │
│  │  Generates G=8 designs     │                          │
│  └──────────────┬──────────────┘                         │
│                 │ {d_1, ..., d_G}                        │
│                 ▼                                         │
│  ┌─────────────────────────────┐                         │
│  │  Physics Reward Function    │  f_physics(d_i)         │
│  │  - FEA solver (stress)      │                         │
│  │  - Thermal model            │  → R_i ∈ ℝ              │
│  │  - Manufacturability score  │                         │
│  └──────────────┬──────────────┘                         │
│                 │ {R_1, ..., R_G}                        │
│                 ▼                                         │
│  ┌─────────────────────────────┐                         │
│  │  GRPO Update                │                         │
│  │  A_i = (R_i - μ_G)/σ_G     │  ← no critic needed!   │
│  │  Loss = clipped surrogate   │                         │
│  └──────────────┬──────────────┘                         │
│                 │ gradient update                        │
│                 └──► π_θ (improved)                      │
└──────────────────────────────────────────────────────────┘</code></pre><h2>Multi-Threaded Rollout Mechanism</h2><p>The key engineering challenge: physics simulators are slow (1–30 seconds per evaluation). We designed a multi-threaded rollout pipeline that parallelizes design evaluation across CPU cores while keeping the GPU busy with the next sampling batch:</p><pre><code class=\"language-python\">import concurrent.futures
import torch

def evaluate_designs_parallel(designs, reward_fn, max_workers=8):
    \"\"\"Evaluate G designs concurrently using a thread pool.\"\"\"\
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(reward_fn, d): i for i, d in enumerate(designs)}
        rewards = [None] * len(designs)
        for future in concurrent.futures.as_completed(futures):
            idx = futures[future]
            rewards[idx] = future.result()
    return torch.tensor(rewards, dtype=torch.float32)

def grpo_design_loop(model, ref_model, optimizer, problem_spec,
                     reward_fn, G=8, epochs=100):
    for epoch in range(epochs):
        # Sample G candidate designs from current policy
        designs = model.generate(problem_spec, num_return_sequences=G)

        # Evaluate all G designs in parallel (physics sim)
        rewards = evaluate_designs_parallel(designs, reward_fn)

        # Compute GRPO loss and update
        policy_lp = model.get_log_probs(problem_spec, designs)
        with torch.no_grad():
            ref_lp = ref_model.get_log_probs(problem_spec, designs)

        loss = compute_grpo_loss(policy_lp, ref_lp, rewards)
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

        if epoch % 10 == 0:
            best = designs[rewards.argmax()]
            print(f\"Epoch {epoch}: best reward = {rewards.max():.3f}\")</code></pre><h2>Key Design Decisions</h2><ul><li><strong>Structured output format</strong>: The model generates designs as JSON with explicit parameter fields (dimensions, materials, topology). This enables deterministic parsing by the physics solver and structured reward computation.</li><li><strong>Soft constraints via reward shaping</strong>: Hard physical constraints (e.g., yield stress limit) are encoded as continuous penalties in the reward function rather than binary feasibility filters, giving smooth gradients for the policy to learn from.</li><li><strong>Local deployment</strong>: Running entirely on-premises avoids IP/proprietary design data leaving the organization. A single RTX 4090 handles the full 7B model training loop.</li></ul><h2>Current Status</h2><p>This work is co-authored and currently under submission as <strong>Design Bench @ IDETC 2026</strong>. The benchmark evaluates generative AI methods on standardized engineering design tasks with physics-based evaluation metrics, enabling direct comparison between GRPO-trained models and classical optimization baselines.</p>"
    }
];
