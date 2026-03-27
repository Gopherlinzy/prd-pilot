/**
 * Markdown 文档适配器（Phase 2）
 *
 * 从本地 Markdown 文件或远程 URL 读取 PRD 文档，
 * 将 Markdown 结构转换为标准 PRDDocument。
 *
 * 适用场景：
 * - GitHub / GitLab 仓库中的 PRD.md
 * - 本地草稿文档
 * - 从其他工具导出的 Markdown
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PRDDocument, PRDSection, Requirement } from '../types/prd';
import type {
  DocumentAdapter,
  AdapterConfig,
  MarkdownAdapterConfig,
  RawDocument,
} from './types';
import { AdapterFetchError, AdapterParseError } from './types';

/** 匹配 Markdown 标题行 */
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

/**
 * Markdown 文档适配器
 *
 * @example
 * ```typescript
 * const adapter = new MarkdownAdapter();
 * const prd = await adapter.fetchAndParse('./docs/prd.md');
 * ```
 */
export class MarkdownAdapter implements DocumentAdapter<MarkdownAdapterConfig> {
  readonly name = 'markdown';
  private config: AdapterConfig<MarkdownAdapterConfig>;

  constructor(config: AdapterConfig<MarkdownAdapterConfig> = {}) {
    this.config = {
      timeoutMs: 10_000,
      maxRetries: 1,
      ...config,
      extra: {
        encoding: 'utf-8',
        ...config.extra,
      },
    };
  }

  /** @inheritdoc */
  canHandle(source: string): boolean {
    return source.endsWith('.md') || source.endsWith('.markdown');
  }

  /** @inheritdoc */
  getConfig(): Readonly<AdapterConfig<MarkdownAdapterConfig>> {
    return Object.freeze({ ...this.config });
  }

  /** @inheritdoc */
  async fetch(source: string): Promise<RawDocument> {
    try {
      const filePath = resolve(source);
      const encoding = this.config.extra?.encoding ?? 'utf-8';
      const content = await readFile(filePath, { encoding });
      const title = this.extractTitle(content);

      return {
        id: filePath,
        title,
        rawContent: content,
        contentType: 'markdown',
        metadata: {
          source: 'markdown',
          filePath,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new AdapterFetchError(
        this.name,
        source,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /** @inheritdoc */
  async parse(raw: RawDocument): Promise<PRDDocument> {
    try {
      const sections = this.markdownToSections(raw.rawContent);
      const requirements = this.extractRequirements(sections);

      return {
        id: raw.id,
        title: raw.title || '未命名 PRD',
        version: '0.1.0',
        source: 'markdown',
        sections,
        requirements,
        metadata: raw.metadata,
      };
    } catch (error) {
      if (error instanceof AdapterParseError) throw error;
      throw new AdapterParseError(
        this.name,
        'Markdown 解析失败',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /** @inheritdoc */
  async fetchAndParse(source: string): Promise<PRDDocument> {
    const raw = await this.fetch(source);
    return this.parse(raw);
  }

  /**
   * 从 Markdown 内容中提取第一个 h1 作为文档标题
   *
   * @param content - Markdown 文本
   * @returns 文档标题，未找到时返回空字符串
   */
  private extractTitle(content: string): string {
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^#\s+(.+)$/);
      if (match) return match[1].trim();
    }
    return '';
  }

  /**
   * 将 Markdown 文本按标题层级拆分为 PRDSection 树
   *
   * @param content - Markdown 全文
   * @returns 结构化章节列表
   */
  private markdownToSections(content: string): PRDSection[] {
    // TODO: Phase 2 实现完整的 Markdown → Section 转换
    // 1. 按行遍历，识别 heading（# ~ ######）
    // 2. 根据 heading level 构建树形结构
    // 3. 将 heading 之间的正文内容归入对应 section.content
    // 4. 使用 FeishuAdapter.inferSectionType 推断章节类型
    // 5. 处理特殊 Markdown 元素：
    //    - [ ] 复选框列表 → 可能的验收标准
    //    - 表格 → 可能的数据模型或需求矩阵
    //    - 代码块 → 可能的 API 契约

    const lines = content.split('\n');
    const sections: PRDSection[] = [];
    let currentSection: PRDSection | null = null;
    const contentBuffer: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(HEADING_PATTERN);
      if (headingMatch) {
        // 保存前一个 section
        if (currentSection) {
          currentSection.content = contentBuffer.join('\n').trim();
          sections.push(currentSection);
          contentBuffer.length = 0;
        }

        const title = headingMatch[2].trim();
        currentSection = {
          title,
          type: 'functional', // TODO: 使用 inferSectionType
          content: '',
          children: [],
          requirementIds: [],
        };
      } else {
        contentBuffer.push(line);
      }
    }

    // 保存最后一个 section
    if (currentSection) {
      currentSection.content = contentBuffer.join('\n').trim();
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * 从 Markdown 章节中提取结构化需求
   *
   * @param sections - 解析后的章节列表
   * @returns 需求列表
   */
  private extractRequirements(sections: PRDSection[]): Requirement[] {
    // TODO: Phase 2 实现
    // 复用与 FeishuAdapter 类似的逻辑，但针对 Markdown 格式特点：
    // - 有序列表项可能是独立需求
    // - `> ` 引用块可能是验收标准
    // - `[P0]` / `[P1]` 标签可能表示优先级

    void sections;
    return [];
  }
}
