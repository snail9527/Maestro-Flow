import { execSync } from 'node:child_process';
import { validateSessionName } from './rmux.js';

export function openTerminalWindow(sessionName: string, title: string): void {
  validateSessionName(sessionName);
  const platform = process.platform;

  if (platform === 'win32') {
    openWindowsTerminal(sessionName, title);
  } else if (platform === 'darwin') {
    openMacTerminal(sessionName, title);
  } else {
    openLinuxTerminal(sessionName, title);
  }
}

function safeTitle(title: string): string {
  return title.replace(/["`$\\]/g, '');
}

function openWindowsTerminal(sessionName: string, title: string): void {
  const safe = safeTitle(title);
  try {
    execSync(
      `wt -w 0 new-tab --title "${safe}" rmux attach -t "${sessionName}"`,
      { stdio: 'ignore', timeout: 5000 },
    );
  } catch {
    try {
      execSync(
        `start "rmux: ${safe}" cmd /k rmux attach -t "${sessionName}"`,
        { stdio: 'ignore', shell: 'cmd.exe', timeout: 5000 },
      );
    } catch {
      console.error(`[rmux-collab] Failed to open terminal for session "${sessionName}"`);
    }
  }
}

function openMacTerminal(sessionName: string, title: string): void {
  const safe = safeTitle(title);
  const script = `
    tell application "Terminal"
      do script "rmux attach -t '${sessionName}'"
      set custom title of front window to "${safe}"
      activate
    end tell
  `;
  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { stdio: 'ignore', timeout: 5000 });
  } catch {
    console.error(`[rmux-collab] Failed to open macOS terminal for session "${sessionName}"`);
  }
}

function openLinuxTerminal(sessionName: string, title: string): void {
  const safe = safeTitle(title);
  const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'];
  for (const term of terminals) {
    try {
      if (term === 'gnome-terminal') {
        execSync(`${term} --title="${safe}" -- rmux attach -t "${sessionName}"`, { stdio: 'ignore', timeout: 5000 });
      } else if (term === 'konsole') {
        execSync(`${term} --new-tab -e rmux attach -t "${sessionName}"`, { stdio: 'ignore', timeout: 5000 });
      } else {
        execSync(`${term} -T "${safe}" -e "rmux attach -t '${sessionName}'" &`, { stdio: 'ignore', timeout: 5000 });
      }
      return;
    } catch { continue; }
  }
  console.error(`[rmux-collab] No suitable terminal found for session "${sessionName}"`);
}
