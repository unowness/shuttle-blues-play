// The pause's volumes (SX, 2026-10-02: «пора сделать настройки в меню паузы и дать там настроить громкости музыки, общий мастер,
// звуки системы, эффекты в космосе»): the four, and how this browser keeps them. They are set on the pause's AUDIO page
// (labs/graphics/pause-menu.js, the rows labs/graphics/main.js hands it); src/audio.js Sound.setVolume applies them. The panel
// that drew them on their own went with PLAN D2 (2026-10-04): the page had replaced it.
import { readVolumes as readKept, writeVolumes as writeKept } from '../../src/prefs.js';

export const VOLUMES = Object.freeze([
  { id: 'master', label: 'MASTER', sample: 'blip' },
  { id: 'music', label: 'MUSIC', sample: null },
  { id: 'ui', label: 'INTERFACE', sample: 'clickUi' },
  { id: 'space', label: 'EFFECTS', sample: 'coin' },
]);

// Kept in this browser under src/prefs.js's key: those volumes that are kept as numbers, held to 0..1 (none kept: CONFIG.sound.volumes,
// the defaults).
export const readVolumes = (store) => readKept(VOLUMES.map((v) => v.id), store);
export const writeVolumes = (volumes, store) => { writeKept(volumes, store); };

