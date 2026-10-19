// The palette: the eleven inks the interface and the world are written in, typed here once (review hygiene 7, 2026-10-03: the same
// hex was typed by hand in twenty files, so a change to one ink meant finding every copy; chat H, 2026-10-04). Everything else
// reads it from here, or through src/roles.js, which names what each ink is for.
//
// The spellings are load-bearing: the colour grade's looks and the lab's ink resolvers know an ink by its exact string
// (labs/graphics/style.js: '#4980af' is not '#4980AF'), so a copy is replaced by a reference only where its spelling was this
// one, and the lower-case spellings the resolvers key on stay as written. checks/art.mjs holds that no file types these
// spellings again.
//
// Amber is the brake lamp's (SX, 2026-09-30: "индикатор желтым оттенком"), the warm yellow the engine flame already used, and
// since 2026-10-01 the route's middle state: the cargo pointer and its timer while the fast bonus melts (SX: «Выбери желтый
// оттенок который уже есть в системе и давай указатель карго сделаем желтым»).
//
// Purple, the tenth, is the story's (SX's pick on labs/graphics/sketches/quest-colours.html, 2026-10-05: «квесты Q1 P1»; before it,
// «сюжетные квесты должны быть покрашены в фиолетовый. Они слишком зеленые, слишком непонятные»): P1, OKLCH L 0.66, C 0.15, h 308
// (src/grade.js fromLch), at the other quest inks' lightness and the red's chroma, its hue clear of the blue (246), the clouds' heather
// (284) and the black hole's violet (296). 6.3:1 on black as written, 6.1:1 as painted under the look NOW (AA).
//
// Green, the route's and the whole interface's, is HALCYON's since 2026-10-20 (SX, of the ruins' tracker: «в моей сессии была зеленая
// полоска restore для halycon и это был очень красивый зеленый, я предлагаю попробовать наш стандартный зеленый заменить на такой»; on
// labs/graphics/sketches/green-halcyon.html, G1: «Берем сто процентов, еще подложка должна быть в тон этого цвета», then «Берем наш текущий
// зеленый во всей системе переделываем под этот зеленый на интерфейсе и в интерфейсе, не трогай только нпс и станции, дроидов покрась»):
// written as the ink SPAWN SOFT paints exactly as it paints HALCYON's bar (the GREENHOUSE look's hue #72A843, labs/graphics/station-art.js):
// #71A24B, with no push of the look's own (src/filmGrade.js: every look's `route` is this ink as written, so the colours round it, the sky's
// among them, keep their paint); 6.8:1 on black as written. The green before it, sage, the eleventh, stays for what SX kept as it was:
// the friendly ships' paint rule and reserve (src/npcPaint.js), the stations' and HOME's lit cells (world-art.js, garage-art.js), the
// legibility the pointers' letters keep on their wash (labs/graphics/notice.js PRAISE_READ), and the old green's literal copies in their
// art (a souvenir's hue, a traffic ship's dot); src/filmGrade.js paints it in every look as it painted the green until then (role `sage`).
export const PALETTE = Object.freeze({
  black: '#000000', depth: '#202C48', blue: '#4980AF', gray: '#929CA8',
  white: '#D6DCE3', green: '#68A228', orange: '#FF9D4D', red: '#E2603A',
  amber: '#FFD27F', purple: '#AC76D8', sage: '#79A78F',
});
