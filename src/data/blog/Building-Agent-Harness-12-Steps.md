---
author: 鳄梨
pubDatetime: 2026-03-22T22:00:00+08:00
title: 拆解 Claude Code：12 步构建 Agent Harness
draft: false
tags:
  - AI
  - Agent
  - Claude Code
  - Harness Engineering
description: 从 0 到 1 拆解 Claude Code 的 12 层架构演进，每步只加一个机制，理解 Agent Harness 工程的核心设计模式。
---

> **The model is the agent. The code is the harness.**
> **Build great harnesses. The agent will do the rest.**

## 一、引言：为什么是 Claude Code？

2025 年，Anthropic 发布了 Claude Code —— 一个命令行 AI 编程助手。它没有训练自己的模型，只是给 Claude 造了一辆车。但就是这辆车，让 Claude 从聊天机器人变成了能独立干活的高级工程师。

这个项目的 GitHub 仓库收获了 **35.6k Stars** 和 **5.7k Forks**，不是因为它有多神秘，而是因为它足够坦诚：作者把整个 Harness 架构拆成了 **12 个渐进式的 session**，每个 session 只加一层机制，从最基础的循环开始，一步步叠加到完整的多 Agent 协作系统。

本文按 s01→s12 的顺序，带你从零实现一个生产级 Agent Harness。每步包含：
- **问题**：这步要解决什么
- **方案**：核心设计思路
- **代码**：关键实现片段
- **演进**：为什么这样设计

准备好了吗？我们从 50 行代码开始。

---

## 二、Phase 1：最小可运行 Agent（s01-s02）

### s01：The Agent Loop — 一个循环 + Bash

**问题**：如何用最少的代码让模型"动起来"？

很多 Agent 项目一开始就搞复杂的架构：事件总线、状态机、插件系统……但 Claude Code 的 s01 告诉我们：**先让轮子转起来**。

**核心代码**（简化版）：

```python
import anthropic

client = anthropic.Client(api_key=API_KEY)
TOOLS = [{
    "name": "bash",
    "description": "Execute a bash command",
    "input_schema": {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "The bash command to execute"}
        },
        "required": ["command"]
    }
}]

def run_bash(command):
    import subprocess
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    return result.stdout + result.stderr

messages = []  # 对话历史

while True:
    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=8192,
        messages=messages,
        tools=TOOLS
    )
    
    # 追加助手响应
    messages.append({"role": "assistant", "content": response.content})
    
    # 模型说完了，退出循环
    if response.stop_reason != "tool_use":
        break
    
    # 执行工具调用
    for block in response.content:
        if block.type == "tool_use":
            output = run_bash(**block.input)
            messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output
                }]
            })
```

**关键洞察**：

1. **循环属于 Agent**：模型决定何时调用工具、何时停止。代码只是执行者。
2. **Bash 是第一个工具**：有了 Bash，Agent 就能操作文件系统、运行程序、调用 API —— 整个数字世界都是它的工具。
3. **50 行代码 = 一个能干活的 Agent**：不需要框架，不需要插件系统，一个 `while True` 就够了。

**Motto**：*One loop & Bash is all you need*

---

### s02：Tool Use — 添加一个工具 = 添加一个 Handler

**问题**：如何扩展工具而不改核心逻辑？

s01 只有一个 Bash 工具。但真实场景需要：读写文件、搜索代码、访问数据库、控制浏览器……如果每加一个工具都要改 `while` 循环，代码很快就会失控。

**核心设计**：工具注册表模式

```python
# 工具处理器注册表
TOOL_HANDLERS = {
    "bash": run_bash,
    "read": read_file,
    "write": write_file,
    "edit": edit_file,
    "glob": glob_files,
    "grep": grep_content,
}

# 核心循环不变
while True:
    response = client.messages.create(model, messages, tools=ALL_TOOLS)
    messages.append({"role": "assistant", "content": response.content})
    
    if response.stop_reason != "tool_use":
        break
    
    results = []
    for block in response.content:
        if block.type == "tool_use":
            # 查表执行，不需要 if-else
            handler = TOOL_HANDLERS.get(block.name)
            if handler:
                output = handler(**block.input)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output
                })
    
    messages.append({"role": "user", "content": results})
```

**关键洞察**：

1. **核心循环零修改**：新增工具只需在 `TOOL_HANDLERS` 中注册。
2. **每个工具独立测试**：`read_file`、`write_file` 可以单独写单元测试。
3. **工具描述即文档**：每个工具的 `input_schema` 就是 Agent 的使用手册。

**Motto**：*Adding a tool means adding one handler*

---

## 三、Phase 2：规划与知识（s03-s06）

### s03：TodoWrite — 没有计划的 Agent 会迷失

**问题**：长任务中 Agent 容易忘记目标

让 Agent "重构这个项目的认证模块"，它可能写到一半就去修别的东西了。人类有 TODO 列表，Agent 也需要。

**核心实现**：

```python
class TodoManager:
    def __init__(self):
        self.todos = []
        self.next_id = 1
    
    def create(self, content, status="pending"):
        todo = {"id": self.next_id, "content": content, "status": status}
        self.todos.append(todo)
        self.next_id += 1
        return todo
    
    def complete(self, todo_id):
        for todo in self.todos:
            if todo["id"] == todo_id:
                todo["status"] = "completed"
                return todo
    
    def list_pending(self):
        return [t for t in self.todos if t["status"] == "pending"]
    
    def to_prompt(self):
        pending = self.list_pending()
        if not pending:
            return "No pending tasks."
        return "Pending tasks:\n" + "\n".join(f"- [ ] {t['content']}" for t in pending)

# 每轮对话前注入 TODO 状态
todo_manager = TodoManager()
messages.append({
    "role": "user",
    "content": f"Current plan:\n{todo_manager.to_prompt()}"
})
```

**关键洞察**：

1. **Agent 主动维护 TODO**：每完成一步，标记对应任务。
2. **每轮对话前读取待办**：确保 Agent 知道下一步该做什么。
3. **完成后自动标记**：形成闭环，避免重复劳动。

**Motto**：*An agent without a plan drifts*

---

### s04：Subagents — 大任务拆解，独立上下文

**问题**：复杂任务需要并行处理，但上下文会污染

"分析这个项目并写一份报告" —— 这种任务需要：
1. 阅读 README
2. 查看目录结构
3. 分析核心代码
4. 生成报告

如果所有步骤都在同一个 `messages[]` 里，后面步骤会被前面的细节淹没。

**核心设计**：

```python
class SubAgent:
    def __init__(self, role="assistant"):
        self.messages = []  # 独立上下文
        self.role = role
    
    def run(self, task):
        self.messages.append({"role": "user", "content": task})
        while True:
            response = client.messages.create(model, self.messages, tools=TOOLS)
            self.messages.append({"role": "assistant", "content": response.content})
            if response.stop_reason != "tool_use":
                return response.content  # 只返回最终结果
            # 执行工具...

# 主代理使用子代理
def analyze_project():
    subagent = SubAgent(role="analyst")
    result = subagent.run("分析这个项目的架构并总结")
    # 主对话保持干净，只接收结果
    return result
```

**关键洞察**：

1. **子代理 = 全新 Agent 实例**：独立 `messages[]`，独立工具调用历史。
2. **主对话零污染**：主代理只看到最终结果，看不到中间过程。
3. **可嵌套**：子代理可以再 spawn 子代理。

**Motto**：*Break big tasks down; each subtask gets a clean context*

---

### s05：Skills — 按需加载知识

**问题**：系统提示词不能无限长，领域知识如何注入？

你不能把所有产品文档、API 规范、代码规范都塞进 system prompt。但 Agent 有时需要这些知识。

**核心方案**：

```python
# skills/ 目录下存放领域知识
# skills/react_best_practices.md
# skills/api_design_guide.md
# skills/project_architecture.md

def load_skill(skill_name):
    """通过工具动态加载技能文件"""
    path = f"skills/{skill_name}.md"
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError:
        return f"Skill '{skill_name}' not found."

# 注册为工具
TOOL_HANDLERS["load_skill"] = load_skill

# Agent 主动请求所需技能
# 用户：请用 React 最佳实践重构这个组件
# Agent: 先调用 load_skill("react_best_practices")
#       然后根据加载的知识执行重构
```

**关键洞察**：

1. **知识不是预设，是工具返回**：Agent 需要时主动调用 `load_skill`。
2. **支持无限扩展**：加一个新技能 = 加一个 Markdown 文件。
3. **不占初始 Token**：只有被调用的技能才会进入上下文。

**Motto**：*Load knowledge when you need it, not upfront*

---

### s06：Context Compact — 三层压缩应对无限会话

**问题**：Token 有限，长会话如何持续？

即使用 200K context 的模型，无限对话也会撑爆。简单截断会丢失关键信息，需要**语义压缩**。

**压缩策略**：

```python
class ContextCompressor:
    def __init__(self, max_turns=50):
        self.max_turns = max_turns
    
    def compress(self, messages):
        if len(messages) <= self.max_turns:
            return messages
        
        # Layer 1: 最近 N 轮保持完整
        recent = messages[-self.max_turns:]
        
        # Layer 2: 中间部分压缩为决策摘要
        middle = messages[self.max_turns//2:-self.max_turns]
        summary = self._summarize_decisions(middle)
        
        # Layer 3: 最早部分只保留最终结果
        early = messages[:self.max_turns//2]
        early_results = self._extract_results(early)
        
        return early_results + [summary] + recent
    
    def _summarize_decisions(self, msgs):
        # 调用模型生成摘要
        prompt = "总结以下对话中的关键决策：" + str(msgs)
        return {"role": "system", "content": llm_generate(prompt)}
    
    def _extract_results(self, msgs):
        # 只保留 tool_result
        return [m for m in msgs if m.get("content", [{}])[0].get("type") == "tool_result"]

# 每轮对话前检查是否需要压缩
compressor = ContextCompressor(max_turns=50)
messages = compressor.compress(messages)
```

**关键洞察**：

1. **不是简单截断**：保留决策链，丢弃冗余对话。
2. **三层结构**：完整历史（最近）+ 决策摘要（中间）+ 结果汇总（最早）。
3. **支持无限会话**：Token 使用量稳定在阈值内。

**Motto**：*Context will fill up; you need a way to make room*

---

## 四、Phase 3：持久化（s07-s08）

### s07：Tasks — 目标拆解 + 依赖图 + 磁盘持久化

**问题**：进程重启后任务状态丢失

s03 的 TODO 存在内存里，进程挂了就没。生产环境需要**磁盘持久化**。

**核心实现**：

```python
import json
from pathlib import Path

class TaskSystem:
    def __init__(self, db_path="tasks.json"):
        self.db_path = Path(db_path)
        self.tasks = self._load()
    
    def _load(self):
        if self.db_path.exists():
            return json.loads(self.db_path.read_text())
        return []
    
    def _save(self):
        self.db_path.write_text(json.dumps(self.tasks, indent=2))
    
    def create(self, goal, deps=None):
        task = {
            "id": f"task_{len(self.tasks)}",
            "goal": goal,
            "deps": deps or [],
            "status": "pending",
            "result": None
        }
        self.tasks.append(task)
        self._save()
        return task
    
    def complete(self, task_id, result):
        for task in self.tasks:
            if task["id"] == task_id:
                task["status"] = "completed"
                task["result"] = result
                self._save()
                return task
    
    def get_available(self):
        """获取所有依赖已完成的任务"""
        completed = {t["id"] for t in self.tasks if t["status"] == "completed"}
        return [
            t for t in self.tasks
            if t["status"] == "pending" and set(t["deps"]) <= completed
        ]

# 使用示例
tasks = TaskSystem()
t0 = tasks.create("分析项目结构")
t1 = tasks.create("编写 README", deps=["task_0"])
t2 = tasks.create("添加单元测试", deps=["task_0"])
# t1 和 t2 可以并行执行
```

**关键洞察**：

1. **任务 = 文件**：天然持久化，崩溃后可恢复。
2. **依赖图支持并行**：无依赖关系的任务可同时执行。
3. **状态可查询**：随时知道哪些任务可做、哪些在做、哪些已完成。

**Motto**：*Break big goals into small tasks, order them, persist to disk*

---

### s08：Background Tasks — 慢操作后台执行

**问题**：长耗时操作阻塞 Agent 思考

`pip install`、`npm build`、`docker compose up` 这些操作可能跑几分钟。如果 Agent 傻等，就浪费了思考时间。

**核心设计**：

```python
import threading
from queue import Queue

class BackgroundExecutor:
    def __init__(self):
        self.notifications = Queue()
        self.running = {}
    
    def start(self, task_id, command):
        """后台启动任务"""
        def run():
            result = subprocess.run(command, shell=True, capture_output=True, text=True)
            # 完成后通知
            self.notifications.put({
                "task_id": task_id,
                "status": "completed",
                "output": result.stdout + result.stderr
            })
        
        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        self.running[task_id] = thread
        return {"status": "running", "pid": thread.ident}
    
    def check_notifications(self):
        """检查是否有完成的任务"""
        results = []
        while not self.notifications.empty():
            results.append(self.notifications.get())
        return results

# 集成到主循环
executor = BackgroundExecutor()

while True:
    # 检查后台任务完成状态
    for notif in executor.check_notifications():
        messages.append({
            "role": "user",
            "content": f"Background task {notif['task_id']} completed:\n{notif['output']}"
        })
    
    # 正常 Agent 循环...
    response = client.messages.create(model, messages, tools=TOOLS)
```

**关键洞察**：

1. **非阻塞执行**：启动后立刻返回，Agent 继续处理其他事。
2. **完成通知机制**：通过队列注入消息，Agent 自然感知。
3. **支持多个并发**：可同时跑多个后台任务。

**Motto**：*Run slow operations in the background; the agent keeps thinking*

---

## 五、Phase 4：团队协作（s09-s12）

### s09：Agent Teams — 任务过大时 Delegate 给队友

**问题**：单 Agent 能力有限，如何协作？

一个复杂项目需要：架构师设计、工程师编码、测试工程师写用例、Reviewer 审查。单一 Agent 难以胜任所有角色。

**核心架构**：

```python
class AgentTeam:
    def __init__(self):
        self.teammates = {
            "architect": Agent(role="architect", skills=["system_design"]),
            "coder": Agent(role="coder", skills=["python", "typescript"]),
            "tester": Agent(role="tester", skills=["pytest", "jest"]),
            "reviewer": Agent(role="reviewer", skills=["code_review"]),
        }
        self.mailboxes = {name: Queue() for name in self.teammates}
    
    def delegate(self, to, task):
        """分配任务给队友"""
        self.mailboxes[to].put({
            "type": "request",
            "task": task,
            "from": "lead"
        })
    
    def get_response(self, teammate):
        """获取队友响应"""
        return self.mailboxes[teammate].get()

# 使用示例
team = AgentTeam()
team.delegate("architect", "设计一个用户认证系统")
design = team.get_response("architect")
team.delegate("coder", f"根据以下设计实现：{design}")
```

**关键洞察**：

1. **队友是持久化 Agent**：每个队友有自己的角色、技能、上下文。
2. **通过 Mailbox 通信**：解耦发送和接收。
3. **主代理负责任务分发**：Lead Agent 协调全局。

**Motto**：*When the task is too big for one, delegate to teammates*

---

### s10：Team Protocols — 统一通信协议

**问题**：多 Agent 通信需要标准化

如果每个队友用不同的消息格式，代码会变成意大利面。需要**有限状态机**管理对话。

**核心协议**：

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class MailMessage:
    from_agent: str
    to_agent: str
    msg_type: Literal["request", "response", "notify"]
    task_id: str
    payload: dict
    timestamp: float

class TeamProtocol:
    def __init__(self):
        self.mailboxes = {}  # agent_id -> Queue[MailMessage]
    
    def send_request(self, from_agent, to_agent, task_id, task_desc):
        msg = MailMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            msg_type="request",
            task_id=task_id,
            payload={"description": task_desc},
            timestamp=time.time()
        )
        self.mailboxes[to_agent].put(msg)
    
    def send_response(self, from_agent, to_agent, task_id, result, needs_approval=False):
        msg = MailMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            msg_type="response",
            task_id=task_id,
            payload={"result": result, "needs_approval": needs_approval},
            timestamp=time.time()
        )
        self.mailboxes[to_agent].put(msg)
    
    def send_notify(self, from_agent, to_agent, task_id, event):
        msg = MailMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            msg_type="notify",
            task_id=task_id,
            payload={"event": event},
            timestamp=time.time()
        )
        self.mailboxes[to_agent].put(msg)

# 状态机：request → response → (approval?) → complete
```

**关键洞察**：

1. **单一请求 - 响应模式**：所有通信遵循同一模式。
2. **支持审批流**：`needs_approval=True` 时等待确认。
3. **可追溯**：每条消息有 `task_id` 和时间戳。

**Motto**：*Teammates need shared communication rules*

---

### s11：Autonomous Agents — 队友自主认领任务

**问题**：主代理分配任务成为瓶颈

如果所有任务都要 Lead Agent 分配，Lead 会成为瓶颈。更好的方式是**队友主动认领**。

**核心机制**：

```python
class TaskBoard:
    def __init__(self):
        self.tasks = {}  # task_id -> task
        self.claims = {}  # task_id -> agent_id
    
    def post(self, task_id, task_desc, required_skills=None):
        self.tasks[task_id] = {
            "description": task_desc,
            "required_skills": required_skills or [],
            "status": "available"
        }
    
    def scan_available(self):
        """扫描可认领的任务"""
        return [
            (tid, t) for tid, t in self.tasks.items()
            if t["status"] == "available"
        ]
    
    def claim(self, task_id, agent_id, agent_skills):
        """认领任务"""
        task = self.tasks[task_id]
        # 检查技能匹配
        if set(task["required_skills"]) <= set(agent_skills):
            task["status"] = "claimed"
            self.claims[task_id] = agent_id
            return True
        return False
    
    def complete(self, task_id):
        self.tasks[task_id]["status"] = "completed"

# 队友空闲时主动扫描
class AutonomousAgent:
    def idle_cycle(self):
        available = task_board.scan_available()
        for task_id, task in available:
            if task_board.claim(task_id, self.id, self.skills):
                self.execute(task)
                break
```

**关键洞察**：

1. **去中心化任务分配**：没有中央调度器。
2. **基于能力的自主认领**：队友只认领自己能做的。
3. **减少协调开销**：Lead 只需发布任务，不用分配。

**Motto**：*Teammates scan the board and claim tasks themselves*

---

### s12：Worktree Isolation — 独立工作目录零干扰

**问题**：多 Agent 并行执行时文件冲突

Coder A 在改 `auth.py`，Coder B 也在改 `auth.py` —— 冲突了。需要**物理隔离**。

**核心方案**：

```python
import shutil
from pathlib import Path

class WorktreeManager:
    def __init__(self, base_dir="worktrees"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(exist_ok=True)
    
    def create(self, task_id):
        """为任务创建独立工作目录"""
        worktree = self.base_dir / task_id
        worktree.mkdir(exist_ok=True)
        # 复制项目基础文件
        shutil.copytree("src", worktree / "src", dirs_exist_ok=True)
        return worktree
    
    def get_worktree(self, task_id):
        return self.base_dir / task_id
    
    def merge(self, task_id):
        """任务完成后合并结果"""
        worktree = self.get_worktree(task_id)
        # 将修改的文件复制回主目录
        for src in worktree.glob("**/*"):
            if src.is_file():
                dest = Path("src") / src.relative_to(worktree)
                dest.parent.mkdir(exist_ok=True)
                shutil.copy2(src, dest)
    
    def cleanup(self, task_id):
        shutil.rmtree(self.base_dir / task_id)

# 使用示例
worktrees = WorktreeManager()

# 每个任务绑定独立目录
task_worktree = worktrees.create("task_001")
# Agent 所有操作限制在该目录
agent.run(task, cwd=task_worktree)
# 完成后合并
worktrees.merge("task_001")
worktrees.cleanup("task_001")
```

**关键洞察**：

1. **物理隔离 > 逻辑隔离**：不同目录，天然无冲突。
2. **任务 ID = 目录 ID**：绑定关系清晰。
3. **支持完全并行**：10 个 Agent 可同时改 10 个文件。

**Motto**：*Each works in its own directory, no interference*

---

## 六、架构总览：12 层叠加后的完整形态

把 s01-s12 叠在一起，就是完整的 Claude Code：

```
Claude Code = 
  Agent Loop (s01)              # 核心循环
  + Tool Handlers (s02)         # 工具注册表
  + Todo Manager (s03)          # 任务规划
  + Subagent Spawning (s04)     # 子代理
  + Skill Loading (s05)         # 按需知识
  + Context Compression (s06)   # 上下文压缩
  + Task System (s07)           # 持久化任务
  + Background Threads (s08)    # 后台执行
  + Team Mailboxes (s09-s10)    # 团队通信
  + Autonomous Claiming (s11)   # 自主认领
  + Worktree Isolation (s12)    # 物理隔离
```

**关键设计原则**：

1. **循环不变**：核心 `while True` 从 s01 到 s12 未改变。
2. **逐层叠加**：每步只加一个机制，可独立理解。
3. **正交设计**：各机制独立，可单独移除或替换。

---

## 七、从理解到实践

### 学习路径建议

1. **手敲 s01-s03**（理解核心）：一个下午，50 行代码起步。
2. **阅读 s04-s06**（理解扩展）：理解上下文管理和知识注入。
3. **研究 s07-s12**（理解生产级）：持久化、协作、隔离。

### 可复用的模式

| 模式 | 适用场景 |
|------|----------|
| 工具注册表 | 任何 Agent 项目 |
| 上下文压缩 | 长会话场景 |
| JSONL Mailbox | 多 Agent 通信 |
| Worktree 隔离 | 并行执行场景 |
| 任务依赖图 | 复杂工作流 |

### 下一步

- **Kode Agent CLI**：开箱即用的 Coding Agent
- **Kode SDK**：嵌入你的应用
- **claw0**：Always-On Assistant（Heartbeat + Cron + IM）

---

## 八、结语

> **The model is the agent. The code is the harness.**
> **Build great harnesses. The agent will do the rest.**

12 步走下来，你会发现：最好的 Agent 工程不是训练模型，而是**构建世界** —— 一个模型可以感知、思考、行动的世界。

Bash is all you need. Real agents are all the universe needs.

---

**完**
