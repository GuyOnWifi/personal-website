---
title: Building an LLM Inference Engine
description: what it takes to actually serve model weights in production
date: 2026-11-20
---
Building an inference engine to serve up Qwen3-0.6b! 

We'll iteratively write the code and work through the following optimizations
1) Static Batching
2) KV Caching
3) Continuous Batching
4) Chunked Prefill (+ policy)
5) Flash Attention (+ Ragged Tensors)
6) Paged KV Cache
7) Prefix Caching
8) CUDA Graphs
9) Overlap Scheduling
10) Speculative Decoding

## Results & Benchmarking

We're benchmarking a Qwen3-0.6b in bf16 on an RTX 3060 12GB. We check for correctness against HuggingFace's implementation. 

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


**Serve, random prompts at 1.8 req/s, plus max TPS** (ms, p50 / p90 / p99)

| rung          | TTFT               | TPOT               | ITL                | E2E                | max TPS |
| ------------- | ------------------ | ------------------ | ------------------ | ------------------ | ------- |
| 01 naive      | (too slow to count) | (too slow to count) | (too slow to count) | (too slow to count) | (too slow to count) |
| 02 kv cache   | 2241 / 4767 / 7589 | 18.1 / 21.5 / 29.1 | 18.1 / 21.5 / 22.8 | 3740 / 7422 / 9642 | 150     |
| 03 continuous | 57.2 / 97.6 / 184  | 17.9 / 23.9 / 28.9 | 16.1 / 24.4 / 75.9 | 1622 / 3852 / 4640 | 224     |
| 04 chunked    | 75.1 / 143 / 191   | 18.1 / 24.2 / 29.4 | 16.4 / 25.4 / 65.7 | 1616 / 3863 / 4582 | 222     |
| 05 flash-attn | 42.1 / 61.1 / 72.6 | 10.6 / 11.3 / 12.1 | 10.2 / 11.6 / 26.4 | 884 / 2169 / 2454  | 577     |
| 06 paged      | 41.0 / 59.7 / 70.2 | 9.6 / 10.8 / 12.0  | 9.0 / 10.7 / 23.1  | 808 / 1924 / 2144  | 1315    |
| 07 prefix     | 41.4 / 59.9 / 70.7 | 9.6 / 10.3 / 11.2  | 9.2 / 10.7 / 23.3  | 858 / 1974 / 2232  | 1296    |
| 08 graphs     | 40.4 / 56.9 / 66.7 | 6.7 / 7.4 / 8.7    | 6.5 / 6.9 / 17.1   | 588 / 1403 / 1635  | 1380    |
| 09 overlap    | 39.1 / 61.0 / 75.8 | 6.1 / 6.8 / 7.2    | 6.0 / 6.3 / 16.3   | 550 / 1299 / 1506  | 1451    |


**Serve, shared prefix (384 shared + ~128 own tokens) at 8 req/s**  (ms, p50 / p90 / p99)

| rung                       | TTFT               | TPOT               | ITL               | E2E               | out tok/s |
| -------------------------- | ------------------ | ------------------ | ----------------- | ----------------- | --------- |
| 06 paged (no prefix cache) | 47.0 / 70.8 / 97.9 | 11.6 / 13.7 / 31.7 | 9.9 / 12.4 / 32.5 | 926 / 2219 / 2796 | 601       |
| 07 prefix                  | 17.8 / 23.4 / 30.8 | 9.2 / 10.1 / 11.9  | 8.7 / 10.5 / 16.3 | 757 / 1709 / 2090 | 619       |
| 08 graphs                  | 17.0 / 21.4 / 28.2 | 7.2 / 7.9 / 9.2    | 6.9 / 7.6 / 16.2  | 607 / 1352 / 1689 | 636       |
| 09 overlap                 | 22.4 / 27.0 / 33.8 | 6.6 / 7.1 / 8.3    | 6.4 / 7.1 / 12.3  | 538 / 1236 / 1522 | 633       |

**Latency, closed loop: batch 8, 128 in / 64 out**  (ms, p50 / p90 / p99)

| rung | decode step | prefill | batch |
|---|---|---|---|
| 01 naive | 83.6 / 99.9 / 103 | 66.0 / 66.1 / 66.1 | 5482 / 5483 / 5484 |
| 02 kv cache | 11.2 / 12.3 / 12.8 | 68.0 / 68.9 / 69.1 | 793 / 796 / 797 |
| 03 continuous | 12.3 / 13.0 / 13.9 | 70.1 / 70.1 / 70.1 | 846 / 847 / 847 |
| 04 chunked | 12.8 / 13.5 / 49.0 | 38.6 / 38.6 / 38.6 | 910 / 920 / 922 |
| 05 flash-attn | 9.6 / 10.8 / 30.9 | 30.6 / 30.7 / 30.8 | 684 / 712 / 718 |
| 06 paged | 9.1 / 10.6 / 29.9 | 29.4 / 29.5 / 29.5 | 661 / 664 / 665 |
| 07 prefix | 9.4 / 10.4 / 11.2 | 11.0 / 11.1 / 11.1\* | 606 / 615 / 617 |
| 08 graphs | 6.7 / 6.9 / 7.1 | 12.0 / 12.5 / 12.6 | 435 / 435 / 436 |
| 09 overlap | 6.1 / 6.2 / 6.3 | 9.3 / 9.7 / 9.8 | 405 / 405 / 405 |

\*Prefix cache hits: the bench reruns the same prompts.

All code is on [Github](https://github.com/GuyOnWifi/scheduler)
## Summary of Qwen

![](/llm_inference_engine/scheduler-01.webp)

Hopefully this summarizes the Qwen architecture well enough! It is very similar to the original [attention paper](https://arxiv.org/abs/1706.03762) with the following changes:
- [Rope](https://arxiv.org/abs/2104.09864) ([good resource](https://huggingface.co/blog/designing-positional-encoding))
- [Group Query Attention](https://arxiv.org/abs/2305.13245) 
- RMSNorm

You can check out the basic impl of qwen at commit [0d4e790](https://github.com/GuyOnWifi/scheduler/commit/0d4e790ca9f59124dbc72e253203135cddd76b68)

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

Generating tokens is very memory intensive. The GPU has to stream the entire model's weights from memory for every decode step, which only generates one token per sequence. For example, Qwen3-0.6B takes roughly 1.2 GB[^1] in model weights. Assuming a memory bandwidth of 360 GB/s (on my 3060), 

$$
\text{TPS} = \frac{\text{Memory Bandwidth}}{\text{Model Weight Size}} = \frac{360}{1.2}=300\;\text{tok/s}
$$

![](/llm_inference_engine/scheduler-02.webp)

But that's only for one sequence! Small requests don't saturate our compute cores, and are bottlenecked by our memory bandwidth. We can usually increase our batch size (which reuses each weight read across the whole batch) and increase our total tok/s roughly proportionally (to a point, until compute dominates).

So the first strategy in our serving engine is to:
1) Maintain a queue of requests
2) Drain the queue, with some max amount 
3) Generate tokens with (hopefully) more than 1 batch at once until they're all done
4) Output / stream the tokens

Code: [rung-01-naive](https://github.com/GuyOnWifi/scheduler/tree/rung-01-naive) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-00-qwen...rung-01-naive))

## KV Caching 

Attention involves 3 vectors calculated from each embedding: key, query, value. Each one is calculated using a matmul, and is dependent on the output of the previous layer. This makes recomputing each one particularly expensive.

The K and V of previous tokens don't change when we add a new token! So we can cache them. And since attention is **causal** (backward looking), we actually don't need to store queries, since old queries won't be reused. 

![](/llm_inference_engine/scheduler-03.webp)

So with KV caching, we can split up our engine into two phases: prefill (prompt processing), where we attend to every token on every layer, storing the KV cache, and decode, where we use the KV cache to calculate the next token and grow it by 1 token. 


We add positions to the BatchMeta
```diff
@dataclass
class BatchMeta:
	lengths: torch.Tensor
+	positions: torch.Tensor
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
-        v_expanded = torch.repeat_interleave(v_head, self.groups, dim=1)
-        k_expanded = torch.repeat_interleave(k_rope, self.groups, dim=1)
+        (k_cache, v_cache) = kv_cache
+        rows = torch.arange(nb, device=x.device)[:, None]  # [B, 1]
+        k_cache[rows, :, positions] = k_rope.transpose(
+            1, 2
+        )  # [B, T, kv_heads, head_dim]
+        v_cache[rows, :, positions] = v_head.transpose(
+            1, 2
+        )  # [B, T, kv_heads, head_dim]
+
+        # mask is (num_batch, num_toks, max_toks), True = blocked: causal by position
+        max_toks = int(positions.max()) + 1
+        mask = torch.arange(max_toks, device=x.device) > positions[:, :, None]
+        k_all = k_cache[:, :, :max_toks, :]  # (nb, kvh, max_toks, hd)
+        v_all = v_cache[:, :, :max_toks, :]
+
+        v_expanded = torch.repeat_interleave(v_all, self.groups, dim=1)
+        k_expanded = torch.repeat_interleave(k_all, self.groups, dim=1)
 
         att = q_rope @ k_expanded.transpose(2, 3)
-        att_masked = att.masked_fill(mask, -torch.inf)
+        att_masked = att.masked_fill(mask[:, None], -torch.inf)  # mask over all heads
         att_weights = torch.softmax(
             att_masked / self.head_dim**0.5, dim=-1, dtype=torch.float32
         ).to(x.dtype)
```

This decreases each decode step from 83.6ms -> 11.2ms (7.5x!) 

Code: [rung-02-kv-cache](https://github.com/GuyOnWifi/scheduler/tree/rung-02-kv-cache) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-01-naive...rung-02-kv-cache))

## Continuous Batching

![](/llm_inference_engine/scheduler-04.webp)

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

We'll store the free_kv slots in each one 
```diff
     def __init__(self, model: Model, n_batch=8, max_len=2048):
         self.n_batch = n_batch
         self.max_len = max_len
         self.model = model
-        self.waiting_queue: list[Request] = []
+        self.waiting_queue: deque[Request] = deque()
         self.running: list[RunningReq] = []
+        self.free_kv_slots = [i for i in range(n_batch)]
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
-        for req, t in zip(self.running, next_toks):
-            if req.done:
-                continue  # finished rows still ride along in the batch, but stay silent
+        for req, t in next_toks:
             req.toks.append(t)
             req.generated += 1
+
+            if req.done:
+                self.free_kv_slots.append(req.slot)
             toks.append(TokenEvent(req.req_id, t, req.done))
 
+        self.running = [r for r in self.running if not r.done]
```

Since we're no longer blocking waiting for our entire batch, we see insane improvements in TTFT p50 (2241 -> 57ms, 39x!). We see similar gains in E2E p50 (3740 -> 1622 ms) and max TPS (150 -> 224). TPOT remains unchanged since we only really change how we schedule, not the engine steps itself. 

This comes at the cost of higher ITL p99 (22.8 -> 75.9), since a new request's whole prefill causes a spike and stalls everyone's decode, which we'll solve in the next section. 

Code: [rung-03-continuous](https://github.com/GuyOnWifi/scheduler/tree/rung-03-continuous) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-02-kv-cache...rung-03-continuous))

## Chunked Prefill

Currently, on admission, we prefill the entire prompt so our batching strategy looks a little more like this: 

![](/llm_inference_engine/scheduler-05.webp)

How we choose to schedule our prefills/decode depends on our **policy**. We're gonna copy vLLM's policy here: set a `token_budget`, representing the amount of tokens we process. Decode always needs a token_budget of 1 (since previous tokens are cached, and we don't need them), while a prefill's token_budget is the number of tokens not in the KV Cache yet. 

We prioritize all of the decodes, and then prefill the remaining `token_budget` tokens. Since decode is memory bound, prefills ride "for free". 

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
+        while prefill_list and budget > 0:
+            req = prefill_list.popleft()
+            wants = len(req.toks) - req.num_computed
+            b = min(budget, wants)
+            to_prefill.append((req, b))
+            budget -= b
```

And with this, our ITL p99 goes from 75.9 -> 65.7. It does come at the cost of slightly higher TTFT (57 -> 75.1ms) since we don't prefill the entire thing immediately. 

Code: [rung-04-chunked](https://github.com/GuyOnWifi/scheduler/tree/rung-04-chunked) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-03-continuous...rung-04-chunked))

## Flash Attention 

Currently, our attention is materializing a $n \times n$ matrix. This is bad for 2 reasons:
1) Moving that huge matrix in and out of HBM is slow, which is necessary when the GPU needs to perform ops like softmax
2) Uses O(n^2) space 

![](/llm_inference_engine/scheduler-06.webp)

The core optimization behind fast attention kernels like **[FlashAttention](https://arxiv.org/abs/2205.14135)**, is online softmax (running softmax). If we're able to somehow make an "accumulator" for each row of softmax, we can decrease our memory from O(n^2) to O(n) (one accumulator per row) by calculating an element, updating the accumulator and then discarding it.

The hard part is how do we do online softmax. For numerically stable softmax, we need to subtract the maximum value
$$
\frac{e^{x_i-\max(x)}}{\sum_{j} e^{x_j - \max(x)}}
$$
which we don't know without knowing the full sequence! 

What we can do instead is: 
1) store the running max, and running denominator
2) on a new element, find the new max and rescale denominator by multiplying $e^{\mathrm{old\_max} - \mathrm{new\_max}}$

Here's a math visualization of why this works: 
$$
\begin{align}
&(e^{x_{1} - m_{old}} + e^{x_{2} - m_{old}} + e^{x_{3} - m_{old}})(e^{m_{old} - m_{new}}) \\
&= (e^{x_{1}-m_{old}})(e^{m_{old}-m_{new}}) + (e^{x_{2}-m_{old}})(e^{m_{old}-m_{new}}) + (e^{x_{3}-m_{old}})(e^{m_{old}-m_{new}}) \\
&= (e^{x_{1}-m_{old}+m_{old}-m_{new}}) + (e^{x_{2}-m_{old}+m_{old}-m_{new}}) + (e^{x_{3}-m_{old}+m_{old}-m_{new}}) \\
&= (e^{x_{1} - m_{new}} + e^{x_{2} - m_{new}} + e^{x_{3} - m_{new}})
\end{align}
$$

However, we still would need a value for each element of the row for the numerator! But remembering that attention multiplies each softmax value by their respective value vectors, we realize:
$$
\begin{align}
&\frac{e^{x_1-\max(x)}}{\sum_{j} e^{x_j - \max(x)}} \cdot V_{1} + \frac{e^{x_2-\max(x)}}{\sum_{j} e^{x_j - \max(x)}} \cdot V_{2} + \frac{e^{x_3-\max(x)}}{\sum_{j} e^{x_j - \max(x)}} \cdot V_{3} \\
&= \frac{\left( \sum_{i} e^{x_{i} - \max(x)}\cdot V_{i} \right)}{\sum_{j} e^{x_j - \max(x)}}
\end{align}
$$

And since this sum term also has a max, we can similarly do the rescaling trick we described earlier.[^8]

We'll use [FlashInfer](https://github.com/flashinfer-ai/flashinfer) for our kernels. 

### Ragged Tensors

Before we can dive into the implementation, we'll have to make everything have **ragged tensors**.[^6] 
![](/llm_inference_engine/scheduler-07.webp)

Ragged tensors store it as two elements: a list of "pointers"[^7] and the data. The $i$th element of the "pointers" is where the $i$th data starts in the data list. The $i+1$th element of pointers is where the $i$th data ends (non-inclusive). In other words, `data_ptr` stores the ranges of each piece of data. 

This is optimal because it allows us to skip padding uneven sequences into a tensor, saving us memory. And also because FlashInfer's kernels take this layout. 

It is a bit of work rewriting everything to use ragged pointers however... you can check out the code 

--- 

```diff
+        indptr = torch.nn.functional.pad(meta.lengths.cumsum(0), (1, 0)).int()
+        paged_kv_indptr = torch.arange(len(meta.slot_ids) + 1).int()
+        paged_kv_indices = meta.slot_ids.int()
+        last_page_lens = (meta.positions[:, 0] + meta.lengths).int()
+        self.prefill_wrapper.plan(
+            indptr,
+            paged_kv_indptr,
+            paged_kv_indices,
+            last_page_lens,
+            self.cfg.num_attention_heads,
+            self.cfg.num_key_value_heads,
+            self.cfg.head_dim,
+            kv_cache.k.shape[3],
+            causal=True,
+            q_data_type=self.embed_tokens.weight.dtype,
+        )
```

FlashInfer requires us to call plan() first with the indptr (the pointer part of the input_ids ragged tensor), as well as a ragged tensor of where the paged_kv lives. For now, each slot is just one giant page of size `max_len`; we'll make real pages later. 

```diff
+        rows = meta.slot_ids.repeat_interleave(meta.lengths)
+        k_cache[rows, :, positions] = k_rope
+        v_cache[rows, :, positions] = v_head
+
+        out = prefill_wrapper.run(q_rope, (k_cache, v_cache))  # (N, qh, hd)
```

But now, we handle the store into KV cache, and we just call FlashInfer's kernel on it and we're done! 

This new attention kernel (and getting rid of padding) affects how fast we can decode, so it brings our TPOT p50 from 18.1 -> 10.6 ms and p99 from 29.4 -> 12.1. Thanks to this improvement, it also helps out with E2E, max TPS, and ITL. 

Code: [rung-05-flash-attn](https://github.com/GuyOnWifi/scheduler/tree/rung-05-flash-attn) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-04-chunked...rung-05-flash-attn))

## Paged KV Cache

Our current KV Cache allocates the maximum size for a fixed seq length, which is correct, but inefficient, since most requests will not be at maximum context length. 

![](/llm_inference_engine/scheduler-08.webp)

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

The logic for this is a lot more fun now that we need to handle
1) On admission, allocate KV cache
2) On completion, deallocating
3) Preempting if not enough space

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

There's almost no change in any metrics, except for max TPS since we can have more concurrent requests. It goes from 577 -> 1315 tok/s

Code: [rung-06-paged](https://github.com/GuyOnWifi/scheduler/tree/rung-06-paged) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-05-flash-attn...rung-06-paged))

## Prefix Caching

A token's KV only depends on the tokens before it, so prompts that share a prefix have the same KV for that prefix. So we can use this to find common prefixes between our requests, and share the KV cache between them. 

![](/llm_inference_engine/scheduler-09.webp)

We're going to do vLLM-style hash-based prefix lookups.[^5] Each block is hashed based on the previous block's hash and its current token ids. When we admit a request, we compute a similar hash to find the longest prefix match, and instead of recomputing, mark those as computed and use that block. 

Note that blocks that aren't 100% full won't be counted, since they might still be written into. 

![](/llm_inference_engine/scheduler-10.webp)

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
+        self.hash_to_blocks = {}
```

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
-        self.free_kv_slots = deque(range(num_pages))
+        self.free_kv_slots = OrderedDict(
+            {i: Block(None, i, 0) for i in range(num_pages)}
+        )
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
-                    self.free_kv_slots.extend(req.pages_idx)
+                    for blk in reversed(req.pages):
+                        blk.ref_count -= 1
+                        if blk.ref_count == 0:
+                            self.free_kv_slots[blk.block_idx] = blk
```

We'll make a special benchmark for this, a shared-prefix workload (which is very similar to real world harness prompt workflows, etc). On this new workload, TTFT p50 goes down impressively from 47 -> 17.8 and p99 98 -> 31ms. 

Code: [rung-07-prefix](https://github.com/GuyOnWifi/scheduler/tree/rung-07-prefix) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-06-paged...rung-07-prefix))

## CUDA Graphs 

![](/llm_inference_engine/scheduler-11.webp)

Right now, we're executing in **eager** mode, meaning our PyTorch code is going step by step, queuing kernels. The problem is that the time it takes to prepare + launch the kernel is longer than it takes for the GPU to run the kernel! So we are **overhead bound**, and our GPU is sitting idle waiting for the next instruction.

CUDA Graphs solves that. You can record a series of kernel launches, and then instantly replay with no additional CPU work. The only constraint is that everything has to be the same: the same GPU buffers, same buffer sizes, same kernels, etc. These restrictions only make it feasible for decode, where the input shapes are consistent (1 token per request). 

Since buffer sizes have to be the same, we will record at batch size 1, 2, 4, 8, 16, 32, 64. We will then find the nearest one, and pad our inputs up to that appropriate batch size[^3] and replay the graph. 

One thing to note: since our policy can mix prefills and decodes, if there's ever a mixed batch, our graph can't handle that.[^4]

We'll need static buffers that we pass views into for our graphs
```python
class StaticDecodeData:
    paged_kv_indptr_gpu: torch.Tensor
    paged_kv_indices_gpu: torch.Tensor
    last_page_lens_gpu: torch.Tensor
    slot_mappings_gpu: torch.Tensor
    positions_gpu: torch.Tensor
    indptr_gpu: torch.Tensor
    input_ids_gpu: torch.Tensor

    # __init__: each one torch.zeros(max_batch, ...) on the GPU, allocated once

    # takes in cpu made batch meta, returns a gpu batch meta)
    def view(self, meta: BatchMeta, pad_to):
        nt = meta.positions.shape[0]
        self.slot_mappings_gpu[:pad_to] = 0  # dummy slot
        self.slot_mappings_gpu[:nt].copy_(meta.slot_mappings)
        self.positions_gpu[:nt].copy_(meta.positions)

        return BatchMeta(
            meta.paged_kv_indptr,
            meta.paged_kv_indices,
            self.slot_mappings_gpu[:pad_to],
            self.positions_gpu[:pad_to],
            self.indptr_gpu[: pad_to + 1],
            meta.last_page_lens,
            meta.page_size,
        )
```

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
-            {i: Block(None, i, 0) for i in range(num_pages)}
+            # page 0 is the dummy page the CUDA graphs' padding rows write into
+            {i: Block(None, i, 0) for i in range(1, num_pages)}
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
        b = meta.indptr.shape[0] - 1

        self.data.view(meta, pad_to)
        self.data.input_ids_gpu[:nt].copy_(input_ids)

        (decode_wrapper, g, out) = self.graphs[pad_to]

        # pad to fit
        paged_kv_indptr = torch.cat(
            [
                meta.paged_kv_indptr,
                torch.arange(
                    meta.paged_kv_indptr[-1] + 1,
                    meta.paged_kv_indptr[-1] + 1 + pad_to - b,
                    dtype=torch.int32,
                ),
            ]
        )
        paged_kv_indices = torch.nn.functional.pad(
            meta.paged_kv_indices, (0, pad_to - b)
        )
        last_page_lens = torch.nn.functional.pad(
            meta.last_page_lens, (0, pad_to - b), value=1
        )

        decode_wrapper.plan(...)

        g.replay()

        return out[:nt]
```

This mainly affects TPOT, with p50 going from 9.6 -> 6.7 (-30%), and consequently ITL (p99 23.3 -> 17.1), E2E and max TPS. 

Code: [rung-08-graphs](https://github.com/GuyOnWifi/scheduler/tree/rung-08-graphs) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-07-prefix...rung-08-graphs))

## Overlap Scheduling

![](/llm_inference_engine/scheduler-12.webp)

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

We can split our current stepping function to two parts.

We'll need to modify some parts to reuse the GPU data as well.
```diff
     generated: int = 0
     num_computed: int = 0
+    num_scheduled: int = 0
```

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

```python
            next_gpu = prefill_out.argmax(-1)  # stays on the GPU: N+1's decode inputs
            next_cpu = next_gpu.to("cpu", non_blocking=True)  # pinned, filled later
            done = torch.cuda.Event()
            done.record()  # fires once N's forward + argmax + copy have run
            return to_process, next_gpu, next_cpu, done

    def process(self, to_process, next_gpu, next_cpu, done):
        toks = []
        done.synchronize()  # waits for N's copy only, not for N+1
        prefill_next_toks = next_cpu.tolist()

        # finished in the previous process() or preempted since: drop the stale row
        alive = {r.req_id for r in self.running}
        for (req, b), t in zip(to_process, prefill_next_toks):
            if req.req_id not in alive:
                continue
```

This didn't do as much as I would have expected, since CUDA graphs helped us a lot. Perhaps our decode steps are also a little too short to gain full benefit from it. 

However under load (8req/s), our TPOT p99 halves, going from 32 -> 16. This is likely because under load, more steps mix prefills with decodes. Those steps run eagerly (no CUDA graph) and need more scheduling work, so there's more CPU time per step for overlapping to hide. 

Code: [rung-09-overlap](https://github.com/GuyOnWifi/scheduler/tree/rung-09-overlap) ([diff vs previous](https://github.com/GuyOnWifi/scheduler/compare/rung-08-graphs...rung-09-overlap))

## Speculative Decoding

Decoding is still inefficient because we read all the weights for one token. But what if we can do it for more than one? 

Speculative decoding is a technique where a cheaper model or algorithm proposes "draft tokens". All of the draft tokens are put into the model, and the model verifies if it would've output those tokens. We continue accepting draft tokens until we either:
1) reach the end, meaning that our drafts were perfect, and get a free predicted token from the model
2) reach a token the model rejects, and we pick the token the model *would've* chosen and discard the rest 

### Rejection Sampling

This was an interesting read, but it is not relevant to n-gram. This applies to draft models that output probability distributions. How do we describe "would this model's distribution have chosen this token?"

![](/llm_inference_engine/scheduler-13.webp)

We sample a random x from q. 
1) We give it a probability of min(1, (p(x)/q(x))) chance of being accepted
2) If it is rejected, we rescale every other possible token by doing max(0, p - q), and sample accordingly 

Why this? Here's the intuition. There's a q(x) chance of being chosen, and we want to rescale that to p(x). So if we give it a p(x)/q(x) chance, by law of dependent probabilities, it has a q(x) \* p(x)/q(x) = p(x) chance overall. We use a min to clip it at 100%

If it is rejected, we want to sample from the rest of the tokens. Namely, we want to weight the ones our draft model underproposes. So we do p - q for all of them, rescale them so each is a % chance out of 100, and then sample from that. We use a max to make sure it is non-negative. 

Here's a visual showing how these steps equal the same distribution:
![](/llm_inference_engine/scheduler-14.webp)


## Conclusion

We roughly 10x'd our tok/s at max load in 9 steps, and our TTFT p50 went from 2241 to 39ms.

Big TPOT gains came mainly from kernel/engine work, whereas TTFT and ITL were usually shaped by scheduling decisions. On the same 3060, we're currently at about 65% of vLLM's throughput. Looking through their code, it seems that the remaining gains will likely be at the kernel/engine level. There's still a lot we can improve on. In the future, I'll look at kernel fusion using torch.compile and a bigger KV cache. Maybe we'll try tensor parallelism across GPUs too.

Implementing all of the rungs was very fun. The concepts were simple, but deciding how the server should behave under load is the hard part.

I really enjoyed writing this, and I hope you learnt something from this too :)

## Resources
- [Karpathy's GPT Video](https://www.youtube.com/watch?v=kCc8FmEb1nY) - go to when implementing transformers
- [Excalidraw](https://excalidraw.com/) for all of the visuals
- [Anatomy of vLLM](https://www.aleksagordic.com/blog/vllm), covering details of how vLLM works
- For Qwen's architecture: [Attention Is All You Need](https://arxiv.org/abs/1706.03762),  [RoFormer: Rotary Position Embedding (RoPE)](https://arxiv.org/abs/2104.09864), [GQA: Grouped-Query Attention](https://arxiv.org/abs/2305.13245), [Designing Positional Encoding (Hugging Face blog)](https://huggingface.co/blog/designing-positional-encoding)
- [Nano vLLM](https://github.com/GeeeekExplorer/nano-vllm), the project that inspired this


[^1]: bf16 weights

[^2]: Think a dynamic array vs a linked list

[^3]: This means that we'll have a "dummy" KV cache page for these dummy decodes to go into

[^4]: vLLM sidesteps this by keeping the attention eager, while recording graphs for all the rest of the operations, since those operate on a per-token level, not per-sequence. SGLang doesn't have this issue entirely, since their scheduler never mixes prefill/decode

[^5]: SGLang uses a different approach, a [radix tree](https://en.wikipedia.org/wiki/Radix_tree). It is a bit more annoying to code, but allows for advantages like more prefix-matching granularity, unique scheduling algorithms based on the tree. But they're pretty similar in terms of what they accomplish.

[^6]: Also may be referred to as Compressed Sparse Row (CSR) layout

[^7]: Honestly not sure why they're called "pointers", they're more like ranges

[^8]: There are plenty more kernel-level optimizations that attention kernels use, but we won't go into them for this post. Do look at the [FlashAttention paper](https://arxiv.org/abs/2205.14135) if you're curious.
