import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { type WizardStep, WIZARD_STEPS } from './types.js';
import { StepProgress } from '../shared/index.js';

// ---------------------------------------------------------------------------
// GradientHeader — neon gradient header with step progress
// ---------------------------------------------------------------------------

interface GradientHeaderProps {
  currentStep: WizardStep;
  version: string;
}

const STEP_LABELS: Record<WizardStep, string> = {
  mode: 'Mode',
  components: 'Components',
  config: 'Config',
  review: 'Review',
  executing: 'Installing',
  complete: 'Done',
};

export function GradientHeader({ currentStep, version }: GradientHeaderProps) {
  const stepIndex = WIZARD_STEPS.indexOf(currentStep);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column">
        <Gradient name="fruit">
          <BigText text="MAESTRO" font="slick" />
        </Gradient>
        <Box marginTop={-2}>
          <Text dimColor>
            <BigText text="flow" font="slick" />
          </Text>
        </Box>
        <Box marginLeft={2}>
          <Text dimColor>install wizard  v{version}</Text>
        </Box>
      </Box>

      <StepProgress
        steps={WIZARD_STEPS.map(s => ({ key: s, label: STEP_LABELS[s] }))}
        currentKey={currentStep}
      />
    </Box>
  );
}
