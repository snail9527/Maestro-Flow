const ANSI_REGEX = /\x1b\[[0-9;]*[A-Za-z]|\x1b\[\?[0-9]*[hl]|\x1b\][^\x07]*\x07|\x1b[()][A-Z0-9]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

export function cleanOutput(raw: string, sentPrompt: string): string {
  const stripped = stripAnsi(raw);
  const lines = stripped.split('\n');
  const promptTrimmed = sentPrompt.trim();

  const sendIdx = lines.findIndex(l => l.includes(promptTrimmed));
  if (sendIdx === -1) return stripped.trim();

  const afterSend = lines.slice(sendIdx + 1);

  const resultLines = afterSend.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed === promptTrimmed) return false;
    return true;
  });

  return resultLines.join('\n').trim();
}
