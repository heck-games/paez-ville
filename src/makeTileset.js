// Paez Ville - programmatic tileset generator.
//
// Phase 1 has no tile art yet, so we draw a tiny tileset ourselves on a
// <canvas>, convert it to a data URI, and load that as a normal Phaser
// image texture. This lets the Tiled JSON map reference a "real" tileset
// image without any PNG file existing on disk.
//
// Tile layout (16x16 px cells, laid out left-to-right in a single row):
//   local id 0 -> grass  (green)
//   local id 1 -> path   (brown)
//   local id 2 -> tree   (dark green, collidable)
//   local id 3 -> water  (blue, collidable)
//
// Tiled's "firstgid" for this tileset is 1, so global tile ids in the map
// data are localId + 1 (grass=1, path=2, tree=3, water=4).
export const TILE_SIZE = 16;
export const TILE_COLORS = [
  '#5fae44', // 0: grass
  '#a97c50', // 1: path
  '#1f4d2c', // 2: tree
  '#3a6ea5', // 3: water
];

/**
 * Draws the procedural tileset onto an offscreen canvas and returns a
 * data URI PNG that can be handed to Phaser's image loader.
 */
export function buildTilesetDataURI() {
  const cols = TILE_COLORS.length;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * cols;
  canvas.height = TILE_SIZE;

  const ctx = canvas.getContext('2d');

  TILE_COLORS.forEach((color, i) => {
    const x = i * TILE_SIZE;

    // Base fill.
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, TILE_SIZE, TILE_SIZE);

    // A subtle darker border on every tile so grid lines are visible.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

    // A couple of tiny decorative details per tile type so they read as
    // distinct even before real art exists.
    if (i === 0) {
      // grass: a few small tufts
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(x + 3, 4, 2, 2);
      ctx.fillRect(x + 10, 9, 2, 2);
    } else if (i === 2) {
      // tree: a trunk + a canopy blob
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(x + 6, 10, 4, 5);
      ctx.fillStyle = '#2f7a3f';
      ctx.beginPath();
      ctx.arc(x + 8, 7, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (i === 3) {
      // water: a couple of lighter ripple lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x + 2, 5);
      ctx.lineTo(x + 6, 5);
      ctx.moveTo(x + 9, 11);
      ctx.lineTo(x + 13, 11);
      ctx.stroke();
    }
  });

  return canvas.toDataURL('image/png');
}
