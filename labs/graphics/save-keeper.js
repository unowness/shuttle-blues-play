// The page's save: what is read of it at the boot, what is written and when, who is told when it is held, the last write as the pause's
// SAVE GAME row says it, and the chord that erases it. Cut from labs/graphics/main.js (PLAN D4, the first step toward createGame: it needs
// the page's world, storage, notices, sound and name field only through `game`, read when a function runs, and the browser's clock, reload
// and console only through `env`, so a check hands it its own and drives it as the page does).
//
//   const saves = createSaveKeeper(game);       game.storage and game.world are there; game.notices and game.sound may come later
//   saves.restoreProgress();                    once, at the boot: a save applied, held or refused; its words in saves.notes
//   saves.persist(reason)                       'saved' | 'unavailable' | 'erasing' | 'held' | 'failed'
//   saves.tick(dt)                              the interval's checkpoint        saves.tellNotes()  the boot's lines, said at the first flight frame
//   saves.eraseChord(event)                     Cmd/Ctrl+Backspace, the keydown handler    saves.erase()  what a second NEW GAME on the title does
import { CONFIG } from '../../src/config.js';
import { formatCR } from '../../src/ruins.js';

// Cmd+Backspace (or Ctrl+Backspace) erases this browser's save and starts a new pilot (SX, 2026-10-01: «добавь мне
// просто сброс сейва на сочетание клавишь команд + бэкспейс»). Twice within ERASE_WINDOW seconds: the first
// press asks, as a danger notice, so one slip of the fingers cannot cost the game. Only the save's own two
// slots go (Storage.clear); a copy an older save left before a migration stays. Nothing is saved after it,
// not even on the way out, and the page reloads.
export const ERASE_WINDOW = 3;

// A held save (src/storage.js) is written by nobody here: another tab saved over this
// one's, the save is a newer build's, or it did not load. The pilot is told at the
// start and then at most once a minute, not at every save the tab skips.
export const HELD_NOTES = {
  conflict: ['NOT SAVING', 'OPENED IN ANOTHER TAB / RELOAD TO PLAY HERE'],
  newer: ['NOT SAVING', 'THE SAVE IS FROM A NEWER VERSION'],
  unloadable: ['SAVE NOT LOADED', 'SAVE PRESERVED / SAVING DISABLED'],
};

// `env`: clock() in seconds (the page's), wall() the date in ms, reload(), error(...) for what the console says.
export function createSaveKeeper(game, env = {}) {
  const clock = env.clock ?? (() => performance.now() / 1000);
  const wall = env.wall ?? (() => Date.now());
  const reload = env.reload ?? (() => location.reload());
  const error = env.error ?? ((...a) => console.error(...a));
  const eraseState = { askedAt: -Infinity, erasing: false };
  // The boot's three lines: [title, sub] or a plain note, said once by tellNotes. `boot`: what the load came to; `frontier`: the one quiet
  // notice after a save was moved to the frontier (src/frontier.js, save v13), shown at the first flight frame and saved at once, so it is
  // said once; `refund`: the same for a save moved to the ruins' new prices (src/storage.js, save v16; SX, 2026-10-04: «REFUND n CR»).
  const notes = { boot: null, frontier: null, refund: null };
  let saveTimer = 0, heldToldAt = -Infinity, lastSaveText = null, lastSavedAt = null;

  function restoreProgress() {
    const { storage, world } = game;
    if (!storage.available) { notes.boot = 'saving unavailable in this browser'; return; }
    const saved = storage.load();
    if (!saved) {
      if (storage.held) return;                        // said by the held notice at the first save
      if (storage.lastError) notes.boot = `save unreadable (${storage.lastError}); starting fresh`;
      return;
    }
    // restore() validates every field before it applies any. A throw after that (a
    // bug, not a bad save: audit EN-03) would leave the world half-applied, so the
    // save is kept as it is and nothing is written over it; the pilot is told.
    let res;
    try { res = world.restore(saved); } catch (e) {
      error('the save did not load; it is kept and nothing is saved over it', e);
      storage.hold('unloadable', 'unloadable');
      game.labFresh = false;
      return;
    }
    // restore() turned the save down before it applied anything (`reason: 'malformed'`: a field it could not read, PLAN C3, 2026-10-03,
    // code review 2026-10-03 architecture finding 8). The page used to start a new world and say "NEW FLIGHT", and its next autosave
    // wrote over the primary slot and the one after over the backup, so a save a later build might read was gone in two saves. It is
    // held as a throw is: kept in a slot of its own, nothing saved over it, the pilot told (HELD_NOTES). The world is still the fresh
    // one restore() left, so the new pilot's start applies below (`game.labFresh` stays) and is simply not saved.
    if (!res.ok) {
      error(`the save was turned down (${res.reason}); it is kept and nothing is saved over it`);
      storage.hold('unloadable', 'unloadable');
      return;
    }
    game.labFresh = false;
    if (storage.held) return;
    notes.boot = storage.recoveredFromBackup
      ? 'PREVIOUS SAVE RESTORED'
      : `save loaded / ${world.ledger.credits} CR`;
    // A ship moved off where it was saved says that first, the load under it: [title, detail] (Codex's text pass UXN10: the one line
    // «save loaded / N CR / SHIP MOVED TO A SAFE POSITION» was cut before its reason; the wallet is on the screen anyway).
    if (!res.positionRestored) notes.boot = ['SHIP MOVED TO SAFETY', storage.recoveredFromBackup ? 'PREVIOUS SAVE RESTORED' : 'SAVE LOADED'];
    // An older save moved to the frontier (SX's pick for his long save, 2026-10-02: «Вернуть вложенное»): what it had put into
    // ruins past a closed border is back, in place of the resume line (a ship that was there is at HOME, which needs no word).
    const f = res.frontier;
    if (f && (f.refunded > 0 || f.calledOff.length || f.movedHome || f.raid)) {
      const back = f.refunded > 0 ? `+${formatCR(f.refunded)} CR REFUNDED` : 'RESTORE A RUIN TO OPEN THE NEXT SECTOR';
      notes.frontier = ['SECTOR ACCESS UPDATED', `${back}${f.calledOff.length ? ' / DELIVERIES CANCELLED' : ''}`];
      if (!storage.recoveredFromBackup) notes.boot = null;
    }
    // A ruin whose price fell below what the save had put in is restored, and the rest is back in the wallet, once.
    const r = res.refund;
    if (r) {
      notes.refund = [r.amount > 0 ? `REFUND ${formatCR(r.amount)} CR` : 'RUIN PRICE LOWERED', `${r.restored.join(', ')} RESTORED`];
      if (!storage.recoveredFromBackup) notes.boot = null;
    }
  }

  // What it came to, for the one caller that tells the pilot (the pause's SAVE GAME): 'saved'; or why not, 'unavailable' (no
  // storage in this browser), 'erasing' (the save is being erased), 'held' (another tab, a newer build's save, one that did not
  // load: warnHeld says it) or 'failed' (the write did not go; the failure notice is shown here). Every other caller ignores it.
  function persist(reason) {
    const { storage, world } = game;
    // A wreck is saved at once, as the respawn will leave the ship (World.snapshot
    // writes a dead ship's full hull and respawn tank), so a reload inside the
    // respawn delay cannot bring the stranded cargo or the spilled coins back.
    saveTimer = 0;
    // Nothing is written once the save is being erased: the page is on its way to a fresh start.
    if (!storage.available) return 'unavailable';
    if (eraseState.erasing) return 'erasing';
    void reason;
    if (storage.save(world.snapshot())) return 'saved';
    if (storage.held) { warnHeld(); return 'held'; }
    game.notices.saveNote('failed', storage.lastError);
    return 'failed';
  }

  // The last save as the pause's SAVE GAME row says it (labs/graphics/pause.js, chat P): when the save in this browser was written (its
  // own `savedAt`, read again only when the save changes), or why nothing is being written; never «saved» before a write has gone.
  function lastSave() {
    const { storage } = game;
    if (!storage.available) return { outcome: 'unavailable' };
    if (storage.held) return { outcome: 'held' };
    if (storage.lastError) return { outcome: 'failed' };
    if (storage.seen !== lastSaveText) {
      lastSaveText = storage.seen;
      try { lastSavedAt = JSON.parse(lastSaveText ?? 'null')?.savedAt ?? null; } catch { lastSavedAt = null; }
    }
    return Number.isFinite(lastSavedAt) ? { outcome: 'saved', ago: Math.max(0, (wall() - lastSavedAt) / 1000) } : { outcome: 'none' };
  }

  // SAVE GAME in the pause (PLAN C1, 2026-10-03): the pilot is told what happened, and only what did. It used to say "save
  // requested" after every press, a failure's notice included. A held save is told however lately it was told before.
  function saveByHand() {
    heldToldAt = -Infinity;
    const outcome = persist('manual');
    if (outcome === 'saved') game.notices.saveNote('saved');
    else if (outcome === 'unavailable') game.notices.saveNote('unavailable');
  }

  // Another tab's load or save is seen by the page at once (its `storage` event), so the pilot is told before playing on.
  function warnHeld() {
    const { storage } = game;
    if (storage.held === 'conflict') return;           // the older tab's window says it (labs/graphics/screens.js)
    const now = clock();
    if (now - heldToldAt < 60) return;
    heldToldAt = now;
    const [title, sub] = HELD_NOTES[storage.held] || ['NOT SAVING', storage.held];
    game.notices.notify(title, sub, { kind: 'danger', life: 6, waits: false, fate: 'flip' });
  }

  // The boot's lines, at the first flight frame: what the load came to, then the frontier's and the refund's, each said once and the
  // save written at once after the last two.
  function tellNotes() {
    const { notices } = game;
    if (notes.boot) { if (Array.isArray(notes.boot)) notices.notify(notes.boot[0], notes.boot[1], { life: 2.6, waits: false, fate: 'flip' }); else notices.toast(notes.boot); notes.boot = null; }
    if (notes.frontier) { notices.notify(notes.frontier[0], notes.frontier[1], { life: 5, after: true }); notes.frontier = null; persist('frontier'); }
    if (notes.refund) { notices.notify(notes.refund[0], notes.refund[1], { kind: 'gain', life: 5, after: true }); notes.refund = null; persist('refund'); }
  }

  // Checkpoint on a timer as well as on outcomes, so a long flight is not lost.
  function tick(dt) {
    saveTimer += dt;
    if (saveTimer >= CONFIG.save.intervalSeconds) persist('interval');
  }

  // The save goes and the page starts afresh: nothing is written after this, not even on the way out.
  function erase() {
    eraseState.erasing = true;
    game.storage.clear();
    reload();
  }

  // The keydown handler (the page adds it in the capture phase, before the keys' own).
  function eraseChord(event) {
    if (event.code !== 'Backspace' || !(event.metaKey || event.ctrlKey) || event.target === game.nameInput) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // A held chord repeats its keydown: that is not the second press (audit FE-01, 2026-10-01:
    // holding the keys half a second erased the save). Only a new press confirms.
    if (event.repeat) return;
    const now = clock();
    if (now - eraseState.askedAt > ERASE_WINDOW) {
      eraseState.askedAt = now;
      // The question and what to do on one page of the notch, at once (Codex's text pass UXN01, SX 2026-10-07: «берем все»): «ERASE SAVE AND
      // START OVER? · REPEAT SHORTCUT WITHIN 3 S» took two pages, the second read whole only 2.7 s into the 3, later behind a danger.
      game.notices.notify('ERASE SAVE?', `PRESS AGAIN WITHIN ${ERASE_WINDOW} S`, { kind: 'danger', life: ERASE_WINDOW, waits: false, fate: 'flip', now: true });
      game.sound.play('refuse');
      return;
    }
    erase();
  }

  return { notes, restoreProgress, persist, lastSave, saveByHand, warnHeld, tellNotes, tick, erase, eraseChord, state: eraseState };
}
