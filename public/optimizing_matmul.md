---
title: optimizing matmul on a ryzen 9950x
description: 0->103% of openblas, featuring the latest avx512 instructions
date: 2026-08-20
tags: [c++, simd, performance, cpu architecture]
image: /matmul/og-card.png
---

Matrix multiplication is a simple algorithm: `result[r][c] += left[r][k] * right[k][c]`. So why is the simple implementation over 500x worse than the optimized one? In this worklog, I'll be covering many core systems concepts, including caches, intrinsics, SIMD and multithreading.[^29]

## Me vs. OpenBLAS

I'll start with the naive implementation and create step by step incremental optimizations until we beat OpenBLAS, a library common used for fast matrix multiplication. The final implementation sits at around ~4.1 TFLOPS, beating OpenBLAS by ~3%.

| Implementation                                            | Time (ms) | GFLOPS   | % of OpenBLAS |
| --------------------------------------------------------- | --------- | -------- | ------------- |
| **OpenBLAS for 1024x1024 (single-threaded)**              | **6.61**  | **325**  | **100%**      |
| Naive (1024 x 1024)                                       | 269       | 8        | 2.46%         |
| Cache Aware (1024 x 1024)                                 | 26.0      | 83       | 25.54%        |
| **OpenBLAS (4096x4096, single-threaded)**                 | **414**   | **332**  | **100%**      |
| Register Tiling (4096x4096)                               | 964       | 143      | 43.07%        |
| Full Tiling (4096x4096)                                   | 636       | 216      | 65.06%        |
| Full Tiling + Packing (4096x4096)                         | 503       | 273      | 82.23%        |
| Optimized sequential packing (4096x4096)                  | 437       | 315      | 94.88%        |
| **OpenBLAS (4096x4096, multi-threaded)**                  | **43.7**  | **3142** | **78.71%**    |
| **OpenBLAS (4096x4096, tuned with 16 threads + taskset)** | **34.4**  | **4001** | **100%**      |
| **Multithreading + auto-tuning (4096x4096)**              | **33.4**  | **4120** | **103%**      |

I organized this table to compare relative to the appropriate OpenBLAS routine (single vs multithreaded).[^27] Or else the table would look like a sudden 16x jump, even though we're actually working our way up the optimizing ladder!

Benchmarked using [Google Benchmark](https://github.com/google/benchmark). Tested using [GoogleTest](https://github.com/google/googletest), against OpenBLAS's output. Float comparisons are done with a relative tolerance of 1e-2 and an absolute tolerance of 1e-3, consistent with [OpenBLAS' testing methods](https://github.com/OpenMathLib/OpenBLAS/blob/develop/test/test_helpers.h#L62).

Note that we won't be implementing the full GEMM $C = \alpha \times A \times B + \beta \times C$. We'll only be doing $C = A \times B + C$. I wanted to keep the code and the function signatures relatively simple, as I'm focusing on pure FLOPS.
## What's so special about matrix multiplication?

First off, it's important to know about the nature of matrix multiplication and a bad implementation is so much worse despite the algorithm remaining the same complexity.

![m by k times k by n gives m by n. We loop rows m, columns n, and the dot product along k](/matmul/matmul-shape.webp)

The operation takes in an `m` by `k` matrix, multiplies it with a `k` by `n` matrix to form a `m` by `n`.

The compute complexity can be expressed as $O(n^3)$ while only needing $O(n^2)$ memory. Each element is re-used `n` times, and it _can be_ [compute bound](https://en.wikipedia.org/wiki/CPU-bound). However, that's only possible if our implementation actually _efficiently reuses the data_. Our CPU's compute speed outruns the DRAM feeding them data (see [memory wall](https://en.wikipedia.org/wiki/Random-access_memory#Memory_wall)). This means that we need to use our CPUs features through understanding vector registers, memory hierarchies, prefetching behaviors. And knowing these memory hierarchies and optimizing them genuinely does make a hundredfold difference.

## Prelude: My System

I have an AMD Ryzen 9 9950X, on the Zen 5 architecture, featuring 16 cores and (most importantly) the latest AVX512 SIMD instructions. It has a base clock of roughly 4.3 GHz, and seems to sustain roughly ~4.9 GHz when OpenBLAS is doing matrix multiplication.[^2]

Matrix multiplication heavily uses SIMD (Single Instruction, Multiple Data) which allows us to do many floating point operations at once. For 32-bit floats on AVX512, thats 512 / 32 = 16 floats at once.

| Instruction                                                                                   | Latency | Throughput | Uops | Ports    |
| --------------------------------------------------------------------------------------------- | ------- | ---------- | ---- | -------- |
| [VFMADD231PS (ZMM, ZMM, ZMM)](https://uops.info/html-instr/VFMADD231PS_ZMM_ZMM_ZMM.html#ZEN5) | 3/4     | 0.50       | 1    | 1\*FP0/1 |

Specifically, we can use the VFMADD (vector fused multiply-add) which does $a * b + c$, allowing us to do 2 operations for one instruction. With a throughput of 0.5 cycles / instructions, we can issue 2 of these in parallel every cycle.[^21]

So, theoretically, the total FLOPS is

$$
\underbrace{4.9\times10^{9}}_{\substack{\text{cycles/s} \\ \text{\scriptsize measured}}}
\;\times\;
\underbrace{2}_{\substack{\text{FMA/cycle} \\ \text{\scriptsize 2 FP pipes}}}
\;\times\;
\underbrace{16}_{\substack{\text{lanes/FMA} \\ \text{\scriptsize 512b / 32b}}}
\;\times\;
\underbrace{2}_{\substack{\text{flops/lane} \\ \text{\scriptsize mul + add}}}
\approx 314\, \text{GFLOP/s}
$$

per core![^28] With 16 cores, its roughly $\approx 5\, \text{TFLOP/s}$. Which is pretty good, for a general-purpose chip!

## Basic Implementation

The naive approach. This one implements matrix multiplication as its literal definition: for each row of A and column of B, compute their [dot product](https://en.wikipedia.org/wiki/Dot_product).[^4]
![The naive order: rows of A outside, columns of B in the middle, dot product along k inside](/matmul/naive-loop-order.webp)

```cpp
void naive(int M, int N, int K, const float *A, const float *B, float *C) {
  for (int r = 0; r < M; r++) {
    for (int c = 0; c < N; c++) {
      float acc = 0.0f;
      for (int i = 0; i < K; i++) {
        acc += A[r * K + i] * B[i * N + c];
      }
      C[r * N + c] = acc;
    }
  }
}
```

We're compiling with `-O3 -march=znver5 -ffast-math` to enable AVX512 (gcc is conservative, and doesn't assume AVX512 since not all computers have those) and also let the compiler emit FMA instructions.

## Brief Dive into Cache

There's a simple fix that can 10x our performance.

CPUs have a region of specialized memory that's meant to be faster, known as cache. It lives on the die itself, sitting right next to the compute cores for maximum speed & bandwidth. This is to give CPUs the fast-speed memory it needs to consume for its operations, but they are much smaller than RAM.

![My 9950X. Two dies, each with 32MB of L3 across 8 cores, plus 1MB L2 and 48KB L1d per core](/matmul/topology-lstopo.webp)

When you fetch a single element from memory, the CPU automatically fetches the whole _cache line_ of 64 bytes and puts it into cache. In addition, instead of waiting for memory to arrive, CPUs automatically run _prefetchers_ to try and predict what memory you'll use next. This makes sequential access very cache-friendly and more performant, because you utilize the entire 64 bytes that the CPU automatically fetches for you _and_ the prefetcher guesses the memory you need next correctly.

And the implementation is as simple as switching around a loop. And now, in our hot loop, we're going _across_ the matrix, which is a sequential walk down memory.

![After the swap. The inner loop now walks columns of B and C sequentially](/matmul/cache-aware-loop-order.webp)

Which is just rearranging one loop:

```cpp
void cache_aware(int M, int N, int K, const float *A, const float *B,
                 float *C) {
  for (int r = 0; r < M; r++) {
    for (int i = 0; i < K; i++) {
      for (int c = 0; c < N; c++) {
        C[r * N + c] += A[r * K + i] * B[i * N + c];
      }
    }
  }
}
```

And looking at the assembly in [godbolt.org](https://godbolt.org):

```asm
vmovups zmm0, ZMMWORD PTR [rcx+rax]
vfmadd213ps     zmm0, zmm1, ZMMWORD PTR [rdx+rax]
vmovups ZMMWORD PTR [rdx+rax], zmm0
```

the compiler was smart enough to vectorize it automatically! Another, indirect benefit of sequential memory access[^5].

And with that simple swap of one line of code, we're at 10x of our naive examples!

## Not all Memory is Equal

While technically not a _cache_, the fastest memory of them all are registers, which CPUs use internally for their operations. We can use this to our advantage. Zen5 has 32 zmm registers, each holding 512 bits, totaling 2KB of info we can store!

Our previous example required loading and storing constantly to (cached) memory. However, we can further improve it by storing as much as we can into the 2KB of registers.

Since matrix multiplication is (m x k) by (k x n) = (m x n) operation. Since the same (3x99999) matrix and (99999x3) matrix end up getting reduced to (3x3), a good idea would be to use registers as our result tile, and accumulate A @ B into that register tile. This gives us the most reuse, since we can loop across K, and we want to spend our precious registers on something that can be reused often.

So how do we use zmm registers to speed up the actually A @ B process? Look at the math of a matmul:

$$
\begin{bmatrix}
a & b & c \\
d & e & f \\
g & h & i
\end{bmatrix}
\begin{bmatrix}
j & k & l \\
m & n & o \\
p & q & r
\end{bmatrix}
=
\begin{bmatrix}
aj+bm+cp & ak+bn+cq & al+bo+cr \\[4pt]
dj+em+fp & dk+en+fq & dl+eo+fr \\[4pt]
gj+hm+ip & gk+hn+iq & gl+ho+ir
\end{bmatrix}
$$

We can see that the first row is the sum of $a \cdot \begin{bmatrix} j, k, l \end{bmatrix} + b \cdot \begin{bmatrix} m, n, o \end{bmatrix} + c \cdot \begin{bmatrix} p, q, r \end{bmatrix}$

The second row is $d \cdot \begin{bmatrix} j, k, l \end{bmatrix} + e \cdot \begin{bmatrix} m, n, o \end{bmatrix} + f \cdot \begin{bmatrix} p, q, r \end{bmatrix}$

The third row is $g \cdot \begin{bmatrix} j, k, l \end{bmatrix} + h \cdot \begin{bmatrix} m, n, o \end{bmatrix} + i \cdot \begin{bmatrix} p, q, r \end{bmatrix}$

So if we were to extend this example to 1024-sized matrices, we could:
1) loop through each element of A
2) broadcast (copy-paste) it into a vector of 16 elements
3) load the corresponding row of B into zmm registers
4) perform a fast FMA into the register accumulator

However, this is still too slow. Zen5 has 2 load ports, meaning it can perform 2 512-bit loads per cycle. Each broadcast is a load, and 16 floats from B is another load. That lets us do 1 FMA/cycle, which is half of our peak limit at 2 FMAs/cycle.

But there's one more trick we can use. See how rows of B are reused for different elements? Instead, what we can do is load a single row of B within zmm registers, and then FMA them into our register accumulator. Then we go down a row in A, and repeat against the same row. [^7] Once again, optimizing registers for data that can be re-used. 

![Broadcast one element of A across a zmm register, multiply it by a row of B, accumulate into the register tile](/matmul/microkernel-broadcast.webp)

In code, it looks like this. It heavily uses [compiler intrinsics](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html) to achieve this register-level behavior we've been describing. It uses templates so the compiler can unroll them into a continuous stream of instructions. Pretty cool what the compiler can do when you get specific enough! Saves us from writing the assembly.

```cpp
// n_reg = n_reg_zmm * 16, n_reg_zmm counts zmm registers for convenience
template <int m_reg, int n_reg_zmm>
inline void register_accumulator(int k_cache, const float *left, const int lda,
                                 const float *right, const int ldb,
                                 float *result, const int ldc) {
  __m512 acc[m_reg][n_reg_zmm];

  // Fill registers with the result
  for (int r = 0; r < m_reg; r++) {
    for (int c = 0; c < n_reg_zmm; c++) {
      acc[r][c] = _mm512_load_ps(result + r * ldc + c * 16);
    }
  }

  for (int i = 0; i < k_cache; i++) {

    // Load n_reg_zmm registers of `right`
    __m512 right_row[n_reg_zmm];
    for (int c = 0; c < n_reg_zmm; c++) {
      right_row[c] = _mm512_load_ps(right + i * ldb + c * 16);
    }

    // Actual matmul
    for (int r = 0; r < m_reg; r++) {
      __m512 el = _mm512_set1_ps(left[r * lda + i]);

      for (int c = 0; c < n_reg_zmm; c++) {
        acc[r][c] = _mm512_fmadd_ps(el, right_row[c], acc[r][c]);
      }
    }
  }

  // Move registers into memory
  for (int r = 0; r < m_reg; r++) {
    for (int c = 0; c < n_reg_zmm; c++) {
      _mm512_store_ps(result + r * ldc + c * 16, acc[r][c]);
    }
  }
}
```

This is known as the **microkernel**.

Since we have limited registers, we will subdivide the matrix into smaller dimensions $n_{reg}$, $m_{reg}$ and $k_{cache}$ that the microkernel can use.[^17]

By using more registers, we can break through the 2 loads/cycle limit and start doing more FMAs per load. Each iteration of our inner loop needs to load $n_{reg} / 16$ zmm registers, after which we do $m_{reg}$ loads and $m_{reg} \times n_{reg}$ FMAs. So our loads/FMA is really $\frac{n_{reg} + m_{reg}}{m_{reg} \times n_{reg}}$, and as long as that number is $<1$, we're not being limited. This is also known as the **arithmetic intensity**, which is a useful metric to know when our kernel is becoming more and more compute bound.

In addition, since it takes 4 cycles of latency (meaning we need to wait 4 cycles before performing another FMA to accumulate on a single register of a register tile), we need $m_{reg} \times n_{reg}$ to be greater than 8 (4 cycles of latency @ 2 FMA/cycle).[^30] Pretty much any sensible value we pick will hit this threshold, but it's something I thought would be interesting to mention.

Since we have only 32 registers, we need to be careful of our $m_{reg}$ and $n_{reg}$ values. The register tile uses $m_{reg} \times n_{reg}$ registers, and we need to load in a full $n_{reg}$ zmm registers for a column, and at least one register for the broadcasting. So in total, we need $(m_{reg}+1) \times n_{reg} + 1$ registers.

We're going to use 8 x 32 tiles because it divides easily into 1024, and I don't want spill-over handling complicating the code (not as interesting IMO)[^22]

So now all that remains is to subdivide our 1024 matrix into strips of 8 and columns of 32, and loop across those.

![An m_reg tall strip of A times an n_reg wide strip of B, giving one m_reg by n_reg tile of C](/matmul/register-tiling.webp)

Here's what the code looks like:

```cpp
void register_tiling(int M, int N, int K, const float *A, const float *B,
                     float *C) {
  constexpr int m_reg = 8;
  constexpr int n_reg = 32;

  for (int c = 0; c < N; c += n_reg) {
    for (int r = 0; r < M; r += m_reg) {

      register_accumulator<m_reg, n_reg / 16>(K, A + r * K, K, B + c, N,
                                                      C + r * N + c, N);
    }
  }
}
```

## Tiling & Blocking

The small $m_{reg}, n_{reg}$ accumulator we have created is called the **microkernel**. Those 2 loops around the microkernel is called the **macrokernel**.

The microkernel is highly optimized, but once again, it depends on our memory bandwidth to keep supplying it with enough data to saturate those FMAs.

```cpp
for (int i = 0; i < k_cache; i++) {
	// Load n_reg_zmm registers of `right`
	__m512 right_row[n_reg_zmm];
	for (int c = 0; c < n_reg_zmm; c++) {
	  right_row[c] = _mm512_load_ps(right + i * ldb + c * 16);
	}
	
	// Actual matmul
	for (int r = 0; r < m_reg; r++) {
	  __m512 el = _mm512_set1_ps(left[r * lda + i]);
	
	  for (int c = 0; c < n_reg_zmm; c++) {
		acc[r][c] = _mm512_fmadd_ps(el, right_row[c], acc[r][c]);
	  }
	}
}
```

So per k-step, we load $n_{reg} + m_{reg}$ floats. Each step, we perform $n_{reg} \times m_{reg}$ FMAs.

At $n_{reg}$ = 32, $m_{reg}$ = 8, we load $160\, \text{bytes} / 8\, \text{cycles} = 20\, \text{bytes} / \text{cycle} = 98\, \text{GB/s}$ per core. This far exceeds DRAM at a theoretical peak of 90 GB/s for all 16 cores, which is something like ~5 GB/s per core.[^11]

This means that we need to optimize our macrokernel's data to fit into cache, which could handle our bandwidth needs. However, we still have to consider cache sizes. When the matrices get bigger, we need to start working on small sub-matrices that we can fit into cache at a time. We'll call these sub-matrices "tiles"[^10]. This technique of working on smaller sets to accomodate for cache sizes is called **tiling** or **blocking**.

And since our implementations are getting faster, we can bump up to 4096 x 4096 matrices. This also would expose any flaws in our tiling, as our previous 1024 x 1024 matrices needed 4MB of RAM each (12MB total), which would easily fit in L3 cache. 4096 x 4096 matrices consume 64 MB each, and 192MB would easily blow through all caches.

The first unbounded dimension we have is $K$, which we use in the microtile. Now that we have a bigger matrix, look at how our cache behaviors change:

![The column of B doesn't fit. We miss, and then the elements we're about to read get evicted to make room](/matmul/b-panel-eviction.webp)

Our register tiling splits B into tiles of 32 by $K$, where $K$ is the inner dimension of the matrix, meaning it can be arbitrarily large. The issue that occurs is that our cache doesn't have enough space to put all the tile of B. Since caches work on an LRU-ish (least recently used policy), it will start evicting the elements we haven't visited in a while - which are actually the elements we are about to visit! This causes a lot of misses, which will require fetching from slower memory. Since this is the hottest (innermost) loop, a cache miss here would be significant.

Instead, we can introduce a tiling factor. We'll call this $k_{cache}$, and we'll split the blocks into size of $k_{cache}$

![Splitting k into k_cache blocks, so we hold a smaller piece of B and reuse it down the rows of A](/matmul/k-cache-tiling.webp)

And now, we only load a smaller segment of the entire column and we can reuse that, as we stride down the rows of A.

Note that this comes at the cost of no longer having all of C in a register, instead, C will have to be updated $K \div k_{cache}$ times.

However, let's zoom out to our macrokernel. Similarly, our $M$ and $N$ are not bounded. And since we upgraded our size to 4096 x 4096, we face this problem:
![Small matrices fit in cache. At 4096 they don't, so the microkernel stalls fetching from DRAM at ~90 GB/s](/matmul/cache-overflow-dram.webp)

So we can apply that K-tiling approach on both $M$ and $N$, to achieve full 2D-tiling
![Tiling both ways. A in m_cache by k_cache blocks, B in k_cache by n_cache, register tiles inside](/matmul/full-2d-tiling.webp)

This way, everything is in cache. We now have to determine what order to loop through the tiles in (remember, order matters!) and pick the right values for $m_{cache}, n_{cache}, k_{cache}$. But how?

## Not All Cache Is Equal

First, we have to understand that cache isn't one-size-fits-all. The faster the cache, the less dense it is, and the more precious die space it wastes. So CPUs split them up into 3 tiers, L1d[^6], L2, L3, each having worse bandwidth & latency than the previous, but more capacity. L1 and L2 are per-core, while L3 is shared between each CCD[^12]

| Cache Level | Amount                                     |
| ----------- | ------------------------------------------ |
| Registers   | 32 zmm (512-bit) registers, totaling 2048B |
| L1d         | 48KB                                       |
| L2          | 1MB                                        |
| L3          | 32MB                                       |

Keep in mind cache behavior: anytime you access memory, it first looks at L1. If that misses it goes to L2, then L3, and then finally DRAM. Anything that gets pulled will always end up in L1 cache, which is important to consider for later.

## Cache Derivation from Scratch

Look at our macrokernel loop:

```cpp
for (int c = 0; c < N; c += n_reg) {
	for (int r = 0; r < M; r += m_reg) {

	  register_accumulator<m_reg, n_reg / 16>(K, A + r * K, K, B + c, N,
													  C + r * N + c, N);
	}
}
```

If we look at our macrokernel's inner loop. We pick a column, and then loop through ALL the rows, performing the microkernel. What's happening is we are reusing one strip, while streaming (using, discarding, moving onto the next) across the entire other matrix.

![The same micropanel of B stays in L1 while we stream m_reg strips of A through it](/matmul/macrokernel-b-in-l1.webp)

Consider two possible implementations. We can swap which one belongs on the outer loop. But which is better?

```txt
loop n / n_reg times:
	// B microtile in L1 cache, reuse across inner loop
	loop m / m_reg times:
		// Stream through the A microtile
		read m_reg * k floats
```

```txt
loop m / m_reg times:
	// A microtile in L1 cache, reuse across inner loops
	loop n / n_reg times:
		// Stream through the B microtile
		read n_reg * k floats
```

Since we're reusing the data, its best we keep it in the fastest possible cache, the L1, because it will make subsequent reads fast. However, we stream the other piece, meaning that it should go in a _slower level_.

They both loop the same amount of times (order doesn't change that), but we read different _amounts_ of floats depending on how we loop. And memory bandwidth is a problem for us, we want to choose the loop that minimizes the amount of streams. Since our $m_{reg} \ll n_{reg}$, we should choose **columns** as the outer loop, and **rows** as the inner loop. Another way of thinking about this is that we are forced to re-read either A or B. Since $n_{reg}$ = 32 and $m_{reg}$ = 8, we have to do less re-reads when striding by 32's. In general, since $n_{reg}$ has to be a multiple of 16, due to AVX512, it will very likely end up bigger.

So which tier of memory should A go into?

Let's continue work our way bottom up. Look at the very outer loop: when we get to the next micro-column, we repeat the loop across all rows. We see that the A macrotile is being reused, so it should actually go in the L2 cache.

![One level out. The whole A macrotile sits in L2 and gets reused across B's micropanels](/matmul/macrokernel-a-in-l2.webp)

So that's how we derived the two loops here:

```cpp
for (int c = 0; c < N; c += n_reg) {
	for (int r = 0; r < M; r += m_reg) {
	  register_accumulator<m_reg, n_reg / 16>(K, A + r * K, K, B + c, N,
													  C + r * N + c, N);
	}
}
```

Loop over $M$ to keep the B microtile reused, and then loop over $N$ to keep the A macrotile reused.

Now stepping out into the full kernel. Since our internal loop has already read the entire B panel, it would make sense to continue reusing it. So we put the B macrotile in L3 cache.
![The whole thing. A macrotile in L2, B panel in L3 with its micropanel in L1, C out in DRAM](/matmul/full-kernel-memory-tiers.webp)

So that means the next level should once again, loop across rows.

```cpp
for (int rc = 0; rc < M; rc += m_cache) {
	// Macrokernel
	for (int c = cc; c < cc + n_cache; c += n_reg) {
		for (int r = rc; r < rc + m_cache; r += m_reg) {

		// Microkernel
		register_accumulator<m_reg, n_reg / 16>(
			k_cache, left + r * K + kc, K, right + kc * N + c, N,
			result + r * N + c, N);
		}
	}
}
```

Now for the final two layers. Should we loop $k_{cache}$ or $n_{cache}$ next?
![n_cache inner moves the C tile every iteration. k_cache inner keeps landing on the same one](/matmul/loop-order-options.webp)

Looping over $k_{cache}$ will allow us to reuse a C panel, which may to prove to be useful. It also allows for better parallelism (which we'll see later!)[^23]

Here's another view of how the caching works, courtesy of ["Analytical Modeling Is Enough for High-Performance BLIS"](https://dl.acm.org/doi/epdf/10.1145/2925987)
![The BLIS paper's version. Registers up top, B_r in L1, A_c in L2, B_c in L3, full matrices in memory](/matmul/blis-data-movement.webp)

Here's what the final code looks like:

```cpp
#include "impls.hpp"

void full_tiling(int M, int N, int K, const float *left, const float *right,
                 float *result) {
  constexpr int m_reg = 8;
  constexpr int n_reg = 32;

  constexpr int m_cache = 1024;
  constexpr int n_cache = 4096;
  constexpr int k_cache = 256;

  for (int cc = 0; cc < N; cc += n_cache) {
    for (int kc = 0; kc < K; kc += k_cache) {
      for (int rc = 0; rc < M; rc += m_cache) {

        // Macrokernel
        for (int c = cc; c < cc + n_cache; c += n_reg) {
          for (int r = rc; r < rc + m_cache; r += m_reg) {

            // Microkernel
            register_accumulator<m_reg, n_reg / 16>(
                k_cache, left + r * K + kc, K, right + kc * N + c, N,
                result + r * N + c, N);
          }
        }
      }
    }
  }
}
```

## Optimizing the parameters

So how did I choose the `m_cache`, `k_cache` and `n_cache`? Let's summarize the values we have.

| Memory Tier | What's in it                                                                                                                                     | Size             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Registers   | The accumulator tile of size m_reg x n_reg, row of B in registers                                                                                | 32 zmm registers |
| L1d         | B micropanel of size k_cache x n_reg<br>A micropanel will be streamed here, account for it<br>C will also be passed through here as it's written | 48KB             |
| L2          | A panel: m_cache x k_cache                                                                                                                       | 1MB              |
| L3          | B panel: $k_{cache}$ x $n_{cache}$                                                                                                               | 32MB             |
| DRAM        | Full A, B                                                                                                                                        | Irrelevant       |

For L1d, it'd make sense we want to pick a k_cache that maximizes the space.[^31] 

So $k_{cache}$ can be as high as $\frac{48\,\text{KB}}{32\,\text{floats} \times 4\,\text{B}} = 384$. We'll pick 256 as it divides cleanly.

So $m_{cache}$ can be $\frac{1\,\text{MB}}{256\,\text{floats} \times 4\,\text{B}} = 1024$. 

So $n_{cache} = \frac{32\,\text{MB}}{256\,\text{floats} \times 4\,\text{B}} = 32768$. 

We'll go with these numbers, and then implement an auto-tuner at the end when we have the remaining optimizations in place. We'll see that reasoning analytically doesn't always give us the performance we expect!

## Just pack it up...

A brief dive into how caches really work.

Throughout the entire optimization, we have been ignoring a critical property of caches: that they're not **fully associative**. Let me define what that means.

Caches need some way to know which line refers to which memory address so that they can retrieve it later. On one end, you have direct-mapped, where a memory addresses must belong in a "slot"[^13]. My diagrams will show decimal addresses, but computer addresses are usually expressed in hexadecimal. 
![Direct mapped. Every address gets exactly one slot, decided by its last digits](/matmul/cache-direct-mapped.webp)

This approach is very simple to look up (just a modulo), but has a severe problem: conflicting addresses overwrite each other. If you're dealing with only addresses that map to the same slot[^14] you end up not using much of your cache.

On the other end, you have **fully associative**, which means any address can go anywhere.
![Fully associative. Any address can go anywhere, but now you have to search every slot](/matmul/cache-fully-associative.webp)

But now searching requires looking through every cache line, which is O(n). So in order to hide the latency, hardware would need to do all O(n) comparisons in parallel, which would a) be huge power consumption and b) probably impossible with that many lines.

So modern hardware settled on the middle-ground, set associativity. The cache is sectioned off within directly mapped blocks, called **sets**, but within each set, it is fully associative. The number of distinct addresses a set can store is called the number of **ways**. It can also be called N-way associative cache, where N is the number of ways.

![N-way set associative. Columns are the sets picked by the address, rows are the ways](/matmul/cache-set-associative.webp)

So now a search can narrow down to a set, and then run the O(ways) comparison in parallel. This allows for some amount of conflicting addresses.

For my machine,

```sh
> lscpu -C
NAME ONE-SIZE ALL-SIZE WAYS TYPE        LEVEL  SETS PHY-LINE COHERENCY-SIZE
L1d       48K     768K   12 Data            1    64        1             64
L1i       32K     512K    8 Instruction     1    64        1             64
L2         1M      16M   16 Unified         2  1024        1             64
L3        32M      64M   16 Unified         3 32768        1             64
```

And here's the problem: with 64 sets at a line of 64B, that means every address 4096 bytes apart belong in the same set. So every time we go down a column in our 4096x4096 matrix, we're actually striding down 4 x 4096 bytes. So despite being completely different addresses, they'd end up in the same set and constantly evict each other, leaving the rest of the 63 sets untouched.

The solution? To copy the data into a scratch buffer, which would hide the ugly multiple-of-4096-byte stride. Sounds counterintuitive and seems to be a waste of time, but is genuinely worth it given how much faster the cache is. Matrix multiplication is also a special problem, since it's $n^3$ ops on $n^2$ data, it is worth this copying.[^15]

![Packing. Elements that were 4096 apart end up right next to each other in the scratch buffer](/matmul/packing-scratch-buffer.webp)

```cpp
void full_tiling_packing(int M, int N, int K, const float *A, const float *B,
                         float *C) {
  constexpr int m_reg = 8;
  constexpr int n_reg = 32;

  constexpr int m_cache = 512;
  constexpr int n_cache = 1024;
  constexpr int k_cache = 256;

  float *packA = (float *)aligned_alloc(64, m_cache * k_cache *
                                                sizeof(float));
  float *packB = (float *)aligned_alloc(64, k_cache * n_cache *
                                                sizeof(float));

  for (int cc = 0; cc < N; cc += n_cache) {
    for (int kc = 0; kc < K; kc += k_cache) {

      // Pack everything into packB
      int idx = 0;
      for (int j = kc; j < kc + k_cache; j++) {
        for (int i = cc; i < cc + n_cache; i++) {
          packB[idx] = B[j * N + i];
          idx++;
        }
      }

      for (int rc = 0; rc < M; rc += m_cache) {

        // Pack everything into packA
        int idx = 0;
        for (int i = rc; i < rc + m_cache; i++) {
          for (int j = kc; j < kc + k_cache; j++) {
            packA[idx] = A[i * K + j];
            idx++;
          }
        }

        // Macrokernel
        for (int c = cc; c < cc + n_cache; c += n_reg) {
          for (int r = rc; r < rc + m_cache; r += m_reg) {

            // Microkernel
            register_accumulator<m_reg, n_reg / 16>(
                k_cache, packA + (r - rc) * k_cache,
                k_cache, packB + (c - cc), n_cache, C + r * N + c,
                N);
          }
        }
      }
    }
  }

  free(packA);
  free(packB);
}
```

However, there's one more consideration to make. Look at our access patterns within each macrotile. A's microtile is still not sequential, so we should pack each one column-major (transposed form). The B microtile still suffers from a column stride, so we should pack block by block. Essentially, we pack in the order of accesses to play nice with the prefetcher and cache line sizes. [^18]

![We pack in the order the microkernel reads. Across k_cache for A, down k_cache for B](/matmul/packing-order.webp)

It makes the code look like this:

```cpp
#include "impls.hpp"
#include <cstdlib>

void packing_sequential(int M, int N, int K, const float *left,
                        const float *right, float *result) {
  constexpr int m_reg = 8;
  constexpr int n_reg = 32;

  constexpr int m_cache = 512;
  constexpr int n_cache = 1024;
  constexpr int k_cache = 256;

  float *packA = (float *)aligned_alloc(64, m_cache * k_cache *
                                                sizeof(float));
  float *packB = (float *)aligned_alloc(64, k_cache * n_cache *
                                                sizeof(float));

  for (int cc = 0; cc < N; cc += n_cache) {
    for (int kc = 0; kc < K; kc += k_cache) {

      // Pack everything into packB
      int idx = 0;
      for (int block = 0; block < n_cache; block += n_reg) {
        for (int j = 0; j < k_cache; j++) {
          for (int i = 0; i < n_reg; i++) {
            packB[idx] = right[(j + kc) * N + (i + cc + block)];
            idx++;
          }
        }
      }

      for (int rc = 0; rc < M; rc += m_cache) {

        // Pack everything into packA
        for (int block = 0; block < m_cache; block += m_reg) {
          for (int i = 0; i < m_reg; i++) {
            for (int j = 0; j < k_cache; j++) {
              packA[block * k_cache + j * m_reg + i] =
                  left[(i + rc + block) * K + (j + kc)];
            }
          }
        }

        // Macrokernel
        for (int c = cc; c < cc + n_cache; c += n_reg) {
          for (int r = rc; r < rc + m_cache; r += m_reg) {

            // Microkernel
            register_accumulator_sequential<m_reg,
                                            n_reg / 16>(
                k_cache, packA + (r - rc) * k_cache,
                m_reg, packB + (c - cc) * k_cache,
                n_reg, result + r * N + c, N);
          }
        }
      }
    }
  }

  free(packA);
  free(packB);
}
```

and we also have some minor changes in the microkernel. But now its sequential access!

```cpp
template <int m_reg, int n_reg_zmm>
inline void register_accumulator_sequential(int k_cache, const float *left,
                                            const int lda, const float *right,
                                            const int ldb, float *result,
                                            const int ldc) {
  __m512 acc[m_reg][n_reg_zmm];

  // Fill registers with the result
  for (int r = 0; r < m_reg; r++) {
    for (int c = 0; c < n_reg_zmm; c++) {
      acc[r][c] = _mm512_load_ps(result + r * ldc + c * 16);
    }
  }

  for (int i = 0; i < k_cache; i++) {

    // Load n_reg_zmm registers of `right`
    __m512 right_row[n_reg_zmm];
    for (int c = 0; c < n_reg_zmm; c++) {
      right_row[c] = _mm512_load_ps(right + i * ldb + c * 16);
    }

    // Actual matmul
    for (int r = 0; r < m_reg; r++) {
      __m512 el = _mm512_set1_ps(left[i * lda + r]);

      for (int c = 0; c < n_reg_zmm; c++) {
        acc[r][c] = _mm512_fmadd_ps(el, right_row[c], acc[r][c]);
      }
    }
  }

  // Move registers into memory
  for (int r = 0; r < m_reg; r++) {
    for (int c = 0; c < n_reg_zmm; c++) {
      _mm512_store_ps(result + r * ldc + c * 16, acc[r][c]);
    }
  }
}

```

## Work Sharing

My 9950X has 16 cores, and right now our implementations are only using 1 of them. Multithreading has its own traps: since we're sharing memory across threads, we need a way to divide up the work to avoid race conditions.

The easiest way is to divide up work in a way so that they'll only touch their section of C, so no locking + atomics are needed. We can choose to split work up through the rows or the columns:
![Splitting C by rows gives each thread a slice of A and all of B. By columns it's the other way around](/matmul/thread-split-rows-cols.webp)

However, this choice is actually forced onto us! Look at how my cache is configured
![Same topology again. The two dies each have their own 32MB L3, not one shared cache](/matmul/topology-lstopo-l3.webp)

L3 is **shared** cache, our `packB` needs to be shared through all cores. So we're forced to do the multithreading across rows, since our `packB` is determined by our column & k indexes.[^19] [^20]

We'll use [OpenMP](https://www.openmp.org/) to easily parallelize the regions.

```cpp
#include "impls.hpp"
#include <cstdlib>

void parallel(const int M, const int N, const int K, const float *left,
              const float *right, float *result) {
  constexpr int m_reg = 8;
  constexpr int n_reg = 32;

  constexpr int m_cache = 32;
  constexpr int n_cache = 2048;
  constexpr int k_cache = 1024;

  float *packB = (float *)aligned_alloc(64, k_cache * n_cache *
                                                sizeof(float));

#pragma omp parallel num_threads(16)
  {
    float *packA = (float *)aligned_alloc(64, m_cache * k_cache *
                                                  sizeof(float));

    for (int cc = 0; cc < N; cc += n_cache) {
      for (int kc = 0; kc < K; kc += k_cache) {

#pragma omp for
        // Pack everything into packB
        for (int block = 0; block < n_cache; block += n_reg) {
          for (int j = 0; j < k_cache; j++) {
            for (int i = 0; i < n_reg; i++) {
              packB[block * k_cache + j * n_reg + i] =
                  right[(j + kc) * N + (i + cc + block)];
            }
          }
        }

#pragma omp for
        for (int rc = 0; rc < M; rc += m_cache) {

          // Pack everything into packA
          for (int block = 0; block < m_cache;
               block += m_reg) {
            for (int i = 0; i < m_reg; i++) {
              for (int j = 0; j < k_cache; j++) {
                packA[block * k_cache + j * m_reg + i] =
                    left[(i + rc + block) * K + (j + kc)];
              }
            }
          }

          // Macrokernel
          for (int c = cc; c < cc + n_cache; c += n_reg) {
            for (int r = rc; r < rc + m_cache; r += m_reg) {

              // Microkernel
              register_accumulator_sequential<m_reg,
                                              n_reg / 16>(
                  k_cache, packA + (r - rc) * k_cache,
                  m_reg, packB + (c - cc) * k_cache,
                  n_reg, result + r * N + c, N);
            }
          }
        }
      }
    }
    free(packA);
  }
  free(packB);
}
```

We hoist the B block since all threads are meant to share it. We also wrap our entire kernel in a `#pragma omp parallel num_threads(16)`. This allows us to have OpenMP spawn the threadpool once and reuse it for the entire kernel.

Some important things to point out:

```cpp
#pragma omp for
// Pack everything into packB
for (int block = 0; block < n_cache; block += n_reg) {
  for (int j = 0; j < k_cache; j++) {
	for (int i = 0; i < n_reg; i++) {
	  packB[block * k_cache + j * n_reg + i] =
		  right[(j + kc) * N + (i + cc + block)];
	}
  }
}
```

We run packing in parallel as well! Yes, DRAM can run at 90 GB/s, but that number is not per-core. We can only reach top speeds if every single core is working on it, which is why we parallelize this operation too.

Also - I explicitly set it to `num_threads(16)`? But why not 32, which is the number of "logical processors" every performance monitor says report I have? [Simultaneous multithreading](https://en.wikipedia.org/wiki/Simultaneous_multithreading) splits each core into two threads, which allows for better utilization when the other thread is stalling for memory. But if we used it, it would fight with our cache lines (two different tiles would be assigned to one physical CPU core with only one set of L1/L2) and we only have 2 physical units for doing FMAs which are now contested between threads. 

Due to multithreading - our parameters have to change. $m_{cache}$ should be less than `4096 / 16 = 256` so that each of the 16 threads has work to do. Here, multithreading beats slightly better cache utilization.

## Analytical vs Empirical Tuning

However, the parameters we were using this whole time are purely analytical. It's important to benchmark the actual results. I made Google Benchmark sweep over the entire valid range of parameters for 4096x4096 matrices.[^24]

![The sweep. Best is 4098 GFLOPS at m_cache 32, n_cache 2048, k_cache 1024, circled](/matmul/blocking-sweep.webp)

Seems like the best values are actually with a $k_cache$ of greater than 256, which our analysis doesn't predict! Previously, I mentioned that the C matrix will have to be touched $K \div k_{cache}$ times. So perhaps the model is optimizing for that. Another thing I didn't consider was putting the B micropanel in L2. It is also technically streaming, as it's reused value lives in registers. And L2 is still fast enough to stream to our microkernel without any delays, so the model likely bumped it up to reduce the amount of $K \div k_{cache}$  extra touches to the C matrix.

$m_{cache}$ being < 256 doesn't necessarily surprise me. At that stage, we are no longer worrying about fitting in cache but how well we can parallelize. What was interesting, is that the model chose smaller values.

We can use the tool `perf record` and `perf report` to record where our time is spent - in the microkerenel, where the actual math is happening, or somewhere else. 


```text
> perf record ...
> perf report
Samples: 238K of event 'cpu/cycles/Pu', Event count (approx.): 304030194765
Overhead  Command  Shared Object         Symbol
  81.93%  benches  benches               [.] void register_accumulator_sequential<8, 2>(int, float const*, int, float const*, int, float*, int) [clone .constprop.0]
   9.10%  benches  benches               [.] void parallel_autotune<8, 32>(int, int, int, float const*, float const*, float*, int, int, int) [clone ._omp_fn.0] [clone .constprop.0]
   8.23%  benches  libgomp.so.1.0.0      [.] 0x0000000000025e52
```

What's happening in parallel autotune that's taking up so much time? Our packing routine. Let's see how this is affected depending on cache:

| m_cache | Packing time | packA (KB) | packB (KB) |
| ------- | ------------ | ---------- | ---------- |
| 16      | 8.98%        | 64         | 8192       |
| 32      | 9.10%        | 128        | 8192       |
| 64      | 11.14%       | 256        | 8192       |
| 128     | 12.53%       | 512        | 8192       |
| 256     | 15.17%       | 1024       | 8192       |

_with k_cache=1024, n_cache=2048_

It seems that we're spending less time in the microkernel (doing actual math) and more time in the parallel_autotune. That either means a) our microkernel is getting slower or b) our packing is taking longer. And it likely has to do with our caches slowing down our microkernel. But as I mentioned now, our model no longer is exclusively holding L2 for packA, it's also holding the microtiles. So it ends up being forced into L3. And we can see the jump from 128 -> 256 is huge (relative to the other, incremental jumps), because likely, the A panel is forced into some parts of L3.

Lastly, the biggest surprise was why it chose $n_{cache}$ = 2048 and not 4096. My theory is that at lower levels, we're actually re-using the C panel across the k / k_cache! [^25]
![The narrow C macrotile is still cached when we come back. The wide one got evicted](/matmul/c-macrotile-reuse.webp)

To see if this is true, we'll measure 3 key statistics: instructions per cycle (IPC), L3 miss % and DRAM access. Instructions per cycle would show us any stalls in the execution pipeline (which will likely be the result of a cache miss). L3 Miss % and DRAM access will show us if there's any trend in how L3 is used.

Measuring with `perf stat -e cycles,instructions,ls_any_fills_from_sys.local_ccx,ls_any_fills_from_sys.dram_io_near`[^26]

| n_cache | IPC | L3 miss % | DRAM / it |
| ------- | --- | --------- | --------- |
| 1024    | 2.7 | 30.03%    | 5067499   |
| 2048    | 2.7 | 28.43%    | 4438079   |
| 4096    | 2.5 | 32.50%    | 5859488   |

We can see a pattern: it hits a cliff at 4096 and drops. It starts missing much more L3 caches, and starts fetching from DRAM more, which points to the original theory.

This just goes to show the limits of analytical modeling and how it's important to test your findings! Being able to try every parameter allows our kernel to test different configurations of where items go in cache, which we might have never though about. 

## Conclusion

We got to 4120 GFLOPS, which is 103% of what OpenBLAS can do!

Matrix multiplication is a fun exercise for exploring concepts about cache, memory behaviors, and fancy SIMD instructions.

To truly turn these into a GEMM library, there are thousand more factors we have to consider. Our writeup dealt with a fixed size but for a true, performant library they have to look at:

1. Handle weird dimensions that aren't a multiple of the cache dimensions (we cheated a bit here)
2. Actually implement the `C = alpha * A @ B + beta * C` functionality of GEMM (we skipped this for simplicity of code)
3. Is thread spawn + join worth it for the size? Or should it be single-threaded
4. Is packing worth it for the size of the matrixes?
5. What should the values of `m_reg` and `n_reg` be for this specific microarch?
6. What should the values for `m_cache`, `n_cache`, `k_cache` be for specific CPUs and the specific matrix sizes?
7. Consideration for another tier of memory - NUMA remote access, for servers that have multiple CPU sockets on one board. 

As you can see, a lot of these questions are also based on the dimensions of the operands, the microarchitecture, differences between cache sizes, NUMA configurations. Making a BLAS library isn't easy.

Thanks for reading!

## Resources

- https://siboehm.com/articles/22/Fast-MMM-on-CPU: The inspiration
- https://dl.acm.org/doi/epdf/10.1145/2925987: This paper serves as most of the backbone for the 5-loop structure
- https://excalidraw.com/: For the visuals!
- All source code is available on [Github](https://github.com/GuyOnWifi/matmul-from-scratch)

[^2]: Desktop chips genuinely can run fast, and my system uses features like PBO to unlock power consumption and undervolts if you're curious how I can sustain these clocks. Datacenter chips that are probably better suited to run these kinds of computation workloads will have an insane amount of cores at the expense of clock speeds ![Clock and temperature under load, holding a mean of 4.93 GHz](/matmul/clock-and-temperature.webp)


[^4]: Why do we use a float for an accumulator and only update the matrix at the end? This allows us to use a register to store our results, and only write to memory once its done. Foreshadowing for later... :)

[^5]: Sequential access patterns will come up as a theme a lot for optimization.

[^6]: L1 cache is split up into the instruction and the data cache. Yes, memory is so slow even the CPU instructions in memory have to be cached or it would stall at 5GHz

[^7]: This contradicts the sequential memory rule I was talking about earlier, but theres an optimization we'll do later down the line to turn it back to sequential. Right now, being able to do more than 1 FMA/cycle will be much faster than any cache level speed up we can get.

[^10]: Or also referred to as blocks.

[^11]: 6000 MT/s

[^12]: The 9950x is made up of 2 separate dies, called Core Complex Die, stitched together. It seems that they cannot share the L3 cache between CCDs ([source](https://chipsandcheese.com/i/149874021/core-to-core-latency))

[^13]: Implemented using modular arithmetic

[^14]: for instance, in specific 2D array sizes where each column would map to the same "block"

[^15]: After all, copying is a read + write. So as long as we read from the packed data > 2 times, it's worth the cost

[^17]: We'll explain why this is called k_cache and not k_reg later. But notice that register count doesn't depend on k_cache at all, since we loop across it

[^18]: Don't forget that even though the A and B macrotile are in L2 and L3, they still will be fetched into L1 anyways. This will definitely be a less significant improvement than caching from DRAM, but it is still worth noting.

[^19]: Some readers will point out that there are technically 2x32MB L3 caches. I tried to multithread by splitting the columns to each individual CCD, and then rows within each CCD but I couldn't figure out how to get OpenMP to pin each thread to a specific core (or it genuinely might not actually be a speed up). I may revisit this in the future.

[^20]: Nonetheless, being able to schedule across hardware units is very useful for a good BLAS library. Like my CCDs splitting cache up, bigger compute farms feature multiple sockets (separate CPUs). Multi-socket boards also use the [Non-uniform memory access](https://en.wikipedia.org/wiki/Non-uniform_memory_access) design, meaning that it's actually very important to pin threads to a CPU, or you'd not only pay a cache miss but also a remote access penalty. This is because NUMA assigns RAM sticks to certain processors (their "local" memory), and any access to another processor's assigned RAM stick ("remote" memory) will have to travel across a slower, higher latency bus. My PC is certainly no HPC setup, so I don't have NUMA and can't test it besides renting a cloud VM. Also may be worth visiting in the future.

[^21]: Documentation has a latency of 4, but measured is 3. I'll assume 4 for worst-case.

[^22]: I also considered 4x64, but the performance was worse. Of course, the best implementations would use something like 12x32 to maximize register use. I assumed it wouldn't have made a huge difference since we're approaching the FMA/cycle limit, and the leftover row handling might actually make my code slower. But that's just analytical thinking. In the future if I ever revisit this, I will test this out.

[^23]: Spoiler: it's because paralleizing K will cause threads to access the same sections of `C`, which will be really bad for perfomance if we need to introduce atomics & locking.

[^24]: [Triton](https://triton-lang.org/main/python-api/generated/triton.autotune.html) does this, [cuBLAS](https://docs.nvidia.com/cuda/cublas/index.html#:~:text=CUBLAS%5FGEMM%5FAUTOTUNE) seems to be able to be configured for autotuning, [ATLAS](https://math-atlas.sourceforge.net/) is a project dedicated for this. Autotuning is pretty useful.

[^25]: Yes, it's not sequential memory but L3 has 32768 sets, so we don't have any strided-access problem. So no need to pack C.

[^26]: [Docs](https://lkml.org/lkml/2024/5/3/158). L3 miss % is calculated by doing dram_io_near / (dram_io_near + local_ccx), which calculates how many L3 misses divided by total L3 hits + misses. This is using the property that the CPU only fetches from DRAM if it can't find it in L3.

[^27]: You'll notice that OpenBLAS multi-threaded is here twice. The out-of-box configuration for some reason uses 27ish threads, which is way higher than my core count (16). Pinning them with taskset -c 0-15 (second entry) drastically improves performance, likely due to avoiding SMT from sharing a core. Technically we are 131% of OpenBLAS! But that doesn't feel like a fair comparison

[^28]: You'll notice that the single-threaded benchmarks achiever better performance than calculated. This is due to AMD chip's behavior of being able to boost clocks as long as it's not overheating. This only can work for brief times, in low-thread scenarios before power and thermal throttling kicks in. 

[^29]: All the code is in the [Github](https://github.com/GuyOnWifi/matmul-from-scratch)

[^30]: [Little's Law](https://en.wikipedia.org/wiki/Little%27s_law). in-flight work = latency x throughput. Meaning to achieve peak FMA/cycle, we want 8 FMAs in flight to "cover up" the fact that each takes 4 cycle

[^31]: Realistically, we should account for the A and C microtiles passing through the cache. We should reserve some space for them (specifically, a **way** each), but we'll implement auto-tuning later anyways, so some simple calculations should suffice.
