/**
 * LLM 客户端封装
 *
 * 基于 OpenAI SDK 封装，提供：
 * - 结构化输出（Structured Output via JSON Schema / zod）
 * - 自动重试与指数退避
 * - Token 用量跟踪
 * - 可切换模型配置
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';

// ─── 配置 ─────────────────────────────────────────────────────

/** LLM 客户端配置 */
export interface LLMClientConfig {
  /** OpenAI API Key，默认从 OPENAI_API_KEY 环境变量读取 */
  apiKey?: string;
  /** API Base URL（用于代理或兼容端点） */
  baseURL?: string;
  /** 默认模型 */
  model?: string;
  /** 默认温度 */
  temperature?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
}

/** 单次调用选项 */
export interface CallOptions {
  /** 覆盖默认模型 */
  model?: string;
  /** 覆盖默认温度 */
  temperature?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 系统提示词 */
  systemPrompt?: string;
}

/** 结构化输出调用选项 */
export interface StructuredCallOptions<T extends z.ZodType> extends CallOptions {
  /** 输出的 zod schema，用于校验 LLM 返回的 JSON */
  schema: T;
  /** schema 名称（用于 OpenAI function calling） */
  schemaName?: string;
}

/** Token 使用统计 */
export interface TokenUsage {
  /** 输入 token 数 */
  promptTokens: number;
  /** 输出 token 数 */
  completionTokens: number;
  /** 总 token 数 */
  totalTokens: number;
}

/** LLM 调用结果 */
export interface LLMResult<T = string> {
  /** 返回内容 */
  content: T;
  /** Token 使用量 */
  usage: TokenUsage;
  /** 实际使用的模型 */
  model: string;
  /** 耗时（毫秒） */
  durationMs: number;
}

// ─── 默认值 ─────────────────────────────────────────────────

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const RETRY_BASE_DELAY_MS = 1_000;

// ─── 客户端实现 ─────────────────────────────────────────────

/**
 * LLM 客户端
 *
 * @example
 * ```typescript
 * const llm = new LLMClient({ model: 'gpt-4o' });
 *
 * // 普通文本调用
 * const result = await llm.call('分析这段需求的完整性');
 *
 * // 结构化输出
 * const issues = await llm.callStructured('分析 PRD 缺陷', {
 *   schema: z.array(LintIssueSchema),
 *   schemaName: 'lint_issues',
 * });
 * ```
 */
export class LLMClient {
  private client: OpenAI;
  private config: Required<LLMClientConfig>;
  /** 累计 token 使用量 */
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(config: LLMClientConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? '',
      baseURL: config.baseURL ?? '',
      model: config.model ?? DEFAULT_MODEL,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      ...(this.config.baseURL ? { baseURL: this.config.baseURL } : {}),
      timeout: this.config.timeoutMs,
      maxRetries: 0, // 我们自己管理重试逻辑
    });
  }

  /**
   * 发送文本 prompt，返回文本响应
   *
   * @param prompt - 用户提示词
   * @param options - 调用选项
   * @returns LLM 响应结果
   */
  async call(prompt: string, options: CallOptions = {}): Promise<LLMResult<string>> {
    const messages = this.buildMessages(prompt, options.systemPrompt);
    const startTime = Date.now();

    const completion = await this.withRetry(async () => {
      return this.client.chat.completions.create({
        model: options.model ?? this.config.model,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens,
        messages,
      });
    });

    const content = completion.choices[0]?.message?.content ?? '';
    const usage = this.extractUsage(completion);
    this.accumulateUsage(usage);

    return {
      content,
      usage,
      model: completion.model,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 发送 prompt 并要求返回结构化 JSON，使用 zod schema 校验
   *
   * @param prompt - 用户提示词
   * @param options - 包含 zod schema 的调用选项
   * @returns 经过 schema 校验的结构化结果
   * @throws {z.ZodError} 当 LLM 返回值不符合 schema 时
   */
  async callStructured<T extends z.ZodType>(
    prompt: string,
    options: StructuredCallOptions<T>,
  ): Promise<LLMResult<z.infer<T>>> {
    const systemPrompt = [
      options.systemPrompt ?? '',
      '请严格按照 JSON 格式返回结果，不要包含任何多余文字或 markdown 标记。',
    ].filter(Boolean).join('\n');

    const messages = this.buildMessages(prompt, systemPrompt);
    const startTime = Date.now();

    // TODO: 当 OpenAI SDK 稳定支持 response_format: { type: 'json_schema' } 时
    // 替换为原生 structured output 能力，减少 prompt 工程依赖

    const completion = await this.withRetry(async () => {
      return this.client.chat.completions.create({
        model: options.model ?? this.config.model,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens,
        response_format: { type: 'json_object' },
        messages,
      });
    });

    const rawContent = completion.choices[0]?.message?.content ?? '{}';
    const usage = this.extractUsage(completion);
    this.accumulateUsage(usage);

    // 解析 JSON 并用 zod 校验
    const parsed = JSON.parse(rawContent);
    const validated = options.schema.parse(parsed);

    return {
      content: validated,
      usage,
      model: completion.model,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 获取累计 token 使用量
   */
  getAccumulatedUsage(): Readonly<TokenUsage> {
    return { ...this.totalUsage };
  }

  /**
   * 重置累计 token 计数
   */
  resetUsage(): void {
    this.totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  // ─── 私有方法 ───────────────────────────────────────────────

  /**
   * 构建消息数组
   */
  private buildMessages(prompt: string, systemPrompt?: string): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  /**
   * 带指数退避的重试机制
   *
   * @param fn - 要执行的异步操作
   * @returns 操作结果
   * @throws 最后一次重试仍失败时抛出原始错误
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 不重试的错误类型：认证失败、请求格式错误
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        if (attempt < this.config.maxRetries) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          const jitter = Math.random() * delay * 0.1;
          await this.sleep(delay + jitter);
        }
      }
    }

    throw lastError;
  }

  /**
   * 判断是否为不可重试的错误（如 401、400）
   */
  private isNonRetryableError(error: Error): boolean {
    // OpenAI SDK 的错误对象上会有 status 属性
    const status = (error as Record<string, unknown>).status;
    if (typeof status === 'number') {
      return status === 401 || status === 403 || status === 400;
    }
    return false;
  }

  /**
   * 从 completion 响应中提取 token 使用量
   */
  private extractUsage(completion: OpenAI.Chat.Completions.ChatCompletion): TokenUsage {
    return {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    };
  }

  /**
   * 累加 token 使用量
   */
  private accumulateUsage(usage: TokenUsage): void {
    this.totalUsage.promptTokens += usage.promptTokens;
    this.totalUsage.completionTokens += usage.completionTokens;
    this.totalUsage.totalTokens += usage.totalTokens;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
