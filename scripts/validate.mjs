// Paez Ville — Phase 1 validation gate (Playwright, headless).
//
// Boots the production build via `vite preview`, loads the page, and asserts the
// Phase 1 green-gate criteria from docs/PLAN.md:
//   1. a <canvas> exists (Phaser booted),
//   2. zero console errors,
//   3. the WorldScene spawned the player (window.__PAEZ hook present),
//   4. pressing an arrow key actually moves the player.
//
// Run: npm run validate   (after `npm run build`)
// Env: PV_VALIDATE_URL to point at a running server instead of preview.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4173; // vite preview default
const BASE = process.env.PV_VALIDATE_URL || `http://localhost:${PORT}/`;

/** Start `vite preview` and resolve once it prints the "Local:" line. */
function startPreview() {
  return new Promise((resolve, reject) => {
    // detached:true + kill(-pid) later so we reap the whole process group,
    // not just the npx wrapper (the real vite node child otherwise lingers
    // and holds the port for the next run).
    const child = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) reject(new Error('vite preview did not start within 20s'));
    }, 20000);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[preview] ${text}`);
      if (!resolved && /Local:\s+http/.test(text)) {
        resolved = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(`[preview!] ${chunk}`));
    child.on('error', (err) => {
      if (!resolved) { clearTimeout(timer); reject(err); }
    });
  });
}

/** Kill the preview server's whole process group (npx leaves a detached child). */
function stopPreview(child) {
  if (!child) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* group may be gone */ }
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
}

const exit = (code) => process.exit(code);

(async () => {
  const ownedServer = !process.env.PV_VALIDATE_URL;
  let server = null;
  if (ownedServer) {
    try {
      server = await startPreview();
    } catch (err) {
      console.error('✗ could not start vite preview:', err.message);
      exit(1);
    }
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  const errors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });

    // 1. canvas present (Phaser booted a renderer)
    await page.waitForSelector('canvas', { timeout: 8000 });

    // 3. WorldScene created the debug hook (player exists)
    await page.waitForFunction(() => window.__PAEZ && typeof window.__PAEZ.player === 'function', { timeout: 8000 });

    const before = await page.evaluate(() => window.__PAEZ.player());

    // 4. press Right arrow a few times, then assert the player moved
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowRight');

    const after = await page.evaluate(() => window.__PAEZ.player());

    const dx = after.x - before.x;
    const dy = after.y - before.y;

    // Report
    console.log('\n── Phase 1 validation ──');
    console.log(`  canvas:        ✓ present`);
    console.log(`  console errors: ${errors.length}`);
    console.log(`  page errors:   ${pageErrors.length}`);
    console.log(`  __PAEZ hook:   ✓ present`);
    console.log(`  player before: (${before.x.toFixed(1)}, ${before.y.toFixed(1)})`);
    console.log(`  player after:  (${after.x.toFixed(1)}, ${after.y.toFixed(1)})`);
    console.log(`  movement (Δx): ${dx.toFixed(1)} px\n`);

    const failures = [];
    if (errors.length) failures.push(`${errors.length} console error(s):\n    ` + errors.slice(0, 5).join('\n    '));
    if (pageErrors.length) failures.push(`${pageErrors.length} page error(s):\n    ` + pageErrors.slice(0, 5).join('\n    '));
    // Moving right for 250ms at 80px/s should net a clearly positive Δx. Use a
    // loose floor so we catch "didn't move at all" without being brittle.
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      failures.push(`player did not move on keypress (Δx=${dx.toFixed(1)}, Δy=${dy.toFixed(1)})`);
    }

    if (failures.length) {
      console.error('✗ Phase 1 validation FAILED:');
      for (const f of failures) console.error('  - ' + f);
      // screenshot for the record
      try {
        await page.screenshot({ path: 'artifacts/validate-fail.png', fullPage: true });
        console.error('  (screenshot: artifacts/validate-fail.png)');
      } catch { /* non-fatal */ }
      exit(1);
    }

    console.log('✓ Phase 1 validation PASSED');
    // Always capture a passing screenshot for the visual trail (per-iter diff).
    try {
      await page.screenshot({ path: 'artifacts/validate-pass.png', fullPage: true });
      console.log('  (screenshot: artifacts/validate-pass.png)');
    } catch { /* non-fatal */ }
    exit(0);
  } catch (err) {
    console.error('✗ validation threw:', err.message);
    try {
      await page.screenshot({ path: 'artifacts/validate-fail.png', fullPage: true });
    } catch { /* non-fatal */ }
    exit(1);
  } finally {
    await browser.close();
    if (server) stopPreview(server);
  }
})();
