import Phaser from 'phaser';
import { buildTilesetDataURI } from '../makeTileset.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // The Tiled JSON map for "Isla de los Patos".
    this.load.tilemapTiledJSON('isla', '/maps/isla.json');

    // Phase 1 has no tile art yet: draw a tiny tileset on a canvas and
    // load the resulting data URI as a normal image texture. The key
    // ('isla_tileset') matches the tileset "name" referenced from the
    // Tiled JSON via map.addTilesetImage() in WorldScene.
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

