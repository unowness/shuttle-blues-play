// The mouse on the world (SX, 2026-10-03: «Пролетает NPC. Я могу на него заховериться мышкой. Он чуть-чуть как будто
// подлетит ... Я могу по нему кликнуть. И мой корабль его поприветствует ... Если я кликнул на станцию или на гараж ... надо
// тоже как-то его чуть увеличивать, при ховере ... то у нас корабль сам подлетает ко входу, и швартуется»).
//
// What the pointer is over (`targetAt`): a friendly craft of the sector (the fleet's NPC ships, O-08's traffic) or a station
// (the HOME garage among them), by its drawing's box on the screen; none under a menu or the interface (the page asks
// first). The thing under it is World.pointed (`stepPointed`), and its window shows (`pointedMenu`, drawn by labs/graphics/context.js
// as an object's menu is, on M5+'s bearing; it goes as the windows go once the pointer has left): SX, 2026-10-04, «ховер по
// станциям с увеличением их давай вырежем, и нпс тоже, давай просто при ховере контекстное окно показывать». It used to come up a
// little (1.5 %); nothing grows now. A click on the thing itself does nothing, and no key points at it (SX, 2026-10-07: «нет убери
// клик в станцию саму везде только по контекстной меню», «(б) убрать фокус на носу совсем: и со станциями, и с кораблями всё делается
// только через их контекстное окно вблизи»): a station is docked at, a ship greeted, by its window's rows up close (src/menus.js).
import { craftPose, isEnraged } from '../../src/traffic.js';
import { craftCandidate } from '../../src/menus.js';

export const POINT = Object.freeze({ craftBox: 0.8, stationBox: 0.8 });

// The craft or station whose drawing is under (x, y) on the screen, the nearest: { kind: 'craft'|'station', id, craft|station }.
export function targetAt(world, r, x, y) {
  if (!world?.sector) return null;
  let best = null;
  const take = (kind, id, thing, d) => { if (!best || d < best.d) best = { kind, id, [kind]: thing, d }; };
  const z = r.zoom ?? 1;                             // (the drawings' boxes as the camera draws them: src/zoom.js)
  for (const craft of world.trafficHere(world.sector.id, world.time)) {
    if (isEnraged(craft)) continue;                  // an enraged ship is not pointed at for a greeting (src/npcFleet.js)
    const pose = craftPose(craft, world.time, world.width, world.height), s = world.project(r, pose.x, pose.y);
    const reach = Math.hypot(craft.rows[0].length * r.cellW, craft.rows.length * r.cellH) * craft.scale / 2 * POINT.craftBox * z;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d <= reach) take('craft', craft.id, craft, d / reach);
  }
  for (const st of world.stations) {
    const f = st.footprint, s = world.project(r, st.x, st.y);
    const hw = (f ? f.model.width * r.cellW * f.scale / 2 * POINT.stationBox : st.hullRadius ?? 200) * z;
    const hh = (f ? f.model.height * r.cellH * f.scale / 2 * POINT.stationBox : st.hullRadius ?? 200) * z;
    const dx = Math.abs(x - s.x) / hw, dy = Math.abs(y - s.y) / hh;
    if (dx <= 1 && dy <= 1) take('station', st.id, st, Math.max(dx, dy) + 0.5);
  }
  return best;
}

// The thing under the pointer now (World.pointed: targetAt's { kind, id, craft|station }), or null.
export function stepPointed(world, target) {
  world.pointed = target ? { kind: target.kind, id: target.id, [target.kind]: target[target.kind] } : null;
  return world.pointed;
}

// The window of what the pointer is over (World.pointed), as labs/graphics/context.js draws an object's menu: the one the ship gets beside
// it (src/menus.js: a station's name, line and rows; a friendly ship's greeting offer, craftCandidate, greeting.js). Seen from afar, it is shown, not
// used: its rows answer no click and no key (drawContextPlates draws it unlive), and those that act only beside it stand in the quiet ink.
// Null when the pointer is over nothing (the window of the object whose menu stands open is the menu itself: context.js).
export function pointedMenu(world, pointed = world?.pointed) {
  if (!pointed || !world?.sector) return null;
  if (pointed.kind === 'station') return world.menuFor(pointed.id);
  return pointed.kind === 'craft' ? craftCandidate(world, pointed.craft) : null;
}
