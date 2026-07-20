import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { CyberItem } from './CyberItem.js';
import {
  toggleSelection,
  restoreDefaults,
  moveUp,
  moveDown,
  parseNumberKey,
  clampIndex,
} from './ComponentGrid.logic.js';
import type { ScannedComponent } from '../../commands/install-backend.js';
import { t } from '../../i18n/index.js';
import { C } from '../shared/index.js';

// ---------------------------------------------------------------------------
// ComponentGrid — multi-select container with category grouping + viewport
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  commands: '── Commands ──────────────────',
  skills: '── Skills ────────────────────',
  'platform-shared': '── Shared (Core) ─────────────',
  'platform-claude': '── Claude Code ───────────────',
  'platform-codex': '── Codex ─────────────────────',
  'platform-agy': '── Agy (Antigravity) ─────────',
  'platform-agents-standard': '── Open Standard (.agents/) ──',
};

type VisualRow =
  | { type: 'header'; label: string; category: string }
  | { type: 'item'; comp: ScannedComponent; itemIndex: number };

export interface ComponentGridProps {
  components: ScannedComponent[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onDone: () => void;
}

const VIEWPORT = 20;

export function ComponentGrid({
  components,
  selectedIds,
  onSelectionChange,
  onDone,
}: ComponentGridProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const prevCountRef = useRef(components.length);

  useEffect(() => {
    if (components.length !== prevCountRef.current) {
      setSelectedIndex(0);
      prevCountRef.current = components.length;
    }
  }, [components.length]);

  const mandatoryIds = useMemo(() => new Set(
    components.filter(c => c.def.mandatory).map(c => c.def.id),
  ), [components]);

  // Build grouped order: platform groups first, then sub-grouped by category.
  // `ordered` is the source of truth for both navigation and rendering.
  // Order: shared → claude → codex → agy → agents-standard
  const { ordered, visualRows, itemToVisualRow } = useMemo(() => {
    const PLATFORM_ORDER = ['shared', 'claude', 'codex', 'agy', 'agents-standard'] as const;

    // Bucket components by platform (undefined → 'shared')
    const platformMap = new Map<string, ScannedComponent[]>();
    for (const p of PLATFORM_ORDER) platformMap.set(p, []);

    for (const comp of components) {
      const plat = comp.def.platform ?? 'shared';
      if (!platformMap.has(plat)) platformMap.set(plat, []);
      platformMap.get(plat)!.push(comp);
    }

    // Within each platform group, separate uncategorized from categorized
    const orderedList: ScannedComponent[] = [];
    const rows: VisualRow[] = [];
    const mapping = new Map<number, number>();
    let itemIdx = 0;

    for (const plat of PLATFORM_ORDER) {
      const items = platformMap.get(plat);
      if (!items || items.length === 0) continue;

      // Platform header
      const platKey = `platform-${plat}`;
      const platLabel = CATEGORY_LABELS[platKey] || `── ${plat} ──`;
      rows.push({ type: 'header', label: platLabel, category: platKey });

      // Split into uncategorized and categorized within this platform
      const uncategorized: ScannedComponent[] = [];
      const catMap = new Map<string, ScannedComponent[]>();
      const catOrder: string[] = [];

      for (const comp of items) {
        const cat = comp.def.category;
        if (!cat) {
          uncategorized.push(comp);
        } else {
          if (!catMap.has(cat)) {
            catMap.set(cat, []);
            catOrder.push(cat);
          }
          catMap.get(cat)!.push(comp);
        }
      }

      // Uncategorized items first within this platform
      for (const comp of uncategorized) {
        orderedList.push(comp);
        mapping.set(itemIdx, rows.length);
        rows.push({ type: 'item', comp, itemIndex: itemIdx });
        itemIdx++;
      }

      // Then categorized sub-groups
      for (const cat of catOrder) {
        const subLabel = CATEGORY_LABELS[cat] || `── ${cat} ──`;
        rows.push({ type: 'header', label: subLabel, category: cat });
        for (const comp of catMap.get(cat)!) {
          orderedList.push(comp);
          mapping.set(itemIdx, rows.length);
          rows.push({ type: 'item', comp, itemIndex: itemIdx });
          itemIdx++;
        }
      }
    }

    return { ordered: orderedList, visualRows: rows, itemToVisualRow: mapping };
  }, [components]);

  const count = ordered.length;
  const safeIndex = clampIndex(selectedIndex, count);

  const toggleId = useCallback(
    (id: string) => {
      onSelectionChange(toggleSelection(selectedIds, id, mandatoryIds));
    },
    [selectedIds, mandatoryIds, onSelectionChange],
  );

  const toggleAt = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= count) return;
      const comp = ordered[idx];
      if (!comp.available) return;
      toggleId(comp.def.id);
    },
    [ordered, count, toggleId],
  );

  const selectAllAvailable = useCallback(() => {
    const allIds = ordered.filter((c) => c.available).map((c) => c.def.id);
    onSelectionChange(allIds);
  }, [ordered, onSelectionChange]);

  const handleDeselectAll = useCallback(() => {
    onSelectionChange(mandatoryIds.size > 0 ? Array.from(mandatoryIds) : []);
  }, [mandatoryIds, onSelectionChange]);

  const handleRestoreDefaults = useCallback(() => {
    onSelectionChange(restoreDefaults(ordered.map(c => c.def), mandatoryIds));
  }, [ordered, mandatoryIds, onSelectionChange]);

  useInput(
    (input, key) => {
      if (key.return) {
        onDone();
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((prev) => moveUp(prev, count));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => moveDown(prev, count));
        return;
      }
      if (input === ' ') {
        toggleAt(safeIndex);
        return;
      }
      if (input === 'a' || input === 'A') {
        selectAllAvailable();
        return;
      }
      if (input === 'n' || input === 'N') {
        handleDeselectAll();
        return;
      }
      if (input === 'd' || input === 'D') {
        handleRestoreDefaults();
        return;
      }
      const idx = parseNumberKey(input, count);
      if (idx >= 0) {
        toggleAt(idx);
        return;
      }
    },
  );

  if (count === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color={C.primary}>
          {t.install.componentsTitle}
        </Text>
        <Text dimColor>{t.install.componentsNone}</Text>
      </Box>
    );
  }

  const availableCount = ordered.filter((c) => c.available).length;

  // Viewport window around current cursor
  const cursorVisualRow = itemToVisualRow.get(safeIndex) ?? 0;
  const totalVisual = visualRows.length;
  let vStart = 0;
  let vEnd = totalVisual;
  if (totalVisual > VIEWPORT) {
    vStart = Math.max(0, cursorVisualRow - Math.floor(VIEWPORT / 2));
    vEnd = Math.min(totalVisual, vStart + VIEWPORT);
    if (vEnd - vStart < VIEWPORT) vStart = Math.max(0, vEnd - VIEWPORT);
  }
  const visibleRows = visualRows.slice(vStart, vEnd);

  return (
    <Box flexDirection="column">
      <Text bold color={C.primary}>
        {t.install.componentsTitle}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {vStart > 0 && <Text dimColor>  ↑ {vStart} more</Text>}
        {visibleRows.map((row, vi) => {
          if (row.type === 'header') {
            return (
              <Box key={`hdr-${row.category}`} marginTop={vi > 0 ? 1 : 0}>
                <Text color={C.primary}>{row.label}</Text>
              </Box>
            );
          }
          const { comp, itemIndex } = row;
          return (
            <CyberItem
              key={comp.def.id}
              index={itemIndex + 1}
              label={comp.def.label}
              fileCount={comp.fileCount}
              selected={selectedIds.includes(comp.def.id)}
              available={comp.available}
              highlighted={itemIndex === safeIndex}
              description={comp.def.description}
              mandatory={!!comp.def.mandatory}
            />
          );
        })}
        {vEnd < totalVisual && <Text dimColor>  ↓ {totalVisual - vEnd} more</Text>}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {t.install.componentsSelected
            .replace('{selected}', String(selectedIds.length))
            .replace('{total}', String(availableCount))}
        </Text>
      </Box>
    </Box>
  );
}
