// A talk as a beat of its own (SX, 2026-10-14, of the quest dialogs: «когда пользователи получают или сдают квесты, это даже с индикацией сбоку
// непонятно, да, в этих диалоговых окнах, которые мы предлагаем, слишком незаметно, что вообще идет какой-то диалог»). Of the four directions he
// took D4 «Перебивка»; asked, the world slows while the line stands («Замедляется») and the line goes at a press («По нажатию»); of the three
// compositions on labs/graphics/sketches/quest-beat.html (2026-10-15: «D4A B C все нравятся, давай их сохраним пока что сделаем D4C») D4C SPEAKER.
//
// A menu with words (`target.talk` { name, lines }: src/opening.js openingTalk at A and B, an NPC's thanks before HAND IN, src/menus.js talk; a
// planet's errand, src/errands.js) is no longer a floating plate beside its object (labs/graphics/context.js): once the ship stands by it (the
// plate's own moment, src/interaction.js shipStands), the whole frame goes under a black veil, the world eases to `pace` of its speed, the ship's
// controls are let go, and one of the Swiss windows stands under the ship: who speaks in its head and what the moment is at its right in the
// quest's ink, the speaker's picture in a box at the left (a station's look as its INFO draws it, a ship's drawing nose up), the line in white
// beside it, then the menu's rows as keycaps with their words, and LATER in the foot. A row is pressed as any menu's (its digit, or a click on it:
// the input router reads world.selected as before); 0 or Escape is LATER: the menu closed (game.menu.closed), the beat gone until the words change
// or the ship comes again. When a row changes what is said (the opening's next line), the beat stands again with the new words.
//
// The page's (no world state, nothing saved): the world's pace is the page's to give (labs/graphics/flight-frame.js runs `steps` of the world's
// steps a frame), as the opening's slow beat does (labs/graphics/opening-focus.js F3).
import { QUEST_INKS, ROLES } from '../../src/roles.js';
import { rowTones } from '../../src/menus.js';
import { shipStands } from '../../src/interaction.js';
import { moneyRuns } from '../../src/money.js';
import { wrap } from '../../src/pilotPanel.js';
import { keyName } from '../../src/controls.js';
import { drawCraft } from '../../src/traffic.js';
import { DRIFTER_ID, drifterHere, drifterCraft } from '../../src/quests.js';
import { WRECK_ID, wreckCraftAt } from '../../src/wrecked.js';
import { PESTER_ID, pesterHere } from '../../src/pester.js';
import { clamp, easeOut } from '../../src/util.js';
import { rebuiltShare } from '../../src/ruins.js';
import { drawStationNow } from './world-art.js';
import { swiss, frameBox, keycapAt, keycapWidth, SWISS, W, G } from './swiss.js';
import { sheet, putPart } from './swiss-window.js';
import { KEYCAP_PAD } from './ui-parts.js';
import { len } from './ledger.js';

// `pace` the world's speed while the line stands, reached in `in` s and left in `out` s (page time); `veil` the black over the frame at its
// darkest; `cols` the line's measure; `pic` the picture's box in cells and rows; `under` px from the ship's middle (the camera's, r.cy) to the
// window's top; `floor` px kept clear over the cockpit.
export const BEAT = Object.freeze({ pace: 0.2, in: 0.3, out: 0.3, veil: 0.72, cols: 40, pic: Object.freeze({ cols: 15, rows: 6 }), under: 64, floor: 8 });

// The words at the head's right: a hand-in is a quest done; the opening's lines are the story's; any other talk offers.
const KIND = Object.freeze({ done: 'QUEST DONE', story: 'STORY', offer: 'NEW QUEST' });

// What is said, as one string: the beat stands again when it changes.
const said = (t) => (t?.talk ? `${t.id}|${t.talk.name}|${(t.talk.lines ?? []).join(' ')}|${t.actions.map((a) => a.label).join(',')}` : null);

export function createTalkBeat(game) {
  const { world } = game;
  // `key` what stands (said), `target` its menu as last read, `dismissed` what LATER put away, `level` 0..1 how far it has come in, `carry`
  // the fraction of a world step the slow pace owes, `last` the page time of the last step.
  const S = { key: null, target: null, dismissed: null, level: 0, carry: 0, last: null, forId: null };
  const pageTime = () => performance.now() / 1000;

  // Once a frame, before the world steps: whether the beat stands, and how far it has come in.
  function step(now = pageTime()) {
    const dt = S.last === null ? 0 : clamp(now - S.last, 0, 0.1);
    S.last = now;
    const t = world.selected;
    if ((t?.id ?? null) !== S.forId) { S.forId = t?.id ?? null; S.dismissed = null; }
    const k = said(t);
    if (S.key && game.menu.closed) S.dismissed = S.key;
    const stands = !!k && !game.menu.closed && !world.paused && k !== S.dismissed && shipStands(world).on && world.ship?.alive !== false;
    if (stands) { S.key = k; S.target = t; } else S.key = null;
    const goal = S.key ? 1 : 0, rate = 1 / (goal ? BEAT.in : BEAT.out);
    S.level = goal > S.level ? Math.min(goal, S.level + dt * rate) : Math.max(goal, S.level - dt * rate);
    if (!S.level) { S.target = null; S.carry = 0; }
  }
  const shown = () => S.level > 0 && !!S.target;
  const standing = () => !!S.key;
  // The world's pace now, and of `n` world steps the frame's clock gives, how many run (the fraction carried to the next frame).
  const pace = () => 1 - (1 - BEAT.pace) * easeOut(S.level);
  function steps(n) {
    if (!S.level && !S.carry) return n;
    S.carry += n * pace();
    const m = Math.floor(S.carry + 1e-9);
    S.carry -= m;
    return m;
  }

  // The speaker's picture, drawn in `box`, or null when it has none drawn here (a planet's errand).
  function picture(t) {
    const st = world.stations.find((s) => s.id === t.id);
    if (st) return (r, box, now) => drawStationNow(r, box.x + box.w / 2, box.y + box.h / 2, st, st.kind === 'ruin' ? rebuiltShare(world.ledger, st) : 1, now);
    const craft = t.id === DRIFTER_ID ? (drifterHere(world) && drifterCraft(drifterHere(world)))
      : t.id === WRECK_ID ? wreckCraftAt(world)?.craft : t.id === PESTER_ID ? pesterHere(world)?.craft : null;
    if (craft) return (r, box) => drawCraft(r, craft, box.x + box.w / 2, box.y + box.h / 2, -Math.PI / 2);
    return null;
  }

  // Who speaks and what they are: "RELAY 12 DISPATCH" is the station's name and its desk; "SCOOTY / MECHANIC" its two parts; else one name.
  function speaker(t) {
    const name = String(t.talk.name ?? '');
    if (name.includes(' / ')) { const [a, b] = name.split(' / '); return [a, b]; }
    const st = world.stations.find((s) => s.id === t.id);
    if (st && name.startsWith(`${st.label} `)) return [st.label, name.slice(st.label.length + 1)];
    return [name, ''];
  }

  // The beat drawn now, over the finished frame and under the pop-ups. Returns the window's box, or null.
  function draw(r, now = pageTime()) {
    if (!shown()) return null;
    const t = S.target, k = easeOut(S.level);
    r.fill(0, 0, r.width, r.height, ROLES.backing, BEAT.veil * k);
    if (k < 0.35) return null;
    const ui = swiss(r), { cw, I } = ui, paint = picture(t);
    const tone = rowTones(world, t)[0] ?? null;
    const hand = t.actions.some((a) => /^HAND IN/.test(a.label));
    const kind = hand ? KIND.done : tone === 'story' || !tone ? KIND.story : KIND.offer;
    const ink = QUEST_INKS[tone] ?? QUEST_INKS.story;
    const [who, role] = speaker(t);
    const lines = (t.talk.lines ?? []).flatMap((l) => wrap(l, BEAT.cols, 5)).filter(Boolean);
    // The rows: each action its keycap and words (money in the coin's gold, a row that cannot be taken quiet), a cargo's note under it.
    const rows = [];
    t.actions.forEach((a, i) => {
      rows.push({ key: String(i + 1), label: a.label, disabled: a.disabled });
      if (a.cargo && a.note) rows.push({ key: '', label: a.note });
    });
    const head = SWISS.headGap, body = lines.length + 1 + rows.length;
    const pic = paint ? { w: BEAT.pic.cols * cw, rows: BEAT.pic.rows } : null;
    const bodyRows = Math.max(pic ? pic.rows : 0, body), foot = head + bodyRows + 1;
    const w = Math.round(I + (pic ? pic.w + 3 * cw : 0) + BEAT.cols * cw + I), h = ui.heightWithKeys(foot);
    const y = Math.round(Math.min(r.cy + BEAT.under, r.cockpit.y - BEAT.floor - h));
    const box = { x: Math.round(r.width / 2 - w / 2), y: Math.max(r.view.y, y), w, h };
    sheet(ui, box, foot);
    const at = (row) => ui.rowAt(box.y, row);
    ui.text(who, box.x + I, at(0), W, true);
    if (role) ui.text(role, box.x + I + (len(who) + 1) * cw, at(0), G, true);
    ui.textEnd(kind, box.x + box.w - I, at(0), ink, true);
    let tx = box.x + I;
    if (pic) {
      const pb = { x: box.x + I, y: Math.round(at(head) + ui.m.textY - 2), w: Math.round(pic.w), h: Math.round(pic.rows * ui.row) };
      frameBox(ui, pb);
      r.ctx.save(); r.ctx.beginPath(); r.ctx.rect(pb.x + 1, pb.y + 1, pb.w - 2, pb.h - 2); r.ctx.clip();
      paint(r, pb, now);
      r.ctx.restore();
      tx = pb.x + pb.w + 3 * cw;
    }
    lines.forEach((l, i) => ui.text(l, tx, at(head + i), W, true));
    rows.forEach((row, i) => {
      const top = at(head + lines.length + 1 + i), words = row.disabled ? [[row.label, G]] : moneyRuns(row.label, row.key ? W : G);
      if (!row.key) { putPart(ui, { runs: words }, tx + keycapWidth(ui, '1') - KEYCAP_PAD + SWISS.keyGap * cw, top); return; }
      const cap = keycapAt(ui, row.key, tx, top, row.disabled ? G : W);
      putPart(ui, { runs: words }, cap.x + cap.w - KEYCAP_PAD + SWISS.keyGap * cw, top);
    });
    // The foot: LATER, the menu's close (its key as the scheme names it).
    const close = keyName('close') || '0', cap = keycapAt(ui, close, box.x + I, at(foot));
    ui.text('LATER', cap.x + cap.w - KEYCAP_PAD + SWISS.keyGap * cw, at(foot), G, true);
    return box;
  }

  return { state: S, step, shown, standing, pace, steps, draw };
}
