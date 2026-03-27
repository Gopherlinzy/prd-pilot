import type { DocumentAdapter, RawDocument } from './types';
import type { PRDDocument } from '../types/prd';

// ============================================================
// Markdown Document Adapter (Phase 2)
// Reads PRD from local .md files or raw Markdown strings
// ============================================================

/**
 * MarkdownAdapter — parses local Markdown PRD files.
 * Enables non-Feishu users to use PRD Pilot with standard .md docs.
 *
 * Phase 2 implementation. Skeleton only for now.
 */
export class MarkdownAdapter implements DocumentAdapter {
  readonly name = 'markdown';

  async fetch(source: string): Promise<RawDocument> {
    // TODO: Phase 2 — Read from file system or accept raw string
    // import { readFile } from 'fs/promises';
    // const content = await readFile(source, 'utf-8');
    throw new Error('MarkdownAdapter is not yet implemented (Phase 2)');
  }

  async parse(raw: RawDocument): Promise<PRDDocument> {
    // TODO: Phase 2 — Parse Markdown headings/lists into PRDDocument
    // Strategy:
    // 1. Split by ## headings → PRDSections
    // 2. Look for "Requirements" / "需求" sections
    // 3. Parse numbered lists as individual Requirements
    // 4. Parse tables as DataModels
    // 5. Parse code blocks as technical specs
    throw new Error('MarkdownAdapter is not yet implemented (Phase 2)');
  }

  async analyze(source: string): Promise<PRDDocument> {
    const raw = await this.fetch(source);
    return this.parse(raw);
  }
}
