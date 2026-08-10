// =============================================================================
// Páez Ville — js/save.js
// localStorage save system (Phase 8).
// Persists map location, player position, boss defeat status, and quest flags.
// =============================================================================

const SAVE_KEY = 'paez_ville_save_v1';

/**
 * Save current game state to localStorage.
 * @param {Object} state
 * @param {string} state.mapKey - e.g. 'isla', 'cerveceria', 'cancha'
 * @param {number} state.playerX
 * @param {number} state.playerY
 * @param {boolean} [state.bossDefeated]
 * @param {Object} [state.flags]
 */
export function saveGame(state) {
  try {
    const payload = {
      mapKey: state.mapKey || 'isla',
      playerX: state.playerX !== undefined ? state.playerX : 160,
      playerY: state.playerY !== undefined ? state.playerY : 120,
      bossDefeated: !!state.bossDefeated,
      flags: state.flags || {},
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    console.log('[saveGame] state saved:', payload);
    return true;
  } catch (e) {
    console.warn('[saveGame] failed to save to localStorage:', e);
    return false;
  }
}

/**
 * Load saved state from localStorage.
 * @returns {Object|null}
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[loadGame] failed to read save from localStorage:', e);
    return null;
  }
}

/** Check if a valid save exists. */
export function hasSave() {
  return loadGame() !== null;
}

/** Clear saved state. */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
