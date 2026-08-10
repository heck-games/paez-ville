import Phaser from 'phaser';
import VirtualJoyStick from 'phaser4-rex-plugins/plugins/virtualjoystick.js';
import Dialogue from '../components/Dialogue.js';

// LocalStorage Save System Helpers
const SAVE_KEY = 'paez_ville_save_v0.1';

const DON_TITO_DIALOGUE = [
  {
    speaker: "Don Tito",
    portrait: "npc_vecino",
    text: "¡Epa, che! ¿Cómo andás? Te vi medio desorientado. Al fin te despertás acá en la Isla de los Patos.",
    voice: 'npc_mid'
  },
  {
    speaker: "Don Tito",
    portrait: "npc_vecino",
    text: "Es un lindo día para estar al lado del río Suquía, ¿no? Villa Páez nació acá en los años '20 por la familia Páez.",
    voice: 'npc_mid'
  },
  {
    speaker: "Don Tito",
    portrait: "npc_vecino",
    text: "Pero la cosa está brava allá arriba, cerca de la vieja Cervecería Córdoba... Se escuchan ruidos raros.",
    voice: 'npc_mid'
  }
];

function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    console.log('[SaveSystem] Game saved successfully:', state);
  } catch (e) {
    console.error('[SaveSystem] Failed to save game:', e);
  }
}

function loadGame() {
  try {
    const data = localStorage.getItem(SAVE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('[SaveSystem] Failed to load game:', e);
    return null;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    console.log('[SaveSystem] Save cleared.');
  } catch (e) {
    console.error('[SaveSystem] Failed to clear save:', e);
  }
}

const PLAYER_SPEED = 80; // px/sec, GBA-tuned

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
    // --- Dialogue System ---------------------------------------------
    this.dialogue = new Dialogue(this);
    this.questStarted = false;

    // --- Tilemap ------------------------------------------------------
    const map = this.make.tilemap({ key: this.currentMapKey });
    const tileset = map.addTilesetImage('isla_tileset', 'isla_tileset');
    const layer = map.createLayer('Tile Layer 1', tileset, 0, 0);

    layer.setCollisionByProperty({ collides: true });

    // --- Animations ----------------------------------------------------
    this.createPlayerAnimations();
    this.createDogAnimations();

    // --- Player ---------------------------------------------------------
    const spawnX = this.savedSpawnX !== null && this.savedSpawnX !== undefined ? this.savedSpawnX : map.widthInPixels / 2;
    const spawnY = this.savedSpawnY !== null && this.savedSpawnY !== undefined ? this.savedSpawnY : map.heightInPixels / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player', 0);
    this.player.setCollideWorldBounds(true);
    
    // Set bounding box smaller than sprite (lower torso/feet) for RPG depth overlap
    this.player.body.setSize(14, 12);
    this.player.body.setOffset(9, 20);

    this.facingDir = { x: 0, y: 1 }; // facing down by default
    this.physics.add.collider(this.player, layer);

    // --- Spawn NPCs and Signs from Tiled Objects -----------------------
    this.signs = [];
    this.vecino = null;

    const poiLayer = map.getObjectLayer('POIs');
    if (poiLayer) {
      poiLayer.objects.forEach(obj => {
        const getProp = (name) => {
          if (!obj.properties) return null;
          const prop = obj.properties.find(p => p.name === name);
          return prop ? prop.value : null;
        };

        const x = obj.x + (obj.width || 16) / 2;
        const y = obj.y + (obj.height || 16) / 2;

        if (obj.type === 'npc' && getProp('npc') === 'don_tito') {
          // Spawn don Tito
          this.vecino = this.physics.add.sprite(x, y, 'npc_vecino');
          this.vecino.setImmovable(true);
          // Crop the front view: npc_vecino is a 256x256 image turnaround sheet.
          // Crop a nice 64x96 front view from top-left.
          this.vecino.setCrop(0, 0, 64, 96);
          this.vecino.setDisplaySize(20, 30);
          this.vecino.body.setSize(16, 16);
          this.vecino.body.setOffset(22, 64);
          
          this.physics.add.collider(this.player, this.vecino);
        } else if (obj.type === 'sign') {
          this.signs.push({
            x,
            y,
            name: obj.name,
            text: getProp('text'),
            source: getProp('source')
          });
        }
      });
    }

    // --- Trash Enemies (Stray Dogs / Perros Callejeros) ---------------
    this.trashEnemies = this.physics.add.group();
    
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
    });
    
    this.actionSpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.actionZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.actionEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    
    this.attackK = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.attackJ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);

    // Touch joystick (coarse pointer / mobile only)
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

      // Mobile action button (A / Z)
      const actionButton = this.add.circle(this.scale.width - 40, this.scale.height - 40, 20, 0xffd73c, 0.6);
      actionButton.setScrollFactor(0).setDepth(1000).setInteractive();
      this.add.text(this.scale.width - 45, this.scale.height - 46, 'A', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#000000',
      }).setScrollFactor(0).setDepth(1001);
      
      actionButton.on('pointerdown', () => {
        // If dialogue is active, advance it. Otherwise interact.
        if (this.dialogue.isActive()) {
          this.dialogue.onAdvancePress();
        } else {
          // If close to Don Tito, talk. Otherwise swing staff.
          const dist = this.vecino ? Phaser.Math.Distance.Between(this.player.x, this.player.y, this.vecino.x, this.vecino.y) : 999;
          if (dist < 32) {
            this.tryInteract();
          } else {
            this.attackWithStaff();
          }
        }
      });
    }

    // --- Dialogue Event Handlers ----------------------------------------
    this.setupDialogueEvents();

    // --- Debug Hook for Playwright Validation ------------------------
    window.__PAEZ = {
      player: () => ({ x: this.player.x, y: this.player.y }),
      scene: () => this,
      triggerDialogue: (lines) => this.dialogue.show(lines || DON_TITO_DIALOGUE),
      advanceDialogue: () => this.dialogue.onAdvancePress(),
      isDialogueActive: () => this.dialogue.isActive(),
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
      saveGame: (state) => saveGame(state || { mapKey: this.currentMapKey, playerX: this.player.x, playerY: this.player.y }),
      loadGame: () => loadGame(),
      hasSave: () => loadGame() !== null,
      clearSave: () => clearSave(),
    };
  }

  createPlayerAnimations() {
    if (this.anims.exists('walk-down')) return;

    // 5x4 grid: 5 frames per direction
    this.anims.create({
      key: 'walk-down',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 4 }),
      frameRate: 8,
      repeat: -1
    });
    this.anims.create({
      key: 'walk-left',
      frames: this.anims.generateFrameNumbers('player', { start: 5, end: 9 }),
      frameRate: 8,
      repeat: -1
    });
    this.anims.create({
      key: 'walk-up',
      frames: this.anims.generateFrameNumbers('player', { start: 10, end: 14 }),
      frameRate: 8,
      repeat: -1
    });
    this.anims.create({
      key: 'walk-right',
      frames: this.anims.generateFrameNumbers('player', { start: 15, end: 19 }),
      frameRate: 8,
      repeat: -1
    });
  }

  createDogAnimations() {
    if (this.anims.exists('dog_idle')) return;
    this.anims.create({
      key: 'dog_idle',
      frames: this.anims.generateFrameNumbers('trash_perro', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1
    });
  }

  spawnTrashEnemy(x, y) {
    const dog = this.physics.add.sprite(x, y, 'trash_perro', 0);
    dog.setCollideWorldBounds(true);
    dog.body.setSize(14, 14);
    dog.body.setOffset(9, 12);
    dog.play('dog_idle');
    this.trashEnemies.add(dog);
    return dog;
  }

  attackWithStaff() {
    // 1. Staff swing visual arc
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

    this.dialogue.playOscillatorBeep('default'); // Attack sound tick

    // 2. Check overlap against trash enemies (Zelda register: 1 hit despawns)
    const hitRadius = 22;
    this.trashEnemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(attackX, attackY, enemy.x, enemy.y);
      if (dist <= hitRadius) {
        // Hit effect: quick scale up & fade out
        this.tweens.add({
          targets: enemy,
          alpha: 0,
          scale: 1.3,
          duration: 100,
          onComplete: () => {
            enemy.destroy();
          }
        });
      }
    });
  }

  getDonTitoDialogue() {
    return [
      {
        speaker: "Don Tito",
        portrait: "npc_vecino",
        text: "¡Epa, che! ¿Cómo andás? Te vi medio desorientado. Al fin te despertás acá en la Isla de los Patos.",
        voice: 'npc_mid'
      },
      {
        speaker: "Don Tito",
        portrait: "npc_vecino",
        text: "Es un lindo día para estar al lado del río Suquía, ¿no? Contame, ¿qué andás buscando por el barrio?",
        voice: 'npc_mid',
        choices: [
          {
            text: "Preguntar sobre la historia de Villa Páez",
            next: "ask_history"
          },
          {
            text: "Preguntar qué anda pasando por acá",
            next: "ask_trouble"
          }
        ]
      }
    ];
  }

  setupDialogueEvents() {
    this.events.on('dialogue_choice', (choiceKey) => {
      if (choiceKey === 'ask_history') {
        this.dialogue.show([
          {
            speaker: "Don Tito",
            portrait: "npc_vecino",
            text: "Y... Villa Páez tiene su historia, chango. Nació allá por los años '20, pegado al río Suquía. Lo bautizaron por la familia Páez, que eran dueños de estas tierras.",
            voice: 'npc_mid'
          },
          {
            speaker: "Don Tito",
            portrait: "npc_vecino",
            text: "¡Hasta dicen que hay un túnel colonial del siglo XVIII escondido abajo de las casas! Una locura de la época de los jesuitas.",
            voice: 'npc_mid'
          },
          {
            speaker: "Don Tito",
            portrait: "npc_vecino",
            text: "Pero bueno, ahora la cosa está brava allá arriba, cerca de la vieja Cervecería Córdoba...",
            voice: 'npc_mid',
            choices: [
              {
                text: "Preguntar qué pasa en la Cervecería",
                next: "ask_trouble"
              },
              {
                text: "Ir a investigar la Cervecería",
                next: "go_investigate"
              }
            ]
          }
        ]);
      } else if (choiceKey === 'ask_trouble') {
        this.dialogue.show([
          {
            speaker: "Don Tito",
            portrait: "npc_vecino",
            text: "La vieja Cervecería Córdoba está rara. Es esa mole industrial de ladrillos de 1917 que está ahí arriba, cruzando el río Suquía.",
            voice: 'npc_mid'
          },
          {
            speaker: "Don Tito",
            portrait: "npc_vecino",
            text: "Se escuchan ruidos raros y los perros callejeros andan como locos en el camino. Los patos están asustados.",
            voice: 'npc_mid'
          },
          {
            speaker: "Don Tito",
            portrait: "npc_vecino",
            text: "Che, ¿no te animás a dar una vuelta y ver qué pasa? Con ese bastón que llevás te podés defender de los perros.",
            voice: 'npc_mid',
            choices: [
              {
                text: "Preguntar sobre la historia del barrio",
                next: "ask_history"
              },
              {
                text: "Ir a investigar la Cervecería",
                next: "go_investigate"
              }
            ]
          }
        ]);
      } else if (choiceKey === 'go_investigate') {
        this.dialogue.show([
          {
            speaker: "Don Tito",
            portrait: "npc_vecino",
            text: "Cruzá por la pasarela hacia la orilla norte del río Suquía y subí. Tené cuidado, chango, y metele pata.",
            voice: 'npc_mid'
          }
        ], () => {
          this.questStarted = true;
        });
      }
    });
  }

  tryInteract(targetObj) {
    if (this.dialogue.isActive()) return;

    const obj = targetObj || this.getInteractableWithin(24);
    if (!obj) return;

    if (obj.type === 'npc') {
      this.dialogue.show(this.getDonTitoDialogue());
    } else if (obj.type === 'sign') {
      this.dialogue.show([
        {
          speaker: obj.name === 'isla_plaque' ? 'Placa de la Isla' : 'Orilla del Suquía',
          text: obj.text,
          voice: 'default'
        }
      ]);
    }
  }

  getInteractableWithin(radius) {
    let closestObj = null;
    let minDist = radius;

    // 1. Check don Tito
    if (this.vecino) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.vecino.x, this.vecino.y);
      if (dist < minDist) {
        closestObj = { type: 'npc', name: 'don_tito' };
        minDist = dist;
      }
    }

    // 2. Check Signposts
    this.signs.forEach(sign => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, sign.x, sign.y);
      if (dist < minDist) {
        closestObj = { type: 'sign', name: sign.name, text: sign.text };
        minDist = dist;
      }
    });

    return closestObj;
  }

  update(time, delta) {
    // If dialogue is active, update dialogue and freeze player movement
    if (this.dialogue.isActive()) {
      this.player.setVelocity(0);
      this.player.anims.stop();
      this.dialogue.update(time, delta);
      return;
    }

    // Check interaction and attack inputs
    const justSpace = Phaser.Input.Keyboard.JustDown(this.actionSpace);
    const justZ = Phaser.Input.Keyboard.JustDown(this.actionZ);
    const justEnter = Phaser.Input.Keyboard.JustDown(this.actionEnter);
    const justK = Phaser.Input.Keyboard.JustDown(this.attackK);
    const justJ = Phaser.Input.Keyboard.JustDown(this.attackJ);

    if (justSpace || justZ || justEnter) {
      const interactable = this.getInteractableWithin(24);
      if (interactable) {
        this.tryInteract(interactable);
      } else if (justSpace || justZ) {
        this.attackWithStaff();
      }
    } else if (justK || justJ) {
      this.attackWithStaff();
    }

    // --- Movement Physics ---
    const body = this.player.body;
    body.setVelocity(0);

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

      // Play walk animation matching dominant moving axis
      if (Math.abs(vx) > Math.abs(vy)) {
        if (vx > 0) this.player.play('walk-right', true);
        else this.player.play('walk-left', true);
      } else {
        if (vy > 0) this.player.play('walk-down', true);
        else this.player.play('walk-up', true);
      }
    } else {
      this.player.anims.stop();
      if (this.facingDir.y > 0) this.player.setFrame(0);
      else if (this.facingDir.x < 0) this.player.setFrame(5);
      else if (this.facingDir.y < 0) this.player.setFrame(10);
      else if (this.facingDir.x > 0) this.player.setFrame(15);
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
