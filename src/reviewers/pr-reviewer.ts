/**
 * PR 审查器
 *
 * 将 GitHub Pull Request 的变更内容与 PRD 需求进行交叉比对，
 * 计算需求覆盖率，并识别缺失或偏离的实现。
 *
 * 工作流：
 * 1. 获取 PR 的 diff（通过 GitHub API）
 * 2. 获取 PR 关联的 PRD 文档
 * 3. 使用 LLM 逐条评估每个需求是否被 PR 覆盖
 * 4. 生成覆盖率报告
 */

import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import type { LLMClient, CallOptions } from '../llm/client';
import type { PRDDocument, Requirement, CoverageReport } from '../types/prd';
import { CoverageReportSchema } from '../types/prd';

// ─── 配置 ─────────────────────────────────────────────────────

/** PR 审查器配置 */
export interface ReviewerConfig {
  /** GitHub 个人访问令牌 */
  githubToken?: string;
  /** 覆盖率阈值（低于此值视为未达标），默认 80 */
  coverageThreshold?: number;
  /** 是否使用 LLM 进行深度语义比对，默认 true */
  useLLM?: boolean;
  /** LLM 调用选项 */
  llmOptions?: CallOptions;
}

/** PR 信息 */
export interface PRInfo {
  /** 仓库所有者 */
  owner: string;
  /** 仓库名 */
  repo: string;
  /** PR 编号 */
  number: number;
  /** PR 标题 */
  title: string;
  /** PR 描述 */
  body: string;
  /** 变更的文件列表 */
  changedFiles: ChangedFile[];
}

/** 变更文件 */
export interface ChangedFile {
  /** 文件路径 */
  filename: string;
  /** 变更状态 */
  status: 'added' | 'modified' | 'removed' | 'renamed';
  /** 变更行数 */
  additions: number;
  deletions: number;
  /** diff 补丁内容 */
  patch?: string;
}

/** 审查结果 */
export interface ReviewResult {
  /** PR 信息 */
  pr: PRInfo;
  /** 覆盖率报告 */
  coverage: CoverageReport;
  /** 是否达标 */
  passed: boolean;
  /** 审查评语（LLM 生成） */
  summary: string;
  /** 具体的审查建议 */
  suggestions: ReviewSuggestion[];
}

/** 审查建议 */
export interface ReviewSuggestion {
  /** 建议类型 */
  type: 'missing' | 'partial' | 'deviation' | 'extra';
  /** 关联的需求 ID */
  requirementId?: string;
  /** 建议详情 */
  message: string;
  /** 涉及的文件 */
  files?: string[];
}

// ─── LLM 输出 schema ────────────────────────────────────────

const CoverageAssessmentSchema = z.object({
  assessments: z.array(z.object({
    requirementId: z.string(),
    covered: z.boolean(),
    confidence: z.number().min(0).max(1),
    coveredBy: z.array(z.string()),
    reason: z.string(),
  })),
  summary: z.string(),
  suggestions: z.array(z.object({
    type: z.enum(['missing', 'partial', 'deviation', 'extra']),
    requirementId: z.string().optional(),
    message: z.string(),
    files: z.array(z.string()).optional(),
  })),
});

// ─── Prompt ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一位资深代码审查专家，擅长将 PR 代码变更与产品需求进行比对分析。

审查原则：
1. 逐条需求评估是否被 PR 代码覆盖
2. 注意区分"完全覆盖"和"部分覆盖"
3. 识别 PR 中超出需求范围的额外变更
4. 评估实现是否偏离需求描述的意图
5. 给出具体可操作的改进建议`;

// ─── PR 审查器实现 ──────────────────────────────────────────

/**
 * PR 审查器
 *
 * @example
 * ```typescript
 * const reviewer = new PRReviewer(llmClient, {
 *   githubToken: process.env.GITHUB_TOKEN,
 *   coverageThreshold: 80,
 * });
 *
 * const result = await reviewer.review(prdDoc, {
 *   owner: 'myorg',
 *   repo: 'myrepo',
 *   number: 42,
 * });
 *
 * if (!result.passed) {
 *   console.log('需求覆盖率未达标:', result.coverage.coveragePercent);
 * }
 * ```
 */
export class PRReviewer {
  private llm: LLMClient;
  private octokit: Octokit;
  private config: Required<ReviewerConfig>;

  constructor(llm: LLMClient, config: ReviewerConfig = {}) {
    this.llm = llm;
    this.config = {
      githubToken: config.githubToken ?? process.env.GITHUB_TOKEN ?? '',
      coverageThreshold: config.coverageThreshold ?? 80,
      useLLM: config.useLLM ?? true,
      llmOptions: config.llmOptions ?? {},
    };

    this.octokit = new Octokit({
      auth: this.config.githubToken,
    });
  }

  /**
   * 对 PR 进行完整的需求覆盖率审查
   *
   * @param doc - PRD 文档
   * @param prRef - PR 引用 (owner/repo#number 或 { owner, repo, number })
   * @returns 审查结果
   */
  async review(
    doc: PRDDocument,
    prRef: { owner: string; repo: string; number: number },
  ): Promise<ReviewResult> {
    // 1. 获取 PR 信息
    const prInfo = await this.fetchPRInfo(prRef);

    // 2. 计算覆盖率
    const coverage = this.config.useLLM
      ? await this.assessWithLLM(doc, prInfo)
      : this.assessWithKeywords(doc, prInfo);

    // 3. 生成审查结果
    const passed = coverage.coveragePercent >= this.config.coverageThreshold;

    return {
      pr: prInfo,
      coverage,
      passed,
      summary: this.generateSummary(coverage, passed),
      suggestions: this.generateSuggestions(coverage, doc),
    };
  }

  /**
   * 获取 PR 详情和 diff
   */
  async fetchPRInfo(
    prRef: { owner: string; repo: string; number: number },
  ): Promise<PRInfo> {
    // TODO: 替换为真实 GitHub API 调用
    // const { data: pr } = await this.octokit.pulls.get({
    //   owner: prRef.owner,
    //   repo: prRef.repo,
    //   pull_number: prRef.number,
    // });
    //
    // const { data: files } = await this.octokit.pulls.listFiles({
    //   owner: prRef.owner,
    //   repo: prRef.repo,
    //   pull_number: prRef.number,
    // });

    void this.octokit; // 避免未使用警告

    // TODO: 从 API 响应构造 PRInfo
    return {
      owner: prRef.owner,
      repo: prRef.repo,
      number: prRef.number,
      title: '', // TODO: pr.title
      body: '',  // TODO: pr.body
      changedFiles: [], // TODO: files.map(...)
    };
  }

  /**
   * 使用 LLM 进行语义级别的需求覆盖率评估
   */
  private async assessWithLLM(
    doc: PRDDocument,
    prInfo: PRInfo,
  ): Promise<CoverageReport> {
    const diffSummary = prInfo.changedFiles
      .map((f) => `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`)
      .join('\n');

    const requirementsSummary = doc.requirements
      .map((r) => `${r.id}: ${r.title}\n  验收标准: ${r.acceptanceCriteria.join('; ')}`)
      .join('\n\n');

    const prompt = `## PR 信息
标题: ${prInfo.title}
描述: ${prInfo.body}

## 变更文件
${diffSummary || '（无变更文件信息）'}

## PRD 需求列表
${requirementsSummary}

请逐条评估每个需求是否被这个 PR 覆盖，返回覆盖率评估结果。`;

    const result = await this.llm.callStructured(prompt, {
      schema: CoverageAssessmentSchema,
      schemaName: 'coverage_assessment',
      systemPrompt: SYSTEM_PROMPT,
      ...this.config.llmOptions,
    });

    const assessments = result.content.assessments;
    const coveredCount = assessments.filter((a) => a.covered).length;

    return {
      totalRequirements: doc.requirements.length,
      coveredRequirements: coveredCount,
      coveragePercent: doc.requirements.length > 0
        ? Math.round((coveredCount / doc.requirements.length) * 100)
        : 100,
      uncoveredIds: assessments.filter((a) => !a.covered).map((a) => a.requirementId),
      details: assessments.map((a) => ({
        requirementId: a.requirementId,
        covered: a.covered,
        coveredBy: a.coveredBy,
        confidence: a.confidence,
      })),
    };
  }

  /**
   * 基于关键词匹配的轻量级覆盖率评估（不依赖 LLM）
   *
   * 适用于快速预检或 LLM 不可用时的降级方案。
   */
  private assessWithKeywords(
    doc: PRDDocument,
    prInfo: PRInfo,
  ): CoverageReport {
    const prText = [
      prInfo.title,
      prInfo.body,
      ...prInfo.changedFiles.map((f) => f.filename),
      ...prInfo.changedFiles.map((f) => f.patch ?? ''),
    ].join('\n').toLowerCase();

    const details = doc.requirements.map((req) => {
      // 从需求标题和描述中提取关键词
      const keywords = this.extractKeywords(req);
      const matchCount = keywords.filter((kw) => prText.includes(kw.toLowerCase())).length;
      const covered = keywords.length > 0 && matchCount / keywords.length >= 0.3;

      return {
        requirementId: req.id,
        covered,
        coveredBy: covered ? prInfo.changedFiles.map((f) => f.filename) : [],
        confidence: keywords.length > 0 ? matchCount / keywords.length : 0,
      };
    });

    const coveredCount = details.filter((d) => d.covered).length;

    return {
      totalRequirements: doc.requirements.length,
      coveredRequirements: coveredCount,
      coveragePercent: doc.requirements.length > 0
        ? Math.round((coveredCount / doc.requirements.length) * 100)
        : 100,
      uncoveredIds: details.filter((d) => !d.covered).map((d) => d.requirementId),
      details,
    };
  }

  /**
   * 从需求中提取关键词用于文本匹配
   */
  private extractKeywords(req: Requirement): string[] {
    const text = `${req.title} ${req.description}`;
    // 提取中英文关键词（长度 >= 2 的词）
    const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) ?? [];
    // 去除常见停用词
    const stopWords = new Set(['需要', '支持', '实现', '功能', '用户', 'the', 'and', 'for']);
    return words.filter((w) => !stopWords.has(w.toLowerCase()));
  }

  /**
   * 生成审查摘要
   */
  private generateSummary(coverage: CoverageReport, passed: boolean): string {
    const status = passed ? '✅ 达标' : '❌ 未达标';
    return `${status} — 需求覆盖率 ${coverage.coveragePercent}%（${coverage.coveredRequirements}/${coverage.totalRequirements}），阈值 ${this.config.coverageThreshold}%`;
  }

  /**
   * 基于覆盖率结果生成改进建议
   */
  private generateSuggestions(
    coverage: CoverageReport,
    doc: PRDDocument,
  ): ReviewSuggestion[] {
    const suggestions: ReviewSuggestion[] = [];

    for (const id of coverage.uncoveredIds) {
      const req = doc.requirements.find((r) => r.id === id);
      suggestions.push({
        type: 'missing',
        requirementId: id,
        message: req
          ? `需求 ${id}「${req.title}」未被本次 PR 覆盖，请补充实现或拆分到后续 PR`
          : `需求 ${id} 未被覆盖`,
      });
    }

    // 标记低置信度的覆盖
    for (const detail of coverage.details) {
      if (detail.covered && detail.confidence !== undefined && detail.confidence < 0.5) {
        suggestions.push({
          type: 'partial',
          requirementId: detail.requirementId,
          message: `需求 ${detail.requirementId} 的覆盖置信度较低（${Math.round(detail.confidence * 100)}%），建议人工确认`,
          files: detail.coveredBy,
        });
      }
    }

    return suggestions;
  }

  /**
   * 将审查结果格式化为 GitHub PR 评论
   *
   * @param result - 审查结果
   * @returns Markdown 格式的评论内容
   */
  static formatAsPRComment(result: ReviewResult): string {
    const lines = [
      `## 🔍 PRD Pilot — 需求覆盖率报告`,
      '',
      result.summary,
      '',
      `### 详情`,
      '',
      '| 需求 ID | 状态 | 置信度 | 覆盖来源 |',
      '| --- | --- | --- | --- |',
    ];

    for (const detail of result.coverage.details) {
      const status = detail.covered ? '✅' : '❌';
      const confidence = detail.confidence !== undefined
        ? `${Math.round(detail.confidence * 100)}%`
        : '-';
      const sources = detail.coveredBy.length > 0
        ? detail.coveredBy.slice(0, 3).join(', ')
        : '-';
      lines.push(`| ${detail.requirementId} | ${status} | ${confidence} | ${sources} |`);
    }

    if (result.suggestions.length > 0) {
      lines.push('', '### 建议', '');
      for (const suggestion of result.suggestions) {
        const icon = suggestion.type === 'missing' ? '🔴'
          : suggestion.type === 'partial' ? '🟡'
          : suggestion.type === 'deviation' ? '🟠'
          : '🔵';
        lines.push(`${icon} ${suggestion.message}`);
      }
    }

    lines.push('', '---', '_由 PRD Pilot 自动生成_');

    return lines.join('\n');
  }
}
