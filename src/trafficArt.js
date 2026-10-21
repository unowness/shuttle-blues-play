// The drawings of the hidden sector's character ships: PLANET EXPRESS, SERENITY,
// X-WING, MILLENNIUM FALCON and DELOREAN (src/traffic.js), and SWORDFISH II since 2026-10-01 (its own note below); and the
// MYSTERY MACHINE since 2026-10-21, a reference ship only (src/specialShips.js), not one of O-08's (its own note below).
import { PALETTE } from './palette.js';

//
// Codex's sheet (labs/graphics/sketches/iconic-ships.html), the `top` pose of each entry
// of SHIP_SPRITES in labs/graphics/sketches/iconic-ships.js, copied here verbatim on
// 2026-09-30: the same glyphs, the same colour keys, the same palettes. SX chose them
// for the hidden sector that day («Вот еще спрайты кораблей в скрытый сектор с
// отсылками»: Codex's drawings replace the old PLANET EXPRESS and SERENITY; X-WING,
// FALCON and DELOREAN are new). The game does not import from the sheet: it is a sketch,
// untracked when this was written, and may move on. A later revision is a deliberate
// re-copy, not a silent change.
//
// Overhead views, nose up, outlines without fills, one character scale (a cell is the
// game's cell: 0.62 x 1.0 em). `glyphs` and `colors` are rows of equal length; a cell of
// `colors` is a key into `palette`, and a space where the glyph is a space. The size
// each is drawn at is src/traffic.js's business.

// Three accents moved on 2026-10-01 by the palette consolidation SX chose (codex/reports/palette/
// PALETTE_HANDOFF_FOR_CLAUDE.md): EXPRESS a #D36B61 -> #CD7063, SERENITY c #779CAF -> #789CB4,
// FALCON e #69A8C8 -> #5EA9D1. The glyphs are as copied.
export const CRAFT_ART = Object.freeze({
  "express": {
    // Express: 13 x 10 cells.
    palette: {"b": "#55A887", "a": "#CD7063", "c": "#DDCCA0"},
    glyphs: [
      "      ^      ",
      "    /---\\    ",
      "   /  o  \\   ",
      "   |     |   ",
      "   |  o  |   ",
      "  /|  |  |\\  ",
      " / |  |  | \\ ",
      "/__\\ [|] /__\\",
      "      |      ",
      "      v      ",
    ],
    colors: [
      "      b      ",
      "    bbbbb    ",
      "   b  c  b   ",
      "   b     b   ",
      "   b  c  b   ",
      "  bb  a  bb  ",
      " b b  a  b b ",
      "bbbb cac bbbb",
      "      a      ",
      "      a      ",
    ],
  },
  "serenity": {
    // Serenity: 17 x 14 cells.
    palette: {"b": "#A5ACB5", "c": "#789CB4", "e": "#D8A25A"},
    glyphs: [
      "       /^\\       ",
      "      /   \\      ",
      "     / [o] \\     ",
      "     \\  |  /     ",
      "      | | |      ",
      "     /  |  \\     ",
      " /\\_(  ___  )_/\\ ",
      "/: \\| /   \\ |/ :\\",
      "|| |( | : | )| ||",
      "|--| \\ ___ / |--|",
      "\\__/ (=====) \\__/",
      "      \\ : /      ",
      "       \\|/       ",
      "        V        ",
    ],
    colors: [
      "       bbb       ",
      "      b   b      ",
      "     b ccc b     ",
      "     b  c  b     ",
      "      b c b      ",
      "     b  c  b     ",
      " bbbb  ccc  bbbb ",
      "bc bb c   c bb cb",
      "bc bb c c c bb cb",
      "bccb b ccc b bccb",
      "bbbb beeeeeb bbbb",
      "      b c b      ",
      "       bcb       ",
      "        b        ",
    ],
  },
  "x-wing": {
    // X-wing: 13 x 10 cells.
    palette: {"b": "#D5D3C7", "a": "#CD7063", "c": "#789CB4"},
    glyphs: [
      "      ^      ",
      "     / \\     ",
      "     | |     ",
      "     | |     ",
      "|    |o|    |",
      "| ___| |___ |",
      "|/ [ | | ] \\|",
      "|__| | | |__|",
      "   | |_| |   ",
      "   =     =   ",
    ],
    colors: [
      "      b      ",
      "     b b     ",
      "     a a     ",
      "     b b     ",
      "b    bcb    b",
      "b aabb bbaa b",
      "bb b b b b bb",
      "bbbb b b bbbb",
      "   b bbb b   ",
      "   b     b   ",
    ],
  },
  "falcon": {
    // Falcon: 19 x 14 cells.
    palette: {"b": "#B6BDC4", "a": "#A89B87", "e": "#5EA9D1"},
    glyphs: [
      "      /|   |\\      ",
      "     / |   | \\     ",
      "    / o|   |o \\ /_\\",
      "   /   |___|    [o]",
      "  /   \\  |  /  / / ",
      " / [ ]   |   / /  |",
      "(     \\ ___/ /    )",
      "|------( o )------|",
      "(    /  ---  \\    )",
      "(  [ ] o o o [ ]  )",
      " \\     o o o     / ",
      "  \\  /       \\  /  ",
      "    \\_________/    ",
      "      =======      ",
    ],
    colors: [
      "      bb   bb      ",
      "     b b   b b     ",
      "    b ab   ba b bbb",
      "   b   bbbbb    beb",
      "  b   a  a  a  b b ",
      " b a a   a   b b  b",
      "b     a bbbb b    b",
      "bbbbbbbb b bbbbbbbb",
      "b    a  bbb  a    b",
      "b  a a a a a a a  b",
      " b     a a a     b ",
      "  b  a       a  b  ",
      "    bbbbbbbbbbb    ",
      "      eeeeeee      ",
    ],
  },
  "delorean": {
    // DeLorean: 11 x 10 cells.
    palette: {"b": "#C3CCD3", "a": "#80909F", "e": "#5EA9D1"},
    glyphs: [
      "   _____   ",
      "  /_   _\\  ",
      "[]|     |[]",
      "  |/___\\|  ",
      "  ||   ||  ",
      "  |\\___/|  ",
      "[]|o : o|[]",
      "  |/\\ /\\|  ",
      "  \\|| ||/  ",
      "   == ==   ",
    ],
    colors: [
      "   bbbbb   ",
      "  bb   bb  ",
      "aab     baa",
      "  bbbbbbb  ",
      "  bb   bb  ",
      "  bbbbbbb  ",
      "aaeb e beaa",
      "  bbb bbb  ",
      "  bbb bbb  ",
      "   ee ee   ",
    ],
  },
  // Swordfish II: 23 x 16 cells. Codex's sixth character ship, Spike Spiegel's, copied verbatim on 2026-10-01 from
  // codex/handoffs/swordfish-ii/traffic-art.json (revision 4, the one SX accepted: the cabin a separate small pod,
  // «я бы ... Спайка Шпигеля в игру ... в секретный сектор, и иногда он может появиться»).
  "swordfish-ii": {
    // Swordfish II: 23 x 16 cells.
    palette: {"b": "#CD7063", "a": "#A5ACB5", "c": "#D8A25A"},
    glyphs: [
      "           |           ",
      "           |           ",
      "           |           ",
      "           |           ",
      "          / \\          ",
      "|         | |         |",
      "|\\        | |        /|",
      "| \\______/   \\______/ |",
      "\\__|_____\\ v /_____|__/",
      "          .-.          ",
      "         ([o])         ",
      "          '-'          ",
      "           |           ",
      "          |:|          ",
      "        /[===]\\        ",
      "        \\__|__/        ",
    ],
    colors: [
      "           a           ",
      "           a           ",
      "           b           ",
      "           b           ",
      "          b b          ",
      "b         b b         b",
      "bb        b b        bb",
      "b bbbbbbbb   bbbbbbbb b",
      "bbbbbbbbbb b bbbbbbbbbb",
      "          bbb          ",
      "         bcccb         ",
      "          bbb          ",
      "           a           ",
      "          aaa          ",
      "        baaaaab        ",
      "        bbbbbbb        ",
    ],
  },
  // The Mystery Machine: 7 x 7 cells. Not Codex's: drawn on labs/graphics/sketches/scooby-van.html, SX's V11 MINI II (2026-10-21: «берем
  // V11 Mini 2 и цветочек только перенеси на серединку»), in BOKS's manner at the friendly ships' size, worn as the die-cast toy he sent
  // wears it: the lime spare wheel with its orange flower on the chrome bumper, the yellow lamps, the windscreen, the turquoise sides,
  // the lime wave in them with the wheels hidden under them, a flower in the middle of the roof, the two exhaust pipes (its smoke,
  // src/scoobySnacks.js). The lamps are the palette's amber, the rest the van's own.
  "mystery-machine": {
    palette: {"b": "#4FB3C2", "g": "#8BB33F", "o": "#F0913A", "w": "#BFD9E0", "l": PALETTE.amber, "c": "#C3CCD3", "k": "#4E545B"},
    glyphs: [
      " -(✿)- ",
      "/o   o\\",
      "[=====]",
      "{‖   ‖}",
      "{‖ ✿ ‖}",
      "[\\___/]",
      " \"   \" ",
    ],
    colors: [
      " cgogc ",
      "bl   lb",
      "kwwwwwk",
      "gb   bg",
      "gb o bg",
      "kbbbbbk",
      " c   c ",
    ],
  },
});
