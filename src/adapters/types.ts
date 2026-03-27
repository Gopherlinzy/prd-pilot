import type { PRDDocument } from '../types/prd';

// ============================================================
// Document Adapter Interface
// Abstracts away the document source (Feishu, Markdown, Notion...)
// ============================================================

/** Raw document as fetched from the source, before parsing */
export interface RawDocument {
  /** Original source identifier (URL, file path, etc.) */
  source: string;
  /** Raw content — structure depends on the adapter */
  content: unknown;
  /** Content type hint */
  contentType: 'feishu-blocks' | 'markdown' | 'html' | 'json';
  /** Metadata from the source */
  metadata: Record<string, unknown>;
}

/** Configuration for a document adapter */
export interface AdapterConfig {
  /** API key or token for authenticated sources */
  apiKey?: string;
  /** Base URL for API calls */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Additional adapter-specific options */
  options?: Record<string, unknown>;
}

/** 飞书适配器专用配置 */
export interface FeishuAdapterConfig {
  /** 飞书应用 App ID */
  appId: string;
  /** 飞书应用 App Secret */
  appSecret: string;
  /** 自定义域名（私有化部署），默认 https://open.feishu.cn */
  baseUrl?: string;
  /** 请求超时（毫秒），默认 30000 */
  timeoutMs?: number;
}

/**
 * DocumentAdapter — the core abstraction for document sources.
 *
 * Each adapter knows how to:
 * 1. Fetch a raw document from its source
 * 2. Parse the raw content into a structured PRDDocument
 *
 * This design ensures the analysis engine is document-source agnostic.
 */
export interface DocumentAdapter {
  /** Human-readable name of this adapter */
  readonly name: string;

  /**
   * Fetch a raw document from the given source.
   * @param source - URL, file path, or other identifier
   * @returns The raw document content
   */
  fetch(source: string): Promise<RawDocument>;

  /**
   * Parse a raw document into a structured PRDDocument.
   * @param raw - The raw document from fetch()
   * @returns A validated PRDDocument
   */
  parse(raw: RawDocument): Promise<PRDDocument>;

  /**
   * Convenience: fetch + parse in one call.
   * @param source - URL, file path, or other identifier
   * @returns A validated PRDDocument
   */
  analyze(source: string): Promise<PRDDocument>;
}
