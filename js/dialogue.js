// =============================================================================
// Páez Ville — js/dialogue.js
// Undertale-style dialogue system ported from calles-de-alberdi to Phaser 4.
//   A: typewriter text box
//   B: character portraits with boss jitter
//   C: per-character voice beeps (Web Audio oscillator)
// =============================================================================

import Phaser from 'phaser';

const DIALOGUE_BOX_H = 52;
const DIALOGUE_BOX_MARGIN = 4;
const DIALOGUE_PORTRAIT_SIZE = 40;
const DIALOGUE_CHARS_PER_SEC = 35;
const DIALOGUE_FAST_MULTIPLIER = 3;
const DIALOGUE_AUTO_ADVANCE = 6;
const DIALOGUE_AUTO_ADVANCE_1 = 8;
const VIEW_W = 240;
const VIEW_H = 160;

// ── State ────────────────────────────────────────────────────────────────────
let _dlgActive = false;
let _dlgLines = [];
let _dlgLineIdx = 0;
let _dlgCharIdx = 0;
let _dlgDone = false;
let _dlgOnComplete = null;
let _dlgFastHeld = false;
let _dlgAdvancePressed = false;
let _dlgSlideIn = 0;
let _dlgAutoTimer = 0;

// ── Voice State ──────────────────────────────────────────────────────────────
let _voiceCtx = null;
let _voiceLastIdx = -1;

const VOICE_PRESETS = {
  boss_low: { freq: 110, variance: 20, wave: 'sawtooth', dur: 0.06 },
  boss_mid: { freq: 150, variance: 30, wave: 'square', dur: 0.05 },
  npc_high: { freq: 320, variance: 40, wave: 'square', dur: 0.04 },
  npc_mid: { freq: 240, variance: 30, wave: 'triangle', dur: 0.05 },
  default: { freq: 200, variance: 25, wave: 'square', dur: 0.045 },
};

// ── UI Components (Phaser GameObjects managed per-scene) ──────────────────────
let _scene = null;
let _container = null;
let _bgGraphics = null;
let _portraitBg = null;
let _portraitFace = null;
let _portraitText = null;
let _portraitSprite = null;
let _speakerText = null;
let _bodyText = null;
let _autoTimerText = null;

// ── Voice Beep ───────────────────────────────────────────────────────────────
function _playVoiceBeep(preset) {
  try {
    if (!_voiceCtx) {
      _voiceCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_voiceCtx.state === 'suspended') {
      _voiceCtx.resume();
    }

    const v = VOICE_PRESETS[preset] || VOICE_PRESETS.default;
    const osc = _voiceCtx.createOscillator();
    const gain = _voiceCtx.createGain();

    osc.type = v.wave;
    osc.frequency.value = v.freq + (Math.random() - 0.5) * v.variance * 2;
    gain.gain.value = 0.08;
    gain.gain.exponentialRampToValueAtTime(0.001, _voiceCtx.currentTime + v.dur);

    osc.connect(gain);
    gain.connect(_voiceCtx.destination);
    osc.start();
    osc.stop(_voiceCtx.currentTime + v.dur);
  } catch (e) {
    // Audio not available — silent fallback
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize dialogue UI GameObjects for a Phaser Scene.
 * @param {Phaser.Scene} scene
 */
export function initDialogue(scene) {
  _scene = scene;

  // Create UI container anchored to screen space (scrollFactor 0)
  _container = scene.add.container(0, 0);
  _container.setScrollFactor(0);
  _container.setDepth(2000); // above all world objects
  _container.setVisible(false);

  _bgGraphics = scene.add.graphics();
  _portraitBg = scene.add.graphics();
  _portraitFace = scene.add.graphics();

  _portraitText = scene.add.text(0, 0, '', {
    fontFamily: 'monospace',
    fontSize: '20px',
    color: '#ffffff',
  }).setOrigin(0.5);

  _portraitSprite = scene.add.sprite(0, 0, '');
  _portraitSprite.setVisible(false);

  _speakerText = scene.add.text(0, 0, '', {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#ffd73c',
    fontStyle: 'bold',
  });

  _bodyText = scene.add.text(0, 0, '', {
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#e6e1d2',
    wordWrap: { width: VIEW_W - DIALOGUE_PORTRAIT_SIZE - DIALOGUE_BOX_MARGIN * 3 - 8 },
  });

  _autoTimerText = scene.add.text(0, 0, '', {
    fontFamily: 'monospace',
    fontSize: '8px',
    color: '#fff578',
  }).setOrigin(1, 1);

  _container.add([
    _bgGraphics,
    _portraitBg,
    _portraitFace,
    _portraitText,
    _portraitSprite,
    _speakerText,
    _bodyText,
    _autoTimerText,
  ]);

  // Input listeners
  scene.input.keyboard.on('keydown', (evt) => {
    if (!_dlgActive) return;
    if (['Enter', 'Space', 'KeyZ', 'KeyU', 'KeyB'].includes(evt.code)) {
      _dlgAdvancePressed = true;
      _dlgFastHeld = true;
    }
  });

  scene.input.keyboard.on('keyup', (evt) => {
    if (['Enter', 'Space', 'KeyZ', 'KeyU', 'KeyB'].includes(evt.code)) {
      _dlgFastHeld = false;
    }
  });

  scene.input.on('pointerdown', () => {
    if (_dlgActive) {
      _dlgAdvancePressed = true;
    }
  });
}

/**
 * Start a dialogue sequence.
 * @param {Array<{speaker:string, text:string, col?:number[], isBoss?:boolean, portraitCol?:number[], portraitKey?:string, voice?:string}>} lines
 * @param {Function} [onComplete]
 */
export function showDialogue(lines, onComplete) {
  if (!lines || lines.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  _dlgActive = true;
  _dlgLines = lines;
  _dlgLineIdx = 0;
  _dlgCharIdx = 0;
  _dlgDone = false;
  _dlgOnComplete = onComplete || null;
  _dlgSlideIn = 0;
  _voiceLastIdx = -1;
  _dlgAutoTimer = lines.length === 1 ? DIALOGUE_AUTO_ADVANCE_1 : DIALOGUE_AUTO_ADVANCE;

  if (_container) {
    _container.setVisible(true);
  }
}

/** True while dialogue is active — use to pause player movement. */
export function isDialogueActive() {
  return _dlgActive;
}

/** Force close dialogue. */
export function endDialogue() {
  if (!_dlgActive) return;
  _dlgActive = false;
  _dlgLines = [];
  _dlgDone = true;
  if (_container) {
    _container.setVisible(false);
  }
}

/** Advance dialogue if active (useful for programmatic trigger). */
export function advanceDialogue() {
  if (_dlgActive) {
    _dlgAdvancePressed = true;
  }
}

/**
 * Update and render dialogue frame. Call in Scene's update(time, delta).
 * @param {number} deltaMs - frame delta in milliseconds
 */
export function updateDialogue(deltaMs) {
  if (!_dlgActive || !_container) return;

  const dt = deltaMs / 1000;

  // Slide-in animation
  if (_dlgSlideIn < 1) {
    _dlgSlideIn = Math.min(1, _dlgSlideIn + dt * 6);
  }

  const line = _dlgLines[_dlgLineIdx];
  if (!line) return;

  // Reveal typewriter text
  if (!_dlgDone) {
    const speed = _dlgFastHeld
      ? DIALOGUE_CHARS_PER_SEC * DIALOGUE_FAST_MULTIPLIER
      : DIALOGUE_CHARS_PER_SEC;
    _dlgCharIdx += speed * dt;

    if (_dlgCharIdx >= line.text.length) {
      _dlgCharIdx = line.text.length;
      _dlgDone = true;
    }

    // Voice beeps
    const curIdx = Math.floor(_dlgCharIdx);
    if (curIdx > _voiceLastIdx) {
      const ch = line.text[curIdx - 1];
      if (ch && ![' ', '.', ',', '!', '¡', '¿', '?'].includes(ch)) {
        if (curIdx % 2 === 0) {
          const voice = line.voice || (line.isBoss ? 'boss_low' : 'default');
          _playVoiceBeep(voice);
        }
      }
      _voiceLastIdx = curIdx;
    }
  }

  // Auto-advance countdown
  if (_dlgAutoTimer > 0) {
    _dlgAutoTimer -= dt;
  }

  // Check advance
  const shouldAdvance = _dlgAdvancePressed || (_dlgDone && _dlgAutoTimer <= 0);
  if (_dlgAdvancePressed) _dlgAdvancePressed = false;

  if (shouldAdvance) {
    if (!_dlgDone) {
      // Reveal rest of line immediately
      _dlgCharIdx = line.text.length;
      _dlgDone = true;
    } else {
      _dlgLineIdx++;
      _voiceLastIdx = -1;
      if (_dlgLineIdx >= _dlgLines.length) {
        _dlgActive = false;
        _dlgAutoTimer = 0;
        _container.setVisible(false);
        if (_dlgOnComplete) _dlgOnComplete();
      } else {
        _dlgCharIdx = 0;
        _dlgDone = false;
        _dlgAutoTimer = _dlgLines.length === 1 ? DIALOGUE_AUTO_ADVANCE_1 : DIALOGUE_AUTO_ADVANCE;
      }
    }
  }

  // ── Render Frame ─────────────────────────────────────────────────────────
  _renderFrame(line);
}

function _renderFrame(line) {
  const boxH = DIALOGUE_BOX_H;
  const slideOffset = (1 - _dlgSlideIn) * boxH;
  const boxY = VIEW_H - boxH + slideOffset;
  const pad = DIALOGUE_BOX_MARGIN;
  const ps = DIALOGUE_PORTRAIT_SIZE;

  // Colors
  const accentHex = line.colHex || '#ffd73c';
  const pCol = line.portraitCol || [120, 120, 120];

  // 1. Box background & border
  _bgGraphics.clear();

  // Dark background
  _bgGraphics.fillStyle(0x0a0a12, 0.96);
  _bgGraphics.fillRect(0, boxY, VIEW_W, boxH);

  // Accent top border
  const accentNum = Phaser.Display.Color.HexStringToColor(accentHex).color;
  _bgGraphics.fillStyle(accentNum, 0.9);
  _bgGraphics.fillRect(0, boxY, VIEW_W, 2);

  // 2. Portrait (left)
  const portX = pad + 2;
  const portY = boxY + (boxH - ps) / 2;

  // Boss jitter
  const jx = line.isBoss ? (Math.random() - 0.5) * 3 : 0;
  const jy = line.isBoss ? (Math.random() - 0.5) * 3 : 0;

  _portraitBg.clear();
  const pColorNum = Phaser.Display.Color.GetColor(pCol[0], pCol[1], pCol[2]);
  _portraitBg.fillStyle(pColorNum, 0.85);
  _portraitBg.fillRect(portX + jx, portY + jy, ps, ps);
  _portraitBg.lineStyle(1, accentNum, 0.7);
  _portraitBg.strokeRect(portX + jx, portY + jy, ps, ps);

  if (line.portraitKey && _scene.textures.exists(line.portraitKey)) {
    _portraitFace.clear();
    _portraitText.setVisible(false);
    _portraitSprite.setVisible(true);
    _portraitSprite.setTexture(line.portraitKey);
    _portraitSprite.setPosition(portX + ps / 2 + jx, portY + ps / 2 + jy);
    _portraitSprite.setDisplaySize(ps - 4, ps - 4);
  } else {
    _portraitSprite.setVisible(false);

    // Inner face box
    _portraitFace.clear();
    const faceCol = Phaser.Display.Color.GetColor(
      Math.min(255, pCol[0] + 60),
      Math.min(255, pCol[1] + 60),
      Math.min(255, pCol[2] + 60)
    );
    _portraitFace.fillStyle(faceCol, 0.7);
    _portraitFace.fillRect(portX + 6 + jx, portY + 4 + jy, ps - 12, ps - 16);

    // Initial text
    const initial = (line.speaker || '?')[0].toUpperCase();
    _portraitText.setVisible(true);
    _portraitText.setText(initial);
    _portraitText.setPosition(portX + ps / 2 + jx, portY + ps / 2 + jy);
  }

  // 3. Text area (right)
  const textX = portX + ps + pad + 4;

  _speakerText.setText(line.speaker || '');
  _speakerText.setColor(accentHex);
  _speakerText.setPosition(textX, boxY + pad + 2);

  const revealed = line.text.substring(0, Math.floor(_dlgCharIdx));
  _bodyText.setText(revealed);
  _bodyText.setPosition(textX, boxY + pad + 14);

  if (_dlgDone && _dlgAutoTimer > 0) {
    const secs = Math.ceil(_dlgAutoTimer);
    _autoTimerText.setText(`${secs}`);
    _autoTimerText.setPosition(VIEW_W - pad - 4, boxY + boxH - pad);
  } else {
    _autoTimerText.setText('');
  }
}
