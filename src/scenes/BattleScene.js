// =============================================================================
// Páez Ville — src/scenes/BattleScene.js
// Turn-based battle register (Pokémon / Final Fantasy style)
// Solo protagonist vs El Cervecero (brewery foreman boss).
// Features: portrait, menu (Ataque / Objeto / Cargar), charge gauge, turn flow.
// =============================================================================

import Phaser from 'phaser';

const VIEW_W = 240;
const VIEW_H = 160;

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.bossName = data.bossName || 'El Cervecero';
    this.bossHp = data.bossHp !== undefined ? data.bossHp : 100;
    this.bossMaxHp = 100;
    this.playerHp = 100;
    this.playerMaxHp = 100;
    this.chargeGauge = 0; // 0 to 100
    this.menuIdx = 0;
    this.menuOptions = ['Ataque', 'Objeto', 'Cargar'];
    this.isTurnActive = true;
    this.onWinCallback = data.onWin || null;
    this.battleLog = '¡El cervecero te desafía!';
  }

  create() {
    // 1. Background
    const bg = this.add.graphics();
    bg.fillStyle(0x121024, 1);
    bg.fillRect(0, 0, VIEW_W, VIEW_H);

    // Industrial floor line
    bg.fillStyle(0x2a244d, 1);
    bg.fillRect(0, 95, VIEW_W, 65);
    bg.lineStyle(1, 0xffd73c, 0.4);
    bg.lineBetween(0, 95, VIEW_W, 95);

    // 2. Boss Sprite (Right)
    this.bossSprite = this.add.sprite(180, 55, 'boss_cervezero', 0);
    this.bossSprite.setDisplaySize(56, 56);

    this.bossNameText = this.add.text(180, 16, this.bossName, {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffd73c',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Boss HP bar
    this.bossHpBg = this.add.graphics();
    this.drawBossHpBar();

    // 3. Player Sprite / Portrait (Left)
    this.playerSprite = this.add.sprite(50, 70, 'player', 0);
    this.playerSprite.setDisplaySize(36, 36);

    this.playerNameText = this.add.text(50, 16, 'Páez', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#5fae44',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Player HP & Charge Bars
    this.playerHpBg = this.add.graphics();
    this.drawPlayerHpBar();

    // 4. Battle Log Box (Middle Bottom)
    this.logBoxBg = this.add.graphics();
    this.logText = this.add.text(10, 102, this.battleLog, {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#e6e1d2',
      wordWrap: { width: 140 },
    });

    // 5. Command Menu Box (Right Bottom)
    this.menuBg = this.add.graphics();
    this.menuItems = [];
    this.menuOptions.forEach((opt, idx) => {
      const item = this.add.text(165, 104 + idx * 16, opt, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: idx === 0 ? '#ffd73c' : '#a0a0a0',
        fontStyle: 'bold',
      });
      this.menuItems.push(item);
    });

    // 6. Input Listeners
    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on('keydown-UP', () => this.moveMenu(-1));
    this.input.keyboard.on('keydown-W', () => this.moveMenu(-1));
    this.input.keyboard.on('keydown-DOWN', () => this.moveMenu(1));
    this.input.keyboard.on('keydown-S', () => this.moveMenu(1));
    this.input.keyboard.on('keydown-ENTER', () => this.selectMenu());
    this.input.keyboard.on('keydown-SPACE', () => this.selectMenu());
    this.input.keyboard.on('keydown-Z', () => this.selectMenu());

    this.drawMenuBox();
    this.drawLogBox();

    // Debug Hook for validation
    window.__PAEZ_BATTLE = {
      getBossHp: () => this.bossHp,
      getPlayerHp: () => this.playerHp,
      selectOption: (idx) => {
        this.menuIdx = idx;
        this.selectMenu();
      },
    };
  }

  drawBossHpBar() {
    this.bossHpBg.clear();
    const x = 145;
    const y = 26;
    const w = 70;
    const h = 6;
    this.bossHpBg.fillStyle(0x331111, 1);
    this.bossHpBg.fillRect(x, y, w, h);
    const fillW = Math.max(0, (this.bossHp / this.bossMaxHp) * w);
    this.bossHpBg.fillStyle(0xe85d5d, 1);
    this.bossHpBg.fillRect(x, y, fillW, h);
    this.bossHpBg.lineStyle(1, 0xffffff, 0.5);
    this.bossHpBg.strokeRect(x, y, w, h);
  }

  drawPlayerHpBar() {
    this.playerHpBg.clear();
    const x = 15;
    const y = 26;
    const w = 70;
    const h = 6;
    // HP bar
    this.playerHpBg.fillStyle(0x113311, 1);
    this.playerHpBg.fillRect(x, y, w, h);
    const fillW = Math.max(0, (this.playerHp / this.playerMaxHp) * w);
    this.playerHpBg.fillStyle(0x5fae44, 1);
    this.playerHpBg.fillRect(x, y, fillW, h);
    this.playerHpBg.lineStyle(1, 0xffffff, 0.5);
    this.playerHpBg.strokeRect(x, y, w, h);

    // Charge Gauge bar
    const cy = 34;
    this.playerHpBg.fillStyle(0x333311, 1);
    this.playerHpBg.fillRect(x, cy, w, 4);
    const chargeW = (this.chargeGauge / 100) * w;
    this.playerHpBg.fillStyle(0xffd73c, 1);
    this.playerHpBg.fillRect(x, cy, chargeW, 4);
  }

  drawLogBox() {
    this.logBoxBg.clear();
    this.logBoxBg.fillStyle(0x0a0a12, 0.9);
    this.logBoxBg.fillRect(4, 98, 150, 58);
    this.logBoxBg.lineStyle(1, 0x5fae44, 0.6);
    this.logBoxBg.strokeRect(4, 98, 150, 58);
  }

  drawMenuBox() {
    this.menuBg.clear();
    this.menuBg.fillStyle(0x0a0a12, 0.95);
    this.menuBg.fillRect(158, 98, 78, 58);
    this.menuBg.lineStyle(1, 0xffd73c, 0.8);
    this.menuBg.strokeRect(158, 98, 78, 58);
  }

  moveMenu(dir) {
    if (!this.isTurnActive) return;
    this.menuIdx = (this.menuIdx + dir + this.menuOptions.length) % this.menuOptions.length;
    this.menuItems.forEach((item, idx) => {
      item.setColor(idx === this.menuIdx ? '#ffd73c' : '#a0a0a0');
    });
  }

  selectMenu() {
    if (!this.isTurnActive) return;
    this.isTurnActive = false;

    const opt = this.menuOptions[this.menuIdx];
    if (opt === 'Ataque') {
      this.executeAttack();
    } else if (opt === 'Objeto') {
      this.executeItem();
    } else if (opt === 'Cargar') {
      this.executeCharge();
    }
  }

  executeAttack() {
    const bonus = this.chargeGauge >= 100 ? 25 : 0;
    if (this.chargeGauge >= 100) this.chargeGauge = 0;

    const dmg = 40 + bonus;
    this.bossHp = Math.max(0, this.bossHp - dmg);
    this.drawBossHpBar();
    this.drawPlayerHpBar();

    this.battleLog = `¡Ataque directo! Hacés ${dmg} de daño a ${this.bossName}.`;
    this.logText.setText(this.battleLog);

    // Boss flash tween
    this.tweens.add({
      targets: this.bossSprite,
      alpha: 0.2,
      yoyo: true,
      repeat: 2,
      duration: 50,
      onComplete: () => {
        if (this.bossHp <= 0) {
          this.victory();
        } else {
          this.time.delayedCall(400, () => this.bossTurn());
        }
      },
    });
  }

  executeItem() {
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 40);
    this.drawPlayerHpBar();
    this.battleLog = '¡Tomaste un Fernet! Recuperaste 40 HP.';
    this.logText.setText(this.battleLog);
    this.time.delayedCall(500, () => this.bossTurn());
  }

  executeCharge() {
    this.chargeGauge = 100;
    this.drawPlayerHpBar();
    this.battleLog = '¡Cargaste la energía al máximo!';
    this.logText.setText(this.battleLog);
    this.time.delayedCall(500, () => this.bossTurn());
  }

  bossTurn() {
    if (this.bossHp <= 0) return;

    const dmg = 12;
    this.playerHp = Math.max(0, this.playerHp - dmg);
    this.drawPlayerHpBar();

    this.battleLog = `${this.bossName} contraataca causando ${dmg} de daño.`;
    this.logText.setText(this.battleLog);

    // Player flash
    this.tweens.add({
      targets: this.playerSprite,
      alpha: 0.3,
      yoyo: true,
      repeat: 1,
      duration: 60,
      onComplete: () => {
        this.isTurnActive = true;
        this.chargeGauge = Math.min(100, this.chargeGauge + 15);
        this.drawPlayerHpBar();
      },
    });
  }

  victory() {
    this.battleLog = `¡Derrotaste a ${this.bossName}!\n"La fábrica es de quienes la trabajan..."`;
    this.logText.setText(this.battleLog);

    this.tweens.add({
      targets: this.bossSprite,
      alpha: 0,
      scale: 1.4,
      duration: 600,
      onComplete: () => {
        this.time.delayedCall(500, () => {
          if (this.onWinCallback) this.onWinCallback();
          this.scene.start('World');
        });
      },
    });
  }
}
