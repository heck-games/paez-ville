import Phaser from 'phaser';
import VirtualJoyStick from 'phaser4-rex-plugins/plugins/virtualjoystick.js';
import {
  initDialogue,
  showDialogue,
  isDialogueActive,
  updateDialogue,
  advanceDialogue,
} from '../../js/dialogue.js';
import { saveGame, loadGame, clearSave } from '../../js/save.js';

// WorldScene - the walkable "Isla de los Patos" map.
const PLAYER_SPEED = 80; // px/sec, tuned for the 240x160 base resolution
const PLAYER_SIZE = 16; // 16x16 sprite size for GBA resolution

const DON_TITO_DIALOGUE = [
  {
    speaker: 'don Tito',
    text: '¡Buenas mijo! Mirá qué linda está la Isla de los Patos hoy.',
    colHex: '#5fae44',
    portraitCol: [95, 174, 68],
    voice: 'npc_mid',
  },
  {
    speaker: 'don Tito',
    text: 'Fue inaugurada el 21 de agosto de 1991. Soltaron cientos de patos al río Suquía.',
    colHex: '#5fae44',
    portraitCol: [95, 174, 68],
    voice: 'npc_mid',
  },
  {
    speaker: 'don Tito',
    text: 'Villa Páez nació en los años \'20 al lado del río Suquía, por la familia Páez.',
    colHex: '#5fae44',
    portraitCol: [95, 174, 68],
    voice: 'npc_mid',
  },
  {
    speaker: 'don Tito',
    text: 'En la antigua Cervecería Córdoba hay ruido... alguien tendría que ir a mirar.',
    colHex: '#5fae44',
    portraitCol: [95, 174, 68],
    voice: 'npc_mid',
  },
];

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  init(data) {
    const saved = loadGame();
    if (data && data.mapKey) {
      this.currentMapKey = data.mapKey;
      this.savedSpawnX = data.spawnX;
      this.savedSpawnY = data.spawnY;
    } else if (saved) {
      this.currentMapKey = saved.mapKey || 'isla';
      this.savedSpawnX = saved.playerX;
      this.savedSpawnY = saved.playerY;
    } else {
      this.currentMapKey = 'isla';
      this.savedSpawnX = null;
      this.savedSpawnY = null;
    }
    this.bossDefeated = (data && data.bossDefeated) || (saved && saved.bossDefeated) || false;
  }

  create() {
    // --- Tilemap ------------------------------------------------------
    const map = this.make.tilemap({ key: this.currentMapKey });
    const tileset = map.addTilesetImage('isla_tileset', 'isla_tileset');
    const layer = map.createLayer('Tile Layer 1', tileset, 0, 0);

    layer.setCollisionByProperty({ collides: true });

    // --- Player ---------------------------------------------------------
    this.createPlayerAnimations();

    const spawnX = map.widthInPixels / 2;
    const spawnY = map.heightInPixels / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player', 0);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(16, 16);
    this.player.body.setOffset(8, 16); // feet box

    this.facingDir = { x: 0, y: 1 };
    this.physics.add.collider(this.player, layer);

    // --- NPC: don Tito ------------------------------------------------
    this.makeNPCTexture();
    const titoObj = map.findObject('POIs', (obj) => obj.name === 'vecino_bench');
    const titoX = titoObj ? titoObj.x : 96;
    const titoY = titoObj ? titoObj.y : 96;

    this.donTito = this.physics.add.sprite(titoX, titoY, 'npc_rect');
    this.donTito.setImmovable(true);
    this.physics.add.collider(this.player, this.donTito);

    // Label for NPC
    this.donTitoLabel = this.add.text(titoX, titoY - 12, 'don Tito', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // --- Trash Enemies (Stray Dogs / Perros Callejeros) ---------------
    this.trashEnemies = this.physics.add.group();
    this.createDogAnimations();
    
    // Spawn initial trash dogs near duck spawn POI
    const duckObj = map.findObject('POIs', (obj) => obj.name === 'duck_spawn');
    const dogX = duckObj ? duckObj.x : 160;
    const dogY = duckObj ? duckObj.y : 160;
    this.spawnTrashEnemy(dogX, dogY);
    this.spawnTrashEnemy(dogX + 24, dogY + 16);

    this.physics.add.collider(this.player, this.trashEnemies);
    this.physics.add.collider(this.trashEnemies, layer);

    // --- Exit POIs for Map Transitions --------------------------------
    this.exitObjects = map.filterObjects('POIs', (obj) => obj.type === 'exit') || [];

    // --- Camera -----------------------------------------------------
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // --- Input -------------------------------------------------------
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      attackK: Phaser.Input.Keyboard.KeyCodes.K,
      attackJ: Phaser.Input.Keyboard.KeyCodes.J,
    });

    // Touch joystick
    this.joystickCursors = null;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      const joystick = new VirtualJoyStick(this, {
        x: 40,
        y: this.scale.height - 40,
        radius: 24,
        base: this.add.circle(0, 0, 24, 0x888888, 0.4),
        thumb: this.add.circle(0, 0, 12, 0xcccccc, 0.7),
      });
      joystick.base.setScrollFactor(0).setDepth(1000);
      joystick.thumb.setScrollFactor(0).setDepth(1001);
      this.joystickCursors = joystick.createCursorKeys();
    }

    // --- Dialogue System ---------------------------------------------
    initDialogue(this);

    // Interaction key (E)
    this.input.keyboard.on('keydown-E', () => {
      if (!isDialogueActive()) this.checkInteraction();
    });

    // Attack keys (K, J, Space when close to enemy / not in dialogue)
    this.input.keyboard.on('keydown-K', () => {
      if (!isDialogueActive()) this.attackWithStaff();
    });
    this.input.keyboard.on('keydown-J', () => {
      if (!isDialogueActive()) this.attackWithStaff();
    });
    this.input.keyboard.on('keydown-SPACE', () => {
      if (isDialogueActive()) return;
      // If near don Tito, talk; otherwise attack with staff!
      const distTito = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.donTito.x, this.donTito.y);
      if (distTito < 32) {
        this.checkInteraction();
      } else {
        this.attackWithStaff();
      }
    });

    // --- Debug Hook for Playwright Validation ------------------------
    window.__PAEZ = {
      player: () => ({ x: this.player.x, y: this.player.y }),
      scene: () => this,
      triggerDialogue: (lines) => showDialogue(lines || DON_TITO_DIALOGUE),
      advanceDialogue: () => advanceDialogue(),
      isDialogueActive: () => isDialogueActive(),
      spawnTrashEnemy: (x, y) => this.spawnTrashEnemy(x, y),
      trashEnemiesCount: () => this.trashEnemies.countActive(true),
      attack: () => this.attackWithStaff(),
      currentMapKey: () => this.currentMapKey,
      switchMap: (key) => this.scene.restart({ mapKey: key }),
      triggerBossBattle: (onWin) => {
        this.scene.start('Battle', {
          bossName: 'El Cervecero',
          bossHp: 100,
          onWin: onWin || null,
        });
      },
      isInBattle: () => this.scene.isActive('Battle'),
      getBossHp: () => (window.__PAEZ_BATTLE ? window.__PAEZ_BATTLE.getBossHp() : null),
      battleCommand: (cmd) => {
        if (!window.__PAEZ_BATTLE) return;
        const idx = cmd === 'Attack' ? 0 : cmd === 'Item' ? 1 : 2;
        window.__PAEZ_BATTLE.selectOption(idx);
      },
    };
  }

  createDogAnimations() {
    if (this.anims.exists('dog_idle')) return;
    this.anims.create({
      key: 'dog_idle',
      frames: this.anims.generateFrameNumbers('trash_perro', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
  }

  spawnTrashEnemy(x, y) {
    const dog = this.physics.add.sprite(x, y, 'trash_perro', 0);
    dog.setCollideWorldBounds(true);
    dog.body.setSize(16, 16);
    dog.body.setOffset(8, 16);
    dog.play('dog_idle');
    this.trashEnemies.add(dog);
    return dog;
  }

  attackWithStaff() {
    // 1. Staff swing visual arc in front of player
    const attackX = this.player.x + this.facingDir.x * 18;
    const attackY = this.player.y + this.facingDir.y * 18;

    const arc = this.add.graphics();
    arc.lineStyle(2, 0xffe066, 1);
    arc.fillStyle(0xffe066, 0.4);
    arc.fillCircle(attackX, attackY, 14);
    arc.strokeCircle(attackX, attackY, 14);

    this.time.delayedCall(120, () => {
      arc.destroy();
    });

    // 2. Check overlap against trash enemies (Zelda register: 1 hit despawns)
    const hitRadius = 22;
    this.trashEnemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(attackX, attackY, enemy.x, enemy.y);
      if (dist <= hitRadius) {
        // Hit effect: quick flash & despawn
        this.tweens.add({
          targets: enemy,
          alpha: 0,
          scale: 1.3,
          duration: 100,
          onComplete: () => {
            enemy.destroy();
          },
        });
      }
    });
  }

  createPlayerAnimations() {
    if (this.anims.exists('walk_down')) return;

    this.anims.create({
      key: 'walk_down',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'walk_left',
      frames: this.anims.generateFrameNumbers('player', { start: 4, end: 7 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'walk_right',
      frames: this.anims.generateFrameNumbers('player', { start: 8, end: 11 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'walk_up',
      frames: this.anims.generateFrameNumbers('player', { start: 12, end: 15 }),
      frameRate: 8,
      repeat: -1,
    });
  }

  makeNPCTexture() {
    if (this.textures.exists('npc_rect')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x5fae44, 1);
    g.fillRect(0, 0, 16, 16);
    g.lineStyle(1, 0x386d27, 1);
    g.strokeRect(0, 0, 16, 16);
    g.generateTexture('npc_rect', 16, 16);
    g.destroy();
  }

  checkInteraction() {
    if (isDialogueActive()) return;
    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.donTito.x,
      this.donTito.y
    );
    if (dist < 32) {
      showDialogue(DON_TITO_DIALOGUE);
    }
  }

  update(time, delta) {
    updateDialogue(delta);

    const body = this.player.body;
    body.setVelocity(0);

    if (isDialogueActive()) {
      this.player.anims.stop();
      return;
    }

    const left = this.cursors.left.isDown || this.wasd.left.isDown
      || (this.joystickCursors && this.joystickCursors.left.isDown);
    const right = this.cursors.right.isDown || this.wasd.right.isDown
      || (this.joystickCursors && this.joystickCursors.right.isDown);
    const up = this.cursors.up.isDown || this.wasd.up.isDown
      || (this.joystickCursors && this.joystickCursors.up.isDown);
    const down = this.cursors.down.isDown || this.wasd.down.isDown
      || (this.joystickCursors && this.joystickCursors.down.isDown);

    let vx = 0;
    let vy = 0;
    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      vx /= len;
      vy /= len;
      body.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
      this.facingDir = { x: vx, y: vy };

      if (Math.abs(vx) > Math.abs(vy)) {
        if (vx < 0) this.player.anims.play('walk_left', true);
        else this.player.anims.play('walk_right', true);
      } else {
        if (vy < 0) this.player.anims.play('walk_up', true);
        else this.player.anims.play('walk_down', true);
      }
    } else {
      this.player.anims.stop();
    }

    // Check map exits
    if (this.exitObjects) {
      for (const exitObj of this.exitObjects) {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, exitObj.x, exitObj.y);
        if (dist < 20) {
          const targetProp = exitObj.properties ? exitObj.properties.find((p) => p.name === 'target') : null;
          const targetMap = targetProp ? targetProp.value : null;
          if (targetMap && targetMap !== this.currentMapKey) {
            this.scene.restart({ mapKey: targetMap });
            break;
          }
        }
      }
    }
  }
}


