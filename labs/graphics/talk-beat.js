// A talk as a beat of its own (SX, 2026-10-14, of the quest dialogs: «когда пользователи получают или сдают квесты, это даже с индикацией сбоку
// непонятно, да, в этих диалоговых окнах, которые мы предлагаем, слишком незаметно, что вообще идет какой-то диалог»). Of the four directions he
// took D4 «Перебивка»; asked, the world slows while the line stands («Замедляется») and the line goes at a press («По нажатию»); of the three
// compositions on labs/graphics/sketches/quest-beat.html (2026-10-15: «D4A B C все нравятся, давай их сохраним пока что сделаем D4C») D4C SPEAKER.
//
// A menu with words (`target.talk`: src/opening.js openingTalk at A and B, a quest ship's plea and thanks, src/menus.js; a planet's errand,
// src/errands.js; COMMONS's voices, src/chorus.js; CLIPPER's crew, src/clipper.js) is begun by the pilot (SX, 2026-10-22: «когда ты
// подлетаешь к кораблю, ты должен диалог сам инициировать», and of where, I1 «Везде»; until then it stood by itself once the ship stood by
// its object): its object's window (labs/graphics/context.js) offers [1] TALK before its own rows (`plate`), and once TALK is pressed the
// whole frame goes under a black veil, the world eases to `pace` of its speed, the ship's controls are let go, and one of the organism's
// windows stands under the ship. A row is pressed as any menu's (its digit, or a click on it: the input router reads world.selected as before,
// through `press` here); 0 or Escape is LATER: the menu closed (game.menu.closed), the beat gone until TALK is pressed again. When a row
// changes what is said (the opening's next line), the beat stands again with the new words, the conversation begun.
//
// The talk is written as a script (SX, 2026-10-22, on D2 SCRIPT of labs/graphics/sketches/clipper-beta.html: «диалог в виде скрипта вообще
// отличный вариант. Наверное, я бы и другие диалоги хотел так»; the game's dialogs on labs/graphics/sketches/talk-script.html): who speaks in a
// column at the left, the line beside it wrapped under itself; the whole conversation in one window, kept from its first line (a quest's plea,
// the pilot's answer, the thanks), the lines coming one at a time (SX, 2026-10-22, round by round: «фразочки слишком быстро ... их не
// успеваешь прочитать»; of a second and a second a dozen letters «очень медленно»; of 0.8 s and a second each 18 «слишком медленный все еще»;
// of 0.4 s and a second each 40 «теперь слишком быстро»: 0.6 s and a second each 27 letters, 2 s a line of 38) and the window as tall as all
// of them from the first; its answers standing from the first line («кнопка должна быть доступна и до того, как закончился диалог»), a press
// saying the rest at once; the pilot's pressed answer written into it as YOU's, an action between asterisks, YOU and the action in gray (SX:
// «писать строки you серым. Писать действия»); every name in a gray, a step of its own for each who speaks, the first the lightest, YOU the
// quietest («слишком ... разноцветно ... надо все серым делать, но в зависимости от того, сколько собеседников, столько и градаций серого
// делать ... с каким-то серьезным шагом»; the quest's ink, a darker ROUXEE and a gray RADIO before), and only a quest's answer framed in its
// quest's ink («рамочка синий или фиолетовая ... Только у кнопки «Принять»»); the head's left what the talk is and its right the place, both in
// white («вот это сверху текст писать белым»). A conversation is its talk's `thread` (a quest's id; the target's id where it names none), kept on the page,
// never saved: a pilot who comes back to it finds it as it was (the planet's ask over the suitcase brought), a reload starts it at what the
// talk says now.
//
// A talk's data (`target.talk`): { name, lines, before?, thread?, place?, live? }. `lines` strings are said by the one `name` names, together
// as one line (old saves and quest data read as before: "RELAY 12 MECHANIC" is the station's desk, "SCOOTY / MECHANIC" a person and a role,
// anything else one name), or { who, line, ink, key } a line of its own speaker's; `before` what was said earlier in the same conversation (a plea a
// hail said), written first where the script does not hold it yet; `place` the head's right where the target is no station; `live` the world not
// slowed (COMMONS's recordings play on the world's clock).
//
// A call (`world.talkCall` { n, menu }: CLIPPER's crew left a screen behind, src/clipper.js) stands by itself, whatever the ship is next to,
// until LATER or the world takes it back (SX's W1, 2026-10-22: «давай появляется диалоговое окно, и они говорят, чувак, давай без спидранов»):
// a window of its own, its own conversation («когда прерывается по пути, это уже другое окно ... Другой высоты»).
//
// The page's (no world state, nothing saved): the world's pace is the page's to give (labs/graphics/flight-frame.js runs `steps` of the world's
// steps a frame), as the opening's slow beat does (labs/graphics/opening-focus.js F3).
import { ROLES, QUEST_INKS, PALETTE } from '../../src/roles.js';
import { rowTones } from '../../src/menus.js';
import { moneyRuns } from '../../src/money.js';
import { wrap } from '../../src/pilotPanel.js';
import { drawCraft } from '../../src/traffic.js';
import { DRIFTER_ID, drifterHere, drifterCraft } from '../../src/quests.js';
import { WRECK_ID, wreckHere, wreckCraftAt } from '../../src/wrecked.js';
import { SPECIAL_ID } from '../../src/specials.js';
import { clipperPose } from '../../src/clipper.js';
import { floatPose, floatPhases } from '../../src/float.js';
import { CONFIG } from '../../src/config.js';
import { PESTER_ID, pesterHere } from '../../src/pester.js';
import { clamp, easeOut, dimToContrast, contrastOnBlack } from '../../src/util.js';
import { withAlpha } from '../../src/hover.js';
import { drawStationShot } from './windows.js';
import { glyphsNow } from './world-art.js';
import { noteKey, unnoted } from './clicks.js';
import { KEYCAP_PAD } from './ui-parts.js';
import { Win, ORG, INK, SIZES, partLen, len } from './organism.js';

// `pace` the world's speed while the line stands, reached in `in` s and left in `out` s (page time); `veil` the black over the frame at its
// darkest; `under` px from the ship's middle (the camera's, r.cy) to the window's top; `floor` px kept clear over the cockpit.
// `width` the window (the ladder's S); `shot` the speaker's picture's square at most (INFO's), as much of it as the room under the ship leaves, `shotLeast`
// at least; `show` how far the beat has come in when its window starts to come, `drop` the px it comes from above (the pause's).
// The script: a line stands `read` s and a second each `cps` characters before the next comes, the pilot's action `act` s; a line comes in
// over `fresh` s; a line wraps to `wrap` rows at most; a conversation is kept `keep` s of page time after its last word, `threads` of them at
// most. `talk` the row the object's window offers to begin it. `names` the grays of who speaks, names and words alike: the lightest the
// window's text, YOU's `you` as contrast on black, the others between, a step a speaker.
export const BEAT = Object.freeze({ pace: 0.2, in: 0.3, out: 0.3, veil: 0.72, width: SIZES.S[0], shot: 200, shotLeast: 120, show: 0.35, drop: 12, under: 48, floor: 8,
  read: 0.6, cps: 27, act: 0.5, fresh: 0.25, wrap: 8, keep: 900, threads: 24, talk: 'TALK', names: Object.freeze({ you: 4.5 }) });
// The gray of the `i`-th of `n` voices in a talk, YOU the last: from the window's white down to YOU's, the steps even in lightness (CIE L*), so
// each reads as far from the next (SX, 2026-10-22: «их строчки тоже подписаны этим оттенком»; «достаточно различными друг с другом»; a step even in
// contrast's ratio, the round before, bunched the lighter ones).
const lightOf = (ratio) => 116 * Math.cbrt(ratio * 0.05 - 0.05) - 16, ratioOf = (L) => (((L + 16) / 116) ** 3 + 0.05) / 0.05;
export function voiceGray(i, n) {
  if (i <= 0) return PALETTE.white;
  const top = lightOf(contrastOnBlack(PALETTE.white)), you = lightOf(BEAT.names.you);
  return dimToContrast(PALETTE.white, ratioOf(top + ((you - top) * Math.min(i, n - 1)) / Math.max(1, n - 1)));
}

// The pilot's name in the script.
export const YOU = 'YOU';

// How fast a pilot out of fuel and a wreck turn where they drift, rad/s (src/questHooks.js drawDrifter, src/wrecked.js drawWreck).
const TURN = 0.05;

// A ship in the speaker's square (SX, 2026-10-22: «в диалоге с кораблем ... этот корабль тоже будет floating. В окошке. Да, только он не
// покидает пределы окошка ... Если не помещается, то мы его не скейлим ... он в основном в окне находился. Да, и направление его кабины мы
// рисуем так же, как он сейчас в космосе относительно нас стоит»; it stood nose up in the middle until then): its drawing at its own size,
// its nose where it points in space (the camera never turns), floating on the stations' orbit (src/float.js floatPose, its phase from the
// speaker's id, on the page's clock `now`), the orbit kept to the room the turned drawing leaves in the square, so a ship that fits never
// leaves it and one that does not stays in its middle; clipped to the square.
function floatingCraft(r, box, id, { craft, angle }, now) {
  const turn = angle + Math.PI / 2, c = Math.abs(Math.cos(turn)), s = Math.abs(Math.sin(turn));
  const w = craft.rows[0].length * r.cellW * craft.scale, h = craft.rows.length * r.cellH * craft.scale;
  const roomX = Math.max(0, (box.w - (w * c + h * s)) / 2), roomY = Math.max(0, (box.h - (w * s + h * c)) / 2);
  const F = CONFIG.float, f = floatPose(floatPhases(id), now, F);
  const x = box.x + box.w / 2 + (f.dx / F.orbit) * Math.min(F.orbit, roomX), y = box.y + box.h / 2 + (f.dy / F.orbit) * Math.min(F.orbit, roomY);
  const ctx = r.ctx;
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  try { drawCraft(glyphsNow(r), craft, x, y, angle); } finally { ctx.restore(); }
}

// The words at the head's left: a hand-in is a quest done; the story's lines are the story's; any other talk offers.
const KIND = Object.freeze({ done: 'QUEST DONE', story: 'STORY', offer: 'NEW QUEST' });
// The rows that tell about a thing rather than answer it (src/menus.js rowTones' TELLS): pressed, nothing is written into the script.
const TELLS = new Set(['INFO', 'REPLAY FLIGHT']);
// What the object's window keeps beside TALK before a talk is begun: the way in and out and what tells about it; everything else is the
// talk's to offer (SX, 2026-10-22, of CLIPPER's window with LEAD THEM under TALK: «сначала разговор должен быть, не надо сразу давать лид»).
const KEEP = new Set(['DOCK', 'UNDOCK', ...TELLS]);

// Who speaks a talk's plain lines, by its name: "SCOOTY / MECHANIC" a person and a role (the role speaks); "RELAY 12 MECHANIC" the station's
// name and its desk (the desk speaks); anything else one name. And the head's right: the station, or the talk's `place`, or the name.
function speakerOf(world, t) {
  const name = String(t.talk.name ?? '');
  if (name.includes(' / ')) return name.split(' / ')[1];
  const st = world.stations.find((s) => s.id === t.id);
  if (st && name.startsWith(`${st.label} `)) return name.slice(st.label.length + 1);
  return name;
}
function placeOf(world, t) {
  const st = world.stations.find((s) => s.id === t.id);
  if (st) return st.label;
  const name = String(t.talk.name ?? '');
  return t.talk.place ?? (name.includes(' / ') ? name.split(' / ')[0] : name);
}

// What a talk says, as the script's lines: { who, text, ink, key }. Its `before` first, then its `lines`; plain strings by its speaker,
// together. A line is written into the script once, known by its speaker and words, or by its own `key` where the same words come again (a
// recording played twice at COMMONS).
export function talkLines(world, t) {
  if (!t?.talk) return [];
  const who = speakerOf(world, t), out = [];
  const add = (list) => {
    let run = [];
    const flush = () => { if (run.length) out.push({ who, text: run.join(' '), ink: null }); run = []; };
    for (const l of list ?? []) {
      if (typeof l === 'string') { if (l.trim()) run.push(l.trim()); continue; }
      if (l?.line == null || !String(l.line).trim()) continue;
      flush();
      out.push({ who: l.who ?? who, text: String(l.line).trim(), ink: l.ink ?? null, key: l.key ?? null });
    }
    flush();
  };
  add(t.talk.before);
  add(t.talk.lines);
  return out;
}

// What is said, as one string: the beat stands again when it changes.
const saidKey = (world, t) => (t?.talk ? `${t.id}|${t.talk.name}|${talkLines(world, t).map((l) => `${l.who}:${l.text}`).join(' ')}|${t.actions.map((a) => a.label).join(',')}` : null);
const threadOf = (t) => (t?.talk ? String(t.talk.thread ?? t.id) : null);
// How long an entry stands before the next comes.
export const readOf = (e) => (e.you ? BEAT.act : BEAT.read + len(e.text) / BEAT.cps);

export function createTalkBeat(game) {
  const { world } = game;
  // `key` what stands (said), `target` its menu as last read, `dismissed` what LATER put away, `level` 0..1 how far it has come in, `carry`
  // the fraction of a world step the slow pace owes, `last` the page time of the last step.
  // `shot`: where the speaker's picture takes its fragment of a station, new each time a beat stands (a look-only choice: Math.random).
  // `scripts`: each conversation's script by its thread, { entries: [{ who, text, ink, you, at }], seen, touched } (`at` the page time an
  // entry comes; `seen` what the talk said that is in it already).
  // `opened`: the conversation the pilot began (TALK) by the object the ship is at, until the ship leaves it or LATER puts it away; `call`
  // the world's call standing, `callDone` the last one LATER put away.
  const S = { key: null, target: null, dismissed: null, level: 0, carry: 0, last: null, forId: null, shot: null, scripts: new Map(), opened: null,
    call: null, callDone: null };
  const pageTime = () => performance.now() / 1000;

  // A conversation's script, made the first time it is met (and the oldest let go past `threads`, or past `keep` s unheard).
  function scriptOf(t, now) {
    const id = threadOf(t);
    let s = S.scripts.get(id);
    if (!s) {
      for (const [k, old] of S.scripts) if (S.scripts.size >= BEAT.threads || now - old.touched > BEAT.keep) S.scripts.delete(k);
      s = { entries: [], seen: new Set(), touched: now };
      S.scripts.set(id, s);
    }
    s.touched = now;
    return s;
  }
  // Where the next entry comes: once the last has stood its time, or now.
  const nextAt = (s, now) => { const e = s.entries.at(-1); return e ? Math.max(now, e.at + readOf(e)) : now; };
  // What the talk says now, written into its script where it is not yet: one line after another.
  function absorb(t, now) {
    const s = scriptOf(t, now);
    for (const l of talkLines(world, t)) {
      const k = l.key ?? `${l.who}|${l.text}`;
      if (s.seen.has(k)) continue;
      s.seen.add(k);
      s.entries.push({ ...l, at: nextAt(s, now) });
    }
    return s;
  }

  // Once a frame, before the world steps: whether the beat stands, and how far it has come in.
  function step(now = pageTime()) {
    const dt = S.last === null ? 0 : clamp(now - S.last, 0, 0.1);
    S.last = now;
    const sel = world.selected;
    if ((sel?.id ?? null) !== S.forId) { S.forId = sel?.id ?? null; S.dismissed = null; S.opened = null; }
    // A call stands over whatever the ship is next to; else the menu the ship is next to, once its talk is begun.
    const call = world.talkCall && world.talkCall.n !== S.callDone ? world.talkCall : null, t = call ? call.menu : sel;
    S.call = call?.n ?? null;
    const k = saidKey(world, t);
    if (!call && S.key && game.menu.closed) S.dismissed = S.key;
    const begun = call ? true : S.opened === threadOf(t) && !game.menu.closed;
    const stands = !!k && begun && !world.paused && k !== S.dismissed && world.ship?.alive !== false;
    if (stands) { if (S.key !== k && !S.level) S.shot = { u: Math.random(), v: Math.random() }; S.key = k; S.target = t; absorb(t, now); } else S.key = null;
    const goal = S.key ? 1 : 0, rate = 1 / (goal ? BEAT.in : BEAT.out);
    S.level = goal > S.level ? Math.min(goal, S.level + dt * rate) : Math.max(goal, S.level - dt * rate);
    if (!S.level) { S.target = null; S.carry = 0; }
  }
  const shown = () => S.level > 0 && !!S.target;
  const standing = () => !!S.key;
  // The world's pace now, and of `n` world steps the frame's clock gives, how many run (the fraction carried to the next frame). A `live` talk
  // leaves the world its pace.
  const slows = () => !S.target?.talk?.live;
  const pace = () => (slows() ? 1 - (1 - BEAT.pace) * easeOut(S.level) : 1);
  function steps(n) {
    if ((!S.level && !S.carry) || !slows()) { S.carry = 0; return n; }
    S.carry += n * pace();
    const m = Math.floor(S.carry + 1e-9);
    S.carry -= m;
    return m;
  }

  // Whether the menu `t` talks and its conversation waits for the pilot's TALK.
  const asks = (t) => !!t?.talk && S.opened !== threadOf(t);
  // The rows of a menu that asks its window keeps beside TALK, each with its place among the menu's own.
  const kept = (t) => t.actions.map((a, i) => ({ a, i })).filter(({ a }) => KEEP.has(a.label));
  // The object's window of a menu that asks (labs/graphics/context.js): TALK first, then the rows it keeps, no words. TALK in the ink of the
  // first quest's answer its talk holds (src/menus.js rowTones: the way to a quest's step in its ink through every window).
  const talkTone = (t) => { const tones = rowTones(world, t); return t.actions.map((a, i) => (KEEP.has(a.label) ? null : tones[i])).find(Boolean) ?? null; };
  const plate = (t) => (asks(t) ? { ...t, talk: null, actions: [{ label: BEAT.talk, tone: talkTone(t), run: () => {} }, ...kept(t).map(({ a }) => a)] } : t);
  // TALK: the conversation begun, its window standing at once (wherever the ship is in the menu's reach).
  function open(t) { S.opened = threadOf(t); S.dismissed = null; }
  // Whatever of a conversation is still to come, said now.
  function sayAll(s, now) { for (const e of s.entries) if (e.at > now) e.at = now; }
  // Row `i` of the window the pilot sees, pressed (the router's keys and clicks): TALK on a menu that asks, or a row it keeps; else the menu's
  // own row (`run`).
  function press(i, now = pageTime()) {
    const t = world.selected;
    if (!asks(t)) return run(i, now);
    if (i === 0) { open(t); return true; }
    const row = kept(t)[i - 1];
    return row ? run(row.i, now) : false;
  }
  // Row `i` of the menu the ship is next to, run: the world runs it (World.runAction), and where the menu talks the answer is written into its
  // script as YOU's action, whatever of the talk was still to come said first. Returns whether it ran.
  function run(i, now = pageTime()) {
    const t = world.selected, row = t?.actions?.[i];
    const ran = world.runAction(i);
    if (ran && t?.talk && row && !TELLS.has(row.label)) {
      const s = scriptOf(t, now);
      sayAll(s, now);
      s.entries.push({ who: YOU, text: `*${row.label}*`, ink: null, you: true, at: now });
    }
    return ran;
  }

  // The speaker's picture in its square, or null when it has none drawn here (a planet's errand): a station as the world draws it, a fragment of
  // it at its own size taken somewhere new each time the beat stands (labs/graphics/windows.js drawStationShot; SX, 2026-10-16: «рандомный
  // фрагмент станции один к одному»), a ship's drawing floating in it as the station's fragment does (`floatingCraft`).
  function picture(t) {
    const st = world.stations.find((s) => s.id === t.id);
    if (st) return (r, box, now) => drawStationShot(r, box, st, world, S.shot, now);
    const pose = craftPose(t.id);
    if (pose) return (r, box, now) => floatingCraft(r, box, t.id, pose, now);
    return null;
  }
  // A quest's ship as the world draws it now: its drawing and its heading (a pilot out of fuel and a wreck turn slowly by the world's clock,
  // src/questHooks.js drawDrifter and src/wrecked.js drawWreck, `TURN`; a ship the pirates hold sways, src/pester.js pesterHere; CLIPPER as its
  // crew points it, src/clipper.js, in its paint as the page lends it), or null.
  function craftPose(id) {
    if (id === DRIFTER_ID) { const d = drifterHere(world); return d && { craft: drifterCraft(d), angle: d.angle + world.time * TURN }; }
    if (id === WRECK_ID) {
      const at = wreckCraftAt(world), here = wreckHere(world);
      return at && { craft: at.craft, angle: here ? here.angle + world.time * TURN : at.angle ?? -Math.PI / 2 };
    }
    if (id === PESTER_ID) { const p = pesterHere(world); return p && { craft: p.craft, angle: p.angle }; }
    if (id === SPECIAL_ID) { const c = clipperPose(world), craft = c && world.clipperArt?.craft(); return craft && { craft, angle: c.angle }; }
    return null;
  }

  // The beat drawn now, over the finished frame and under the pop-ups, on the organism's kit (labs/graphics/organism.js; SX's sketch W-ORG R7):
  // a dialog the ladder's S wide (640). Its head says what the talk is at the left (SX: «надпись Story, она должна быть слева») and the place at
  // the right, both white. The script at the left, the speaker's picture at the right in a square, frameless; the answers at the body's foot, `C`
  // over the foot's rule and two `C` under the words at least (SX, 2026-10-21: «кнопка ответа вообще во всех таких окнах должна привязываться к
  // низу»; 2026-10-16: «Двойной, тройной, четверной отступ»); a quest's answer its keycap in the quest's ink. The foot: ESC LATER. It comes in
  // as the pause's window does, out of a fade and a few px from above, once the veil is down. Returns the window's box, or null.
  function draw(r, now = pageTime()) {
    if (!shown()) return null;
    const t = S.target, k = easeOut(S.level);
    r.fill(0, 0, r.width, r.height, ROLES.backing, BEAT.veil * k);
    if (k < BEAT.show) return null;
    const come = clamp((k - BEAT.show) / (1 - BEAT.show), 0, 1), paint = picture(t);
    const tones = rowTones(world, t), tone = tones[0] ?? null;
    const hand = t.actions.some((a) => /^HAND IN/.test(a.label));
    const kind = hand ? KIND.done : tone === 'story' || !tone ? KIND.story : KIND.offer;
    const script = absorb(t, now);
    const win = new Win(r, { size: [BEAT.width, null], id: 'beat', live: come >= 1 }), p = win.p, { cw, m } = win;
    // Measured first: the script, the picture, the answers.
    // The picture as large as the room between the ship and the cockpit leaves it, the window's bands taken off (it stands under the ship).
    const room = r.cockpit.y - BEAT.floor - (r.cy + BEAT.under) - (win.headRule + 1 + 2 * ORG.C + win.footBand);
    const side = paint ? clamp(Math.floor(room), BEAT.shotLeast, BEAT.shot) : 0, cols = Math.floor((p.cxr - side - (paint ? ORG.C : 0) - p.cx + 2 * m.capLeft) / cw);
    // The script's columns: the names' (the longest and a gutter), the words' (what is left); every entry, said or still to come, so the window
    // is as tall from the first line as the talk will be.
    const entries = script.entries;
    // The voices' grays: who speaks, in the order they first do, a step each; YOU the quietest, counted from the first line so no gray moves
    // when the pilot first answers. A line by no one (COMMONS's own words, its static) keeps the ink its talk gives it.
    const mine = (e) => e.you || e.who === YOU, speakers = [...new Set(entries.filter((e) => e.who && !mine(e)).map((e) => e.who))];
    const voices = speakers.length + 1, grayOf = (e) => (mine(e) ? voiceGray(voices - 1, voices) : voiceGray(speakers.indexOf(e.who), voices));
    const nameCols = entries.some((e) => e.who) ? Math.max(...entries.map((e) => len(e.who))) + ORG.gutter : 0;
    const lines = entries.flatMap((e) => wrap(e.text, cols - nameCols, BEAT.wrap).filter(Boolean).map((text, j) => ({ e, text, first: j === 0 })));
    const rows = [];
    t.actions.forEach((a, i) => {
      rows.push({ key: String(i + 1), label: a.label, disabled: a.disabled, tone: tones[i] ?? null });
      if (a.cargo && a.note) rows.push({ key: '', label: a.note });
    });
    // The answers at the body's foot, the last one's keycap `C` over the foot's rule as any content stands off a line (the picture's foot on that
    // line too where it is the taller), never nearer the words than two `C`; the window as tall as that asks, or as the picture (SX, 2026-10-21, on
    // two short lines beside a taller picture: «кнопка ответа вообще во всех таких окнах должна привязываться к низу. То есть единичка должна быть
    // привязана внизу, да, с отступом каким-то хорошеньким»; from 2026-10-16 two `C` under the words, «Не вниз, а то не видно ... с каким-то
    // отступом под текст», which left them floating beside a taller picture; at the picture's foot before that).
    // (px, the first answer's keycap top to the last row's ink bottom: its keycap's, or a cargo's note's capitals)
    const n = rows.length, answersH = n ? (n - 1) * ORG.row + (rows[n - 1].key ? win.keyH : win.keyTop + win.cap) : 0;
    win.fit(Math.max(paint ? p.y(0) + side : 0, p.yb(Math.max(0, lines.length - 1)) + 2 * ORG.C + answersH));
    const kRows = p.kAfter(win.footRule - ORG.C - answersH, win.keyTop);
    const y = Math.round(Math.min(r.cy + BEAT.under, r.cockpit.y - BEAT.floor - win.h));
    const lift = (1 - come) * BEAT.drop;
    win.place(() => ({ x: Math.round(r.width / 2 - win.w / 2), y: Math.max(r.view.y, y) - lift }));
    const body = () => {
      win.sheet();
      win.head([[kind, INK.text]], { meta: [{ runs: [[placeOf(world, t), INK.text]] }] });
      if (paint) paint(r, { x: Math.round(p.cxr) - side, y: Math.round(p.y(0)), w: side, h: side }, now);
      // The script: each line once its time has come, coming in; its speaker on its first row, its words beside, both in the speaker's gray.
      lines.forEach((l, i) => {
        if (l.e.at > now) return;
        const put = () => {
          if (l.first && l.e.who) win.text(l.e.who, p.cx, p.y(i), grayOf(l.e));
          win.text(l.text, p.x(nameCols), p.y(i), l.e.who || mine(l.e) ? grayOf(l.e) : l.e.ink ?? INK.text);
        };
        const fresh = clamp((now - l.e.at) / BEAT.fresh, 0, 1);
        if (fresh < 1) withAlpha(r.ctx, easeOut(fresh), put); else put();
      });
      // The answers: each its keycap and its words (money in gold, one that cannot be taken faint), a cargo's note under it; each row a button.
      rows.forEach((row, i) => {
        const Y = p.y(kRows + i), words = row.disabled ? [[row.label, INK.faint]] : moneyRuns(row.label, row.key ? INK.text : INK.label);
        const wx = p.cx + win.keyWidth(row.key || '1', null) + (ORG.keyWord * cw - KEYCAP_PAD) + m.capLeft;
        if (!row.key) { win.part({ runs: words }, wx, Y); return; }
        const end = wx + partLen({ runs: words }) * cw - 2 * m.capLeft, box = win.rowBox(p.cx, end, Y);
        if (win.live) noteKey(row.key, box, r);
        win.item(`row:${row.key}`, box, (on) => {
          if (on) win.bar(p.cx, end, Y);
          win.key(p.cx, Y, row.key, { words: { runs: words }, tier: row.tone ? QUEST_INKS[row.tone] ?? 'quest' : 'key', plate: on });
        });
      });
      // The foot: LATER, the menu's close.
      win.foot([{ key: 'ESC', words: 'LATER', id: 'key:later' }]);
    };
    if (come >= 1) body(); else unnoted(() => withAlpha(r.ctx, come, body));
    return win.box;
  }

  // LATER: the beat standing goes until TALK is pressed again (Escape and 0, labs/graphics/input-router.js; its menu, a berth's among them,
  // is left as it is).
  function later() { if (S.key) S.dismissed = S.key; S.opened = null; if (S.call != null) S.callDone = S.call; }

  return { state: S, step, shown, standing, pace, steps, asks, plate, open, press, run, draw, later };
}
