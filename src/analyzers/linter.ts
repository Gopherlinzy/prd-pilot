/**
 * PRD 缺陷扫描器（Linter）
 *
 * 对 PRDDocument 执行一组静态分析规则，检测常见的需求质量问题。
 * 每条规则独立实现，可单独启用/禁用。
 *
 * 内置 8 条规则：
 * 1. missing-acceptance-criteria  — 需求缺少验收标准
 * 2. ambiguous-language           — 使用了模糊表述
 * 3. missing-error-handling       — 未描述异常处理
 * 4. missing-boundary             — 缺少边界条件
 * 5. undefined-data-model         — 引用了未定义的数据模型
 * 6. incomplete-flow              — 交互流程不完整
 * 7. no-priority                  — 需求未标注优先级
 * 8. circular-dependency          — 需求间存在循环依赖
 */

import type { PRDDocument, LintIssue, Requirement, PRDSection, LintRuleId, Severity } from '../types/prd';

// ─── 规则定义 ─────────────────────────────────────────────────

/** 单条 lint 规则的实现 */
export interface LintRule {
  /** 规则 ID */
  id: LintRuleId;
  /** 规则描述 */
  description: string;
  /** 默认严重程度 */
  severity: Severity;
  /**
   * 执行规则检查
   *
   * @param doc - 待检查的 PRD 文档
   * @returns 检测到的问题列表（空数组表示通过）
   */
  check(doc: PRDDocument): LintIssue[];
}

/** Linter 配置 */
export interface LinterConfig {
  /** 要禁用的规则 ID 列表 */
  disabledRules?: LintRuleId[];
  /** 覆盖规则的严重程度 */
  severityOverrides?: Partial<Record<LintRuleId, Severity>>;
}

// ─── 模糊词库 ─────────────────────────────────────────────────

/** 中文模糊词 */
const AMBIGUOUS_WORDS_ZH = [
  '大概', '可能', '也许', '左右', '等等', '之类的',
  '适当', '合理', '尽量', '差不多', '若干', '一些',
  '较快', '较好', '足够', '基本上', '通常',
];

/** 英文模糊词 */
const AMBIGUOUS_WORDS_EN = [
  'maybe', 'probably', 'approximately', 'etc', 'and so on',
  'appropriate', 'reasonable', 'as needed', 'some', 'several',
  'fast enough', 'good enough', 'basically', 'usually',
];

const ALL_AMBIGUOUS_WORDS = [...AMBIGUOUS_WORDS_ZH, ...AMBIGUOUS_WORDS_EN];

// ─── 规则实现 ─────────────────────────────────────────────────

/**
 * 规则 1: 缺少验收标准
 *
 * 检查每条需求是否包含至少一条验收标准。
 * 没有明确验收标准的需求在开发和测试阶段会导致理解偏差。
 */
const missingAcceptanceCriteria: LintRule = {
  id: 'missing-acceptance-criteria',
  description: '需求缺少验收标准',
  severity: 'error',
  check(doc) {
    const issues: LintIssue[] = [];
    for (const req of doc.requirements) {
      if (!req.acceptanceCriteria || req.acceptanceCriteria.length === 0) {
        issues.push({
          ruleId: 'missing-acceptance-criteria',
          severity: 'error',
          message: `需求 ${req.id}「${req.title}」缺少验收标准`,
          requirementId: req.id,
          suggestion: '为该需求补充至少一条可验证的验收标准，格式建议：Given/When/Then',
        });
      }
    }
    return issues;
  },
};

/**
 * 规则 2: 模糊表述
 *
 * 扫描需求描述和章节内容中的模糊词汇。
 * 模糊表述会导致开发者对需求的理解产生歧义。
 */
const ambiguousLanguage: LintRule = {
  id: 'ambiguous-language',
  description: '使用了模糊表述',
  severity: 'warning',
  check(doc) {
    const issues: LintIssue[] = [];

    // 检查需求描述
    for (const req of doc.requirements) {
      const found = findAmbiguousWords(req.description);
      if (found.length > 0) {
        issues.push({
          ruleId: 'ambiguous-language',
          severity: 'warning',
          message: `需求 ${req.id} 的描述中包含模糊表述：「${found.join('」「')}」`,
          requirementId: req.id,
          suggestion: '将模糊表述替换为可量化、可验证的具体描述',
        });
      }
    }

    // 检查章节内容
    for (const section of flattenSections(doc.sections)) {
      const found = findAmbiguousWords(section.content);
      if (found.length > 0) {
        issues.push({
          ruleId: 'ambiguous-language',
          severity: 'warning',
          message: `章节「${section.title}」中包含模糊表述：「${found.join('」「')}」`,
          sectionTitle: section.title,
          suggestion: '将模糊表述替换为具体的数值、条件或标准',
        });
      }
    }

    return issues;
  },
};

/**
 * 规则 3: 缺少异常处理描述
 *
 * 检查功能需求中是否提及了错误处理、异常情况、降级策略等。
 * 缺少异常处理描述是线上事故的常见根因。
 */
const missingErrorHandling: LintRule = {
  id: 'missing-error-handling',
  description: '未描述异常/错误处理流程',
  severity: 'warning',
  check(doc) {
    const issues: LintIssue[] = [];
    const errorKeywords = [
      '错误', '异常', '失败', '超时', '降级', '重试', '兜底',
      'error', 'exception', 'fail', 'timeout', 'fallback', 'retry',
    ];

    for (const req of doc.requirements) {
      const text = `${req.description} ${req.acceptanceCriteria.join(' ')}`;
      const hasErrorHandling = errorKeywords.some((kw) => text.includes(kw));
      if (!hasErrorHandling) {
        issues.push({
          ruleId: 'missing-error-handling',
          severity: 'warning',
          message: `需求 ${req.id}「${req.title}」未描述异常处理流程`,
          requirementId: req.id,
          suggestion: '补充：网络异常、数据为空、并发冲突、超时等场景的处理方式',
        });
      }
    }

    return issues;
  },
};

/**
 * 规则 4: 缺少边界条件
 *
 * 检查需求是否定义了输入/输出的边界值、上下限、极端情况。
 */
const missingBoundary: LintRule = {
  id: 'missing-boundary',
  description: '缺少边界条件说明',
  severity: 'warning',
  check(doc) {
    const issues: LintIssue[] = [];
    const boundaryKeywords = [
      '最大', '最小', '上限', '下限', '范围', '边界', '极端', '为空',
      'max', 'min', 'limit', 'range', 'boundary', 'edge case', 'empty',
    ];

    for (const req of doc.requirements) {
      const text = `${req.description} ${req.acceptanceCriteria.join(' ')}`;
      const hasBoundary = boundaryKeywords.some((kw) => text.includes(kw));
      if (!hasBoundary) {
        issues.push({
          ruleId: 'missing-boundary',
          severity: 'warning',
          message: `需求 ${req.id}「${req.title}」缺少边界条件说明`,
          requirementId: req.id,
          suggestion: '补充输入数据的最大/最小值、列表长度上限、特殊字符处理等边界条件',
        });
      }
    }

    return issues;
  },
};

/**
 * 规则 5: 引用了未定义的数据模型
 *
 * 检查需求和章节中引用的数据实体是否在 data_model 章节中有定义。
 */
const undefinedDataModel: LintRule = {
  id: 'undefined-data-model',
  description: '引用了未定义的数据模型',
  severity: 'error',
  check(doc) {
    const issues: LintIssue[] = [];

    // 收集已定义的数据模型名称
    const definedModels = new Set<string>();
    for (const section of flattenSections(doc.sections)) {
      if (section.type === 'data_model') {
        // 提取 section 内容中被 `` 或 ** 包裹的实体名
        const modelNames = section.content.match(/[`*]{1,2}(\w+)[`*]{1,2}/g);
        modelNames?.forEach((name) => {
          definedModels.add(name.replace(/[`*]/g, ''));
        });
      }
    }

    // 如果文档没有数据模型章节，跳过此规则
    if (definedModels.size === 0) {
      const hasDataSection = flattenSections(doc.sections).some((s) => s.type === 'data_model');
      if (!hasDataSection) return issues;
    }

    // 在功能需求中查找引用了但未定义的模型
    for (const section of flattenSections(doc.sections)) {
      if (section.type === 'functional' || section.type === 'interaction_flow') {
        const references = section.content.match(/[`*]{1,2}(\w+)[`*]{1,2}/g) ?? [];
        for (const ref of references) {
          const name = ref.replace(/[`*]/g, '');
          // 排除常见非模型词汇
          if (name.length > 2 && !definedModels.has(name) && /^[A-Z]/.test(name)) {
            issues.push({
              ruleId: 'undefined-data-model',
              severity: 'error',
              message: `章节「${section.title}」引用了未定义的数据模型: ${name}`,
              sectionTitle: section.title,
              suggestion: `在数据模型章节中补充 ${name} 的定义，包括字段、类型和约束`,
            });
          }
        }
      }
    }

    return issues;
  },
};

/**
 * 规则 6: 交互流程不完整
 *
 * 检查交互流程类章节是否包含完整的分支（成功/失败）和终态。
 */
const incompleteFlow: LintRule = {
  id: 'incomplete-flow',
  description: '交互流程不完整（缺少分支或终态）',
  severity: 'error',
  check(doc) {
    const issues: LintIssue[] = [];
    const flowSections = flattenSections(doc.sections).filter(
      (s) => s.type === 'interaction_flow',
    );

    for (const section of flowSections) {
      const content = section.content.toLowerCase();

      // 检查是否包含成功路径
      const hasSuccessPath = /成功|完成|确认|success|complete|done/.test(content);
      // 检查是否包含失败路径
      const hasFailurePath = /失败|取消|异常|拒绝|fail|cancel|error|reject/.test(content);
      // 检查是否有终态描述
      const hasEndState = /结束|返回|跳转|终态|end|redirect|return/.test(content);

      if (!hasSuccessPath || !hasFailurePath) {
        issues.push({
          ruleId: 'incomplete-flow',
          severity: 'error',
          message: `章节「${section.title}」的交互流程缺少${!hasSuccessPath ? '成功' : ''}${!hasSuccessPath && !hasFailurePath ? '和' : ''}${!hasFailurePath ? '失败' : ''}路径`,
          sectionTitle: section.title,
          suggestion: '补充完整的成功路径和失败路径，确保每个分支都有明确的终态',
        });
      }

      if (!hasEndState) {
        issues.push({
          ruleId: 'incomplete-flow',
          severity: 'warning',
          message: `章节「${section.title}」的交互流程缺少明确的终态描述`,
          sectionTitle: section.title,
          suggestion: '明确标注流程的结束状态，如页面跳转、弹窗关闭或状态变更',
        });
      }
    }

    return issues;
  },
};

/**
 * 规则 7: 未标注优先级
 *
 * 检查每条需求是否标注了优先级。
 * 缺少优先级会影响迭代排期和资源分配。
 */
const noPriority: LintRule = {
  id: 'no-priority',
  description: '需求未标注优先级',
  severity: 'info',
  check(doc) {
    const issues: LintIssue[] = [];
    for (const req of doc.requirements) {
      if (!req.priority) {
        issues.push({
          ruleId: 'no-priority',
          severity: 'info',
          message: `需求 ${req.id}「${req.title}」未标注优先级`,
          requirementId: req.id,
          suggestion: '标注 P0（紧急）/ P1（重要）/ P2（一般）/ P3（低优）优先级',
        });
      }
    }
    return issues;
  },
};

/**
 * 规则 8: 循环依赖
 *
 * 检测需求间的依赖关系是否存在环。
 * 循环依赖会导致开发排期死锁。
 */
const circularDependency: LintRule = {
  id: 'circular-dependency',
  description: '需求间存在循环依赖',
  severity: 'error',
  check(doc) {
    const issues: LintIssue[] = [];

    // 构建邻接表
    const graph = new Map<string, string[]>();
    for (const req of doc.requirements) {
      graph.set(req.id, req.dependencies);
    }

    // DFS 检测环
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): string[] | null => {
      if (inStack.has(nodeId)) {
        // 找到环，返回环路径
        const cycleStart = path.indexOf(nodeId);
        return path.slice(cycleStart).concat(nodeId);
      }
      if (visited.has(nodeId)) return null;

      visited.add(nodeId);
      inStack.add(nodeId);
      path.push(nodeId);

      for (const dep of graph.get(nodeId) ?? []) {
        const cycle = dfs(dep, path);
        if (cycle) return cycle;
      }

      inStack.delete(nodeId);
      path.pop();
      return null;
    };

    for (const reqId of graph.keys()) {
      if (!visited.has(reqId)) {
        const cycle = dfs(reqId, []);
        if (cycle) {
          issues.push({
            ruleId: 'circular-dependency',
            severity: 'error',
            message: `检测到循环依赖: ${cycle.join(' → ')}`,
            requirementId: reqId,
            suggestion: '重新梳理需求依赖关系，拆分或合并存在循环的需求',
          });
        }
      }
    }

    return issues;
  },
};

// ─── 内置规则注册表 ─────────────────────────────────────────

/** 所有内置规则 */
const BUILT_IN_RULES: LintRule[] = [
  missingAcceptanceCriteria,
  ambiguousLanguage,
  missingErrorHandling,
  missingBoundary,
  undefinedDataModel,
  incompleteFlow,
  noPriority,
  circularDependency,
];

// ─── 工具函数 ─────────────────────────────────────────────────

/** 递归展平嵌套的 section 树为扁平列表 */
function flattenSections(sections: PRDSection[]): PRDSection[] {
  const result: PRDSection[] = [];
  for (const section of sections) {
    result.push(section);
    if (section.children.length > 0) {
      result.push(...flattenSections(section.children));
    }
  }
  return result;
}

/** 在文本中查找模糊词汇 */
function findAmbiguousWords(text: string): string[] {
  return ALL_AMBIGUOUS_WORDS.filter((word) => text.includes(word));
}

// ─── Linter 主类 ──────────────────────────────────────────────

/**
 * PRD 缺陷扫描器
 *
 * @example
 * ```typescript
 * const linter = new PRDLinter();
 * const issues = linter.lint(prdDocument);
 *
 * const errors = issues.filter(i => i.severity === 'error');
 * console.log(`发现 ${errors.length} 个严重问题`);
 * ```
 */
export class PRDLinter {
  private rules: LintRule[];
  private config: LinterConfig;

  constructor(config: LinterConfig = {}) {
    this.config = config;
    this.rules = BUILT_IN_RULES.filter(
      (rule) => !config.disabledRules?.includes(rule.id),
    );
  }

  /**
   * 对 PRD 文档执行全量扫描
   *
   * @param doc - 待扫描的 PRD 文档
   * @returns 检测到的所有问题列表，按严重程度降序排列
   */
  lint(doc: PRDDocument): LintIssue[] {
    const allIssues: LintIssue[] = [];

    for (const rule of this.rules) {
      const issues = rule.check(doc);
      // 应用严重程度覆盖
      const overrideSeverity = this.config.severityOverrides?.[rule.id];
      if (overrideSeverity) {
        issues.forEach((issue) => { issue.severity = overrideSeverity; });
      }
      allIssues.push(...issues);
    }

    // 按严重程度排序：error > warning > info
    const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
    return allIssues.sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
    );
  }

  /**
   * 仅执行指定规则
   *
   * @param doc - 待扫描的 PRD 文档
   * @param ruleIds - 要执行的规则 ID 列表
   * @returns 检测到的问题列表
   */
  lintWithRules(doc: PRDDocument, ruleIds: LintRuleId[]): LintIssue[] {
    const selectedRules = this.rules.filter((r) => ruleIds.includes(r.id));
    const issues: LintIssue[] = [];
    for (const rule of selectedRules) {
      issues.push(...rule.check(doc));
    }
    return issues;
  }

  /**
   * 获取当前已启用的规则列表
   */
  getEnabledRules(): ReadonlyArray<{ id: LintRuleId; description: string; severity: Severity }> {
    return this.rules.map((r) => ({
      id: r.id,
      description: r.description,
      severity: r.severity,
    }));
  }

  /**
   * 生成 lint 结果的可读摘要
   *
   * @param issues - lint 问题列表
   * @returns 格式化的文本摘要
   */
  static formatSummary(issues: LintIssue[]): string {
    if (issues.length === 0) return '✅ 未发现问题，PRD 质量良好';

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    const lines = [
      `📋 PRD Lint 报告: ${errorCount} error, ${warningCount} warning, ${infoCount} info`,
      '',
    ];

    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${icon} [${issue.ruleId}] ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`  💡 ${issue.suggestion}`);
      }
    }

    return lines.join('\n');
  }
}

// 导出内置规则供外部扩展使用
export { BUILT_IN_RULES, flattenSections, findAmbiguousWords };
export type { LintRule };
