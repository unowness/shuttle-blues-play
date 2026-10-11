// The palette: the ten inks the interface and the world are written in, typed here once (review hygiene 7, 2026-10-03: the same
// hex was typed by hand in twenty files, so a change to one ink meant finding every copy; chat H, 2026-10-04). Everything else
// reads it from here, or through src/roles.js, which names what each ink is for.
//
// The spellings are load-bearing: the colour grade's looks and the lab's ink resolvers know an ink by its exact string
// (labs/graphics/style.js: '#4980af' is not '#4980AF'), so a copy is replaced by a reference only where its spelling was this
// one, and the lower-case spellings the resolvers key on stay as written. checks/palette.mjs holds that no file types these
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
export const PALETTE = Object.freeze({
  black: '#000000', depth: '#202C48', blue: '#4980AF', gray: '#929CA8',
  white: '#D6DCE3', green: '#79A78F', orange: '#FF9D4D', red: '#E2603A',
  amber: '#FFD27F', purple: '#AC76D8',
});
