import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { C, BORDER, SP, pad } from '../shared/index.js';

import type {
  AnalyticsLogEntry,
  SpecAnalyticsSummary,
} from '../../hooks/spec-analytics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecAnalyticsPanelProps {
  workDir: string;
  onBack?: () => void;
}

type ViewMode = 'summary' | 'recent' | 'keywords' | 'agents' | 'hooks';

const VIEW_TABS: { key: string; mode: ViewMode; label: string }[] = [
  { key: 's', mode: 'summary', label: 'summary' },
  { key: 'r', mode: 'recent', label: 'recent' },
  { key: 'k', mode: 'keywords', label: 'keywords' },
  { key: 'a', mode: 'agents', label: 'agents' },
  { key: 'h', mode: 'hooks', label: 'hooks' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpecAnalyticsPanel({ workDir, onBack }: SpecAnalyticsPanelProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<ViewMode>('summary');
  const [entries, setEntries] = useState<AnalyticsLogEntry[]>([]);
  const [stats, setStats] = useState<SpecAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Load data
  useEffect(() => {
    (async () => {
      const { readAnalytics, computeStats, getLogFileSize } = await import('../../hooks/spec-analytics.js');
      const all = readAnalytics(workDir);
      const fileSize = getLogFileSize(workDir);
      setEntries(all);
      setStats(computeStats(all, fileSize));
      setLoading(false);
    })();
  }, [workDir]);

  // Filtered entries for recent view
  const recentEntries = useMemo(() => {
    return [...entries].reverse().slice(0, 100);
  }, [entries]);

  useInput((input, key) => {
    // Mode switching
    for (const tab of VIEW_TABS) {
      if (input === tab.key && !key.ctrl) { setMode(tab.mode); setCursor(0); setExpandedIdx(null); return; }
    }

    if (input === 'q' || key.escape) {
      if (onBack) { onBack(); return; }
      exit();
      return;
    }

    // Cursor navigation for list views
    if (mode === 'recent' || mode === 'keywords' || mode === 'agents' || mode === 'hooks') {
      if (key.upArrow) { setCursor(c => Math.max(0, c - 1)); setExpandedIdx(null); }
      if (key.downArrow) { setCursor(c => c + 1); setExpandedIdx(null); }
      if (key.return) { setExpandedIdx(prev => prev === cursor ? null : cursor); }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box {...BORDER.primary} flexDirection="column" paddingX={SP.panelPadX} paddingY={SP.panelPadY}>
          <Text bold color={C.primary}>SPEC ANALYTICS</Text>
          <Text> </Text>
          <Text dimColor>Loading analytics data...</Text>
        </Box>
      </Box>
    );
  }

  if (!stats || entries.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box {...BORDER.primary} flexDirection="column" paddingX={SP.panelPadX} paddingY={SP.panelPadY}>
          <Text bold color={C.primary}>SPEC ANALYTICS</Text>
          <Text> </Text>
          <Text dimColor>No analytics data yet. Spec injection events will be recorded automatically.</Text>
          <Text> </Text>
          <Text dimColor>  [q] back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box {...BORDER.primary} flexDirection="column" paddingX={SP.panelPadX} paddingY={SP.panelPadY}>
        <Text bold color={C.primary}>SPEC ANALYTICS</Text>
        <Text> </Text>

        {/* Tab bar */}
        <Box gap={1}>
          {VIEW_TABS.map(tab => (
            <Box key={tab.key}>
              {tab.mode === mode
                ? <Text bold inverse color={C.primary}>{` [${tab.key}]${tab.label} `}</Text>
                : <Text dimColor>{` [${tab.key}]${tab.label} `}</Text>
              }
            </Box>
          ))}
        </Box>
        <Text> </Text>

        {/* Content */}
        {mode === 'summary' && <SummaryView stats={stats} />}
        {mode === 'recent' && <RecentView entries={recentEntries} cursor={cursor} expandedIdx={expandedIdx} />}
        {mode === 'keywords' && <KeywordsView stats={stats} cursor={cursor} />}
        {mode === 'agents' && <AgentsView stats={stats} cursor={cursor} />}
        {mode === 'hooks' && <HooksView stats={stats} cursor={cursor} />}

        <Text> </Text>
        <Text dimColor>  [s/r/k/a/h] mode  [q] back{mode !== 'summary' ? '  [↑↓] navigate  [↵] expand' : ''}</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function SummaryView({ stats }: { stats: SpecAnalyticsSummary }) {
  const hitColor = stats.hitRate >= 80 ? C.success : stats.hitRate >= 50 ? C.warning : C.error;
  const sizeKB = (stats.logFileSize / 1024).toFixed(1);
  const earliest = stats.timeRange.earliest ? stats.timeRange.earliest.slice(0, 10) : '—';
  const latest = stats.timeRange.latest ? stats.timeRange.latest.slice(0, 10) : '—';

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text>Total injections:</Text>
        <Text bold>{stats.totalInjections}</Text>
      </Box>
      <Box gap={2}>
        <Text>Successful:</Text>
        <Text bold color={C.success}>{stats.successfulInjections}</Text>
        <Text color={hitColor}>({stats.hitRate.toFixed(1)}%)</Text>
      </Box>
      <Box gap={2}>
        <Text>Failed:</Text>
        <Text bold color={C.error}>{stats.failedInjections}</Text>
        <Text dimColor>({(100 - stats.hitRate).toFixed(1)}%)</Text>
      </Box>

      <Text> </Text>
      <Text bold>By Source:</Text>
      {Object.entries(stats.bySource).map(([src, s]) => {
        const rate = s.total > 0 ? ((s.injected / s.total) * 100).toFixed(1) : '0.0';
        return (
          <Box key={src} gap={1}>
            <Text>  {pad(src, 28)}</Text>
            <Text bold>{String(s.total).padStart(4)}</Text>
            <Text dimColor> ({rate}% hit)</Text>
          </Box>
        );
      })}

      {/* Budget actions */}
      {Object.keys(stats.byBudgetAction).length > 0 && (
        <>
          <Text> </Text>
          <Text bold>Budget Actions:</Text>
          <Text>  {Object.entries(stats.byBudgetAction).map(([k, v]) => `${k}: ${v}`).join('  ')}</Text>
        </>
      )}

      {/* Top categories */}
      {Object.keys(stats.byCategory).length > 0 && (
        <>
          <Text> </Text>
          <Text bold>Categories:</Text>
          <Text>  {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join('  ')}</Text>
        </>
      )}

      {/* Hook stats */}
      {stats.hookStats.totalInvocations > 0 && (
        <>
          <Text> </Text>
          <Text bold>Hook Invocations: <Text color={C.primary}>{stats.hookStats.totalInvocations}</Text></Text>
          <Text>  {Object.entries(stats.hookStats.byHook).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join('  ')}</Text>
        </>
      )}

      {/* CLI stats */}
      {Object.keys(stats.cliStats).length > 0 && (
        <>
          <Text> </Text>
          <Text bold>CLI Endpoints:</Text>
          <Text>  {Object.entries(stats.cliStats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join('  ')}</Text>
        </>
      )}

      <Text> </Text>
      <Text dimColor>  Log: {sizeKB} KB | {stats.totalEntries} entries | {earliest} ~ {latest}</Text>
    </Box>
  );
}

function RecentView({ entries, cursor, expandedIdx }: { entries: AnalyticsLogEntry[]; cursor: number; expandedIdx: number | null }) {
  const PAGE_SIZE = 20;
  const safeC = Math.min(cursor, Math.max(0, entries.length - 1));
  const pageStart = Math.max(0, safeC - Math.floor(PAGE_SIZE / 2));
  const visible = entries.slice(pageStart, pageStart + PAGE_SIZE);

  if (entries.length === 0) return <Text dimColor>No events recorded.</Text>;

  return (
    <Box flexDirection="column">
      <Text dimColor>  Showing {visible.length} of {entries.length} events (newest first)</Text>
      <Text> </Text>
      {visible.map((entry, i) => {
        const idx = pageStart + i;
        const selected = idx === safeC;
        const expanded = idx === expandedIdx;
        const ts = entry.timestamp.slice(11, 19);

        if (entry.type === 'injection') {
          const icon = entry.inject ? '\u2713' : '\u2717';
          const iconColor = entry.inject ? C.success : C.error;
          const src = entry.source.replace('spec-', '').slice(0, 18).padEnd(18);
          const agent = (entry.agentType ?? entry.inferredCategory ?? '').slice(0, 20).padEnd(20);

          return (
            <Box key={entry.id} flexDirection="column">
              <Box>
                <Text color={selected ? C.primary : undefined} bold={selected}>
                  {selected ? '\u25B6' : ' '} {ts} </Text>
                <Text color={iconColor}>{icon}</Text>
                <Text> {src} {agent} </Text>
                <Text dimColor>{entry.specCount} specs</Text>
                {entry.matchedKeywords && entry.matchedKeywords.length > 0 && (
                  <Text color={C.warning}> kw:[{entry.matchedKeywords.slice(0, 3).join(',')}]</Text>
                )}
                {entry.reason && <Text dimColor> ({entry.reason})</Text>}
              </Box>
              {expanded && (
                <Box flexDirection="column" paddingLeft={4}>
                  <Text dimColor>  ID: {entry.id}</Text>
                  {entry.promptSnippet && <Text dimColor>  Prompt: {entry.promptSnippet.slice(0, 100)}...</Text>}
                  {entry.categories.length > 0 && <Text dimColor>  Categories: {entry.categories.join(', ')}</Text>}
                  {entry.budgetAction && <Text dimColor>  Budget: {entry.budgetAction}</Text>}
                  <Text dimColor>  Content: {entry.contentLength} chars</Text>
                  {entry.matchedEntryIds && <Text dimColor>  Entries: {entry.matchedEntryIds.join(', ')}</Text>}
                  {entry.totalPromptKeywords != null && <Text dimColor>  Prompt keywords: {entry.totalPromptKeywords}  Dedup filtered: {entry.dedupFilteredCount ?? 0}</Text>}
                </Box>
              )}
            </Box>
          );
        }

        if (entry.type === 'cli') {
          return (
            <Box key={entry.id} flexDirection="column">
              <Box>
                <Text color={selected ? C.primary : undefined} bold={selected}>
                  {selected ? '\u25B6' : ' '} {ts} </Text>
                <Text color={C.primary}>CLI</Text>
                <Text> {entry.command.padEnd(25)}</Text>
                <Text dimColor>{JSON.stringify(entry.args)}</Text>
              </Box>
              {expanded && (
                <Box paddingLeft={4}>
                  <Text dimColor>  ID: {entry.id}  Full args: {JSON.stringify(entry.args, null, 2)}</Text>
                </Box>
              )}
            </Box>
          );
        }

        if (entry.type === 'hook') {
          return (
            <Box key={entry.id} flexDirection="column">
              <Box>
                <Text color={selected ? C.primary : undefined} bold={selected}>
                  {selected ? '\u25B6' : ' '} {ts} </Text>
                <Text color={C.warning}>HOOK</Text>
                <Text> {entry.hookName.padEnd(20)}</Text>
                {entry.nodeId && <Text dimColor> node:{entry.nodeId}</Text>}
                {entry.outcome && <Text dimColor> outcome:{entry.outcome}</Text>}
              </Box>
              {expanded && entry.data && (
                <Box paddingLeft={4}>
                  <Text dimColor>  {JSON.stringify(entry.data)}</Text>
                </Box>
              )}
            </Box>
          );
        }

        return null;
      })}
    </Box>
  );
}

function KeywordsView({ stats, cursor }: { stats: SpecAnalyticsSummary; cursor: number }) {
  const kws = stats.keywordStats.topKeywords;

  if (kws.length === 0) {
    return <Text dimColor>No keyword matches recorded yet.</Text>;
  }

  const maxCount = kws[0]?.count ?? 1;

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text>Total keyword matches:</Text>
        <Text bold color={C.success}>{stats.keywordStats.totalMatches}</Text>
      </Box>
      <Box gap={2}>
        <Text>Avg matched/prompt:</Text>
        <Text bold>{stats.keywordStats.avgMatchedPerPrompt.toFixed(1)}</Text>
      </Box>
      <Box gap={2}>
        <Text>Dedup filtered total:</Text>
        <Text bold color={C.warning}>{stats.keywordStats.dedupFilteredTotal}</Text>
      </Box>

      <Text> </Text>
      <Text bold>Top Keywords (by match count):</Text>
      <Text> </Text>
      {kws.map((kw, i) => {
        const selected = i === cursor;
        const barLen = Math.max(1, Math.round((kw.count / maxCount) * 30));
        const bar = '\u2588'.repeat(barLen);
        return (
          <Box key={kw.keyword} gap={1}>
            <Text color={selected ? C.primary : undefined} bold={selected}>
              {selected ? '\u25B6' : ' '} {pad(kw.keyword, 22)}
            </Text>
            <Text color={C.success}>{bar}</Text>
            <Text bold> {kw.count}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function AgentsView({ stats, cursor }: { stats: SpecAnalyticsSummary; cursor: number }) {
  const agents = Object.entries(stats.byAgentType)
    .map(([name, s]) => ({ name, ...s, rate: s.total > 0 ? (s.injected / s.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);

  if (agents.length === 0) {
    return <Text dimColor>No agent data recorded yet.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Agent Type Injection Statistics:</Text>
      <Text> </Text>
      <Box gap={1}>
        <Text dimColor>  {'Agent/Category'.padEnd(28)}</Text>
        <Text dimColor>{'Total'.padStart(6)}</Text>
        <Text dimColor>{'Hit'.padStart(6)}</Text>
        <Text dimColor>{'Miss'.padStart(6)}</Text>
        <Text dimColor>{'Rate'.padStart(8)}</Text>
      </Box>
      {agents.map((a, i) => {
        const selected = i === cursor;
        const rateColor = a.rate >= 80 ? C.success : a.rate >= 50 ? C.warning : C.error;
        return (
          <Box key={a.name} gap={1}>
            <Text color={selected ? C.primary : undefined} bold={selected}>
              {selected ? '\u25B6' : ' '} {pad(a.name, 27)}
            </Text>
            <Text>{String(a.total).padStart(6)}</Text>
            <Text color={C.success}>{String(a.injected).padStart(6)}</Text>
            <Text color={C.error}>{String(a.total - a.injected).padStart(6)}</Text>
            <Text color={rateColor}>{(a.rate.toFixed(1) + '%').padStart(8)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function HooksView({ stats, cursor }: { stats: SpecAnalyticsSummary; cursor: number }) {
  const hooks = Object.entries(stats.hookStats.byHook)
    .sort((a, b) => b[1] - a[1]);
  const plugins = Object.entries(stats.hookStats.byPlugin)
    .sort((a, b) => b[1] - a[1]);

  if (hooks.length === 0) {
    return <Text dimColor>No hook invocations recorded yet.</Text>;
  }

  const maxCount = hooks[0]?.[1] ?? 1;

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text>Total hook invocations:</Text>
        <Text bold color={C.primary}>{stats.hookStats.totalInvocations}</Text>
      </Box>
      {stats.hookStats.avgDurationMs > 0 && (
        <Box gap={2}>
          <Text>Avg duration:</Text>
          <Text bold>{stats.hookStats.avgDurationMs.toFixed(1)}ms</Text>
        </Box>
      )}

      <Text> </Text>
      <Text bold>By Hook Name:</Text>
      <Text> </Text>
      {hooks.map(([name, count], i) => {
        const selected = i === cursor;
        const barLen = Math.max(1, Math.round((count / maxCount) * 30));
        const bar = '\u2588'.repeat(barLen);
        return (
          <Box key={name} gap={1}>
            <Text color={selected ? C.primary : undefined} bold={selected}>
              {selected ? '\u25B6' : ' '} {pad(name, 20)}
            </Text>
            <Text color={C.warning}>{bar}</Text>
            <Text bold> {count}</Text>
          </Box>
        );
      })}

      {plugins.length > 0 && (
        <>
          <Text> </Text>
          <Text bold>By Plugin:</Text>
          {plugins.map(([name, count]) => (
            <Box key={name} gap={1}>
              <Text>  {pad(name, 20)}</Text>
              <Text bold>{count}</Text>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
