import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  HOOK_LEVELS,
  type HookLevel,
} from '../../commands/hooks.js';
import { t } from '../../i18n/index.js';
import { C, SYM, SP, wrapCursor, parseNumberKey, KeyHints, SectionHeader } from '../shared/index.js';

// ---------------------------------------------------------------------------
// HooksConfig -- Hook level selection panel (radio-style)
// Supports: Up/Down arrows, number keys 1-4, Space to select
// ---------------------------------------------------------------------------

interface HooksConfigProps {
  level: HookLevel;
  onLevelChange: (level: HookLevel) => void;
}

export function HooksConfig({ level, onLevelChange }: HooksConfigProps) {
  const [index, setIndex] = useState(() => HOOK_LEVELS.indexOf(level));

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setIndex((i) => wrapCursor(i, -1, HOOK_LEVELS.length));
      } else if (key.downArrow) {
        setIndex((i) => wrapCursor(i, 1, HOOK_LEVELS.length));
      } else if (input === ' ') {
        onLevelChange(HOOK_LEVELS[index]);
      } else {
        const idx = parseNumberKey(input, HOOK_LEVELS.length);
        if (idx !== null) {
          setIndex(idx);
          onLevelChange(HOOK_LEVELS[idx]);
        }
      }
    },
  );

  return (
    <Box flexDirection="column">
      <SectionHeader title={t.install.hooksTitle} />

      <Box flexDirection="column" marginTop={SP.sectionGap}>
        {HOOK_LEVELS.map((lvl, i) => {
          const isActive = lvl === level;
          const isHighlighted = i === index;
          const label = lvl.charAt(0).toUpperCase() + lvl.slice(1);
          const desc = t.install.hooksLevelDescriptions[lvl];

          return (
            <Box key={lvl}>
              <Text color={isHighlighted ? C.primary : C.neutral}>
                [{i + 1}]
              </Text>
              <Text color={isActive ? C.success : C.neutral}>
                {' '}{isActive ? SYM.radioOn : SYM.radioOff}{' '}
              </Text>
              <Text color={isHighlighted ? C.primary : undefined} bold={isHighlighted}>
                {label}
              </Text>
              <Text dimColor> -- {desc}</Text>
            </Box>
          );
        })}
      </Box>

      <KeyHints hints={`[↑↓] Navigate  [Space/1-${HOOK_LEVELS.length}] Select  [Enter] Done  [Esc] Back`} />
    </Box>
  );
}
