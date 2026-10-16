// The browser's preferences, in one place (PLAN C3, 2026-10-03; code review 2026-10-03, architecture finding 15: about twelve
// localStorage keys, each written by hand with a try/catch of its own in eight modules, two of them (the seen marks and the
// HUD shadow in labs/graphics/main.js) straight into the global localStorage while the rest took a backend).
//
// A preference is a choice of this browser, not progress: it has a key of its own and is never part of the save (src/storage.js,
// the key `spaser.local.v1`). Each is described once, in PREFS below (its key, where it is kept, what it is when nothing usable is
// kept, the stored shape), and has its reader and writer here. The readers and writers take the store LAST, the way the save's
// Storage takes its backend: the page hands in its `saveBackend` (the lab's prefixed one on a review link, so a test never touches
// the pilot's own settings, labs/graphics/storage.js), a check hands in a memory backend, and a store left out (undefined) means
// this browser's own. `null` is "no storage" and stays that: it never falls back to the global one (checks/graphics-lab.mjs).
//
// A store that is missing, revoked or full is "nothing kept" and "not written", never an error; a kept value that is junk reads as
// the default. The modules that own a preference's meaning (src/display.js, src/audio.js, labs/graphics/volume-panel.js ...) keep
// their own readers and writers by name and call these, passing the one thing only they know (the list of valid values).
//
// KEY NAMES AND SHAPES NEVER CHANGE: a renamed key starts every browser over (the display's v1 to v2 did it on purpose, 2026-10-02,
// and says so in src/display.js). checks/prefs.mjs pins each name and the exact text each writer stores.

// `area`: 'local' is localStorage (kept across visits), 'session' is sessionStorage (this tab only). `fallback`: what a reader gives
// when nothing usable is kept (null: the owner's own start, which needs a list only the owner has; for the booleans the reader's
// own test, `!== false` and `=== true`, is this value, said here so the default is not hunted for in a function).
export const PREFS = Object.freeze({
  display:    Object.freeze({ key: 'spaser.display.v2',   area: 'local',   fallback: 'crt',  shape: '{"mode":"crt"|"lcd"|"vhs"|"flat"}' }),
  sound:      Object.freeze({ key: 'spaser.sound.v1',     area: 'local',   fallback: true,   shape: '{"on":boolean}' }),
  volume:     Object.freeze({ key: 'spaser.volume.v1',    area: 'local',   fallback: null,   shape: '{"master":0..1,"music":0..1,"ui":0..1,"space":0..1}' }),
  // `steering` (src/steering.js, GAMEPLAY's STEERING, 2026-10-06): how the keys steer, TANK unless SCREEN is kept.
  gameplay:   Object.freeze({ key: 'spaser.gameplay.v1',  area: 'local',   fallback: null,   shape: '{"mouseReach":1.0..1.9,"mouseRight":"fire"|"brake","lean":{"reaction","layers","amount"},"steering"?:"tank"|"screen","controls"?:"K"|"M" (the mode; "auto" and "MK" read as "K" and are rewritten so, 2026-10-07),"driftPro"?:true|false,"greeting"?:"wave"|"notch"}' }),
  // The interface shadow's style (J, the pause's UI SHADOW; labs/graphics/sketches/hudShadow.js) until 2026-10-06, when only the text kept a shadow, one
  // not chosen (src/textShadow.js): no game code reads it now; kept so every key name the game has written is in one place.
  hudShadow:  Object.freeze({ key: 'spaser.hudshadow.v1', area: 'local',   fallback: null,   shape: 'the shadow style\'s code as plain text, e.g. D4 (no JSON)' }),
  hudPlace:   Object.freeze({ key: 'spaser.hudplace.v1',  area: 'local',   fallback: null,   shape: '{"column":{"x","y"},"quests":..,"header":..,"shelf":..,"notice":..}' }),
  // The layout editor's places since chat P (2026-10-04, labs/graphics/hud-place.js): v1's offsets read once into it; v1 is still
  // written beside it, so an older build finds its places. `ref` the screen it was laid out on, or null.
  // `side` (2026-10-08, labs/graphics/hud-sides.js): the locator's side the offsets were made for, "left" or "right"; a record without it
  // was made before S3 SWAP put the quests and the shelf in new places (labs/graphics/hud-place.js createHudPlace).
  hudLayout:  Object.freeze({ key: 'spaser.hudplace.v2',  area: 'local',   fallback: null,   shape: '{"version":2,"ref":{"w","h"}|null,"side"?:"left"|"right","modules":{"column":{"x","y","look"?},...}}' }),
  // Which side the locator stands on, the quests and the radio on the other (labs/graphics/hud-sides.js, the pause's SIDES; SX, 2026-10-08,
  // S3 SWAP with a mirror switch): the locator on the left unless "right" is kept.
  hudSide:    Object.freeze({ key: 'spaser.hudside.v1',   area: 'local',   fallback: 'left', shape: '{"locator":"left"|"right"}' }),
  // The locator's legend (M): closed unless kept open since 2026-10-05, when it took the quests' and the radio's place while it shows
  // (since 2026-10-08 the souvenir shelf's, under the locator: labs/graphics/locator.js legendCovers): open by default, it would hide
  // a new pilot's shelf.
  legend:     Object.freeze({ key: 'spaser.legend.v1',    area: 'local',   fallback: true,   shape: '{"hidden":boolean}' }),
  // The radio under the quests hidden to its row (T; labs/graphics/radio.js, SX's W1 POCKET, 2026-10-05): shown unless kept hidden.
  radio:      Object.freeze({ key: 'spaser.radio.v1',     area: 'local',   fallback: false,  shape: '{"hidden":boolean}' }),
  // The ruins' tracker on the deck's left shoulder (B; labs/graphics/tracker.js, SX, 2026-10-08: «позволил бы скрывать как и легенду»):
  // its rows shown unless kept hidden (its button stays).
  tracker:    Object.freeze({ key: 'spaser.tracker.v1',   area: 'local',   fallback: false,  shape: '{"hidden":boolean}' }),
  seen:      Object.freeze({ key: 'spaser.seen.v1',      area: 'local',   fallback: null,   shape: '{"looks":[id],"paints":[id],"cursors":[id],"widgets"?:[id]}' }),
  // The photo frame's last picture (chat P, 2026-10-04, labs/graphics/photo-frame.js): a keepsake of this browser, a small JPEG.
  photo:      Object.freeze({ key: 'spaser.photo.v1',     area: 'local',   fallback: null,   shape: '{"label":text,"image":"data:image/jpeg;base64,..."}' }),
  // The display's first key (2026-09-30, a tube on or off): the game stopped reading it when the screens came (src/display.js).
  // The first screen's on/off (src/crt.js, until the screens on V took src/display.js's v2): no game code reads it now; kept so
  // every key name the game has written is in one place.
  crt:        Object.freeze({ key: 'spaser.display.v1',   area: 'local',   fallback: false,  shape: '{"crt":boolean}' }),
  // A new pilot's opening chapter (src/opening.js, chat N1, 2026-10-04) skipped in this browser: the start as it was before the chapter.
  // No screen writes it yet (a SKIP INTRO is the title's, later); the golden master's scenarios keep it so they play what they always
  // did (tools/golden.mjs). Read once, at a new pilot's start; a save never holds it.
  opening:    Object.freeze({ key: 'spaser.opening.v1',   area: 'local',   fallback: null,   shape: '"skip" as plain text (no JSON)' }),
  // Which drawing the pilot's STANDARD wears (src/shipLooks.js, the pause's SHIP row and the hangar; SX, 2026-10-07): a look of this
  // browser, as the display is, never the save's. MODERN (SX's ship of 2026-10-16) unless another is kept; a look the game no longer has
  // (FORCE, ONE-HAND, CARTRIDGE and OWL went on 2026-10-08; CLASSIC, renamed CLIPPER, THUNDER, EDGES and BLACKBIRD on 2026-10-16) reads as
  // MODERN, the new default for everyone once.
  ship:       Object.freeze({ key: 'spaser.ship.v1',      area: 'local',   fallback: 'modern', shape: '{"look":"modern"|"clipper"|"scooty"}' }),
  // The cockpit's smoke, the view's sides while the hull was in smoke (GRAPHICS, COCKPIT SMOKE; SX, 2026-10-07): the smoke cut on 2026-10-15
  // (SX: «затемнение кабины при дыме ... вырежи»); its key kept so no later preference takes its name, read by nothing.
  smoke:      Object.freeze({ key: 'spaser.smoke.v1',     area: 'local',   fallback: true,      shape: '{"cockpit":true|false}' }),
  // The frames and rules of the windows in the Swiss manner (src/frames.js, the pause's GRAPHICS > FRAMES; SX, 2026-10-09): neutral grays
  // unless TINTED is kept, which tints them slightly toward the worn look of the interface.
  frames:     Object.freeze({ key: 'spaser.frames.v1',    area: 'local',   fallback: 'gray',  shape: '{"style":"gray"|"tinted"}' }),
  // Which interface the flight wears (labs/graphics/hud-modern.js, the pause's GRAPHICS > INTERFACE; SX, 2026-10-16: «переключение
  // интерфейса Modern ... по умолчанию. Legacy — это старый интерфейс»): MODERN unless LEGACY is kept.
  interface:  Object.freeze({ key: 'spaser.interface.v1', area: 'local',  fallback: 'modern', shape: '{"style":"modern"|"legacy"}' }),
  // The modern interface's locator, square or round (GRAPHICS > MAP; SX, the same day: «переключать карту с круглой на квадратную. По
  // умолчанию квадратную»).
  mapShape:   Object.freeze({ key: 'spaser.mapshape.v1',  area: 'local',   fallback: 'square', shape: '{"shape":"square"|"round"}' }),
});

// The store a preference lives in when none is handed in: this browser's. A browser that blocks site data throws on the global
// itself, so it is read inside a try and reads as "none".
function defaultStore(name) {
  try { return (PREFS[name].area === 'session' ? globalThis.sessionStorage : globalThis.localStorage) ?? null; } catch { return null; }
}

// ------------------------------------------------------------------------------------------------------------------ the two forms

// The text kept for a preference, or null: nothing kept, or a store that cannot be read.
export function readText(name, store = defaultStore(name)) {
  try {
    const text = store.getItem(PREFS[name].key);
    return typeof text === 'string' ? text : null;
  } catch { return null; }
}
// Whether the text was written (false: no store, revoked, full).
export function writeText(name, text, store = defaultStore(name)) {
  try { store.setItem(PREFS[name].key, text); return true; } catch { return false; }
}
// The value kept as JSON, or null: nothing kept, not readable, not JSON. What the value must be is the reader's to check.
export function readJSON(name, store) {
  const text = readText(name, store);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
export function writeJSON(name, value, store) {
  try { return writeText(name, JSON.stringify(value), store); } catch { return false; }
}

// ------------------------------------------------------------------------------------------------------------- one pair each

// The display's screen (src/display.js): one of `modes`, else the base.
export const readDisplay = (modes, store) => { const kept = readJSON('display', store); return modes.includes(kept?.mode) ? kept.mode : PREFS.display.fallback; };
export const writeDisplay = (mode, store) => writeJSON('display', { mode }, store);

// Sound on or off (O): on unless it was kept off.
export const readSound = (store) => ({ on: readJSON('sound', store)?.on !== false });
export const writeSound = (on, store) => writeJSON('sound', { on: !!on }, store);

// The ship's look (src/shipLooks.js): one of `ids`, else MODERN.
export const readShipLook = (ids, store) => { const kept = readJSON('ship', store); return ids.includes(kept?.look) ? kept.look : PREFS.ship.fallback; };
export const writeShipLook = (look, store) => writeJSON('ship', { look }, store);


// The windows' frames (PREFS.frames): one of `styles`, else GRAY.
export const readFrames = (styles, store) => { const kept = readJSON('frames', store); return styles.includes(kept?.style) ? kept.style : PREFS.frames.fallback; };
export const writeFrames = (style, store) => writeJSON('frames', { style }, store);

// The interface (PREFS.interface): one of `styles`, else MODERN; the modern locator's shape (PREFS.mapShape): one of `shapes`, else SQUARE.
export const readInterface = (styles, store) => { const kept = readJSON('interface', store); return styles.includes(kept?.style) ? kept.style : PREFS.interface.fallback; };
export const writeInterface = (style, store) => writeJSON('interface', { style }, store);
export const readMapShape = (shapes, store) => { const kept = readJSON('mapShape', store); return shapes.includes(kept?.shape) ? kept.shape : PREFS.mapShape.fallback; };
export const writeMapShape = (shape, store) => writeJSON('mapShape', { shape }, store);

// The locator's side (PREFS.hudSide): one of `ids`, else the left.
export const readHudSide = (ids, store) => { const kept = readJSON('hudSide', store); return ids.includes(kept?.locator) ? kept.locator : PREFS.hudSide.fallback; };
export const writeHudSide = (side, store) => writeJSON('hudSide', { locator: side }, store);

// The locator's legend (M): hidden unless kept shown (PREFS.legend).
export const readLegend = (store) => readJSON('legend', store)?.hidden !== false;
export const writeLegend = (hidden, store) => writeJSON('legend', { hidden: !!hidden }, store);

// The radio under the quests (T): hidden only if kept hidden.
export const readRadio = (store) => readJSON('radio', store)?.hidden === true;
export const writeRadio = (hidden, store) => writeJSON('radio', { hidden: !!hidden }, store);

// The ruins' tracker (B): hidden only if kept hidden.
export const readTracker = (store) => readJSON('tracker', store)?.hidden === true;
export const writeTracker = (hidden, store) => writeJSON('tracker', { hidden: !!hidden }, store);

// The opening chapter skipped in this browser (PREFS.opening): 'skip', else null.
export const readOpening = (store) => (readText('opening', store) === 'skip' ? 'skip' : null);

// The display's first key, a tube on or off (src/crt.js): off unless kept on.
export const readCrt = (store) => readJSON('crt', store)?.crt === true;
export const writeCrt = (on, store) => writeJSON('crt', { crt: !!on }, store);

// The pause's GAMEPLAY settings (labs/graphics/gameplay-settings.js): one object under one key, each setting merged in so that
// writing one does not drop the others. Anything but a plain object kept there reads as none.
export function readGameplay(store) {
  const kept = readJSON('gameplay', store);
  return kept && typeof kept === 'object' && !Array.isArray(kept) ? kept : {};
}
export const writeGameplay = (patch, store) => writeJSON('gameplay', { ...readGameplay(store), ...patch }, store);

// The four volumes (labs/graphics/volume-panel.js): those of `ids` that are kept as a number, held to 0..1; the rest are left out
// (their defaults, CONFIG.sound.volumes).
export function readVolumes(ids, store) {
  const kept = readJSON('volume', store), out = {};
  for (const id of ids) if (Number.isFinite(kept?.[id])) out[id] = Math.max(0, Math.min(1, kept[id]));
  return out;
}
export const writeVolumes = (volumes, store) => writeJSON('volume', volumes, store);

// Where the interface's groups were put (labs/graphics/hud-place.js): for each of `ids` kept with a finite x and y, that place in
// whole pixels; the rest are left out (the group at its own place).
export function readHudPlace(ids, store) {
  const kept = readJSON('hudPlace', store), out = {};
  for (const id of ids) {
    const o = kept?.[id];
    if (o && Number.isFinite(o.x) && Number.isFinite(o.y)) out[id] = { x: Math.round(o.x), y: Math.round(o.y) };
  }
  return out;
}
export const writeHudPlace = (offsets, store) => writeJSON('hudPlace', offsets, store);
// The v2 places (PREFS.hudLayout): null when nothing usable is kept (the reader then takes v1's once); else each of `ids` kept with a
// finite x and y in whole px (the rest at their own place), the screen it was laid out on, and the locator's side it was made for (null: a record from before the sides).
export function readHudLayout(ids, store) {
  const kept = readJSON('hudLayout', store);
  if (!kept || kept.version !== 2 || !kept.modules || typeof kept.modules !== 'object' || Array.isArray(kept.modules)) return null;
  const offsets = {}, looks = {};
  for (const id of ids) {
    const o = kept.modules[id];
    if (o && Number.isFinite(o.x) && Number.isFinite(o.y)) offsets[id] = { x: Math.round(o.x), y: Math.round(o.y) };
    if (o && typeof o.look === 'string') looks[id] = o.look;          // (whether it is earned is the reader's: src/widgets.js wornLook)
  }
  const ref = kept.ref && Number.isFinite(kept.ref.w) && Number.isFinite(kept.ref.h) ? { w: kept.ref.w, h: kept.ref.h } : null;
  return { offsets, looks, ref, side: kept.side === 'right' || kept.side === 'left' ? kept.side : null };
}
export const writeHudLayout = (layout, store) => writeJSON('hudLayout', layout, store);

// The photo frame's last picture (PREFS.photo): { label, image } or null (nothing kept, junk, not a JPEG's data URL).
export function readPhoto(store) {
  const kept = readJSON('photo', store);
  return kept && typeof kept.label === 'string' && typeof kept.image === 'string' && kept.image.startsWith('data:image/') ? { label: kept.label, image: kept.image } : null;
}
export const writePhoto = (photo, store) => writeJSON('photo', { label: photo.label, image: photo.image }, store);

// The marks of what the pilot has been shown in the pause's picture page (looks, paints, pointers; labs/graphics/main.js): sets of
// ids, or null where nothing is kept (what is owned at the first run then counts as seen).
export function readSeen(store) {
  const kept = readJSON('seen', store);
  if (!kept) return null;
  try {
    const out = { looks: new Set(kept.looks), paints: new Set(kept.paints), cursors: new Set(kept.cursors) };
    if (Array.isArray(kept.widgets)) out.widgets = new Set(kept.widgets);
    return out;
  } catch { return null; }
}
// `widgets` (the presentations seen on the layout page, chat P) is written only once there is a set of them: the text an older
// build wrote and reads stays as it was.
export const writeSeen = (seen, store) => writeJSON('seen', { looks: [...seen.looks], paints: [...seen.paints], cursors: [...seen.cursors],
  ...(seen.widgets ? { widgets: [...seen.widgets] } : {}) }, store);


