import Phaser from 'phaser';
import { buildTilesetDataURI } from '../makeTileset.js';

// BootScene - loads the map data and the (procedurally generated) tileset
// image, then hands off to WorldScene. Kept separate from WorldScene so
// loading concerns don't get tangled up with gameplay/scene setup.
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
  }

  create() {
    this.scene.start('World');
  }
}
