---
title: Building an LLM Inference Engine from Scratch
description: what it takes to actually serve model weights in production
date: 2026-11-20
keepCase: true
glossary:
  TTFT: "time to first token: how long from a request arriving until its first output token comes back."
  TPOT: "time per output token: the average gap between a request's output tokens, after the first one."
  ITL: "inter-token latency: the time between two consecutive tokens of the same request."
  E2E: "end-to-end latency: the total time from a request arriving to its last token."
  TPS: "tokens per second: output tokens generated per second, across all requests."
  KV cache: "the attention keys and values of tokens already processed, stored so they don't have to be recomputed every step."
  prefill: "the first pass over a prompt: every prompt token is processed at once, filling the KV cache."
  decode: "generating new tokens, one per request per step, reading everything earlier from the KV cache."
  HBM: "the GPU's main memory (VRAM): large, but far slower than the on-chip memory kernels compute from."
---
<video src="/llm_inference_engine/engine-hero.mp4" poster="/llm_inference_engine/engine-hero.webp"></video>

**TL;DR:** Running an LLM is a simple loop. Serving it up to many users, making it fast, and fully utilizing the GPU is a systems problem. Through 10 optimizations, I'll show how to build an inference engine to serve up Qwen3-0.6B, getting close to the open-source engines behind most inference APIs (vLLM & SGLang).

There's a surprising amount of machinery behind every request you send to an inference API. Each request is added to a waiting queue amongst thousands of other requests. It has to be sliced and batched to run on GPU. The computation needs to compete with hundreds of other requests for very constrained GPU memory. And all this needs to be handled fast enough so you don't perceive a huge delay in your chats.  

Most of these core concepts work on a single GPU. We'll iteratively write the code and work through the following optimizations
1) [Static Batching](#static-batching)
2) [KV Caching](#kv-caching)
3) [Continuous Batching](#continuous-batching)
4) [Chunked Prefill](#chunked-prefill) (+ policy)
5) [Flash Attention](#flash-attention) (+ [Ragged Tensors](#ragged-tensors))
6) [Paged KV Cache](#paged-kv-cache)
7) [Prefix Caching](#prefix-caching)
8) [CUDA Graphs](#cuda-graphs)
9) [Overlap Scheduling](#overlap-scheduling)
10) [torch.compile](#torchcompile)

## Results & Benchmarking

<div data-chart-gallery>
<img src="/llm_inference_engine/charts/ttft.webp" alt="Serve: TTFT" width="1128" height="636" data-no-caption>
<img src="/llm_inference_engine/charts/tpot.webp" alt="Serve: TPOT" width="1128" height="636" data-no-caption>
<img src="/llm_inference_engine/charts/itl.webp" alt="Serve: ITL" width="1128" height="636" data-no-caption>
<img src="/llm_inference_engine/charts/e2e.webp" alt="Serve: E2E" width="1128" height="636" data-no-caption>
<img src="/llm_inference_engine/charts/tps.webp" alt="Max throughput" width="1128" height="636" data-no-caption>
<img src="/llm_inference_engine/charts/pfx.webp" alt="Shared prefix: TTFT" width="1128" height="636" data-no-caption>
<img src="/llm_inference_engine/charts/dec.webp" alt="Latency: decode step" width="1128" height="636" data-no-caption>
<img src="/llm_inference_engine/charts/bat.webp" alt="Latency: whole batch" width="1128" height="636" data-no-caption>
</div>

We're benchmarking a Qwen3-0.6B in bf16 on an RTX 3060 12GB. We check for correctness against HuggingFace's implementation. 

We collect the following metrics:
- **TTFT** - time to first token (how long it takes for the first generation)
- **TPOT** - time per output token 
- **ITL** - inter-token latency (the time between tokens)
- **E2E** - the whole generation, end to end

We record the p50/p90/p99 of it, because different optimizations will affect different percentiles. 

To find this, we run 3 benchmarks:
- **serve**, which simulates users arriving at 1.8 req/s (Poisson). **This is the main benchmark**, as it simulates real-world behavior and tests the engine under uneven arrivals
- **latency**, which times how long a step of the engine takes. This is used to find any kernel / engine-side improvements
- **throughput**, which sends a bunch of requests all at once and sees the TPS that the engine achieves.

We mainly focus on the **serve** benchmark, as it is the most relevant to the real world. 

We always do a warmup before benchmarking, for all of the JIT code to compile, kernels to be selected, etc.

Each serve run sends 100 requests with random-token prompts: 512 input / 128 output tokens, with each length drawn uniformly within ±80%. Generation stops at EOS like a real server would, so outputs average ~90 tokens. Every number is from a single run, except SGLang's max TPS (mean of 3). vLLM 0.34.0 and SGLang 0.5.23 run with their defaults in bf16 (prefix caching off for the main table, on for the shared-prefix one), with SGLang capturing decode CUDA graphs up to batch 128. Our engine is benchmarked in-process while vLLM and SGLang go through their HTTP servers, which gives us a small edge on every latency number.[^12]

Full results tables are in the [appendix](#appendix-full-results).

All code is on [GitHub](https://github.com/GuyOnWifi/scheduler)
## Summary of Qwen

![Qwen3 architecture: 28 stacked decoder layers](/llm_inference_engine/scheduler-01.webp)

Qwen is very similar to the original [attention paper](https://arxiv.org/abs/1706.03762) with the following changes:
- [RoPE](https://arxiv.org/abs/2104.09864) ([good resource](https://huggingface.co/blog/designing-positional-encoding)): A way of introducing "position" into the attention mechanism by rotating vectors
- [Grouped-Query Attention](https://arxiv.org/abs/2305.13245): Every head of attention gets a query matrix, but the key and value matrix are shared between some heads. 
- RMSNorm (instead of LayerNorm): A more computationally efficient normalization scheme
- QKNorm: Apply RMS Norm to the key and query vectors, before RoPE and their dot product
- SwiGLU: Train a "gate matrix", and multiply the output by that gate matrix. Uses the [SiLU activation function](https://docs.pytorch.org/docs/2.15/_images/SiLU.png) for the gate matrix. Allows it to selectively scale individual neurons. 

You can check out the PyTorch implementation of Qwen3 at commit [0d4e790](https://github.com/GuyOnWifi/scheduler/commit/0d4e790ca9f59124dbc72e253203135cddd76b68)

We will wrap our model with the following entry point:
```python 
def forward(self, input_ids: torch.Tensor, meta: BatchMeta, kv_cache) -> torch.Tensor:
    pass
```

where input_ids is the token ids, and `BatchMeta` stores information about our current batch.

```python 
@dataclass
class BatchMeta:
    pass
```

Our scheduler will have the following contract:
```py
class Engine(Protocol):
    def add_request(self, request: Request) -> None: ...

    def step(self) -> list[TokenEvent]:
        ...

    def has_unfinished(self) -> bool: ...
```

## Static Batching 

Generating tokens is very memory intensive. The GPU has to stream the entire model's weights from memory for every decode step, which only generates one token per sequence. For example, Qwen3-0.6B takes roughly 1.2 GB (bf16) in model weights. Assuming a memory bandwidth of 360 GB/s (on my 3060), 

$$
\text{TPS} = \frac{\text{Memory Bandwidth}}{\text{Model Weight Size}} = \frac{360}{1.2}=300\;\text{tok/s}
$$

<div data-roofline></div>

But that's only for one sequence! Small requests don't saturate our compute cores, and are bottlenecked by our memory bandwidth. We can usually increase our batch size (which reuses each weight read across the whole batch) and increase our total tok/s roughly proportionally[^1] (to a point, until compute dominates).[^3]

So the first strategy in our serving engine is to:
1) Maintain a queue of requests
2) Drain the queue, with some max amount 
3) Generate tokens with (hopefully) more than 1 sequence at once until they're all done
4) Output / stream the tokens

Code: [rung-01-naive](https://github.com/GuyOnWifi/scheduler/tree/rung-01-naive) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-00-qwen...rung-01-naive))

## KV Caching 

Attention involves 3 vectors calculated from each embedding: key, query, value. Each one is calculated using a matmul, and is dependent on the output of the previous layer. This makes recomputing each one particularly expensive.

The K and V of previous tokens don't change when we add a new token! So we can cache them. And since attention is **causal** (backward looking), we actually don't need to store queries, since old queries won't be reused. 

![KV cache: reuse past keys, values](/llm_inference_engine/scheduler-03.webp)

So with KV caching, we can split up our engine into two phases: prefill (prompt processing), where we attend to every token on every layer, storing the KV cache, and decode, where we use the KV cache to calculate the next token and grow the cache by 1 token. 

We add positions to the BatchMeta
```diff
 @dataclass
 class BatchMeta:
     lengths: torch.Tensor
+    positions: torch.Tensor
```

We store our KV cache as one big PyTorch tensor:
```diff
+@dataclass
+class KVCache:
+    k: torch.Tensor  # (layers, batch, num_kv_heads, max_len, head_dim)
+    v: torch.Tensor
+
+    @classmethod
+    def alloc(
+        cls, layers, batch, num_kv_heads, max_len, head_dim, device, dtype
+    ) -> Self:
+        return cls(
+            torch.zeros(
+                (layers, batch, num_kv_heads, max_len, head_dim),
+                device=device,
+                dtype=dtype,
+            ),
+            torch.zeros(
+                (layers, batch, num_kv_heads, max_len, head_dim),
+                device=device,
+                dtype=dtype,
+            ),
+        )
```

And within the attention mechanism, we write to the KV cache as well as perform attention on it. 
```diff
-v_expanded = torch.repeat_interleave(v_head, self.groups, dim=1)
-k_expanded = torch.repeat_interleave(k_rope, self.groups, dim=1)
+(k_cache, v_cache) = kv_cache
+rows = torch.arange(nb, device=x.device)[:, None]  # [B, 1]
+k_cache[rows, :, positions] = k_rope.transpose(
+    1, 2
+)  # [B, T, kv_heads, head_dim]
+v_cache[rows, :, positions] = v_head.transpose(
+    1, 2
+)  # [B, T, kv_heads, head_dim]
+
+# mask is (num_batch, num_toks, max_toks), True = blocked: causal by position
+max_toks = int(positions.max()) + 1
+mask = torch.arange(max_toks, device=x.device) > positions[:, :, None]
+k_all = k_cache[:, :, :max_toks, :]  # (nb, kvh, max_toks, hd)
+v_all = v_cache[:, :, :max_toks, :]
+
+v_expanded = torch.repeat_interleave(v_all, self.groups, dim=1)
+k_expanded = torch.repeat_interleave(k_all, self.groups, dim=1)

 att = q_rope @ k_expanded.transpose(2, 3)
-att_masked = att.masked_fill(mask, -torch.inf)
+att_masked = att.masked_fill(mask[:, None], -torch.inf)  # mask over all heads
 att_weights = torch.softmax(
     att_masked / self.head_dim**0.5, dim=-1, dtype=torch.float32
 ).to(x.dtype)
```

This decreases each decode step from 83.6ms -> 11.2ms (7.5x!) 

Code: [rung-02-kv-cache](https://github.com/GuyOnWifi/scheduler/tree/rung-02-kv-cache) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-01-naive...rung-02-kv-cache))

## Continuous Batching

![Static versus continuous batching, slot by slot](/llm_inference_engine/scheduler-04.webp)

We can improve our batching methods as well! Currently we wait until *all* sequences are done, which means long generations will stall short ones. We'll modify it so the queue is dynamic.

If at any step, a sequence ends, it gets removed from the queue and a new one is added in. 

In our code, this means that we'll need to give each request a "slot" to store its KV cache in, since they can move in and out:

```diff
 @dataclass
 class BatchMeta:
     lengths: torch.Tensor
+    slot_ids: torch.Tensor
     positions: torch.Tensor
```

We'll store the free_kv slots in the engine 
```diff
 def __init__(self, model: Model, n_batch=8, max_len=2048):
     self.n_batch = n_batch
     self.max_len = max_len
     self.model = model
-    self.waiting_queue: list[Request] = []
+    self.waiting_queue: deque[Request] = deque()
     self.running: list[RunningReq] = []
+    self.free_kv_slots = [i for i in range(n_batch)]
     self.cache = model.alloc_cache(n_batch, max_len)
     self.prefill = False
```

On admission, we give it a free KV slot and mark it to prefill
```python
while self.waiting_queue and len(self.running) < self.n_batch:
    r = self.waiting_queue.popleft()
    new = RunningReq(
        r.req_id,
        list(r.prompt_ids),
        r.max_tokens,
        self.model.eos_token_ids,
        self.free_kv_slots.pop(),
    )
    to_prefill.append(new)
    self.running.append(new)
```

After processing the tokens:
```diff
-for req, t in zip(self.running, next_toks):
-    if req.done:
-        continue  # finished rows still ride along in the batch, but stay silent
+for req, t in next_toks:
     req.toks.append(t)
     req.generated += 1
+
+    if req.done:
+        self.free_kv_slots.append(req.slot)
     toks.append(TokenEvent(req.req_id, t, req.done))

+self.running = [r for r in self.running if not r.done]
```

Since we're no longer blocking waiting for our entire batch, we see insane improvements in TTFT p50 (2241 -> 57ms, 39x!). We see similar gains in E2E p50 (3740 -> 1622 ms) and max TPS (150 -> 224). TPOT remains unchanged since we only really change how we schedule, not the engine steps itself. 

This comes at the cost of higher ITL p99 (22.8 -> 75.9), since a new request's prefill causes a spike and stalls everyone's decode, which we'll solve in the next section. 

Code: [rung-03-continuous](https://github.com/GuyOnWifi/scheduler/tree/rung-03-continuous) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-02-kv-cache...rung-03-continuous))

## Chunked Prefill

Currently, on admission, we prefill the entire prompt, so our batching strategy looks a little more like this: 

![Unchunked prefill stalls every decoding sequence](/llm_inference_engine/scheduler-05.webp)

How we choose to schedule our prefills/decode depends on our **policy**. We're gonna copy vLLM's policy here: set a `token_budget`, representing the amount of tokens we process. Decode always needs a `token_budget` of 1 (since previous tokens are cached, and we don't need them), while a prefill's `token_budget` is the number of tokens not in the KV Cache yet. 

We prioritize all of the decodes, and then prefill the remaining `token_budget` tokens. Since decode is memory bound, prefills ride "for free" (up to a certain point). 

Since our requests now might not be fully prefilled, we need a way to store how many tokens we have prefilled. We store `num_computed`, which is the number of prefilled tokens. Note that for all decode, `toks - num_computed` = 1.

```diff
 @dataclass
 class RunningReq:
     req_id: int
     toks: list[int]
     max_tokens: int
     eos_ids: frozenset[int]
     slot: int
     generated: int = 0
+    num_computed: int = 0
```

We add a core loop to check for the "budget":
```diff
+while prefill_list and budget > 0:
+    req = prefill_list.popleft()
+    wants = len(req.toks) - req.num_computed
+    b = min(budget, wants)
+    to_prefill.append((req, b))
+    budget -= b
```

And with this, our ITL p99 goes from 75.9 -> 65.7. It does come at the cost of slightly higher TTFT (57 -> 75.1ms) since we don't prefill the entire sequence immediately, so long sequences will need to wait multiple steps for their first token. 

Code: [rung-04-chunked](https://github.com/GuyOnWifi/scheduler/tree/rung-04-chunked) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-03-continuous...rung-04-chunked))

## Flash Attention 

Currently, our attention is materializing an $n \times n$ matrix. This is bad for 2 reasons:
1) Moving that huge matrix in and out of HBM/VRAM is slow, which is necessary when the GPU needs to perform ops like softmax
2) Uses O(n^2) space, which will constrain the maximum size of our KV cache

![Every query scores against every key](/llm_inference_engine/scheduler-06.webp)

We'll use fast attention kernels like **[FlashAttention](https://arxiv.org/abs/2205.14135)**. The core optimization behind FlashAttention is tiling Q, K and V through on-chip SRAM in one fused kernel, so the $n \times n$ matrix never gets written to HBM/VRAM. What makes that possible is online softmax (running softmax). If we're able to somehow make an "accumulator" for each row of softmax, we can decrease our memory from O(n^2) to O(n) (one accumulator per row) by calculating an element, updating the accumulator and then discarding it.

The hard part is how do we do online softmax. For numerically stable softmax, we need to subtract the maximum value (to prevent overflows)
$$
\frac{e^{x_i-\max(x)}}{\sum_{j} e^{x_j - \max(x)}}
$$
which we don't know without knowing the full sequence! 

What we can do instead is: 
1) store the running max, and running denominator
2) on a new element, find the new max and rescale denominator by multiplying $e^{\mathrm{old\_max} - \mathrm{new\_max}}$

Here's a math visualization of why this works: 
$$
\begin{aligned}
&(e^{x_{1} - m_{old}} + e^{x_{2} - m_{old}} + e^{x_{3} - m_{old}})(e^{m_{old} - m_{new}}) \\
&= (e^{x_{1}-m_{old}})(e^{m_{old}-m_{new}}) + (e^{x_{2}-m_{old}})(e^{m_{old}-m_{new}}) + (e^{x_{3}-m_{old}})(e^{m_{old}-m_{new}}) \\
&= (e^{x_{1}-m_{old}+m_{old}-m_{new}}) + (e^{x_{2}-m_{old}+m_{old}-m_{new}}) + (e^{x_{3}-m_{old}+m_{old}-m_{new}}) \\
&= (e^{x_{1} - m_{new}} + e^{x_{2} - m_{new}} + e^{x_{3} - m_{new}})
\end{aligned}
$$

However, we still would need a value for each element of the row for the numerator! But remembering that attention multiplies each softmax value by their respective value vectors, we realize:
$$
\begin{aligned}
&\frac{e^{x_1-\max(x)}}{\sum_{j} e^{x_j - \max(x)}} \cdot V_{1} + \frac{e^{x_2-\max(x)}}{\sum_{j} e^{x_j - \max(x)}} \cdot V_{2} + \frac{e^{x_3-\max(x)}}{\sum_{j} e^{x_j - \max(x)}} \cdot V_{3} \\
&= \frac{\left( \sum_{i} e^{x_{i} - \max(x)}\cdot V_{i} \right)}{\sum_{j} e^{x_j - \max(x)}}
\end{aligned}
$$

And since this sum term also has a max, we can similarly do the rescaling trick we described earlier.[^8] 

Online softmax allows us to calculate the value one at a time, updating the accumulator, and discarding it. This means we'll calculate the full $n \times n$ matrix, but we won't need to materialize the full thing in our memory. 

We'll use [FlashInfer](https://github.com/flashinfer-ai/flashinfer) for our kernels. 

### Ragged Tensors

Before we can dive into the implementation, we'll have to make everything have **ragged tensors**.[^6] 

![Padded batch versus ragged CSR layout](/llm_inference_engine/scheduler-07.webp)

Ragged tensors store it as two elements: a list of "pointers" and the data. The $i$th element of the "pointers" is where the $i$th data starts in the data list. The $i+1$th element of pointers is where the $i$th data ends (non-inclusive). In other words, `data_ptr` stores the ranges of each piece of data. 

This is optimal because it allows us to skip padding uneven sequences into a tensor, saving us memory. Many attention kernels, FlashInfer's included, use this layout. 

--- 

```diff
+indptr = torch.nn.functional.pad(meta.lengths.cumsum(0), (1, 0)).int()
+paged_kv_indptr = torch.arange(len(meta.slot_ids) + 1).int()
+paged_kv_indices = meta.slot_ids.int()
+last_page_lens = (meta.positions[:, 0] + meta.lengths).int()
+self.prefill_wrapper.plan(
+    indptr,
+    paged_kv_indptr,
+    paged_kv_indices,
+    last_page_lens,
+    self.cfg.num_attention_heads,
+    self.cfg.num_key_value_heads,
+    self.cfg.head_dim,
+    kv_cache.k.shape[3],
+    causal=True,
+    q_data_type=self.embed_tokens.weight.dtype,
+)
```

FlashInfer requires us to call plan() first with the indptr (the pointer part of the input_ids ragged tensor), as well as a ragged tensor of where the paged_kv lives[^11]. For now, each slot is just one giant page of size `max_len`; we'll make real pages later. 

```diff
+rows = meta.slot_ids.repeat_interleave(meta.lengths)
+k_cache[rows, :, positions] = k_rope
+v_cache[rows, :, positions] = v_head
+
+out = prefill_wrapper.run(q_rope, (k_cache, v_cache))  # (N, qh, hd)
```

Once we've stored into the KV cache, we just call FlashInfer's kernel on it to get our value. 

This new attention kernel (and getting rid of padding) affects how fast we can decode, so it brings our TPOT p50 from 18.1 -> 10.6 ms and p99 from 29.4 -> 12.1. Because we're speeding up how long it takes to calculate a token, it also helps out with E2E, max TPS, and ITL. 

Code: [rung-05-flash-attn](https://github.com/GuyOnWifi/scheduler/tree/rung-05-flash-attn) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-04-chunked...rung-05-flash-attn))

## Paged KV Cache

Our current KV Cache allocates the maximum size for a fixed seq length, which is correct, but inefficient, since most requests will not be at maximum context length. 

![Contiguous KV fragments; paged blocks fit](/llm_inference_engine/scheduler-08.webp)

We need a way of dynamically allocating KV cache. However, instead of the current approach with contiguous chunks (which will require dynamic resizing, leading to fragmentation), we'll store small pages, and an overall KV is a collection of these small pages[^2]. We only allocate the pages a request actually uses, so many more requests fit at once with no fragmentation. It also gives us an easy way to re-use KV across requests (which we'll cover soon, called prefix caching).

We change the shape of our KV cache:
```diff
+@dataclass
+class PagedKVCache:
+    kv: torch.Tensor  # (layers, num_blocks, 2, num_kv_heads, block_size, head_dim)
+
+    @classmethod
+    def alloc(
+        cls, layers, num_pages, num_kv_heads, page_size, head_dim, device, dtype
+    ) -> Self:
+        return cls(
+            torch.zeros(
+                (layers, num_pages, 2, num_kv_heads, page_size, head_dim),
+                dtype=dtype,
+                device=device,
+            )
+        )
```

Now that we have more complex paging mechanism, the engine needs to be the one calculating much of the attention metadata:
```diff
 @dataclass
 class BatchMeta:
     lengths: torch.Tensor
-    slot_ids: torch.Tensor
+    paged_kv_indptr: torch.Tensor
+    paged_kv_indices: torch.Tensor
+    slot_mappings: torch.Tensor
     positions: torch.Tensor
+    indptr: torch.Tensor
+    last_page_lens: torch.Tensor
+    page_size: int
```

Our engine will now need to: 
1) On admission, allocate KV cache
2) On completion, deallocating
3) **Preempt** if there's not enough space

Preemption for this engine will mean putting back into the waiting queue, and re-prefilling once there's enough space.

```python
# 1) admission: only admit if the prompt's pages fit
while self.waiting_queue:
    r = self.waiting_queue[0]
    num_pages_needed = ceil((len(r.prompt_ids)) / self.page_size)
    # keep one free page per running request, so each can cross its next
    # page boundary before anyone needs preempting
    reserve = len(self.running)
    if num_pages_needed + reserve <= len(self.free_kv_slots):
        new = RunningReq(
            r.req_id,
            list(r.prompt_ids),
            r.max_tokens,
            self.model.eos_token_ids,
            [self.free_kv_slots.popleft() for _ in range(num_pages_needed)],
        )
        self.running.append(new)
        self.waiting_queue.popleft()
    else:
        break
```

```python
# 2) completion: give the pages back
if req.done:
    self.free_kv_slots.extend(req.pages_idx)
```

```python
# 3) a decode crossing into a new page, with no free page left: preempt
if len(r.toks) > self.page_size * len(r.pages_idx):
    if self.free_kv_slots:
        r.pages_idx.append(self.free_kv_slots.popleft())
    else:
        # find the last
        idx = -1
        while self.running[idx].req_id in preempted:
            idx -= 1
        to_preempt = self.running[idx]

        self.free_kv_slots.extend(to_preempt.pages_idx)
        self.waiting_queue.appendleft(
            Request(
                to_preempt.req_id,
                to_preempt.toks,
                to_preempt.max_tokens - to_preempt.generated,
                -1,
            )
        )
        preempted.add(to_preempt.req_id)
        if to_preempt.req_id == r.req_id:
            # self preemption
            break
        else:
            r.pages_idx.append(self.free_kv_slots.popleft())
```

We didn't really change much about our engine, except for the fact that it can now handle more concurrent requests with the same amount of memory. Our max TPS goes from 577 -> 1315 tok/s, while other metrics remain the same. 

Code: [rung-06-paged](https://github.com/GuyOnWifi/scheduler/tree/rung-06-paged) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-05-flash-attn...rung-06-paged))

## Prefix Caching

A token's KV only depends on the tokens before it, so prompts that share a prefix have the same KV for that prefix. So we can use this to find common prefixes between our requests, and share the KV cache between them. 

![Prefix caching: hash chains over full blocks](/llm_inference_engine/scheduler-09.webp)

We're going to do vLLM-style hash-based prefix lookups.[^5] Each block is hashed based on the previous block's hash and its current token ids. When we admit a request, we similarly compute its block hashes to find the longest prefix match, and instead of recomputing, mark the prefix computed and use those blocks. 

Note that blocks that aren't 100% full won't be counted, since they might still be written into. 

![Block pool: ref counts, free queue](/llm_inference_engine/scheduler-10.webp)

We use ref-counting because many requests might be sharing a block. One thing to note: we maintain a deque for the free blocks. When a used block is free (ref count goes down to 0), we put it to the end of free queue. When we need a new block, we pop from the start of the free queue. This allows for recent requests to keep their cache "warm" for longer, which is natural for turn-based conversations, agents, etc. 

```diff
+@dataclass
+class Block:
+    hash: int
+    block_idx: int
+    ref_count: int
+
 @dataclass
 class RunningReq:
     req_id: int
     toks: list[int]
     max_tokens: int
     eos_ids: frozenset[int]
-    pages_idx: list[int]
+    pages: list[Block]
     generated: int = 0
     num_computed: int = 0
```

We'll store a way to lookup blocks by dict:
```diff
+self.hash_to_blocks = {}
```

Here's the code for the hashing scheme:
```python
# (after the forward, for each page that just filled up)
# hash the blocks
for i in range(
    req.num_computed // self.page_size,
    (req.num_computed + b) // self.page_size,
):
    # starting block
    prev_hash = None
    if i > 0:
        prev_hash = req.pages[i - 1].hash

    h = hash(
        (
            prev_hash,
            tuple(
                req.toks[i * self.page_size : (i + 1) * self.page_size]
            ),
        )
    )
    req.pages[i].hash = h

    # keep the first block registered for h; a later duplicate stays private
    self.hash_to_blocks.setdefault(h, req.pages[i])
```

We'll change the free queue to handle O(1) deletions from anywhere, which is possible now when a match is found
```diff
-self.free_kv_slots = deque(range(num_pages))
+self.free_kv_slots = OrderedDict(
+    {i: Block(None, i, 0) for i in range(num_pages)}
+)
```

On admission, we hash the sequence and greedily find the longest prefix match, using those blocks and increasing their refcount by 1, with a special case if that takes a block out of the free queue. 
```python
# greedy match
prev_hash = None
for i in range((len(r.prompt_ids) - 1) // self.page_size):
    t = r.prompt_ids[i * self.page_size : (i + 1) * self.page_size]
    h = hash((prev_hash, tuple(t)))
    prev_hash = h
    if h in self.hash_to_blocks:
        b = self.hash_to_blocks[h]
        pages.append(b)
        if b.ref_count == 0:
            del self.free_kv_slots[b.block_idx]
        num_pages_needed -= 1
        num_computed += self.page_size
        b.ref_count += 1

    else:
        break

for _ in range(num_pages_needed):
    _, blk = self.free_kv_slots.popitem(last=False)
    # only drop the map entry if it points to this block (a duplicate copy
    # of the same prefix shares the hash but isn't the registered one)
    if self.hash_to_blocks.get(blk.hash) is blk:
        del self.hash_to_blocks[blk.hash]
    blk.hash = None
    blk.ref_count += 1
    pages.append(blk)
```

On completion, we decrease the ref count of the block. Special care is handled if refcount drops to 0, which means it's free again
```diff
 if req.done:
-    self.free_kv_slots.extend(req.pages_idx)
+    for blk in reversed(req.pages):
+        blk.ref_count -= 1
+        if blk.ref_count == 0:
+            self.free_kv_slots[blk.block_idx] = blk
```

We'll make a special benchmark for this, a shared-prefix workload (which is very similar to real world multi-turn chat workloads & system prompts). On this new workload, TTFT p50 goes down impressively from 47 -> 17.8 and p99 98 -> 31ms. 

Code: [rung-07-prefix](https://github.com/GuyOnWifi/scheduler/tree/rung-07-prefix) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-06-paged...rung-07-prefix))

## CUDA Graphs 

![Eager launches versus one CUDA graph](/llm_inference_engine/scheduler-11.webp)

Right now, we're executing in **eager** mode, meaning our PyTorch code is going step by step, queuing kernels. The problem is that the time it takes to prepare + launch the kernel is longer than it takes for the GPU to run the kernel! So we are **overhead bound**, and our GPU is sitting idle waiting for the next instruction.

CUDA Graphs solves that. You can record a series of kernel launches, and then instantly replay with no additional CPU work. The only constraint is that everything has to be the same: the same GPU buffers, same buffer sizes, same kernels, etc. These restrictions only make it feasible for decode, where the input shapes are consistent (1 token per request). 

Since buffer sizes have to be the same, we will record at batch size 1, 2, 4, 8, 16, 32, 64. We will then find the nearest one, and pad our inputs up to that batch size and replay the graph. The padding rows write into a reserved "dummy" KV cache page, so they never touch a real request's cache. 

One thing to note: since our policy can mix prefills and decodes, if there's ever a mixed batch, our graph can't handle that.[^4]

We keep static GPU buffers (input ids, positions, slot mappings, page tables) allocated once at the biggest batch size. Each step copies its batch into them, since a graph can only read from the addresses it was recorded with.

We'll make a function that records decode graphs:
```python
for b in reversed(self.buckets):
    decode = BatchDecodeWithPagedKVCacheWrapper(
        self.ws,
        kv_layout="HND",
        use_cuda_graph=True,
        use_tensor_cores=True,
        paged_kv_indptr_buffer=self.data.paged_kv_indptr_gpu[: b + 1],
        paged_kv_indices_buffer=self.data.paged_kv_indices_gpu,
        paged_kv_last_page_len_buffer=self.data.last_page_lens_gpu[:b],
    )

    # meta = a dummy batch of b decodes
    meta_gpu = self.data.view(meta, b)
    decode.plan(...)

    with torch.inference_mode():
        # warmup:
        for _ in range(3):
            self.net(self.data.input_ids_gpu[:b], meta_gpu, kv_cache, decode)

        g = torch.cuda.CUDAGraph()
        with torch.cuda.graph(g, pool=mem_pool):
            out = self.net(
                self.data.input_ids_gpu[:b], meta_gpu, kv_cache, decode
            )

    output[b] = (decode, g, out)
```

We'll allow decode-only requests to pad, and look up decode requests
```diff
 self.free_kv_slots = OrderedDict(
-    {i: Block(None, i, 0) for i in range(num_pages)}
+    # page 0 is the dummy page the CUDA graphs' padding rows write into
+    {i: Block(None, i, 0) for i in range(1, num_pages)}
 )
```

```python
if nt == b and nt <= self.max_buckets:
    # we can replay a graph

    # find max graph we can calc
    pad_buckets = self.buckets[bisect_left(self.buckets, nt)]
    return self.replay_graph(input_ids, meta, kv_cache, pad_buckets)

else:
    # eager mode
```

```python
def replay_graph(self, input_ids, meta, kv_cache, pad_to):
    nt = input_ids.shape[0]
    self.data.view(meta, pad_to)  # copy this batch into the static buffers
    self.data.input_ids_gpu[:nt].copy_(input_ids)

    (decode_wrapper, g, out) = self.graphs[pad_to]
    # pad indptr / indices / last_page_lens so rows nt..pad_to point at the dummy page
    decode_wrapper.plan(...)

    g.replay()
    return out[:nt]
```

Since this optimizes our decode step, it mainly affects TPOT, with p50 going from 9.6 -> 6.7 (-30%), and consequently ITL (p99 23.3 -> 17.1), E2E and max TPS. 

Code: [rung-08-graphs](https://github.com/GuyOnWifi/scheduler/tree/rung-08-graphs) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-07-prefix...rung-08-graphs))

## Overlap Scheduling

![Overlap: CPU runs one step ahead](/llm_inference_engine/scheduler-12.webp)

Currently, our code runs a forward pass, waits for the GPU to finish, appends the tokens, and repeats. But we waste time by waiting for the GPU. During this time, we can do CPU computation (attention kernel planning, shuffling buffers, etc) and queue up the $n + 1$'th step. 

This reduces "bubbling" (idle gaps on GPU waiting for CPU)

A consequence of this is that we process step n, and we realize it's already done, but we've already launched the kernels for step n+1! There is some slightly wasted computation, but since output sequence lengths are usually long, an extra token won't be much. We discard it safely. 

This will require us refactoring to the following structure
```python
def step():
    new = schedule()             # build + launch step N+1, don't wait for it
    out = []
    if in_flight is not None:
        out = process(*in_flight)  # wait for step N, append its tokens
    in_flight = new
    return out

def schedule():
    admit, pick decodes + prefill chunks (counting num_scheduled as already done)
    input_ids = known tokens from CPU, placeholders for tokens step N hasn't returned
    fill placeholders on the GPU from step N's argmax
    out = model.forward(input_ids, meta, cache)    # async
    next_gpu = out.argmax(-1)                     # stays on GPU for step N+2
    next_cpu = copy next_gpu to CPU (non_blocking) + record an event
    return to_process, next_gpu, next_cpu, event

def process(to_process, next_gpu, next_cpu, event):
    event.synchronize()                           # waits for N only
    append tokens, hash full pages, free finished requests
```

Each request also tracks `num_scheduled` (tokens launched but not processed yet), so the scheduler counts in-flight work as already done. The tricky part is that step N+1's inputs include tokens step N hasn't produced yet. We leave placeholders and fill them on the GPU straight from N's argmax:

```python
row_of = {}
if self.in_flight is not None:
    prev_batch = self.in_flight[0]  # to_process
    row_of = {r.req_id: j for j, (r, b) in enumerate(prev_batch)}

if to_process:
    ids, dst, src = [], [], []
    for x, b in to_process:
        start = x.num_computed + x.num_scheduled - b
        if start < len(x.toks):
            ids.extend(x.toks[start : start + b])  # known, from the CPU
        else:
            dst.append(len(ids))  # flat position in the packed input
            src.append(row_of[x.req_id])  # r's row in N
            ids.append(0)  # placeholder

    # pinned + non_blocking: a blocking copy would wait for step N to finish
    ids_gpu = torch.tensor(ids).pin_memory().to(self.device, non_blocking=True)
    if dst:
        dst_gpu = (
            torch.tensor(dst).pin_memory().to(self.device, non_blocking=True)
        )
        src_gpu = (
            torch.tensor(src).pin_memory().to(self.device, non_blocking=True)
        )
        ids_gpu[dst_gpu] = self.in_flight[1][src_gpu]
```


This didn't do as much as I would have expected, likely since CUDA graphs already helped us a lot. Perhaps our decode steps are also a little too short to gain full benefit from it, which is likely the result of using a tiny 0.6B model.  

However, under load (8 req/s, shared prefix), our ITL p99 drops from 16.2 -> 12.3 ms and TPOT p99 from 9.2 -> 8.3 ms. This is likely because under load, more steps mix prefills with decodes. Those steps run eagerly (no CUDA graph) and need more scheduling work, so there's more CPU time per step for overlapping to hide. 

It isn't a free win though: TTFT got worse, with p99 going 66.7 -> 75.8 ms on the main benchmark and p50 17.0 -> 22.4 ms on the shared-prefix one.

Code: [rung-09-overlap](https://github.com/GuyOnWifi/scheduler/tree/rung-09-overlap) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-08-graphs...rung-09-overlap))

## torch.compile 

PyTorch eager mode runs separate kernels for each operation, reading & writing to HBM many times. `torch.compile()` takes it and **fuses** the kernels together[^9], to make only one trip.

![Fusion: fewer round trips to memory](/llm_inference_engine/scheduler-15.webp)
[Horace He's "Making Deep Learning Go Brrrr From First Principles"](https://horace.io/brrr_intro.html)

The code to use compilation is extremely simple:
```python
self.net.forward = torch.compile(self.net.forward, dynamic=True)
```

and we disable optimizations for some non-PyTorch native steps in attention[^10]:
```py
@torch.compiler.disable
def _write_kv_and_attend(meta, kv_cache, k_rope, v_head, q_rope, wrapper):
    page_idx = meta.slot_mappings // meta.page_size
    offset_idx = meta.slot_mappings % meta.page_size
    kv_cache[page_idx, 0, :, offset_idx] = k_rope
    kv_cache[page_idx, 1, :, offset_idx] = v_head
    return wrapper.run(q_rope, kv_cache)
```

We'll also tune our parameters with a quick hand sweep. Raising token_budget 512 -> 2048 is the big one: when lots of requests arrive at once, each step can prefill more of them. We also bump num_pages 2048 -> 4096 (enough for the whole benchmark) and record CUDA graphs up to batch 128.

At 1.8 req/s, compile does almost all of the work: on its own it takes TPOT p50 from 6.1 -> 4.6ms and TTFT p50 from 39 -> 27ms, and tuning barely moves those. Tuning matters at max load instead: compile alone takes max TPS from 1451 -> 1911, and tuning gets the rest of the way to 2143. Together, that puts us right next to vLLM on throughput. 

Code: [rung-10-compile](https://github.com/GuyOnWifi/scheduler/tree/rung-10-compile) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-09-overlap...rung-10-compile))


## Final Results

The serve benchmark above only has about one request in flight at a time, so I also swept the arrival rate from 1 to 16 req/s. At low load we're 0.3-0.5 ms/token behind both engines, but as batches grow that per-step overhead gets spread across more tokens: by 8 req/s we're ahead of vLLM, and we stay within ~6% of SGLang (single runs, so treat these as rough).

![Load sweep: TPOT vs arrival rate](/llm_inference_engine/charts/sweep.webp)

## Conclusion

We roughly 14x'd our tok/s at max load in 8 steps (150 -> 2143), and our TTFT p50 went from 2241 to 24ms.

Big TPOT gains came mainly from kernel/engine work, whereas TTFT and ITL were usually shaped by scheduling decisions. On the same 3060, we're currently at about 98% of vLLM's throughput. In the future, we'll try techniques like speculative decoding, and maybe try this engine on bigger models & GPUs, which will require all sorts of parallelism techniques across GPUs.

Implementing all of the rungs was very fun. The concepts were simple, but deciding how the server should behave under load is the hard part. It's extremely easy to come up with policies that have great average latencies / throughputs, but *terrible* tails due to starvation. 

I really enjoyed writing this, and I hope you learnt something from this too :)

## Resources
- [Karpathy's GPT Video](https://www.youtube.com/watch?v=kCc8FmEb1nY) - go to when implementing transformers
- [Excalidraw](https://excalidraw.com/) for all of the visuals
- [Anatomy of vLLM](https://www.aleksagordic.com/blog/vllm), covering details of how vLLM works
- For Qwen's architecture: [Attention Is All You Need](https://arxiv.org/abs/1706.03762),  [RoFormer: Rotary Position Embedding (RoPE)](https://arxiv.org/abs/2104.09864), [GQA: Grouped-Query Attention](https://arxiv.org/abs/2305.13245), [Designing Positional Encoding (Hugging Face blog)](https://huggingface.co/blog/designing-positional-encoding)
- [Nano vLLM](https://github.com/GeeeekExplorer/nano-vllm), the project that inspired this

## Appendix: Full Results

**Serve, random prompts at 1.8 req/s, plus max TPS** (ms, p50 / p90 / p99)

| | TTFT <span data-chart="/llm_inference_engine/charts/ttft.webp" data-alt="Serve: TTFT"></span> | TPOT <span data-chart="/llm_inference_engine/charts/tpot.webp" data-alt="Serve: TPOT"></span> | ITL <span data-chart="/llm_inference_engine/charts/itl.webp" data-alt="Serve: ITL"></span> | E2E <span data-chart="/llm_inference_engine/charts/e2e.webp" data-alt="Serve: E2E"></span> | max TPS <span data-chart="/llm_inference_engine/charts/tps.webp" data-alt="Max throughput"></span> |
| ------------------ | ---------------------- | ------------------- | ------------------- | -------------------- | ------------------- |
| naive | (too slow to count) | (too slow to count) | (too slow to count) | (too slow to count) | (too slow to count) |
| kv cache | 2241 / 4767 / 7589 | 18.1 / 21.5 / 29.1 | 18.1 / 21.5 / 22.8 | 3740 / 7422 / 9642 | 150 |
| continuous | 57.2 / 97.6 / 184 | 17.9 / 23.9 / 28.9 | 16.1 / 24.4 / 75.9 | 1622 / 3852 / 4640 | 224 |
| chunked | 75.1 / 143 / 191 | 18.1 / 24.2 / 29.4 | 16.4 / 25.4 / 65.7 | 1616 / 3863 / 4582 | 222 |
| flash-attn | 42.1 / 61.1 / 72.6 | 10.6 / 11.3 / 12.1 | 10.2 / 11.6 / 26.4 | 884 / 2169 / 2454 | 577 |
| paged | 41.0 / 59.7 / 70.2 | 9.6 / 10.8 / 12.0 | 9.0 / 10.7 / 23.1 | 808 / 1924 / 2144 | 1315 |
| prefix | 41.4 / 59.9 / 70.7 | 9.6 / 10.3 / 11.2 | 9.2 / 10.7 / 23.3 | 858 / 1974 / 2232 | 1296 |
| graphs | 40.4 / 56.9 / 66.7 | 6.7 / 7.4 / 8.7 | 6.5 / 6.9 / 17.1 | 588 / 1403 / 1635 | 1380 |
| overlap | 39.1 / 61.0 / 75.8 | 6.1 / 6.8 / 7.2 | 6.0 / 6.3 / 16.3 | 550 / 1299 / 1506 | 1451 |
| compile + tuned | 24.1 / 33.5 / 48.1 | 4.7 / 5.3 / 5.9 | 4.5 / 4.9 / 8.8 | 428 / 975 / 1149 | 2143 |
| vLLM | 24.9 / 34.9 / 46.0 | 4.2 / 4.6 / 4.8 | 4.3 / 4.6 / 5.2 | 381 / 908 / 1039 | 2176 |
| SGLang | 24.3 / 34.3 / 46.2 | 4.0 / 4.4 / 5.0 | 4.0 / 4.3 / 6.0 | 355 / 848 / 988 | 2187 |


**Serve, shared prefix (384 shared + ~128 own tokens) at 8 req/s**  (ms, p50 / p90 / p99)

| | TTFT <span data-chart="/llm_inference_engine/charts/pfx.webp" data-alt="Shared prefix: TTFT"></span> | TPOT | ITL | E2E | out tok/s |
| -------------------------- | ------------------ | ------------------ | ----------------- | ----------------- | --------- |
| paged (no prefix cache) | 47.0 / 70.8 / 97.9 | 11.6 / 13.7 / 31.7 | 9.9 / 12.4 / 32.5 | 926 / 2219 / 2796 | 601 |
| prefix | 17.8 / 23.4 / 30.8 | 9.2 / 10.1 / 11.9 | 8.7 / 10.5 / 16.3 | 757 / 1709 / 2090 | 619 |
| graphs | 17.0 / 21.4 / 28.2 | 7.2 / 7.9 / 9.2 | 6.9 / 7.6 / 16.2 | 607 / 1352 / 1689 | 636 |
| overlap | 22.4 / 27.0 / 33.8 | 6.6 / 7.1 / 8.3 | 6.4 / 7.1 / 12.3 | 538 / 1236 / 1522 | 633 |
| compile + tuned | 16.0 / 18.9 / 23.5 | 4.9 / 5.2 / 5.8 | 4.8 / 5.1 / 9.5 | 382 / 910 / 1138 | 623 |
| vLLM | 18.0 / 20.9 / 26.3 | 4.7 / 5.0 / 6.1 | 4.6 / 4.9 / 10.4 | 359 / 878 / 1123 | 610 |
| SGLang | 17.7 / 21.5 / 25.8 | 4.4 / 4.8 / 7.1 | 4.2 / 4.5 / 12.2 | 351 / 843 / 1051 | 641 |

**Latency, closed loop: batch 8, 128 in / 64 out**  (ms, p50 / p90 / p99)

| | decode step <span data-chart="/llm_inference_engine/charts/dec.webp" data-alt="Latency: decode step"></span> | prefill | batch <span data-chart="/llm_inference_engine/charts/bat.webp" data-alt="Latency: whole batch"></span> |
|---|---|---|---|
| naive | 83.6 / 99.9 / 103 | 66.0 / 66.1 / 66.1 | 5482 / 5483 / 5484 |
| kv cache | 11.2 / 12.3 / 12.8 | 68.0 / 68.9 / 69.1 | 793 / 796 / 797 |
| continuous | 12.3 / 13.0 / 13.9 | 70.1 / 70.1 / 70.1 | 846 / 847 / 847 |
| chunked | 12.8 / 13.5 / 49.0 | 38.6 / 38.6 / 38.6 | 910 / 920 / 922 |
| flash-attn | 9.6 / 10.8 / 30.9 | 30.6 / 30.7 / 30.8 | 684 / 712 / 718 |
| paged | 9.1 / 10.6 / 29.9 | 29.4 / 29.5 / 29.5 | 661 / 664 / 665 |
| prefix | 9.4 / 10.4 / 11.2 | 11.0 / 11.1 / 11.1\* | 606 / 615 / 617 |
| graphs | 6.7 / 6.9 / 7.1 | 12.0 / 12.5 / 12.6 | 435 / 435 / 436 |
| overlap | 6.1 / 6.2 / 6.3 | 9.3 / 9.7 / 9.8 | 405 / 405 / 405 |
| compile + tuned | 4.6 / 4.7 / 4.7 | 5.9 / 6.2 / 8.2 | 305 / 306 / 307 |

\*Prefix cache hits: the bench reruns the same prompts.


[^1]: The roofline is an idealized upper bound: it only counts the weight matmuls and assumes kernels reach peak bandwidth and compute. Real decode steps also read each sequence's own KV cache for attention (which isn't shared across the batch) and pay kernel-launch overhead, so measured throughput sits below the roof, most of all near the ridge.

[^3]: The ridge point is peak compute ÷ memory bandwidth: 51.2 TFLOP/s ÷ 360 GB/s ≈ 142 FLOP per byte. Each bf16 weight is 2 bytes and does 2 FLOPs (a multiply and an add) for every sequence in the batch, so a batch of $B$ does $B$ FLOPs per byte of weights read, and the ridge sits at a batch of ≈ 142.

[^2]: This takes inspiration from virtual memory in operating systems: a table maps each request's logical KV positions to blocks, the same way a page table maps virtual pages to physical memory ([Kwon et al., 2023](https://arxiv.org/abs/2309.06180)).

[^4]: vLLM sidesteps this by keeping the attention eager, while recording graphs for all the rest of the operations, since those operate on a per-token level, not per-sequence. SGLang avoids this issue entirely, since their scheduler never mixes prefill/decode

[^5]: SGLang instead stores cached prefixes in a [radix tree](https://en.wikipedia.org/wiki/Radix_tree) (RadixAttention, [Zheng et al., 2023](https://arxiv.org/abs/2312.07104)). This allows token-level rather than block-level prefix matching, and scheduling policies that use the tree's structure.

[^6]: Also may be referred to as Compressed Sparse Row (CSR) layout

[^8]: This is what makes FlashAttention's tiling work: each tile's softmax can be rescaled as later tiles arrive, so Q, K and V stream through on-chip SRAM in one fused kernel and the $n \times n$ score matrix never hits HBM ([Dao et al., 2022](https://arxiv.org/abs/2205.14135)). [FlashAttention-2](https://arxiv.org/abs/2307.08691) then improves work partitioning (fewer non-matmul FLOPs, parallelizing over sequence length, better splitting across warps), and, for decode, [Flash-Decoding](https://crfm.stanford.edu/2023/10/12/flashdecoding.html) (Dao, Haziza, Massa & Sizov, 2023) splits the KV sequence across thread blocks.

[^9]: TorchInductor, torch.compile's default backend, generates [Triton](https://triton-lang.org/main/index.html) kernels on GPU with the fused ops.

[^10]: PyTorch optimizations cause the in-place KV write to turn into a copy, update and copy back

[^11]: This is because FlashInfer needs to know the lengths of the sequences to build a load-balanced schedule for the GPU

[^12]: Our engine is benchmarked in-process: the bench driver calls `engine.step()` directly and timestamps tokens right away, with no HTTP, tokenization or detokenization. vLLM and SGLang are measured through their OpenAI-compatible HTTP servers with streaming. At ~4–5 ms per token that overhead isn't negligible, so this favors our engine.
