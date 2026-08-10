// Paez Ville — src/components/Dialogue.js
//
// A GBA-style dialogue system for Phaser 4.
// Features:
//   - Typewriter text reveal with speed-up on key-hold.
//   - Web Audio synthesizer voice beeps (no static sound assets needed).
//   - Character portrait container with fallback letter rendering.
//   - Multiple choice branching menus with keyboard and mouse/touch selection.
//   - Auto-advance support.
import Phaser from 'phaser';

const VOICE_PRESETS = {
  boss_low:  { freq: 110, variance: 15, wave: 'sawtooth', dur: 0.05 },
  boss_mid:  { freq: 150, variance: 20, wave: 'square',   dur: 0.05 },
  npc_high:  { freq: 300, variance: 30, wave: 'square',   dur: 0.04 },
  npc_mid:   { freq: 220, variance: 25, wave: 'triangle', dur: 0.04 },
  default:   { freq: 180, variance: 20, wave: 'square',   dur: 0.04 },
};

export default class Dialogue {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    // State
    this.active = false;
    this.lines = [];
    this.lineIdx = 0;
    this.charIdx = 0;
    this.done = false;
    this.onComplete = null;
    this.autoTimer = 0;
    this.fastHeld = false;

    // Choices state
    this.choices = [];
    this.selectedChoiceIdx = 0;
    this.choiceTextObjects = [];

    // Settings (optimized for 240x160 GBA resolution)
    this.boxHeight = 52;
    this.boxY = 160 - this.boxHeight;
    this.padding = 6;
    this.portraitSize = 40;
    this.charsPerSec = 30;
    this.fastMultiplier = 3.5;

    // Web Audio state
    this.audioCtx = null;
    this.lastBeepCharIdx = -1;

    // Build UI Elements
    this.createUI();

    // Bind Keyboard Inputs
    this.setupInput();
  }

  createUI() {
    this.container = this.scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(2000); // Overlay on top of everything
    this.container.setVisible(false);

    // 1. Dark background box
    this.bg = this.scene.add.graphics();
    this.bg.fillStyle(0x0a0a12, 0.95);
    this.bg.fillRect(0, this.boxY, 240, this.boxHeight);

    // Accent line (top border)
    this.bg.lineStyle(1.5, 0xffd73c, 0.9);
    this.bg.lineBetween(0, this.boxY, 240, this.boxY);
    this.container.add(this.bg);

    // 2. Portrait Container (left)
    this.portraitX = this.padding;
    this.portraitY = this.boxY + (this.boxHeight - this.portraitSize) / 2;

    this.portraitBg = this.scene.add.graphics();
    this.portraitBg.fillStyle(0x3a3a4a, 0.85);
    this.portraitBg.fillRect(this.portraitX, this.portraitY, this.portraitSize, this.portraitSize);
    this.portraitBg.lineStyle(1.5, 0xffd73c, 0.8);
    this.portraitBg.strokeRect(this.portraitX, this.portraitY, this.portraitSize, this.portraitSize);
    this.container.add(this.portraitBg);

    // Portrait image frame
    this.portraitImg = this.scene.add.image(
      this.portraitX + this.portraitSize / 2,
      this.portraitY + this.portraitSize / 2,
      ''
    );
    this.portraitImg.setDisplaySize(this.portraitSize - 2, this.portraitSize - 2);
    this.portraitImg.setVisible(false);
    this.container.add(this.portraitImg);

    // Portrait fallback initial letter (if no sprite is loaded)
    this.portraitLetter = this.scene.add.text(
      this.portraitX + this.portraitSize / 2,
      this.portraitY + this.portraitSize / 2 - 2,
      '?',
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '18px',
        color: '#ffffff',
      }
    );
    this.portraitLetter.setOrigin(0.5);
    this.container.add(this.portraitLetter);

    // 3. Name Label (right of portrait)
    this.nameX = this.portraitX + this.portraitSize + this.padding;
    this.nameText = this.scene.add.text(
      this.nameX,
      this.boxY + this.padding,
      'NAME',
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '6px',
        color: '#ffd73c',
        fontWeight: 'bold',
      }
    );
    this.container.add(this.nameText);

    // 4. Typewriter Text (right of portrait, below name)
    this.textWidth = 240 - this.nameX - this.padding;
    this.bodyText = this.scene.add.text(
      this.nameX,
      this.boxY + this.padding + 10,
      '',
      {
        fontFamily: 'Outfit',
        fontSize: '9px',
        color: '#e6e1d2',
        wordWrap: { width: this.textWidth, useAdvancedWrap: true },
        lineSpacing: 1.2,
      }
    );
    this.container.add(this.bodyText);
  }

  setupInput() {
    // Advance triggers
    this.scene.input.keyboard.on('keydown-ENTER', () => this.onAdvancePress());
    this.scene.input.keyboard.on('keydown-SPACE', () => this.onAdvancePress());
    this.scene.input.keyboard.on('keydown-Z', () => this.onAdvancePress());

    // Speed up triggers (holding key makes typewriter zoom)
    const updateFastHeld = () => {
      const keys = this.scene.input.keyboard;
      this.fastHeld = keys.keys[Phaser.Input.Keyboard.KeyCodes.ENTER]?.isDown ||
                      keys.keys[Phaser.Input.Keyboard.KeyCodes.SPACE]?.isDown ||
                      keys.keys[Phaser.Input.Keyboard.KeyCodes.Z]?.isDown;
    };
    this.scene.input.keyboard.on('keydown', updateFastHeld);
    this.scene.input.keyboard.on('keyup', updateFastHeld);

    // Direct pointer down on the screen to advance or select choice
    this.scene.input.on('pointerdown', (pointer) => {
      // If tapping the dialogue box area and choices are not active
      if (this.active && this.choices.length === 0) {
        this.onAdvancePress();
      }
    });

    // Menu Navigation Keys (for choices)
    this.scene.input.keyboard.on('keydown-UP', () => this.navigateChoices(-1));
    this.scene.input.keyboard.on('keydown-W', () => this.navigateChoices(-1));
    this.scene.input.keyboard.on('keydown-DOWN', () => this.navigateChoices(1));
    this.scene.input.keyboard.on('keydown-S', () => this.navigateChoices(1));
  }

  /**
   * Start a new dialogue sequence.
   * @param {Array<{speaker: string, text: string, col?: number, isBoss?: boolean, portrait?: string, voice?: string, choices?: Array<{text: string, next: string | Function}>}>} lines
   * @param {Function} onComplete callback when dialogue ends
   */
  show(lines, onComplete) {
    if (!lines || lines.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    this.active = true;
    this.lines = lines;
    this.lineIdx = 0;
    this.onComplete = onComplete || null;
    this.container.setVisible(true);

    this.startLine();
  }

  isActive() {
    return this.active;
  }

  startLine() {
    const line = this.lines[this.lineIdx];
    this.charIdx = 0;
    this.done = false;
    this.lastBeepCharIdx = -1;
    this.choices = line.choices || [];
    this.selectedChoiceIdx = 0;

    // Clear old choice objects
    this.clearChoiceObjects();

    // Speaker Name
    this.nameText.setText(line.speaker ? line.speaker.toUpperCase() : '???');
    if (line.col !== undefined) {
      this.nameText.setColor(Phaser.Display.Color.IntegerToColor(line.col).asString());
    } else {
      this.nameText.setColor('#ffd73c');
    }

    // Portrait setup
    if (line.portrait) {
      this.portraitImg.setTexture(line.portrait);
      this.portraitImg.setVisible(true);
      this.portraitLetter.setVisible(false);
      
      // If it's a turnaround sheet, set a crop to only show the front view (typically top-left quadrant)
      // Here, assume character_turnaround has front view in first 64x64 or 80x80 of the 256x256 image
      if (line.portrait.startsWith('npc_') || line.portrait.startsWith('boss_')) {
        const tex = this.scene.textures.get(line.portrait).getSourceImage();
        const w = tex.width;
        const h = tex.height;
        // Turnaround crop: crop the center/front view. Usually the character fits in top-left or top-center.
        // Let's crop a nice square front-view (about 0.4 of total width/height).
        const cropW = Math.min(w, 64);
        const cropH = Math.min(h, 64);
        this.portraitImg.setCrop(0, 0, cropW, cropH);
      } else {
        this.portraitImg.setCrop();
      }
    } else {
      this.portraitImg.setVisible(false);
      this.portraitLetter.setVisible(true);
      this.portraitLetter.setText(line.speaker ? line.speaker[0].toUpperCase() : '?');
    }

    this.bodyText.setText('');
  }

  clearChoiceObjects() {
    this.choiceTextObjects.forEach(obj => obj.destroy());
    this.choiceTextObjects = [];
  }

  onAdvancePress() {
    if (!this.active) return;

    if (!this.done) {
      // Skip typewriter animation
      const line = this.lines[this.lineIdx];
      this.charIdx = line.text.length;
      this.bodyText.setText(line.text);
      this.done = true;
      if (this.choices.length > 0) {
        this.showChoices();
      }
    } else {
      // If choices are active, advance is handled by selecting an option
      if (this.choices.length > 0) {
        this.selectChoice();
        return;
      }

      // Advance to next line
      this.lineIdx++;
      if (this.lineIdx >= this.lines.length) {
        this.close();
      } else {
        this.startLine();
      }
    }
  }

  showChoices() {
    this.clearChoiceObjects();

    // Hide main text to make room for choices in the same area
    this.bodyText.setText('');

    this.choices.forEach((choice, index) => {
      const cy = this.boxY + this.padding + 10 + (index * 12);
      
      const optionText = this.scene.add.text(
        this.nameX + 8, // Indented for the pointer
        cy,
        choice.text,
        {
          fontFamily: 'Outfit',
          fontSize: '8px',
          color: index === this.selectedChoiceIdx ? '#ffd73c' : '#c6c1b2',
        }
      );
      optionText.setInteractive({ useHandCursor: true });
      optionText.on('pointerdown', () => {
        this.selectedChoiceIdx = index;
        this.selectChoice();
      });
      optionText.on('pointerover', () => {
        this.selectedChoiceIdx = index;
        this.updateChoiceHighlights();
      });

      this.container.add(optionText);
      this.choiceTextObjects.push(optionText);
    });

    // Draw the pointer '>'
    this.pointer = this.scene.add.text(
      this.nameX,
      this.boxY + this.padding + 10,
      '>',
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '6px',
        color: '#ffd73c',
      }
    );
    this.container.add(this.pointer);
    this.choiceTextObjects.push(this.pointer);

    this.updateChoiceHighlights();
  }

  navigateChoices(dir) {
    if (!this.active || !this.done || this.choices.length === 0) return;

    this.selectedChoiceIdx = (this.selectedChoiceIdx + dir + this.choices.length) % this.choices.length;
    this.updateChoiceHighlights();
    this.playOscillatorBeep('default'); // Tiny UI tick sound
  }

  updateChoiceHighlights() {
    this.choices.forEach((choice, index) => {
      const textObj = this.choiceTextObjects[index];
      if (textObj) {
        textObj.setColor(index === this.selectedChoiceIdx ? '#ffd73c' : '#c6c1b2');
      }
    });

    if (this.pointer) {
      this.pointer.setY(this.boxY + this.padding + 11 + (this.selectedChoiceIdx * 12));
    }
  }

  selectChoice() {
    const choice = this.choices[this.selectedChoiceIdx];
    this.clearChoiceObjects();

    if (typeof choice.next === 'function') {
      choice.next();
    } else if (typeof choice.next === 'string') {
      // Custom event trigger, let the scene handle it
      this.scene.events.emit('dialogue_choice', choice.next);
    }
  }

  close() {
    this.active = false;
    this.container.setVisible(false);
    if (this.onComplete) {
      this.onComplete();
    }
  }

  playOscillatorBeep(presetName) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const preset = VOICE_PRESETS[presetName] || VOICE_PRESETS.default;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = preset.wave;
      osc.frequency.value = preset.freq + (Math.random() - 0.5) * preset.variance * 2;
      
      gain.gain.value = 0.05;
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + preset.dur);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + preset.dur);
    } catch (e) {
      // Audio failed / blocked — fail silent
    }
  }

  update(time, delta) {
    if (!this.active || this.done) return;

    const line = this.lines[this.lineIdx];
    if (!line) return;

    // Typewriter timing
    const dt = delta / 1000; // Phaser delta is in ms
    const speed = this.fastHeld ? this.charsPerSec * this.fastMultiplier : this.charsPerSec;
    this.charIdx += speed * dt;

    if (this.charIdx >= line.text.length) {
      this.charIdx = line.text.length;
      this.done = true;
      this.bodyText.setText(line.text);
      if (this.choices.length > 0) {
        this.showChoices();
      }
      return;
    }

    // Set typewriter text
    const curIdx = Math.floor(this.charIdx);
    this.bodyText.setText(line.text.substring(0, curIdx));

    // Voice beeps
    if (curIdx > this.lastBeepCharIdx) {
      const ch = line.text[curIdx - 1];
      if (ch && ch !== ' ' && ch !== '.' && ch !== ',' && ch !== '!' && ch !== '¡' && ch !== '?' && ch !== '¿') {
        // Play beep on every 2nd letter to avoid too fast beeping
        if (curIdx % 2 === 0) {
          const voice = line.voice || (line.isBoss ? 'boss_low' : 'default');
          this.playOscillatorBeep(voice);
        }
      }
      this.lastBeepCharIdx = curIdx;
    }
  }
}
