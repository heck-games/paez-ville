// =============================================================================
// Páez Ville — js/save.js
// localStorage save system (Phase 8).
// Persists map location, player position, boss defeat status, and quest flags.
// =============================================================================

// Single canonical key. Early Phase 8 briefly used paez_ville_save_v0.1.
const SAVE_KEY = 'paez_ville_save_v1';

/**
 * Save current game state to localStorage.
 * @param {Object} state
 * @param {string} state.mapKey - e.g. 'isla', 'cerveceria', 'cancha'
 * @param {number} state.playerX
 * @param {number} state.playerY
 * @param {boolean} [state.bossDefeated]
 * @param {boolean} [state.questStarted]
 * @param {boolean} [state.endingSeen]
 * @param {Object} [state.flags]
 */
export function saveGame(state) {
  try {
    const payload = {
      mapKey: state.mapKey || 'isla',
      playerX: state.playerX !== undefined ? state.playerX : 160,
      playerY: state.playerY !== undefined ? state.playerY : 120,
      bossDefeated: !!state.bossDefeated,
      questStarted: !!state.questStarted,
      endingSeen: !!state.endingSeen,
      flags: state.flags || {},
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('[saveGame] failed:', e);
    return false;
  }
}

/** @returns {Object|null} */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[loadGame] failed:', e);
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    // Also clear the accidental v0.1 fork from early Phase 8 work.
    localStorage.removeItem('paez_ville_save_v0.1');
    return true;
  } catch {
    return false;
  }
}
