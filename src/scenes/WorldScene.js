import Phaser from 'phaser';
import VirtualJoyStick from 'phaser4-rex-plugins/plugins/virtualjoystick.js';

// WorldScene - the walkable "Isla de los Patos" map.
//
// Responsibilities: build the tilemap from the loaded Tiled JSON + the
// procedural tileset texture, spawn the player, wire up keyboard/WASD/touch
// movement, set collision against tree/water tiles, and have the camera
// follow the player within the map bounds.
const PLAYER_SPEED = 80; // px/sec, tuned for the 240x160 base resolution
const PLAYER_SIZE = 32; // Phase 1 placeholder rect (real sprite = Phase 3)

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    // --- Tilemap ------------------------------------------------------
    const map = this.make.tilemap({ key: 'isla' });
    // The tileset "name" inside isla.json is "isla_tileset"; we link it to
    // the Phaser texture key loaded in BootScene (also "isla_tileset").
    // Passing an explicit texture key means Phaser never needs the PNG file
    // path recorded in the Tiled JSON - the procedural data-URI image
    // stands in for it.
    const tileset = map.addTilesetImage('isla_tileset', 'isla_tileset');
    const layer = map.createLayer('Tile Layer 1', tileset, 0, 0);

    // Local tile ids 2 (tree) and 3 (water) are marked collides:true in
    // isla.json's tileset "tiles" properties.
    layer.setCollisionByProperty({ collides: true });

    // --- Player ---------------------------------------------------------
    // No sprite art yet (Phase 3): a plain colored rectangle texture,
    // generated once here and reused as the player's physics body.
    this.makePlayerTexture();

    const spawnX = map.widthInPixels / 2;
    const spawnY = map.heightInPixels / 2;
    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_rect');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(PLAYER_SIZE, PLAYER_SIZE);

    // Small facing-direction marker: a tiny square offset from center in
    // the direction the player last moved. Updated in update().
    this.facingMarker = this.add.rectangle(spawnX, spawnY, 6, 6, 0xffe066);
    this.facingDir = { x: 0, y: 1 }; // default: facing down

    this.physics.add.collider(this.player, layer);

    // --- Camera -----------------------------------------------------
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // --- Input: keyboard + WASD ---------------------------------------
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // --- Input: touch virtual joystick (touch devices only) -----------
    this.joystickCursors = null;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      const joystick = new VirtualJoyStick(this, {
        x: 40,
        y: this.scale.height - 40,
        radius: 24,
        base: this.add.circle(0, 0, 24, 0x888888, 0.4),
        thumb: this.add.circle(0, 0, 12, 0xcccccc, 0.7),
      });
      // Keep the joystick UI fixed on screen and above world geometry.
      joystick.base.setScrollFactor(0).setDepth(1000);
      joystick.thumb.setScrollFactor(0).setDepth(1001);
      this.joystickCursors = joystick.createCursorKeys();
    }

    // --- Debug hook for scripts/validate.mjs ---------------------------
    window.__PAEZ = {
      player: () => ({ x: this.player.x, y: this.player.y }),
      scene: () => this,
    };
  }

  // Draws a simple 32x32 colored rectangle and registers it as a texture
  // so it can be used like any loaded sprite sheet.
  makePlayerTexture() {
    if (this.textures.exists('player_rect')) return;

    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xe85d5d, 1);
    g.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE);
    g.lineStyle(2, 0x8f2d2d, 1);
    g.strokeRect(1, 1, PLAYER_SIZE - 2, PLAYER_SIZE - 2);
    g.generateTexture('player_rect', PLAYER_SIZE, PLAYER_SIZE);
    g.destroy();
  }

  update() {
    const body = this.player.body;
    body.setVelocity(0);

    // Merge keyboard, WASD and (if present) the touch joystick into a
    // single set of 4-directional booleans.
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
      // Normalize so diagonal movement isn't faster than cardinal movement.
      const len = Math.sqrt(vx * vx + vy * vy);
      vx /= len;
      vy /= len;
      body.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
      this.facingDir = { x: vx, y: vy };
    }

    // Keep the facing marker glued just outside the player's edge in the
    // last-moved direction, as a cheap stand-in for a directional sprite.
    const offset = PLAYER_SIZE / 2 + 4;
    this.facingMarker.setPosition(
      this.player.x + this.facingDir.x * offset,
      this.player.y + this.facingDir.y * offset,
    );
  }
}
