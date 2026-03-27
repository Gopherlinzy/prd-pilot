// ============================================================
// PRD Pilot — Public API
// ============================================================

// Types
export type {
  PRDDocument,
  Requirement,
  PRDSection,
  LintIssue,
  CoverageReport,
  TaskItem,
  ClarificationQuestion,
  Priority,
  Severity,
} from './types/prd';

// Adapters
export { FeishuAdapter } from './adapters/feishu';
export { MarkdownAdapter } from './adapters/markdown';
export type { DocumentAdapter, RawDocument, AdapterConfig } from './adapters/types';

// Analyzers
export { PRDLinter } from './analyzers/linter';
export { TaskSplitter } from './analyzers/splitter';
export { RequirementClarifier } from './analyzers/clarifier';

// Reviewers
export { PRReviewer } from './reviewers/pr-reviewer';
export type { ReviewResult, ReviewComment } from './reviewers/pr-reviewer';

// LLM
export { LLMClient } from './llm/client';
export type { LLMClientConfig } from './llm/client';
