import { execSync } from 'node:child_process';

const CLI = 'npx tsx src/cli.ts';
const CWD = 'D:\\maestro2\\rmux-collab';

function cli(cmd: string, timeout = 180_000): string {
  const full = `${CLI} ${cmd}`;
  console.log(`  > ${full.slice(0, 120)}`);
  try {
    return execSync(full, { encoding: 'utf-8', cwd: CWD, timeout }).trim();
  } catch (e: any) {
    return e.stdout?.trim() ?? e.message;
  }
}

function ask(agent: string, msg: string): string {
  return cli(`ask ${agent} ${msg}`);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function main() {
  console.log('=== Multi-Round Orchestration Test ===\n');

  // Setup
  cli('destroy --all', 10_000);
  console.log('[1] Launching agents...');
  cli('launch examples/cli-agents.config.ts', 300_000);
  console.log();

  // ========================================
  // Round 1: Discovery — each agent scans a different area
  // ========================================
  console.log('[Round 1] Discovery: each agent scans a module');
  const t0 = Date.now();

  // Send both tasks in parallel (non-blocking)
  cli('send alice Read src/registry.ts. List every public method name and its return type. Output as a flat list, one per line: methodName -> returnType', 10_000);
  cli('send bob Read src/session-reader.ts. List every exported function name and its return type. Output as a flat list, one per line: functionName -> returnType', 10_000);

  // Wait and poll
  console.log('  Waiting for agents to finish...');
  await sleep(25_000);

  const aliceR1 = cli('poll alice');
  const bobR1 = cli('poll bob');
  console.log(`  alice (${Date.now() - t0}ms):`);
  console.log(`    ${aliceR1.split('\n').slice(0, 8).join('\n    ')}`);
  console.log(`  bob (${Date.now() - t0}ms):`);
  console.log(`    ${bobR1.split('\n').slice(0, 8).join('\n    ')}`);
  console.log();

  // ========================================
  // Round 2: Main flow analyzes and delegates
  // ========================================
  console.log('[Round 2] Orchestrator analyzes Round 1 results...');

  // Parse method counts
  const aliceMethods = aliceR1.split('\n').filter(l => l.includes('->')).length;
  const bobFunctions = bobR1.split('\n').filter(l => l.includes('->')).length;
  console.log(`  alice found ${aliceMethods} methods in registry.ts`);
  console.log(`  bob found ${bobFunctions} functions in session-reader.ts`);

  // Decision: which module has more API surface? Ask that agent to go deeper
  const moreComplex = aliceMethods >= bobFunctions ? 'alice' : 'bob';
  const lessComplex = moreComplex === 'alice' ? 'bob' : 'alice';
  const complexModule = moreComplex === 'alice' ? 'registry.ts' : 'session-reader.ts';
  const simpleModule = moreComplex === 'alice' ? 'session-reader.ts' : 'registry.ts';

  console.log(`  Decision: ${complexModule} is more complex (${Math.max(aliceMethods, bobFunctions)} APIs)`);
  console.log(`  -> ${moreComplex}: deep-dive ${complexModule}`);
  console.log(`  -> ${lessComplex}: write usage example for ${simpleModule}`);
  console.log();

  // ========================================
  // Round 3: Targeted follow-up based on Round 2 decision
  // ========================================
  console.log('[Round 3] Executing follow-up tasks...');
  const t1 = Date.now();

  const deepResult = ask(moreComplex,
    `You previously analyzed src/${complexModule}. Now pick the 2 most important methods and explain what edge cases could break them. Be concise, 2-3 sentences per method.`
  );
  console.log(`  ${moreComplex} deep-dive (${Date.now() - t1}ms):`);
  console.log(`    ${deepResult.split('\n').slice(0, 10).join('\n    ')}`);
  console.log();

  const t2 = Date.now();
  const exampleResult = ask(lessComplex,
    `You previously analyzed src/${simpleModule}. Now write a minimal TypeScript code snippet (under 10 lines) showing how to use its 2 most important exported functions together. Output only the code, no explanation.`
  );
  console.log(`  ${lessComplex} example (${Date.now() - t2}ms):`);
  console.log(`    ${exampleResult.split('\n').slice(0, 12).join('\n    ')}`);
  console.log();

  // ========================================
  // Round 4: Cross-verify — each reviews the other's work
  // ========================================
  console.log('[Round 4] Cross-verification...');
  const t3 = Date.now();

  // Flatten for CLI — send both as non-blocking, then poll
  const deepSummary = deepResult.split('\n').filter(l => l.trim()).slice(0, 5).join(' ');
  const exampleSummary = exampleResult.split('\n').filter(l => l.trim()).slice(0, 5).join(' ');

  cli(`send ${lessComplex} Your teammate said about ${complexModule}: ${deepSummary.slice(0, 300)} --- Do you agree? Reply YES/NO with one sentence why.`, 10_000);
  cli(`send ${moreComplex} Your teammate wrote this code for ${simpleModule}: ${exampleSummary.slice(0, 300)} --- Is this code correct? Reply CORRECT/INCORRECT with one sentence why.`, 10_000);

  console.log('  Waiting for cross-verification...');
  await sleep(25_000);

  const verifyA = cli(`poll ${lessComplex}`);
  const verifyB = cli(`poll ${moreComplex}`);

  console.log(`  ${lessComplex} on deep-dive: ${verifyA.split('\n')[0]}`);
  console.log(`  ${moreComplex} on example:   ${verifyB.split('\n')[0]}`);
  console.log(`  Cross-verify done (${Date.now() - t3}ms)`);
  console.log();

  // ========================================
  // Summary
  // ========================================
  const totalMs = Date.now() - t0;
  console.log('=== ORCHESTRATION SUMMARY ===');
  console.log(`Rounds:      4 (discovery -> analyze -> follow-up -> cross-verify)`);
  console.log(`Agents:      alice, bob (persistent sessions, 4 turns each)`);
  console.log(`Total time:  ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Decisions:   1 dynamic routing based on API surface analysis`);
  console.log();

  // Cleanup
  console.log('[5] Cleanup...');
  cli('destroy --all', 10_000);
  console.log('Done.');
}

main().catch(e => {
  console.error('ERROR:', e.message);
  try { execSync('rmux kill-session -t lab', { encoding: 'utf-8' }); } catch {}
});
