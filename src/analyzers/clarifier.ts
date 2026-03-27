/**
 * 需求澄清器
 *
 * 基于 PRD Lint 结果，自动生成反向提问（Clarification Questions），
 * 帮助产品经理补全需求中的模糊/缺失部分。
 *
 * 工作流：
 * 1. 接收 LintIssue 列表
 * 2. 按规则类型分组
 * 3. 调用 LLM 生成有针对性的澄清问题
 * 4. 输出结构化的问题列表（可直接发送到飞书评论或 GitHub Issue）
 */

import { z } from 'zod';
import type { LLMClient, CallOptions } from '../llm/client';
import type { PRDDocument, LintIssue, LintRuleId } from '../types/prd';

// ─── 数据模型 ─────────────────────────────────────────────────

/** 单条澄清问题 */
export interface ClarificationQuestion {
  /** 问题编号 */
  index: number;
  /** 问题文本 */
  question: string;
  /** 问题分类（对应 lint 规则） */
  category: LintRuleId;
  /** 关联的需求 ID */
  requirementId?: string;
  /** 关联的章节标题 */
  sectionTitle?: string;
  /** 建议的回答格式 */
  suggestedFormat?: string;
  /** 参考案例（帮助产品经理理解期望） */
  example?: string;
}

/** 澄清报告 */
export interface ClarificationReport {
  /** PRD 文档 ID */
  documentId: string;
  /** 生成时间 */
  generatedAt: string;
  /** 问题列表 */
  questions: ClarificationQuestion[];
  /** 问题总数 */
  totalQuestions: number;
  /** 按分类统计 */
  categoryCounts: Record<string, number>;
}

/** 澄清器配置 */
export interface ClarifierConfig {
  /** 每条 lint issue 最多生成几个问题 */
  maxQuestionsPerIssue?: number;
  /** 总问题上限 */
  maxTotalQuestions?: number;
  /** 是否生成示例 */
  includeExamples?: boolean;
  /** LLM 调用选项 */
  llmOptions?: CallOptions;
}

// ─── LLM 输出 schema ────────────────────────────────────────

const QuestionsResponseSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    suggestedFormat: z.string().optional(),
    example: z.string().optional(),
  })),
});

// ─── Prompt 模板 ─────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一位资深的需求分析师，擅长发现 PRD 中的模糊点和遗漏，
并生成高质量的反向提问，帮助产品经理补全需求。

提问原则：
1. 问题要具体，不要泛泛而谈
2. 每个问题对应一个确切的信息缺口
3. 提供建议的回答格式，降低回答门槛
4. 必要时给出参考案例
5. 使用产品经理能理解的语言，避免过于技术化`;

/** 按规则类型生成针对性 prompt */
const RULE_PROMPT_TEMPLATES: Record<LintRuleId, string> = {
  'missing-acceptance-criteria': `以下需求缺少验收标准。请生成具体的问题，引导产品经理补充可验证的验收条件。
问题应涉及：预期结果、边界情况、性能要求等。`,

  'ambiguous-language': `以下内容包含模糊表述。请生成问题，将模糊描述转化为具体、可量化的要求。
关注：具体数值、明确条件、可度量指标。`,

  'missing-error-handling': `以下需求未描述异常处理。请生成问题，引导补充完整的异常场景和处理策略。
关注：网络异常、数据异常、并发冲突、降级方案。`,

  'missing-boundary': `以下需求缺少边界条件。请生成问题，引导补充输入输出的边界值和极端情况。
关注：最大最小值、空值处理、特殊字符、极端数据量。`,

  'undefined-data-model': `以下内容引用了未定义的数据模型。请生成问题，引导补充数据模型的定义。
关注：字段列表、数据类型、必填/可选、唯一性约束。`,

  'incomplete-flow': `以下交互流程不完整。请生成问题，引导补充缺失的分支和终态。
关注：异常分支、取消流程、超时处理、并发操作。`,

  'no-priority': `以下需求未标注优先级。请生成问题，帮助确定需求的优先级排序。
关注：业务价值、紧急程度、技术依赖、用户影响。`,

  'circular-dependency': `以下需求存在循环依赖。请生成问题，帮助理清需求间的实际依赖关系。
关注：哪个需求应该先实现、是否可以解耦、是否存在误标的依赖。`,
};

// ─── 澄清器实现 ─────────────────────────────────────────────

/**
 * 需求澄清器
 *
 * @example
 * ```typescript
 * const clarifier = new RequirementClarifier(llmClient);
 * const lintIssues = linter.lint(prdDoc);
 * const report = await clarifier.generateQuestions(prdDoc, lintIssues);
 *
 * // 格式化为 Markdown
 * const markdown = RequirementClarifier.formatAsMarkdown(report);
 * ```
 */
export class RequirementClarifier {
  private llm: LLMClient;
  private config: Required<ClarifierConfig>;

  constructor(llm: LLMClient, config: ClarifierConfig = {}) {
    this.llm = llm;
    this.config = {
      maxQuestionsPerIssue: config.maxQuestionsPerIssue ?? 3,
      maxTotalQuestions: config.maxTotalQuestions ?? 20,
      includeExamples: config.includeExamples ?? true,
      llmOptions: config.llmOptions ?? {},
    };
  }

  /**
   * 基于 lint 结果生成澄清问题
   *
   * @param doc - PRD 文档
   * @param issues - lint 检测到的问题列表
   * @returns 结构化的澄清报告
   */
  async generateQuestions(
    doc: PRDDocument,
    issues: LintIssue[],
  ): Promise<ClarificationReport> {
    if (issues.length === 0) {
      return this.emptyReport(doc.id);
    }

    // 按规则分组
    const grouped = this.groupByRule(issues);
    const allQuestions: ClarificationQuestion[] = [];
    let questionIndex = 1;

    // 逐组生成问题
    for (const [ruleId, ruleIssues] of grouped) {
      if (allQuestions.length >= this.config.maxTotalQuestions) break;

      const questions = await this.generateForRule(
        doc,
        ruleId,
        ruleIssues,
      );

      for (const q of questions) {
        if (allQuestions.length >= this.config.maxTotalQuestions) break;
        allQuestions.push({
          ...q,
          index: questionIndex++,
          category: ruleId,
        });
      }
    }

    return {
      documentId: doc.id,
      generatedAt: new Date().toISOString(),
      questions: allQuestions,
      totalQuestions: allQuestions.length,
      categoryCounts: this.countByCategory(allQuestions),
    };
  }

  /**
   * 将澄清报告格式化为 Markdown 文本
   *
   * @param report - 澄清报告
   * @returns Markdown 格式的问题列表
   */
  static formatAsMarkdown(report: ClarificationReport): string {
    if (report.questions.length === 0) {
      return '## ✅ 无需澄清\n\nPRD 内容完整，未发现需要补充的信息。';
    }

    const lines = [
      `## 📝 PRD 澄清问题（共 ${report.totalQuestions} 个）`,
      '',
      `> 生成时间: ${report.generatedAt}`,
      '',
    ];

    // 按分类输出
    const byCategory = new Map<string, ClarificationQuestion[]>();
    for (const q of report.questions) {
      const list = byCategory.get(q.category) ?? [];
      list.push(q);
      byCategory.set(q.category, list);
    }

    for (const [category, questions] of byCategory) {
      lines.push(`### ${CATEGORY_DISPLAY_NAMES[category as LintRuleId] ?? category}`);
      lines.push('');
      for (const q of questions) {
        lines.push(`**Q${q.index}.** ${q.question}`);
        if (q.requirementId) {
          lines.push(`  - 关联需求: ${q.requirementId}`);
        }
        if (q.suggestedFormat) {
          lines.push(`  - 建议回答格式: ${q.suggestedFormat}`);
        }
        if (q.example) {
          lines.push(`  - 参考示例: ${q.example}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // ─── 私有方法 ───────────────────────────────────────────────

  /**
   * 为指定规则的 issues 生成澄清问题
   */
  private async generateForRule(
    doc: PRDDocument,
    ruleId: LintRuleId,
    issues: LintIssue[],
  ): Promise<Omit<ClarificationQuestion, 'index' | 'category'>[]> {
    const rulePrompt = RULE_PROMPT_TEMPLATES[ruleId] ?? '';
    const issueDescriptions = issues
      .map((issue) => `- ${issue.message}${issue.suggestion ? `（建议: ${issue.suggestion}）` : ''}`)
      .join('\n');

    const prompt = `## PRD 标题
${doc.title}

## 检测到的问题
${issueDescriptions}

${rulePrompt}

请为每个问题生成最多 ${this.config.maxQuestionsPerIssue} 个澄清问题。
${this.config.includeExamples ? '每个问题附带建议的回答格式和参考示例。' : ''}`;

    const result = await this.llm.callStructured(prompt, {
      schema: QuestionsResponseSchema,
      schemaName: 'clarification_questions',
      systemPrompt: SYSTEM_PROMPT,
      ...this.config.llmOptions,
    });

    return result.content.questions.map((q) => ({
      question: q.question,
      requirementId: issues[0]?.requirementId,
      sectionTitle: issues[0]?.sectionTitle,
      suggestedFormat: q.suggestedFormat,
      example: q.example,
    }));
  }

  /** 按规则 ID 分组 */
  private groupByRule(issues: LintIssue[]): Map<LintRuleId, LintIssue[]> {
    const grouped = new Map<LintRuleId, LintIssue[]>();
    for (const issue of issues) {
      const list = grouped.get(issue.ruleId) ?? [];
      list.push(issue);
      grouped.set(issue.ruleId, list);
    }
    return grouped;
  }

  /** 统计各分类的问题数 */
  private countByCategory(questions: ClarificationQuestion[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const q of questions) {
      counts[q.category] = (counts[q.category] ?? 0) + 1;
    }
    return counts;
  }

  /** 生成空报告 */
  private emptyReport(documentId: string): ClarificationReport {
    return {
      documentId,
      generatedAt: new Date().toISOString(),
      questions: [],
      totalQuestions: 0,
      categoryCounts: {},
    };
  }
}

/** 规则分类的可读名称 */
const CATEGORY_DISPLAY_NAMES: Record<LintRuleId, string> = {
  'missing-acceptance-criteria': '缺少验收标准',
  'ambiguous-language': '模糊表述',
  'missing-error-handling': '异常处理缺失',
  'missing-boundary': '边界条件缺失',
  'undefined-data-model': '数据模型未定义',
  'incomplete-flow': '流程不完整',
  'no-priority': '优先级未标注',
  'circular-dependency': '循环依赖',
};
