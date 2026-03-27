/**
 * 飞书文档适配器
 *
 * 通过飞书开放平台 API 获取 Docx 文档内容，
 * 将飞书 Block 结构转换为标准 PRDDocument。
 *
 * @see https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/list
 */

import * as lark from '@larksuiteoapi/node-sdk';
import type { PRDDocument, PRDSection, Requirement } from '../types/prd';
import { SectionTypeSchema } from '../types/prd';
import type {
  DocumentAdapter,
  AdapterConfig,
  FeishuAdapterConfig,
  RawDocument,
} from './types';
import { AdapterFetchError, AdapterParseError } from './types';

/** 飞书文档 URL 正则，提取 doc_token */
const FEISHU_URL_PATTERN = /\/(?:docx|wiki)\/([A-Za-z0-9]+)/;

/**
 * 飞书文档适配器
 *
 * @example
 * ```typescript
 * const adapter = new FeishuAdapter({
 *   extra: { appId: 'cli_xxx', appSecret: 'xxx' },
 * });
 * const prd = await adapter.fetchAndParse('https://xxx.feishu.cn/docx/abc123');
 * ```
 */
export class FeishuAdapter implements DocumentAdapter<FeishuAdapterConfig> {
  readonly name = 'feishu';
  private client: lark.Client;
  private config: AdapterConfig<FeishuAdapterConfig>;

  constructor(config: AdapterConfig<FeishuAdapterConfig>) {
    if (!config.extra?.appId || !config.extra?.appSecret) {
      throw new Error('FeishuAdapter 需要 appId 和 appSecret 配置');
    }

    this.config = {
      timeoutMs: 30_000,
      maxRetries: 3,
      ...config,
    };

    this.client = new lark.Client({
      appId: this.config.extra!.appId,
      appSecret: this.config.extra!.appSecret,
      disableTokenCache: false,
    });
  }

  /**
   * 从飞书文档 URL 中提取 doc_token
   *
   * @param url - 飞书文档 URL，支持 /docx/ 和 /wiki/ 路径
   * @returns doc_token
   * @throws 当 URL 格式不合法时抛出错误
   */
  static extractDocToken(url: string): string {
    const match = url.match(FEISHU_URL_PATTERN);
    if (!match?.[1]) {
      throw new Error(`无法从 URL 提取 doc_token: ${url}`);
    }
    return match[1];
  }

  /** @inheritdoc */
  canHandle(source: string): boolean {
    return FEISHU_URL_PATTERN.test(source);
  }

  /** @inheritdoc */
  getConfig(): Readonly<AdapterConfig<FeishuAdapterConfig>> {
    return Object.freeze({ ...this.config });
  }

  /** @inheritdoc */
  async fetch(source: string): Promise<RawDocument> {
    const docToken = FeishuAdapter.extractDocToken(source);

    try {
      // TODO: 调用飞书 API 获取文档元信息
      // const docMeta = await this.client.docx.document.get({
      //   path: { document_id: docToken },
      // });

      // TODO: 调用飞书 API 获取文档全部 blocks
      // const blocksResponse = await this.client.docx.documentBlock.list({
      //   path: { document_id: docToken },
      //   params: { document_revision_id: -1 },
      // });

      // TODO: 替换为真实 API 返回值
      const rawContent = JSON.stringify({
        document_id: docToken,
        blocks: [],
        _notice: 'TODO: 接入飞书 API 后替换为真实数据',
      });

      return {
        id: docToken,
        title: '', // TODO: 从 docMeta 中获取
        rawContent,
        contentType: 'json',
        metadata: {
          source: 'feishu',
          sourceUrl: source,
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
      const data = JSON.parse(raw.rawContent);
      const blocks: unknown[] = data.blocks ?? [];

      // TODO: 实现 Block → Section 的映射逻辑
      const sections = this.blocksToSections(blocks);
      // TODO: 实现从 sections 中提取结构化需求
      const requirements = this.extractRequirements(sections);

      return {
        id: raw.id,
        title: raw.title || data.title || '未命名 PRD',
        version: '0.1.0',
        source: 'feishu',
        sourceUrl: raw.metadata.sourceUrl as string | undefined,
        sections,
        requirements,
        metadata: raw.metadata,
      };
    } catch (error) {
      if (error instanceof AdapterParseError) throw error;
      throw new AdapterParseError(
        this.name,
        '飞书文档 JSON 解析失败',
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
   * 将飞书 Block 列表转换为 PRDSection 层级结构
   *
   * 飞书 Docx 的 block 是扁平列表，需要根据 heading level 重建树形结构。
   *
   * @param blocks - 飞书 API 返回的 block 列表
   * @returns 结构化的 PRDSection 数组
   */
  private blocksToSections(blocks: unknown[]): PRDSection[] {
    // TODO: 实现飞书 Block 到 PRDSection 的转换
    // 1. 遍历 blocks，识别 heading block 作为 section 分界
    // 2. 根据 heading level (h1/h2/h3) 建立父子关系
    // 3. 将 paragraph / list / code / table 等 block 内容拼接为 section.content
    // 4. 根据标题关键词推断 section.type（如 "验收标准" → acceptance_criteria）
    // 5. 收集 block 中的 @mention 和链接作为 metadata

    if (blocks.length === 0) {
      return [{
        title: '待解析',
        type: 'background',
        content: '文档内容待飞书 API 接入后自动解析',
        children: [],
        requirementIds: [],
      }];
    }

    return this.buildSectionTree(blocks);
  }

  /**
   * 根据 heading level 构建章节树
   *
   * @param blocks - 扁平 block 列表
   * @returns 树形 section 结构
   */
  private buildSectionTree(blocks: unknown[]): PRDSection[] {
    const sections: PRDSection[] = [];

    // TODO: 实现具体的树构建算法
    // 伪代码：
    // for (const block of blocks) {
    //   if (isHeading(block)) {
    //     const level = getHeadingLevel(block);
    //     const section = { title: getText(block), type: inferType(getText(block)), ... };
    //     insertAtLevel(sections, section, level);
    //   } else {
    //     appendToCurrentSection(sections, getBlockContent(block));
    //   }
    // }

    void blocks; // 避免 TS 未使用参数警告
    return sections;
  }

  /**
   * 从章节中提取结构化需求
   *
   * @param sections - PRD 章节列表
   * @returns 提取出的需求列表
   */
  private extractRequirements(sections: PRDSection[]): Requirement[] {
    const requirements: Requirement[] = [];

    // TODO: 实现需求提取逻辑
    // 1. 遍历所有 type === 'functional' 或 'user_story' 的 section
    // 2. 解析 section.content 中的需求模式（如有序列表、表格行）
    // 3. 匹配验收标准（从 acceptance_criteria section 或行内标注）
    // 4. 生成 REQ-XXX 编号
    // 5. 推断优先级（从标签、颜色标记、或显式标注）

    void sections; // 避免 TS 未使用参数警告
    return requirements;
  }

  /**
   * 根据章节标题推断 SectionType
   *
   * @param title - 章节标题文本
   * @returns 推断出的 SectionType
   */
  static inferSectionType(title: string): PRDSection['type'] {
    const mapping: Record<string, PRDSection['type']> = {
      '背景': 'background',
      '目标': 'background',
      '用户故事': 'user_story',
      '功能需求': 'functional',
      '功能': 'functional',
      '非功能': 'non_functional',
      '性能': 'non_functional',
      '数据模型': 'data_model',
      '数据结构': 'data_model',
      '交互流程': 'interaction_flow',
      '流程': 'interaction_flow',
      '验收标准': 'acceptance_criteria',
      '验收': 'acceptance_criteria',
      '待确认': 'open_question',
      '问题': 'open_question',
      '附录': 'appendix',
    };

    const normalizedTitle = title.trim();
    for (const [keyword, type] of Object.entries(mapping)) {
      if (normalizedTitle.includes(keyword)) {
        // 校验推断结果是否为合法的 SectionType
        const result = SectionTypeSchema.safeParse(type);
        if (result.success) return result.data;
      }
    }

    // 默认归类为功能需求
    return 'functional';
  }
}
