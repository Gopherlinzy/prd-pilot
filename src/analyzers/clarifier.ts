import type { PRDDocument, LintIssue, ClarificationQuestion } from '../types/prd';
import { LLMClient } from '../llm/client';

// ============================================================
// Requirement Clarifier
// Generates smart questions to help PMs fill PRD gaps
// ============================================================

/**
 * RequirementClarifier — takes lint issues and generates
 * targeted questions that help PMs improve their PRD.
 *
 * This is the "interactive" layer: instead of just flagging
 * problems, it guides the PM toward solutions.
 */
export class RequirementClarifier {
  private llm: LLMClient;

  constructor(llm?: LLMClient) {
    this.llm = llm ?? new LLMClient();
  }

  /**
   * Generate clarification questions based on lint results.
   *
   * @param prd - The original PRD document
   * @param issues - Issues found by the linter
   * @returns Questions to ask the PM, with context and suggestions
   */
  async clarify(
    prd: PRDDocument,
    issues: LintIssue[],
  ): Promise<ClarificationQuestion[]> {
    // Filter to actionable issues (errors and warnings only)
    const actionableIssues = issues.filter(i => i.severity !== 'info');

    if (actionableIssues.length === 0) {
      return [];
    }

    // TODO: Implement LLM-based question generation
    // Strategy:
    // 1. Group issues by requirement
    // 2. For each group, generate targeted questions
    // 3. Include suggested answer options where possible
    // 4. Prioritize questions by issue severity

    const prompt = this.buildClarifyPrompt(prd, actionableIssues);
    const result = await this.llm.structured<{ questions: ClarificationQuestion[] }>(
      prompt,
      `You are a senior product analyst reviewing a PRD.
Generate specific, actionable questions that will help the PM fix the identified issues.
Each question should be clear, non-judgmental, and include suggested options when possible.
Respond with JSON: { "questions": [...] }`,
    );

    return result.questions ?? [];
  }

  private buildClarifyPrompt(prd: PRDDocument, issues: LintIssue[]): string {
    const issueSummary = issues
      .map(i => `- [${i.severity}] ${i.rule}: ${i.message}${i.suggestion ? ` (Suggestion: ${i.suggestion})` : ''}`)
      .join('\n');

    return `# PRD: ${prd.title}

## Issues Found
${issueSummary}

---
For each issue, generate a clarification question that helps the PM resolve it.
Be specific and constructive. Include 2-3 suggested answer options where applicable.`;
  }
}
