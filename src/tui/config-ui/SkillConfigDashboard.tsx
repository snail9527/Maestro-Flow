import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import {
  loadSkillConfig,
  type SkillConfigFile,
} from '../../config/skill-config.js';
import {
  loadAllCommandDefs,
  type CommandDef,
} from '../../config/argument-hint-parser.js';
import { checkSkillContextHook } from '../../commands/config.js';
import { SkillsList } from './SkillsList.js';
import { SkillParamEditor } from './SkillParamEditor.js';
import { ConfigSourcesView } from './ConfigSourcesView.js';
import { C, SP, BORDER, SYM, pad, KeyHints, SectionHeader, StatusBadge } from '../shared/index.js';

type View = 'dashboard' | 'skills' | 'editor' | 'sources';

export interface SkillConfigDashboardProps {
  workDir: string;
  initialView?: View;
  editSkill?: string;
}

export function SkillConfigDashboard({ workDir, initialView, editSkill }: SkillConfigDashboardProps) {
  const { exit } = useApp();
  const [view, setView] = useState<View>(initialView ?? 'dashboard');
  const [config, setConfig] = useState<SkillConfigFile | null>(null);
  const [commandDefs, setCommandDefs] = useState<Map<string, CommandDef> | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(editSkill ?? null);
  const [hookStatus, setHookStatus] = useState<'installed' | 'not-installed'>('installed');

  const reload = () => {
    setConfig(loadSkillConfig(workDir));
    setCommandDefs(loadAllCommandDefs(workDir));
  };

  useEffect(() => {
    reload();
    setHookStatus(checkSkillContextHook());
    // If editSkill was provided, jump directly to editor
    if (editSkill) setView('editor');
  }, []);

  useInput((input, key) => {
    if (view !== 'dashboard') return;
    if (input === '1') setView('skills');
    if (input === '2') setView('sources');
    if (input === 'q' || key.escape) exit();
  });

  if (!config || !commandDefs) {
    return <Text dimColor>Loading configuration...</Text>;
  }

  if (view === 'skills') {
    return (
      <SkillsList
        config={config}
        commandDefs={commandDefs}
        workDir={workDir}
        onBack={() => { reload(); setView('dashboard'); }}
        onEdit={(skill) => { setSelectedSkill(skill); setView('editor'); }}
        onReload={reload}
      />
    );
  }

  if (view === 'editor' && selectedSkill) {
    const def = commandDefs.get(selectedSkill);
    return (
      <SkillParamEditor
        skillName={selectedSkill}
        commandDef={def ?? null}
        config={config}
        workDir={workDir}
        onBack={() => { reload(); setView('skills'); }}
        onReload={reload}
      />
    );
  }

  if (view === 'sources') {
    return <ConfigSourcesView workDir={workDir} onBack={() => { reload(); setView('dashboard'); }} />;
  }

  // Dashboard view
  const configuredSkills = Object.entries(config.skills);
  const totalCommands = commandDefs.size;

  return (
    <Box flexDirection="column" paddingX={SP.detailPadX}>
      <Box {...BORDER.primary} flexDirection="column" paddingX={SP.panelPadX} paddingY={SP.panelPadY}>
        <SectionHeader title="MAESTRO SKILL CONFIG" />
        <Text> </Text>

        <Box gap={SP.tabGap}>
          <Text>Commands discovered:</Text>
          <Text bold color={C.success}>{totalCommands}</Text>
        </Box>
        <Box gap={SP.tabGap}>
          <Text>Skills with defaults:</Text>
          <Text bold color={C.warning}>{configuredSkills.length}</Text>
        </Box>
        <Box gap={SP.tabGap}>
          <Text>Hook (skill-context):</Text>
          <StatusBadge enabled={hookStatus === 'installed'} labels={{ on: 'installed', off: 'not installed' }} />
        </Box>

        {hookStatus === 'not-installed' && (
          <Box marginTop={SP.sectionGap}>
            <Text color={C.error}>  Parameter injection requires the skill-context hook.</Text>
          </Box>
        )}
        {hookStatus === 'not-installed' && (
          <Text dimColor>  Run: maestro hooks install --level standard</Text>
        )}

        {configuredSkills.length > 0 && (
          <>
            <Text> </Text>
            <Text dimColor>Configured:</Text>
            {configuredSkills.slice(0, 8).map(([name, defaults]) => {
              const paramCount = Object.keys(defaults.params).length;
              return (
                <Box key={name} gap={SP.inlineGap}>
                  <Text color={C.success}>  {SYM.enabled}</Text>
                  <Text bold>{pad(name, 28)}</Text>
                  <Text dimColor>{paramCount} param{paramCount !== 1 ? 's' : ''}</Text>
                </Box>
              );
            })}
            {configuredSkills.length > 8 && (
              <Text dimColor>  ... and {configuredSkills.length - 8} more</Text>
            )}
          </>
        )}

        <Text> </Text>
        <Box gap={SP.tabGap}>
          <Text color={C.primary}>[1]</Text><Text>Skills</Text>
          <Text color={C.primary}>[2]</Text><Text>Config Sources</Text>
        </Box>
      </Box>
      <KeyHints hints="[1-2] Select  [q] Quit" />
    </Box>
  );
}
