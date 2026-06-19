// src/graph/kg/extraction/knowledge/spec-extractor.ts
// 从 .workflow/specs/*.md 提取 spec_entry nodes + constrains edges + derived_from edges

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { makeNodeId } from '../../db/connection.js';
import type {
  UnifiedNode, UnifiedEdge, FileRecord, ExtractionResult,
  SourceType, Language,
} from '../../db/types.js';

interface ParsedSpecEntry {
  title: string;
  content: string;
  lineStart: number;
  lineEnd: number;
  keywords: string[];
  category: string;
  roles: string[];
  domain?: string;
  priority?: string;
  status?: string;
}

export function extractSpec(
  specsDir: string,
  workflowRoot: string,
): ExtractionResult {
  const nodes: UnifiedNode[] = [];
  const edges: UnifiedEdge[] = [];
  const now = Date.now();

  if (!existsSync(specsDir)) {
    return { nodes, edges, fileRecord: createEmptyFileRecord(specsDir) };
  }

  const specFiles = readdirSync(specsDir)
    .filter(f => extname(f) === '.md')
    .map(f => resolve(specsDir, f));

  for (const specFilePath of specFiles) {
    const content = readFileSync(specFilePath, 'utf-8');
    const entries = parseSpecFile(content, specFilePath);

    for (const entry of entries) {
      const nodeId = makeNodeId('spec', specFilePath, String(entry.lineStart));

      nodes.push({
        id: nodeId,
        kind: 'spec_entry',
        name: entry.title,
        qualifiedName: `spec:${entry.title}`,
        filePath: specFilePath,
        language: 'markdown' as Language,
        startLine: entry.lineStart,
        endLine: entry.lineEnd,
        startColumn: 0,
        endColumn: 0,
        docstring: '',
        signature: '',
        visibility: '',
        isExported: false,
        isAsync: false,
        isStatic: false,
        isAbstract: false,
        decorators: [],
        typeParameters: [],
        sourceType: 'spec' as SourceType,
        definition: entry.content,
        aliases: [],
        keywords: entry.keywords,
        category: entry.category,
        roles: entry.roles,
        priority: entry.priority ?? '',
        status: entry.status ?? 'active',
        body: entry.content,
        metadata: {},
        updatedAt: now,
      });

      // 如果有 domain 属性，创建 derived_from edge (spec→domain)
      if (entry.domain) {
        edges.push({
          source: nodeId,
          target: makeNodeId('domain', entry.domain),
          kind: 'derived_from',
          provenance: 'spec',
        });
      }
    }
  }

  return {
    nodes,
    edges,
    fileRecord: {
      path: specsDir,
      contentHash: '',
      language: 'markdown' as Language,
      size: 0,
      modifiedAt: now,
      indexedAt: now,
      nodeCount: nodes.length,
      errors: [],
      sourceType: 'spec' as SourceType,
    },
  };
}

// ---------------------------------------------------------------------------
// Spec 文件解析 — frontmatter + 规则提取
// ---------------------------------------------------------------------------

function parseSpecFile(content: string, filePath: string): ParsedSpecEntry[] {
  const entries: ParsedSpecEntry[] = [];
  const lines = content.split('\n');

  // 解析 frontmatter
  let lineOffset = 0;
  let frontmatter: Record<string, unknown> = {};
  if (lines[0]?.trim() === '---') {
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (endIdx > 0) {
      const fmLines = lines.slice(1, endIdx);
      frontmatter = parseFrontmatter(fmLines.join('\n'));
      lineOffset = endIdx + 1;
    }
  }

  // 提取 spec 条目 — 每个二级标题 (# 或 ##) 为一个条目
  let currentEntry: ParsedSpecEntry | null = null;
  for (let i = lineOffset; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^#{1,2}\s+(.+)/);
    if (headingMatch) {
      if (currentEntry) {
        currentEntry.lineEnd = i - 1;
        entries.push(currentEntry);
      }
      const title = headingMatch[1].trim();
      currentEntry = {
        title,
        content: '',
        lineStart: i + 1,
        lineEnd: lines.length,
        keywords: (frontmatter.keywords as string[] ?? []),
        category: (frontmatter.category as string ?? ''),
        roles: (frontmatter.roles as string[] ?? []),
        domain: frontmatter.domain as string,
        priority: frontmatter.priority as string,
        status: frontmatter.status as string,
      };
    } else if (currentEntry) {
      currentEntry.content += line + '\n';
    }
  }
  if (currentEntry) {
    currentEntry.lineEnd = lines.length;
    entries.push(currentEntry);
  }

  // 如果没有任何标题但有 frontmatter，创建整体条目
  if (entries.length === 0 && Object.keys(frontmatter).length > 0) {
    entries.push({
      title: (frontmatter.title as string ?? filePath.replace(/\.md$/, '')),
      content: content,
      lineStart: 1,
      lineEnd: lines.length,
      keywords: (frontmatter.keywords as string[] ?? []),
      category: (frontmatter.category as string ?? ''),
      roles: (frontmatter.roles as string[] ?? []),
      domain: frontmatter.domain as string,
      priority: frontmatter.priority as string,
      status: frontmatter.status as string,
    });
  }

  return entries;
}

function parseFrontmatter(fmContent: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of fmContent.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const key = match[1];
      let value: unknown = match[2].trim();
      // 尝试解析 JSON 数组/对象
      const strValue = value as string;
      if (strValue.startsWith('[') || strValue.startsWith('{')) {
        try { value = JSON.parse(strValue); } catch { /* keep as string */ }
      }
      result[key] = value;
    }
  }
  return result;
}

function createEmptyFileRecord(path: string): FileRecord {
  return {
    path, contentHash: '', language: 'markdown' as Language,
    size: 0, modifiedAt: 0, indexedAt: 0, nodeCount: 0,
    errors: [], sourceType: 'spec' as SourceType,
  };
}