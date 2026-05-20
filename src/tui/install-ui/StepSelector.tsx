import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { C, SYM, SP, wrapCursor, parseNumberKey, KeyHints, SectionHeader } from '../shared/index.js';

// ---------------------------------------------------------------------------
// StepSelector — checkbox multi-select for install steps
// ---------------------------------------------------------------------------

export interface StepDef {
  id: string;
  label: string;
  description: string;
}

interface StepSelectorProps {
  steps: StepDef[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onDone: () => void;
}

export function StepSelector({ steps, selectedIds, onSelectionChange, onDone }: StepSelectorProps) {
  const [index, setIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setIndex((i) => wrapCursor(i, -1, steps.length));
    } else if (key.downArrow) {
      setIndex((i) => wrapCursor(i, 1, steps.length));
    } else if (input === ' ') {
      const id = steps[index].id;
      const next = selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id];
      onSelectionChange(next);
    } else if (input === 'a' || input === 'A') {
      onSelectionChange(steps.map((s) => s.id));
    } else if (input === 'n' || input === 'N') {
      onSelectionChange([]);
    } else if (key.return) {
      onDone();
    } else {
      const idx = parseNumberKey(input, steps.length);
      if (idx !== null) {
        const id = steps[idx].id;
        const next = selectedIds.includes(id)
          ? selectedIds.filter((s) => s !== id)
          : [...selectedIds, id];
        onSelectionChange(next);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <SectionHeader title="Select Installation Steps" />
      <Box flexDirection="column" marginTop={SP.sectionGap}>
        {steps.map((step, i) => {
          const sel = selectedIds.includes(step.id);
          const hl = i === index;
          return (
            <Box key={step.id}>
              <Text color={hl ? C.primary : C.neutral}>[{i + 1}]</Text>
              <Text color={sel ? (hl ? C.successBright : C.success) : C.neutral}> {sel ? SYM.checkOn : SYM.checkOff} </Text>
              <Text color={hl ? C.primary : undefined} bold={hl}>
                {step.label}
              </Text>
              <Text dimColor> — {step.description}</Text>
            </Box>
          );
        })}
      </Box>
      <KeyHints hints={`[Space] Toggle  [1-${steps.length}] Quick toggle  [A]ll  [N]one  [Enter] Next`} />
    </Box>
  );
}
