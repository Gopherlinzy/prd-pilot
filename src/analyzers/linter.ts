import type { PRDDocument, LintIssue, Severity } from '../types/prd';

// ============================================================
// PRD Linter — Scans PRD documents for common defects
// ============================================================

/** A single lint rule definition */
interface LintRule {
  /** Unique rule ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Default severity */
  severity: Severity;
  /** Description of what this rule checks */
  description: string;
  /** The check function */
  check(prd: PRDDocument): LintIssue[];
}

/**
 * PRDLinter — the core analysis engine.
 *
 * Built-in rules detect common PRD defects that lead to
 * implementation gaps, scope creep, and quality issues.
 */
export class PRDLinter {
  private rules: LintRule[];

  constructor() {
    this.rules = [
      missingAcceptanceCriteria,
      ambiguousLanguage,
      missingErrorHandling,
      missingBoundaryConditions,
      undefinedDataModel,
      incompleteFlow,
      noPriority,
      circularDependency,
    ];
  }

  /**
   * Run all lint rules against a PRD document.
   * @returns Array of issues found, sorted by severity
   */
  lint(prd: PRDDocument): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const rule of this.rules) {
      issues.push(...rule.check(prd));
    }
    // Sort: error > warning > info
    const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
    return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /** Get summary statistics */
  summary(issues: LintIssue[]): { errors: number; warnings: number; infos: number; total: number } {
    return {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      infos: issues.filter(i => i.severity === 'info').length,
      total: issues.length,
    };
  }
}

// ============================================================
// Built-in Lint Rules
// ============================================================

const missingAcceptanceCriteria: LintRule = {
  id: 'missing-acceptance-criteria',
  name: 'Missing Acceptance Criteria',
  severity: 'error',
  description: 'Every requirement should have at least one acceptance criterion',
  check(prd) {
    return prd.requirements
      .filter(req => req.acceptanceCriteria.length === 0)
      .map(req => ({
        rule: 'missing-acceptance-criteria',
        severity: 'error' as const,
        message: `Requirement "${req.title}" has no acceptance criteria`,
        location: { requirementId: req.id },
        suggestion: 'Add specific, testable acceptance criteria',
      }));
  },
};

const ambiguousLanguage: LintRule = {
  id: 'ambiguous-language',
  name: 'Ambiguous Language',
  severity: 'warning',
  description: 'Detects vague/ambiguous terms that lead to misinterpretation',
  check(prd) {
    const ambiguousTerms = [
      '尽量', '适当', '尽快', '大概', '可能', '应该', '一般',
      'approximately', 'maybe', 'should', 'generally', 'as soon as possible',
      'reasonable', 'appropriate', 'etc', 'and so on',
    ];
    const issues: LintIssue[] = [];
    for (const req of prd.requirements) {
      const text = `${req.title} ${req.description}`;
      for (const term of ambiguousTerms) {
        if (text.toLowerCase().includes(term.toLowerCase())) {
          issues.push({
            rule: 'ambiguous-language',
            severity: 'warning',
            message: `Requirement "${req.title}" contains ambiguous term: "${term}"`,
            location: { requirementId: req.id },
            suggestion: `Replace "${term}" with a specific, measurable criterion`,
          });
        }
      }
    }
    return issues;
  },
};

const missingErrorHandling: LintRule = {
  id: 'missing-error-handling',
  name: 'Missing Error Handling',
  severity: 'warning',
  description: 'Requirements should describe error/exception scenarios',
  check(prd) {
    const errorKeywords = ['error', 'exception', 'fail', 'timeout', 'retry', '异常', '失败', '超时', '重试', '错误'];
    return prd.requirements
      .filter(req => {
        const text = `${req.description} ${req.acceptanceCriteria.join(' ')}`.toLowerCase();
        return !errorKeywords.some(kw => text.includes(kw));
      })
      .map(req => ({
        rule: 'missing-error-handling',
        severity: 'warning' as const,
        message: `Requirement "${req.title}" has no error/exception handling described`,
        location: { requirementId: req.id },
        suggestion: 'Describe what happens when this feature fails (network error, invalid input, timeout, etc.)',
      }));
  },
};

const missingBoundaryConditions: LintRule = {
  id: 'missing-boundary-conditions',
  name: 'Missing Boundary Conditions',
  severity: 'warning',
  description: 'Requirements should define limits, maximums, and edge cases',
  check(prd) {
    const boundaryKeywords = ['max', 'min', 'limit', 'boundary', 'edge', '最大', '最小', '上限', '下限', '边界'];
    return prd.requirements
      .filter(req => {
        const text = `${req.description} ${req.acceptanceCriteria.join(' ')}`.toLowerCase();
        return !boundaryKeywords.some(kw => text.includes(kw));
      })
      .map(req => ({
        rule: 'missing-boundary-conditions',
        severity: 'warning' as const,
        message: `Requirement "${req.title}" has no boundary conditions defined`,
        location: { requirementId: req.id },
        suggestion: 'Define limits: max input length, max concurrent users, timeout thresholds, etc.',
      }));
  },
};

const undefinedDataModel: LintRule = {
  id: 'undefined-data-model',
  name: 'Undefined Data Model',
  severity: 'error',
  description: 'Requirements reference entities not defined in the data model section',
  check(prd) {
    // TODO: Implement entity reference cross-check
    // 1. Extract entity names from dataModels
    // 2. Scan requirement descriptions for entity references
    // 3. Flag any referenced but undefined entities
    return [];
  },
};

const incompleteFlow: LintRule = {
  id: 'incomplete-flow',
  name: 'Incomplete Flow',
  severity: 'warning',
  description: 'User flows should cover happy path AND error/alternative paths',
  check(prd) {
    return prd.flows
      .filter(flow => flow.steps.length > 0 && flow.steps.length < 3)
      .map(flow => ({
        rule: 'incomplete-flow',
        severity: 'warning' as const,
        message: `Flow "${flow.name}" has only ${flow.steps.length} steps — likely missing alternative paths`,
        location: { sectionId: flow.name },
        suggestion: 'Add error paths, cancellation paths, and edge case branches',
      }));
  },
};

const noPriority: LintRule = {
  id: 'no-priority',
  name: 'No Priority Assigned',
  severity: 'info',
  description: 'Requirements should have explicit priority for sprint planning',
  check(prd) {
    return prd.requirements
      .filter(req => !req.priority)
      .map(req => ({
        rule: 'no-priority',
        severity: 'info' as const,
        message: `Requirement "${req.title}" has no priority assigned`,
        location: { requirementId: req.id },
        suggestion: 'Assign P0 (must-have), P1 (should-have), P2 (nice-to-have), or P3 (future)',
      }));
  },
};

const circularDependency: LintRule = {
  id: 'circular-dependency',
  name: 'Circular Dependency',
  severity: 'error',
  description: 'Requirements should not have circular dependency chains',
  check(prd) {
    const issues: LintIssue[] = [];
    const adjList = new Map<string, string[]>();
    for (const req of prd.requirements) {
      adjList.set(req.id, req.dependencies);
    }
    // Simple cycle detection via DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function dfs(nodeId: string, path: string[]): boolean {
      if (inStack.has(nodeId)) {
        issues.push({
          rule: 'circular-dependency',
          severity: 'error',
          message: `Circular dependency detected: ${[...path, nodeId].join(' → ')}`,
          location: { requirementId: nodeId },
          suggestion: 'Break the dependency cycle by re-scoping one of the requirements',
        });
        return true;
      }
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const dep of adjList.get(nodeId) ?? []) {
        dfs(dep, [...path, nodeId]);
      }
      inStack.delete(nodeId);
      return false;
    }

    for (const req of prd.requirements) {
      dfs(req.id, []);
    }
    return issues;
  },
};
