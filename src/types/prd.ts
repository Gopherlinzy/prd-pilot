import { z } from 'zod';

// ============================================================
// PRD Pilot — Core Type Definitions
// Uses Zod for runtime validation + TypeScript type inference
// ============================================================

/** Priority levels for requirements */
export const PrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Priority = z.infer<typeof PrioritySchema>;

/** Requirement status in the lifecycle */
export const RequirementStatusSchema = z.enum([
  'draft',
  'review',
  'approved',
  'implemented',
  'verified',
]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

/** A single product requirement */
export const RequirementSchema = z.object({
  /** Unique identifier, e.g. "REQ-001" */
  id: z.string(),
  /** Short title */
  title: z.string(),
  /** Full description of the requirement */
  description: z.string(),
  /** Priority level */
  priority: PrioritySchema.optional(),
  /** Current status */
  status: RequirementStatusSchema.default('draft'),
  /** Acceptance criteria — what "done" looks like */
  acceptanceCriteria: z.array(z.string()).default([]),
  /** IDs of requirements this one depends on */
  dependencies: z.array(z.string()).default([]),
  /** Which section of the PRD this belongs to */
  sectionId: z.string().optional(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

/** A section/chapter in the PRD document */
export interface PRDSection {
  /** Section identifier */
  id: string;
  /** Section title */
  title: string;
  /** Raw text content */
  content: string;
  /** Nesting level (1 = top-level heading) */
  level: number;
  /** Child sections */
  children: PRDSection[];
}

export const PRDSectionSchema: z.ZodType<PRDSection> = z.lazy(() => z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  level: z.number().int().min(1).max(6).default(1),
  children: z.array(PRDSectionSchema).default([]),
})) as z.ZodType<PRDSection>;

/** The complete structured PRD document */
export const PRDDocumentSchema = z.object({
  /** Document title */
  title: z.string(),
  /** Version string, e.g. "1.2.0" */
  version: z.string().default('0.1.0'),
  /** Author / owner */
  author: z.string().optional(),
  /** Source URL (e.g. Feishu doc link) */
  sourceUrl: z.string().optional(),
  /** When the PRD was last modified */
  lastModified: z.string().datetime().optional(),
  /** Structured sections */
  sections: z.array(PRDSectionSchema).default([]),
  /** Extracted requirements */
  requirements: z.array(RequirementSchema).default([]),
  /** Data model descriptions (entity names, fields, relations) */
  dataModels: z.array(z.object({
    name: z.string(),
    description: z.string(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
    })).default([]),
  })).default([]),
  /** User flow / process descriptions */
  flows: z.array(z.object({
    name: z.string(),
    description: z.string(),
    steps: z.array(z.string()).default([]),
  })).default([]),
  /** Raw metadata from the source document */
  metadata: z.record(z.unknown()).default({}),
});
export type PRDDocument = z.infer<typeof PRDDocumentSchema>;

// ============================================================
// Analysis Result Types
// ============================================================

/** Severity of a lint issue */
export const SeveritySchema = z.enum(['error', 'warning', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

/** A single issue found by the PRD Linter */
export const LintIssueSchema = z.object({
  /** Rule that triggered this issue */
  rule: z.string(),
  /** Severity level */
  severity: SeveritySchema,
  /** Human-readable description */
  message: z.string(),
  /** Which requirement or section is affected */
  location: z.object({
    requirementId: z.string().optional(),
    sectionId: z.string().optional(),
    field: z.string().optional(),
  }).optional(),
  /** Suggested fix */
  suggestion: z.string().optional(),
});
export type LintIssue = z.infer<typeof LintIssueSchema>;

/** Coverage status for a single requirement */
export const CoverageStatusSchema = z.enum(['covered', 'partial', 'uncovered']);

/** Requirement coverage report — the killer differentiator */
export const CoverageReportSchema = z.object({
  /** Overall coverage percentage (0-100) */
  overallScore: z.number().min(0).max(100),
  /** Total requirements count */
  totalRequirements: z.number(),
  /** Per-requirement coverage details */
  items: z.array(z.object({
    requirementId: z.string(),
    requirementTitle: z.string(),
    status: CoverageStatusSchema,
    /** Which files/functions cover this requirement */
    coveredBy: z.array(z.string()).default([]),
    /** What's missing */
    gaps: z.array(z.string()).default([]),
  })),
  /** Generated at timestamp */
  generatedAt: z.string().datetime(),
});
export type CoverageReport = z.infer<typeof CoverageReportSchema>;

/** A development task split from requirements */
export const TaskItemSchema = z.object({
  /** Task title (suitable for GitHub Issue title) */
  title: z.string(),
  /** Detailed description (GitHub Issue body in Markdown) */
  body: z.string(),
  /** Labels for categorization */
  labels: z.array(z.string()).default([]),
  /** Priority label */
  priority: PrioritySchema.optional(),
  /** Estimated effort (story points or hours) */
  estimate: z.string().optional(),
  /** IDs of requirements this task implements */
  implementsRequirements: z.array(z.string()).default([]),
  /** IDs of other tasks this depends on */
  dependsOn: z.array(z.string()).default([]),
  /** Acceptance criteria inherited + refined from requirements */
  acceptanceCriteria: z.array(z.string()).default([]),
});
export type TaskItem = z.infer<typeof TaskItemSchema>;

/** A clarification question generated for the PM */
export const ClarificationQuestionSchema = z.object({
  /** Which requirement or section triggered this */
  relatedTo: z.string(),
  /** The question to ask */
  question: z.string(),
  /** Why this matters */
  reason: z.string(),
  /** Suggested answer options (if applicable) */
  suggestedOptions: z.array(z.string()).default([]),
});
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;
