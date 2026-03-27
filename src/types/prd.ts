/**
 * PRD 数据模型定义
 *
 * 使用 zod 进行运行时校验，同时导出 TypeScript 静态类型。
 * 所有从外部（飞书、Markdown、API）进入系统的数据都必须经过 schema 校验。
 */

import { z } from 'zod';

// ─── 基础枚举 ───────────────────────────────────────────────────

/** 需求优先级 */
export const PrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Priority = z.infer<typeof PrioritySchema>;

/** 需求状态 */
export const RequirementStatusSchema = z.enum([
  'draft',      // 草稿，尚未评审
  'reviewed',   // 已评审，待开发
  'in_progress',// 开发中
  'completed',  // 已完成
]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

/** Lint 问题严重程度 */
export const SeveritySchema = z.enum(['error', 'warning', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

/** PRD 章节类型 */
export const SectionTypeSchema = z.enum([
  'background',         // 背景与目标
  'user_story',         // 用户故事
  'functional',         // 功能需求
  'non_functional',     // 非功能需求
  'data_model',         // 数据模型
  'interaction_flow',   // 交互流程
  'acceptance_criteria', // 验收标准
  'open_question',      // 待确认问题
  'appendix',           // 附录
]);
export type SectionType = z.infer<typeof SectionTypeSchema>;

// ─── 核心数据模型 ─────────────────────────────────────────────

/** 单条需求 */
export const RequirementSchema = z.object({
  /** 需求唯一标识，格式 REQ-001 */
  id: z.string().regex(/^REQ-\d{3,}$/, '需求 ID 格式应为 REQ-XXX'),
  /** 需求标题 */
  title: z.string().min(1, '需求标题不能为空'),
  /** 需求详细描述（Markdown 格式） */
  description: z.string(),
  /** 优先级 */
  priority: PrioritySchema,
  /** 当前状态 */
  status: RequirementStatusSchema,
  /** 验收标准列表，每条为一个可验证的陈述 */
  acceptanceCriteria: z.array(z.string()).min(1, '至少需要一条验收标准'),
  /** 关联的其他需求 ID */
  dependencies: z.array(z.string()).default([]),
  /** 负责人 */
  owner: z.string().optional(),
  /** 预估工作量（人天） */
  estimatedDays: z.number().positive().optional(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

/** PRD 章节 */
export const PRDSectionSchema = z.object({
  /** 章节标题 */
  title: z.string().min(1),
  /** 章节类型，用于语义化分析 */
  type: SectionTypeSchema,
  /** 章节正文内容（Markdown 格式） */
  content: z.string(),
  /** 嵌套子章节 */
  children: z.lazy(() => z.array(PRDSectionSchema)).default([]),
  /** 该章节关联的需求 ID 列表 */
  requirementIds: z.array(z.string()).default([]),
});
export type PRDSection = z.infer<typeof PRDSectionSchema>;

/** 完整 PRD 文档 */
export const PRDDocumentSchema = z.object({
  /** 文档唯一标识（来源平台的 doc ID） */
  id: z.string(),
  /** 文档标题 */
  title: z.string().min(1, 'PRD 标题不能为空'),
  /** 文档版本号，遵循 semver */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, '版本号格式应为 x.y.z').default('0.1.0'),
  /** 文档来源平台 */
  source: z.enum(['feishu', 'markdown', 'notion']),
  /** 原始文档 URL */
  sourceUrl: z.string().url().optional(),
  /** 文档作者 */
  author: z.string().optional(),
  /** 最后更新时间 (ISO 8601) */
  updatedAt: z.string().datetime().optional(),
  /** 结构化章节列表 */
  sections: z.array(PRDSectionSchema),
  /** 提取出的需求列表 */
  requirements: z.array(RequirementSchema),
  /** 文档级元数据（自由键值对，用于扩展） */
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type PRDDocument = z.infer<typeof PRDDocumentSchema>;

// ─── 分析结果模型 ─────────────────────────────────────────────

/** Lint 规则 ID */
export const LintRuleIdSchema = z.enum([
  'missing-acceptance-criteria',  // 缺少验收标准
  'ambiguous-language',           // 使用了模糊表述（"大概"、"可能"、"等等"）
  'missing-error-handling',       // 未描述异常/错误处理流程
  'missing-boundary',             // 缺少边界条件说明
  'undefined-data-model',         // 引用了未定义的数据模型
  'incomplete-flow',              // 交互流程不完整（缺少分支或终态）
  'no-priority',                  // 需求未标注优先级
  'circular-dependency',          // 需求间存在循环依赖
]);
export type LintRuleId = z.infer<typeof LintRuleIdSchema>;

/** 单条 Lint 问题 */
export const LintIssueSchema = z.object({
  /** 规则 ID */
  ruleId: LintRuleIdSchema,
  /** 严重程度 */
  severity: SeveritySchema,
  /** 问题描述 */
  message: z.string(),
  /** 问题所在的章节标题 */
  sectionTitle: z.string().optional(),
  /** 关联的需求 ID */
  requirementId: z.string().optional(),
  /** 修复建议 */
  suggestion: z.string().optional(),
});
export type LintIssue = z.infer<typeof LintIssueSchema>;

/** 需求覆盖率报告 */
export const CoverageReportSchema = z.object({
  /** 总需求数 */
  totalRequirements: z.number().int().nonnegative(),
  /** 已被 PR 覆盖的需求数 */
  coveredRequirements: z.number().int().nonnegative(),
  /** 覆盖率百分比 (0-100) */
  coveragePercent: z.number().min(0).max(100),
  /** 未覆盖的需求 ID 列表 */
  uncoveredIds: z.array(z.string()),
  /** 每条需求的覆盖详情 */
  details: z.array(z.object({
    /** 需求 ID */
    requirementId: z.string(),
    /** 是否已覆盖 */
    covered: z.boolean(),
    /** 覆盖该需求的 PR 或 commit 引用 */
    coveredBy: z.array(z.string()).default([]),
    /** 覆盖置信度 (0-1)，由 LLM 评估 */
    confidence: z.number().min(0).max(1).optional(),
  })),
});
export type CoverageReport = z.infer<typeof CoverageReportSchema>;

/** 拆分后的任务条目（对应一个 GitHub Issue） */
export const TaskItemSchema = z.object({
  /** 任务标题（将作为 Issue title） */
  title: z.string().min(1),
  /** 任务描述（Markdown，将作为 Issue body） */
  body: z.string(),
  /** 关联的需求 ID */
  requirementId: z.string(),
  /** GitHub Labels */
  labels: z.array(z.string()).default([]),
  /** 预估工作量（人天） */
  estimatedDays: z.number().positive().optional(),
  /** 任务依赖的其他任务标题 */
  dependsOn: z.array(z.string()).default([]),
  /** 验收标准（从需求继承 + LLM 补充） */
  acceptanceCriteria: z.array(z.string()),
});
export type TaskItem = z.infer<typeof TaskItemSchema>;
