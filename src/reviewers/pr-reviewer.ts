import type { PRDDocument, CoverageReport } from '../types/prd';
import { LLMClient } from '../llm/client';

// ============================================================
// PR Reviewer — Checks PR compliance against PRD requirements
// Core differentiator: Requirement Coverage Score
// ============================================================

export interface ReviewResult {
  /** Overall pass/fail verdict */
  verdict: 'pass' | 'warn' | 'fail';
  /** Requirement coverage report */
  coverage: CoverageReport;
  /** Individual review comments */
  comments: ReviewComment[];
  /** Summary for PR comment */
  summary: string;
}

export interface ReviewComment {
  /** File path in the PR */
  file: string;
  /** Line number (if applicable) */
  line?: number;
  /** The comment */
  body: string;
  /** Related requirement ID */
  requirementId?: string;
}

/**
 * PRReviewer — the crown jewel of PRD Pilot.
 *
 * Compares a PR diff against the PRD to calculate a
 * Requirement Coverage Score — a novel metric that
 * measures how well code changes satisfy product requirements.
 *
 * This is the key differentiator from Devin/Sweep:
 * they go PRD → Code (generation), we go Code → PRD (verification).
 */
export class PRReviewer {
  private llm: LLMClient;

  constructor(llm?: LLMClient) {
    this.llm = llm ?? new LLMClient();
  }

  /**
   * Review a PR diff against the linked PRD.
   *
   * @param prDiff - The PR diff content (unified diff format)
   * @param prd - The PRD document this PR should implement
   * @returns Review result with coverage score and comments
   */
  async review(prDiff: string, prd: PRDDocument): Promise<ReviewResult> {
    // TODO: Implement full review pipeline
    // Step 1: Parse PR diff into file-level changes
    // Step 2: For each requirement, ask LLM if the diff covers it
    // Step 3: Calculate coverage score
    // Step 4: Generate review comments for uncovered requirements
    // Step 5: Format as GitHub PR review

    const coverage = await this.calculateCoverage(prDiff, prd);
    const comments = await this.generateComments(prDiff, prd, coverage);

    const verdict = coverage.overallScore >= 80 ? 'pass'
      : coverage.overallScore >= 50 ? 'warn'
      : 'fail';

    return {
      verdict,
      coverage,
      comments,
      summary: this.formatSummary(coverage, verdict),
    };
  }

  /**
   * Calculate requirement coverage for a PR.
   * This is the core "Requirement Coverage Score" feature.
   */
  private async calculateCoverage(prDiff: string, prd: PRDDocument): Promise<CoverageReport> {
    // TODO: Implement LLM-based coverage analysis
    // For each requirement:
    // 1. Ask LLM: "Does this diff implement requirement X?"
    // 2. LLM responds with: covered / partial / uncovered + evidence
    // 3. Aggregate into overall score

    const prompt = this.buildCoveragePrompt(prDiff, prd);
    const result = await this.llm.structured<CoverageReport>(
      prompt,
      `You are a code reviewer. Analyze whether a PR diff implements the given PRD requirements.
For each requirement, determine: "covered" (fully implemented), "partial" (partially implemented),
or "uncovered" (not addressed at all). Provide evidence from the diff.
Respond with JSON matching the CoverageReport schema.`,
    );

    return result;
  }

  private async generateComments(
    prDiff: string,
    prd: PRDDocument,
    coverage: CoverageReport,
  ): Promise<ReviewComment[]> {
    // TODO: Generate inline PR comments for uncovered/partial requirements
    const uncovered = coverage.items.filter(i => i.status !== 'covered');
    return uncovered.map(item => ({
      file: 'REVIEW.md',
      body: `⚠️ Requirement [${item.requirementId}] "${item.requirementTitle}" is ${item.status}.\nGaps: ${item.gaps.join(', ')}`,
      requirementId: item.requirementId,
    }));
  }

  private formatSummary(coverage: CoverageReport, verdict: string): string {
    const emoji = verdict === 'pass' ? '✅' : verdict === 'warn' ? '⚠️' : '❌';
    return `${emoji} PRD Pilot Coverage Report

**Overall Score: ${coverage.overallScore}%** (${coverage.items.filter(i => i.status === 'covered').length}/${coverage.totalRequirements} requirements covered)

| Status | Count |
|--------|-------|
| ✅ Covered | ${coverage.items.filter(i => i.status === 'covered').length} |
| ⚠️ Partial | ${coverage.items.filter(i => i.status === 'partial').length} |
| ❌ Uncovered | ${coverage.items.filter(i => i.status === 'uncovered').length} |
`;
  }

  private buildCoveragePrompt(prDiff: string, prd: PRDDocument): string {
    const reqList = prd.requirements
      .map(r => `[${r.id}] ${r.title}: ${r.description}`)
      .join('\n');

    return `# PRD Requirements
${reqList}

# PR Diff
\`\`\`diff
${prDiff.slice(0, 8000)}
\`\`\`

Analyze which requirements are covered by this PR.`;
  }
}
