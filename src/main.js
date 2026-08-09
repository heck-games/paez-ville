// Paez Ville - Phaser 4 game entry point.
//
// Base resolution is 240x160 (GBA-style), scaled up to fill the browser
// window while preserving aspect ratio (letterboxed) via Scale.FIT.
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import WorldScene from './scenes/WorldScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 240,
  height: 160,
  pixelArt: true,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [BootScene, WorldScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
