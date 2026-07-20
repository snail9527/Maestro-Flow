import React from 'react';
import { Box, Text } from 'ink';
import { C, SYM } from '../shared/index.js';

// ---------------------------------------------------------------------------
// CyberItem — single component row in the selection grid
// ---------------------------------------------------------------------------

export interface CyberItemProps {
  /** 1-based display index (1-9) */
  index: number;
  /** Human-readable component label */
  label: string;
  /** Number of files in the source directory */
  fileCount: number;
  /** Whether this row is currently selected for install */
  selected: boolean;
  /** Whether the component has source files available */
  available: boolean;
  /** Whether this row is currently highlighted by cursor */
  highlighted: boolean;
  /** Short description of the component */
  description: string;
  /** Whether this component is mandatory (always installed, cannot be deselected) */
  mandatory?: boolean;
}

const LABEL_WIDTH = 18;
const FILE_COL_WIDTH = 12;

function padEnd(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

export function CyberItem({
  index,
  label,
  fileCount,
  selected,
  available,
  highlighted,
  description,
  mandatory,
}: CyberItemProps) {
  const paddedLabel = padEnd(label, LABEL_WIDTH);
  const filesStr = `(${fileCount} files)`.padStart(FILE_COL_WIDTH);

  if (!available) {
    return (
      <Box>
        <Text dimColor color={C.neutral}>
          [{index}] {SYM.checkOff} {paddedLabel} {filesStr} [OFFLINE]
        </Text>
      </Box>
    );
  }

  if (mandatory) {
    return (
      <Box>
        <Text color={C.neutral}>    </Text>
        <Text color={highlighted ? C.successBright : C.success}>{'◆'} </Text>
        <Text color={highlighted ? C.successBright : C.success} bold={highlighted}>{paddedLabel}</Text>
        <Text color={C.neutral}> {filesStr} </Text>
        <Text color={C.neutral}>{description}</Text>
      </Box>
    );
  }

  const checkbox = selected ? SYM.checkOn : SYM.checkOff;

  if (selected && highlighted) {
    return (
      <Box>
        <Text color={C.neutral}>[{index}] </Text>
        <Text color={C.success}>{checkbox} </Text>
        <Text color={C.successBright} bold>{paddedLabel}</Text>
        <Text color={C.neutral}> {filesStr} </Text>
        <Text color={C.neutral}>{description}</Text>
      </Box>
    );
  }

  if (selected) {
    return (
      <Box>
        <Text color={C.neutral}>[{index}] </Text>
        <Text color={C.success}>{checkbox} </Text>
        <Text color={C.success}>{paddedLabel}</Text>
        <Text color={C.neutral}> {filesStr} </Text>
        <Text color={C.neutral}>{description}</Text>
      </Box>
    );
  }

  if (highlighted) {
    return (
      <Box>
        <Text color={C.neutral}>[{index}] </Text>
        <Text color={C.primary}>{checkbox} </Text>
        <Text color={C.primary} bold>{paddedLabel}</Text>
        <Text color={C.neutral}> {filesStr} </Text>
        <Text color={C.neutral}>{description}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={C.neutral}>[{index}] </Text>
      <Text color={C.neutral}>{checkbox} </Text>
      <Text>{paddedLabel}</Text>
      <Text color={C.neutral}> {filesStr} </Text>
      <Text color={C.neutral}>{description}</Text>
    </Box>
  );
}
