/**
 * PRD Pilot — 需求驱动的开发质量守护系统
 *
 * 从 PRD 到代码的全链路质量闭环：
 * - 文档解析：飞书 / Markdown → 标准化 PRDDocument
 * - 缺陷扫描：8 条内置 lint 规则
 * - 需求拆分：LLM 驱动的 Issue 自动生成
 * - 需求澄清：基于 lint 结果的反向提问
 * - PR 审查：需求覆盖率计算
 *
 * @packageDocumentation
 */

// ─── 类型导出 ─────────────────────────────────────────────────
export type {
  Priority,
  RequirementStatus,
  Severity,
  SectionType,
  Requirement,
  PRDSection,
  PRDDocument,
  LintRuleId,
  LintIssue,
  CoverageReport,
  TaskItem,
} from './types/prd';

export {
  PrioritySchema,
  RequirementStatusSchema,
  SeveritySchema,
  SectionTypeSchema,
  RequirementSchema,
  PRDSectionSchema,
  PRDDocumentSchema,
  LintRuleIdSchema,
  LintIssueSchema,
  CoverageReportSchema,
  TaskItemSchema,
} from './types/prd';

// ─── 适配器导出 ──────────────────────────────────────────────
export type {
  DocumentAdapter,
  RawDocument,
  AdapterConfig,
  FeishuAdapterConfig,
  MarkdownAdapterConfig,
} from './adapters/types';

export {
  AdapterError,
  AdapterFetchError,
  AdapterParseError,
} from './adapters/types';

export { FeishuAdapter } from './adapters/feishu';
export { MarkdownAdapter } from './adapters/markdown';

// ─── LLM 客户端导出 ─────────────────────────────────────────
export type {
  LLMClientConfig,
  CallOptions,
  StructuredCallOptions,
  TokenUsage,
  LLMResult,
} from './llm/client';

export { LLMClient } from './llm/client';

// ─── 分析器导出 ──────────────────────────────────────────────
export type { LintRule, LinterConfig } from './analyzers/linter';
export { PRDLinter, BUILT_IN_RULES } from './analyzers/linter';

export type { SplitterConfig, GitHubIssueParams } from './analyzers/splitter';
export { TaskSplitter } from './analyzers/splitter';

export type {
  ClarificationQuestion,
  ClarificationReport,
  ClarifierConfig,
} from './analyzers/clarifier';
export { RequirementClarifier } from './analyzers/clarifier';

// ─── 审查器导出 ──────────────────────────────────────────────
export type {
  ReviewerConfig,
  PRInfo,
  ChangedFile,
  ReviewResult,
  ReviewSuggestion,
} from './reviewers/pr-reviewer';
export { PRReviewer } from './reviewers/pr-reviewer';
