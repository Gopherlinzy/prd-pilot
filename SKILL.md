---
name: prd-pilot
description: "Requirement-driven development quality guardian. Analyzes PRDs from Feishu/Lark, scans for defects, splits into tasks, and reviews PRs against requirements with a novel Requirement Coverage Score."
metadata:
  openclaw:
    emoji: "🛩️"
    triggers:
      - "分析 PRD"
      - "PRD 审查"
      - "需求分析"
      - "analyze PRD"
      - "review PR against PRD"
      - "requirement coverage"
---

# PRD Pilot

Requirement-driven development quality guardian. Analyze PRDs, find defects, split tasks, and review PRs.

## Commands

- `prd:analyze <feishu-url>` — Parse and structure a Feishu PRD document
- `prd:lint <feishu-url>` — Scan PRD for common defects (8 built-in rules)
- `prd:split <feishu-url>` — Split requirements into GitHub Issues
- `prd:clarify <feishu-url>` — Generate clarification questions for the PM
- `prd:review <pr-url> --prd <feishu-url>` — Review PR compliance against PRD

## Requirements

- Node.js >= 18
- `OPENAI_API_KEY` environment variable
- `FEISHU_APP_ID` + `FEISHU_APP_SECRET` for Feishu document access
