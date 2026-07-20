import type { PipelineStage, AgentResult, AskOptions } from '../types.js';

export interface PipelineOptions extends AskOptions {
  onStageComplete?: (stage: number, agentName: string, result: AgentResult) => void;
  haltOnDegraded?: boolean;
}

export async function pipeline(
  stages: PipelineStage[],
  initialPrompt: string,
  opts?: PipelineOptions,
): Promise<string> {
  let currentInput = initialPrompt;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const prompt = stage.transform
      ? stage.transform(currentInput)
      : currentInput;

    const result = await stage.agent.ask(prompt, opts);

    if (result.status === 'error') {
      throw new Error(`Pipeline stage ${i} (${stage.agent.name}) failed: ${result.error ?? 'unknown error'}`);
    }
    if (result.status === 'degraded' && opts?.haltOnDegraded) {
      throw new Error(`Pipeline stage ${i} (${stage.agent.name}) degraded: timeout with unreliable output`);
    }

    opts?.onStageComplete?.(i, stage.agent.name, result);
    currentInput = result.output;
  }

  return currentInput;
}
