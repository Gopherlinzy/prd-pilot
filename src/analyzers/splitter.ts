/**
 * 需求拆分器
 *
 * 使用 LLM 将 PRD 中的需求拆分为可执行的开发任务（GitHub Issues）。
 * 拆分策略：
 * - 按功能模块拆分，每个 Issue 对应一个独立可交付的工作单元
 * - 保留需求到任务的追溯关系
 * - 自动生成 Issue body（包含上下文、验收标准、依赖）
 */

import { z } from 'zod';
import type { LLMClient, CallOptions } from '../llm/client';
import type { PRDDocument, Requirement, TaskItem } from '../types/prd';
import { TaskItemSchema } from '../types/prd';

// ─── 配置 ─────────────────────────────────────────────────────

/** 拆分器配置 */
export interface SplitterConfig {
  /** 单条需求最多拆分为多少个任务 */
  maxTasksPerRequirement?: number;
  /** 目标粒度（人天），LLM 会尽量按此粒度拆分 */
  targetGranularityDays?: number;
  /** 是否生成任务间的依赖关系 */
  includeDependencies?: boolean;
  /** 自定义 label 映射（优先级 → GitHub label） */
  labelMapping?: Record<string, string[]>;
  /** LLM 调用选项 */
  llmOptions?: CallOptions;
}

/** LLM 返回的拆分结果 schema */
const SplitResultSchema = z.object({
  tasks: z.array(TaskItemSchema),
  reasoning: z.string().describe('拆分思路说明'),
});

// ─── 默认 Prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一位资深的技术项目经理，擅长将产品需求拆分为可执行的开发任务。

拆分原则：
1. 每个任务应该是独立可交付的工作单元
2. 任务粒度控制在 0.5-3 人天
3. 任务描述要具体到技术实现层面（API / 组件 / 数据库 等）
4. 保留验收标准的追溯关系
5. 明确标注任务间的前后依赖
6. 合理分配 GitHub Labels（feature / bug / tech-debt / documentation）`;

/**
 * 构建拆分 prompt
 */
function buildSplitPrompt(
  requirement: Requirement,
  doc: PRDDocument,
  config: SplitterConfig,
): string {
  return `请将以下需求拆分为开发任务（GitHub Issues）。

## PRD 上下文
- 文档标题: ${doc.title}
- 文档版本: ${doc.version}

## 待拆分需求
- ID: ${requirement.id}
- 标题: ${requirement.title}
- 优先级: ${requirement.priority}
- 描述:
${requirement.description}

## 验收标准
${requirement.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')}

## 依赖需求
${requirement.dependencies.length > 0 ? requirement.dependencies.join(', ') : '无'}

## 拆分要求
- 目标粒度: ${config.targetGranularityDays ?? 1} 人天/任务
- 最多拆分为 ${config.maxTasksPerRequirement ?? 8} 个任务
- ${config.includeDependencies ? '需要' : '不需要'}标注任务间依赖关系

请以 JSON 格式返回，包含 tasks 数组和 reasoning 字段。
每个 task 包含: title, body(Markdown), requirementId, labels, estimatedDays, dependsOn, acceptanceCriteria`;
}

// ─── 拆分器实现 ──────────────────────────────────────────────

/**
 * 需求拆分器
 *
 * @example
 * ```typescript
 * const splitter = new TaskSplitter(llmClient, {
 *   targetGranularityDays: 1,
 *   includeDependencies: true,
 * });
 *
 * const result = await splitter.splitRequirement(requirement, prdDoc);
 * console.log(`拆分为 ${result.tasks.length} 个任务`);
 *
 * // 批量拆分整个 PRD
 * const allTasks = await splitter.splitAll(prdDoc);
 * ```
 */
export class TaskSplitter {
  private llm: LLMClient;
  private config: Required<SplitterConfig>;

  constructor(llm: LLMClient, config: SplitterConfig = {}) {
    this.llm = llm;
    this.config = {
      maxTasksPerRequirement: config.maxTasksPerRequirement ?? 8,
      targetGranularityDays: config.targetGranularityDays ?? 1,
      includeDependencies: config.includeDependencies ?? true,
      labelMapping: config.labelMapping ?? {
        P0: ['priority: critical', 'feature'],
        P1: ['priority: high', 'feature'],
        P2: ['priority: medium', 'feature'],
        P3: ['priority: low', 'feature'],
      },
      llmOptions: config.llmOptions ?? {},
    };
  }

  /**
   * 拆分单条需求为开发任务
   *
   * @param requirement - 待拆分的需求
   * @param doc - 完整 PRD 文档（提供上下文）
   * @returns 拆分后的任务列表和 LLM 拆分思路
   */
  async splitRequirement(
    requirement: Requirement,
    doc: PRDDocument,
  ): Promise<{ tasks: TaskItem[]; reasoning: string }> {
    const prompt = buildSplitPrompt(requirement, doc, this.config);

    const result = await this.llm.callStructured(prompt, {
      schema: SplitResultSchema,
      schemaName: 'split_result',
      systemPrompt: SYSTEM_PROMPT,
      ...this.config.llmOptions,
    });

    // 后处理：补充 labels、校验粒度
    const tasks = result.content.tasks.map((task) => this.postProcess(task, requirement));

    return {
      tasks,
      reasoning: result.content.reasoning,
    };
  }

  /**
   * 批量拆分 PRD 中的所有需求
   *
   * @param doc - 完整 PRD 文档
   * @param filter - 可选的需求过滤函数
   * @returns 所有任务列表及每条需求的拆分思路
   */
  async splitAll(
    doc: PRDDocument,
    filter?: (req: Requirement) => boolean,
  ): Promise<{
    tasks: TaskItem[];
    reasonings: Map<string, string>;
    totalEstimatedDays: number;
  }> {
    const requirements = filter
      ? doc.requirements.filter(filter)
      : doc.requirements;

    const allTasks: TaskItem[] = [];
    const reasonings = new Map<string, string>();

    // 顺序执行避免 LLM API 限流
    // TODO: 可改为并发 + 限流策略以提升效率
    for (const req of requirements) {
      const result = await this.splitRequirement(req, doc);
      allTasks.push(...result.tasks);
      reasonings.set(req.id, result.reasoning);
    }

    const totalEstimatedDays = allTasks.reduce(
      (sum, task) => sum + (task.estimatedDays ?? 0),
      0,
    );

    return { tasks: allTasks, reasonings, totalEstimatedDays };
  }

  /**
   * 将任务列表转换为 GitHub Issue 创建参数
   *
   * @param tasks - 拆分后的任务列表
   * @param repoOwner - 仓库所有者
   * @param repoName - 仓库名称
   * @returns GitHub Issue 创建参数数组
   */
  toGitHubIssues(tasks: TaskItem[], repoOwner: string, repoName: string): GitHubIssueParams[] {
    return tasks.map((task) => ({
      owner: repoOwner,
      repo: repoName,
      title: task.title,
      body: this.formatIssueBody(task),
      labels: task.labels,
    }));
  }

  // ─── 私有方法 ───────────────────────────────────────────────

  /**
   * 对 LLM 拆分结果进行后处理
   */
  private postProcess(task: TaskItem, requirement: Requirement): TaskItem {
    return {
      ...task,
      requirementId: requirement.id,
      labels: [
        ...task.labels,
        ...(this.config.labelMapping[requirement.priority] ?? []),
      ],
    };
  }

  /**
   * 格式化 Issue body
   */
  private formatIssueBody(task: TaskItem): string {
    const lines = [
      `## 来源需求`,
      `关联需求: ${task.requirementId}`,
      '',
      `## 描述`,
      task.body,
      '',
      `## 验收标准`,
      ...task.acceptanceCriteria.map((ac) => `- [ ] ${ac}`),
    ];

    if (task.dependsOn.length > 0) {
      lines.push('', `## 依赖`, ...task.dependsOn.map((dep) => `- ${dep}`));
    }

    if (task.estimatedDays) {
      lines.push('', `## 预估工作量`, `${task.estimatedDays} 人天`);
    }

    lines.push('', '---', '_由 PRD Pilot 自动生成_');

    return lines.join('\n');
  }
}

/** GitHub Issue 创建参数 */
export interface GitHubIssueParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels: string[];
}
