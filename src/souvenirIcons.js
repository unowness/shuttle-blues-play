// Souvenir icons (SX, 2026-09-29), drawn to the rules worked out on
// labs/graphics/sketches/souvenirs.html (round three): a 21 x 13 cell safe zone
// (13 x 13 em, square, with a centre column and a centre row), five glyphs only
// (full and half blocks), even steps, no orphan cells, symmetric on the centre
// axes, one visual weight. Every drawing fills the same zone, centred by
// construction, so a tile only has to centre the zone.
//
// Drawn as exact rectangles, never as font glyphs: at icon size a font's block
// glyphs leave seams and blur. Cell sizes are whole, even device pixels, so every
// half block lands on the pixel grid.

export const ICON_ZONE = Object.freeze({ cols: 21, rows: 13 });

export const SOUVENIR_ICONS = {
  'gamepad': [
    '          █          ',
    '          █          ',
    '          █          ',
    '   ▄█████████████▄   ',
    '  █████████████████  ',
    ' ████ █████████  ███ ',
    ' ██     ████████████ ',
    ' ████ ███████  █████ ',
    ' ███████████████████ ',
    ' ███████▀▀▀▀▀███████ ',
    ' ██████       ██████ ',
    ' ▀████▀       ▀████▀ ',
    '  ▀▀▀▀         ▀▀▀▀  '
  ],
  'basketball': [
    '      ▄▄▄▄ ▄▄▄▄      ',
    '     █████ █████     ',
    '   ██ ████ ████ ██   ',
    '  ████ ███ ███ ████  ',
    ' ▐█████ ██ ██ █████▌ ',
    ' ██████ ██ ██ ██████ ',
    '                     ',
    ' ██████ ██ ██ ██████ ',
    ' ▐█████ ██ ██ █████▌ ',
    '  ████ ███ ███ ████  ',
    '   ██ ████ ████ ██   ',
    '     █████ █████     ',
    '      ▀▀▀▀ ▀▀▀▀      '
  ],
  'figurine': [
    '       ▐     ▌       ',
    '       ███████       ',
    '      █████████      ',
    '      ██▄▄▄▄▄██      ',
    '      █████████      ',
    ' ███████████████████ ',
    ' ███ ███████████ ███ ',
    ' ███ ███████████ ███ ',
    ' ███ ███████████ ███ ',
    ' ▀▀▀ ███████████ ▀▀▀ ',
    '      ████ ████      ',
    '      ████ ████      ',
    '     █████ █████     '
  ],
  'disc': [
    '                     ',
    '      ▄▄█████▄▄      ',
    '    ▄███████████▄    ',
    '   █████▀▀▀▀▀█████   ',
    '  █████ ▄▄▄▄▄ █████  ',
    ' ▐████ ███████ ████▌ ',
    ' ▐████ ██▌ ▐██ ████▌ ',
    ' ▐████ ███████ ████▌ ',
    '  █████ ▀▀▀▀▀ █████  ',
    '   █████▄▄▄▄▄█████   ',
    '    ▀███████████▀    ',
    '      ▀▀█████▀▀      ',
    '                     ',
  ]
};

// The cell of an icon, in CSS pixels, for a wanted cell height: both sides a
// whole, even number of device pixels (so halves stay whole), about 0.62 wide.
export function iconCell(height, dpr = 1) {
  const h = Math.max(2, 2 * Math.round((height * dpr) / 2));
  const w = Math.max(2, 2 * Math.round((h * 0.62) / 2));
  return { w: w / dpr, h: h / dpr };
}

// The icon's zone at a cell size, in CSS pixels.
export function iconSize(cell) {
  return { w: ICON_ZONE.cols * cell.w, h: ICON_ZONE.rows * cell.h };
}


// The largest cell whose zone fits a box of w x h CSS px.
export function iconCellFitting(w, h, dpr = 1) {
  let height = Math.min(h / ICON_ZONE.rows, w / (ICON_ZONE.cols * 0.62));
  let cell = iconCell(height, dpr);
  while (height > 1 && (cell.h * ICON_ZONE.rows > h + 1e-6 || cell.w * ICON_ZONE.cols > w + 1e-6)) {
    height -= 0.25;
    cell = iconCell(height, dpr);
  }
  return cell;
}

// Draws `rows` with its zone's top left at (x, y), snapped to the device pixel
// grid, one rectangle per inked glyph part. Work is in device pixels: a half
// block takes the whole pixels on its own side of its cell's middle, so with an
// odd cell the middle pixel stays empty for both halves and a left half and a
// right half mirror each other exactly. An even cell splits evenly, as before.
export function drawBlockIcon(r, rows, x, y, cell, ink, alpha = 1) {
  if (!rows) return;
  const dpr = r.dpr || 1;
  const cw = Math.round(cell.w * dpr), ch = Math.round(cell.h * dpr);
  const x0 = Math.round(x * dpr), y0 = Math.round(y * dpr);
  const lo = n => Math.floor(n / 2), hi = n => Math.ceil(n / 2);
  const span = {
    '█': [0, cw, 0, ch], '▀': [0, cw, 0, lo(ch)], '▄': [0, cw, hi(ch), ch],
    '▌': [0, lo(cw), 0, ch], '▐': [hi(cw), cw, 0, ch],
  };
  rows.forEach((row, j) => Array.from(row).forEach((glyph, i) => {
    const s = span[glyph];
    if (!s) return;
    const px = x0 + i * cw, py = y0 + j * ch;
    r.fill((px + s[0]) / dpr, (py + s[2]) / dpr, (s[1] - s[0]) / dpr, (s[3] - s[2]) / dpr, ink, alpha);
  }));
}
