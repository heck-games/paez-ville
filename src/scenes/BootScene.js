import Phaser from 'phaser';
import { buildTilesetDataURI } from '../makeTileset.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Tiled JSON maps (the 3 locations for v0.1)
    this.load.tilemapTiledJSON('isla', '/maps/isla.json');
    this.load.tilemapTiledJSON('cerveceria', '/maps/cerveceria.json');
    this.load.tilemapTiledJSON('cancha', '/maps/cancha.json');

    // Tileset
    this.load.image('isla_tileset', buildTilesetDataURI());

    // Spritesheets (generated via RetroDiffusion, audited by audit_sheets.py)
    this.load.spritesheet('player', '/assets/sprites/player.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('trash_perro', '/assets/sprites/trash_perro.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('boss_cervezero', '/assets/sprites/boss_cervezero.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image('npc_vecino', '/assets/sprites/npc_vecino.png');
  }

  create() {
    this.scene.start('World');
  }
}

