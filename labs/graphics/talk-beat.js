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
import { ROLES } from '../../src/roles.js';
import { rowTones } from '../../src/menus.js';
import { shipStands } from '../../src/interaction.js';
import { moneyRuns } from '../../src/money.js';
import { wrap } from '../../src/pilotPanel.js';
import { drawCraft } from '../../src/traffic.js';
import { DRIFTER_ID, drifterHere, drifterCraft } from '../../src/quests.js';
import { WRECK_ID, wreckCraftAt } from '../../src/wrecked.js';
import { PESTER_ID, pesterHere } from '../../src/pester.js';
import { clamp, easeOut } from '../../src/util.js';
import { withAlpha } from '../../src/hover.js';
import { UI } from '../../src/uiGrid.js';
import { drawStationShot } from './windows.js';
import { glyphsNow } from './world-art.js';
import { noteKey, unnoted } from './clicks.js';
import { KEYCAP_PAD } from './ui-parts.js';
import { Win, ORG, INK, SIZES, partLen } from './organism.js';

// `pace` the world's speed while the line stands, reached in `in` s and left in `out` s (page time); `veil` the black over the frame at its
// darkest; `under` px from the ship's middle (the camera's, r.cy) to the window's top; `floor` px kept clear over the cockpit.
// `width` the window (the ladder's S); `shot` the speaker's picture's square at most (INFO's), as much of it as the room under the ship leaves, `shotLeast`
// at least; `show` how far the beat has come in when its window starts to come, `drop` the px it comes from above (the pause's).
export const BEAT = Object.freeze({ pace: 0.2, in: 0.3, out: 0.3, veil: 0.72, width: SIZES.S[0], shot: 200, shotLeast: 120, show: 0.35, drop: 12, under: 48, floor: 8 });

// The words at the head's right: a hand-in is a quest done; the opening's lines are the story's; any other talk offers.
const KIND = Object.freeze({ done: 'QUEST DONE', story: 'STORY', offer: 'NEW QUEST' });

// What is said, as one string: the beat stands again when it changes.
const said = (t) => (t?.talk ? `${t.id}|${t.talk.name}|${(t.talk.lines ?? []).join(' ')}|${t.actions.map((a) => a.label).join(',')}` : null);

export function createTalkBeat(game) {
  const { world } = game;
  // `key` what stands (said), `target` its menu as last read, `dismissed` what LATER put away, `level` 0..1 how far it has come in, `carry`
  // the fraction of a world step the slow pace owes, `last` the page time of the last step.
  // `shot`: where the speaker's picture takes its fragment of a station, new each time a beat stands (a look-only choice: Math.random).
  const S = { key: null, target: null, dismissed: null, level: 0, carry: 0, last: null, forId: null, shot: null };
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
    if (stands) { if (S.key !== k && !S.level) S.shot = { u: Math.random(), v: Math.random() }; S.key = k; S.target = t; } else S.key = null;
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

  // The speaker's picture in its square, or null when it has none drawn here (a planet's errand): a station as the world draws it, a fragment of
  // it at its own size taken somewhere new each time the beat stands (labs/graphics/windows.js drawStationShot; SX, 2026-10-16: «рандомный
  // фрагмент станции один к одному»), a ship's drawing nose up.
  function picture(t) {
    const st = world.stations.find((s) => s.id === t.id);
    if (st) return (r, box, now) => drawStationShot(r, box, st, world, S.shot, now);
    const craft = t.id === DRIFTER_ID ? (drifterHere(world) && drifterCraft(drifterHere(world)))
      : t.id === WRECK_ID ? wreckCraftAt(world)?.craft : t.id === PESTER_ID ? pesterHere(world)?.craft : null;
    if (craft) return (r, box) => drawCraft(glyphsNow(r), craft, box.x + box.w / 2, box.y + box.h / 2, -Math.PI / 2);
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

  // The beat drawn now, over the finished frame and under the pop-ups, on the organism's kit (labs/graphics/organism.js; SX's sketch W-ORG R7):
  // a dialog the ladder's S wide (640). Its head says what the talk is at the left, in the story's purple (SX: «надпись Story, она должна быть
  // слева»), and who speaks at the right, what they are in the label's gray before their name (SX: «Скути механик ... должно быть явно справа»).
  // The words at the left, the speaker's picture at the right in a square, frameless; the answers well apart from the words (SX: «кнопочный выбор
  // после текста диалога ... в другом месте ... Двойной, тройной, четверной отступ»): their last keycap's line on the picture's foot, at least two
  // `C` under the words; a quest's answer its keycap in the purple. The foot: ESC LATER. It comes in as the pause's window does, out of a fade and
  // a few px from above, once the veil is down. Returns the window's box, or null.
  function draw(r, now = pageTime()) {
    if (!shown()) return null;
    const t = S.target, k = easeOut(S.level);
    r.fill(0, 0, r.width, r.height, ROLES.backing, BEAT.veil * k);
    if (k < BEAT.show) return null;
    const come = clamp((k - BEAT.show) / (1 - BEAT.show), 0, 1), paint = picture(t);
    const tone = rowTones(world, t)[0] ?? null, tones = rowTones(world, t);
    const hand = t.actions.some((a) => /^HAND IN/.test(a.label));
    const kind = hand ? KIND.done : tone === 'story' || !tone ? KIND.story : KIND.offer;
    const [who, role] = speaker(t);
    const win = new Win(r, { size: [BEAT.width, null], id: 'beat', live: come >= 1 }), p = win.p, { cw, m } = win;
    // Measured first: the words, the picture, the answers.
    // The picture as large as the room between the ship and the cockpit leaves it, the window's bands taken off (it stands under the ship).
    const room = r.cockpit.y - BEAT.floor - (r.cy + BEAT.under) - (win.headRule + 1 + 2 * ORG.C + win.footBand);
    const side = paint ? clamp(Math.floor(room), BEAT.shotLeast, BEAT.shot) : 0, cols = Math.floor((p.cxr - side - (paint ? ORG.C : 0) - p.cx + 2 * m.capLeft) / cw);
    const lines = (t.talk.lines ?? []).flatMap((l) => wrap(l, cols, 5)).filter(Boolean);
    const rows = [];
    t.actions.forEach((a, i) => {
      rows.push({ key: String(i + 1), label: a.label, disabled: a.disabled, tone: tones[i] ?? null });
      if (a.cargo && a.note) rows.push({ key: '', label: a.note });
    });
    const shotBottom = (y0) => y0 + side, n = rows.length;
    let kRows = paint ? p.kAfter(shotBottom(p.y(0)) - win.keyH + win.keyTop - (n - 1) * UI.row, 0) : 0;
    kRows = Math.max(kRows, p.kAfter(p.yb(Math.max(0, lines.length - 1)), 2 * ORG.C + win.keyTop));
    win.fit(Math.max(paint ? shotBottom(p.y(0)) : 0, p.y(kRows + n - 1) - win.keyTop + win.keyH));
    const y = Math.round(Math.min(r.cy + BEAT.under, r.cockpit.y - BEAT.floor - win.h));
    const lift = (1 - come) * BEAT.drop;
    win.place(() => ({ x: Math.round(r.width / 2 - win.w / 2), y: Math.max(r.view.y, y) - lift }));
    const body = () => {
      win.sheet();
      win.head([[kind, INK.purple]], { meta: [{ runs: [...(role ? [[`${role}  `, INK.label]] : []), [who, INK.text]] }] });
      if (paint) paint(r, { x: Math.round(p.cxr) - side, y: Math.round(p.y(0)), w: side, h: side }, now);
      lines.forEach((l, i) => win.text(l, p.cx, p.y(i), INK.text));
      // The answers: each its keycap and its words (money in gold, one that cannot be taken faint), a cargo's note under it; each row a button.
      rows.forEach((row, i) => {
        const Y = p.y(kRows + i), words = row.disabled ? [[row.label, INK.faint]] : moneyRuns(row.label, row.key ? INK.text : INK.label);
        const wx = p.cx + win.keyWidth(row.key || '1', null) + (ORG.keyWord * cw - KEYCAP_PAD) + m.capLeft;
        if (!row.key) { win.part({ runs: words }, wx, Y); return; }
        const end = wx + partLen({ runs: words }) * cw - 2 * m.capLeft, box = win.rowBox(p.cx, end, Y);
        if (win.live) noteKey(row.key, box, r);
        win.item(`row:${row.key}`, box, (on) => {
          if (on) win.bar(p.cx, end, Y);
          win.key(p.cx, Y, row.key, { words: { runs: words }, tier: row.tone ? 'quest' : 'key', plate: on });
        });
      });
      // The foot: LATER, the menu's close.
      win.foot([{ key: 'ESC', words: 'LATER', id: 'key:later' }]);
    };
    if (come >= 1) body(); else unnoted(() => withAlpha(r.ctx, come, body));
    return win.box;
  }

  // LATER: the beat standing goes until its words change or the ship comes again (Escape and 0, labs/graphics/input-router.js; its menu, a
  // berth's among them, is left as it is).
  function later() { if (S.key) S.dismissed = S.key; }

  return { state: S, step, shown, standing, pace, steps, draw, later };
}
