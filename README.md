# PRD Pilot

> 需求驱动的开发质量守护系统 — 从 PRD 到代码的全链路质量闭环

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://typescriptlang.org)
[![Status](https://img.shields.io/badge/status-MVP-green.svg)]()

PRD Pilot 帮助团队在开发全流程中守住需求质量：**解析 PRD → 扫描缺陷 → 拆分任务 → 追踪覆盖率**。

## 功能

- **飞书 PRD 解析** — 从飞书文档 URL 自动提取结构化需求
- **PRD Lint** — 8 条内置规则扫描需求质量问题（模糊表述、缺少验收标准、循环依赖等）
- **需求拆分** — LLM 驱动，将需求自动拆解为 GitHub Issues
- **反向提问** — 基于 lint 结果自动生成澄清问题，帮助 PM 补全需求
- **PR 审查** — 计算 PR 对 PRD 需求的覆盖率，识别缺失实现

## Quick Start

```bash
# 安装
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 运行 lint
pnpm lint

# 运行测试
pnpm test
```

### 基本用法

```typescript
import {
  FeishuAdapter,
  PRDLinter,
  LLMClient,
  TaskSplitter,
  RequirementClarifier,
} from 'prd-pilot';

// 1. 从飞书获取 PRD
const adapter = new FeishuAdapter({
  extra: { appId: 'cli_xxx', appSecret: 'xxx' },
});
const prd = await adapter.fetchAndParse('https://xxx.feishu.cn/docx/abc123');

// 2. 扫描缺陷
const linter = new PRDLinter();
const issues = linter.lint(prd);
console.log(PRDLinter.formatSummary(issues));

// 3. 生成澄清问题
const llm = new LLMClient({ model: 'gpt-4o' });
const clarifier = new RequirementClarifier(llm);
const report = await clarifier.generateQuestions(prd, issues);

// 4. 拆分为开发任务
const splitter = new TaskSplitter(llm);
const { tasks } = await splitter.splitAll(prd);
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       PRD Pilot                          │
├──────────────┬───────────────┬──────────────┬────────────┤
│   Adapters   │   Analyzers   │   Reviewers  │    LLM     │
├──────────────┼───────────────┼──────────────┼────────────┤
│ FeishuAdapter│ PRDLinter     │ PRReviewer   │ LLMClient  │
│ MarkdownAdpt │ TaskSplitter  │              │ (OpenAI)   │
│ (Notion WIP) │ Clarifier     │              │            │
├──────────────┴───────────────┴──────────────┴────────────┤
│                    types/prd.ts (Zod Schemas)            │
└──────────────────────────────────────────────────────────┘

数据流:
  飞书/Markdown → Adapter → PRDDocument → Linter → LintIssue[]
                                       → Splitter → TaskItem[]
                                       → Clarifier → Questions[]
                         PR + PRDDocument → Reviewer → CoverageReport
```

## 项目结构

```
src/
├── types/
│   └── prd.ts              # Zod 数据模型（PRDDocument, Requirement, LintIssue...）
├── adapters/
│   ├── types.ts            # DocumentAdapter 泛型接口
│   ├── feishu.ts           # 飞书文档适配器
│   └── markdown.ts         # Markdown 适配器（Phase 2）
├── llm/
│   └── client.ts           # OpenAI API 封装（structured output + retry）
├── analyzers/
│   ├── linter.ts           # PRD 缺陷扫描（8 条规则）
│   ├── splitter.ts         # 需求 → GitHub Issues 拆分
│   └── clarifier.ts        # Lint 结果 → 反向提问
├── reviewers/
│   └── pr-reviewer.ts      # PR 需求覆盖率审查
└── index.ts                # 公共 API 导出
```

## Lint 规则

| 规则 ID | 严重程度 | 说明 |
| --- | --- | --- |
| `missing-acceptance-criteria` | error | 需求缺少验收标准 |
| `ambiguous-language` | warning | 使用了模糊表述 |
| `missing-error-handling` | warning | 未描述异常处理 |
| `missing-boundary` | warning | 缺少边界条件 |
| `undefined-data-model` | error | 引用了未定义的数据模型 |
| `incomplete-flow` | error | 交互流程不完整 |
| `no-priority` | info | 未标注优先级 |
| `circular-dependency` | error | 需求间循环依赖 |

## 环境变量

```bash
# .env.local
OPENAI_API_KEY=sk-xxx            # OpenAI API Key
FEISHU_APP_ID=cli_xxx            # 飞书应用 ID
FEISHU_APP_SECRET=xxx            # 飞书应用 Secret
GITHUB_TOKEN=ghp_xxx             # GitHub 个人访问令牌
```

## Roadmap

- [x] Phase 1: 核心骨架 — 类型定义、适配器接口、Linter 规则
- [ ] Phase 2: 飞书 API 接入 — Block 解析、真实文档获取
- [ ] Phase 3: Markdown 适配器 — 本地 PRD 文件支持
- [ ] Phase 4: LLM 集成 — 需求拆分、澄清问题生成
- [ ] Phase 5: GitHub 集成 — Issue 自动创建、PR 覆盖率审查
- [ ] Phase 6: OpenClaw Skill — 集成为 OpenClaw 技能插件
- [ ] Phase 7: Notion 适配器 — 支持 Notion 文档来源

## License

[MIT](./LICENSE) © 2024
