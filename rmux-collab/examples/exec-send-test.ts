import { execSync } from 'node:child_process';

function rmux(args: string): string {
  const r = execSync(`rmux ${args}`, { encoding: 'utf-8', timeout: 10_000 });
  return r.trim();
}

console.log('Before:', rmux('capture-pane -p -t collab-claude:0.0 -S -3').slice(-80));

console.log('\nSending "what is 2+2"...');
rmux('send-keys -t collab-claude:0.0 -l "what is 2+2"');
console.log('sleep 200ms...');
execSync('timeout /t 1 /nobreak >nul', { shell: 'cmd.exe' });
console.log('Sending C-m...');
rmux('send-keys -t collab-claude:0.0 C-m');
console.log('Sent!');

console.log('\nWaiting 15s...');
execSync('timeout /t 15 /nobreak >nul', { shell: 'cmd.exe' });

console.log('After:', rmux('capture-pane -p -t collab-claude:0.0 -S -5'));
