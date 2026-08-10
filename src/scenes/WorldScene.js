import Phaser from 'phaser';
import VirtualJoyStick from 'phaser4-rex-plugins/plugins/virtualjoystick.js';
import Dialogue from '../components/Dialogue.js';
import { saveGame, loadGame, clearSave } from '../../js/save.js';

// WorldScene — walkable top-down maps (isla / cerveceria / cancha).
// Happy-path spine (docs/STORY.md):
//   talk don Tito → staff dogs → brewery boss (FF) → cancha ending → save.

const PLAYER_SPEED = 80; // px/sec, GBA-tuned

const MAP_SPAWNS = {
  isla: { x: 160, y: 120 },
  cerveceria: { x: 48, y: 200 },
  cancha: { x: 48, y: 200 },
};

// Exit destinations include a landing spawn so the player doesn't drop onto
// the reverse exit and ping-pong.
const EXIT_LANDINGS = {
  'isla->cerveceria': { x: 48, y: 200 },
  'cerveceria->isla': { x: 280, y: 200 },
  'cerveceria->cancha': { x: 48, y: 200 },
  'cancha->cerveceria': { x: 280, y: 200 },
};

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  init(data) {
    const saved = loadGame();
    if (data && data.mapKey) {
      this.currentMapKey = data.mapKey;
      this.savedSpawnX = data.spawnX !== undefined ? data.spawnX : null;
      this.savedSpawnY = data.spawnY !== undefined ? data.spawnY : null;
    } else if (saved) {
      this.currentMapKey = saved.mapKey || 'isla';
      this.savedSpawnX = saved.playerX;
      this.savedSpawnY = saved.playerY;
    } else {
      this.currentMapKey = 'isla';
      this.savedSpawnX = null;
      this.savedSpawnY = null;
    }
    this.bossDefeated =
      (data && data.bossDefeated) || (saved && saved.bossDefeated) || false;
    this.questStarted =
      (data && data.questStarted) || (saved && saved.questStarted) || false;
    this.endingSeen =
      (data && data.endingSeen) || (saved && saved.endingSeen) || false;
    this.exitCooldown = 0.6; // seconds — prevent instant re-exit on landing
    this.bossTriggered = false;
    this.endingTriggered = false;
  }

  create() {
    this.dialogue = new Dialogue(this);

    const map = this.make.tilemap({ key: this.currentMapKey });
    const tileset = map.addTilesetImage('isla_tileset', 'isla_tileset');
    const layer = map.createLayer('Tile Layer 1', tileset, 0, 0);
    layer.setCollisionByProperty({ collides: true });

    this.createPlayerAnimations();
    this.createDogAnimations();

    const def = MAP_SPAWNS[this.currentMapKey] || MAP_SPAWNS.isla;
    const spawnX =
      this.savedSpawnX !== null && this.savedSpawnX !== undefined
        ? this.savedSpawnX
        : def.x;
    const spawnY =
      this.savedSpawnY !== null && this.savedSpawnY !== undefined
        ? this.savedSpawnY
        : def.y;

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player', 0);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(14, 12);
    this.player.body.setOffset(9, 20);
    this.facingDir = { x: 0, y: 1 };
    this.physics.add.collider(this.player, layer);

    this.signs = [];
    this.vecino = null;
    this.bossMarker = null;
    this.endingSpot = null;
    this.extraNpcs = [];

    const poiLayer = map.getObjectLayer('POIs');
    if (poiLayer) {
      poiLayer.objects.forEach((obj) => {
        const getProp = (name) => {
          if (!obj.properties) return null;
          const prop = obj.properties.find((p) => p.name === name);
          return prop ? prop.value : null;
        };
        const x = obj.x + (obj.width || 16) / 2;
        const y = obj.y + (obj.height || 16) / 2;

        if (obj.type === 'npc' && getProp('npc') === 'don_tito') {
          this.vecino = this.physics.add.sprite(x, y, 'npc_vecino');
          this.vecino.setImmovable(true);
          this.vecino.setCrop(0, 0, 64, 96);
          this.vecino.setDisplaySize(20, 30);
          this.vecino.body.setSize(16, 16);
          this.vecino.body.setOffset(22, 64);
          this.physics.add.collider(this.player, this.vecino);
          this.add
            .text(x, y - 18, 'don Tito', {
              fontFamily: 'monospace',
              fontSize: '7px',
              color: '#ffffff',
            })
            .setOrigin(0.5);
        } else if (obj.type === 'npc') {
          const npc = this.physics.add.sprite(x, y, 'npc_vecino');
          npc.setImmovable(true);
          npc.setCrop(64, 0, 64, 96);
          npc.setDisplaySize(18, 28);
          npc.body.setSize(14, 14);
          this.physics.add.collider(this.player, npc);
          this.extraNpcs.push({
            sprite: npc,
            x,
            y,
            text: getProp('text') || '¡Hola, vecino!',
            name: obj.name,
          });
        } else if (obj.type === 'sign') {
          this.signs.push({ x, y, name: obj.name, text: getProp('text') });
          const g = this.add.graphics();
          g.fillStyle(0xc4a35a, 1);
          g.fillRect(x - 2, y - 6, 4, 10);
          g.fillStyle(0xe8d5a3, 1);
          g.fillRect(x - 6, y - 12, 12, 8);
        } else if (obj.type === 'boss') {
          if (!this.bossDefeated) {
            this.bossMarker = this.physics.add.sprite(x, y, 'boss_cervezero', 0);
            this.bossMarker.setImmovable(true);
            this.bossMarker.setDisplaySize(28, 28);
            this.bossMarker.body.setSize(20, 20);
            this.physics.add.collider(this.player, this.bossMarker);
            this.add
              .text(x, y - 20, 'El Cervecero', {
                fontFamily: 'monospace',
                fontSize: '7px',
                color: '#ffd73c',
              })
              .setOrigin(0.5);
            this.bossTaunt =
              getProp('taunt') ||
              '¡Acá mandamos los trabajadores! ¡105 días de toma en 1998!';
            this.bossHp = getProp('hp') || 100;
            this.bossName = getProp('name') || 'El Cervecero';
          } else {
            this.add
              .text(x, y, '…', {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#888888',
              })
              .setOrigin(0.5);
          }
        } else if (obj.type === 'trigger' && getProp('event') === 'finish_v01') {
          this.endingSpot = { x, y, r: 28 };
        }
      });
    }

    this.trashEnemies = this.physics.add.group();
    const duckObj = map.findObject('POIs', (o) => o.name === 'duck_spawn');
    if (duckObj && !this.bossDefeated) {
      this.spawnTrashEnemy(duckObj.x, duckObj.y);
      this.spawnTrashEnemy(duckObj.x + 24, duckObj.y + 16);
    }
    this.physics.add.collider(this.player, this.trashEnemies);
    this.physics.add.collider(this.trashEnemies, layer);

    this.exitObjects = map.filterObjects('POIs', (o) => o.type === 'exit') || [];
    this.exitObjects.forEach((ex) => {
      const g = this.add.graphics();
      g.lineStyle(1, 0xffd73c, 0.7);
      g.strokeCircle(ex.x + 8, ex.y + 8, 8);
      const targetProp = (ex.properties || []).find((p) => p.name === 'target');
      const label = targetProp ? `→ ${targetProp.value}` : '→';
      this.add
        .text(ex.x + 8, ex.y - 4, label, {
          fontFamily: 'monospace',
          fontSize: '6px',
          color: '#ffd73c',
        })
        .setOrigin(0.5);
    });

    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.fadeIn(250, 0, 0, 0);

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

      const actionButton = this.add
        .circle(this.scale.width - 40, this.scale.height - 40, 20, 0xffd73c, 0.6)
        .setScrollFactor(0)
        .setDepth(1000)
        .setInteractive();
      this.add
        .text(this.scale.width - 45, this.scale.height - 46, 'A', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#000000',
        })
        .setScrollFactor(0)
        .setDepth(1001);
      actionButton.on('pointerdown', () => this.handleAction());
    }

    this.hud = this.add
      .text(4, 4, this.hudLine(), {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#e6e1d2',
        backgroundColor: '#00000088',
        padding: { x: 3, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(1500);

    this.hint = this.add
      .text(120, 150, 'Z/Espacio: hablar · K/J: bastón', {
        fontFamily: 'monospace',
        fontSize: '6px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1500);
    this.time.delayedCall(5000, () => {
      if (this.hint) this.hint.setVisible(false);
    });

    this.setupDialogueEvents();
    this.installDebugHook();
    this.persist();
  }

  hudLine() {
    const bits = [this.currentMapKey];
    if (this.questStarted) bits.push('misión');
    if (this.bossDefeated) bits.push('cervecero✓');
    if (this.endingSeen) bits.push('fin');
    return bits.join(' · ');
  }

  persist() {
    saveGame({
      mapKey: this.currentMapKey,
      playerX: this.player ? this.player.x : MAP_SPAWNS.isla.x,
      playerY: this.player ? this.player.y : MAP_SPAWNS.isla.y,
      bossDefeated: this.bossDefeated,
      questStarted: this.questStarted,
      endingSeen: this.endingSeen,
    });
    if (this.hud) this.hud.setText(this.hudLine());
  }

  installDebugHook() {
    // Linear (no-choice) lines so Playwright can advance/close without branching.
    const LINEAR_DIALOGUE = [
      {
        speaker: 'Don Tito',
        portrait: 'npc_vecino',
        text: '¡Epa, che! ¿Cómo andás? Te vi medio desorientado. Al fin te despertás acá en la Isla de los Patos.',
        voice: 'npc_mid',
      },
      {
        speaker: 'Don Tito',
        portrait: 'npc_vecino',
        text: "Es un lindo día para estar al lado del río Suquía, ¿no? Villa Páez nació acá en los años '20 por la familia Páez.",
        voice: 'npc_mid',
      },
      {
        speaker: 'Don Tito',
        portrait: 'npc_vecino',
        text: 'Pero la cosa está brava allá arriba, cerca de la vieja Cervecería Córdoba… Se escuchan ruidos raros.',
        voice: 'npc_mid',
      },
    ];

    window.__PAEZ = {
      player: () => ({ x: this.player.x, y: this.player.y }),
      scene: () => this,
      triggerDialogue: (lines) => this.dialogue.show(lines || LINEAR_DIALOGUE),
      advanceDialogue: () => {
        // If a choice menu is up, pick the first option so harnesses don't stall.
        if (this.dialogue.isActive() && this.dialogue.choices && this.dialogue.choices.length) {
          this.dialogue.selectedChoiceIdx = 0;
          this.dialogue.selectChoice();
          return;
        }
        this.dialogue.onAdvancePress();
      },
      isDialogueActive: () => this.dialogue.isActive(),
      spawnTrashEnemy: (x, y) => this.spawnTrashEnemy(x, y),
      trashEnemiesCount: () => this.trashEnemies.countActive(true),
      attack: () => {
        // Staff must never open dialogue/battle UI (Zelda register).
        if (this.dialogue.isActive()) this.dialogue.close();
        this.attackWithStaff();
      },
      currentMapKey: () => this.currentMapKey,
      switchMap: (key) =>
        this.scene.restart({
          mapKey: key,
          spawnX: (MAP_SPAWNS[key] || MAP_SPAWNS.isla).x,
          spawnY: (MAP_SPAWNS[key] || MAP_SPAWNS.isla).y,
          bossDefeated: this.bossDefeated,
          questStarted: this.questStarted,
          endingSeen: this.endingSeen,
        }),
      // skipTaunt + immediate: validator only waits ~200ms
      triggerBossBattle: () => this.startBossBattle({ skipTaunt: true, immediate: true }),
      isInBattle: () => this.scene.isActive('Battle'),
      getBossHp: () => (window.__PAEZ_BATTLE ? window.__PAEZ_BATTLE.getBossHp() : null),
      battleCommand: (cmd) => {
        if (!window.__PAEZ_BATTLE) return;
        const idx = cmd === 'Attack' ? 0 : cmd === 'Item' ? 1 : 2;
        window.__PAEZ_BATTLE.selectOption(idx);
      },
      saveGame: (state) =>
        saveGame(
          state || {
            mapKey: this.currentMapKey,
            playerX: this.player.x,
            playerY: this.player.y,
            bossDefeated: this.bossDefeated,
            questStarted: this.questStarted,
            endingSeen: this.endingSeen,
          }
        ),
      loadGame: () => loadGame(),
      hasSave: () => loadGame() !== null,
      clearSave: () => clearSave(),
      state: () => ({
        mapKey: this.currentMapKey,
        bossDefeated: this.bossDefeated,
        questStarted: this.questStarted,
        endingSeen: this.endingSeen,
      }),
    };
  }

  createPlayerAnimations() {
    if (this.anims.exists('walk-down')) return;
    const mk = (key, start, end) => {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('player', { start, end }),
        frameRate: 8,
        repeat: -1,
      });
    };
    mk('walk-down', 0, 3);
    mk('walk-left', 5, 8);
    mk('walk-up', 10, 13);
    mk('walk-right', 15, 18);
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
    dog.body.setSize(14, 14);
    dog.body.setOffset(9, 12);
    dog.play('dog_idle');
    this.trashEnemies.add(dog);
    return dog;
  }

  attackWithStaff() {
    const attackX = this.player.x + this.facingDir.x * 18;
    const attackY = this.player.y + this.facingDir.y * 18;
    const arc = this.add.graphics();
    arc.lineStyle(2, 0xffe066, 1);
    arc.fillStyle(0xffe066, 0.4);
    arc.fillCircle(attackX, attackY, 14);
    arc.strokeCircle(attackX, attackY, 14);
    this.time.delayedCall(120, () => arc.destroy());
    if (this.dialogue && this.dialogue.playOscillatorBeep) {
      this.dialogue.playOscillatorBeep('default');
    }
    const hitRadius = 22;
    this.trashEnemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(attackX, attackY, enemy.x, enemy.y);
      if (dist <= hitRadius) {
        this.tweens.add({
          targets: enemy,
          alpha: 0,
          scale: 1.3,
          duration: 100,
          onComplete: () => enemy.destroy(),
        });
      }
    });
  }

  getDonTitoDialogue() {
    return [
      {
        speaker: 'Don Tito',
        portrait: 'npc_vecino',
        text: '¡Epa, che! ¿Cómo andás? Te vi medio desorientado. Al fin te despertás acá en la Isla de los Patos.',
        voice: 'npc_mid',
      },
      {
        speaker: 'Don Tito',
        portrait: 'npc_vecino',
        text: 'Es un lindo día para estar al lado del río Suquía, ¿no? Contame, ¿qué andás buscando por el barrio?',
        voice: 'npc_mid',
        choices: [
          { text: 'Preguntar sobre la historia de Villa Páez', next: 'ask_history' },
          { text: 'Preguntar qué anda pasando por acá', next: 'ask_trouble' },
        ],
      },
    ];
  }

  setupDialogueEvents() {
    this.events.on('dialogue_choice', (choiceKey) => {
      if (choiceKey === 'ask_history') {
        this.dialogue.show([
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: "Y… Villa Páez tiene su historia, chango. Nació allá por los años '20, pegado al río Suquía. Lo bautizaron por la familia Páez.",
            voice: 'npc_mid',
          },
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: '¡Hasta dicen que hay un túnel colonial del siglo XVIII escondido abajo de las casas!',
            voice: 'npc_mid',
          },
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: 'Pero bueno, ahora la cosa está brava allá arriba, cerca de la vieja Cervecería Córdoba…',
            voice: 'npc_mid',
            choices: [
              { text: 'Preguntar qué pasa en la Cervecería', next: 'ask_trouble' },
              { text: 'Ir a investigar la Cervecería', next: 'go_investigate' },
            ],
          },
        ]);
      } else if (choiceKey === 'ask_trouble') {
        this.dialogue.show([
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: 'La vieja Cervecería Córdoba está rara. Esa mole de ladrillos de 1917, allá arriba cruzando el Suquía.',
            voice: 'npc_mid',
          },
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: 'Se escuchan ruidos raros y los perros callejeros andan como locos en el camino. Los patos están asustados.',
            voice: 'npc_mid',
          },
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: 'Che, ¿no te animás a dar una vuelta? Con ese bastón te podés defender de los perros.',
            voice: 'npc_mid',
            choices: [
              { text: 'Preguntar sobre la historia del barrio', next: 'ask_history' },
              { text: 'Ir a investigar la Cervecería', next: 'go_investigate' },
            ],
          },
        ]);
      } else if (choiceKey === 'go_investigate') {
        this.dialogue.show(
          [
            {
              speaker: 'Don Tito',
              portrait: 'npc_vecino',
              text: 'Cruzá hacia la orilla y subí. Tené cuidado, chango, y metele pata. (seguí el camino dorado → cerveceria)',
              voice: 'npc_mid',
            },
          ],
          () => {
            this.questStarted = true;
            this.persist();
          }
        );
      }
    });
  }

  handleAction() {
    if (this.dialogue.isActive()) {
      this.dialogue.onAdvancePress();
      return;
    }
    const interactable = this.getInteractableWithin(28);
    if (interactable) this.tryInteract(interactable);
    else this.attackWithStaff();
  }

  tryInteract(targetObj) {
    if (this.dialogue.isActive()) return;
    const obj = targetObj || this.getInteractableWithin(28);
    if (!obj) return;

    if (obj.type === 'npc' && obj.name === 'don_tito') {
      this.dialogue.show(this.getDonTitoDialogue());
    } else if (obj.type === 'npc') {
      this.dialogue.show([
        { speaker: obj.label || 'Vecina', text: obj.text || '¡Hola!', voice: 'npc_high' },
      ]);
    } else if (obj.type === 'sign') {
      const titles = {
        isla_plaque: 'Placa de la Isla',
        crates_munich: 'Cajones',
        chimney_ruin: 'Ruinas',
        sign_fusion: 'Placa del Club',
        suquia_bank: 'Orilla del Suquía',
        corner_sign: 'Esquina',
      };
      this.dialogue.show([
        {
          speaker: titles[obj.name] || 'Cartel',
          text: obj.text,
          voice: 'default',
        },
      ]);
    } else if (obj.type === 'boss') {
      this.startBossBattle();
    }
  }

  getInteractableWithin(radius) {
    let closest = null;
    let minDist = radius;

    if (this.vecino) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.vecino.x, this.vecino.y
      );
      if (d < minDist) {
        closest = { type: 'npc', name: 'don_tito' };
        minDist = d;
      }
    }
    this.extraNpcs.forEach((n) => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y);
      if (d < minDist) {
        closest = { type: 'npc', name: n.name, text: n.text, label: 'Vecina' };
        minDist = d;
      }
    });
    this.signs.forEach((sign) => {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, sign.x, sign.y
      );
      if (d < minDist) {
        closest = { type: 'sign', name: sign.name, text: sign.text };
        minDist = d;
      }
    });
    if (this.bossMarker && this.bossMarker.active) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.bossMarker.x, this.bossMarker.y
      );
      if (d < minDist + 8) {
        closest = { type: 'boss' };
        minDist = d;
      }
    }
    return closest;
  }

  startBossBattle(opts = {}) {
    if (this.bossDefeated || this.bossTriggered) return;
    this.bossTriggered = true;

    const taunt = this.bossTaunt || '¡Acá mandamos los trabajadores!';
    const payload = {
      bossName: this.bossName || 'El Cervecero',
      bossHp: this.bossHp || 100,
      returnMapKey: this.currentMapKey || 'cerveceria',
      returnX: this.player.x,
      returnY: Math.min(this.player.y + 24, 200),
      onWin: null,
    };

    const go = () => {
      if (this.dialogue && this.dialogue.isActive()) this.dialogue.close();
      if (opts.immediate) {
        this.scene.start('Battle', payload);
        return;
      }
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(220, () => {
        this.scene.start('Battle', payload);
      });
    };

    if (opts.skipTaunt) {
      go();
      return;
    }

    if (this.dialogue && !this.dialogue.isActive()) {
      this.dialogue.show(
        [
          { speaker: 'El Cervecero', text: taunt, voice: 'boss_low' },
          {
            speaker: 'El Cervecero',
            text: 'Demolieron la chimenea en 2010… 83 años. ¡Pero yo no me voy!',
            voice: 'boss_low',
          },
        ],
        go
      );
    } else {
      go();
    }
  }

  triggerEnding() {
    if (this.endingTriggered) return;
    this.endingTriggered = true;
    this.endingSeen = true;
    this.persist();

    const lines = this.bossDefeated
      ? [
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: 'Ahí está, chango. La cancha del Deportivo Alberdi. Nació en 2002 de la fusión de Argentino Flores y 9 de Julio.',
            voice: 'npc_mid',
          },
          {
            speaker: 'Don Tito',
            portrait: 'npc_vecino',
            text: 'Dos clubes, un barrio. Así nos cuidamos entre nosotros. Gracias por mirar la cervecería.',
            voice: 'npc_mid',
          },
          {
            speaker: '—',
            text: 'Fin de Páez Ville v0.1. El barrio sigue. (partida guardada)',
            voice: 'default',
          },
        ]
      : [
          {
            speaker: '—',
            text: 'La cancha del Deportivo Alberdi. Todavía hay ruido en la cervecería…',
            voice: 'default',
          },
        ];

    this.dialogue.show(lines, () => this.persist());
  }

  goToMap(targetMap) {
    const key = `${this.currentMapKey}->${targetMap}`;
    const land = EXIT_LANDINGS[key] || MAP_SPAWNS[targetMap] || MAP_SPAWNS.isla;
    this.persist();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.time.delayedCall(220, () => {
      this.scene.restart({
        mapKey: targetMap,
        spawnX: land.x,
        spawnY: land.y,
        bossDefeated: this.bossDefeated,
        questStarted: this.questStarted,
        endingSeen: this.endingSeen,
      });
    });
  }

  update(time, delta) {
    if (this.exitCooldown > 0) this.exitCooldown -= delta / 1000;

    if (this.dialogue.isActive()) {
      this.player.setVelocity(0);
      this.player.anims.stop();
      this.dialogue.update(time, delta);
      return;
    }

    const justSpace = Phaser.Input.Keyboard.JustDown(this.actionSpace);
    const justZ = Phaser.Input.Keyboard.JustDown(this.actionZ);
    const justEnter = Phaser.Input.Keyboard.JustDown(this.actionEnter);
    const justK = Phaser.Input.Keyboard.JustDown(this.attackK);
    const justJ = Phaser.Input.Keyboard.JustDown(this.attackJ);

    if (justSpace || justZ || justEnter) {
      const interactable = this.getInteractableWithin(28);
      if (interactable) this.tryInteract(interactable);
      else if (justSpace || justZ) this.attackWithStaff();
    } else if (justK || justJ) {
      this.attackWithStaff();
    }

    if (
      this.bossMarker &&
      this.bossMarker.active &&
      !this.bossDefeated &&
      !this.bossTriggered
    ) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.bossMarker.x, this.bossMarker.y
      );
      if (d < 26) this.startBossBattle();
    }

    if (this.endingSpot && !this.endingTriggered) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.endingSpot.x, this.endingSpot.y
      );
      if (d < this.endingSpot.r) this.triggerEnding();
    }

    const body = this.player.body;
    body.setVelocity(0);
    const left =
      this.cursors.left.isDown ||
      this.wasd.left.isDown ||
      (this.joystickCursors && this.joystickCursors.left.isDown);
    const right =
      this.cursors.right.isDown ||
      this.wasd.right.isDown ||
      (this.joystickCursors && this.joystickCursors.right.isDown);
    const up =
      this.cursors.up.isDown ||
      this.wasd.up.isDown ||
      (this.joystickCursors && this.joystickCursors.up.isDown);
    const down =
      this.cursors.down.isDown ||
      this.wasd.down.isDown ||
      (this.joystickCursors && this.joystickCursors.down.isDown);

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
        this.player.play(vx > 0 ? 'walk-right' : 'walk-left', true);
      } else {
        this.player.play(vy > 0 ? 'walk-down' : 'walk-up', true);
      }
    } else {
      this.player.anims.stop();
      if (this.facingDir.y > 0) this.player.setFrame(0);
      else if (this.facingDir.x < 0) this.player.setFrame(5);
      else if (this.facingDir.y < 0) this.player.setFrame(10);
      else if (this.facingDir.x > 0) this.player.setFrame(15);
    }

    if (this.exitCooldown <= 0 && this.exitObjects) {
      for (const exitObj of this.exitObjects) {
        const ex = exitObj.x + (exitObj.width || 16) / 2;
        const ey = exitObj.y + (exitObj.height || 16) / 2;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, ex, ey);
        if (dist < 18) {
          const targetProp = (exitObj.properties || []).find((p) => p.name === 'target');
          const targetMap = targetProp ? targetProp.value : null;
          if (targetMap && targetMap !== this.currentMapKey) {
            this.goToMap(targetMap);
            break;
          }
        }
      }
    }
  }
}
