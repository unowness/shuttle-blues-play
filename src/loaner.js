// SCOOTY JR., the courtesy shuttle of the opening (codex/start-and-narrative/CAMPAIGN.md 01-02; SX, 2026-10-04: the loaner is
// SCOOTY JR., «нет scooty jr.», and its mechanic at the first station is SCOOTY, whose junior it is; its look L01 SCOOTER, «берем lo1
// scooty», on labs/graphics/sketches/loaner-shuttle.html). A new pilot leaves HOME in it while their own shuttle is in service, flies
// it to the first station and hands it back there (src/opening.js). It is never one of the pilot's ships: not in the hangar
// (src/hangar.js SHIPS), never bought, stored or saved as owned, and a pilot who is past the opening never sees it.
//
// What it is, in one place: its drawing (ships/scooty-jr.json, the sketch's model as SX picked it, turned end for end so it flies with
// the handlebar at the back, SX 2026-10-05: «Скутер начальный должен лететь ручкой назад, а то непонятное управление»; frame 0 the idle
// pose, the rest the puff of its one side jet, still trailing), its chassis (src/chassis.js `loaner`: physics never come from the drawing; and what it can do,
// `can`: it only jumps, no drift and no gun, SX 2026-10-04), and its livery,
// HOME's warm hull and lamp (the garage's own tones, labs/graphics/garage-art.js homeInks), which the ship's painter passes as they
// are instead of reading them as roles (labs/graphics/world-art.js shipInk) and never repaints with the pilot's paint.
export const LOANER = Object.freeze({
  id: 'scooty-jr',
  label: 'SCOOTY JR.',
  chassis: 'loaner',
  model: 'ships/scooty-jr.json',
  livery: Object.freeze(['#bd9c5e', '#ffd27f']),
});

// The two livery inks, lower case, as the painter compares them.
export const LOANER_LIVERY = new Set(LOANER.livery);

// Whether the ship flown now is SCOOTY JR.: the chassis is set exactly while it is flown (src/opening.js), so the drawing and the
// menus read the same fact.
export const flyingLoaner = (world) => world?.ship?.chassis?.id === LOANER.chassis;
