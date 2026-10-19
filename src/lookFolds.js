// SPAWN's folds (SX, 2026-10-17, T4 on labs/graphics/sketches/spawn-tidy.html: «Вносим T4 в игру как новый SPAWN»): colours written in the
// code that SPAWN painted within ΔE 3 of each other (OKLab x 100, where glyphs on black read as one), each painted as the one it is filed
// under, so one thing is one ink on the screen. By SX's rules of the same day: «если это два текста разного серого цвета, это надо сводить.
// Если это два элемента интерфейса примерно одинакового цвета, это надо сводить. Если это ... цвет, из которого сувенир, картинка сувенира
// или интерьера становится яснее, то это можно не сводить. Если это два цвета NPC настолько близких, что они почти одинаковые, ни в одном
// NPC, а в двух разных, то это надо сводить».
//
// Read from the real page: tools/ink-census.mjs --sites under SPAWN SOFT (who hands each colour over: function, file, line), the owners of
// every station look's, friendly craft's and NPC paint's inks, and the clusters on the sheet. A text gray folds into the clearest one
// (the hint's: it is 5.5 written because the CRT's glass took 4.6 under AA, src/roles.js); an interface element into the one most seen;
// near colours of two different owners (two NPC ships, two station looks, the boss and a planet) into the interface's role where one is
// near, else the one most seen; the colours of one picture (one paint's three grays, the black hole, one station's tones) stay. The
// windows' own grays are folded in src/frames.js, which no look paints. By written colour; a colour the code computes in a scene the
// census did not play is painted as SPAWN paints it.
//
//   target: [the written colours painted as it]
export const SPAWN_FOLDS = Object.freeze({
  // ROLES.textHint: ROLES.textQuiet (text), #737F83 (boss), #7A7C7F (planet), #7A7D86 (craft NPC N01), ROLES.textLabel (text), #7D838A (planet), #788897 (rock)
  "#7B848E": ["#6F7780", "#737F83", "#7A7C7F", "#7A7D86", "#757D86", "#7D838A", "#788897"],
  // #C1C6CC: #B9C2CC (planet), #BAC6CE (boss), #C6C2CF (sprite)
  "#C1C6CC": ["#B9C2CC", "#BAC6CE", "#C6C2CF"],
  // #003722: #223214 (station greenhouse), as it was folded with the green's old wash (SX, 2026-10-20: «не трогай ... станции»)
  "#003722": ["#223214"],
  // The green's wash, its backing (src/palette.js green, labs/graphics/rail.js washOf; SX, 2026-10-20: «подложка должна быть в тон этого
  // цвета»): #1F330D (interface: the wash of HALCYON's bar in the ruins' tracker, folded with the old green's until then)
  "#20330D": ["#1F330D"],
  // PALETTE.gray: #999CAC (station lattice), #919FAE (station array)
  "#929CA8": ["#999CAC", "#919FAE"],
  // PALETTE.depth: #092F4C (interface), #112E4D (interface)
  "#202C48": ["#092F4C", "#112E4D"],
  // #8CA8BF: #8BABC5 (station), #80A4BC (craft NPC N40, NPC N42)
  "#8CA8BF": ["#8BABC5", "#80A4BC"],
  // ROLES.textFaint: #616467 (interface)
  "#5C626A": ["#616467"],
  // PALETTE.green: #72A843 (station greenhouse, the HALCYON green it was taken from: painted as it was), #7BAD43 (interface: its paleInk)
  "#68A228": ["#72A843", "#7BAD43"],
  // #4E667C: #4C677A (interface)
  "#4E667C": ["#4C677A"],
  // #C79BC8: #C79BB5 (craft NPC N01)
  "#C79BC8": ["#C79BB5"],
  // #9A6668: #946264 (planet)
  "#9A6668": ["#946264"],
  // #9BA3AB: #A2A9AB (craft NPC N23, NPC N37, NPC N40 …4)
  "#9BA3AB": ["#A2A9AB"],
  // #828DB6: #8590B9 (craft NPC N21, NPC N23, NPC N28)
  "#828DB6": ["#8590B9"],
  // #50565C: #4C4F54 (planet)
  "#50565C": ["#4C4F54"],
  // #A5ADB6: #A7B1B6 (boss)
  "#A5ADB6": ["#A7B1B6"],
  // #6A6F75: #5E6B73 (boss)
  "#6A6F75": ["#5E6B73"],
  // #D0898C: #D98C8C (spark)
  "#D0898C": ["#D98C8C"],
  // #A5462A: #A0492F (pirate)
  "#A5462A": ["#A0492F"],
  // #B4B7BF: #B4BCC6 (station greenhouse)
  "#B4B7BF": ["#B4BCC6"],
  // #A66E70: #A56D6F (planet)
  "#A66E70": ["#A56D6F"],
  // #AC96AF: #A69CB4 (station lattice)
  "#AC96AF": ["#A69CB4"],
  // #F0A5C0: #EC9AC8 (interface)
  "#F0A5C0": ["#EC9AC8"],
  // #481F13: #452206 (interface)
  "#481F13": ["#452206"],
  // #E4D6C0: #E8DBBA (pirate)
  "#E4D6C0": ["#E8DBBA"],
  // #C7AD78: #C7AE78 (craft NPC N12, NPC N21, NPC N38 …6)
  "#C7AD78": ["#C7AE78"],
});
