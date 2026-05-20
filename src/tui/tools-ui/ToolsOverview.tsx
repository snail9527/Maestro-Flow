import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import {
  saveCliToolsConfig,
  DOMAIN_TAGS,
  REASONING_EFFORTS,
  type CliToolsConfig,
  type ReasoningEffort,
} from '../../config/cli-tools-config.js';
import { C, SYM, SP, BORDER, pad, wrapCursor, KeyHints, SectionHeader, StatusBadge, CursorMarker } from '../shared/index.js';

export interface ToolsOverviewProps {
  config: CliToolsConfig;
  workDir: string;
  onBack: () => void;
  onReload: () => void;
}

type Mode = 'list' | 'edit-tags' | 'edit-settings' | 'edit-effort';

export function ToolsOverview({ config, workDir, onBack, onReload }: ToolsOverviewProps) {
  const entries = Object.entries(config.tools);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [tagCursor, setTagCursor] = useState(0);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [effortCursor, setEffortCursor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  useInput((input, key) => {
    if (saving) return;

    if (mode === 'list') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) setCursor(c => wrapCursor(c, -1, entries.length));
      if (key.downArrow) setCursor(c => wrapCursor(c, 1, entries.length));
      if (input === 't' && entries.length > 0) {
        // Enter tag editing for current tool
        setEditTags([...(entries[cursor][1].tags ?? [])]);
        setTagCursor(0);
        setMode('edit-tags');
      }
      if (input === 's' && entries.length > 0) {
        // Enter settingsFile editing for current tool
        setSettingsError('');
        setMode('edit-settings');
      }
      if (input === 'e' && entries.length > 0) {
        // Enter reasoning effort editing for current tool
        const current = entries[cursor][1].reasoningEffort;
        // effortOptions: [undefined, ...REASONING_EFFORTS] — index 0 = default (unset)
        const idx = current ? REASONING_EFFORTS.indexOf(current) + 1 : 0;
        setEffortCursor(idx);
        setMode('edit-effort');
      }
      if (input === ' ' && entries.length > 0) {
        // Toggle enabled
        const [name, entry] = entries[cursor];
        setSaving(true);
        saveCliToolsConfig({ tools: { [name]: { ...entry, enabled: !entry.enabled } } }, 'global', workDir)
          .then(() => { onReload(); setSaving(false); });
      }
    }

    if (mode === 'edit-tags') {
      if (key.escape) { setMode('list'); return; }
      if (key.upArrow) setTagCursor(c => c > 0 ? c - 1 : DOMAIN_TAGS.length - 1);
      if (key.downArrow) setTagCursor(c => c < DOMAIN_TAGS.length - 1 ? c + 1 : 0);
      if (input === ' ' || key.return) {
        const tag = DOMAIN_TAGS[tagCursor];
        setEditTags(prev =>
          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
        );
      }
      if (input === 's') {
        // Save tags
        const [name, entry] = entries[cursor];
        setSaving(true);
        saveCliToolsConfig({ tools: { [name]: { ...entry, tags: editTags } } }, 'global', workDir)
          .then(() => { onReload(); setSaving(false); setMode('list'); });
      }
    }

    if (mode === 'edit-effort') {
      const optionCount = REASONING_EFFORTS.length + 1; // +1 for "default" (unset)
      if (key.escape) { setMode('list'); return; }
      if (key.upArrow) setEffortCursor(c => c > 0 ? c - 1 : optionCount - 1);
      if (key.downArrow) setEffortCursor(c => c < optionCount - 1 ? c + 1 : 0);
      if (key.return || input === ' ') {
        const [name, entry] = entries[cursor];
        const newEffort: ReasoningEffort | undefined = effortCursor === 0 ? undefined : REASONING_EFFORTS[effortCursor - 1];
        // Build updated entry — explicitly remove reasoningEffort when set to default
        const updated = { ...entry };
        if (newEffort) {
          updated.reasoningEffort = newEffort;
        } else {
          delete updated.reasoningEffort;
        }
        setSaving(true);
        saveCliToolsConfig({ tools: { [name]: updated } }, 'global', workDir)
          .then(() => { onReload(); setSaving(false); setMode('list'); });
      }
    }

    if (mode === 'edit-settings') {
      if (key.escape) { setSettingsError(''); setMode('list'); return; }
    }
  });

  const handleSettingsSubmit = (value: string) => {
    const [name, entry] = entries[cursor];
    const newPath = value.trim() || undefined;
    setSaving(true);
    saveCliToolsConfig({ tools: { [name]: { ...entry, settingsFile: newPath } } }, 'global', workDir)
      .then(() => { onReload(); setSaving(false); setMode('list'); })
      .catch((err: unknown) => {
        setSettingsError(err instanceof Error ? err.message : String(err));
        setSaving(false);
      });
  };

  if (entries.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">Tools Overview</Text>
        <Text dimColor>No tools configured.</Text>
        <Text dimColor>[Esc] Back</Text>
      </Box>
    );
  }

  if (mode === 'edit-tags') {
    const [name] = entries[cursor];
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">Edit Tags: <Text color="green">{name}</Text></Text>
        <Text> </Text>
        {DOMAIN_TAGS.map((tag, i) => {
          const selected = editTags.includes(tag);
          const active = i === tagCursor;
          return (
            <Box key={tag} gap={1}>
              <Text color={active ? 'cyan' : undefined}>
                {active ? '▸' : ' '} {selected ? '[✓]' : '[ ]'}
              </Text>
              <Text bold={active} color={active ? 'cyan' : selected ? 'green' : undefined}>{tag}</Text>
            </Box>
          );
        })}
        <Text> </Text>
        <Text dimColor>[↑↓] Navigate  [Space] Toggle  [s] Save  [Esc] Cancel</Text>
      </Box>
    );
  }

  if (mode === 'edit-effort') {
    const [name] = entries[cursor];
    const effortOptions: Array<{ label: string; value: ReasoningEffort | undefined }> = [
      { label: 'default (unset)', value: undefined },
      ...REASONING_EFFORTS.map(e => ({ label: e, value: e as ReasoningEffort })),
    ];
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">Reasoning Effort: <Text color="green">{name}</Text></Text>
        <Text> </Text>
        {effortOptions.map((opt, i) => {
          const active = i === effortCursor;
          return (
            <Box key={opt.label} gap={1}>
              <Text color={active ? 'cyan' : undefined}>
                {active ? '▸' : ' '}
              </Text>
              <Text bold={active} color={active ? 'cyan' : undefined}>{opt.label}</Text>
            </Box>
          );
        })}
        <Text> </Text>
        <Text dimColor>[↑↓] Navigate  [Enter/Space] Select  [Esc] Cancel</Text>
        {saving && <Text dimColor>Saving...</Text>}
      </Box>
    );
  }

  if (mode === 'edit-settings') {
    const [name, entry] = entries[cursor];
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">Edit Settings: <Text color="green">{name}</Text></Text>
        <Text> </Text>
        <Box gap={1}>
          <Text>Settings file:</Text>
          <TextInput
            defaultValue={entry.settingsFile ?? ''}
            placeholder="~/.maestro/profiles/settings.json (empty to clear)"
            onSubmit={handleSettingsSubmit}
          />
        </Box>
        {settingsError && <Text color="red">  {settingsError}</Text>}
        <Text> </Text>
        <Text dimColor>[Enter] Save  [Esc] Cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Tools Overview</Text>
      <Text> </Text>

      <Box gap={1}>
        <Text dimColor>{'  '}{pad('Tool', 12)}</Text>
        <Text dimColor>{pad('Model', 24)}</Text>
        <Text dimColor>{pad('Effort', 8)}</Text>
        <Text dimColor>{pad('Tags', 24)}</Text>
        <Text dimColor>Settings</Text>
      </Box>
      <Text dimColor>{'  ' + '─'.repeat(80)}</Text>

      {entries.map(([name, entry], i) => {
        const active = i === cursor;
        const color = active ? 'cyan' : undefined;
        const statusIcon = entry.enabled ? '✓' : '✗';
        const statusColor = entry.enabled ? 'green' : 'red';
        const effort = entry.reasoningEffort ?? '—';
        const tags = entry.tags?.length ? entry.tags.join(', ') : '—';
        const settings = entry.settingsFile || '—';

        return (
          <Box key={name} gap={1}>
            <Text color={statusColor}>{active ? '▸' : ' '}{statusIcon}</Text>
            <Text bold={active} color={color}>{pad(name, 12)}</Text>
            <Text color={color}>{pad(entry.primaryModel || '—', 24)}</Text>
            <Text color="magenta">{pad(effort, 8)}</Text>
            <Text color="yellow">{pad(tags, 24)}</Text>
            <Text dimColor={!entry.settingsFile}>{settings}</Text>
          </Box>
        );
      })}

      <Text> </Text>
      <Text dimColor>[↑↓] Navigate  [Space] Toggle  [t] Tags  [e] Effort  [s] Settings  [Esc] Back</Text>
      {saving && <Text dimColor>Saving...</Text>}
    </Box>
  );
}
