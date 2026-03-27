import type { PRDDocument, TaskItem } from '../types/prd';
import { LLMClient } from '../llm/client';

// ============================================================
// Task Splitter — Breaks PRD requirements into dev tasks
// Outputs GitHub Issue-compatible format
// ============================================================

export interface SplitOptions {
  /** Max tasks to generate */
  maxTasks?: number;
  /** Include dependency analysis */
  analyzeDependencies?: boolean;
  /** Target labels for GitHub Issues */
  defaultLabels?: string[];
}

/**
 * TaskSplitter — uses LLM to decompose requirements into
 * actionable development tasks with proper GitHub Issue format.
 */
export class TaskSplitter {
  private llm: LLMClient;

  constructor(llm?: LLMClient) {
    this.llm = llm ?? new LLMClient();
  }

  /**
   * Split PRD requirements into development tasks.
   *
   * @param prd - The parsed PRD document
   * @param options - Splitting options
   * @returns Array of TaskItems ready for GitHub Issue creation
   */
  async split(prd: PRDDocument, options: SplitOptions = {}): Promise<TaskItem[]> {
    const { maxTasks = 20, analyzeDependencies = true, defaultLabels = [] } = options;

    // TODO: Implement LLM-based task splitting
    // Prompt strategy:
    // 1. Feed PRD requirements + acceptance criteria to LLM
    // 2. Ask LLM to decompose into atomic, implementable tasks
    // 3. Each task should be completable in 1-3 days
    // 4. Use structured output (JSON mode) for reliable parsing
    // 5. Post-process: validate task dependencies, deduplicate

    const prompt = this.buildSplitPrompt(prd, maxTasks);
    const result = await this.llm.structured<{ tasks: TaskItem[] }>(
      prompt,
      `You are a senior engineering lead. Given a PRD, break it down into atomic development tasks.
Each task should be:
- Completable in 1-3 days by a single developer
- Have clear acceptance criteria
- Be formatted as a GitHub Issue (title + body in Markdown)
Respond with JSON: { "tasks": [...] }`,
    );

    return (result.tasks ?? []).map(task => ({
      ...task,
      labels: [...(task.labels ?? []), ...defaultLabels],
    }));
  }

  private buildSplitPrompt(prd: PRDDocument, maxTasks: number): string {
    const reqSummary = prd.requirements
      .map(r => `- [${r.id}] ${r.title}: ${r.description} (AC: ${r.acceptanceCriteria.join('; ')})`)
      .join('\n');

    return `# PRD: ${prd.title}

## Requirements
${reqSummary}

## Data Models
${prd.dataModels.map(m => `- ${m.name}: ${m.description}`).join('\n') || 'None specified'}

## Flows
${prd.flows.map(f => `- ${f.name}: ${f.steps.join(' → ')}`).join('\n') || 'None specified'}

---
Break this PRD into at most ${maxTasks} development tasks.
Include dependency relationships between tasks where applicable.`;
  }
}
