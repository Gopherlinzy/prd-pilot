import * as lark from '@larksuiteoapi/node-sdk';
import type { DocumentAdapter, RawDocument, FeishuAdapterConfig } from './types';
import type { PRDDocument, PRDSection, Requirement, Priority } from '../types/prd';

// ============================================================
// Feishu (Lark) Document Adapter
// 通过飞书开放平台 API 读取并解析 PRD 文档
// ============================================================

/** 飞书 Block 类型常量 */
const BlockType = {
  PAGE: 1,
  TEXT: 2,
  HEADING1: 3,
  HEADING2: 4,
  HEADING3: 5,
  HEADING4: 6,
  HEADING5: 7,
  HEADING6: 8,
  HEADING7: 9,
  HEADING8: 10,
  HEADING9: 11,
  BULLET: 12,
  ORDERED: 13,
  CODE: 14,
  QUOTE: 15,
  TODO: 17,
  DIVIDER: 22,
  TABLE: 31,
  TABLE_CELL: 32,
  CALLOUT: 34,
} as const;

/** heading block_type → 层级数字 */
function headingLevel(blockType: number): number | null {
  if (blockType >= BlockType.HEADING1 && blockType <= BlockType.HEADING9) {
    return blockType - BlockType.HEADING1 + 1;
  }
  return null;
}

/** 从飞书富文本元素中提取纯文本 */
function extractTextFromElements(elements: FeishuTextElement[] | undefined): string {
  if (!elements) return '';
  return elements
    .map((el) => el.text_run?.content ?? el.mention_user?.user_id ?? '')
    .join('');
}

/** 从 block 中提取文本内容 */
function extractBlockText(block: FeishuBlock): string {
  const body = block.text ?? block.heading1 ?? block.heading2 ?? block.heading3
    ?? block.heading4 ?? block.heading5 ?? block.heading6
    ?? block.heading7 ?? block.heading8 ?? block.heading9
    ?? block.bullet ?? block.ordered ?? block.quote ?? block.todo ?? block.code;
  if (!body) return '';
  return extractTextFromElements(body.elements);
}

// ---- 内部类型（飞书 API 响应结构） ----

interface FeishuTextElement {
  text_run?: { content: string };
  mention_user?: { user_id: string };
}

interface FeishuTextBody {
  elements?: FeishuTextElement[];
}

interface FeishuBlock {
  block_id: string;
  block_type: number;
  parent_id?: string;
  children?: string[];
  text?: FeishuTextBody;
  heading1?: FeishuTextBody;
  heading2?: FeishuTextBody;
  heading3?: FeishuTextBody;
  heading4?: FeishuTextBody;
  heading5?: FeishuTextBody;
  heading6?: FeishuTextBody;
  heading7?: FeishuTextBody;
  heading8?: FeishuTextBody;
  heading9?: FeishuTextBody;
  bullet?: FeishuTextBody;
  ordered?: FeishuTextBody;
  quote?: FeishuTextBody;
  todo?: FeishuTextBody;
  code?: FeishuTextBody;
  callout?: { body?: { elements?: FeishuTextElement[] } };
  table?: {
    rows?: number; columns?: number; cells?: string[];
    property?: { row_size?: number; column_size?: number };
  };
}

// ============================================================
// 正则：从文本中识别优先级
// ============================================================

const PRIORITY_PATTERNS: Array<{ pattern: RegExp; priority: Priority }> = [
  { pattern: /\bP0\b/i, priority: 'P0' },
  { pattern: /\bP1\b/i, priority: 'P1' },
  { pattern: /\bP2\b/i, priority: 'P2' },
  { pattern: /\bP3\b/i, priority: 'P3' },
  { pattern: /优先级[：:]\s*高/, priority: 'P0' },
  { pattern: /优先级[：:]\s*中/, priority: 'P1' },
  { pattern: /优先级[：:]\s*低/, priority: 'P2' },
];

/** 从文本中提取优先级 */
function extractPriority(text: string): Priority | undefined {
  for (const { pattern, priority } of PRIORITY_PATTERNS) {
    if (pattern.test(text)) return priority;
  }
  return undefined;
}

/** 判断 section 标题是否表示需求 */
function isRequirementSection(title: string): boolean {
  return /需求|功能|feature|requirement|用例|use.?case/i.test(title);
}

/** 判断 section 标题是否表示验收标准 */
function isAcceptanceCriteriaSection(title: string): boolean {
  return /验收标准|acceptance.?criteria|ac\b|done.?definition/i.test(title);
}

/** 判断 section 标题是否表示流程 */
function isFlowSection(title: string): boolean {
  return /流程|flow|process|步骤|step/i.test(title);
}

// ============================================================
// FeishuAdapter
// ============================================================

export class FeishuAdapter implements DocumentAdapter {
  readonly name = 'feishu';
  private client: lark.Client;
  private timeoutMs: number;

  constructor(config: FeishuAdapterConfig) {
    const appId = config.appId || process.env.FEISHU_APP_ID;
    const appSecret = config.appSecret || process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error(
        '飞书适配器需要 appId 和 appSecret，请通过构造参数或环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET 提供',
      );
    }

    this.client = new lark.Client({
      appId,
      appSecret,
      ...(config.baseUrl ? { domain: config.baseUrl } : {}),
    });
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  // ----------------------------------------------------------
  // URL → doc_token
  // ----------------------------------------------------------

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
    throw new Error(`无法从 URL 中提取 doc_token: ${url}`);
  }

  // ----------------------------------------------------------
  // fetch — 拉取飞书文档原始数据
  // ----------------------------------------------------------

  async fetch(source: string): Promise<RawDocument> {
    const docToken = this.extractDocToken(source);
    console.log(`[FeishuAdapter] 正在获取文档 ${docToken} ...`);

    // 1) 获取文档元数据（标题等）
    const docResp = await this.client.docx.document.get({
      path: { document_id: docToken },
    });

    if (!docResp.data?.document) {
      throw new Error(`飞书 API 未返回文档信息，doc_token=${docToken}`);
    }
    const docMeta = docResp.data.document;
    console.log(`[FeishuAdapter] 文档标题: ${docMeta.title ?? '(无标题)'}`);

    // 2) 分页拉取所有 blocks
    const allBlocks: FeishuBlock[] = [];
    let pageToken: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const blockResp = await this.client.docx.documentBlock.list({
        path: { document_id: docToken },
        params: {
          page_size: 500,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });

      const items = blockResp.data?.items;
      if (items) {
        allBlocks.push(...(items as unknown as FeishuBlock[]));
      }

      hasMore = blockResp.data?.has_more ?? false;
      pageToken = blockResp.data?.page_token ?? undefined;
    }

    console.log(`[FeishuAdapter] 共获取 ${allBlocks.length} 个 blocks`);

    return {
      source,
      content: { docToken, blocks: allBlocks, docMeta },
      contentType: 'feishu-blocks',
      metadata: {
        docToken,
        title: docMeta.title ?? '',
        revisionId: docMeta.revision_id,
      },
    };
  }

  // ----------------------------------------------------------
  // parse — 将飞书 Blocks 转换为 PRDDocument
  // ----------------------------------------------------------

  async parse(raw: RawDocument): Promise<PRDDocument> {
    const { blocks, docMeta } = raw.content as {
      blocks: FeishuBlock[];
      docMeta: { title?: string; revision_id?: number };
    };

    const title = (docMeta.title as string) || 'Untitled PRD';
    const sections: PRDSection[] = [];
    const requirements: Requirement[] = [];
    const dataModels: PRDDocument['dataModels'] = [];
    const flows: PRDDocument['flows'] = [];

    // --- 第一步：按 heading 切分为 flat sections ---
    interface FlatSection {
      id: string;
      title: string;
      level: number;
      contentLines: string[];
      calloutLines: string[];
      tableBlocks: FeishuBlock[];
      orderedItems: string[];
      /** 是否正在收集验收标准（遇到"验收标准"quote 后置 true） */
      _collectingAC: boolean;
    }

    const flatSections: FlatSection[] = [];
    let current: FlatSection | null = null;

    for (const block of blocks) {
      const level = headingLevel(block.block_type);

      if (level !== null) {
        // 遇到 heading → 开始新 section
        const headingText = extractBlockText(block);
        current = {
          id: `sec-${block.block_id}`,
          title: headingText,
          level,
          contentLines: [],
          calloutLines: [],
          tableBlocks: [],
          orderedItems: [],
          _collectingAC: false,
        };
        flatSections.push(current);
        continue;
      }

      if (!current) continue;

      switch (block.block_type) {
        case BlockType.TEXT:
        case BlockType.TODO:
        case BlockType.CODE: {
          const text = extractBlockText(block);
          if (text) current.contentLines.push(text);
          // 非 bullet/quote → 停止收集 AC
          current._collectingAC = false;
          break;
        }
        case BlockType.QUOTE: {
          const text = extractBlockText(block);
          if (text) {
            current.contentLines.push(text);
            // "验收标准：" quote → 开始收集后续 bullet 作为 AC
            if (isAcceptanceCriteriaSection(text)) {
              current._collectingAC = true;
            }
          }
          break;
        }
        case BlockType.BULLET: {
          const text = extractBlockText(block);
          if (text) {
            current.contentLines.push(text);
            // 如果正在收集验收标准，将 bullet 条目加入 calloutLines
            if (current._collectingAC) {
              current.calloutLines.push(text);
            }
          }
          break;
        }
        case BlockType.ORDERED: {
          const text = extractBlockText(block);
          if (text) {
            current.contentLines.push(text);
            current.orderedItems.push(text);
          }
          // 有序列表也停止 AC 收集
          current._collectingAC = false;
          break;
        }
        case BlockType.CALLOUT: {
          // callout → 可能是验收标准
          const calloutText = block.callout?.body?.elements
            ? extractTextFromElements(block.callout.body.elements)
            : extractBlockText(block);
          if (calloutText) {
            current.calloutLines.push(calloutText);
            current.contentLines.push(calloutText);
          }
          break;
        }
        case BlockType.TABLE: {
          current.tableBlocks.push(block);
          break;
        }
        default:
          break;
      }
    }

    // --- 第二步：构建嵌套 PRDSection 树 ---
    const sectionStack: PRDSection[] = [];

    for (const fs of flatSections) {
      const section: PRDSection = {
        id: fs.id,
        title: fs.title,
        content: fs.contentLines.join('\n'),
        level: fs.level,
        children: [],
      };

      // 找到正确的父节点
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= fs.level) {
        sectionStack.pop();
      }

      if (sectionStack.length > 0) {
        sectionStack[sectionStack.length - 1].children.push(section);
      } else {
        sections.push(section);
      }
      sectionStack.push(section);
    }

    // --- 第三步：提取 Requirements ---
    let reqCounter = 0;
    for (const fs of flatSections) {
      if (isRequirementSection(fs.title)) {
        reqCounter++;
        const fullText = fs.contentLines.join('\n');
        const ac: string[] = [];

        // 从 callout 和下级验收标准 section 中收集 AC
        ac.push(...fs.calloutLines);

        // 查找紧跟的验收标准 section
        const idx = flatSections.indexOf(fs);
        for (let i = idx + 1; i < flatSections.length; i++) {
          const next = flatSections[i];
          if (next.level <= fs.level) break;
          if (isAcceptanceCriteriaSection(next.title)) {
            ac.push(...next.contentLines);
          }
        }

        requirements.push({
          id: `REQ-${String(reqCounter).padStart(3, '0')}`,
          title: fs.title,
          description: fullText,
          priority: extractPriority(fullText) ?? extractPriority(fs.title),
          status: 'draft',
          acceptanceCriteria: ac,
          dependencies: [],
          sectionId: fs.id,
        });
      }
    }

    // --- 第四步：从 table blocks 提取 Data Models ---
    for (const fs of flatSections) {
      for (const tb of fs.tableBlocks) {
        if (!tb.table) continue;
        const cells = tb.table.cells;
        const rows = tb.table.property?.row_size ?? tb.table.rows;
        const columns = tb.table.property?.column_size ?? tb.table.columns;
        if (!rows || !columns || !cells || rows < 2 || columns < 2) continue;

        // 用 blocks 查找 cell 内容 — cells 是 block_id 列表
        const cellBlockMap = new Map<string, FeishuBlock>();
        for (const b of blocks) {
          cellBlockMap.set(b.block_id, b);
        }

        const getCellText = (cellIds: string[], index: number): string => {
          const cellId = cellIds[index];
          if (!cellId) return '';
          const cellBlock = cellBlockMap.get(cellId);
          if (!cellBlock?.children) return '';
          // table_cell 的子 block 包含实际文本
          return cellBlock.children
            .map((childId) => {
              const child = cellBlockMap.get(childId);
              return child ? extractBlockText(child) : '';
            })
            .join(' ')
            .trim();
        };

        // 第一行作为 header，判断是否为数据模型表
        const headers: string[] = [];
        for (let c = 0; c < columns; c++) {
          headers.push(getCellText(cells, c));
        }

        const hasNameCol = headers.some((h) => /字段|field|name|名称/i.test(h));
        const hasTypeCol = headers.some((h) => /类型|type/i.test(h));

        if (hasNameCol && hasTypeCol) {
          const nameIdx = headers.findIndex((h) => /字段|field|name|名称/i.test(h));
          const typeIdx = headers.findIndex((h) => /类型|type/i.test(h));
          const descIdx = headers.findIndex((h) => /描述|说明|description|备注/i.test(h));

          const fields: Array<{ name: string; type: string; description?: string }> = [];
          for (let r = 1; r < rows; r++) {
            const base = r * columns;
            const name = getCellText(cells, base + nameIdx);
            const type = getCellText(cells, base + typeIdx);
            const desc = descIdx >= 0 ? getCellText(cells, base + descIdx) : undefined;
            if (name) fields.push({ name, type, description: desc });
          }

          dataModels.push({
            name: fs.title || `DataModel_${dataModels.length + 1}`,
            description: `从"${fs.title}"中提取的数据模型`,
            fields,
          });
        }
      }
    }

    // --- 第五步：提取 Flows ---
    for (const fs of flatSections) {
      if (isFlowSection(fs.title) && fs.orderedItems.length > 0) {
        flows.push({
          name: fs.title,
          description: fs.contentLines.filter((l) => !fs.orderedItems.includes(l)).join('\n'),
          steps: fs.orderedItems,
        });
      }
    }

    console.log(
      `[FeishuAdapter] 解析完成: ${sections.length} sections, ${requirements.length} requirements, ${dataModels.length} dataModels, ${flows.length} flows`,
    );

    return {
      title,
      version: '0.1.0',
      sourceUrl: raw.source,
      sections,
      requirements,
      dataModels,
      flows,
      metadata: raw.metadata,
    };
  }

  // ----------------------------------------------------------
  // analyze — fetch + parse 便捷方法
  // ----------------------------------------------------------

  async analyze(source: string): Promise<PRDDocument> {
    const raw = await this.fetch(source);
    return this.parse(raw);
  }
}
