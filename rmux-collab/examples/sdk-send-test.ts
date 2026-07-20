import { Rmux } from '@rmux/sdk';

async function main() {
  const r = new Rmux();
  const s = r.session('collab-claude');
  const p = s.pane(0, 0);

  console.log('SDK sendText...');
  await p.sendText('what is 2+2');
  console.log('sendText OK');

  await new Promise(r => setTimeout(r, 200));

  console.log('SDK sendKeys Enter...');
  await p.sendKeys('Enter');
  console.log('Enter OK');

  await new Promise(r => setTimeout(r, 15000));
  const snap = await p.snapshot();
  const lines = snap.lines.filter(l => l.trim());
  console.log('Last 5 lines:', lines.slice(-5));
}

main().catch(e => console.error(e.message));
