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
}

/** Fixed width for label padding to align file counts */
const LABEL_WIDTH = 16;
/** Fixed width for file count display */
const FILE_COL_WIDTH = 10;

function padEnd(str: string, len: number): string {
  // Visual padding — accounts for wide chars by truncating to len
  if (str.length >= len) return str.slice(0, len);
  return str + '.'.repeat(len - str.length);
}

export function CyberItem({
  index,
  label,
  fileCount,
  selected,
  available,
  highlighted,
  description,
}: CyberItemProps) {
  const checkbox = selected ? SYM.checkOn : SYM.checkOff;
  const paddedLabel = padEnd(label, LABEL_WIDTH);
  const filesStr = `(${fileCount} files)`.padStart(FILE_COL_WIDTH);

  // Determine color state
  if (!available) {
    return (
      <Box>
        <Text dimColor color={C.neutral}>
          [{index}] {checkbox} {paddedLabel} {filesStr} [OFFLINE]
        </Text>
      </Box>
    );
  }

  if (selected && highlighted) {
    return (
      <Box>
        <Text color={C.neutral}>[{index}] </Text>
        <Text color={C.success}>{checkbox} </Text>
        <Text color={C.successBright} bold>{paddedLabel}</Text>
        <Text> {filesStr} </Text>
        <Text dimColor>{description}</Text>
      </Box>
    );
  }

  if (selected) {
    return (
      <Box>
        <Text color={C.neutral}>[{index}] </Text>
        <Text color={C.success}>{checkbox} </Text>
        <Text color={C.success}>{paddedLabel}</Text>
        <Text> {filesStr} </Text>
        <Text dimColor>{description}</Text>
      </Box>
    );
  }

  if (highlighted) {
    return (
      <Box>
        <Text color={C.neutral}>[{index}] </Text>
        <Text color={C.primary}>{checkbox} </Text>
        <Text color={C.primary} bold>{paddedLabel}</Text>
        <Text> {filesStr} </Text>
        <Text dimColor>{description}</Text>
      </Box>
    );
  }

  // Normal state
  return (
    <Box>
      <Text color={C.neutral}>[{index}] </Text>
      <Text color={C.neutral}>{checkbox} </Text>
      <Text>{paddedLabel}</Text>
      <Text> {filesStr} </Text>
      <Text dimColor>{description}</Text>
    </Box>
  );
}
