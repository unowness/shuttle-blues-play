import { JAPANESE_DOTS } from './signJapanese.generated.js';
import { CONFIG } from './config.js';
import { wordDef } from './progression.js';
import { sectorById, SECTOR_SIZE } from './sectors.js';
import { TAU, glyphs as glyphList, glyphCount } from './util.js';

// Signs (mechanic 3, part 2). Doc 03 CONFIRMED: leave a sign in space with a
// caption composed from unlocked words; other pilots read it later. A caption
// is stored as word ids, never as text (doc 03: "Store word IDs, not trusted
// client strings"); the text comes from the catalogue when it is drawn.
//
// SX, 2026-09-24: L leaves one where the ship is, slow and in open space; five
// per pilot, and a sixth takes the place of the oldest. The drawing was a road
// sign, a plate on a post; since 2026-10-01 a sign is one of four things left in
// space, which its pilot chooses (SIGN_TYPES; SX, picking from the twelve of
// labs/graphics/sketches/pilot-messages.html: «для табличек мне вот эти 4 очень
// нравятся давай позволим выбирать тип»). While there is no network
// a few signs from other pilots are authored here (doc 08: signs are local
// fixtures in the local prototype). Those are read, never removed.

export const SIGN_WORDS_MAX = 3;
export const SIGN_LIMIT = 5;

// What a sign is, the pilot's choice: a beacon buoy, a message pod, the words spelt in stars, a
// transmitter sending rings. The composer opens on STARS, as every other pilot's sign is drawn (SX, 2026-10-02:
// «когда я оставляю табличку в космосе, то там не звездный вариант отображения а маяк исправь это»; it opened on
// the buoy); T still steps through the rest. A sign from before the types (or a junk one) is STARS too.
export const SIGN_TYPES = Object.freeze([
  Object.freeze({ id: 'buoy', label: 'BUOY' }),
  Object.freeze({ id: 'capsule', label: 'CAPSULE' }),
  Object.freeze({ id: 'stars', label: 'STARS' }),
  Object.freeze({ id: 'ping', label: 'PING' }),
]);
export const DEFAULT_SIGN_TYPE = 'stars';
const signType = (id) => (SIGN_TYPES.some((t) => t.id === id) ? id : DEFAULT_SIGN_TYPE);
export const signTypeLabel = (id) => SIGN_TYPES.find((t) => t.id === signType(id)).label;

// SX's approved 17-character set (2026-10-03), written as notes left by their authors.
// Existing fixture ids and the six retained authors' anchors stay stable. Authored text
// uses the same sign pipeline as player messages; it never enters the unlocked-word pool.
// No timed rotation: the notes remain useful, stable landmarks.
export const FIXTURE_SIGNS = [
  { id: 'sign-j04-hello', sector: 'sector-j04', x: 0.14, y: 0.36, words: ['good', 'news', 'everyone'], author: 'FARNSWORTH', type: 'buoy' },
  { id: 'sign-j04-hole', sector: 'sector-j04', x: 0.6, y: 0.26, words: [], text: "I WASN'T EVEN SUPPOSED TO BE HERE.", author: 'DANTE HICKS', type: 'ping' },
  { id: 'sign-j05-hole', sector: 'sector-j05', x: 0.68, y: 0.14, words: ['future', 'ahead'], author: 'DOC BROWN', type: 'stars' },
  { id: 'sign-j05-home', sector: 'sector-hidden', x: 0.140, y: 0.780, words: ['hello', 'future'], author: 'MARTY MCFLY', type: 'capsule' },
  { id: 'sign-k04-rock', sector: 'sector-k04', x: 0.6, y: 0.26, words: [], text: 'WAS THAT A HIND D?', author: 'SOLID SNAKE', type: 'ping' },
  { id: 'sign-k04-hole', sector: 'sector-k04', x: 0.239, y: 0.18, words: ['try', 'not'], author: 'YODA', type: 'stars' },
  { id: 'sign-k05-yard', sector: 'sector-k05', x: 0.14, y: 0.36, words: [], text: 'STILL WAITING FOR MY CARGO.', author: 'LEELA', type: 'buoy' },
  { id: 'sign-k05-star', sector: 'sector-k05', x: 0.6, y: 0.26, words: [], text: 'JUST TAP IT IN.', author: 'HAPPY GILMORE', type: 'capsule' },
  { id: 'sign-j06-coffee', sector: 'sector-j06', x: 0.68, y: 0.14, words: [], text: 'STILL THINKING ABOUT AIRPLANES.', author: 'RENE MOSIER', type: 'buoy' },
  { id: 'sign-k06-tea', sector: 'sector-k06', x: 0.215, y: 0.18, words: [], text: 'NO ATTACHMENTS.', author: 'BUDDHA', type: 'capsule' },
  { id: 'sign-hidden-spike', sector: 'sector-j05', x: 0.14, y: 0.36, words: [], text: 'EASY COME, EASY GO...', author: 'SPIKE SPIEGEL', type: 'stars' },
  { id: 'sign-j04-willam', sector: 'sector-j04', x: 0.239, y: 0.18, words: [], text: "IT'S NOT A SCHOONER... IT'S A SAILBOAT.", author: 'WILLAM', type: 'stars' },
  { id: 'sign-k04-ghostface', sector: 'sector-k04', x: 0.459, y: 0.18, words: [], text: 'HELLO? WHAT NUMBER IS THIS?', author: 'GHOSTFACE', type: 'stars' },
  { id: 'sign-j05-mantis', sector: 'sector-j05', x: 0.6, y: 0.26, words: [], text: 'YOU LIKE CASTLEVANIA.', author: 'PSYCHO MANTIS', type: 'stars' },
  // The only Japanese inscription, beside WHARF 9 (the anchor-shaped station).
  { id: 'sign-k06-usopp', sector: 'sector-k06', x: 0.459, y: 0.18, words: [], text: '俺の名はキャプテン・ウソップ！', author: 'USOPP', type: 'stars' },
  { id: 'sign-j06-radiator', sector: 'sector-j06', x: 0.14, y: 0.36, words: [], text: 'IN HEAVEN, EVERYTHING IS FINE.', author: 'LADY IN THE RADIATOR', type: 'stars' },
  { id: 'sign-k05-gonzo', sector: 'sector-k05', x: 0.239, y: 0.18, words: [], text: 'AS YOUR ATTORNEY, I SAY WE LEAVE.', author: 'DR. GONZO', type: 'stars' },
];

// What a sign says: its line written whole, or its catalogue words.
export const signText = (s) => s.text ?? captionOf(s.words);

export const fixturesIn = (sectorId) => FIXTURE_SIGNS.filter((s) => s.sector === sectorId);

// The authored signs of a sector as the world lists them (World.signsIn): in its coordinates for a sector of W x H u, each drawn as
// CONFIG.sign.others when that is set. Made once for a sector, its size and that type, and kept: the list and every sign in it frozen,
// so no caller can change what the next is given. A frame asks for a sector's signs several times (the drawing, the sky's covers, the
// locator, each for the sector and its neighbours) and each ask made the filtered list, the mapped list and a copy of every sign.
const FIXED = new Map();
export function fixedSigns(sectorId, W, H) {
  const others = CONFIG.sign.others, kept = FIXED.get(sectorId);
  if (kept !== undefined && kept.W === W && kept.H === H && kept.others === others) return kept.list;
  const list = Object.freeze(fixturesIn(sectorId).map((f) => Object.freeze({
    id: f.id, x: f.x * W, y: f.y * H, words: f.words, text: f.text, author: f.author, type: others ?? f.type, own: false,
  })));
  FIXED.set(sectorId, { W, H, others, list });
  return list;
}

// The words a caption may hold: catalogue ids only, at most three, in order.
export function cleanWords(raw) {
  return (Array.isArray(raw) ? raw : []).filter((id) => typeof id === 'string' && wordDef(id)).slice(0, SIGN_WORDS_MAX);
}

export function captionOf(words) {
  return words.map((id) => wordDef(id)?.text).filter(Boolean).join(' ');
}

// A pilot's own signs, oldest first. An own id is `sign-<serial>`, which no
// authored id can take, and the serial is what "oldest" means.
export class SignBoard {
  constructor() {
    this.placed = [];     // [{ id, sectorId, x, y, words, serial }]
    this.serial = 0;
  }

  inSector(sectorId) {
    return this.placed.filter((s) => s.sectorId === sectorId);
  }

  get(id) {
    return this.placed.find((s) => s.id === id) || null;
  }

  // Adds a sign. A full board makes room by taking down the oldest one, which
  // is returned so the pilot can be told which it was and where.
  add({ sectorId, x, y, words, type = DEFAULT_SIGN_TYPE }) {
    this.serial += 1;
    const sign = { id: `sign-${this.serial}`, sectorId, x, y, words: [...words], type: signType(type), serial: this.serial };
    let replaced = null;
    if (this.placed.length >= SIGN_LIMIT) {
      const oldest = this.placed.reduce((a, b) => (b.serial < a.serial ? b : a));
      replaced = this.remove(oldest.id);
    }
    this.placed.push(sign);
    return { sign, replaced };
  }

  remove(id) {
    const i = this.placed.findIndex((s) => s.id === id);
    return i < 0 ? null : this.placed.splice(i, 1)[0];
  }

  toJSON() {
    return {
      serial: this.serial,
      placed: this.placed.map((s) => ({ id: s.id, sectorId: s.sectorId, x: s.x, y: s.y, words: [...s.words], type: s.type })),
    };
  }

  // A save is untrusted input. A sign survives only as an own id in a known
  // sector, at a finite place inside it, with at least one catalogue word;
  // words beyond three are cut. More than the limit keeps the newest ones.
  static fromJSON(raw) {
    const b = new SignBoard();
    if (!raw || typeof raw !== 'object') return b;
    const seen = new Set();
    for (const s of Array.isArray(raw.placed) ? raw.placed : []) {
      if (!s || typeof s.id !== 'string') continue;
      const m = /^sign-(\d+)$/.exec(s.id);
      if (!m || seen.has(s.id) || !sectorById(s.sectorId)) continue;
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
      if (s.x < 0 || s.y < 0 || s.x > SECTOR_SIZE.width || s.y > SECTOR_SIZE.height) continue;
      const words = cleanWords(s.words);
      if (!words.length) continue;
      seen.add(s.id);
      b.placed.push({ id: s.id, sectorId: s.sectorId, x: s.x, y: s.y, words, type: signType(s.type), serial: Number(m[1]) });
    }
    b.placed.sort((p, q) => p.serial - q.serial);
    if (b.placed.length > SIGN_LIMIT) b.placed = b.placed.slice(-SIGN_LIMIT);
    // Resume after the highest id ever issued, so a new sign never takes the
    // identity of one that is still standing.
    const issued = b.placed.reduce((n, s) => Math.max(n, s.serial), 0);
    b.serial = Math.max(Number.isInteger(raw.serial) && raw.serial > 0 ? raw.serial : 0, issued);
    return b;
  }
}

// ---------------------------------------------------------------- drawing ---

// The four drawings, from the sheet (labs/graphics/sketches/pilot-messages.js, A B D E), with SX's
// corrections: on the buoy and the transmitter the two lines stand centred on the lamp and on the
// transmitter, a half row higher («поставь тексты примерно на уровень красных блоков то есть
// повыше»); the pod has no nozzles («у знака удали стрелочки»); the author's name is quieter than
// the caption everywhere («сделай везде подпись никнейма чуть темнее», CONFIG.sign.author).
//
// signGlyphs lists what a sign draws, relative to the place it stands (its anchor), in px:
// { c, x, y, role, a, ang, ring }. `role` is a CONFIG.sign ink (frame, hatch, text, seal, author);
// `ring` marks the transmitter's rings, which the sky need not leave out. `t` is the world's
// time, for the lamp, the rocking, the twinkle and the rings; `preview` keeps the rings small
// (the composer's window).
const count = (s) => glyphCount(s);
const hash = (a, b = 0, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const wrapTime = (t, period) => ((t % period) + period) % period;

// The glyphs of a sign being listed are objects kept from call to call: a sign is listed every frame it is in view (drawSign) and again
// for the box the sky keeps out of (signCover), and each listing made an object for every glyph, a copy of each for its line, and the
// arrays between: near YARD 3, with a buoy and a pod in view, 110 KB of garbage a frame (2026-10-09). The list `listGlyphs` returns is
// valid until the next call; signGlyphs hands out copies.
const pool = [];
let inUse = 0;
function add(out, c, x, y, role, a, ang, ring) {
  const g = pool[inUse] ?? (pool[inUse] = { c: '', x: 0, y: 0, role: '', a: undefined, ang: undefined, ring: false });
  inUse++;
  g.c = c; g.x = x; g.y = y; g.role = role; g.a = a; g.ang = ang; g.ring = ring === true;
  out.push(g);
}

// A 3 x 5 dot font for STARS: five rows of three, '#' a star.
const DOTS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], '-': ['...', '...', '###', '...', '...'],
  // Punctuation in the authored notes.
  "'": ['.#.', '.#.', '...', '...', '...'],
  '?': ['##.', '..#', '.#.', '...', '.#.'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'], '.': ['...', '...', '...', '...', '.#.'],
};
const dotRows = (c) => DOTS[c] || ['...', '...', '...', '...', '...'];

const DRAW = {
  // A beacon buoy: an aerial, a lamp on a crossbar, a hull with the family's diamond (the anchor), a
  // tether. The lamp blinks once a word and that word lights while the others wait; then all.
  buoy(out, cw, ch, text, author, t) {
    const words = text.split(' ');
    const bx = -(count(text) + 5 - 1) * cw / 2 + cw;
    const step = 0.55, cycle = words.length * step + 1.8, u = wrapTime(t, cycle);
    const lit = u < words.length * step ? Math.floor(u / step) : -1;
    const flash = lit >= 0 && u % step < 0.2;
    const body = [' ╷ ', flash ? '─●─' : '─○─', '╭┴╮', '│◇│', '╰┬╯', ' ┊ '];
    const role = (c) => (c === '●' ? 'text' : c === '○' || c === '┊' ? 'hatch' : c === '◇' ? 'seal' : 'frame');
    body.forEach((row, j) => glyphList(row).forEach((c, i) => add(out, c, bx + (i - 1) * cw, (j - 3) * ch, role(c))));
    // The two lines centred on the lamp, which stands two rows over the anchor.
    let wi = 0;
    glyphList(text).forEach((c, i) => {
      if (c === ' ') { wi += 1; return; }
      add(out, c, bx + (3 + i) * cw, -2.5 * ch, lit < 0 || wi === lit ? 'text' : 'frame');
    });
    glyphList(author || '').forEach((c, i) => add(out, c, bx + (3 + i) * cw, -1.5 * ch, 'author'));
  },
  // A message pod adrift, the caption printed along its side, a porthole that blinks; it rocks a
  // few degrees and bobs. The author stands under it, as a place name would.
  capsule(out, cw, ch, text, author, t) {
    const inner = ` ◉ ${text} `, L = count(inner);
    const rows = ['╭' + '─'.repeat(L) + '╮', '│' + inner + '│', '╰' + '─'.repeat(L) + '╯'];
    const w = L + 2, ang = 0.035 * Math.sin(t * 0.7), dy = 1.5 * Math.sin(t * 0.9);
    const cos = Math.cos(ang), sin = Math.sin(ang), blink = wrapTime(t, 1.6) < 1.1;
    rows.forEach((row, j) => glyphList(row).forEach((c, i) => {
      const ox = (i - (w - 1) / 2) * cw, oy = (j - 1) * ch;
      let role = 'text', glyph = c;
      if ('╭╮╰╯─│'.includes(c)) role = 'frame';
      else if (c === '◉') { glyph = blink ? '◉' : '○'; role = 'seal'; }
      add(out, glyph, ox * cos - oy * sin, dy + ox * sin + oy * cos, role, undefined, ang);
    }));
    glyphList(author || '').forEach((c, i) => add(out, c, (i - (count(author) - 1) / 2) * cw, 2.2 * ch, 'author'));
  },
  // The words spelt in stars, a 3 x 5 dot letter on a 5 px pitch, one star in a dozen a brighter
  // cross; every star twinkles at its own rate, never below half, so the words hold.
  stars(out, cw, ch, text, author, t) {
    const space = 15;
    const letters = glyphList(text).map((c) => {
      const japanese = JAPANESE_DOTS[c];
      const rows = japanese || dotRows(c);
      const pitch = japanese ? 2 : 5;
      const width = (rows[0].length - 1) * pitch;
      return { c, rows, pitch, width, advance: c === ' ' ? space : width + 10 };
    });
    const last = letters.at(-1);
    const width = letters.reduce((w, l) => w + l.advance, 0) - (last ? last.advance - last.width : 0);
    const height = Math.max(20, ...letters.map((l) => (l.rows.length - 1) * l.pitch));
    let lx = -width / 2;
    letters.forEach(({ c, rows, pitch, advance }, li) => {
      if (c !== ' ') {
        // Centre the denser Japanese glyphs on the same line as the Latin dots.
        const top = -1.5 * ch + 10 - (rows.length - 1) * pitch / 2;
        rows.forEach((row, rr) => glyphList(row).forEach((d, cc) => {
          if (d !== '#') return;
          const h = hash(li, rr * rows[0].length + cc, 5);
          const a = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * (1.4 + 2 * h) + h * TAU));
          // Crosses would obscure the denser Japanese strokes; use stars of one size.
          add(out, pitch === 5 && h > 0.92 ? '+' : '·', lx + cc * pitch, top + rr * pitch, 'text', a);
        }));
      }
      lx += advance;
    });
    // Keep the accepted gap under Latin captions, and the same gap under taller glyphs.
    glyphList(author || '').forEach((c, i) => add(out, c, (i - (count(author) - 1) / 2) * cw, 1.4 * ch + (height - 20) / 2, 'author'));
  },
  // A transmitter on a mast (the diamond, the anchor) sends rings of dots out through space; the
  // two lines stand beside it, centred on it, and the rings pass behind them.
  ping(out, cw, ch, text, author, t, preview) {
    const n = count(text), ex = -(n + 3 - 1) * cw / 2, tx = ex + 3 * cw;
    const box = { x0: tx - cw / 2 - 3, x1: tx + (Math.max(n, count(author || '')) - 0.5) * cw + 3, y0: -ch - 3, y1: ch + 3 };
    const reach = preview ? 22 : 46;
    for (const k of [0, 1]) {
      const u = wrapTime(t / 2.4 + k / 2, 1), R = 10 + reach * u, a = 0.9 * (1 - u);
      const m = Math.max(10, Math.round(TAU * R / 7));
      for (let i = 0; i < m; i++) {
        const px = ex + R * Math.cos((i / m) * TAU), py = R * Math.sin((i / m) * TAU);
        if (px > box.x0 && px < box.x1 && py > box.y0 && py < box.y1) continue;
        add(out, '·', px, py, 'seal', a, undefined, true);
      }
    }
    add(out, '◇', ex, 0, 'seal');
    add(out, '┊', ex, ch, 'hatch');
    glyphList(text).forEach((c, i) => add(out, c, tx + i * cw, -0.5 * ch, 'text'));
    glyphList(author || '').forEach((c, i) => add(out, c, tx + i * cw, 0.5 * ch, 'author'));
  },
};

// SX's four explicit line breaks. Logical captions stay intact for the map/editor;
// only their STARS presentation wraps, with one centred signature below both lines.
const STAR_CAPTION_LINES = new Map([
  ["I WASN'T EVEN SUPPOSED", 'TO BE HERE.'],
  ["IT'S NOT A SCHOONER...", "IT'S A SAILBOAT."],
  ['HELLO?', 'WHAT NUMBER IS THIS?'],
  ['AS YOUR ATTORNEY,', 'I SAY WE LEAVE.'],
].map((lines) => [lines.join(' '), lines]));

const LINE = [], LIST = [];
function listGlyphs(type, cw, ch, text, author, t, preview) {
  const kind = signType(type);
  const lines = (kind === 'stars' && STAR_CAPTION_LINES.get(text)) || null;
  inUse = 0; LIST.length = 0;
  for (let index = 0, n = lines ? lines.length : 1; index < n; index++) {
    LINE.length = 0;
    DRAW[kind](LINE, cw, ch, lines ? lines[index] : text, index === n - 1 ? author : null, t, preview);
    const dy = (index - (n - 1) / 2) * 35;
    for (const g of LINE) { g.y += dy; LIST.push(g); }
  }
  let kept = 0;
  for (const g of LIST) if (g.c !== ' ' && (g.a ?? 1) > 0.02) LIST[kept++] = g;
  LIST.length = kept;
  return LIST;
}
// What a sign draws, as objects of their own (a caller may keep them past the next listing).
export function signGlyphs(type, cw, ch, text, author = null, t = 0, { preview = false } = {}) {
  return listGlyphs(type, cw, ch, text, author, t, preview).map((g) => ({ ...g }));
}

// Draws a sign standing at (sx, sy) through `put(ch, x, y, color, alpha, angle)`: the world queues
// its glyphs, a screen drawn over the world paints them at once.
export function drawSign(put, r, sx, sy, text, author = null, colors = CONFIG.sign, type = DEFAULT_SIGN_TYPE, t = 0, options = {}) {
  for (const g of listGlyphs(type, r.cellW, r.cellH, text, author, t, options.preview)) {
    put(g.c, sx + g.x, sy + g.y, colors[g.role] ?? colors.text, g.a ?? 1, g.ang ?? 0);
  }
}

// How far a sign's drawing reaches at rest, rings left out, in px from its anchor: { x0, x1, y0, y1 }. It depends on the sign's type,
// caption and author and on the cell, and on nothing the world does, so it is worked out once for each (the box a menu stands clear
// of and the cover the sky keeps out of ask it, and the cover asked about every sign in view every frame). The few signs of a sector
// are what it holds; the composer's draft is a new caption at each key, so it lets go of all when it holds many.
const resting = new Map();
const RESTING_MOST = 64;
function restOf(type, text, author, cw, ch) {
  let list = resting.get(text);
  if (list === undefined) {
    if (resting.size >= RESTING_MOST) resting.clear();
    resting.set(text, list = []);
  }
  for (const e of list) if (e.type === type && e.author === author && e.cw === cw && e.ch === ch) return e;
  const e = { type, author, cw, ch, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const g of listGlyphs(type, cw, ch, text, author, 0, false)) {
    if (g.ring) continue;
    if (g.x < e.x0) e.x0 = g.x;
    if (g.x > e.x1) e.x1 = g.x;
    if (g.y < e.y0) e.y0 = g.y;
    if (g.y > e.y1) e.y1 = g.y;
  }
  list.push(e);
  return e;
}

// The box a sign's drawing takes, in world cells, around its anchor: for a menu to stand clear of
// it (World.candidates). Measured at rest on the world's nominal cell (0.62 x 1 em), rings left out.
export function signBox(type, text, author = null) {
  const ch = CONFIG.render.fontSize * CONFIG.render.lineRatio, cw = ch * 0.62;
  const e = restOf(type, text, author, cw, ch);
  const x0 = e.x0 / cw, x1 = e.x1 / cw, y0 = e.y0 / ch, y1 = e.y1 / ch;
  return { width: Math.ceil(x1 - x0 + 1), height: Math.ceil(y1 - y0 + 1), dx: (x0 + x1) / 2, dy: (y0 + y1) / 2, right: x1 };
}

// Screen rectangles a sign covers, for the sky to leave out: a star behind the words would sit
// inside the letters. Its drawing's box at rest, rings left out, half a cell of margin.
export function signCoverBox(r, sx, sy, text, author = null, type = DEFAULT_SIGN_TYPE) {
  const cw = r.cellW, ch = r.cellH, e = restOf(type, text, author, cw, ch);
  const x0 = e.x0 - cw, x1 = e.x1 + cw, y0 = e.y0 - ch, y1 = e.y1 + ch;
  return { x: sx + x0, y: sy + y0, w: x1 - x0, h: y1 - y0 };
}
export function signCover(r, sx, sy, text, author = null, type = DEFAULT_SIGN_TYPE) {
  return [signCoverBox(r, sx, sy, text, author, type)];
}
