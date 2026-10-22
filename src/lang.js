// The game's words in the pilot's language (SX, 2026-10-22: «создание русской версии игры в настройках или в паузе, прям можно сменить»):
// ENGLISH, the game's own, or РУССКИЙ, chosen in the pause (GAMEPLAY > LANGUAGE) and kept in this browser (src/prefs.js PREFS.language), never
// in the save.
//
// English stays where every string is made. The world, its quests, notes and menus speak English and the save keeps English (`spaser.local.v1`
// never holds another language: checks/lang.mjs). A string is put into the pilot's language where it is laid out for the screen, before it is
// measured: `tr(text)`. The windows' kit does it in its own measures and draws (labs/graphics/organism.js `len`, `Win.text`), the other painters
// where they lay their words out. In English `tr` gives back what it was given, the same string, so the English game draws exactly what it drew
// (the golden master, tools/golden.mjs). The logic keeps the English: rows, hover ids and keys are matched by their English words; only what is
// drawn changes, so a switch takes effect on the next frame, with no reload.
//
// How a string is found in a table (src/langRu.js), keyed by the English exactly as the game makes it:
//   1. the whole string, its spaces round it kept: 'RESUME' -> 'ПРОДОЛЖИТЬ';
//   2. a pattern, `{}` standing for any part: 'RAID ON {}' -> 'НАЛЁТ НА {}'; each part found is put through `tr` again (a name or a number
//      stays as it is, a word of the table is translated), `{0}` `{1}` in the Russian put the parts in another order; the pattern with the
//      most fixed letters wins; a part never holds ' / '. `{#}` in a key stands for a number only (digits and , . : % + - ×): '{#} OF {#}' takes «3 OF 8» and never a
//      sentence with OF in it; the Russian puts it back with `{}` as any part;
//   3. a string of parts joined by ' / ', ' · ' or two spaces (a place and what to do there, a row's two halves): each part on its own.
// A string with no Latin letter (a number, a sign, the Russian already) is given back as it is; so is a name (a station's, a ship's, a
// sector's): names are not translated. What no rule found is given back in English and noted in `missed` (checks/lang.mjs and
// tools/lang-coverage.mjs hold the game to none).
import { RU } from './langRu.js';
import { readLanguage, writeLanguage } from './prefs.js';

export const LANGUAGES = Object.freeze(['en', 'ru']);
// Each language's name in its own words, never translated: whoever switched by mistake finds the way back.
export const LANGUAGE_NAMES = Object.freeze({ en: 'ENGLISH', ru: 'РУССКИЙ' });
export const DEFAULT_LANGUAGE = 'en';
const TABLES = { ru: RU };

// The page's: which language is shown, and `epoch`, counted up at each switch (a painter that keeps laid-out words keys them by it).
export const language = { id: DEFAULT_LANGUAGE, epoch: 0 };
// What `tr` was asked in a language other than English and found no words for (the whole strings, not a pattern's parts).
export const missed = new Set();

export function loadLanguage(store) { use(readLanguage(LANGUAGES, store)); return language; }
// The switch: kept at once. True when the language changed.
export function setLanguage(id, store) {
  if (!LANGUAGES.includes(id) || id === language.id) return false;
  use(id);
  writeLanguage(id, store);
  return true;
}
// (Without keeping it: the checks and the lab's `?lang=`.)
export function useLanguage(id) { use(LANGUAGES.includes(id) ? id : DEFAULT_LANGUAGE); return language; }
function use(id) {
  if (id === language.id) return;
  language.id = id; language.epoch++;
  cache.clear();
}

// ---- the tables, made ready once -------------------------------------------------------------------------------------------------

const LATIN = /[A-Za-z]/;
const NUMBER = '([-+]?[\\d.,:%×]*\\d[\\d.,:%×]*)';
// (A part never runs over ' / ': «J-04 / TAKE IT DOWN» is a place and a phrase, not a pirate «{} DOWN».)
const ANY = '((?:(?! / ).)+?)';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A table's exact strings and its patterns, the patterns with the most fixed letters first; `anchor` the longest fixed part, which the string
// must hold before the pattern's expression is tried at all.
function prepare(table) {
  const exact = new Map(), patterns = [];
  for (const [key, value] of Object.entries(table)) {
    if (!/\{#?\}/.test(key)) { exact.set(key, value); continue; }
    const parts = key.split(/\{#?\}/), kinds = key.match(/\{#?\}/g);
    const anchor = parts.reduce((a, p) => (p.trim().length > a.length ? p.trim() : a), '');
    const source = parts.map(escape).reduce((re, p, i) => re + (i ? (kinds[i - 1] === '{#}' ? NUMBER : ANY) : '') + p, '');
    patterns.push({ key, value, anchor, fixed: parts.join('').length, re: new RegExp(`^${source}$`, 's') });
  }
  patterns.sort((a, b) => b.fixed - a.fixed || a.key.localeCompare(b.key));
  return { exact, patterns };
}
const READY = Object.fromEntries(Object.entries(TABLES).map(([id, table]) => [id, prepare(table)]));

// ---- tr ----------------------------------------------------------------------------------------------------------------------------

// What was found, by the string asked (the English): a frame asks the same strings again. Emptied at a switch, and when it grows past `CACHE`
// (strings with a clock or a count in them make new ones).
const cache = new Map();
const CACHE = 4000;
const MISSED = 2000;      // (the note of what was not found stops growing there: a name with a changing number in it is a new string each time)
const SEPARATORS = [' / ', ' · ', '  '];

// `text` in the pilot's language (see the head of this file). Anything not a string is given back as it is.
export function tr(text) {
  if (language.id === DEFAULT_LANGUAGE || typeof text !== 'string' || !LATIN.test(text)) return text;
  const kept = cache.get(text);
  if (kept !== undefined) return kept;
  const found = find(text, READY[language.id], 0);
  if (found === null && missed.size < MISSED) missed.add(text.trim());
  const out = found ?? text;
  if (cache.size >= CACHE) cache.clear();
  cache.set(text, out);
  return out;
}

// One English word that means two things on the screen (TANK, the keys' way of steering and the fuel's tank): said where it is laid out with
// the place it stands in, `context`, the table's key `context|TEXT` first, else as `tr` says it. In English the very string.
export function trIn(context, text) {
  if (language.id === DEFAULT_LANGUAGE || typeof text !== 'string') return text;
  return READY[language.id].exact.get(`${context}|${text}`) ?? tr(text);
}

// The string in the table's words, or null where nothing was found. `depth`: how far inside another string this one is (a pattern's part).
function find(text, t, depth) {
  if (!LATIN.test(text)) return text;
  const lead = text.match(/^\s*/)[0], trail = text.slice(lead.length).match(/\s*$/)[0];
  const core = text.slice(lead.length, text.length - trail.length);
  const wrap = (s) => (s === null ? null : lead + s + trail);
  if (t.exact.has(core)) return wrap(t.exact.get(core));
  if (depth > 3) return null;
  for (const p of t.patterns) {
    if (p.anchor && !core.includes(p.anchor)) continue;
    const m = p.re.exec(core);
    if (!m) continue;
    const parts = m.slice(1).map((part) => find(part, t, depth + 1) ?? part);
    let i = 0;
    return wrap(p.value.replace(/\{(\d?)\}/g, (_, d) => parts[d === '' ? i++ : Number(d)] ?? ''));
  }
  // (A part not found stays as it is, a name most often: the join counts as found when one part with words in it was.)
  for (const sep of SEPARATORS) {
    if (!core.includes(sep)) continue;
    const parts = core.split(sep), found = parts.map((part) => find(part, t, depth + 1));
    if (found.some((f, i) => f !== null && f !== parts[i])) return wrap(found.map((f, i) => f ?? parts[i]).join(sep));
  }
  return null;
}

// Every key of a language's table, and whether a string is one (checks/lang.mjs).
export const tableOf = (id) => TABLES[id] ?? null;
