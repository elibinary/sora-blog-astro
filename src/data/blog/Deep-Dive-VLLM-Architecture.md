---
author: 鳄梨
pubDatetime: 2026-04-25T10:00:00+08:00
title: 从一块 GPU 显存出发：vLLM 架构深度剖析
draft: false
tags:
  - vLLM
  - LLM
  - GPU
description: 从显存稀缺这个根因出发，层层剥开 vLLM 的设计——PagedAttention、Continuous Batching、智能调度、OpenAI 兼容 API、多硬件适配，一整棵优化大树是如何长出来的。
---

# 从一块 GPU 显存出发：vLLM 架构深度剖析

---

## 引言：一切从显存稀缺开始

跑一个大语言模型，GPU 算力往往不是瓶颈——显存才是。

以 LLaMA-13B 为例，模型权重本身占用约 26 GB，而单个序列的 KV Cache（Key-Value 缓存）可以高达 1.7 GB。KV Cache 是 Transformer 推理的命脉：每一层 Attention 都需要存储之前所有 token 的键值对，避免重复计算。问题在于，传统系统管理 KV Cache 的方式极其粗暴——按最大上下文长度预分配连续显存，导致 60% 到 80% 的 GPU 显存被预留却从未使用。再加上碎片化，有效利用率雪上加霜。

vLLM 的起点，就是这个问题。2023 年 6 月，其首篇论文的标题直击要害：*"Efficient Memory Management for Large Language Model Serving with PagedAttention"*。但 vLLM 不只解决了显存问题——从显存稀缺这根树桩上，长出了吞吐量优化、智能调度、服务标准化、广度适配一整棵大树。

本文从外到内，层层剥开 vLLM 设计。

---

## 一、从使用出发：vLLM 的三种用法

在深入架构之前，先搞清楚 vLLM 对外提供了什么。

### 1.1 OpenAI 兼容 API Server

这是 vLLM 最核心的服务方式。一行命令启动：

```bash
vllm serve meta-llama/Llama-3.1-8B --host 0.0.0.0 --port 8000
```

启动后暴露 `/v1/chat/completions`、`/v1/completions` 等与 OpenAI 完全兼容的接口。任何支持 OpenAI API 的客户端只需改 `base_url` 即可对接，迁移成本几乎为零。底层使用 FastAPI + Uvicorn 构建，支持流式输出（SSE）、多模型服务、Token 认证等生产级特性。

### 1.2 离线推理

通过 Python API 直接在进程内调用，无需启动 HTTP 服务：

```python
from vllm import LLM
llm = LLM(model="meta-llama/Llama-3.1-8B")
outputs = llm.generate("Hello, world!")
```

适合批量推理、数据处理和测试场景，跳过了网络层，直接调用引擎核心。

### 1.3 Python SDK 嵌入

在应用代码中通过 vllm 包直接调用推理引擎，适合集成到已有系统或自定义服务框架。

---

## 二、服务层：vLLM 如何接入模型与暴露能力

### 2.1 模型接入流程

vLLM 接入一个模型的完整链路：

1. **模型发现**：启动时指定 HuggingFace 模型 ID（如 `meta-llama/Llama-3.1-8B`），vLLM 从 HF Hub 下载配置和权重
2. **架构识别**：读取 `config.json` 中的 `architectures` 字段，在模型注册表（`vllm/model_executor/models/`）中查找对应实现。当前支持 100+ 种架构
3. **权重加载**：通过 ModelLoader 将权重加载到 GPU。支持多种来源：HuggingFace 默认加载器、GGUF 量化格式、Tensorizer 序列化格式、BitsAndBytes 量化等
4. **角色适配**：同一个模型权重可以被适配为不同角色——`ForCausalLM` 默认走 generate（`/v1/chat/completions`），但加 `--runner pooling --convert embed` 可将其当作 Embedding 模型（`/v1/embeddings`）。一个 vLLM 实例只能跑一种角色

### 2.2 多模态能力

多模态是另一种机制。像 Llama-3.2-11B-Vision 或 Qwen2.5-VL 这种多模态模型，在同一个实例内通过同一个 `/v1/chat/completions` 路径同时处理文本和图像输入——这是模型本身的能力，不是 vLLM 的适配。而语音转录（如 Whisper）走独立的 `/v1/audio/transcriptions`，因为输入输出格式完全不同。

关键区分：**模型适配（Convert）是一模型一角色、启动时选定；多模态是同一路径混合处理、由模型能力决定。**

---

## 三、架构总览：四层结构与五大问题

### 3.1 五大核心问题

从显存稀缺这个根因出发，vLLM 要解决五个问题：

| 问题 | 核心机制 | 因果关系 |
|---|---|---|
| GPU 显存管理效率 | PagedAttention | 最直接——根因的解法 |
| 推理吞吐量最大化 | Continuous Batching + Chunked Prefill + Prefix Caching | 依赖显存管理先解决 |
| 调度与资源分配智能化 | 优先级调度 + Swap + 抢占 + 分离式预填充 | 依赖显存管理先解决 |
| 服务的标准化与兼容性 | OpenAI 兼容 API | 独立维度——解决"可用性" |
| 模型与硬件的广泛适配 | 多架构 + 多硬件后端 | 独立维度——解决"覆盖面" |

因果链：显存稀缺 → KV Cache 浪费 → 并发序列少 → GPU 空闲 → 吞吐低；显存稀缺 → 需要智能调度分配稀缺资源。显存管理是前提条件，吞吐量优化是结果放大器。

### 3.2 四层架构

V1 架构自上而下分为四层：

```
┌─────────────────────────────────────────┐
│  API 层（Entrypoints）                    │
│  FastAPI Server / CLI / LLM Python API   │
├─────────────────────────────────────────┤
│  引擎层（Engine）                         │
│  V0: LLMEngine + AsyncLLMEngine          │
│  V1: EngineCore(独立进程) + EngineClient   │
├─────────────────────────────────────────┤
│  调度层（Scheduler）                      │
│  请求队列 + 优先级 + 抢占 + Swap           │
├─────────────────────────────────────────┤
│  执行层（Worker + ModelRunner）           │
│  PagedAttention + KV Cache + CUDA Graph   │
└─────────────────────────────────────────┘
```

#### API 层

负责协议适配和请求预处理。三个入口对应三种用法：

- **API Server**：FastAPI + Uvicorn，处理 HTTP 请求，转化为内部 `EngineArgs` 格式。Chat 路由额外做 chat template 渲染和多模态输入解析
- **CLI**：命令行工具，直接构造 `EngineArgs`
- **LLM Python API**：`vllm.LLM` 类，在进程内直接调用引擎

#### 引擎层

V0 的 `LLMEngine` 和 `AsyncLLMEngine` 是单进程模型，引擎和 Worker 在同一进程内，通过方法调用交互。V1 将引擎核心（`EngineCore`）独立为子进程，API 进程通过 `EngineClient`（基于自定义 IPC 协议）与之通信。核心好处：API 进程挂掉不影响推理，推理进程的 GIL 不阻塞 API 响应。

#### 调度层

决定每个 iteration 处理哪些请求。核心数据结构是三个队列：

- **waiting**：新到达的请求，等待 prefill
- **running**：正在 decode 的请求
- **swapped**：被换出到 CPU 的请求

调度策略：先尝试恢复 swapped（swap in），再从 waiting 中加入新请求（prefill），剩余 slot 给 running 继续 decode。显存不足时抢占低优先级请求。

#### 执行层

Worker 负责模型加载和 forward pass。ModelRunner 根据 Scheduler 输出的 `SchedulerOutput` 构造输入张量，执行模型前向传播。关键技术：PagedAttention kernel、CUDA Graph、Chunked Prefill。

---

## 四、V1 架构演进：从单进程到分离式

V1 架构的核心变化是 EngineCore 独立进程化。这不是简单的进程拆分，而是重新定义了职责边界。

### 4.1 V0 的问题

V0 的 `AsyncLLMEngine` 使用 asyncio 管理并发，但引擎核心和 API 在同一进程。两个问题：

1. **GIL 竞争**：Python GIL 限制真正并行，API 处理和推理计算互相阻塞
2. **隔离性差**：API 异常可能拖垮推理，反之亦然

### 4.2 V1 的解法

V1 的 `EngineCore` 运行在独立子进程中，通过 `EngineClient` 通信：

- API 进程发送请求 → EngineCore 的消息队列
- EngineCore 每个调度 iteration 处理队列，执行 forward pass
- 结果通过共享内存或 IPC 回传

这种架构天然支持**多进程 API + 单进程 EngineCore** 的部署模式——多个 API 实例将请求发往同一个 EngineCore，充分利用 GPU。

---

## 五、显存管理：PagedAttention 与 BlockManager

### 5.1 核心思想

PagedAttention 借鉴操作系统虚拟内存的分页机制：

- **逻辑块与物理块分离**：每个序列的逻辑块（Logical Block）映射到物理块（Physical Block），但逻辑块不必连续
- **按需分配**：只在实际生成时才分配物理块，消除过度预留
- **写时复制的前缀共享**：多个请求共享相同的物理块（比如共享的系统提示），修改时才复制

### 5.2 BlockPool 的实现

`KVCacheBlock` 是核心数据结构：

- `block_id`：物理块编号
- `ref_cnt`：引用计数。共享前缀的多个请求引用同一物理块，ref_cnt > 1 时不被驱逐
- `block_hash`：块填满后计算的哈希值，用于前缀缓存匹配
- `prev_free_block` / `next_free_block`：双向链表指针，用于维护空闲块队列

`BlockPool` 管理所有物理块：分配时从空闲队列取出，释放时归还。前缀缓存命中时直接复用已有块，ref_cnt 递增。

### 5.3 前缀缓存（Prefix Caching）

`KVCacheManager.get_computed_blocks()` 的逻辑：新请求到达时，遍历其 prompt 的逻辑块，逐一计算 hash，在 BlockHashToBlockMap 中查找匹配。命中则直接复用，跳过这些 token 的 prefill 计算。

这在多轮对话和 RAG 场景中效果显著——相同的系统提示词只需计算一次。

---

## 六、吞吐量优化：让 GPU 跑满

显存管理解决了"能不能塞得下"的问题，吞吐量优化解决"塞下的序列能不能把 GPU 跑满"。

### 6.1 Continuous Batching

传统批处理等待 N 个请求凑齐后一起推理，短序列完成后 GPU 空闲等待最长序列。vLLM 的调度器在每个 forward pass（token 生成步）都动态调整批次：已完成的请求立即移出，新到达的请求立即加入。GPU 每个 iteration 都在做有用功。

反直觉但重要：在生产环境中，**Continuous Batching 对吞吐量的贡献大于 PagedAttention**。PagedAttention 解决的是"能不能塞得下更多序列"，Continuous Batching 解决的是"塞下的序列能不能把 GPU 跑满"。

### 6.2 Chunked Prefill

长 prompt 的 prefill 是计算密集型的，会长时间占用 GPU，阻塞其他请求的 decode。Chunked Prefill 将长 prompt 拆分成小块（由 `long_prefill_token_threshold` 控制），每个 iteration 只处理一小块，与 decode 混合调度。短请求不被长 prompt 饿死。

### 6.3 CUDA Graph

decode 阶段每个 iteration 计算量小但迭代次数多，CPU 端开销（构建计算图、分配内存、launch kernel）占比大。CUDA Graph 在 warmup 时"录制"一次 forward pass 的 GPU 操作序列，后续直接"回放"录好的图，跳过 CPU 开销。代价是需要为不同 batch size 分别录制。

---

## 七、调度智能化：显存稀缺下的取舍

当多个请求竞争有限的 GPU 资源时，调度器需要做取舍。

### 7.1 优先级调度与抢占

每个请求有 `priority` 字段。当显存不足无法调度新请求时，调度器会抢占低优先级的 running 请求（`scheduler.py` 中的 preempt 逻辑），释放其 KV Cache 块腾出空间。被抢占的请求回到 waiting 队列，等待重新调度。

### 7.2 KV Cache Swap 与 Offloading

当 GPU 显存不足以容纳所有请求的 KV Cache 时，vLLM 可以将不活跃的块换出到 CPU 内存（swap out），需要时重新加载（swap in）。对短序列，直接重算 KV Cache 可能比 swap 更快（recomputation）。

V1 进一步引入了系统化的 Offloading 机制（`v1/kv_offload/`），支持 CPU 内存和多种存储介质，比简单的 swap 更灵活。

### 7.3 分离式预填充（Disaggregated Prefilling）

最前沿的优化：实例 A 专门做 prefill（计算密集，需要大算力），实例 B 专门做 decode（显存密集，需要大 KV Cache）。A 做完 prefill 后通过 KV Connector 将 KV Cache 传给 B。这种分工让两类阶段各自在最合适的硬件上运行。

---

## 其他探索

以下内容本文未深入展开，但同样是 vLLM 的重要能力：

- **推测解码（Speculative Decoding）**：用小模型或 n-gram 预测多个 draft token，大模型一次验证，突破单 iteration 单 token 的限制。V1 支持 DraftModel、Ngram、Eagle、Medusa、SuffixDecoding 五种推测器
- **结构化输出（Structured Output）**：采样层面通过 grammar bitmask 强制约束输出格式（JSON Schema、正则等），支持 xgrammar、guidance、outlines、lm-format-enforcer 四种后端
- **LoRA 多租户支持**：同一基础模型同时服务多个 LoRA 适配器，调度器有 max_loras 约束，大幅降低多微调部署成本
- **分布式 KV Cache 传输（KV Connector）**：跨实例共享 KV Cache，支持 LMCache、Mooncake、NIXL、P2P、HF3FS 等多种后端，是分离式预填充的基础设施
- **V1 架构重写的全貌**：V1 不只是 EngineCore 独立进程，还重构了调度器统一化、异步调度、CUDA Graph 集成等，是一次从核心出发的全面重写

---

## 参考

1. vLLM 官方博客（https://vllm.ai/blog）
2. vLLM Github（https://github.com/vllm-project/vllm）
3. SOSP 2023 论文 *"Efficient Memory Management for Large Language Model Serving with PagedAttention"*
