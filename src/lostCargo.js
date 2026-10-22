// The cargo lying in space (cut out of src/world.js, PLAN D3, 2026-10-09; the code is as it was, `this` now `world`): the pilot's own, left
// where a wreck stranded it, and other pilots' (src/strangers.js). Where a lost container comes to rest, how a sector's are built from
// the ledger, the menu (RECOVER CARGO, REPLAY FLIGHT) and the pickup, the replay of how one was lost, and the going home of cargo left too
// long. World keeps a one-line method of each name the menus, the wreck, the pirates' den, the ruins and the checks call.
import { CONFIG } from './config.js';
import { clamp, wrapTo, hashId } from './util.js';
import { WRAP } from './topology.js';
import { contractById } from './contracts.js';
import { makeTow } from './tow.js';
import { openStrangersIn } from './strangers.js';

// Cargo lost here on an earlier flight, where it came to rest. Built from
// the ledger like the finds (World.buildFinds): taking it removes the record, and the
// container simply stops being built. After the pilot's own come other
// pilots' (src/strangers.js), each until it is taken or delivered; they carry
// their story as `stranger`, which is how the menu, the ghost and the delivery
// tell them from the pilot's own.
export function buildLostCargo(world, sector) {
  const own = [...world.ledger.stranded]
    .filter(([, s]) => s.sectorId === sector.id)
    .map(([contractId, s]) => ({
      id: `stranded:${contractId}`, contractId, x: s.x, y: s.y,
      spin: (hashId(contractId) % 628) / 100,
      interactRadius: CONFIG.stranded.interactRadius,
      discoverRadius: CONFIG.stranded.discoverRadius,
    }));
  const others = openStrangersIn(sector.id, world.ledger).map((s) => ({
    id: `stranger:${s.id}`, contractId: s.contract.id, stranger: s,
    x: s.x * world.width, y: s.y * world.height,
    spin: (hashId(s.contract.id) % 628) / 100,
    interactRadius: CONFIG.stranded.interactRadius,
    discoverRadius: CONFIG.stranded.discoverRadius,
  }));
  world.lostCargo = [...own, ...others];
}

// Where a lost container comes to rest: where it was, moved just far enough
// that a pilot can come back for it. Out of every lethal radius and of any
// gravity stronger than a share of main thrust, off station hulls, inside
// the sector, and out of a dead edge's current, which would have carried it
// inward anyway. A few passes, because clearing one hazard can move the
// point toward another.
//
// The hazards (a planet's cushion, a hole's pull, a station's margin) are hard;
// the inset from a dead edge's current is only a preference. Where the two
// cannot both hold, the point stays clear of the hazard and gives up as little
// of the inset as it can (QA, 2026-09-30: 26 of 5600 points came out inside a
// planet's orbit or a station's margin, pushed there by the inset).
export function restingPoint(world, x, y) {
  const S = CONFIG.stranded;
  const thrust = world.ship.chassis.thrust;      // (the hull's own: a cup of coffee moves no cargo's rest)
  const hazards = [
    ...world.attractors.map((a) => ({
      x: a.x, y: a.y,
      r: Math.max(a.kill + S.wellMargin, Math.sqrt(a.mass / (thrust * S.gravityShare)), a.orbit ? a.orbit + 40 : 0),
    })),
    ...world.stations.map((s) => ({ x: s.x, y: s.y, r: s.hullRadius + S.hullMargin })),
  ];
  let px = x, py = y;
  const clear = (cx, cy, radius) => {
    const d = world.delta(px, py, cx, cy);
    const dist = Math.hypot(d.x, d.y);
    if (dist >= radius) return;
    const ux = dist > 1e-6 ? d.x / dist : 1, uy = dist > 1e-6 ? d.y / dist : 0;
    px = cx + ux * radius;
    py = cy + uy * radius;
  };
  const inset = (axis, dir) =>
    world.deadEdges.some((e) => e.axis === axis && e.dir === dir)
      ? CONFIG.sector.boundary.clear + S.edgeMargin : S.edgeMargin;
  for (let pass = 0; pass < 4; pass++) {
    for (const h of hazards) clear(h.x, h.y, h.r);
    if (world.topology.mode === WRAP) {
      px = wrapTo(px, world.width);
      py = wrapTo(py, world.height);
    } else {
      px = clamp(px, inset('x', -1), world.width - inset('x', 1));
      py = clamp(py, inset('y', -1), world.height - inset('y', 1));
    }
  }
  const inHazard = (p) => hazards.some((h) => {
    const d = world.delta(p.x, p.y, h.x, h.y);
    return Math.hypot(d.x, d.y) < h.r - 1e-6;
  });
  const settled = { x: px, y: py };
  if (world.topology.mode === WRAP || !inHazard(settled)) return settled;

  // The inset and a hazard met: the passes above ended on the inset, inside the
  // hazard. Candidates that keep every hazard: the point taken radially out of
  // each one, and where each hazard's edge crosses the four inset lines (sliding
  // along the inset out of the cushion). The best stays out of every hazard and
  // the current, loses least of the inset, then moves least.
  const lo = { x: inset('x', -1), y: inset('y', -1) };
  const hi = { x: world.width - inset('x', 1), y: world.height - inset('y', 1) };
  const hard = { // the current itself, and the sector's own edge
    lo: { x: lo.x - S.edgeMargin, y: lo.y - S.edgeMargin },
    hi: { x: hi.x + S.edgeMargin, y: hi.y + S.edgeMargin },
  };
  const candidates = [];
  const fromPoints = [{ x, y }, settled, { x: clamp(x, lo.x, hi.x), y: clamp(y, lo.y, hi.y) }];
  for (const h of hazards) {
    const r = h.r + 1;
    for (const f of fromPoints) {
      const dist = Math.hypot(f.x - h.x, f.y - h.y);
      const ux = dist > 1e-6 ? (f.x - h.x) / dist : 1, uy = dist > 1e-6 ? (f.y - h.y) / dist : 0;
      candidates.push({ x: h.x + ux * Math.max(dist, r), y: h.y + uy * Math.max(dist, r) });
    }
    for (const lineX of [lo.x, hi.x]) {
      const dx = lineX - h.x;
      if (Math.abs(dx) > r) continue;
      const dy = Math.sqrt(r * r - dx * dx);
      candidates.push({ x: lineX, y: h.y - dy }, { x: lineX, y: h.y + dy });
    }
    for (const lineY of [lo.y, hi.y]) {
      const dy = lineY - h.y;
      if (Math.abs(dy) > r) continue;
      const dx = Math.sqrt(r * r - dy * dy);
      candidates.push({ x: h.x - dx, y: lineY }, { x: h.x + dx, y: lineY });
    }
  }
  let best = null;
  for (const c of candidates) {
    if (c.x < hard.lo.x || c.x > hard.hi.x || c.y < hard.lo.y || c.y > hard.hi.y) continue;
    if (inHazard(c)) continue;
    const lost = Math.max(0, lo.x - c.x, c.x - hi.x, lo.y - c.y, c.y - hi.y);
    const moved = Math.hypot(c.x - x, c.y - y);
    if (!best || lost < best.lost - 1e-6 || (Math.abs(lost - best.lost) <= 1e-6 && moved < best.moved)) best = { ...c, lost, moved };
  }
  return best ? { x: best.x, y: best.y } : settled;
}

// A cargo lost here comes to rest clear of another pilot's (src/strangers.js),
// so two menus never share a place: out to the sum of their reaches, then a
// legal resting point again, a few times over (QA, 2026-09-30: flown from
// RELAY 12 into SORREL, the pilot's cargo lay 13 u from MARTY MCFLY's).
export function clearOfStrangers(world, at) {
  const reach = 2 * CONFIG.stranded.interactRadius;
  let p = at;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const o of openStrangersIn(world.sector.id, world.ledger)) {
      const d = world.delta(p.x, p.y, o.x * world.width, o.y * world.height);
      const dist = Math.hypot(d.x, d.y);
      if (dist >= reach) continue;
      const ux = dist > 1e-6 ? d.x / dist : 1, uy = dist > 1e-6 ? d.y / dist : 0;
      p = restingPoint(world, o.x * world.width + ux * reach, o.y * world.height + uy * reach);
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

// Doc 06 menu: take the delivery on again, or watch how it was lost.
export function lostCargoActions(world, c) {
  if (c.stranger) return strangerCargoActions(world, c);
  const active = world.ledger.active;
  const carrying = world.ledger.activeJob();
  const actions = [{
    label: 'RECOVER CARGO', cargo: true,
    disabled: !!active,
    note: active ? `CARRYING ${carrying ? carrying.label : 'CARGO'}` : null,
    run: () => recoverCargo(world, c),
  }];
  if (world.ledger.stranded.get(c.contractId)?.trace) {
    actions.push({ label: 'REPLAY FLIGHT', run: () => viewTrace(world, c) });
  }
  return actions;
}

export function recoverCargo(world, c) {
  const res = world.ledger.recover(c.contractId);
  if (!res.ok) { world.emit('actionRefused', { reason: res.reason }); return; }
  world.lostCargo = world.lostCargo.filter((o) => o.id !== c.id);
  world.selectedId = null;
  if (!res.alreadySettled) world.pilot.recovered += 1;
  // The container starts where it lay, on a tether let out to it, and is reeled in
  // (src/tow.js): it is seen to be picked up rather than to appear behind the ship.
  world.cargo = makeTow(world, c.x, c.y);
  world.emit('cargoRecovered', {
    contractId: c.contractId, label: res.contract ? res.contract.label : c.contractId,
    destination: world.stationLabelOf(res.contract?.to),
    x: c.x, y: c.y, sectorId: world.sector.id, alreadySettled: res.alreadySettled,
  });
}

// Lost cargo left too long goes home (Progress.returnOverdue): gone from space, offered
// again by its station, and said, like the hidden sector's wreck says it.
export function returnLostCargo(world) {
  const back = world.ledger.returnOverdue();
  if (!back.length) return;
  buildLostCargo(world, world.sector);
  for (const job of back) {
    world.emit('cargoReturned', { contractId: job.id, label: job.label, returnedTo: world.stationLabelOf(job.from),
      sectorId: world.sector.id });
  }
}

// The replay is presentation. The world only hands over the record. A cargo
// taken by pirates lies at their den, thousands of units from the wreck, so
// its replay is moved (`shift`) to end where the cargo lies: what the pilot
// sees there is how it was lost, not where. Any other cargo came to rest
// beside its wreck, and its replay plays where it happened.
function viewTrace(world, c) {
  const record = world.ledger.stranded.get(c.contractId);
  if (!record?.trace) return;
  const end = record.trace[record.trace.length - 1];
  const shift = record.cause === 'pirate' ? { x: c.x - end[1], y: c.y - end[2] } : null;
  world.emit('traceRequested', {
    contractId: c.contractId, sectorId: record.sectorId,
    trace: record.trace, cause: record.cause, obstacle: record.obstacle,
    x: c.x, y: c.y, shift,
  });
}

// Another pilot's cargo (src/strangers.js): the same two actions on the same
// terms as the pilot's own. Taking it is accepting its contract where it lies,
// so the delivery clock starts now, not when the ship that lost it set out.
function strangerCargoActions(world, c) {
  const active = world.ledger.active;
  const carrying = world.ledger.activeJob();
  return [{
    label: 'RECOVER CARGO', cargo: true,
    disabled: !!active,
    note: active ? `CARRYING ${carrying ? carrying.label : 'CARGO'}` : null,
    run: () => takeStrangerCargo(world, c),
  }, { label: 'REPLAY FLIGHT', run: () => viewStrangerTrace(world, c) }];
}

// From here it is the pilot's contract: carried, delivered for the reward, or
// lost again as the pilot's own stranded cargo (with the pilot's trace), and the
// container is not built as theirs any more (openStrangersIn).
export function takeStrangerCargo(world, c) {
  const contract = contractById(c.contractId);
  if (!contract || !world.acceptContract(contract)) return;
  world.lostCargo = world.lostCargo.filter((o) => o.id !== c.id);
  world.selectedId = null;
  // Towed from where it lay, as a recovered cargo is.
  world.cargo = makeTow(world, c.x, c.y);
}

// Their ghost: the record of the crash that lost it, named for its author so it
// is not taken for the pilot's own (the label reads TRACE / MARTY MCFLY).
function viewStrangerTrace(world, c) {
  const s = c.stranger;
  world.emit('traceRequested', {
    contractId: c.contractId, sectorId: s.sector, trace: s.trace, cause: s.cause, obstacle: s.obstacle,
    x: c.x, y: c.y, shift: null, author: s.author,
  });
}
