import Phaser from 'phaser';
import { buildTilesetDataURI } from '../makeTileset.js';

// Relative paths — Vite base is './', and absolute `/assets/...` breaks if the
// game is ever served from a subpath. Keep every load path relative.
const MAPS = {
  isla: 'maps/isla.json',
  cerveceria: 'maps/cerveceria.json',
  cancha: 'maps/cancha.json',
};

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Loading bar (tiny GBA-style)
    const w = 120;
    const h = 8;
    const x = (240 - w) / 2;
    const y = 80;
    const barBg = this.add.rectangle(120, y, w, h, 0x222233).setOrigin(0.5);
    const bar = this.add.rectangle(x, y, 1, h, 0xffd73c).setOrigin(0, 0.5);
    this.add
      .text(120, y - 16, 'Páez Ville', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffd73c',
      })
      .setOrigin(0.5);
    this.load.on('progress', (p) => {
      bar.width = Math.max(1, w * p);
    });

    for (const [key, path] of Object.entries(MAPS)) {
      this.load.tilemapTiledJSON(key, path);
    }

    // Procedural tileset (no PNG art yet). Key must match Tiled tileset name.
    this.load.image('isla_tileset', buildTilesetDataURI());

    // RD spritesheets (audited). frame sizes match gen_sprites_rd specs.
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('trash_perro', 'assets/sprites/trash_perro.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('boss_cervezero', 'assets/sprites/boss_cervezero.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image('npc_vecino', 'assets/sprites/npc_vecino.png');

    // Silence unused
    void barBg;
  }

  create() {
    this.scene.start('World');
  }
}
