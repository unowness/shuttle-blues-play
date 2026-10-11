// The world's scale (chat SC, 2026-10-04).
//
// SX's map layouts (labs/map-editor/layout.json, `sectorSize`) are drawn on a sector of LAYOUT_SECTOR u, and every place in them is
// a fraction of its sector: a station's, a planet's, a cache's, a sign's (src/sectors.js and the catalogues that read it). Every size
// is in u: a planet's radius, a station's ring, the ship. The game's sector is WORLD_SCALE times the layout's, so the places keep
// SX's shape, the things keep their size, and the space between them grows by WORLD_SCALE.
//
// `spread(u)` is a distance of the layout that belongs to the map's spread rather than to a thing (how far apart the open quests or
// the waiting caches stand): it grows with the world. A size, a reach or a ring is never passed through it.
//
// SX, 2026-10-04, after flying the build: «очень безопасный космос и все слишком близко друг другу, вообще не хватает места, размер
// старых секторов и разброс был лучше, у нас доступно сразу 2 сектора при старте, давай гонять между ними, чтобы было время
// отвлечься, подрифтить попрыгать, а то сейчас просто спидран по грузам». The sector had been 7,200 u since the first day; what
// shrank was the room in it: the planets grew 1.5 to 1.8 times (2026-09-30), the stations by a quarter (2026-10-01), and his
// second layout and the frontier (both 2026-10-02) put the start's four stations 2,250 to 4,400 u apart in two open sectors, where
// the first freight had been 9,800 u (DRY DOCK to RELAY 12). WORLD_SCALE 2 gives the things the room they had before they grew, and doubles every
// way between them (the first freight 4,500 to 7,000 u, by the start ruin).
// Then 1.5 (chat W2, 2026-10-04; SX, after flying it: «уменьшить скорость тысячу пятьсот до тысячи и заскейлить мир чуть-чуть
// поменьше под это ... баланс скорости и времени, которое ты летишь, до квеста мне нравится»): the top speeds went to two thirds
// (src/chassis.js) with the same push, and at 1.5 the start's routes take the seconds they took at 2 (measured on a flight profile of
// the chassis: ten routes of the start, 64.5 s in all at 2 and 1,500 u/s, 64.3 s at 1.5 and 1,000).
// A save keeps what it holds in a sector's u (the ship, signs, flags, cargo in space): a change of WORLD_SCALE is a save step of its
// own (src/storage.js v19 took v18's 1 to 2, v20 took 2 to 1.5).
export const LAYOUT_SECTOR = 7200;
export const WORLD_SCALE = 1.5;
export const spread = (u) => u * WORLD_SCALE;
