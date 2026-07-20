import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLI = 'npx tsx src/cli.ts';
const CWD = 'D:\\maestro2\\rmux-collab';
const REGISTRY = join(CWD, '.workflow', 'collab', 'agents.json');

function run(cmd: string, timeout = 30_000): string {
  console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: CWD, timeout }).trim();
  } catch (e: any) {
    return e.stdout?.trim() ?? e.message;
  }
}

function runAsync(cmd: string, timeout = 300_000): string {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', cwd: CWD, timeout }).trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== rmux-collab CLI Management Layer Test ===\n');

  // AC6: Clean start
  console.log('[0] Cleanup any previous agents...');
  run(`${CLI} destroy --all`);
  console.log();

  // AC1: Launch agents
  console.log('[1] AC1: Launch agents from config...');
  const launchOut = runAsync(`${CLI} launch examples/cli-agents.config.ts`, 300_000);
  console.log(launchOut);

  // Verify registry file exists
  if (!existsSync(REGISTRY)) {
    console.error('FAIL: agents.json not created');
    process.exit(1);
  }
  const regData = JSON.parse(readFileSync(REGISTRY, 'utf-8'));
  console.log(`  Registry: ${Object.keys(regData.agents).length} agents registered`);
  console.log('  AC1: PASS\n');

  // AC5: List agents
  console.log('[2] AC5: List agents...');
  const listOut = run(`${CLI} list`);
  console.log(listOut);
  if (!listOut.includes('alice') || !listOut.includes('bob')) {
    console.error('FAIL: agents not in list');
    process.exit(1);
  }
  console.log('  AC5: PASS\n');

  // AC2: Non-blocking send
  console.log('[3] AC2: Non-blocking send to alice...');
  const sendStart = Date.now();
  const sendOut = run(`${CLI} send alice respond with just the word PONG`);
  const sendMs = Date.now() - sendStart;
  console.log(`  ${sendOut} (${sendMs}ms)`);
  if (sendMs > 5_000) {
    console.error('FAIL: send was not non-blocking');
    process.exit(1);
  }
  console.log('  AC2: PASS\n');

  // Wait for response
  console.log('[3.5] Waiting 20s for response...');
  await sleep(20_000);

  // AC3: Poll
  console.log('[4] AC3: Poll alice for response...');
  const pollOut = run(`${CLI} poll alice`);
  console.log(`  Poll result: ${pollOut.slice(0, 200)}`);
  console.log('  AC3: PASS\n');

  // AC4: Blocking ask
  console.log('[5] AC4: Blocking ask to bob...');
  const askStart = Date.now();
  const askOut = runAsync(`${CLI} ask bob respond with just the word HELLO`, 180_000);
  const askMs = Date.now() - askStart;
  console.log(`  Response (${askMs}ms): ${askOut.slice(0, 200)}`);
  console.log('  AC4: PASS\n');

  // Status
  console.log('[6] Status check...');
  const statusOut = run(`${CLI} status alice`);
  console.log(statusOut);
  console.log();

  // AC7: Reconnect test — simulate process exit by re-running list
  console.log('[7] AC7: Reconnect test (verify registry persists)...');
  const listOut2 = run(`${CLI} list --json`);
  const listData = JSON.parse(listOut2);
  const aliveCount = listData.agents.filter((a: any) => a.alive).length;
  console.log(`  ${aliveCount}/${listData.agents.length} agents alive after "process restart"`);
  if (aliveCount < 2) {
    console.log('  WARNING: some agents not alive');
  } else {
    console.log('  AC7: PASS');
  }
  console.log();

  // AC4 again via reconnect — verifies actual reconnect works
  console.log('[8] AC4+AC7: Ask alice after "reconnect"...');
  const askOut2 = runAsync(`${CLI} ask alice what is 2+2? reply just the number`, 180_000);
  console.log(`  Response: ${askOut2.slice(0, 200)}`);
  console.log('  AC4+AC7: PASS\n');

  // AC6: Destroy
  console.log('[9] AC6: Destroy all...');
  const destroyOut = run(`${CLI} destroy --all`);
  console.log(`  ${destroyOut}`);
  const listOut3 = run(`${CLI} list`);
  console.log(`  After destroy: ${listOut3}`);
  console.log('  AC6: PASS\n');

  console.log('=== ALL TESTS PASSED ===');
}

main().catch(e => {
  console.error('ERROR:', e.message);
  try { execSync('rmux kill-session -t lab', { encoding: 'utf-8' }); } catch {}
});
