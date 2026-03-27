import type { DocumentAdapter, RawDocument, AdapterConfig } from './types';
import type { PRDDocument } from '../types/prd';

// ============================================================
// Feishu (Lark) Document Adapter
// Reads PRD documents from Feishu/Lark via Open API
// ============================================================

/**
 * FeishuAdapter — fetches and parses Feishu Docx documents.
 *
 * Uses the Feishu Open API to:
 * 1. Extract doc_token from the URL
 * 2. Fetch document blocks via /open-apis/docx/v1/documents/:document_id/blocks
 * 3. Convert the Block tree into a structured PRDDocument
 */
export class FeishuAdapter implements DocumentAdapter {
  readonly name = 'feishu';
  private config: AdapterConfig;

  constructor(config: AdapterConfig = {}) {
    this.config = {
      baseUrl: 'https://open.feishu.cn',
      timeoutMs: 30000,
      ...config,
    };
  }

  /**
   * Extract document token from a Feishu URL.
   * Supports formats:
   * - https://xxx.feishu.cn/docx/ABC123
   * - https://xxx.feishu.cn/wiki/ABC123
   * - https://xxx.larksuite.com/docx/ABC123
   */
  extractDocToken(url: string): string {
    const patterns = [
      /\/docx\/([a-zA-Z0-9]+)/,
      /\/wiki\/([a-zA-Z0-9]+)/,
      /\/docs\/([a-zA-Z0-9]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    throw new Error(`Cannot extract doc_token from URL: ${url}`);
  }

  async fetch(source: string): Promise<RawDocument> {
    const docToken = this.extractDocToken(source);

    // TODO: Implement actual Feishu API call
    // Using @larksuiteoapi/node-sdk:
    //
    // import * as lark from '@larksuiteoapi/node-sdk';
    // const client = new lark.Client({
    //   appId: process.env.FEISHU_APP_ID!,
    //   appSecret: process.env.FEISHU_APP_SECRET!,
    // });
    //
    // Step 1: Get document metadata
    // const docInfo = await client.docx.document.get({ document_id: docToken });
    //
    // Step 2: Get all blocks (paginated)
    // const blocks = await client.docx.documentBlock.list({
    //   document_id: docToken,
    //   page_size: 500,
    // });
    //
    // Step 3: For wiki links, resolve to actual doc token first
    // const wikiNode = await client.wiki.node.get({ token: docToken });

    return {
      source,
      content: { docToken, blocks: [] }, // TODO: replace with real API response
      contentType: 'feishu-blocks',
      metadata: { docToken },
    };
  }

  async parse(raw: RawDocument): Promise<PRDDocument> {
    const { docToken } = raw.metadata as { docToken: string };

    // TODO: Implement Block tree → PRDDocument conversion
    // Feishu Docx blocks have these types we care about:
    // - page: top-level container
    // - heading1-9: section headers → PRDSection
    // - text/bullet/ordered: body content
    // - table: data model definitions → dataModels
    // - callout: special notes / acceptance criteria
    // - divider: section separators
    //
    // Key conversion logic:
    // 1. Walk blocks top-down, split by headings into PRDSections
    // 2. Identify "需求" / "Requirement" sections → extract Requirements
    // 3. Identify "验收标准" / "Acceptance Criteria" → attach to Requirements
    // 4. Identify tables → parse as DataModels
    // 5. Identify numbered lists under "流程" → parse as Flows

    return {
      title: 'Untitled PRD', // TODO: extract from doc metadata
      version: '0.1.0',
      sourceUrl: raw.source,
      sections: [],
      requirements: [],
      dataModels: [],
      flows: [],
      metadata: { docToken },
    };
  }

  async analyze(source: string): Promise<PRDDocument> {
    const raw = await this.fetch(source);
    return this.parse(raw);
  }
}
