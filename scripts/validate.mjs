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
import { spawn, execSync } from 'node:child_process';

const PORT = 4173; // vite preview default
const BASE = process.env.PV_VALIDATE_URL || `http://localhost:${PORT}/`;

/** Start `vite preview` and resolve once it prints the "Local:" line. */
function startPreview() {
  return new Promise((resolve, reject) => {
    // Kill anything holding PORT before starting
    try {
      execSync(`/usr/sbin/lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`);
    } catch { /* ignore */ }

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

    // 5. Phase 2: Dialogue validation
    await page.evaluate(() => window.__PAEZ.triggerDialogue());
    const isDlg1 = await page.evaluate(() => window.__PAEZ.isDialogueActive());
    
    // Advance lines until dialogue completes (typewriter reveal + line next)
    for (let i = 0; i < 10; i++) {
      if (!(await page.evaluate(() => window.__PAEZ.isDialogueActive()))) break;
      await page.evaluate(() => window.__PAEZ.advanceDialogue());
      await page.waitForTimeout(50);
    }
    const isDlg2 = await page.evaluate(() => window.__PAEZ.isDialogueActive());

    // 6. Phase 4: Staff combat (Zelda register)
    const pCurrent = await page.evaluate(() => window.__PAEZ.player());
    const initialDogs = await page.evaluate(() => window.__PAEZ.trashEnemiesCount());
    await page.evaluate(({ x, y }) => window.__PAEZ.spawnTrashEnemy(x + 16, y), pCurrent); // spawn directly in front
    const spawnedDogs = await page.evaluate(() => window.__PAEZ.trashEnemiesCount());
    
    await page.evaluate(() => window.__PAEZ.attack()); // swing staff
    await page.waitForTimeout(250);
    const dogsAfterAttack = await page.evaluate(() => window.__PAEZ.trashEnemiesCount());
    const isDlgInCombat = await page.evaluate(() => window.__PAEZ.isDialogueActive());

    // 7. Phase 5: Turn-based combat (FF/Pokémon register)
    await page.evaluate(() => window.__PAEZ.triggerBossBattle());
    await page.waitForTimeout(200);
    const isBattle1 = await page.evaluate(() => window.__PAEZ.isInBattle());
    const bossHpStart = await page.evaluate(() => window.__PAEZ.getBossHp());

    // Execute attacks until boss is defeated
    for (let i = 0; i < 5; i++) {
      if (!(await page.evaluate(() => window.__PAEZ.isInBattle()))) break;
      await page.evaluate(() => window.__PAEZ.battleCommand('Attack'));
      await page.waitForTimeout(600);
    }

    await page.waitForTimeout(1200); // victory animation transition back
    const isBattle2 = await page.evaluate(() => window.__PAEZ.isInBattle());

    // 8. Phase 6: Multi-map transitions (3 locations: isla, cerveceria, cancha)
    const map1 = await page.evaluate(() => window.__PAEZ.currentMapKey());
    await page.evaluate(() => window.__PAEZ.switchMap('cerveceria'));
    await page.waitForTimeout(300);
    const map2 = await page.evaluate(() => window.__PAEZ.currentMapKey());

    await page.evaluate(() => window.__PAEZ.switchMap('cancha'));
    await page.waitForTimeout(300);
    const map3 = await page.evaluate(() => window.__PAEZ.currentMapKey());

    await page.evaluate(() => window.__PAEZ.switchMap('isla'));
    await page.waitForTimeout(300);
    const map4 = await page.evaluate(() => window.__PAEZ.currentMapKey());

    // 9. Phase 8: Save system validation (localStorage)
    await page.evaluate(() => window.__PAEZ.saveGame({ mapKey: 'cerveceria', playerX: 140, playerY: 90, bossDefeated: true }));
    const saveExists = await page.evaluate(() => window.__PAEZ.hasSave());
    const loaded = await page.evaluate(() => window.__PAEZ.loadGame());
    await page.evaluate(() => window.__PAEZ.clearSave());
    const saveCleared = !await page.evaluate(() => window.__PAEZ.hasSave());

    // Report
    console.log('\n── Validation Report ──');
    console.log(`  canvas:            ✓ present`);
    console.log(`  console errors:     ${errors.length}`);
    console.log(`  page errors:       ${pageErrors.length}`);
    console.log(`  __PAEZ hook:       ✓ present`);
    console.log(`  player before:     (${before.x.toFixed(1)}, ${before.y.toFixed(1)})`);
    console.log(`  player after:      (${after.x.toFixed(1)}, ${after.y.toFixed(1)})`);
    console.log(`  movement (Δx):     ${dx.toFixed(1)} px`);
    console.log(`  dialogue triggered: ${isDlg1 ? '✓ true' : '✗ false'}`);
    console.log(`  dialogue closed:    ${!isDlg2 ? '✓ true' : '✗ false'}`);
    console.log(`  staff combat:      initial=${initialDogs} spawned=${spawnedDogs} afterHit=${dogsAfterAttack} (despawned 1)`);
    console.log(`  turn battle start: ${isBattle1 ? '✓ true' : '✗ false'} (boss HP=${bossHpStart})`);
    console.log(`  turn battle won:   ${!isBattle2 ? '✓ returned to world' : '✗ false'}`);
    console.log(`  3-location maps:   ${map1} → ${map2} → ${map3} → ${map4} (✓ all 3 locations working)`);
    console.log(`  save system:       saveExists=${saveExists} loadedMap=${loaded?.mapKey} bossDefeated=${loaded?.bossDefeated} cleared=${saveCleared} (✓ Phase 8 working)\n`);

    const failures = [];
    if (errors.length) failures.push(`${errors.length} console error(s):\n    ` + errors.slice(0, 5).join('\n    '));
    if (pageErrors.length) failures.push(`${pageErrors.length} page error(s):\n    ` + pageErrors.slice(0, 5).join('\n    '));
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      failures.push(`player did not move on keypress (Δx=${dx.toFixed(1)}, Δy=${dy.toFixed(1)})`);
    }
    if (!isDlg1) failures.push('dialogue system failed to activate on trigger');
    if (isDlg2) failures.push('dialogue system failed to close after completing lines');
    if (dogsAfterAttack >= spawnedDogs) failures.push(`staff attack failed to despawn enemy (before=${spawnedDogs}, after=${dogsAfterAttack})`);
    if (isDlgInCombat) failures.push('staff attack unexpectedly opened battle UI');
    if (!isBattle1) failures.push('turn-based battle failed to start');
    if (isBattle2) failures.push('turn-based battle failed to complete and return to world');
    if (map1 !== 'isla' || map2 !== 'cerveceria' || map3 !== 'cancha' || map4 !== 'isla') {
      failures.push(`multi-map transition failed: got sequence [${map1}, ${map2}, ${map3}, ${map4}]`);
    }
    if (!saveExists || loaded?.mapKey !== 'cerveceria' || !loaded?.bossDefeated || !saveCleared) {
      failures.push(`save system test failed (saveExists=${saveExists}, map=${loaded?.mapKey}, bossDefeated=${loaded?.bossDefeated}, cleared=${saveCleared})`);
    }

    if (failures.length) {
      console.error('✗ Validation FAILED:');
      for (const f of failures) console.error('  - ' + f);
      try {
        await page.screenshot({ path: 'artifacts/validate-fail.png', fullPage: true });
        console.error('  (screenshot: artifacts/validate-fail.png)');
      } catch { /* non-fatal */ }
      exit(1);
    }

    console.log('✓ Phase 1 & 2 validation PASSED');
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

