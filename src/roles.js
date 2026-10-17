import { dimToContrast } from './util.js';
import { PALETTE } from './palette.js';

// The palette, shared by the lab's Canvas painters and DOM tuning controls, lives in src/palette.js (chat H, 2026-10-04) and is
// re-exported here with the roles that say what each of its inks is for.
export { PALETTE };
export const ROLES = Object.freeze({
  space: PALETTE.black, backing: PALETTE.black, surface: PALETTE.black,
  shadow: PALETTE.depth,
  // The sky's three depth steps, dim to bright (SX, 2026-09-30: "Звезды фоновые
  // стали какие-то тусклые"). Each is one step up the palette from what it was:
  // the far layer used depth, 1.16:1 on black, which did not show at all.
  starFar: PALETTE.blue, starMid: PALETTE.gray, starNear: PALETTE.white,
  structure: PALETTE.blue, surfaceMid: PALETTE.blue,
  textSecondary: PALETTE.gray, material: PALETTE.gray, iconStatic: PALETTE.gray,
  textPrimary: PALETTE.white, focus: PALETTE.white, highlight: PALETTE.white,
  interactionActive: PALETTE.green, routeActive: PALETTE.green, driveActive: PALETTE.green,
  caution: PALETTE.orange, danger: PALETTE.red, brakeActive: PALETTE.amber,
  // The route's middle state (src/interface.js routeState, SX 2026-10-01): the same amber.
  routeClosing: PALETTE.amber,
  // A hint quieter than secondary text (SX, 2026-09-30: the legend's M HIDE
  // "должны быть более серыми чем основной список"): the palette's gray dimmed to
  // 5.5:1 on black, where secondary text reads 7.5. It was 4.6, which the CRT
  // filter took under AA's 4.5 where the legend stands (QA, 2026-09-30: 4.46
  // through the glass; the vignette at the far left of a large screen takes more).
  textHint: dimToContrast(PALETTE.gray, 5.5),
  // Quieter again, for a panel's heading and key line (the pilot card; SX, 2026-09-30:
  // «приглуши по цвету сильнее»): 4.6:1, still AA.
  textQuiet: dimToContrast(PALETTE.gray, 4.6),
  // The windows' labels in the organism (SX, 2026-10-16, labs/graphics/organism.js: «серый ... слабо отличается от наборного цвета. Он
  // должен быть гораздо прозрачнее»): the gray at AA's least as the look NOW paints it, 4.6:1 (5:1 as written).
  textLabel: dimToContrast(PALETTE.gray, 5),
  // Quieter than any label, for what is not there yet in a window and a count after its name (the sketch's, by SX's eye: 3:1 as painted,
  // under AA, as a disabled control may be).
  textFaint: dimToContrast(PALETTE.gray, 3.41),
  // The line round a menu or a notice (SX, 2026-10-02: «контура меню и нотификаций которые раньше были белые делаем серыми,
  // выбери сам оттенок серого, слишком они контрастные»): the palette's gray at the hint's 5.5:1, quieter than any text in
  // it (secondary 7.5, primary 14.6) and well over the 3:1 a line needs, through the glass too. It was the white.
  frame: dimToContrast(PALETTE.gray, 5.5),
  // The pilot's credits, in the coin's own two inks (sprites/credit.json; SX, 2026-09-30:
  // «количество монет перенеси к горючему и раскрась их в цвета монет», then 2026-10-01:
  // «Монетки у нас двуцветные, раздели по цветам cr и количество (поярче)»): the amount in
  // the light of the coin's ¤ (its accent), the CR label in its gold rim (its body).
  credits: '#FFE7A3',
  creditsLabel: '#D9A441',
  // The story's quests (the opening chapter, the radio's guide, the reference ships' rare quests): the palette's purple (SX's
  // Q1 P1, 2026-10-05).
  story: PALETTE.purple,
});

// The windows (SX, 2026-10-06: «Короче поп-апам давай возвращать белые рамочки, не видно так их, черный фон и белые рамочки надо
// вернуть»): every pop-up's sheet plain black, no veil, and a white hairline round it on its box's own edge (then labs/graphics/sketches/ledger.js
// paintWindow). From SX's V2 LEDGER+ (2026-10-05) until then a window was frameless, its black under a veil a little lighter than
// space; the frame's ink was the gray `frame` above (2026-10-02) before that.
export const WINDOW = Object.freeze({ frame: PALETTE.white });

// The pause's sheet (labs/graphics/pause-menu.js): its window's black has a veil laid over it, so it is one surface a little lighter
// than space (SX of LEDGER: «леджер на черном космосе не заметен, он работает только если у него чуть чуть светлее тон черного»).
// Since SX's pick T2 GRAPHITE on labs/graphics/sketches/window-tints.html (2026-10-05: «не нравится оттенок окон ... хочу на выбор
// цвета посмотреть», then «давай пока графит») it is the palette's white at 0.06, no tint, the same in every look (#0D0D0D painted
// under NOW); `grey` lays nothing (0). The pop-ups wore it too until SX's word of 2026-10-06 (WINDOW, above), and the pause until his
// later word the same day («пауза – это тоже поп-ап»): no window of the game lays it now; the sketch pages that compared it
// (window-tints) read it, and the checks hold that no window lays it. Before it, the same night: the look's interface ink at 0.084
// with the white at 0.018 (T0 on that page; its measures in docs/history/decisions-2026-10-full.md, the menus' tint); before that,
// V2, this.
export const SHEET = Object.freeze({ ink: PALETTE.white, veil: 0.06, grey: PALETTE.white, greyVeil: 0 });

// A quest's ink by its tone (src/quests.js QUEST_TONE, questTone): the one table the quest list, its plates' banners, the top
// banner and the helmet's line, the locator's rings and its route mark, the map's ring and the pointer in the sky read. SX's pick
// Q1 STORY PURPLE on labs/graphics/sketches/quest-colours.html (2026-10-05, «квесты Q1 P1»): only the story turns purple, the
// other kinds keep their inks (red pirates, yellow a ship helped, green a goal within reach, blue an errand). The reference ships'
// `special` was the black hole's violet; it is the story's purple now, a tone of its own still (its plate comes selected and stands
// under the red ones: labs/graphics/quest-list.js).
export const QUEST_INKS = Object.freeze({
  red: PALETTE.red, yellow: PALETTE.amber, green: PALETTE.green, blue: PALETTE.blue,
  story: ROLES.story, special: ROLES.story,
});
