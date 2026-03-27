/**
 * 文档适配器抽象层
 *
 * 定义从不同来源（飞书、Markdown、Notion 等）获取并解析文档的统一接口。
 * 每个适配器负责：获取原始数据 → 转换为 PRDDocument。
 */

import type { PRDDocument } from '../types/prd';

// ─── 原始文档 ─────────────────────────────────────────────────

/** 从来源平台获取到的原始文档数据 */
export interface RawDocument {
  /** 平台侧的文档 ID */
  id: string;
  /** 文档标题 */
  title: string;
  /** 原始内容（JSON string / Markdown string / HTML 等） */
  rawContent: string;
  /** 内容格式 */
  contentType: 'json' | 'markdown' | 'html';
  /** 文档元数据（作者、更新时间等） */
  metadata: Record<string, unknown>;
}

// ─── 适配器配置 ─────────────────────────────────────────────

/** 适配器通用配置 */
export interface AdapterConfig<TExtra = Record<string, unknown>> {
  /** 请求超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 平台特有的额外配置 */
  extra?: TExtra;
}

/** 飞书适配器特有配置 */
export interface FeishuAdapterConfig {
  /** 飞书应用 App ID */
  appId: string;
  /** 飞书应用 App Secret */
  appSecret: string;
}

/** Markdown 适配器特有配置 */
export interface MarkdownAdapterConfig {
  /** 文件编码，默认 utf-8 */
  encoding?: BufferEncoding;
}

// ─── 适配器接口 ─────────────────────────────────────────────

/**
 * 文档适配器泛型接口
 *
 * @typeParam TConfig - 平台特有配置类型
 *
 * @example
 * ```typescript
 * const adapter: DocumentAdapter<FeishuAdapterConfig> = new FeishuAdapter(config);
 * const prd = await adapter.fetchAndParse('https://xxx.feishu.cn/docx/abc123');
 * ```
 */
export interface DocumentAdapter<TConfig = Record<string, unknown>> {
  /** 适配器名称，用于日志和错误消息 */
  readonly name: string;

  /**
   * 从来源获取原始文档
   *
   * @param source - 文档来源（URL 或文件路径）
   * @returns 原始文档数据
   * @throws {AdapterFetchError} 获取失败时抛出
   */
  fetch(source: string): Promise<RawDocument>;

  /**
   * 将原始文档解析为标准 PRDDocument
   *
   * @param raw - 原始文档数据
   * @returns 标准化的 PRD 文档
   * @throws {AdapterParseError} 解析失败时抛出
   */
  parse(raw: RawDocument): Promise<PRDDocument>;

  /**
   * 一站式方法：获取 + 解析
   *
   * @param source - 文档来源（URL 或文件路径）
   * @returns 标准化的 PRD 文档
   */
  fetchAndParse(source: string): Promise<PRDDocument>;

  /**
   * 检查适配器是否能处理给定的来源
   *
   * @param source - 文档来源字符串
   * @returns 是否支持该来源
   */
  canHandle(source: string): boolean;

  /** 获取适配器配置（只读） */
  getConfig(): Readonly<AdapterConfig<TConfig>>;
}

// ─── 适配器错误 ─────────────────────────────────────────────

/** 适配器基础错误 */
export class AdapterError extends Error {
  constructor(
    message: string,
    /** 产生错误的适配器名称 */
    public readonly adapterName: string,
    /** 原始错误 */
    public readonly cause?: Error,
  ) {
    super(`[${adapterName}] ${message}`);
    this.name = 'AdapterError';
  }
}

/** 文档获取阶段错误 */
export class AdapterFetchError extends AdapterError {
  constructor(adapterName: string, source: string, cause?: Error) {
    super(`获取文档失败: ${source}`, adapterName, cause);
    this.name = 'AdapterFetchError';
  }
}

/** 文档解析阶段错误 */
export class AdapterParseError extends AdapterError {
  constructor(adapterName: string, reason: string, cause?: Error) {
    super(`解析文档失败: ${reason}`, adapterName, cause);
    this.name = 'AdapterParseError';
  }
}
