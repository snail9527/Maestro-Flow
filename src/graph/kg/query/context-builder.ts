// src/graph/kg/query/context-builder.ts — 上下文组装 (for hook inject)
// 参考: plan-maestrograph.md 统一 Hook Injector 设计

import type { KgQueryBuilder } from '../db/queries.js';
import type { UnifiedNode, UnifiedEdge, SourceType } from '../db/types.js';
import { searchUnified, parseQuery } from './search.js';
import { bfs } from './traversal.js';

// ---------------------------------------------------------------------------
// Context Section — 注入到 agent 的知识片段
// ---------------------------------------------------------------------------

export interface ContextSection {
  label: string;
  lines: string[];
  sourceType: SourceType;
  relevance: number;
}

export interface ContextBudget {
  maxTotalChars: number;
  maxSections: number;
  maxCharsPerSection: number;
}

const DEFAULT_BUDGET: ContextBudget = {
  maxTotalChars: 8000,
  maxSections: 10,
  maxCharsPerSection: 2000,
};

// ---------------------------------------------------------------------------
// 上下文构建入口
// ---------------------------------------------------------------------------

export interface BuiltContext {
  sections: ContextSection[];
  totalChars: number;
  summary: {
    codeSymbols: number;
    domainTerms: number;
    specRules: number;
    knowhowDocs: number;
  };
}

/**
 * 从查询结果构建 agent 上下文
 *
 * 1. FTS5 搜索 → 直接命中
 * 2. 图遍历 → 1-hop 关联
 * 3. 按 source_type 分组组装 sections
 * 4. Context budget 管控
 */
export function buildContext(
  queries: KgQueryBuilder,
  prompt: string,
  options?: {
    budget?: Partial<ContextBudget>;
    expandDepth?: number;
    agentType?: string;
  },
): BuiltContext {
  const budget = { ...DEFAULT_BUDGET, ...options?.budget };
  const expandDepth = options?.expandDepth ?? 1;

  // Step 1: FTS5 搜索
  const { directMatches, summary } = searchUnified(queries, prompt, {
    limit: 15,
    includeCode: true,
    includeKnowledge: true,
  });

  // Step 2: 图遍历 — 从命中节点扩展 1 hop
  const relatedNodes = new Map<string, UnifiedNode>();
  const seedIds = directMatches.map(m => m.node.id);

  if (expandDepth > 0 && seedIds.length > 0) {
    for (const seedId of seedIds.slice(0, 5)) { // 限制种子数避免爆炸
      const traversal = bfs(queries, seedId, {
        maxDepth: expandDepth,
        maxNodes: 10,
      });
      for (const [id, node] of traversal.nodes) {
        if (!seedIds.includes(id)) {
          relatedNodes.set(id, node);
        }
      }
    }
  }

  // Step 3: 按 source_type 分组
  const sections: ContextSection[] = [];
  const allNodes = new Map<string, UnifiedNode>();
  for (const m of directMatches) allNodes.set(m.node.id, m.node);
  for (const [id, node] of relatedNodes) allNodes.set(id, node);

  // Domain terms
  const domainNodes = [...allNodes.values()].filter(n => n.sourceType === 'domain');
  if (domainNodes.length > 0) {
    sections.push({
      label: `domain[${domainNodes.map(n => n.name).join(',')}]`,
      lines: formatDomainNodes(domainNodes),
      sourceType: 'domain',
      relevance: domainNodes.length * 3,
    });
  }

  // Spec entries
  const specNodes = [...allNodes.values()].filter(n => n.sourceType === 'spec');
  if (specNodes.length > 0) {
    sections.push({
      label: `spec[${specNodes.map(n => n.category).join(',')}]`,
      lines: formatSpecNodes(specNodes),
      sourceType: 'spec',
      relevance: specNodes.length * 2,
    });
  }

  // Knowhow docs
  const knowhowNodes = [...allNodes.values()].filter(n => n.sourceType === 'knowhow');
  if (knowhowNodes.length > 0) {
    sections.push({
      label: `knowhow[${knowhowNodes.map(n => n.name).join(',')}]`,
      lines: formatKnowhowNodes(knowhowNodes),
      sourceType: 'knowhow',
      relevance: knowhowNodes.length * 2,
    });
  }

  // Code symbols
  const codeNodes = [...allNodes.values()].filter(n => n.sourceType === 'codegraph');
  if (codeNodes.length > 0) {
    sections.push({
      label: `code[${codeNodes.map(n => n.name).join(',')}]`,
      lines: formatCodeNodes(codeNodes),
      sourceType: 'codegraph',
      relevance: codeNodes.length,
    });
  }

  // Codebase docs
  const codebaseNodes = [...allNodes.values()].filter(n => n.sourceType === 'codebase');
  if (codebaseNodes.length > 0) {
    sections.push({
      label: `codebase[${codebaseNodes.map(n => n.name).join(',')}]`,
      lines: formatCodebaseNodes(codebaseNodes),
      sourceType: 'codebase',
      relevance: codebaseNodes.length,
    });
  }

  // Issues
  const issueNodes = [...allNodes.values()].filter(n => n.sourceType === 'issue');
  if (issueNodes.length > 0) {
    sections.push({
      label: `issues[${issueNodes.map(n => n.name).join(',')}]`,
      lines: formatIssueNodes(issueNodes),
      sourceType: 'issue',
      relevance: issueNodes.length,
    });
  }

  // Step 4: Context budget 管控
  const prioritized = sections.sort((a, b) => b.relevance - a.relevance);
  const selected: ContextSection[] = [];
  let totalChars = 0;

  for (const section of prioritized) {
    if (selected.length >= budget.maxSections) break;

    const sectionText = section.lines.join('\n');
    if (sectionText.length > budget.maxCharsPerSection) {
      section.lines = section.lines.slice(0, Math.floor(budget.maxCharsPerSection / 80));
    }

    const sectionChars = section.lines.join('\n').length;
    if (totalChars + sectionChars > budget.maxTotalChars) break;

    selected.push(section);
    totalChars += sectionChars;
  }

  return {
    sections: selected,
    totalChars,
    summary,
  };
}

// ---------------------------------------------------------------------------
// 格式化函数 — 将节点转为可读文本
// ---------------------------------------------------------------------------

function formatDomainNodes(nodes: UnifiedNode[]): string[] {
  return nodes.map(n => {
    const aliases = n.aliases.length > 0 ? ` (别名: ${n.aliases.join(', ')})` : '';
    return `[domain] ${n.name}${aliases}: ${n.definition}`;
  });
}

function formatSpecNodes(nodes: UnifiedNode[]): string[] {
  return nodes.map(n => {
    const roles = n.roles.length > 0 ? ` [${n.roles.join(',')}]` : '';
    return `[spec:${n.category}] ${n.name}${roles}: ${n.definition.substring(0, 200)}`;
  });
}

function formatKnowhowNodes(nodes: UnifiedNode[]): string[] {
  return nodes.map(n => {
    const tags = n.keywords.length > 0 ? ` #${n.keywords.slice(0, 3).join(' #')}` : '';
    return `[knowhow:${n.metadata.type ?? ''}] ${n.name}${tags}: ${n.definition.substring(0, 200)}`;
  });
}

function formatCodeNodes(nodes: UnifiedNode[]): string[] {
  return nodes.map(n => {
    const sig = n.signature ? ` ${n.signature}` : '';
    const file = n.filePath ? ` (${n.filePath}:${n.startLine})` : '';
    return `[${n.kind}] ${n.name}${sig}${file}`;
  });
}

function formatCodebaseNodes(nodes: UnifiedNode[]): string[] {
  return nodes.map(n => `[codebase] ${n.name}: ${n.definition.substring(0, 200)}`);
}

function formatIssueNodes(nodes: UnifiedNode[]): string[] {
  return nodes.map(n => {
    const sev = n.category ? ` [${n.category}]` : '';
    return `[issue] ${n.name}${sev}: ${n.definition.substring(0, 200)}`;
  });
}

// ---------------------------------------------------------------------------
// Agent-type 特化 — PreToolUse 时加载 role-based spec
// ---------------------------------------------------------------------------

const AGENT_CATEGORY_MAP: Record<string, string[]> = {
  'implement': ['coding', 'arch'],
  'review': ['review', 'coding'],
  'debug': ['debug', 'learning'],
  'plan': ['arch', 'coding'],
  'test': ['test', 'coding'],
  'analyze': ['arch', 'learning'],
};

export function getAgentCategories(agentType: string): string[] {
  return AGENT_CATEGORY_MAP[agentType] ?? [];
}