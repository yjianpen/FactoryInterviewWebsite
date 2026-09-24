// Company knowledge base: per-company domain focus + high-quality curated
// questions used both as the offline generator and as context for the LLM.
//
// HOW TO EXTEND:
//  1. Add a new company -> add an entry to `companyProfiles` below.
//  2. Tune an existing company -> edit its `domains`, `focusAreas` (these get
//     sent to the LLM) or its `curated` questions (used offline).
//  3. Unknown companies automatically fall back to the generic pools at the
//     bottom of this file.

import type { GeneratedQuestion } from "./llm/types";

export interface CompanyProfile {
  name: string;
  /** Short tags shown in the UI and fed to the LLM (e.g. ["CUDA", "GPU architecture"]). */
  domains: string[];
  /** Detailed context for the LLM prompt. */
  focusAreas: string[];
  /** Hand-written questions used by the offline "curated" provider. */
  curated: GeneratedQuestion[];
}

// ---------------------------------------------------------------------------
// NVIDIA
// ---------------------------------------------------------------------------

const NVIDIA_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Vector addition kernel (CUDA)",
    difficulty: "EASY",
    prompt:
      "Write a CUDA kernel `__global__ void vecAdd(const float* a, const float* b, float* c, int n)` that computes c[i] = a[i] + b[i], together with the host code that launches it for an array of N = 1,000,000 floats. Explain your choice of block and grid size, and what happens if N is not a multiple of the block size.\n\nConstraints: assume valid device memory is already allocated and copied; focus on the kernel and launch configuration.",
    testCases: [
      {
        input: "a = [1, 2, 3], b = [4, 5, 6], n = 3",
        expected: "c = [5, 7, 9]",
        explanation: "Element-wise sum.",
      },
      {
        input: "n = 1_000_000 (block size 256), if 1_000_000 % 256 != 0",
        expected: "Launch with a grid that covers the tail (e.g. ceil(n/blockSize) blocks + bounds check)",
        explanation: "Bounds checking prevents out-of-bounds writes for partial blocks.",
      },
    ],
    solution:
      "Kernel:\n\n    __global__ void vecAdd(const float* a, const float* b, float* c, int n) {\n      int i = blockIdx.x * blockDim.x + threadIdx.x;\n      if (i < n) c[i] = a[i] + b[i];   // bounds check handles tail\n    }\n\nHost launch:\n\n    int blockSize = 256;\n    int numBlocks = (n + blockSize - 1) / blockSize;\n    vecAdd<<<numBlocks, blockSize>>>(d_a, d_b, d_c, n);\n\nKey points:\n- Use the ID threadIdx.x + blockIdx.x * blockDim.x to map threads to elements.\n- The `if (i < n)` guard is mandatory when n is not divisible by blockSize.\n- Memory here is already coalesced since consecutive threads read consecutive floats.\n- Why 256? A good default: enough threads per block for latency hiding, small enough for\n  occupancy. Tuning knobs: warp-wide efficiency (32 threads), max threads per block, occupancy.",
  },
  {
    category: "CODING",
    title: "Parallel reduction (shared memory)",
    difficulty: "MEDIUM",
    prompt:
      "Implement a CUDA parallel reduction to compute the sum of a large float array. Use shared memory and tree reduction per block, then combine block results. Include comments explaining (a) why you use shared memory, (b) how to avoid bank conflicts, and (c) why atomics are acceptable (or not) for the final combine.",
    testCases: [
      {
        input: "arr = [1, 2, 3, 4]",
        expected: "sum = 10",
        explanation: "Trivial small input; verify your block combine logic.",
      },
      {
        input: "arr = [1.0] * 1_048_576, blockSize = 256",
        expected: "sum = 1_048_576.0",
        explanation: "Checks no partial reduction is lost across 4096 blocks.",
      },
    ],
    solution:
    "Classic tree reduction in shared memory:\n\n    __global__ void reduce(const float* in, float* out, int n) {\n      extern __shared__ float sdata[];\n      int tid = threadIdx.x;\n      int i = blockIdx.x * blockDim.x + tid;\n      sdata[tid] = (i < n) ? in[i] : 0.0f;\n      __syncthreads();\n\n      for (int stride = blockDim.x / 2; stride > 0; stride >>= 1) {\n        if (tid < stride) sdata[tid] += sdata[tid + stride];\n        __syncthreads();\n      }\n      if (tid == 0) out[blockIdx.x] = sdata[0];\n    }\n\nCombine block results: either a second small kernel (arrays of partials) or a single\natomicAdd on the final block (acceptable when the number of blocks is modest; note that\natomics serialize and can hurt determinism).\n\nWhy shared memory: global memory round-trips are ~100x slower than shared; tree reduction\nin shared memory cuts global traffic from O(n) to O(numBlocks).\n\nBank conflicts: with stride-based access and consecutive halves, threads in a warp read\ndistinct banks when stride >= 32 chunks align; the classic improvement is to XOR-swap\nsdata[tid] with sdata[tid + stride]... By contrast a naive stride = 1 consecutive-sum\nimplementation causes 2-way bank conflicts; interleaved addressing fixes it.\n\nDeterminism note: floating-point order changes results slightly; deterministic summation\nis a real interview follow-up.",
  },
  {
    category: "BEHAVIORAL",
    title: "Tell me about making something dramatically faster",
    difficulty: "MEDIUM",
    prompt:
      "\"Tell me about a time when you took a slow system or piece of code and made it dramatically faster.\" Walk through how you measured beforehand, how you found the bottleneck, and how you proved the improvement afterwards.",
    testCases: [],
    solution:
    "Strong STAR answer:\n\nS: A batch job reprocessing customer data took ~9 hours overnight.\nT: Cut end-to-end time under the agreed SLA of 2 hours without changing correctness.\nA:\n- Profiled first (perf/flamegraphs or profiler) instead of guessing: found 80% of time in an\n  O(n^2) inner loop + redundant DB round trips per row.\n- Rewrote the hot path (hash lookup + batched inserts), added unit tests comparing outputs\n  byte-for-byte against the old path on a sample.\n- Measured again at each step: 9h -> 3h -> 50min. Confirmed with a shadow run in staging\n  before promoting.\nR: Jobs now finish in under an hour; the same approach was applied to two sister pipelines;\n  the incident postmortem was reused by the team next quarter.\n\nInterviewers look for: measuring first, one change at a time, quantitative before/after,\nand proving correctness preservation.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Design a GPU inference serving platform",
    difficulty: "HARD",
    prompt:
      "Design a multi-tenant platform that serves deep learning models on a fleet of GPUs, powering an API that responds to each prompt in under ~500ms at the median. Cover request flow, batching, scheduling, GPU memory management, autoscaling, and observability. Discuss tradeoffs.",
    testCases: [
      {
        input: "Peak load: 5,000 concurrent requests, mix of 1KB and 8K-token prompts",
        expected:
          "Architecture that keeps p99 latency bounded under load (batching window, queue limits, load shedding)",
      },
      {
        input: "One tenant's traffic spike saturates the fleet",
        expected: "Per-tenant quotas/priorities so one spike does not starve others",
      },
    ],
    solution:
    "Key components:\n\n1. Frontend/API layer: stateless HTTP/gRPC gateways with authN/AuthZ, rate limiting,\n   load balancing to workers. Requests carry model id + priority.\n2. Scheduler: continuous batching (in-flight iteration scheduling) groups requests onto a GPU;\n   batch size tuned per model (throughput vs latency tradeoff). Priority queues prevent\n   tenant starvation.\n3. GPU workers: preload model weights (one active set per GPU), keep KV caches pinned in\n   GPU memory; allocate caches per connection/session so long chats reuse context.\n4. Autoscaling: metric-based on queue depth and GPU utilization (not request rate alone);\n   scale-out adds worker pods; scale-in drains gracefully.\n5. Observability: request latency histograms (p50/p99/p999), GPU utilization, memory\n   fragmentation, queue depth; alert on queue growth > threshold.\n6. Tradeoffs to discuss: dynamic vs static batching; batching for throughput vs latency;\n   GPU memory fragmentation (defrag or per-size pools); whether to cache popular prompts\n   (exact-match KV cache reuse).\nFollow-ups: model versioning + gradual rollout, multi-region failover, cost controls\n(e.g., idle scale-to-zero).",
  },
  {
    category: "DOMAIN",
    title: "CUDA memory hierarchy: when and why shared memory",
    difficulty: "MEDIUM",
    prompt:
      "Explain the CUDA memory hierarchy (registers, shared, global, constant, texture; and host memory). When should you explicitly use shared memory vs letting the compiler handle global loads? Illustrate with a matrix-multiply tiling example.",
    testCases: [
      {
        input: "Threads 0..31 reading a float matrix row-major, one float each",
        expected:
          "Coalesced: consecutive threads read consecutive addresses, so the warp issues ~1-2 cache lines instead of 32 separate transactions",
      },
      {
        input: "32 threads reading elements strided by 1024 floats",
        expected: "Uncoalesced: each thread touches a different cache line; poor bandwidth utilization",
      },
    ],
    solution:
    "Hierarchy (fastest to slowest, on-chip to off-chip):\n\n- Registers: per-thread, fastest, no sharing.\n- Shared memory: on-chip, per-block, ~19-228 KB/SM depending on chip. ~100x faster than\n  global, but bank-conflict sensitive (32 banks, 4-8 bytes each).\n- Global memory: off-chip DRAM, cached in L2; accessed via 32-byte sectors / 128-byte lines.\n- Constant/texture: read-only caches, small but efficient for uniform/broadcast reads.\n\nWhen to use shared memory:\n- Data reuse across threads: matrix multiply tiles (each tile of A and B loaded once into\n  shared, reused by the whole block). Without tiling you read global memory O(N^3) times;\n  with square tiles of size B, global traffic drops by ~B/2.\n- Inter-thread communication (reductions, scans, stencils).\n- When the compiler cannot reuse values across threads (it can only cache per-thread).\n\nMemory coalescing: consecutive thread IDs should touch consecutive addresses. This turns\n32 separate global transactions into ~1-2 lines and is usually the biggest easy win.",
  },
  {
    category: "DOMAIN",
    title: "Occupancy: why is your kernel only at 40%?",
    difficulty: "HARD",
    prompt:
      "Your CUDA kernel achieves only 40% occupancy even though you launched many blocks. List the possible causes and, for each, the fix. How do you measure occupancy, and can low occupancy ever be fine?",
    testCases: [
      {
        input: "Kernel uses 80 registers/thread; 65535 registers/SM",
        expected:
          "Max threads/SM limited to floor(65535/80) ~ 819 threads -> ~12 warps (below the 64-warp SM maximum); fix: reduce registers (__launch_bounds__, simpler loop) or accept if latency-hiding is enough",
      },
      {
        input: "Each block requests 100 KB shared memory; SM has 228 KB",
        expected: "Only 2 blocks resident -> hard 40% occupancy; fix: smaller blocks / less shared per block",
      },
    ],
    solution:
    "Occupancy = resident warps / max warps per SM (reported by the Occupancy Calculator,\nnvprof/Nsight Compute achieved vs theoretical).\n\nCauses and fixes:\n\n1. Register pressure: each thread's registers multiply out. Use __launch_bounds__(maxThreadsPerBlock,\n   minBlocksPerSM) or reduce per-thread state; compiler spills go to local memory = hidden global.\n2. Shared memory per block: too much per block caps resident blocks. Split work into more,\n   smaller blocks, or restructure to use registers instead.\n3. Block size: too-small blocks waste SM resources; too-large blocks reduce scheduling\n   flexibility (e.g., 1024-thread blocks pin the SM). 128-256 is a common sweet spot.\n4. Grid size: fewer blocks than SMs means idle SMs -> look like low occupancy.\n5. Barriers (__syncthreads) serialize but do not block residency.\n\nIs low occupancy always bad? No. If each thread has enough independent work (ILP) or\nmemory-level parallelism to hide latency, 40-50% occupancy may still saturate bandwidth.\nMeasure achieved occupancy with Nsight Compute and correlate with actual throughput.",
  },
];

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

const OPENAI_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Implement causal self-attention",
    difficulty: "MEDIUM",
    prompt:
      "Implement causal (masked) self-attention in numpy (or PyTorch). Given Q, K, V of shape [B, N, D] (B batch, N sequence length, D head dim), compute\n    out = softmax(Q K^T / sqrt(D) + mask) V\nwhere `mask` is -inf above the diagonal (so token i only attends to tokens <= i). Return the output and attention probabilities.",
    testCases: [
      {
        input: "B=1, N=3, D=2, all-ones Q,K,V",
        expected: "Attention row 0: [1,0,0]; row 1: [0.5,0.5,0]; row 2: [1/3,1/3,1/3]; out = mean of attended Vs",
        explanation: "Uniform scores -> uniform distribution over allowed prefixes.",
      },
      {
        input: "N=1 (single token)",
        expected: "out == V row 0 exactly (softmax over a single element is 1)",
      },
    ],
    solution:
    "import numpy as np\n\ndef causal_attention(Q, K, V):\n    B, N, D = Q.shape\n    scale = 1.0 / np.sqrt(D)\n    scores = (Q @ K.transpose(0, 2, 1)) * scale          # [B, N, N]\n    mask = np.triu(np.full((N, N), -np.inf), k=1)        # upper triangle (strictly above diag)\n    scores = scores + mask\n    # stable softmax along the last axis\n    maxs = scores.max(axis=-1, keepdims=True)\n    exp = np.exp(scores - maxs)\n    probs = exp / exp.sum(axis=-1, keepdims=True)\n    out = probs @ V\n    return out, probs\n\nWhy the 1/sqrt(D) scaling: keeps the dot products on a stable scale regardless of D so\nsoftmax does not saturate. Causal masking is what makes a decoder causal during training.\n\nFollow-ups likely: complexity O(N^2 * D) -> why FlashAttention (tiling + recompute) wins;\npositional embeddings (RoPE); multi-head = applying this per head.",
  },
  {
    category: "CODING",
    title: "Top-k sampling with temperature",
    difficulty: "MEDIUM",
    prompt:
      "Implement `top_k_sample(logits, k, temperature) -> (indices, probabilities)`: apply temperature scaling (divide by temperature), keep only the top-k logits (set others to -inf), softmax, and return the kept indices with their probabilities in descending order. Handle k >= vocab size and temperature <= 0 gracefully.",
    testCases: [
      {
        input: "logits = [1.0, 2.0, 3.0], k = 2, temperature = 1.0",
        expected: "indices = [2, 1], probabilities = [0.731, 0.269] (e^3/(e^3+e^2), e^2/(e^3+e^2))",
      },
      {
        input: "logits = [1.0, 2.0, 3.0], k = 5 (k > vocab)",
        expected: "indices = [2,1,0], probabilities sum to 1.0 (k clipped to vocab size)",
      },
    ],
    solution:
    "import numpy as np\n\ndef top_k_sample(logits, k, temperature=1.0):\n    logits = np.asarray(logits, dtype=np.float64)\n    if temperature <= 0:\n        # greedy deterministic branch\n        i = int(np.argmax(logits))\n        return np.array([i]), np.array([1.0])\n    logits = logits / temperature\n    k = int(min(k, len(logits)))\n    topk_idx = np.argpartition(logits, -k)[-k:]\n    topk_logits = logits[topk_idx]\n    z = topk_logits - topk_logits.max()\n    exps = np.exp(z)\n    probs = exps / exps.sum()\n    order = np.argsort(-topk_logits)\n    return topk_idx[order], probs[order]\n\nWhy this matters for LLMs: temperature sharpens/flattens the distribution, top-k truncates\nthe long tail, and together they control generation diversity vs quality. Any LLM\ninference question will probe that you understand softmax, scaling, and clipping.",
  },
  {
    category: "BEHAVIORAL",
    title: "Learning a fast-moving technology area quickly",
    difficulty: "MEDIUM",
    prompt:
      "\"Tell me about a time you had to come up to speed on a brand-new, fast-moving technical area (a new framework, model, or research topic) in a short amount of time.\" How did you structure the learning, and how did you prove you had actually learned it?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: Team needed to evaluate and adopt a new model/tool; nobody owned it yet.\nT: Produce a working proof-of-concept with a written recommendation in ~2 weeks.\nA:\n- Started with primary sources (docs, model card, paper) not blog summaries; built a small\n  spreadsheet of claims to verify.\n- Set a 20% time habit: 1 paper/doc + a runnable snippet per day, kept a log.\n- Built the PoC on the team's real data and benchmarked against the incumbent with\n  identical metrics.\n- Presented findings with a clear recommend/adopt-or-not call and failure modes.\nR: Team adopted the approach; others cited my benchmark notes; I became the local expert\nand later on-boarded two teammates.\n\nOpenAI values self-directed learning and pushing past comfort zones: emphasize the\nprimary-source reading and the reproducible benchmark, not just tutorials followed.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "High-throughput LLM inference service",
    difficulty: "HARD",
    prompt:
      "Design an LLM inference service for a chat product with millions of users. Requirements: median first-token latency < 300ms, high throughput per GPU, support for continuous conversations (long contexts), and graceful degradation under load spikes. Cover batching, KV-cache management, queueing, autoscaling and monitoring.",
    testCases: [
      {
        input: "Prompt: 8k tokens context, 256-token generation, 100 QPS single model",
        expected:
          "KV cache per request sized for prefix; continuous (in-flight) batching amortizes compute; queue depth monitoring for autoscale",
      },
      {
        input: "One customer sends 50% of total traffic with trivial prompts",
        expected:
          "Rate limits per API key + priority tiers, so the popular customer cannot DoS everyone",
      },
    ],
    solution:
    "- Gateway: authN/Z, per-key rate limiting, request id tracing, load balancing to workers.\n- Batching: continuous batching (PagedAttention-style) - each step mixes requests at different\n  positions in one forward pass; gets far higher utilization than static waiting-for-full-batch.\n- KV cache: per-request/token blocks with paging to avoid fragmentation; preallocate from a\n  pooled arena per GPU; cache shared prefixes (system prompts) across requests.\n- Scheduling: shortest-remaining-first or FCFS with preemption for long generations;\n  separate fast lanes for interactive vs batch jobs.\n- Autoscaling: scale on queue depth and p50 TTFT, not on raw QPS; scale down gracefully\n  (drain sessions, flush caches) to save cost.\n- Monitoring: TTFT and inter-token latency histograms, cache hit rate, GPU util and\n  memory fragmentation; an alert when p99 TTFT crosses SLA for 5 min.\n- Tradeoffs to mention: batch size vs latency (larger batch = better throughput, worse\n  latency), request priority vs fairness, speculative decoding to cut latency at cost of\n  FLOPs, and multi-GPU tensor parallelism when one GPU cannot fit the model.",
  },
  {
    category: "DOMAIN",
    title: "KV cache: what it is and why it matters",
    difficulty: "HARD",
    prompt:
      "Explain the KV cache in autoregressive LLM inference. Why does it exist, what is its memory cost as a function of sequence length, and how does it interact with long prompts? Mention techniques like PagedAttention, prefix caching, and speculative decoding.",
    testCases: [
      {
        input: "Model: 8B params, 32 layers, 32 heads, head dim 128 (KV per token = 32*128*2*2 bytes fp16)",
        expected:
          "KV per token ~ 256 KB; a 4k-token context ~ 1 GB of KV cache per request",
        explanation: "Ability to do this arithmetic by hand is a strong signal.",
      },
    ],
    solution:
    "During autoregressive generation we recompute nothing: at step t the model attends over\nthe whole prefix, so caches K,V for every previous token and reuses them, computing only\none token's Q. That turns generation cost from O(n^2) attention recompute into O(n) per\nstep memory access.\n\nMemory cost: per layer, per token: 2 tensors (K and V) * num_heads * head_dim * bytes.\nExample: 32 heads, head dim 128, fp16 (2 bytes) -> 32*128*2*2 = 16 KB per layer -> with 32\nlayers ~512 KB per token. A 4k context -> ~2 GB. That is why long-context serving is\nmemory-bound: KV cache, not weights, dominates.\n\nMitigations:\n- PagedAttention: KV as fixed-size blocks with virtual -> physical mapping (like OS paging),\n  eliminating fragmentation and enabling memory sharing (speculative + beam reuse).\n- Prefix caching: recompute/keep KV of shared system prompts once.\n- GQA (grouped query attention): fewer KV heads, same quality, big memory savings.\n- Speculative decoding: a small draft model proposes tokens, the big model verifies in\n  parallel; cuts latency without changing quality (and reduces KV traffic).",
  },
  {
    category: "DOMAIN",
    title: "Gradient accumulation in distributed training",
    difficulty: "MEDIUM",
    prompt:
      "Explain gradient accumulation and why pipelines use it in distributed training (e.g., DeepSpeed ZeRO). How does accumulating gradients compare to increasing the batch size? What goes wrong if you accumulate without per-microbatch loss scaling?",
    testCases: [
      {
        input: "Global batch 256, GPUs 8, per-GPU batch 8, microbatches=4",
        expected:
          "Effective batch = 8 GPUs * 8 * 4 accumulated grads = 256; weights updated once per accumulation cycle",
      },
    ],
    solution:
    "With model parallelism (tensor parallel, pipeline parallel, ZeRO sharding) the per-GPU\nbatch is small, which makes gradients noisy. Gradient accumulation sums gradients over\nk microbatches before one optimizer step, recovering the effective batch size\n(effective_batch = num_gpus * per_gpu_batch * accumulation_steps).\n\nCompared to truly larger batch: functionally similar for the optimizer, but with caveats -\n- batch norm statistics and loss scaling must be handled (scale each microbatch loss by 1/k,\n  or use grad scalers consistently with AMP);\n- communication of the accumulated gradient happens once per cycle, cutting bandwidth.\n\nWhy needed in ZeRO/pipeline parallel: pipeline stages naturally process microbatches in\nwaves; gradient accumulation keeps data-parallel semantics identical to non-pipelined\ntraining. Follow-up: mixed-precision (fp16/bf16) uses a master loss scale; accumulation multiplies\nit - overflow risk - so master scaling must be adjusted or the scale applied before sum.",
  },
];

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

const GOOGLE_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Merge k sorted linked lists",
    difficulty: "MEDIUM",
    prompt:
      "You are given k sorted singly-linked lists. Merge them into one sorted linked list and return it. Optimize for k and total elements n. State time and space complexity.",
    testCases: [
      {
        input: "lists = [[1,4,5],[1,3,4],[2,6]]",
        expected: "[1,1,2,3,4,4,5,6]",
      },
      {
        input: "lists = [[]]",
        expected: "[]",
      },
    ],
    solution:
    "Use a min-heap of size k:\n\n    import heapq\n    def mergeKLists(lists):\n        heap = [(head.val, i, head) for i, head in enumerate(lists) if head]\n        heapq.heapify(heap)\n        dummy = tail = ListNode()\n        while heap:\n            val, i, node = heapq.heappop(heap)\n            tail.next = node\n            tail = node\n            if node.next:\n                heapq.heappush(heap, (node.next.val, i, node.next))\n        return dummy.next\n\nO(n log k) time, O(k) heap space (or O(k) with divide-and-conquer merging without a heap:\nO(n log k) too, but O(1) extra space).\n\nWhy Google asks this: it is the shape of many real distributed problems - merging\nsorted shards/runs from k partitions. Follow-ups: k-way merge of streams (external\nmerge sort), network shuffles of sorted data.",
  },
  {
    category: "CODING",
    title: "Top K queries in a sliding time window",
    difficulty: "MEDIUM",
    prompt:
      "Search queries arrive as a stream. Maintain a data structure so you can answer, at any time, which K queries occurred most frequently in the last hour (sliding window). Describe the data structures and complexity per query and per answer.",
    testCases: [
      {
        input: "q1 x3, q2 x5 in the window",
        expected: "top 1 = q2, top 2 order = [q2, q1] by count desc",
      },
      {
        input: "Old query expires out of the window",
        expected: "Counts decay automatically; expired entries must not be returned",
      },
    ],
    solution:
    "Two structures:\n\n1. A queue of (timestamp, query) per event + per-query frequency map for the window.\n2. A bucket/ordered structure (e.g., TreeMap<count, set<query>> or a max-heap rebuilt\n   lazily) to answer top-K.\n\nEvents: append to queue; on expiry (older than T), decrement query count and update the\nordered index. Elapsed-window semantics matter: an exact 1-hour window is O(expired) per\nanswer; approximate versions use bucketed histograms (e.g., 60 one-minute buckets) which\nmake expiry O(1) amortized per event.\n\nComplexities: O(1) amortized per stream event with buckets; top-K query O(K) with the\nordered count index (or O(N + K log N) with a lazy heap).\n\nInterviewers probe: you reason about decay/expiry, approximate vs exact, and memory\nbounds when the stream is huge (sketches like Count-Min come up at scale).",
  },
  {
    category: "BEHAVIORAL",
    title: "Pushing back on a product decision",
    difficulty: "MEDIUM",
    prompt:
      "\"Tell me about a time you disagreed with a product or engineering decision that you thought was wrong, and how you handled it.\" What evidence did you bring, how did you make your case, and what was the outcome?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: Team planned to ship a feature with a design I believed would hurt reliability.\nT: Change the design without blocking the ship date.\nA:\n- Gathered data first (incident history, benchmark numbers), not opinions.\n- One-on-one with the decision-maker to understand their constraints (commitments, timing).\n- Proposed a compromise: ship with a behind-a-flag rollout + kill-switch, keeping the\n  schedule.\n- Escalated respectfully only after data showed real risk; documented the reasoning.\nR: Feature shipped on time with the flag; the risk materialized, the flag was flipped,\nand the team publicly credited the pre-emptive analysis.\n\nGoogle looks for: evidence-based disagreement, psychological safety, and commitment to\nthe team's goals even when you lose the argument.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Design a URL shortener",
    difficulty: "MEDIUM",
    prompt:
      "Design a URL shortening service (like goo.gl / TinyURL). Requirements: shorten long URLs, redirect short URLs, ~100M new URLs/month, handle 10k QPS reads. Cover storage, key generation, redirect behavior, analytics, and scale-out.",
    testCases: [
      {
        input: "Insert 100M URLs/month -> need keys for ~50M long URLs",
        expected:
          "7-8 char base62 space (62^7 ~ 3.5e12) is ample; collisions handled by retry or deterministic encoding",
      },
      {
        input: "10k read QPS, cache hit ratio >= 95%",
        expected:
          "Long->short: DB append; short->long: cache-first (Redis) then DB; cache miss thundering herd mitigated by single-flight/hedged reads",
      },
    ],
    solution:
    "API: POST /shorten {url} -> {short}; GET /:code -> 301/308 redirect to long URL.\n\nStorage: relational DB (short_code PK, long_url, owner, timestamps) + Redis cache.\nKey generation: base62 encode of a random/counter value (7 chars = 3.5e12 keys, ample);\ncheck-and-retry on collision or use a dedicated keys table. Never store the same long URL\nwith two codes unless required.\n\nRedirect: 301 (permanent, cacheable -> high cache hit) or 302/308 for analytics-precise\ninterstitial. Analytics: async log long->short code + timestamp into a queue (Kafka),\naggregate counts in a counter table/Redis, serve per-link stats.\n\nScale-out: stateless web tier behind LB; DB read replicas; Redis cluster; shard by code.\n\nderived keys if read-heavy. Tradeoffs to mention: redirect codes, cache invalidation for\nlink deletion/expiry, abuse protection (rate limit creation per user).",
  },
  {
    category: "DOMAIN",
    title: "Inverted index and ranking",
    difficulty: "MEDIUM",
    prompt:
      "Explain how a search engine stores and serves documents: what an inverted index is, how posting lists are organized, and how ranking works at query time (BM25 intuition). How would you handle a query with many terms?",
    testCases: [
      {
        input: "docs: d1=\"hello world\", d2=\"hello search\"",
        expected:
          "Inverted index: hello -> [d1, d2], world -> [d1], search -> [d2]; query \"hello world\" -> d1 matched by both terms",
      },
    ],
    solution:
    "Inverted index: for each term, the sorted list of document IDs (posting list) that contain\nit, optionally with term frequency/positions.\n\nQuery-time: intersect/posting-list traversal per query term, score candidates (dev-docs\nwith TF-IDF / BM25):\n    score(d, q) = sum over terms of IDF(t) * (tf * (k1+1)) / (tf + k1 * (1 - b + b * |d|/avgdl))\nIDF rewards rare terms; k1/b control term-frequency saturation and length normalization.\n\nLong/many-term queries: cap the number of query terms (top-N by IDF), use top-k candidate\nretrieval (WAND / Block-Max) instead of full scoring, and early-terminate the posting list\nscan. Real systems add: segmentation, spell correction, query rewrite, and a two-phase\ncascade (cheap candidate generation then expensive ranking model).",
  },
];

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const META_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Clone a graph (friend graph)",
    difficulty: "MEDIUM",
    prompt:
      "Given a reference to a node in a connected undirected graph (each node has a list of neighbors), return a deep copy of the graph. Handle cycles. Optimize to O(V + E).",
    testCases: [
      {
        input: "adj = [[2,4],[1,3],[2,4],[1,3]] (square)",
        expected: "Deep copy with same topology; original and copy do not share nodes",
      },
      {
        input: "adj = [[]] (single node)",
        expected: "New single node, no neighbors",
      },
    ],
    solution:
    "BFS/DFS with a hashmap from original node -> clone, so each node is created once (this\nbreaks cycles):\n\n    def cloneGraph(node):\n        if not node: return None\n        clones = {node: Node(node.val)}\n        stack = [node]\n        while stack:\n            cur = stack.pop()\n            for nb in cur.neighbors:\n                if nb not in clones:\n                    clones[nb] = Node(nb.val)\n                    stack.append(nb)\n                clones[cur].neighbors.append(clones[nb])\n        return clones[node]\n\nTime O(V+E), space O(V). The key insight: a visited map, since reflective edges and\ncross-topology edges would otherwise cause infinite recursion or duplicated nodes.\n\nMeta framing: meant to mirror the friend graph / social graph you work with: real\nrelationships are graphs, not trees - expect the interviewer to add 'handle 1B nodes,\nshard by component' as a system follow-up.",
  },
  {
    category: "BEHAVIORAL",
    title: "A conflict with a coworker and how it was resolved",
    difficulty: "MEDIUM",
    prompt:
      "\"Tell me about a conflict you had with a colleague or team. What was the root cause, what did you do, and what was the outcome?\" Be specific about your own actions, not just the other person's.",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: I and a teammate disagreed about ownership/approach on a shared feature; work was blocked.\nT: Unblock quickly without damaging the relationship or the product.\nA:\n- I set up a focused 1:1 rather than arguing in group chat, and restated their view\n  accurately before giving mine (listening first).\n- We found the real disagreement was about scope, not approach; agreed on a small\n  experiment with a decision deadline and a 'disagree and commit' fallback.\n- I documented the decision so future debates referenced the record, not memory.\nR: Feature shipped; we paired on the next project; the 1:1 ritual became team practice.\n\nMeta specifically values directness + results ('move fast'), so emphasize acting quickly\nwith a bias for outcome while keeping it respectful. Avoid stories where the other person\nwas purely at fault.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Design the Facebook News Feed",
    difficulty: "HARD",
    prompt:
      "Design a service that shows each user a personalized feed of posts from friends/pages they follow: ranking, delivery (push fanout vs pull), caching, and handling celebrities (users with millions of followers).",
    testCases: [
      {
        input: "User follows 500 friends; each produces ~1 post/day",
        expected:
          "Pull-on-read or hybrid: store per-user feed cache; fanout only to active users",
      },
      {
        input: "A celebrity (10M followers) posts once",
        expected:
          "Push to celebrities' 10M subscribers would fanout-storm; use pull-on-read for high-follower accounts (hybrid fanout)",
      },
    ],
    solution:
    "Core pipeline: producers -> (write path) -> feed store -> (read path) ranking -> clients.\n\nRanking signals: recency, affinity (author-user interaction), content type, engagement\nfeatures (photos/video weight), plus ML ranker per request.\n\nDelivery:\n- Pure push (fanout-on-write): on post, write to every follower's feed; fast reads but\n  write amplification, infeasible for celebrities.\n- Pure pull: read-time merge of timelines; expensive reads for heavy users.\n- Hybrid: write fanout to active users' feeds (push), pull-on-read for celebrities and\n  inactive users; per-user caps on push distribution.\n\nStorage: feed is a per-user list (Redis / memcache with message queues for async writes);\npost contents in a blob/object store, metadata in DB.\n\nCaching: feed cache TTL seconds, ranking cache per (user, coarse recency), invalidation\non new posts.\n\nExtensions to discuss: cross-site/ads insertion, realtime (websockets/long-poll for\nupdates), geographic latency, ranking as a service with A/B experiments.",
  },
  {
    category: "DOMAIN",
    title: "React re-renders and performance",
    difficulty: "MEDIUM",
    prompt:
      "In a React app, when do components re-render, and how do you diagnose and fix re-render-related slowdowns (e.g., a long list that janks)? Mention React.memo, useMemo/useCallback, keys, and React DevTools Profiler.",
    testCases: [
      {
        input: "A 10,000-row list re-renders when an unrelated state in the parent changes",
        expected:
          "Fix: memoize rows (React.memo), stabilize row props (useCallback/useMemo), stable keys; verify with Profiler",
      },
    ],
    solution:
    "A component re-renders when: (1) its parent re-renders (unless memoized), (2) its own\nstate changes, (3) props change identity, or (4) context it consumes changes.\n\nFixes, in order:\n- Keep state local: don't lift state that only a subtree needs.\n- React.memo the expensive leaf (rows, cells) so parents' re-renders skip it.\n- Stabilize props: useCallback for callbacks, useMemo for derived objects/arrays - new\n  object identity each render defeats memo.\n- Keys: stable, unique keys (index keys cause full-row DOM churn and broken state).\n- For virtualized lists, virtualize (react-window) so only visible rows mount.\n\nDiagnosis: React DevTools Profiler (which components render, how long), and `<Profiler>`\nonUpdate callback to measure in production-ish conditions. Avoid premature optimization:\nmeasure first, optimize the real bottleneck.",
  },
];

// ---------------------------------------------------------------------------
// Amazon
// ---------------------------------------------------------------------------

const AMAZON_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "LRU cache",
    difficulty: "MEDIUM",
    prompt:
      "Design and implement an LRU (least recently used) cache: get(key) and put(key, value), both O(1) average, evicting the least recently used entry when capacity is exceeded.",
    testCases: [
      {
        input: "cap=2; put(1,1); put(2,2); get(1)=1; put(3,3)",
        expected: "key 2 evicted (LRU); get(2) = -1; get(3) = 3",
      },
      {
        input: "cap=2; put(1,1); put(2,2); get(1); put(3,3)",
        expected: "get(1) validates that touching a key refreshes recency; key 2 still evicted",
      },
    ],
    solution:
    "HashMap + doubly-linked list (hash gives O(1) lookup; list gives O(1) move-to-front and\nO(1) eviction):\n\n    class LRUCache:\n        def __init__(self, cap):\n            self.cap = cap\n            self.map = {}                 # key -> node\n            self.head, self.tail = Node(), Node()   # sentinels\n            self.head.next, self.tail.prev = self.tail, self.head\n\n        def _remove(self, node): ...\n        def _add_to_front(self, node): ...\n        def get(self, key):\n            if key not in self.map: return -1\n            node = self.map[key]\n            self._remove(node); self._add_to_front(node)\n            return node.val\n        def put(self, key, val):\n            if key in self.map: self._remove(self.map[key])\n            node = Node(key, val)\n            self.map[key] = node\n            self._add_to_front(node)\n            if len(self.map) > self.cap:\n                lru = self.tail.prev\n                self._remove(lru); del self.map[lru.key]\n\nWhy Amazon asks: caches are everywhere (product catalog hot items, session data). Follow-ups:\na-second-level cache (LFU variant), thread safety (locks), sharding by key hash.",
  },
  {
    category: "CODING",
    title: "String rotation check",
    difficulty: "EASY",
    prompt:
      "Given two strings s1 and s2, determine if s2 is a rotation of s1 (e.g., \"waterbottle\" rotated at 2 -> \"terbottlewa\"). O(1) extra space beyond the input.",
    testCases: [
      {
        input: "s1 = \"waterbottle\", s2 = \"terbottlewa\"",
        expected: "true",
      },
      {
        input: "s1 = \"abc\", s2 = \"acb\"",
        expected: "false",
      },
    ],
    solution:
    "s2 is a rotation of s1 iff (s1 + s1) contains s2 as a substring (and lengths match):\n\n    def is_rotation(s1, s2):\n        return len(s1) == len(s2) and s2 in s1 + s1\n\nExpected O(n) time (substring search via KMP if asked to be exact), O(1) extra memory.\n\nFollow-up: with limited memory or streaming input, use two pointers scanning s1 twice\ninstead of materializing s1 + s1.",
  },
  {
    category: "BEHAVIORAL",
    title: "Invent and Simplify / calculated risk",
    difficulty: "MEDIUM",
    prompt:
      "Amazon Leadership Principles: \"Invent and Simplify\" and \"Bias for Action.\" Tell me about a time you simplified a complex process or took a calculated risk to move faster. What were the tradeoffs you weighed, and how did it turn out?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: A recurring release process took 6 manual steps across three tools and a day of\ncoordination.\nT: Cut it to one command, without increasing release risk.\nA:\n- Mapped the manual steps; found 80% were mechanical (version bump, tagging, deploy, smoke).\n- Scripted them into a CI pipeline with a safety gate: automated smoke tests + one-click\n  rollback button; documented the decision memo including what could break.\n- Piloted on a low-risk service first, expanded after 2 weeks stable.\nR: Release time 1 day -> 15 minutes; the pilot caught 3 regressions before rollout, and the\nteam adopted the pipeline for all services the next quarter.\n\nAmazon expects: a specific calculated risk with explicit tradeoff analysis (what you could\nlose vs gain), measuring the outcome, and linking to the LP by name.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Product recommendation service",
    difficulty: "MEDIUM",
    prompt:
      "Design a recommendation service for an e-commerce site: take a user and a context (page they are on) and return 20 personalized product recommendations in under 200ms. Cover data (user signals, catalog), serving architecture, freshness, and A/B testing.",
    testCases: [
      {
        input: "200ms SLA at 50k QPS",
        expected:
          "Serving is cache-dominated; model inference offline or on fast path; no per-request heavy joins",
      },
    ],
    solution:
    "Layers:\n\n- Candidate generation (offline, daily/hourly): collaborative filtering (users who bought X\nalso bought Y), co-purchase/co-view graphs, similar-item embeddings (item2vec). Produces\nper-user and per-item candidate pools.\n- Ranking (offline or near-online): learning-to-rank over features (user, item, context)\n  trained on click/order logs; serve top-20.\n- Serving: cache per-user top-N and per-page top-N (Redis); fast path = merge cached\n  candidates with freshness bits; the 200ms SLA is met because ranking is precomputed\n  offline and only a merge + filter happens online.\n- Freshness: nearline recompute on order events (streaming), cold starts for new items\n  (popularity/bandit fallback).\n\nA/B testing: serve different rankers to segments (experiment id in request), log exposure\nand outcome; guardrail metrics: CTR, add-to-cart, revenue per session, latency.\n\nTradeoffs: personalization vs latency (precompute wins), quality vs freshness (blend),\nand cold-start for new users/items.",
  },
  {
    category: "DOMAIN",
    title: "S3-style durability and consistency",
    difficulty: "MEDIUM",
    prompt:
      "Explain how AWS S3 achieves 11 nines of durability and its consistency model (now strong read-after-write for PUTs, previously eventual). What tradeoffs make strong consistency expensive, and how would you design a simpler key-value blob store that is 'fast and eventually consistent'?",
    testCases: [
      {
        input: "Client PUTs object then immediately GETs same key",
        expected:
          "Strong read-after-write: GET returns the new object (since 2020 for PUTs) - explain the control-plane->data-plane handshake",
      },
    ],
    solution:
    "Durability: S3 replicates each object across >= 3 AZs; 11 nines comes from design + scrub\n(broken/mismatched chunks detected and re-replicated) + versioning. Objects live in\nbucket + key, chunks are erasure-coded/raid in AZs.\n\nConsistency evolution: S3 was eventually consistent for a long time; GCP GCS was strong;\nAWS added strong read-after-write for new PUTs in Dec 2020 by routing through a\ncontrol-plane node that acts as a coordinator: the PUT's metadata lands in a consistent\nstore before the GET passes a barrier. Cost: extra hop + coordination latency for writes.\n\nDesign a simpler store: chunk content-addressed blobs, metadata store (e.g., a\nKV/table) with replication (Raft/etcd-style) for object -> chunk mapping; serve reads from\nnearest replica with a metadata lookup; to get eventual consistency quickly, replicate\nmetadata asynchronously and accept stale reads; add strong reads by forcing synchronous\nquorum for the metadata key.\n\nWhy Amazon asks: S3/Dynamo are their core systems; they want to see you reason about\nreplication, durability math, and consistency tradeoffs, not recite a spec.",
  },
];

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------

const APPLE_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Trie with prefix search (autocomplete)",
    difficulty: "MEDIUM",
    prompt:
      "Implement a typed dictionary with insert(word) and a method to return all words with a given prefix, sorted lexicographically. Optimize for many lookups; include early termination for prefixes that do not exist.",
    testCases: [
      {
        input: "insert: apple, app, apply, banana; searchPrefix(\"app\")",
        expected: "[\"app\", \"apple\", \"apply\"]",
      },
      {
        input: "searchPrefix(\"appl\")",
        expected: "[\"apple\", \"apply\"]",
      },
      {
        input: "searchPrefix(\"xyz\")",
        expected: "[]",
      },
    ],
    solution:
    "Trie (prefix tree): each node has a dict of children + a flag if it is the end of a word.\nInsert O(L); searchPrefix O(L + output).\n\n    class TrieNode:\n        def __init__(self):\n            self.children = {}\n            self.is_word = False\n\n    class Autocomplete:\n        def insert(self, word):\n            node = self.root\n            for ch in word:\n                node = node.children.setdefault(ch, TrieNode())\n            node.is_word = True\n\n        def words_with_prefix(self, prefix):\n            node = self.root\n            for ch in prefix:\n                if ch not in node.children: return []\n                node = node.children[ch]\n            return [w for w in self._collect(node, prefix)]\n\n        def _collect(self, node, path):\n            words = []\n            if node.is_word: words.append(path)\n            for ch in sorted(node.children):\n                words += self._collect(node.children[ch], path + ch)\n            return words\n\nApple angle: keyboard/spotlight autocomplete; follow-ups: rank by frequency (store count\nat node, sort by count), memory (compact via trie of bytes), partial matching with\nwildcards, prefix-as-you-type debouncing.",
  },
  {
    category: "BEHAVIORAL",
    title: "Obsessing over detail/quality of user experience",
    difficulty: "MEDIUM",
    prompt:
      "Apple values craft and attention to detail. Tell me about a time you went beyond the requirements to deliver a polished experience — details people only notice when they are missing. What specifically did you do, and what feedback did you get?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: Shipping a settings screen that felt 'completed but plain' with a 60fps target.\nT: Polish it beyond the ticket without slipping the milestone.\nA:\n- Profiled first: found frame drops from layout thrash; fixed by batching layout invalidation.\n- Hand-tuned empty states, focus order, keyboard flows, and micro-interactions (progress\n  animation easing) that the ticket never mentioned.\n- Cut scope consciously elsewhere to keep the date; wrote up what I did and why.\nR: Reviewers called out the polish in the release notes; retention on that flow improved;\nI added the patterns to the team's design-token library.\n\nApple interviews want: genuine obsession with the last 5%, evidence of taste (you know\nWHY the detail matters), and the discipline to prioritize it without breaking schedule.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Multi-device sync (iCloud-style)",
    difficulty: "HARD",
    prompt:
      "Design a sync system so a user's notes/document edits on any of their devices appear on all others within seconds, work offline, and do not lose data on conflicts. Cover conflict resolution, offline queues, and the server architecture.",
    testCases: [
      {
        input: "Same note edited on iPhone and Mac while offline",
        expected:
          "No data loss: per-field merge (CRDT or last-write-wins with tombstone) + conflict copy",
      },
      {
        input: "Device offline for a week with 200 edits",
        expected: "Edits queue locally; replay in causal/ts order on reconnect; server stays source of truth",
      },
    ],
    solution:
    "Server: per-user document store with per-document version vector/clock, WebSocket or\nlong-poll push channel, REST fallback.\n\nOffline: local SQLite log of operations; on reconnect, send ops with their logical clocks;\nserver applies with merge function. Never lose data: merge, don't drop.\n\nConflict resolution strategy depends on data:\n- LWW (last-write-wins) + tombstones: simple, but losing edits on true conflicts.\n- CRDTs (e.g., text CRDT for cursor-based edits, counters, registers) for mergeable data:\n  commutative ops arrive in any order, converge eventually. More engineering, no lost data.\n- Hybrid: CRDT for rich text, LWW for simple fields, and 'duplicate as conflict copy' for\n  unresolvable cases.\n\nBeyond the happy path: per-device encryption (Apple angle - E2E), server never sees plaintext\n(keys on device, keychain recovery), snapshotting for storage, and bandwidth for\nlarge media (chunk upload, content-addressing to dedupe).",
  },
  {
    category: "DOMAIN",
    title: "ARC, retain cycles, weak/unowned",
    difficulty: "MEDIUM",
    prompt:
      "Explain Automatic Reference Counting in Swift: when releases happen, what a retain cycle is, when you use weak vs unowned, and why/when you might need an autoreleasepool in Swift.",
    testCases: [
      {
        input: "class A { var b: B? }; class B { var a: A? }; a.b = b; b.a = a",
        expected:
          "Retain cycle: both stay alive forever; fix: make one side weak (e.g., b.a weak) - describe the leak and the fix",
      },
      {
        input: "Loop creating many temporary large objects without ARC releasing promptly (e.g., in command-line arbitrary loops)",
        expected: "autoreleasepool { } per iteration to bound peak memory",
      },
    ],
    solution:
    "ARC inserts retain/release at compile time: an object's memory is freed when its retain\ncount hits zero (i.e., no strong references). Exclusively a compile-time feature - no GC.\n\nRetain cycle: A strongly references B and B strongly references A -> neither ever reaches\nrefcount 0: leak. Fix: one reference is weak (or unowned).\n- weak: does not keep the object alive; auto-nil when the object deallocates; always for\n  delegates/observers when the reference may outlive the object.\n- unowned: also non-owning but crashes (precondition) if accessed after dealloc; use when\n  you guarantee the referent outlives you (e.g., self in a closure that dies with parent).\n\nAutoreleasepool: ARC releases most objects immediately, but autorelease pools still exist\nfor returned objects + ObjC interop; a tight loop creating many objects (e.g., NSNumber\nbridging) can balloon memory until the pool drains - wrap the loop body in\nautoreleasepool { ... } to cap peak memory.",
  },
];

// ---------------------------------------------------------------------------
// Microsoft
// ---------------------------------------------------------------------------

const MICROSOFT_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Integer to English words",
    difficulty: "MEDIUM",
    prompt:
      "Convert a non-negative integer (0 <= num <= 2^31 - 1) to its English words representation (e.g., 123 -> \"One Hundred Twenty Three\"). Mind the edge cases: 0, teens, and groups of thousands.",
    testCases: [
      {
        input: "123",
        expected: "\"One Hundred Twenty Three\"",
      },
      {
        input: "12345",
        expected: "\"Twelve Thousand Three Hundred Forty Five\"",
      },
      {
        input: "0",
        expected: "\"Zero\"",
      },
      {
        input: "1000000",
        expected: "\"One Million\"",
      },
    ],
    solution:
    "Process the number in groups of 3 (thousands, millions, billions). For each group:\nones, tens + ones with the teen table, hundreds; append the scale word.\n\n    def numberToWords(num):\n        if num == 0: return \"Zero\"\n        ones = [\"\", \"One\", ..., \"Nine\"]\n        teens = [\"Ten\", \"Eleven\", ..., \"Nineteen\"]\n        tens = [\"\", \"\", \"Twenty\", \"Thirty\", \"Forty\", \"Fifty\", \"Sixty\", \"Seventy\", \"Eighty\", \"Ninety\"]\n        scales = [\"\", \"Thousand\", \"Million\", \"Billion\"]\n\n        def chunk(n):\n            words = []\n            if n >= 100: words += [ones[n//100], \"Hundred\"]; n %= 100\n            if 10 <= n < 20: words.append(teens[n-10]); return words\n            if n >= 20: words.append(tens[n//10]); n %= 10\n            if n > 0: words.append(ones[n])\n            return words\n\n        out = []\n        i = 0\n        while num:\n            part = num % 1000\n            if part: out = chunk(part) + [scales[i]] + out\n            num //= 1000; i += 1\n        return \" \".join(w for w in out if w).strip()\n\nEdge cases that trip people: 0, teens inside a group (\"Twelve Thousand...\"),\ncollapsed spaces, and \"Hundred\" boundaries. Microsoft likes this classic.\n(official LeetCode #273)",
  },
  {
    category: "BEHAVIORAL",
    title: "Delivering under a tight deadline",
    difficulty: "MEDIUM",
    prompt:
      "\"Tell me about a time you had to ship under a tight deadline with competing priorities.\" How did you decide what to cut, how did you keep stakeholders aligned, and what was the result?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: A customer-facing feature had a hard regulatory deadline; the team was also mid\nrefactor.\nT: Ship a compliant, safe version on time; sequence the refactor without rework.\nA:\n- Listed must-have vs nice-to-have in a public doc; got engineering + product to sign off\n  on the cut list BEFORE committing (stakeholder alignment beats surprise cuts).\n- Sequenced work: landed the refactor's foundation first so the feature reused it,\n  avoiding throwaway code.\n- Daily 15-min syncs, one-page status to leadership; asked for (and got) one targeted\n  exemption instead of silently overworking.\nR: Shipped on time, passed the audit; refactor finished the following sprint; the\ncut-list ritual became the team's planning default.\n\nMicrosoft values: clarity under pressure, honest scope management, and cross-team\nstakeholder communication.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Telemetry/event ingestion pipeline",
    difficulty: "MEDIUM",
    prompt:
      "Design a system that ingests billions of events/day from many services (like Azure Event Hubs): reliable ingestion under burst, ordering per partition, replay, and downstream analytics. Cover partitioning, backpressure, retention, and exactly-once vs at-least-once.",
    testCases: [
      {
        input: "Spike: 10x normal rate for 30 minutes",
        expected: "Ingestion decoupled via buffer (broker) with horizontal scaling; no loss - producers block or spill to disk, brokers buffer",
      },
      {
        input: "Consumer crash mid-processing",
        expected: "At-least-once with checkpoint offsets: consumer re-reads from last committed offset and dedupes output",
      },
    ],
    solution:
    "Architecture: producers (SDK with batching + retry + backoff) -> event broker (partitioned\nlog, e.g., Event Hubs/Kafka style) -> consumers (stream processors) -> sinks (analytics\nstore: blob/warehouse, dashboards, alerts).\n\nPartitioning: key-based hash or round-robin; per-partition ordering guaranteed, cross-\npartition ordering only by timestamp heuristic. Partition count set by target throughput\n(each partition ~1 MB/s writes, ~2 MB/s reads in Event Hubs terminology).\n\nDurability: append-only log replicated to 3 copies (quorum); if broker unavailable,\nproducers spill to a local file/queue so no events are lost.\n\nConsumption semantics: consumer groups with committed offsets; at-least-once default\n(crash -> re-read from checkpoint, dedupe on sink), exactly-once via transactional\nsinks/idempotent writes if needed.\n\nBackpressure: consumers lag -> alert; autoscale consumers; retention (default 1-7 days)\nbounds storage.\n\nFollow-ups: schema registry and Avro/Protobuf evolution, partitioning skew (hot keys),\nand reordering hazards for late-arriving events.",
  },
  {
    category: "DOMAIN",
    title: ".NET garbage collection generations",
    difficulty: "MEDIUM",
    prompt:
      "Explain the .NET GC: generational model (Gen0/1/2), when full collections happen, what the Large Object Heap is, and how you would tune allocations for a latency-sensitive ASP.NET service.",
    testCases: [
      {
        input: "Service latency spikes every few minutes",
        expected:
          "Suspect Gen2/LOH collections: pool and reuse large buffers; avoid large >85KB allocs; use Server GC with per-core heaps; monitor via counters",
      },
    ],
    solution:
    ".NET GC is a generational, mark-compact (mostly non-moving for LOH) collector:\n- Gen0: tiny allocations (new objects); collected frequently, cheap.\n- Gen1: survivor of Gen0; short-lived.\n- Gen2: long-lived; full collections are expensive and cause pauses.\n- LOH: single objects >= 85 KB; collected only on Gen2, NOT compacted (unless opted in) ->\n  fragmentation risk.\n\nLatency tuning for an ASP.NET service:\n- Pool/reuse buffers (ArrayPool<T>) instead of frequent big allocations.\n- Reduce transient: keep long-lived objects long-lived (avoid promotion churn).\n- Server GC (server + concurrent): per-core heaps, higher throughput, bigger working set;\n  client GC (workstation) lower latency but more GC time.\n- Set GC mode: Workstation vs Server via runtimeconfig; consider\n  gcAllowVeryLargeObjects only if you know why.\n- Measure with counters (GC gen0/1/2 counts, % time in GC, allocation rate) before tuning\n  anything.\n\nInterviewer probes: difference between reference counting/ARC and tracing GC, why\nfinalizers (IDisposable) matter, and GC pauses vs background/concurrent GC.",
  },
];

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

const ANTHROPIC_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Token-level F1 evaluation (SQuAD-style)",
    difficulty: "MEDIUM",
    prompt:
      "Implement an evaluation function that compares a predicted answer string against a reference string and returns (exact_match, token_f1): token-level F1 is the F1 over whitespace-tokenized, lowercased tokens (2*precision*recall/(precision+recall), 0 if no common tokens).",
    testCases: [
      {
        input: "pred=\"The answer is 42\", ref=\"the answer was 42\"",
        expected: "exact_match=false; common={the,answer,42} -> precision=3/4, recall=3/4, f1=0.75",
      },
      {
        input: "pred=\"42\", ref=\"forty two\"",
        expected: "exact_match=false, f1=0.0 (no overlapping tokens)",
      },
    ],
    solution:
    "import re\n\ndef normalize(s):\n    return re.findall(r'\\w+', s.lower())\n\ndef f1_score(pred, ref):\n    p, r = normalize(pred), normalize(ref)\n    common = set(p) & set(r)\n    if not common: return 0.0\n    precision = len(common) / len(p)\n    recall = len(common) / len(r)\n    return 2 * precision * recall / (precision + recall)\n\ndef exact_match(pred, ref):\n    return normalize(pred) == normalize(ref)\n\ndef evaluate(pred, ref):\n    em = exact_match(pred, ref)\n    f1 = f1_score(pred, ref)\n    return em, f1\n\nWhy this matters: eval harnesses for QA/retrieval use EM + token-F1 as cheap proxies\nfor correctness. Anthropic cares about rigorous evals: be ready to discuss dataset\ncontamination, test-set leakage, and when EM/F1 mislead (semantic equivalence with\ndifferent wording -> NLI-style or LLM-judge evals).",
  },
  {
    category: "BEHAVIORAL",
    title: "Changing your mind with new evidence",
    difficulty: "MEDIUM",
    prompt:
      "Anthropic's values reward honesty and updating on evidence. Tell me about a time you changed your mind about an important decision after encountering new evidence. What convinced you, how did you communicate the reversal, and what did others learn from it?",
    testCases: [],
    solution:
    "STAR skeleton (emphasize the honesty, not the win):\n\nS: I had argued for approach A in a design review; two teammates pushed back.\nT: Reach the best decision even if it meant reversing my public position.\nA:\n- Went back to the data: I ran the benchmark I had dismissed earlier; it objectively\n  contradicted my assumptions.\n- Stated the reversal clearly, in front of the same group: named the specific evidence\n  and what I had gotten wrong (no face-saving).\n- Co-authored the follow-up plan with the teammate whose view I adopted.\nR: The team shipped the better design; the public reversal set a norm that evidence\nbeats ego - someone later cited it as why they spoke up.\n\nAnthropic interviewers probe intellectual honesty: they want genuine examples where the\nnew evidence was real and the reversal costly, not theater.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "LLM evaluation harness",
    difficulty: "HARD",
    prompt:
      "Design an evaluation platform for language models: run thousands of prompts across datasets and model versions, produce comparable metrics, and surface regressions. Cover dataset management, parallel execution, cost control, contamination, and reporting.",
    testCases: [
      {
        input: "New model version answers 3% worse on a subset of coding prompts",
        expected:
          "Harness flags per-slice regressions (by category, prompt length, difficulty) before rollout; diff view vs previous version",
      },
    ],
    solution:
    "- Dataset registry: versioned eval sets (checked-in JSONL with ids, prompts, reference\n  answers, slices/tags). Never mutate in place; every run pins dataset & model versions.\n- Runner: fan-out jobs (prompt-by-prompt) to a worker pool (model APIs or self-hosted\n  endpoints); per-prompt retries with backoff; budget/rate-limit per run to control cost\n  (estimate token cost BEFORE launching, cap spend).\n- Metrics: EM/token-F1 (see the coding question), LLM-as-judge with rubric + human\n  spot-check; always report per-slice (domain, difficulty, length) plus aggregate.\n- Contamination: eval set versioning + canary prompts; never train on evals; track\n  overlap of prompts with public data.\n- Reporting: regression detection compares new vs baseline per metric + slice with\n  statistical significance (bootstrap CIs); dashboards + a JSON report artifact per run\n  so diffing is automatic.\n\nWhy this design matters here: evals are the backbone of model development; the\ninterviewer wants operational rigor (reproducibility, cost, contamination) not just\n'a script that calls the API'.",
  },
  {
    category: "DOMAIN",
    title: "RLHF / Constitutional AI at a high level",
    difficulty: "HARD",
    prompt:
      "Explain how RLHF works (reward model + PPO loop) at a level a smart engineer without RL background understands. Then contrast RLHF with RLAIF/Constitutional AI: what role does a separate reward model play in each, and what failure modes should you watch for?",
    testCases: [
      {
        input: "SFT model gives answer; RM scores it; policy updates",
        expected:
          "Correct ordering: SFT -> sampling pairs -> RM training -> PPO step with KL penalty vs SFT policy",
      },
    ],
    solution:
    "RLHF pipeline, stage by stage:\n1. SFT on demonstration data: gives a model that answers helpfully.\n2. Reward model: sample many (prompt, answer_a, answer_b) comparisons from humans\n   (preference pairs); train an RM to score answers (Bradley-Terry loss). RM is a\n   classifier head on the base model (or separate).\n3. RL (PPO): maximize expected reward under the policy, with a KL penalty toward the\n   SFT policy so it doesn't drift into reward-hacking (gaming the RM with verbose or\n   sycophantic outputs). Value model + per-token advantages, rollout of multiple answers\n   per prompt.\n\nConstitutional AI / RLAIF: replace human-preference labels with principled feedback from\nan LLM guided by a constitution (list of principles). The same LLM critiques and revises\nits own outputs (self-critique) -> preference data -> RM or DPO directly.\n\nKey contrasts:\n- RLHF needs a separate RM trained on human preferences (expensive, alignment to humans).\n- RLAIF uses the model itself as judge: cheaper, more scalable, risks self-preferencing\n  bias and principled but shallow critique.\n- Direct preference optimization (DPO) skips the RL loop: fits the policy to pairwise\n  preferences directly - simpler, no RM/PGO, popular for fine-tuning.\n\nFailure modes to name: reward hacking, reward model overfitting (verbose/sycophantic\nscores), distribution shift (policy vs SFT) countered by KL, and evaluation dilution\n('alignment tax' - helpfulness drop measured by other benchmarks).",
  },
];

// ---------------------------------------------------------------------------
// Tesla
// ---------------------------------------------------------------------------

const TESLA_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Sliding window maximum on a sensor stream",
    difficulty: "MEDIUM",
    prompt:
      "Given an array of measurements and a window size k, return the maximum of every contiguous window of size k (streaming friendly: O(n) total, O(k) memory).",
    testCases: [
      {
        input: "nums = [1,3,-1,-3,5,3,6,7], k = 3",
        expected: "[3,3,5,5,6,7]",
      },
      {
        input: "nums = [1], k = 1",
        expected: "[1]",
        explanation: "Single-element window edge case.",
      },
    ],
    solution:
    "Monotonic deque: maintain candidates decreasing by value; the front of the deque is the\nwindow max; evict expired indices from the front.\n\n    from collections import deque\n    def maxSlidingWindow(nums, k):\n        dq = deque()              # store indices, values decreasing\n        out = []\n        for i, v in enumerate(nums):\n            while dq and nums[dq[-1]] <= v: dq.pop()\n            dq.append(i)\n            if dq[0] <= i - k: dq.popleft()\n            if i >= k - 1: out.append(nums[dq[0]])\n        return out\n\nO(n) total, O(k) memory. The deque trick recurs across streaming/real-time problems:\nsensor fusion windows, throttling windows, rate limiters. Tesla framing: apply it to a\ncontinuous stream of battery/current readings where events must be cheap per sample.",
  },
  {
    category: "BEHAVIORAL",
    title: "Cross-discipline integration failure",
    difficulty: "MEDIUM",
    prompt:
      "\"Tell me about a time you worked with another discipline (hardware, firmware, design, ops) and integration broke at the seam.\" How did you debug across the boundary, and what systemic fix did you make?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: New sensor firmware shipped but software integration tests failed intermittently.\nT: Isolate whether it was hardware, firmware, or software - quickly and without blame.\nA:\n- Added instrumentation at the boundary (raw register dumps) so we could bisect where\n  the contract broke, instead of defending our own layer.\n- Found the firmware silently dropped samples on a scheduling edge case; the interface\n  spec didn't define behavior there.\n- Wrote the missing spec (guarantees + failure modes), added a conformance test both\n  sides run, and a canary check in CI.\nR: Intermittent failures stopped; the new boundary spec was reused by two other teams.\n\nAt Tesla, cross-discipline seams (HW/FW/SW, vehicle/datacenter) are everywhere:\nshow you debug at the boundary with evidence, not assertions of whose layer owns it.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "OTA update system for vehicles",
    difficulty: "HARD",
    prompt:
      "Design an over-the-air update system for a fleet of millions of vehicles: staged rollout, differential packages to save bandwidth, safety verification (car must be parked/safe), rollback, and fleet health telemetry.",
    testCases: [
      {
        input: "10M vehicles, avg update 1 GB but 80% of firmware unchanged vs previous",
        expected:
          "Differential/delta updates (apply patch to old version) cut bandwidth ~80%; staged rollout to small cohorts first",
      },
      {
        input: "Update fails on 0.5% of vehicles (wifi drop mid-install)",
        expected:
          "Atomic install with A/B partition + rollback on boot failure; never leave an unbootable car",
      },
    ],
    solution:
    "- Package pipeline: versioned software bundles; build differential patches (bsdiff-style)\n  per (old_version, new_version); sign all artifacts; content-addressed storage + CDN.\n- Fleet targeting: staged rollout by cohort (e.g., 1% -> 5% -> 10% -> 100% with safety\n  gates between stages: install success rate, post-update error spikes, support tickets).\n- Install client on vehicle: download backgrounded, only during scheduled/idle times;\n  verify signature; write to inactive partition (A/B); atomic switch + rollback if the\n  new partition fails to boot (bounded retry).\n- Telemetry: report install state machine (queued/downloaded/installed/rolled back),\n  version skew across fleet, error codes by region/hardware revision; alert on cohort.\n- Safety: gate installs by ignition state, battery level, and geofence (parked in\n  non-emergency zones); OTA for safety-critical firmware has extra validation walls.\n\nWhy Tesla-style: it is the canonical 'software-defined vehicle' design; they probe\nstaged rollout discipline and reversible failure more than networking minutiae.",
  },
  {
    category: "DOMAIN",
    title: "Autopilot/FSD vision pipeline",
    difficulty: "HARD",
    prompt:
      "Describe the perception pipeline for a self-driving system: sensors, calibration, NN inference, fusion, planning, and control. Where are the latency budgets and failure modes, and how do you validate safety?",
    testCases: [
      {
        input: "Perception latency budget: 30ms end-to-end sensor -> actuation",
        expected:
          "Split fast/slow paths: safety-critical perception/planning on dedicated compute with bounded worst-case timing; non-critical features in soft real-time",
      },
    ],
    solution:
    "Pipeline: cameras + radar/ultrasonic/LiDAR -> calibration & rectification -> NN\nperception (detection, segmentation, depth/occupancy, lane detection, tracking via\nassociation/Kalman) -> fusion (sensor + temporal) -> prediction of other agents ->\nplanning (behavioral + trajectory optimization) -> control (steering/throttle/brake) ->\nactuation, with driver-state monitoring and a safety monitor on top.\n\nLatency budgets: sensor ~10-30ms, inference few ms/network (batched across cameras on GPU),\nplanning ~10-20ms; end-to-end targets tens of ms. Worst-case (WCET) matters for\nsafety-critical control: bounded-time planning with fallback trajectories, watchdogs.\n\nFailure modes: sensor occlusion/degradation (failsafe to human assist), model\nuncertainty (calibrated confidence -> conservative behavior), rare objects (corner-case\ncoverage via simulation/scenario corpora), and sensor misalignment (self-calibration).\n\nValidation: scenario-based testing at scale (simulation replay, on-vehicle shadow mode,\nregression suites of hard scenarios), safety metrics (disengagements per mile, TTC),\nand staged feature rollout with geofenced regions - parallel to how you validate any\nhigh-stakes system: define the envelope, prove behavior inside it, monitor outside it.",
  },
];

// ---------------------------------------------------------------------------
// Databricks
// ---------------------------------------------------------------------------

const DATABRICKS_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Top-K words from a text stream (reduce-side)",
    difficulty: "MEDIUM",
    prompt:
      "Given a large stream of words (potentially on many machines), return the K most frequent words. Implement the single-machine core: a function that takes an iterator of words and returns the K most frequent, with complexity analysis. Mention the MapReduce/spark-shaped version for the distributed case.",
    testCases: [
      {
        input: "words = hello x3, world x2, data x1; K = 2",
        expected: "[(hello, 3), (world, 2)] order by count desc, ties by word",
      },
      {
        input: "K > distinct words",
        expected: "All distinct words, no crash (K clipped)",
      },
    ],
    solution:
    "Hash table (word -> count) + a min-heap of size K:\n\n    import heapq\n    def top_k(words, k):\n        counter = {}\n        for w in words:\n            counter[w] = counter.get(w, 0) + 1\n        return heapq.nlargest(k, counter.items(), key=lambda kv: (kv[1], -ord(kv[0][:1])))  # count desc, stable\n\nCounting is O(n); heap O(D log K) with K heap size.\n\nDistributed version (Spark/MapReduce):\n- Map: each partition emits (word, 1); combiner per partition aggregates locally;\n  shuffle groups by word; reduce sums counts; final top-K per partition of the\n  aggregated table (or a single sorted-merge step).\n- Watch out for skew: hot words need splitting by hash-prefix or approximate counting\n  (Count-Min sketch / HyperLogLog for cardinality).\n\nDatabricks angle: this is literally a Spark word-count with a top-K twist - be ready to\ntalk about shuffles, combiners, and when sketches beat exact counts.",
  },
  {
    category: "BEHAVIORAL",
    title: "Making a slow data pipeline 10x faster",
    difficulty: "MEDIUM",
    prompt:
      "\"Tell me about a time you made a slow, fragile data pipeline dramatically faster or more reliable.\" How did you know where the time went, what did you change, and how did you prove the improvement?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: An internal ETL job took 6 hours and failed ~weekly on new data shapes.\nT: Get it under 1 hour and make it self-healing.\nA:\n- Profiled with the Spark UI / plan inspect (not guessing): found a Cartesian join on a\n  small lookup table + ser/de overhead; the join was the 90% cost.\n- Changed to a broadcast join + schema validation at the boundary (fail fast, clear\n  error, auto-retry with backoff).\n- Added smoke tests on sampled data + record-level assertions; ran the new pipeline in\n  shadow mode for a week comparing outputs to the old one.\nR: Runtime 6h -> 35min; weeks without unplanned failures; the pattern (broadcast for\nsmall dimensions, assert at boundaries) was adopted by two other teams.\n\nDatabricks wants the data-specific mechanics: where the shuffle was, what the Spark UI\nshowed, how you validated output equivalence.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Distributed SQL query engine (Spark-shaped)",
    difficulty: "HARD",
    prompt:
      "Design a distributed query engine that runs SQL over a large lakehouse (parquet files on object storage): parse/plan, physical planning with partitioning, shuffle/join strategies, spilling, and fault tolerance. Discussion-level, with concrete tradeoffs.",
    testCases: [
      {
        input: "Join a 100 TB fact table with a 10 MB dimension table",
        expected:
          "Broadcast join: ship the 10 MB dim to every executor; no shuffle of the 100 TB fact - orders of magnitude cheaper than sort-merge",
      },
      {
        input: "Executor dies mid-job",
        expected: "Task-level retry + lineage recomputation (deterministic stages); intermediate results spilled to durable storage or recomputed",
      },
    ],
    solution:
    "Stages:\n- SQL parse -> untyped AST -> catalog resolution -> logical plan (with optimizer rules:\n  predicate pushdown, projection pruning, constant folding, join reorder).\n- Physical planning: choose scan strategy (Parquet columnar, predicate/column pruning,\n  vectorized readers), join types (broadcast for small, sort-merge or hash for big),\n  aggregation strategy (partial + merge), and repartitioning points.\n- Execution: stages partitioned across executors; shuffle writes intermediate sorted/\n  hashed partitions to local/durable storage then reads on the consumer side;\n  spilling to disk when memory is exhausted (sort spill, hash-aggregate spill).\n- Fault tolerance: deterministic stages -> recompute failed tasks from lineage; app-level\n  retry; checkpoints for long chains.\n\nKey tradeoffs: broadcast vs sort-merge join (memory vs shuffle cost); skew handling\n(salted keys, two-phase aggregate); predicate pushdown into Parquet stats; vectorized\nvs row-at-a-time execution; single-node vs multi-node planning decisions.\n\nDatabricks expects fluency in Spark/mostly-photon terms: exchange/partitioning,\nadaptive query execution (AQE) re-planning on runtime stats, and caching (Delta\ncache / IO cache for hot files).",
  },
  {
    category: "DOMAIN",
    title: "Spark lineage, lazy evaluation, shuffle cost",
    difficulty: "MEDIUM",
    prompt:
      "Explain Spark's lazy evaluation and lineage: why lazy, what a shuffle is and why it is the expensive operation, and when you would use broadcast joins vs bucketting/repartitioning. Include how Delta Lake improves on plain Parquet + Hive-style tables.",
    testCases: [
      {
        input: "df.filter(x).map(f).groupBy(...).count()",
        expected:
          "Nothing executes until an action runs; Spark builds a DAG and optimizes across stages (e.g., filter pushdown before map)",
      },
    ],
    solution:
    "Lazy evaluation: transformations build a logical/physical plan (DAG); nothing computes\nuntil an action (count, collect, write) triggers execution. This lets Spark fuse and\nreorder operations, prune partitions, and recover from failures via lineage (recompute\nonly lost partitions).\n\nShuffle: redistribution of data between executors - the expensive op. Why: network I/O,\nserialization, disk spill, and the all-to-all pattern. Minimize shuffles: push down\nfilters, use per-partition ops, combine/aggregate early, and choose join types well.\n\nBroadcast joins: when one side fits in (compressed) memory on each executor, ship it\nonce - no shuffle of the big side. Bucketting/repartitioning: pre-partition on the join\nkey so joins become local per bucket, at the cost of ETL time.\n\nDelta Lake adds to Parquet: ACID transactions (transaction log), time travel, schema\nenforcement/evolution, and DML (merge) - which is why the 'lakehouse' pattern replaced\n'Hive-style' pipelines: cheaper, consistent, and auditable.",
  },
];

// ---------------------------------------------------------------------------
// Generic pools (fallback for unknown companies + padding)
// ---------------------------------------------------------------------------

export const GENERIC_CODING: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Two sum",
    difficulty: "EASY",
    prompt:
      "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Assume exactly one solution and you may not use the same element twice. Optimize to O(n).",
    testCases: [
      { input: "nums = [2, 7, 11, 15], target = 9", expected: "[0, 1]" },
      { input: "nums = [3, 2, 4], target = 6", expected: "[1, 2]" },
      { input: "nums = [3, 3], target = 6", expected: "[0, 1]" },
    ],
    solution:
    "One pass with a hashmap (value -> index): for each nums[i] check whether target - nums[i]\nwas seen before; if so return both indices, else store.\n\n    def twoSum(nums, target):\n        seen = {}\n        for i, v in enumerate(nums):\n            if target - v in seen:\n                return [seen[target - v], i]\n            seen[v] = i\n        return []\n\nO(n) time, O(n) space. Follow-ups: sorted array -> two pointers O(1) space;\nhandle duplicates/negative values.\n(official LeetCode #1)",
  },
  {
    category: "CODING",
    title: "Valid parentheses",
    difficulty: "EASY",
    prompt:
      "Given a string s containing just '(', ')', '{', '}', '[', ']', determine if the input string is valid: brackets must close correctly and in order. Optimize to O(n) time and space.",
    testCases: [
      { input: "s = \"()[]{}\"", expected: "true" },
      { input: "s = \"([)]\"", expected: "false", explanation: "Wrong nesting: ')' closes '(' inside '['." },
      { input: "s = \"(]\"", expected: "false" },
    ],
    solution:
    "Stack-based matching:\n\n    def isValid(s):\n        pairs = {')': '(', ']': '[', '}': '{'}\n        stack = []\n        for ch in s:\n            if ch in pairs:\n                if not stack or stack.pop() != pairs[ch]:\n                    return False\n            else:\n                stack.append(ch)\n        return not stack\n\nO(n) time, O(n) worst-case space. The stack is the canonical approach; iterative\nreplace-based solutions are unacceptable at scale.\n(official LeetCode #20)",
  },
];

export const GENERIC_BEHAVIORAL: GeneratedQuestion[] = [
  {
    category: "BEHAVIORAL",
    title: "A disagreement with a teammate",
    difficulty: "MEDIUM",
    prompt:
      "Tell me about a time you disagreed with a teammate or stakeholder about the right approach. What was the disagreement, what did you do, and how did it end?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: Two engineers disagree about architecture for a feature; work stalls.\nT: Reach a good decision fast without damaging the relationship.\nA: Listened restate their view first; separated facts (benchmarks, requirements) from\nopinion; proposed a small experiment with a decision deadline; used 'disagree and commit'\nif blocked.\nR: Shipped the feature; the process (evidence > ego, deadline-based decision) got reused.\n\nAvoid: blaming solely the other person, vague resolution ('we talked it out').",
  },
  {
    category: "BEHAVIORAL",
    title: "A project you are proud of",
    difficulty: "MEDIUM",
    prompt:
      "Describe a project you are most proud of. What was your specific role, what did you build, what hard technical problem did you solve, and what was the measurable impact?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: A dead project or a hard problem nobody else wanted.\nT: A clear, measurable goal (e.g., cut cost 30%, ship to N users).\nA: Your specific contributions, the one hardest technical decision and why (be\nopinionated), the tradeoff you rejected and why.\nR: Quantified outcome + what it unlocked for the team afterward.\n\nPick ONE project and go deep: interviewers follow up on the details, so know your\nnumbers and the exact technical architecture.",
  },
  {
    category: "BEHAVIORAL",
    title: "A failure and what you learned",
    difficulty: "MEDIUM",
    prompt:
      "Tell me about a time you failed or made a significant mistake. What happened, how did you own it, what did you do about it, and what did you change so it would not recur?",
    testCases: [],
    solution:
    "STAR skeleton:\n\nS: A real mistake with real consequences (outage, missed deadline, broken build).\nT: Fix the blast radius and then fix the process.\nA: Acknowledged fast, communicated honestly without over-apologizing; fixed forward\n(systemic fix, not just a patch: new test, guardrail, better review); shared the\npostmortem.\nR: The concrete change that prevented recurrence + how trust was rebuilt.\n\nBest answers pick a genuine failure with cost, not a soft pseudo-failure, and show\nsystems-thinking follow-through.",
  },
];

export const GENERIC_SYSTEM_DESIGN: GeneratedQuestion[] = [
  {
    category: "SYSTEM_DESIGN",
    title: "Design a URL shortener",
    difficulty: "MEDIUM",
    prompt:
      "Design a URL shortening service: shorten long URLs, redirect short URLs, ~100M URLs/month, 10k QPS reads. Cover key generation, storage, caching, redirect semantics, and scale-out.",
    testCases: [
      {
        input: "100M inserts/month -> enough key space?",
        expected: "7 characters of base62 (62^7 ~ 3.5e12) is ample",
      },
      {
        input: "10k read QPS",
        expected: "Redis cache-first with >=95% hit rate; DB behind cache",
      },
    ],
    solution:
    "API: POST /shorten {url} -> {code}; GET /:code -> 301/308 redirect.\n\nStorage: DB (code PK, long_url, owner, created_at) + Redis cache. Key generation: base62\nencode of a random/counter value (7 chars), check-and-retry on collision. Reads: cache\nfirst; on miss, DB then cache with single-flight to avoid thundering herd. 301 redirect\n(cacheable) vs 302/308 (analytics-aware).\n\nScale: stateless web tier, read replicas, Redis cluster; shard by code. Add analytics\nlog (queue -> counters) and per-user rate limits on creation. Tradeoffs: vanity URLs\n(custom codes, collision checks), expiry, abuse detection.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Design a rate limiter",
    difficulty: "MEDIUM",
    prompt:
      "Design a rate limiter for a public API (e.g., 100 requests/minute per API key). Cover algorithms (token bucket, sliding window), distributed correctness, storage, and what the client sees (HTTP 429 + Retry-After).",
    testCases: [
      {
        input: "Client bursts 200 requests in one minute, limit 100/min",
        expected: "100 succeed, 100 get HTTP 429 with Retry-After; burst behavior depends on algorithm chosen",
      },
      {
        input: "Two API gateways share the same key",
        expected: "Rate limit state must be shared (Redis) or partitioned by key hash to be correct across instances",
      },
    ],
    solution:
    "Algorithms:\n- Token bucket (burst-friendly): fixed capacity + refill rate; simple, allows 2x bursts.\n- Fixed window: cheap but allows 2x spikes at boundaries.\n- Sliding window log/counter: accurate; log more memory; counter (two buckets) approximate.\nPick token bucket for APIs: simple, tunable burst, standard.\n\nDistributed: shared store (Redis) with atomic INCR/EXPIRE or Lua scripts for\ncheck-and-decrement; consistency tradeoff (approximate across regions is acceptable).\nFallback when Redis is down: local per-instance limiter (fail-open/fail-closed decision).\n\nClient contract: 429 + Retry-After header + rate-limit headers (X-RateLimit-Remaining,\nLimit, Reset) so clients can self-throttle. Add per-key + global (IP) limits and quota\ntiers by plan.",
  },
];

export const GENERIC_DOMAIN: GeneratedQuestion[] = [
  {
    category: "DOMAIN",
    title: "Process vs thread, and why it matters",
    difficulty: "MEDIUM",
    prompt:
      "Explain the difference between a process and a thread: memory model, scheduling, isolation, and communication. When would you pick many processes vs many threads, and what does a language runtime (e.g., Node, Go) change about that decision?",
    testCases: [
      {
        input: "A crash in one worker must not take down the service",
        expected: "Multiple processes: stronger isolation (separate address spaces); threads share the crash-prone address space",
      },
    ],
    solution:
    "Process: independent address space, own file descriptors, scheduled by OS; crash-isolated;\nIPC via pipes/sockets/shared memory. Thread: lightest scheduling unit within a process,\nshares address space (cheap communication, but races and one segfault kills the process).\n\nChoose processes for isolation, robustness, and multi-tenant workloads; threads for\nlatency-sensitive shared-memory work (and when creation cost matters).\n\nRuntimes complicate the answer: Node = single-threaded event loop per process (async I/O,\nCPU work must be offloaded to worker threads/processes); Go = goroutines (cheap\ncooperative scheduling on OS threads, runtime handles M:N); Rust/C++ = explicit threads;\nErlang = processes with message passing. Being able to contrast runtimes shows depth.\n\nFollow-ups: context switch cost, c10k, green threads vs OS threads, async/await vs\nthread-per-request.",
  },
  {
    category: "DOMAIN",
    title: "What happens when you type a URL and press Enter",
    difficulty: "MEDIUM",
    prompt:
      "Walk through everything that happens when you type https://example.com into a browser and press Enter, down to the packets. Cover DNS, TCP/TLS, HTTP, rendering, and where caches sit.",
    testCases: [
      {
        input: "First visit vs repeat visit to the same site",
        expected:
          "Repeat visit skips much of DNS (cached) and reuses TLS/HTTP connections (keep-alive, HTTP/2 multiplexing)",
      },
    ],
    solution:
    "1. URL parse: scheme, host, path, port (default 443). HSTS check (HTTPS-only).\n2. DNS: browser cache -> OS cache -> local resolver -> recursive -> authoritative;\n   returns IP (A/AAAA); HTTP/3 could skip to QUIC.\n3. TCP: socket connect, 3-way handshake (SYN/SYN-ACK/ACK); for IPv6 or HTTP/3, QUIC does\n   handshake+encryption in fewer round trips (0-RTT later).\n4. TLS 1.3: ClientHello -> ServerHello + cert; verify chain, exchange keys (ECDHE),\n   derive session keys; resumed sessions skip most of this (session resumption tickets).\n5. HTTP request: GET / HTTP/1.1 or HTTP/2 (multiplexed over the same TCP); headers,\n   cookies; server (proxies/LB/CDN) returns response; caches: CDN edge -> browser cache\n   (Cache-Control/ETag decide revalidation).\n6. Render: parse HTML -> DOM, CSS -> CSSOM; resolve JS (scripts block unless async);\n   layout, paint, composite; lazy-load images.\n\nInterviewers listen for: where the round trips are, what's cached at each layer,\nand how protocols reduce trips (TLS 1.3, HTTP/3, preconnect).",
  },
];

// ---------------------------------------------------------------------------
// Anduril
// ---------------------------------------------------------------------------

// Public candidate reports vary by role, but repeatedly point toward mission
// fit, project deep dives, coding plus design, clearance eligibility, and
// real-time/edge systems. These are practice prompts, not claims that Anduril
// asks every candidate the exact questions below.
const ANDURIL_CURATED: GeneratedQuestion[] = [
  {
    category: "CODING",
    title: "Reconstruct an out-of-order sensor track",
    difficulty: "MEDIUM",
    prompt:
      "An edge vehicle receives observations as tuples `(asset_id, timestamp_ms, x, y, sequence)`. Packets can arrive out of order and a retransmission can repeat a timestamp. Implement `reconstruct(events) -> dict[str, list[tuple[int, float, float]]]`: group observations by asset, keep the observation with the greatest sequence for each timestamp, and return each track sorted by timestamp. Explain how your approach behaves when a radio link delivers a burst of delayed packets.",
    testCases: [
      {
        input:
          '[("A", 300, 3.0, 3.0, 1), ("A", 100, 1.0, 1.0, 1), ("A", 100, 9.0, 9.0, 2)]',
        expected: '{"A": [[100, 9.0, 9.0], [300, 3.0, 3.0]]}',
        explanation: "The later sequence replaces the duplicate timestamp.",
      },
      {
        input: '[("B", 20, 2.0, 4.0, 1), ("A", 10, 1.0, 2.0, 1)]',
        expected: '{"A": [[10, 1.0, 2.0]], "B": [[20, 2.0, 4.0]]}',
        explanation: "Assets are independent and each output track is time ordered.",
      },
    ],
    solution:
      "Maintain a nested map `tracks[asset_id][timestamp_ms] = (sequence, x, y)`. For each event, replace the stored value only when its sequence is greater. Finally, sort each asset's map items by timestamp and remove the sequence field from the returned tuples. Processing is O(n + sum(k_i log k_i)) for n events and k_i distinct timestamps per asset; storage is O(n). In a real system, the same state would be bounded by a retention window and checkpointed so a reconnect cannot grow memory without limit.",
  },
  {
    category: "CODING",
    title: "Schedule non-expired mission messages",
    difficulty: "MEDIUM",
    prompt:
      "A disconnected vehicle queues outbound messages. Each message is `(id, priority, expires_at_ms, sequence)`. Implement `drain_queue(messages, now_ms, capacity) -> list[str]` that drops expired messages and returns at most `capacity` IDs in descending priority order, breaking ties by earliest expiry and then lowest sequence. State the invariant that makes the result deterministic across reconnects.",
    testCases: [
      {
        input:
          'messages=[("map", 1, 500, 2), ("abort", 10, 900, 3), ("stale", 99, 100, 1)], now_ms=200, capacity=2',
        expected: '["abort", "map"]',
        explanation: "The stale message is expired before priority ordering.",
      },
      {
        input:
          'messages=[("a", 2, 400, 5), ("b", 2, 300, 4), ("c", 2, 300, 2)], now_ms=100, capacity=3',
        expected: '["c", "b", "a"]',
        explanation: "Tie-breaking is expiry, then sequence.",
      },
    ],
    solution:
      "Filter with `expires_at_ms > now_ms`, then sort by `(-priority, expires_at_ms, sequence)` and take the first `capacity` entries. In production, retain the same ordering key in the durable queue and make message IDs idempotent, so replay after an intermittent connection cannot reorder or duplicate a safety-critical command. Complexity is O(n log n), or O(n log capacity) with a bounded heap.",
  },
  {
    category: "BEHAVIORAL",
    title: "Choosing a mission tradeoff with incomplete information",
    difficulty: "MEDIUM",
    prompt:
      "Tell me about a time you had to choose between shipping a useful capability quickly and waiting for a more complete or safer solution. Explain the mission or customer impact, what evidence you gathered, what risk you accepted, and how you created a rollback or follow-up plan.",
    testCases: [],
    solution:
      "Use STAR, but make the tradeoff concrete: describe the user or mission outcome, name the unsafe shortcut you rejected, show the smallest measurable version you shipped, and explain the guardrails (feature flag, canary, simulation, monitoring, or rollback). A strong answer does not claim that speed always wins; it shows how you made risk visible and kept the decision reversible.",
  },
  {
    category: "BEHAVIORAL",
    title: "Working through a hardware-software disagreement",
    difficulty: "MEDIUM",
    prompt:
      "Describe a disagreement with a hardware, firmware, test, or operations partner about a system behavior or deadline. How did you turn the disagreement into an experiment or shared requirement, and what changed because of the result?",
    testCases: [],
    solution:
      "Cover the interface contract, not just the interpersonal conflict. State the competing constraints, write down the measurable acceptance criteria, run a small test or collect field data, and make the decision explicit. End with how you preserved the relationship and changed the process so the same integration issue would be found earlier.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Design disconnected-first vehicle telemetry and command",
    difficulty: "HARD",
    prompt:
      "Design a telemetry and command platform for a fleet of autonomous vehicles operating over unreliable links. Vehicles must continue a safe local mission when disconnected, upload observations when bandwidth returns, and receive prioritized commands without replaying a command twice. Cover the edge agent, event ordering, durable queues, security, observability, and operator-facing consistency.",
    testCases: [
      {
        input: "A vehicle is offline for 30 minutes and reconnects with 200,000 observations.",
        expected: "Bounded local retention, resumable upload, backpressure, batching, and an explicit loss policy.",
        explanation: "The design must survive reconnect bursts without blocking control traffic.",
      },
      {
        input: "The same high-priority command is delivered three times after retries.",
        expected: "Signed idempotent command IDs, durable deduplication, expiry, and an audited acknowledgement state.",
        explanation: "Retries must not turn at-least-once delivery into repeated action.",
      },
    ],
    solution:
      "Separate safety-critical local control from best-effort cloud synchronization. The edge agent writes telemetry to a bounded append-only queue with sequence numbers, compresses and uploads resumable ranges, and gives command traffic a reserved link budget. Commands carry an expiry, monotonic ID, signature, and idempotency key; the vehicle persists the last accepted IDs before acknowledging. The cloud stores an immutable event log plus materialized fleet views, while operators see freshness and connectivity explicitly instead of stale data as current truth. Discuss key rotation, offline authorization limits, clock drift, retention, backpressure, and what happens when storage or the radio is full.",
  },
  {
    category: "SYSTEM_DESIGN",
    title: "Design safe OTA updates for edge systems",
    difficulty: "HARD",
    prompt:
      "Design an OTA update service for software deployed to intermittently connected edge systems. Updates must be staged by fleet, verifiable before activation, reversible after a bad health signal, and safe when a device loses power during installation. Cover artifact distribution, compatibility, rollout policy, health checks, rollback, and auditability.",
    testCases: [
      {
        input: "Five percent of a canary fleet reports increased CPU and missed deadlines.",
        expected: "Pause rollout, compare against baseline, quarantine the version, and roll back or hold safely.",
        explanation: "A rollout must react to fleet health instead of only installation success.",
      },
      {
        input: "Power fails halfway through an update.",
        expected: "A/B or transactional partitions, signed artifacts, boot-success markers, and automatic fallback.",
        explanation: "The device must remain recoverable without a live link.",
      },
    ],
    solution:
      "Use signed, content-addressed artifacts with a manifest containing version, compatibility constraints, and rollback metadata. Devices download in the background with resume and verify the signature/hash before writing an inactive A/B partition. A bootloader activates only after an atomic slot switch; the new process must report health within a deadline or the bootloader reverts. The control plane rolls out by cohorts, pauses on statistically significant regressions, and keeps an immutable audit trail of target, approval, device acknowledgement, health, and rollback state. Include staged config migrations and backwards-compatible wire protocols so mixed versions can coexist.",
  },
  {
    category: "DOMAIN",
    title: "Keeping a real-time C++ service within a p99 budget",
    difficulty: "HARD",
    prompt:
      "A C++ edge service meets its average latency target but misses its p99 deadline during sensor bursts. Explain how you would investigate and fix it. Cover allocations, lock contention, queueing, scheduler behavior, priority inversion, logging, and how you would prove the fix did not reduce correctness.",
    testCases: [
      {
        input: "Average latency 4 ms, p99 latency 80 ms, target p99 <= 20 ms.",
        expected: "Measure the tail with tracing and load replay; identify queue/lock/allocation causes instead of optimizing the average.",
        explanation: "Tail latency is usually a contention or queueing problem.",
      },
    ],
    solution:
      "Start with timestamped spans around acquisition, decode, fusion, decision, and output, and replay a burst workload with the same scheduling and message sizes. Look for unbounded queues, allocator pauses, mutex contention, priority inversion, page faults, synchronous logging, and CPU migration. Typical fixes include bounded queues with an explicit drop/degrade policy, preallocated object pools, single-writer or lock-free handoff where justified, priority inheritance, batching outside the deadline-critical path, and rate-limited logging. Compare p50/p95/p99/p999, deadline-miss count, CPU/cache metrics, and domain-level correctness before and after.",
  },
  {
    category: "DOMAIN",
    title: "Sensor fusion when clocks and packets disagree",
    difficulty: "HARD",
    prompt:
      "Two sensors report the same object using different clocks, coordinate frames, and confidence values. Describe a robust edge-side fusion pipeline that handles clock skew, late packets, duplicate observations, coordinate transforms, and conflicting tracks. Include the failure modes you would surface to an operator.",
    testCases: [
      {
        input: "Sensor A reports a high-confidence position 100 ms late; sensor B reports a lower-confidence position at current time.",
        expected: "Align timestamps, propagate or smooth state with uncertainty, and avoid blindly replacing the current estimate.",
        explanation: "Freshness and confidence must be combined, not compared independently.",
      },
    ],
    solution:
      "Normalize every observation into a monotonic event-time domain with an estimated clock offset and uncertainty. Validate frame/calibration metadata, transform into a common frame, deduplicate by sensor sequence, and use a bounded lateness window. Maintain a state estimate plus covariance (for example a Kalman-family filter where appropriate), propagate the state to the query time, and fuse measurements weighted by uncertainty rather than a single confidence scalar. Late data can be applied as a bounded smoothing correction or discarded with a metric when the window closes. Surface clock drift, calibration age, innovation/residual spikes, track fragmentation, and stale-data age so operators know when the estimate is degraded.",
  },
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const companyProfiles: CompanyProfile[] = [
  { name: "NVIDIA", domains: ["CUDA", "GPU architecture", "parallel computing", "C++", "HPC"], focusAreas: ["CUDA memory model (global/shared/registers), coalescing", "Kernel optimization: occupancy, block/grid sizing, warp divergence", "Parallel primitives: reductions, scans, matrix multiply tiling", "GPU architecture: SMs, warps, tensor cores, memory bandwidth", "NVIDIA stack: cuBLAS, cuDNN, NCCL"], curated: NVIDIA_CURATED },
  { name: "OpenAI", domains: ["Transformers / LLM internals", "distributed training", "PyTorch", "inference optimization", "RLHF / alignment"], focusAreas: ["Transformer internals: attention, KV cache, positional embeddings", "Distributed training: data/tensor/pipeline parallel, ZeRO, gradient accumulation", "Inference: continuous batching, quantization, speculation", "Alignment: RLHF, DPO, evals and evaluation datasets", "Rigorous evals and regression detection"], curated: OPENAI_CURATED },
  { name: "Google", domains: ["distributed systems", "algorithms & data structures", "Go / C++", "infrastructure at scale", "search & ranking"], focusAreas: ["Distributed systems: consensus, replication, consistency", "Large-scale search: inverted indexes, ranking (BM25), serving", "Infrastructure: load balancing, sharding, caching, capacity planning", "Algorithms: the classic Google-style DSA questions", "Data pipelines: MapReduce-style processing"], curated: GOOGLE_CURATED },
  { name: "Meta", domains: ["social graph scale", "React / UI performance", "C++ / Hack", "caching & CDNs", "data infrastructure"], focusAreas: ["Social graph problems: friends, connections, feeds at 1B+ scale", "News Feed-style ranking and delivery (fanout/pull)", "React rendering performance", "Caching, CDNs, and edge serving", "Data infra: Hive/Scuba-style analytics"], curated: META_CURATED },
  { name: "Amazon", domains: ["AWS", "large-scale web services", "distributed systems", "checkout & retail scale", "leadership principles"], focusAreas: ["Leadership Principles: ownership, invent & simplify, bias for action", "Distributed storage: S3/Dynamo-style consistency and durability", "E-commerce systems: catalog, recommendations, checkout", "Bare-metal scale + reliability engineering", "Caching and read-heavy workloads"], curated: AMAZON_CURATED },
  { name: "Apple", domains: ["Swift / Objective-C", "memory management (ARC)", "performance & energy", "privacy-first architecture", "client-server sync"], focusAreas: ["Swift/Objective-C and ARC memory management", "Client-server sync and offline-first (iCloud-style)", "Performance: frame rate, energy, memory", "Privacy: on-device processing, data minimization", "Craft and attention to detail in UX"], curated: APPLE_CURATED },
  { name: "Microsoft", domains: ["C# / .NET", "Azure cloud", "large-scale services", "Windows internals", "accessibility"], focusAreas: [".NET runtime: GC, async, memory model", "Azure-scale services: region pairs, availability, event ingestion", "Large-scale data platforms and telemetry", "Systems internals and performance", "Customer empathy and growth mindset behavioral style"], curated: MICROSOFT_CURATED },
  { name: "Anthropic", domains: ["LLM reasoning & evaluation", "safety & alignment", "RLHF / RL", "distributed training", "interpretability"], focusAreas: ["Alignment: RLHF, Constitutional AI, RLAIF, DPO", "Evaluation: evals platforms, EM/F1, LLM-as-judge, contamination", "LLM internals: attention, KV cache, tokenization", "Distributed training: ZeRO, pipeline/tensor parallelism", "Honesty and update-on-evidence behavioral style"], curated: ANTHROPIC_CURATED },
  { name: "Tesla", domains: ["embedded C/C++", "real-time systems", "computer vision / sensor fusion", "Autopilot & FSD", "battery & powertrain"], focusAreas: ["Autopilot/FSD perception: cameras, NNs, fusion, planning, latency budgets", "Embedded and real-time firmware: WCET, deterministic behavior", "OTA update and staged rollout design", "Cross-discipline integration (HW/FW/SW)", "Safety-critical validation and simulation"], curated: TESLA_CURATED },
  { name: "Databricks", domains: ["Apache Spark", "data lakehouse", "distributed query engines", "Scala / Java", "Delta Lake"], focusAreas: ["Spark: lazy evaluation, lineage, shuffles, partitioning", "Query engines: planning, execution, broadcast vs sort-merge joins", "Lakehouse: Delta Lake ACID, schema evolution, time travel", "Distributed computing patterns and fault tolerance", "Data engineering performance and data quality"], curated: DATABRICKS_CURATED },
  { name: "Anduril", domains: ["defense technology", "autonomous systems", "real-time C++", "edge computing", "sensor fusion", "reliable robotics"], focusAreas: ["Mission-driven behavioral answers and decision-making under uncertainty", "Public interview reports vary by role: recruiter mission/clearance discussion, project deep dive, coding plus design, and occasional SQL/data exercises", "Disconnected-first command, telemetry, and fleet synchronization", "OTA updates, rollback, observability, and safe operation at the edge", "Real-time performance, sensor fusion, time synchronization, and bounded resources"], curated: ANDURIL_CURATED },
];

/** Names used for the "quick add" suggestions in the add-company form. */
export const KNOWN_COMPANY_NAMES = companyProfiles.map((p) => p.name);

/** Find the knowledge-base profile for a company name (fuzzy: substring match). */
export function profileFor(name: string): CompanyProfile | undefined {
  const n = name.trim().toLowerCase();
  return companyProfiles.find(
    (p) =>
      p.name.toLowerCase() === n ||
      n.includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(n),
  );
}
