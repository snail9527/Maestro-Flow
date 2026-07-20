import type { DialogueConfig, DialogueMessage, AskOptions } from '../types.js';

export async function dialogue(
  config: DialogueConfig,
  opts?: AskOptions,
): Promise<DialogueMessage[]> {
  const messages: DialogueMessage[] = [];
  const failedAgents = new Set<string>();

  for (const agent of config.agents) {
    try {
      const result = await agent.ask(
        `Topic for discussion: ${config.topic}\nPlease share your perspective.`,
        opts,
      );
      if (result.status === 'error') {
        failedAgents.add(agent.name);
        continue;
      }
      messages.push({ from: agent.name, content: result.output, round: 0 });
    } catch {
      failedAgents.add(agent.name);
    }
  }

  for (let round = 1; round <= config.maxRounds; round++) {
    for (const agent of config.agents) {
      if (failedAgents.has(agent.name)) continue;

      const context = messages
        .filter(m => m.from !== agent.name && m.round === round - 1)
        .map(m => `[${m.from}]: ${m.content}`)
        .join('\n\n');

      const prompt = context
        ? `Other perspectives:\n${context}\n\nYour response:`
        : `Continue the discussion on: ${config.topic}`;

      try {
        const result = await agent.ask(prompt, opts);
        if (result.status === 'error') {
          failedAgents.add(agent.name);
          continue;
        }
        messages.push({ from: agent.name, content: result.output, round });
      } catch {
        failedAgents.add(agent.name);
      }
    }

    const activeAgents = config.agents.filter(a => !failedAgents.has(a.name));
    if (activeAgents.length < 2) break;

    if (config.shouldContinue && !config.shouldContinue(round, messages)) {
      break;
    }
  }

  return messages;
}
