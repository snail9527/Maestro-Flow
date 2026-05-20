import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import {
  loadCliToolsConfig,
  resetCliToolsConfig,
  getDefaultRoleMappings,
  selectToolByRole,
  type CliToolsConfig,
} from '../../config/cli-tools-config.js';
import { ToolsOverview } from './ToolsOverview.js';
import { RoleMappings } from './RoleMappings.js';
import { RegisterSettings } from './RegisterSettings.js';
import { CommandReference } from './CommandReference.js';
import { ConfigSources } from './ConfigSources.js';
import { C, SP, BORDER, SYM, pad, KeyHints, SectionHeader, StatusBadge } from '../shared/index.js';

type View = 'dashboard' | 'tools' | 'roles' | 'register' | 'reference' | 'sources' | 'reset-confirm';

export interface ToolsDashboardProps {
  workDir: string;
  initialView?: View;
}

export function ToolsDashboard({ workDir, initialView }: ToolsDashboardProps) {
  const { exit } = useApp();
  const [view, setView] = useState<View>(initialView ?? 'dashboard');
  const [config, setConfig] = useState<CliToolsConfig | null>(null);

  const reload = async () => {
    const cfg = await loadCliToolsConfig(workDir);
    setConfig(cfg);
  };

  useEffect(() => { reload(); }, []);

  useInput((input, key) => {
    if (view === 'reset-confirm') {
      if (key.escape || input === 'n') { setView('dashboard'); return; }
      if (key.return || input === 'y') {
        resetCliToolsConfig().then(cfg => { setConfig(cfg); setView('dashboard'); });
      }
      return;
    }

    if (view !== 'dashboard') return;
    if (input === '1') setView('tools');
    if (input === '2') setView('roles');
    if (input === '3') setView('register');
    if (input === '4') setView('reference');
    if (input === '5') setView('sources');
    if (input === '6') setView('reset-confirm');
    if (input === 'q' || key.escape) exit();
  });

  if (!config) {
    return <Text dimColor>Loading configuration...</Text>;
  }

  if (view === 'tools') {
    return <ToolsOverview config={config} workDir={workDir} onBack={() => { reload(); setView('dashboard'); }} onReload={reload} />;
  }
  if (view === 'roles') {
    return <RoleMappings config={config} workDir={workDir} onBack={() => { reload(); setView('dashboard'); }} onReload={reload} />;
  }
  if (view === 'register') {
    return (
      <RegisterSettings
        config={config}
        workDir={workDir}
        onBack={() => { reload(); setView('dashboard'); }}
      />
    );
  }
  if (view === 'reference') {
    return <CommandReference config={config} onBack={() => setView('dashboard')} />;
  }
  if (view === 'sources') {
    return <ConfigSources workDir={workDir} onBack={() => setView('dashboard')} />;
  }

  if (view === 'reset-confirm') {
    return (
      <Box flexDirection="column" paddingX={SP.detailPadX}>
        <Box {...BORDER.warning} flexDirection="column" paddingX={SP.panelPadX} paddingY={SP.panelPadY}>
          <Text bold color={C.warning}>Reset CLI tools to defaults?</Text>
          <Text> </Text>
          <Text>This will overwrite ~/.maestro/cli-tools.json with default</Text>
          <Text>tool definitions and re-detect CLI availability.</Text>
          <Text>Custom roles and aliases will be lost.</Text>
        </Box>
        <KeyHints hints="[y] Confirm  [n/Esc] Cancel" />
      </Box>
    );
  }

  // Dashboard view
  const toolEntries = Object.entries(config.tools);

  return (
    <Box flexDirection="column" paddingX={SP.detailPadX}>
      <Box {...BORDER.primary} flexDirection="column" paddingX={SP.panelPadX} paddingY={SP.panelPadY}>
        <SectionHeader title="MAESTRO TOOLS" />
        <Text> </Text>

        {toolEntries.length === 0 ? (
          <Text dimColor>  No tools configured in cli-tools.json</Text>
        ) : (
          toolEntries.map(([name, entry]) => (
            <Box key={name} gap={SP.inlineGap}>
              <Text>  </Text>
              <StatusBadge enabled={entry.enabled} />
              <Text bold>{pad(name, 12)}</Text>
              <Text dimColor>{pad(entry.primaryModel || '—', 24)}</Text>
              <Text color={C.accent}>{pad(entry.reasoningEffort ?? '—', 8)}</Text>
              <Text color={C.warning}>
                {entry.tags?.length ? `[${entry.tags.join(', ')}]` : '—'}
              </Text>
            </Box>
          ))
        )}

        <Text> </Text>
        <Box gap={SP.tabGap}>
          <Text color={C.primary}>[1]</Text><Text>Tools</Text>
          <Text color={C.primary}>[2]</Text><Text>Roles</Text>
          <Text color={C.primary}>[3]</Text><Text>Register</Text>
          <Text color={C.primary}>[4]</Text><Text>Ref</Text>
          <Text color={C.primary}>[5]</Text><Text>Config</Text>
          <Text color={C.primary}>[6]</Text><Text>Reset</Text>
        </Box>
      </Box>
      <KeyHints hints="[1-6] Select  [q] Quit" />
    </Box>
  );
}
