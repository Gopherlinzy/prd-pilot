# 🛩️ PRD Pilot

> Your PRD's co-pilot from Spec to Ship

**PRD Pilot** is a requirement-driven development quality guardian. It analyzes your Product Requirement Documents, finds defects before coding starts, splits requirements into tasks, and verifies that Pull Requests actually implement what the PRD specifies.

Think of it as **SonarQube, but for your requirements layer.**

[![Status](https://img.shields.io/badge/status-MVP-blue)](https://github.com/prd-pilot)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

## ✨ Features

| Feature | Description | Status |
|---------|-------------|--------|
| 📄 **PRD Parser** | Parse Feishu/Lark documents into structured requirement models | Phase 1 |
| 🔍 **PRD Linter** | 8 built-in rules to catch missing acceptance criteria, ambiguous language, undefined data models, and more | Phase 1 |
| 📋 **Task Splitter** | AI-powered decomposition of requirements into GitHub Issues with dependencies | Phase 1 |
| ❓ **Requirement Clarifier** | Generate smart questions to help PMs fill PRD gaps | Phase 1 |
| ✅ **PR Reviewer** | Calculate **Requirement Coverage Score** — verify PRs against PRD specs | Phase 1 |
| 📊 **Coverage Report** | Visual requirement coverage tracking (like code coverage, but for requirements) | Phase 1 |
| 🔄 **Bidirectional Sync** | Code → PRD feedback loop (auto-suggest PRD updates) | Phase 2 |
| 📝 **Markdown Support** | Parse local .md PRD files | Phase 2 |

## 🎯 What Makes PRD Pilot Different?

Most AI coding tools go **PRD → Code** (generation). PRD Pilot goes **Code → PRD** (verification).

**Why?** Because in real engineering:
- 🔴 AI-generated code has compounding error rates (90%⁴ = 65% accuracy across 4 steps)
- 🟢 AI-powered **critique** is far more reliable than AI-powered **generation**
- 🟢 Finding problems early saves 10x more time than fixing them later

### 🌟 Requirement Coverage Score (Novel Metric)

```
PRD Pilot Coverage Report
━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Coverage: 73% (11/15 requirements)

✅ Covered (11):
  - [REQ-01] User login flow
  - [REQ-02] Password validation
  ...

⚠️ Partially Covered (2):
  - [REQ-12] Error handling — only covers timeout, missing 500

❌ Not Covered (2):
  - [REQ-14] i18n support
  - [REQ-15] Accessibility
```

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                     PRD Pilot                         │
├────────────┬──────────────┬──────────────┬───────────┤
│  Adapters  │  Analyzers   │  Reviewers   │    LLM    │
│            │              │              │           │
│ ┌────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌───────┐ │
│ │ Feishu │ │ │  Linter  │ │ │    PR    │ │ │OpenAI │ │
│ │Adapter │ │ │ (8 rules)│ │ │ Reviewer │ │ │Client │ │
│ ├────────┤ │ ├──────────┤ │ │+Coverage │ │ │       │ │
│ │Markdown│ │ │ Splitter │ │ └──────────┘ │ │ JSON  │ │
│ │Adapter │ │ ├──────────┤ │              │ │ Mode  │ │
│ └────────┘ │ │Clarifier │ │              │ │+Retry │ │
│            │ └──────────┘ │              │ └───────┘ │
├────────────┴──────────────┴──────────────┴───────────┤
│              DocumentAdapter Interface                │
│        (document source agnostic core engine)         │
└──────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

```bash
# Install
npm install prd-pilot

# Set up API keys
export OPENAI_API_KEY=sk-...
export FEISHU_APP_ID=cli_...
export FEISHU_APP_SECRET=...

# Analyze a Feishu PRD
npx prd-pilot analyze https://your-org.feishu.cn/docx/ABC123

# Lint a PRD for defects
npx prd-pilot lint https://your-org.feishu.cn/docx/ABC123

# Split requirements into GitHub Issues
npx prd-pilot split https://your-org.feishu.cn/docx/ABC123 --repo owner/repo

# Review a PR against its PRD
npx prd-pilot review --pr owner/repo#42 --prd https://your-org.feishu.cn/docx/ABC123
```

## 📍 Roadmap

- [x] **Phase 1** — OpenClaw Skill (Feishu + Linter + Splitter + PR Review)
- [ ] **Phase 2** — Standalone CLI + MCP Server + Markdown adapter
- [ ] **Phase 3** — GitHub App + Web Dashboard + Notion/Confluence adapters

## 🛠️ Development

```bash
git clone https://github.com/Gopherlinzy/prd-pilot.git
cd prd-pilot
npm install
npm run build
npm run dev  # watch mode
```

## 📄 License

MIT © PRD Pilot Contributors
