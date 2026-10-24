import { CONFIG } from './config.js';
import { CRAFT_ART } from './trafficArt.js';
import { normalizeModel } from './asciiModel.js';
import { clamp } from './util.js';

// The reference ships of the rare quests (six, the MYSTERY MACHINE since 2026-10-21 and CLIPPER since 2026-10-22) (QUESTS_V2_HANDOFF.md, round three; SX, 2026-10-02: «Специальные квесты
// награждаются каким-то цветом, или, возможностью применить этот корабль на себя ... они должны цветовую схему давать,
// как бы в стиле их корабля для штурвала, нижней части. Плюс подарить краску в для твоего кораблика в стиле их
// корабля, памятную записку какую-то оставлять, которая в гараже можно читать и смотреть об этой истории рассказывать
// от их лица»). They are O-08's character ships (src/traffic.js, Codex's drawings in src/trafficArt.js): one stands in
// a grid sector now and then, asking for a pilot, and the pilot borrows it for its quest (src/specials.js).
//
// Per ship, here: the drawing it is flown in (the same cells and colours the traffic is drawn with, as a Ship model,
// at its own scale), its chassis (src/chassis.js `special-<id>`), the rewards it leaves (a paint in src/paint.js, a
// cockpit scheme below, a memento note), and the words (the text pass SX approved on 2026-10-24, codex/text-review/2026-10-24,
// the names its `cast`): `meet` what its crew says as the pilot comes up, one line at a time over it (a line's short form, its third
// part, in the strip where it has one; every line whole in its window), `brief` the rest of its window's talk before TAKE
// CONTROLS, `road` the exchanges on the way, each said once at its moment (src/specialQuests.js `road`) in strips over the ship
// flown, `end` its window once the quest is won (a call, src/specials.js; one line of it, the paint and the ship to be called for from HOME
// on the radio, is SX's of the same day: «упоминай в финальном диалоге, что помимо краски, что ты можешь у себя дома всегда набрать нам по
// радио, чтобы мы тебя подвезли», the crews' ships in the hangar, src/hangar.js CREW_SHIPS), `failed` the notice's line when it is not; a line is
// [who, words, short?], and `meet` and `brief` may be the plan's (`p`). Its note is no letter of its crew's since that pass but a
// word about the film or the show it comes from (the package's sources, its reference notes).
//
// A cockpit scheme is three inks in the ship's own palette, for the cockpit's bars and the helm
// (labs/graphics/cockpit-scheme.js maps the interface's blue and grey, and the stick's, onto them): `line` the bars and
// the helm's base and stem, `accent` the console's grey parts, `grip` the stick's grip.

const note = (s) => s.replace(/\s+/g, ' ').trim();

export const SPECIALS = Object.freeze([
  {
    id: 'delorean', craft: 'delorean', label: 'DELOREAN', who: 'MARTY', scale: 1.35,
    paint: 'sp-delorean', cockpit: { label: 'DELOREAN', line: '#80909F', accent: '#5EA9D1', grip: '#C3CCD3' },
    cast: ['MARTY', 'DOC'],
    words: {
      meet: (p) => [['MARTY', `DOC'S WAITING FOR THE CAR BY ${p.dest.name}. AND SOMEHOW I'M BACK HERE AGAIN.`, `DOC'S WAITING BY ${p.dest.name}.`], ['MARTY', "COULD YOU DRIVE US THERE? DOC NEEDS TO LEAVE SOON, AND I STILL CAN'T FIND THE WAY.", "COULD YOU DRIVE? I CAN'T FIND THE WAY."]],
      brief: [['MARTY', 'DOC, I FOUND SOMEONE TO DRIVE US.'], ['DOC', 'GOOD. NO MORE LAPS, MARTY. I SHOULD BE LEAVING BY NOW.']],
      road: [[['DOC', 'MARTY, DID YOU MISS THE TURN AGAIN?'], ['MARTY', "WE'RE FINE, DOC. I'M NOT DRIVING THIS TIME."]]],
      end: [['DOC', 'I CAN STILL MAKE IT. THANK YOU! MARTY, GET IN.'], ['DOC', "THE PAINT'S YOURS. NEED THE CAR AGAIN? RADIO US FROM HOME, WE'LL BRING IT OVER."], ['MARTY', 'CAN YOU SHOW ME WHERE I KEPT TAKING THE WRONG TURN?']],
      failed: 'THE DELOREAN WAS NOT DELIVERED.',
    },
    note: { title: 'BEFORE THE DELOREAN', text: note('One early version of the time machine was a refrigerator: the traveller would climb inside and shut the door. Robert Zemeckis said they abandoned the idea because children might imitate it. The filmmakers then decided the time machine should be mobile, bringing a sports car into the design.') },
  },
  {
    id: 'swordfish', craft: 'swordfish-ii', label: 'SWORDFISH II', who: 'SPIKE', scale: 0.8,
    paint: 'sp-swordfish', cockpit: { label: 'SWORDFISH', line: '#CD7063', accent: '#D8A25A', grip: '#A5ACB5' },
    cast: ['SPIKE', 'JET'],
    words: {
      meet: (p) => [['SPIKE', `THERE'S A GANG TO CLEAR OUT OF ${p.ground.name}. ${p.total} SHIPS.`, `${p.ground.name}. ${p.total} PIRATES. WANT THE JOB?`], ['SPIKE', "YOU CAN TAKE SWORDFISH IF YOU WANT THE JOB. JET'S HANDLING IT. HE'LL PAY YOU.", 'TAKE THE JOB. YOU CAN USE SWORDFISH.']],
      brief: [['JET', "WE'RE BEING PAID TO CLEAR ONE GANG. I'LL LET YOU KNOW WHEN WE'RE DONE."]],
      road: [[['JET', "HERE'S THE FIRST GROUP. NO SIGN OF THE REST YET.", 'FIRST GROUP. NO SIGN OF THE REST YET.']], [['JET', 'ANOTHER GROUP. I HAVE THEM ON SCREEN.']]],
      end: [['JET', "THAT TAKES CARE OF THEM. I'VE SENT YOUR MONEY."], ['JET', "THE PAINT'S IN YOUR KIT. NEED SWORDFISH? RADIO US FROM HOME, WE'LL BRING HER."], ['SPIKE', 'SO, JET. WE HEADING HOME?']],
      failed: 'FAILED TO DRIVE THE GANG OFF.',
    },
    note: { title: "SWORDFISH'S ROUND LIGHTS", text: note("Designer Kimitoshi Yamane approached Cowboy Bebop's machines as used cars rather than brand-new weapons. He drew on older Hollywood films whose detectives and bounty hunters drove classic sports cars. Even Swordfish's round lights came from that automotive image.") },
  },
  {
    id: 'express', craft: 'express', label: 'PLANET EXPRESS', who: 'THE CREW', scale: 1.15,
    paint: 'sp-express', cockpit: { label: 'P. EXPRESS', line: '#55A887', accent: '#CD7063', grip: '#DDCCA0' },
    cast: ['LEELA', 'FRY', 'BENDER'],
    words: {
      meet: [['LEELA', "ARE YOU FREE? WE'VE STILL GOT DELIVERIES TO MAKE, AND I'VE BEEN FLYING ALL NIGHT.", 'ARE YOU FREE FOR A DELIVERY RUN?'], ['FRY', 'I CAN HANDLE THE CARGO.'], ['LEELA', "GOOD, FRY. I'LL SORT OUT THE STOPS. WE'LL USE OUR SHIP.", "FRY, YOU HANDLE CARGO. I'LL SORT THE ROUTE."]],
      brief: (p) => [['LEELA', `WE LOAD AT ${p.planet.name}. ${p.cars} CRATES, ${p.stops.length} STOPS. DROP OFF ONE AT EACH STATION.`], ['BENDER', "HOLD ON. WE'RE PAYING THE PILOT TOO?"], ['LEELA', 'YES, BENDER. FOR DOING THE WORK.']],
      road: [[['LEELA', "WE'RE SLOWER WITH THE CARGO. TAKE IT EASY COMING INTO THE STATIONS.", "WE'RE SLOWER LOADED. EASY ON APPROACH."]], [['FRY', "WE'RE DONE HERE. THEY'VE GOT THE CRATE."], ['LEELA', 'ON TO THE NEXT ONE. FRY, CHECK THE NEXT CRATE BEFORE WE GET THERE.', 'NEXT STOP. FRY, CHECK THE NEXT CRATE.']]],
      end: [['LEELA', "LAST ONE. WE CAN HEAD HOME. YOUR PAY'S ALREADY SENT."], ['BENDER', 'AND MINE?'], ['LEELA', "WE'LL SETTLE UP AT HOME."], ['FRY', "OH, THE PAINT'S YOURS. NEED THE SHIP? RADIO US FROM HOME, WE'LL BRING IT OVER."]],
      failed: 'THE DELIVERY ROUTE WAS NOT COMPLETED.',
    },
    note: { title: 'A THEOREM FOR FUTURAMA', text: note('For "The Prisoner of Benda," the writers devised a mind-switching machine that could use each pair of bodies only once. David X. Cohen recalled that Ken Keeler proved two previously unswitched participants were enough to restore everyone to their own bodies. The proof appeared on screen as part of the resolution.') },
  },
  {
    id: 'falcon', craft: 'falcon', label: 'MILLENNIUM FALCON', who: 'HAN', scale: 0.85,
    paint: 'sp-falcon', cockpit: { label: 'FALCON', line: '#A89B87', accent: '#5EA9D1', grip: '#B6BDC4' },
    cast: ['HAN', 'CHEWIE'],
    words: {
      meet: (p) => [['HAN', `WANT TO EARN SOME CREDITS? THERE'S A GANG DUG IN AROUND ${p.dest.name}. I NEED THEM CLEARED OUT.`, `JOB AT ${p.dest.name}: PIRATES.`], ['HAN', "YOU'LL FLY THE FALCON. CHEWIE AND I WILL DEAL WITH THE CARGO. I'LL PAY YOU FOR THE FLIGHT.", "TAKE THE FALCON. I'LL PAY FOR THE FLIGHT."]],
      brief: [['HAN', "DON'T LEAVE AFTER THE FIRST GROUP. THIS GANG HAS FRIENDS TO CALL."], ['HAN', "CHEWIE, SECURE THE CARGO. I DON'T WANT TO SPEND THE TRIP PICKING IT UP."]],
      road: [[['HAN', 'THERE THEY ARE.']], [['CHEWIE', 'RRRAAH!'], ['HAN', 'I SEE THEM, CHEWIE. MORE COMING.']]],
      end: [['HAN', "THAT'S THE LAST OF THIS GANG."], ['HAN', "YOU'VE GOT YOUR MONEY, PILOT. NICE WORK."], ['HAN', 'KEEP THE PAINT. NEED THE FALCON? RADIO US FROM HOME. CHEWIE WILL BRING HER.']],
      failed: "HAN'S JOB WAS NOT COMPLETED.",
    },
    note: { title: "ON THE AVENGER'S HULL", text: note("In The Empire Strikes Back, the Falcon's hyperdrive fails again during the chase. Han turns toward the Star Destroyer Avenger, skims its bridge and attaches the Falcon to its hull. The Imperials lose their target. When the task force disperses, the Falcon detaches, but Boba Fett has anticipated the manoeuvre and keeps following.") },
  },
  {
    id: 'serenity', craft: 'serenity', label: 'SERENITY', who: 'THE CREW', scale: 0.9,
    paint: 'sp-serenity', cockpit: { label: 'SERENITY', line: '#789CB4', accent: '#D8A25A', grip: '#A5ACB5' },
    cast: ['KAYLEE', 'MAL'],
    words: {
      meet: (p) => [['KAYLEE', "MAL, GET DOWN HERE. I CAN'T HOLD THIS PANEL ON MY OWN.", "MAL, I CAN'T HOLD THIS PANEL ON MY OWN."], ['MAL', `COMING. CAN YOU GET US TO ${p.dest.name}? KAYLEE NEEDS ME DOWN THERE.`, `CAN YOU GET US TO ${p.dest.name}?`]],
      brief: [['KAYLEE', "THE ENGINE'S RUNNING. BUT WE CAN'T FIX THE HULL OUT HERE. GET US TO THE STATION."]],
      road: [[['KAYLEE', "MAL, DON'T TELL THEM SHE JUST NEEDS A LITTLE PATCHING UP.", "DON'T CALL IT A LITTLE PATCH JOB, MAL."], ['MAL', "LET'S GET THERE FIRST. I'LL HAGGLE LATER."]]],
      end: [['KAYLEE', 'THERE IT IS. MAL, CALL THE STATION.'], ['MAL', 'THANKS FOR GETTING US HERE.'], ['KAYLEE', "THE PAINT'S YOURS. ONCE SHE'S PATCHED, RADIO US FROM HOME AND WE'LL BRING HER OVER."], ['MAL', 'STATION, THIS IS SERENITY. WE NEED HULL REPAIRS. CAN YOU TAKE US?']],
      failed: 'THE STATION WAS NOT REACHED.',
    },
    note: { title: 'CRASHING SERENITY', text: note("Serenity's crash landing in the film was shot using a miniature built by Grant McCune Design and photographed by Bill Taylor of Illusion Arts. Digital environments were added around it, combining the model crash and computer-generated scenery in the finished sequence.") },
  },
  {
    id: 'xwing', craft: 'x-wing', label: 'X-WING', who: 'RED FIVE', scale: 1.2,
    paint: 'sp-xwing', cockpit: { label: 'X-WING', line: '#CD7063', accent: '#789CB4', grip: '#D5D3C7' },
    cast: ['RED FIVE'],
    words: {
      meet: [['RED FIVE', "RED FIVE. I NEED THE X-WING FERRIED TO A RENDEZVOUS. IT'S URGENT.", 'RED FIVE. NEED THE X-WING FERRIED.'], ['RED FIVE', "CAN YOU TAKE THE FIGHTER? I'LL SEND THE COORDINATES.", 'CAN YOU TAKE THE FIGHTER?']],
      brief: (p) => [['RED FIVE', `RENDEZVOUS AT ${p.dest.name}. THEY'RE EXPECTING THE FIGHTER. REACH THEM BEFORE THEY LEAVE.`], ['RED FIVE', "THERE WILL BE PIRATES ON THE ROUTE. I'LL STAY ON COMMS UNTIL THE HANDOVER."]],
      road: [[['RED FIVE', "THE RECEIVING PARTY'S BEEN NOTIFIED. THEY'RE WAITING.", "THEY KNOW YOU'RE COMING. THEY'RE WAITING."]], [['RED FIVE', 'NEW CONTACTS BEHIND YOU. KEEP HEADING FOR THE RENDEZVOUS.', 'NEW CONTACTS. KEEP HEADING THERE.']]],
      end: [['RED FIVE', "THEY HAVE YOU IN SIGHT. THEY'LL TAKE IT FROM HERE."], ['RED FIVE', "THE PAINT'S YOURS. NEED THE FIGHTER AGAIN? RADIO FROM HOME, WE'LL FERRY IT OVER."], ['RED FIVE', 'THANK YOU, PILOT. RED FIVE, OUT.']],
      failed: 'THE FIGHTER DID NOT REACH THE RENDEZVOUS.',
    },
    note: { title: 'THE FINAL DEATH STAR RUN', text: note("In A New Hope, Luke flies as Red Five. During the final trench run he loses his wingmen, and Darth Vader closes in behind him. Han returns in the Falcon and breaks up Vader's attack. Luke is able to fire his torpedoes into the exhaust port, destroying the Death Star.") },
  },
  // The seventh (SX, 2026-10-21: «давай добавим нового отсылочного NPC. Это фургончик Скуби-Ду. Квест у него будет. Ты садишься в
  // тачку»): the Mystery Machine, its drawing SX's V11 at the friendly ships' 1.5, its quest the Scooby snacks laid as trails
  // (src/specialQuests.js scooby, src/scoobySnacks.js).
  {
    id: 'scooby', craft: 'mystery-machine', label: 'MYSTERY MACHINE', who: 'THE GANG', scale: 1.5,
    paint: 'sp-scooby', cockpit: { label: 'MYSTERY', line: '#4FB3C2', accent: '#8BB33F', grip: '#F0913A' },
    cast: ['SHAGGY', 'SCOOBY'],
    words: {
      meet: [['SHAGGY', 'HEY, OUR HATCH CAME OPEN. WE SPILLED ALL THE SCOOBY SNACKS.', 'HATCH CAME OPEN. SPILLED ALL THE SNACKS!'], ['SCOOBY', 'OUR SNACKS?!'], ['SHAGGY', "COULD YOU DRIVE? SCOOB AND I'LL PICK THEM UP.", "YOU DRIVE. WE'LL PICK UP THE SNACKS."]],
      brief: [['SHAGGY', "WE'VE GOT TO PICK UP THE OTHERS SOON. LET'S GET MOST OF THEM BACK, AT LEAST."], ['SHAGGY', 'SCOOB, CLOSE THE HATCH, WOULD YOU?']],
      road: [[['SCOOBY', "SHAGGY, I'M HUNGRY."], ['SHAGGY', "ME TOO. LET'S PICK THEM UP FIRST, OKAY?"]]],
      end: [['SHAGGY', "THAT'LL DO, SCOOB. WE STILL HAVE TO PICK UP THE OTHERS."], ['SHAGGY', "LIKE, THE PAINT'S YOURS. NEED THE VAN? RADIO US FROM HOME, WE'LL DRIVE IT OVER."], ['SCOOBY', 'NOW CAN WE EAT?'], ['SHAGGY', 'NOW YOU CAN. SAVE SOME FOR ME.']],
      failed: 'NOT ENOUGH SCOOBY SNACKS RECOVERED.',
    },
    note: { title: 'WHY SCOOBY LOOKS THAT WAY', text: note('Iwao Takamoto, who designed Scooby, asked a studio colleague about the prize-winning Great Danes she bred. She explained the legs, chin and other features of a well-bred dog. Takamoto deliberately changed some of those proportions, drawing bowed legs instead of straight ones to make the dog look comic rather than show-ring perfect.') },
  },
  // The eighth (SX, 2026-10-21: «Clipper тоже превратим в отсылочный корабль и в нем буду я и мой друг паша, который тестировал»; built on
  // «Насчет квеста, с Рокси и Ковальски, ну, пора делать», 2026-10-22, from labs/graphics/sketches/clipper-beta.html): CLIPPER, SX's own
  // first drawing (ships/spaceship.json, the STANDARD's look of that name, src/shipLooks.js), SX as ROUXEE and Pasha as KWLSK aboard. The
  // pilot never flies it: it is led (`escort`), to TERRA (src/clipper.js), and leaves what the seven leave but a ship for the hangar (SX's
  // R1: «КАК У СЕМИ ... CLIPPER в ангаре остаётся как сегодня»): its paint SUPRA (its G8), a cockpit in its inks, a note from the two, CR.
  // No craft of O-08's traffic: the page draws it from the look (labs/graphics/clipper-art.js, lent as world.clipperArt).
  {
    id: 'clipper', escort: true, label: 'CLIPPER', who: 'ROUXEE & KWLSK', scale: 1.5,
    paint: 'sp-clipper', cockpit: { label: 'CLIPPER', line: '#F07B1F', accent: '#86DC32', grip: '#5CC4FF' },
    note: { title: 'FROM ROUXEE & KWLSK', text: note(`We made it to TERRA. The test was still running, so we found two new bugs on the way in.
      Thanks for leading, dude. The paint is yours. - R. & K.`) },
  },
]);

export const specialById = (id) => SPECIALS.find((s) => s.id === id) ?? null;
export const SPECIAL_IDS = Object.freeze(SPECIALS.map((s) => s.id));

// Every ink a reference ship is drawn in: its palette, passed through the page's colour resolver as it is (CLIPPER's are its paint's).
export const SPECIAL_INKS = new Set(SPECIALS.filter((s) => s.craft).flatMap((s) => Object.values(CRAFT_ART[s.craft].palette)));

// What an escorted ship's drawing is to the world (its size, for its menu's marks and its hails' shoulder): CLIPPER's file is 8 x 6 cells at
// the STANDARD's 1.5, as the look the page registers is (src/shipLooks.js); the world draws none of its own (src/clipper.js).
const ESCORTED = Object.freeze({ width: 8, height: 6, scale: 1.5, baseScale: 1.5, cells: Object.freeze([]) });

// A ship's model for the world's Ship (src/ship.js): the traffic drawing's glyphs, each in its palette colour, pivoting
// on the middle of the drawing, nose up, drawn `scale` times the game's cell. `baseScale` is what the page's
// breathing scale (labs/graphics/main.js updateShipScale) goes from.
const models = new Map();
export function specialModel(id) {
  if (models.has(id)) return models.get(id);
  const sp = specialById(id);
  if (sp.escort) return ESCORTED;
  const art = CRAFT_ART[sp.craft];
  const cells = [];
  art.glyphs.forEach((row, j) => Array.from(row).forEach((ch, i) => {
    if (ch === ' ') return;
    cells.push({ x: i, y: j, ch, color: art.palette[art.colors[j]?.[i]] ?? art.palette.b });
  }));
  const model = normalizeModel({ name: sp.label, cells, scale: sp.scale }, sp.id);
  model.baseScale = model.scale;
  models.set(id, model);
  return model;
}

// The rows the ship is drawn in at (cols x rows of its drawing), for the menu's marks and the hail's shoulder.
export const specialSize = (id) => ({ width: specialModel(id).width, height: specialModel(id).height });

// A model's cells at `heading`, glyph by glyph, as Ship.draw does: `skip(cell)` leaves a cell out, `ink` one colour for
// the lot. Used for the ship standing where it was met, the pilot's own ship parked, and the ship flown.
export function drawModel(r, model, sx, sy, heading, { alpha = 1, ink = null, skip = null, cells = null } = {}) {
  const w = r.cellW * model.scale, h = r.cellH * model.scale;
  const a = heading + Math.PI / 2 + (model.baseRotation || 0), ca = Math.cos(a), sa = Math.sin(a);
  const list = cells ?? (model.frames?.length > 1 ? model.frames[model.idleFrame] : model.cells);
  for (const c of list) {
    if (skip && skip(c)) continue;
    const lx = c.x * w, ly = c.y * h;
    r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, a, ink ?? c.color, alpha, model.scale);
  }
}

// ---- a ship coming apart ---------------------------------------------------------------------------------------------

// How much of a ship is gone for the share of hull it has left: nothing from `from` up, a growing part below it, at most
// `most` of its cells at the last (SERENITY's, src/specialQuests.js; SX: «ее спрайт как-то разрушается, ... искры
// начинают появляться»).
const BREAKUP = Object.freeze({ from: 0.7, most: 0.5 });
export const brokenShare = (hullShare) => clamp((BREAKUP.from - hullShare) / BREAKUP.from, 0, 1) * BREAKUP.most;

const hash = (a, b) => {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// Whether a cell is gone at `share`: each has a fixed place in the order it goes in (by its own hash), so a ship breaks
// the same way every time and a cell once gone stays gone as the hull falls.
export const cellGone = (c, share) => share > 0 && hash(Math.round(c.x * 4), Math.round(c.y * 4)) < share;

// The cells that are gone, for the sparks to come from.
export function goneCells(model, share) {
  const cells = model.frames?.length > 1 ? model.frames[model.idleFrame] : model.cells;
  return cells.filter((c) => cellGone(c, share));
}

// The flown ship: its cells in their colours (those gone left out, the rest flickering a little more the worse it is), the
// drive's flame behind it while the engine burns (unless `flame` is false: the MYSTERY MACHINE smokes instead), the respawn's blink. `share` is the broken share (brokenShare).
export function drawFlown(r, ship, sx, sy, { share = 0, time = 0, flame = true } = {}) {
  if (!ship.alive) return;
  const model = ship.model, m = ship.metrics || ship.measureDrawing(r.cellW, r.cellH);
  const blink = ship.invuln > 0 && (Math.floor(ship.invuln * 12) & 1) === 0;
  const alpha = blink ? 0.32 : 1;
  const a = ship.facing, ca = Math.cos(a), sa = Math.sin(a);
  if (flame && ship.thrusting) {
    let rear = 0;
    for (const c of ship.frameCells) if (c.y > rear) rear = c.y;
    const pal = CONFIG.ship.colors.flame, flicker = 0.55 + 0.45 * Math.sin(ship.flamePhase);
    [['v', 1], ['·', 2.1]].forEach(([ch, k], i) => {
      const ly = (rear + k) * m.h;
      r.glyphRot(ch, sx - ly * sa, sy + ly * ca, a, pal[(i + Math.floor(ship.flamePhase * 0.5)) % pal.length], alpha * flicker, model.scale);
    });
  }
  for (const c of ship.frameCells) {
    if (share && cellGone(c, share)) continue;
    // A worn ship's cells dim and come back at times, past a third of its cells gone.
    const dim = share > 0.15 && hash(Math.round(c.x * 4) + 7, Math.round(c.y * 4) + Math.floor(time * 3)) < share * 0.6 ? 0.45 : 1;
    const lx = c.x * m.w, ly = c.y * m.h;
    r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, a, c.color, alpha * dim, model.scale);
  }
}

// The pilot's own ship left where it was, dark and still: the model it flies, one quiet ink.
export function drawParked(r, parked, sx, sy) {
  const model = parked.model;
  const keep = model.scale;
  model.scale = model.baseScale ?? keep;
  drawModel(r, model, sx, sy, parked.angle, { ink: CONFIG.hud.hint, alpha: 0.85 });
  model.scale = keep;
}
