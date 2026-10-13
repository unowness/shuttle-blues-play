// Map X: Exchange Ring with Braided Run cross-connections (SX, 2026-10-10).
// Authored preferences for existing systems, never additional quests, rewards or gates.
// Positions are sector fractions; radii are world units. Runtime has no editor dependency.
// secret-search is an exploration note only; the entrance keeps its roaming rules.
export const MAP_CONTENT = Object.freeze([
  Object.freeze({"id":"plan-j5-01","type":"freight-route","sectorId":"sector-j05","x":0.325,"y":0.74,"radius":0,"phase":0,"variant":"","anchorId":"station-relay-j05","targetId":"station-yard-k05","anchor":{"id":"station-relay-j05","kind":"station","label":"RELAY 12","sectorId":"sector-j05","x":0.28,"y":0.78},"target":{"id":"station-yard-k05","kind":"station","label":"YARD 3","sectorId":"sector-k05","x":0.3,"y":0.22}}),
  Object.freeze({"id":"plan-j5-02","type":"fuel-help","sectorId":"sector-j05","x":0.225,"y":0.6,"radius":1600,"phase":0,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-j5-03","type":"ruin-work","sectorId":"sector-j05","x":0.845,"y":0.62,"radius":0,"phase":0,"variant":"","anchorId":"station-halcyon-j05","targetId":"","anchor":{"id":"station-halcyon-j05","kind":"station","label":"HALCYON","sectorId":"sector-j05","x":0.8,"y":0.66}}),
  Object.freeze({"id":"plan-j5-04","type":"planet-errand","sectorId":"sector-j05","x":0.585,"y":0.47,"radius":0,"phase":0,"variant":"","anchorId":"planet-magrathea","targetId":"station-relay-j05","anchor":{"id":"planet-magrathea","kind":"planet","label":"MAGRATHEA","sectorId":"sector-j05","x":0.54,"y":0.51},"target":{"id":"station-relay-j05","kind":"station","label":"RELAY 12","sectorId":"sector-j05","x":0.28,"y":0.78}}),
  Object.freeze({"id":"plan-j5-05","type":"cache-pool","sectorId":"sector-j05","x":0.61,"y":0.2,"radius":1400,"phase":0,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-j5-06","type":"pirate-field","sectorId":"sector-j05","x":0.84,"y":0.4,"radius":1400,"phase":0,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k5-01","type":"wreck-help","sectorId":"sector-k05","x":0.675,"y":0.225,"radius":1600,"phase":0,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k5-02","type":"pirate-rescue","sectorId":"sector-k05","x":0.775,"y":0.525,"radius":1600,"phase":0,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k5-03","type":"cargo-recovery","sectorId":"sector-k05","x":0.305,"y":0.4004,"radius":0,"phase":1,"variant":"","anchorId":"stranger-leela","targetId":"station-yard-k05","anchor":{"id":"stranger-leela","kind":"stranger","label":"LEELA","sectorId":"sector-k05","x":0.2602,"y":0.4403},"target":{"id":"station-yard-k05","kind":"station","label":"YARD 3","sectorId":"sector-k05","x":0.3,"y":0.22}}),
  Object.freeze({"id":"plan-k5-04","type":"raid-defence","sectorId":"sector-k05","x":0.345,"y":0.18,"radius":0,"phase":0,"variant":"","anchorId":"station-yard-k05","targetId":"","anchor":{"id":"station-yard-k05","kind":"station","label":"YARD 3","sectorId":"sector-k05","x":0.3,"y":0.22}}),
  Object.freeze({"id":"plan-k5-05","type":"service-droid","sectorId":"sector-k05","x":0.67,"y":0.23,"radius":1300,"phase":0,"variant":"repair","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k4-01","type":"freight-route","sectorId":"sector-k04","x":0.805,"y":0.68,"radius":0,"phase":1,"variant":"","anchorId":"station-depot-k04","targetId":"station-yard-k05","anchor":{"id":"station-depot-k04","kind":"station","label":"DEPOT 7","sectorId":"sector-k04","x":0.76,"y":0.72},"target":{"id":"station-yard-k05","kind":"station","label":"YARD 3","sectorId":"sector-k05","x":0.3,"y":0.22}}),
  Object.freeze({"id":"plan-k4-02","type":"ruin-work","sectorId":"sector-k04","x":0.325,"y":0.2,"radius":0,"phase":1,"variant":"","anchorId":"station-foundry-k04","targetId":"","anchor":{"id":"station-foundry-k04","kind":"station","label":"FOUNDRY 2","sectorId":"sector-k04","x":0.28,"y":0.24}}),
  Object.freeze({"id":"plan-k4-03","type":"wreck-help","sectorId":"sector-k04","x":0.525,"y":0.2,"radius":1600,"phase":1,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k4-04","type":"cargo-recovery","sectorId":"sector-k04","x":0.2338,"y":0.1906,"radius":0,"phase":2,"variant":"","anchorId":"stranger-han","targetId":"station-drydock-j04","anchor":{"id":"stranger-han","kind":"stranger","label":"HAN SOLO","sectorId":"sector-k04","x":0.3711,"y":0.6215},"target":{"id":"station-drydock-j04","kind":"station","label":"DRY DOCK","sectorId":"sector-j04","x":0.72,"y":0.3}}),
  Object.freeze({"id":"plan-k4-05","type":"planet-errand","sectorId":"sector-k04","x":0.725,"y":0.31,"radius":0,"phase":1,"variant":"","anchorId":"planet-beryl","targetId":"station-depot-k04","anchor":{"id":"planet-beryl","kind":"planet","label":"BERYL","sectorId":"sector-k04","x":0.68,"y":0.35},"target":{"id":"station-depot-k04","kind":"station","label":"DEPOT 7","sectorId":"sector-k04","x":0.76,"y":0.72}}),
  Object.freeze({"id":"plan-j4-01","type":"cargo-recovery","sectorId":"sector-j04","x":0.5705,"y":0.7602,"radius":0,"phase":2,"variant":"","anchorId":"stranger-threepio","targetId":"station-yard-k05","anchor":{"id":"stranger-threepio","kind":"stranger","label":"C-3PO","sectorId":"sector-j04","x":0.5816,"y":0.7873},"target":{"id":"station-yard-k05","kind":"station","label":"YARD 3","sectorId":"sector-k05","x":0.3,"y":0.22}}),
  Object.freeze({"id":"plan-j4-02","type":"planet-errand","sectorId":"sector-j04","x":0.365,"y":0.26,"radius":0,"phase":2,"variant":"","anchorId":"planet-kelvin","targetId":"station-drydock-j04","anchor":{"id":"planet-kelvin","kind":"planet","label":"KELVIN","sectorId":"sector-j04","x":0.32,"y":0.3},"target":{"id":"station-drydock-j04","kind":"station","label":"DRY DOCK","sectorId":"sector-j04","x":0.72,"y":0.3}}),
  Object.freeze({"id":"plan-j4-03","type":"raid-defence","sectorId":"sector-j04","x":0.765,"y":0.26,"radius":0,"phase":2,"variant":"","anchorId":"station-drydock-j04","targetId":"","anchor":{"id":"station-drydock-j04","kind":"station","label":"DRY DOCK","sectorId":"sector-j04","x":0.72,"y":0.3}}),
  Object.freeze({"id":"plan-j4-04","type":"rock-field","sectorId":"sector-j04","x":0.47,"y":0.5,"radius":1300,"phase":2,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-j4-05","type":"reference-ship","sectorId":"sector-j04","x":0.575,"y":0.2,"radius":1600,"phase":2,"variant":"express","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-j6-01","type":"ruin-work","sectorId":"sector-j06","x":0.285,"y":0.24,"radius":0,"phase":3,"variant":"","anchorId":"station-commons-j06","targetId":"","anchor":{"id":"station-commons-j06","kind":"station","label":"COMMONS","sectorId":"sector-j06","x":0.24,"y":0.28}}),
  Object.freeze({"id":"plan-j6-02","type":"planet-errand","sectorId":"sector-j06","x":0.575,"y":0.39,"radius":0,"phase":3,"variant":"","anchorId":"planet-fathom","targetId":"station-halcyon-j05","anchor":{"id":"planet-fathom","kind":"planet","label":"FATHOM","sectorId":"sector-j06","x":0.53,"y":0.43},"target":{"id":"station-halcyon-j05","kind":"station","label":"HALCYON","sectorId":"sector-j05","x":0.8,"y":0.66}}),
  Object.freeze({"id":"plan-j6-03","type":"cache-pool","sectorId":"sector-j06","x":0.79,"y":0.19,"radius":1300,"phase":3,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-j6-04","type":"reference-ship","sectorId":"sector-j06","x":0.2,"y":0.475,"radius":1600,"phase":3,"variant":"serenity","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k6-01","type":"ruin-work","sectorId":"sector-k06","x":0.285,"y":0.2,"radius":0,"phase":4,"variant":"","anchorId":"station-apiary-k06","targetId":"","anchor":{"id":"station-apiary-k06","kind":"station","label":"APIARY","sectorId":"sector-k06","x":0.24,"y":0.24}}),
  Object.freeze({"id":"plan-k6-02","type":"raid-defence","sectorId":"sector-k06","x":0.285,"y":0.2,"radius":0,"phase":4,"variant":"","anchorId":"station-apiary-k06","targetId":"","anchor":{"id":"station-apiary-k06","kind":"station","label":"APIARY","sectorId":"sector-k06","x":0.24,"y":0.24}}),
  Object.freeze({"id":"plan-k6-03","type":"reference-ship","sectorId":"sector-k06","x":0.5,"y":0.6,"radius":1600,"phase":4,"variant":"xwing","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k6-04","type":"secret-search","sectorId":"sector-k06","x":0.19,"y":0.78,"radius":1500,"phase":4,"variant":"","anchorId":"","targetId":""}),
  Object.freeze({"id":"plan-k6-05","type":"cloud-field","sectorId":"sector-k06","x":0.84,"y":0.47,"radius":1200,"phase":4,"variant":"","anchorId":"","targetId":""}),
]);

// Bounded preference searches always leave the original placement algorithm as a fallback.
export const MAP_PLACEMENT = Object.freeze({ areaTries: 24, fieldEvery: 3, fieldTries: 120, cloudTries: 32 });

// Data-only access for field.js: sectors.js imports the field's tuning, so no catalogue import here.
export function mapAreasIn(type, sectorId, restored = 0, variant) {
  return MAP_CONTENT.filter(p => p.type === type && p.radius > 0 && p.sectorId === sectorId &&
    p.phase <= restored && (variant === undefined || !p.variant || p.variant === variant));
}

// A uniform draw within a circular area, returned in sector fractions.
export function sampleArea(area, rng, width, height) {
  const angle = rng() * Math.PI * 2, radius = Math.sqrt(rng()) * area.radius;
  return { x: area.x + Math.cos(angle) * radius / width, y: area.y + Math.sin(angle) * radius / height };
}
