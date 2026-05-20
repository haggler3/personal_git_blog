import json
import re

file_path = 'js/postsData.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Extract the JSON array from window.BLOG_POSTS = [...]
match = re.search(r'window\.BLOG_POSTS\s*=\s*(\[.*\]);?', content, re.DOTALL)
if not match:
    print('Could not parse window.BLOG_POSTS')
    exit(1)

posts = json.loads(match.group(1))

nuscenes_content = """<p>Autonomous driving isn't just about avoiding other cars—it's about safely navigating around pedestrians, cyclists, and other vulnerable road users. In this project, we built a <strong>sequence-to-sequence recurrent neural network with additive attention</strong> to predict the future motion of non-car road agents using the NuScenes autonomous-driving benchmark.</p>
<p>Given <strong>4 seconds of an agent's past trajectory</strong> (represented as (x, y) displacements in the agent's own reference frame), the model predicts the next <strong>6 seconds</strong> of motion at 2 Hz—producing 12 future waypoints.</p>
<h2>Architecture: Bahdanau-Attention Encoder-Decoder</h2>
<p>The model is a classic Encoder-Decoder architecture built with PyTorch, enhanced with Bahdanau (additive) attention.</p>
<ul>
<li><strong>Encoder:</strong> 1-layer LSTM, hidden dimension 128, dropout 0.1</li>
<li><strong>Attention:</strong> Additive (Bahdanau) attention over all encoder outputs</li>
<li><strong>Decoder:</strong> 1-layer LSTM, hidden dimension 128, dropout 0.1</li>
</ul>
<pre><code>  Past trajectory          Future trajectory
  (B, 4, 2) ───────►  Encoder (LSTM)
                              │
                        encoder_outputs          ┌── teacher-forcing ──┐
                        hidden / cell            │                     │
                              │                  ▼                     │
                        Decoder step t ─── Attention ─── context ──► LSTM ──► (x_t, y_t)
                              │                                            │
                              └────────────── next input ◄────────────────┘
                                             (predicted or GT)

  Output: (B, 12, 2)</code></pre>
<h2>Training and Teacher-Forcing</h2>
<p>A critical technique used to train autoregressive sequence models is <strong>Teacher-Forcing</strong>. During training, instead of feeding the model's own potentially erroneous previous prediction into the next time step, we feed the actual ground-truth previous step. However, using 100% teacher forcing causes exposure bias—the model fails at inference when it suddenly has to rely on its own predictions.</p>
<p>To close the gap between training and inference, we implemented a <strong>Teacher-Forcing Linear Decay</strong> schedule. The ratio decays from 50% to 0% over the course of training:</p>
<div class="math-block">$$\\text{tf\\_ratio} = 0.5 \\times \\left(1 - \\frac{\\text{epoch}}{\\text{num\\_epochs}}\\right)$$</div>
<p>We trained using the <strong>Huber Loss (Smooth L1)</strong> with $\\delta=1$. Huber loss is robust to trajectory outliers, acting like L2 for small errors and L1 for large ones.</p>
<h2>Results</h2>
<p>Evaluating on the NuScenes v1.0-mini test split after 20 epochs, we achieved:</p>
<ul>
<li><strong>Average Displacement Error (ADE):</strong> ~0.94 meters</li>
<li><strong>Test Huber Loss:</strong> ~0.39</li>
</ul>
<p>The attention mechanism effectively learned to focus on relevant past trajectory segments to infer future intent, proving that robust motion forecasting for vulnerable road users can be achieved with carefully tuned Seq2Seq models.</p>"""

qlora_content = """<p>This project explores a fundamental question in modern AI: <em>Can smaller, efficiently fine-tuned LLMs outperform larger models?</em> As a result of our project for the 10-623 Generative AI Course at Carnegie Mellon University, we demonstrated that a fine-tuned 7B model can beat a massive 70B model on specialized tasks.</p>
<h2>The Method: QLoRA + Dr.ICL</h2>
<p>Our pipeline combined two powerful techniques: <strong>Quantized Low-Rank Adaptation (QLoRA)</strong> and <strong>Demonstration-Retrieved In-Context Learning (Dr.ICL)</strong>.</p>
<h3>1. Parameter-Efficient Fine-Tuning (QLoRA)</h3>
<p>QLoRA allows us to fine-tune large models on consumer hardware. It works by freezing the base model in 4-bit NormalFloat (NF4) precision, while adding a small number of trainable, low-rank adapters (LoRA) to the model's layers. We used Paged Optimizers to manage memory spikes. This adapted our Mistral-7B model efficiently to the target domain without catastrophic forgetting.</p>
<h3>2. Demonstration-Retrieval for In-Context Learning (Dr.ICL)</h3>
<p>Even after fine-tuning, reasoning tasks can benefit from explicit examples in the prompt. Dr.ICL dynamically retrieves semantically similar examples from the training set and prepends them to the prompt at inference time. We utilized the GTR-T5 model as a dense retriever for this purpose.</p>
<h2>Results: Small Models Win</h2>
<p>We evaluated our models on domain-specific datasets, notably the Healthcare dataset (ChatDoctor-HealthCareMagic-100k) and GSM8K.</p>
<table>
<thead><tr><th>Model</th><th>Dataset</th><th>F1 Score</th></tr></thead>
<tbody>
<tr><td><strong>Mistral Base</strong></td><td>Healthcare</td><td>0.83</td></tr>
<tr><td><strong>Mistral QLoRA</strong></td><td>Healthcare</td><td>0.87</td></tr>
<tr><td><strong style="color:#22c55e">Mistral ICL+QLoRA</strong></td><td>Healthcare</td><td><strong style="color:#22c55e">0.89</strong></td></tr>
<tr><td><strong>Llama 3 70B</strong></td><td>Healthcare</td><td>0.87</td></tr>
</tbody>
</table>
<p style="margin-top:1rem">Our fine-tuned Mistral-7B combined with Dr.ICL achieved an <strong>F1 score of 0.89</strong>, successfully outperforming the 10x larger Llama-3 70B model. This demonstrates that specialized tuning and retrieval-augmented prompting can punch significantly above their weight class.</p>"""

for post in posts:
    if post['id'] == 'nuscenes-motion-forecasting':
        post['title'] = 'Non-Car Path Estimation on NuScenes using Attention-based Seq2Seq'
        post['excerpt'] = 'Trajectory prediction for pedestrians and cyclists using a Bahdanau-Attention Seq2Seq LSTM model trained on the NuScenes dataset.'
        post['content'] = nuscenes_content
    elif post['id'] == 'fine-tuning-llama3':
        post['title'] = 'Fine-Tuning Mistral-7B to Beat Llama 3 70B using QLoRA and Dr.ICL'
        post['excerpt'] = 'Demonstrating that smaller, efficiently fine-tuned LLMs using QLoRA and Demonstration-Retrieved In-Context Learning (Dr.ICL) can outperform larger models.'
        post['content'] = qlora_content

new_content = '/**\n * Static JSON Blog Posts Data\n * Bypasses browser CORS restrictions when running via file:// protocol\n */\n\nwindow.BLOG_POSTS = ' + json.dumps(posts, indent=4) + ';\n'

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Successfully updated postsData.js!')
