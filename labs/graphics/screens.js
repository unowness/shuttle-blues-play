// The screens registry, cut from labs/graphics/main.js (PLAN D4 in part, chat F, 2026-10-04) and finished by chat Q (2026-10-04):
// which screen stands over the flight (the controls list, the pilot card, the sign composer, the hangar, a station's INFO, the
// garage's room, the map, the window about two tabs), how each opens and closes, its keys (by the input router's actions,
// labs/graphics/input-router.js KEYS), what a click on it does, and how it is drawn as a pop-up over the dimmed flight. Every screen is
// one entry of POPUPS, in the order they are drawn (drawPopups: the last drawn is on top, and a click outside it closes it); which
// one takes the frame's keys is HOLDS, in its own order (openKeys, the keys that open one from flight; tabsKeys, the two-tabs window's,
// which come before the page's own; screenKeys, the screen's that stands). The input router only asks (labs/graphics/input-router.js
// gameKeys). A screen does not pause the flight (SX, 2026-10-02): the world goes on under it with the ship's controls let go. A
// screen's panel is drawn by its own module; the pause is its own (labs/graphics/pause.js). `game` is the page's (main.js); the
// long-lived parts it holds are read once here.
import { WORDS_PER_ROW } from '../../src/signPanel.js';
import { FLEET, fleetOf, fleetIndexOf, fleetAction } from '../../src/hangarPanel.js';
import { COLLECTIBLES, WORDS, collectibleDef } from '../../src/progression.js';
import { SIGN_WORDS_MAX, SIGN_TYPES, DEFAULT_SIGN_TYPE, signTypeLabel } from '../../src/signs.js';
import { nicknameChars, CHARM_NONE } from '../../src/pilot.js';
import { nextPaint, paintById, PAINTS } from '../../src/paint.js';
import { specialById, SPECIAL_IDS } from '../../src/specialShips.js';
import { lookById, ownedLooks } from '../../src/looks.js';
import { questTone } from '../../src/quests.js';
import { currentTasks, focusedTask, taskTarget, taskNavigation } from '../../src/tasks.js';
import { routeInk } from '../../src/interface.js';
import { navFitted, noteCardOpened } from '../../src/opening.js';
import { drawPilotCard, drawStationInfo, drawHangar, drawSignComposer, drawControlsWindow, CARD } from './windows.js';
import { QUEST_TONES } from './quest-list.js';
import { SOUVENIR_LORE } from './souvenir-lore.js';
import { inBox } from '../../src/util.js';
import { drawTabsWindow } from './tabs-window.js';
import { drawFinaleWindow } from './finale-window.js';
import { createRoomScreen } from './garage-room.js';
import { createMap, openMap, closeMap, drawMap, mapPoint, mapClick, mapMove, mapStep, mapFit, FLAGS } from './map-screen.js';
import { measure, noteDuring, noteAction } from './clicks.js';
import { codesOf, SCHEMES, DEFAULT_SCHEME, roomControls } from '../../src/controls.js';
import { KEYS, tapped, held, tappedChoice } from './input-router.js';
import { isPlayKey } from './title.js';

export function createScreens(game) {
  const { world, sound, renderer, input, crt, nameInput, feedback } = game;
  const pageTime = () => performance.now() / 1000;
  const key = (action) => tapped(input, action);
  // Which screen stands: the controls list (?), the pilot card (C), the sign composer (L), the hangar, a station's INFO, the
  // garage's room, the map (TAB). The two-tabs window is `tabsUI`.
  const open = { help: false, pilot: false, sign: false, hangar: false, station: false, room: false, map: false, finale: false };
  // Two tabs on one save (src/tabs.js, src/tabsPanel.js, tabs-window.js; SX, 2026-10-01). Once a
  // newer tab has loaded the save, this one is held ('conflict') and paused for good under its
  // window, with no keys and no sound; a reload makes it the newest. The newer tab asks for the
  // older to be closed, or Esc plays on. When the older tab goes, the window does not vanish (SX:
  // «он пропадает без предупреждения ... Я бы там менял просто статус и нажимал, типа, press any
  // button»): it says so (`clear`), and any key plays on. `since` is when its state began (page
  // time, s), for the title plate to assemble; `lockedSince` the same for the held tab's window.
  const tabLocked = () => game.storage.held === 'conflict';
  const tabsUI = { open: false, clear: false, since: 0, lockedSince: null };
  function openTabs() {
    if (tabLocked()) return;
    // Another older tab while the window says the last one closed: it waits again.
    if (tabsUI.open) { if (tabsUI.clear) { tabsUI.clear = false; tabsUI.since = pageTime(); } return; }
    tabsUI.open = true;
    tabsUI.clear = false;
    tabsUI.since = pageTime();
    world.holdPause('tabs');
    sound.play('panelOpen');
  }
  function tabsClear() {
    if (!tabsUI.open || tabsUI.clear) return;
    tabsUI.clear = true;
    tabsUI.since = pageTime();
    sound.play('blip');
  }
  function closeTabs(play = true) {
    if (!tabsUI.open) return;
    tabsUI.open = false;
    tabsUI.clear = false;
    world.holdPause('tabs', false);
    if (play) sound.play('panelClose');
  }
  // The controls list stands over a flight that goes on, like every other screen (not paused since 2026-10-02: anyScreen()
  // lets the ship's controls go, IDLE_CONTROLS); only P, Escape and the two-tabs window pause.
  // The page the list shows: the mode the pilot plays in when it opens (labs/graphics/schemes.js), ← → to the other
  // (labs/graphics/key-focus.js) or a click on a mode's name.
  const helpUI = { page: DEFAULT_SCHEME };
  const hints = () => game.schemes?.hints() ?? DEFAULT_SCHEME;
  function openHelp() {
    sound.play('panelOpen');
    open.help = true;
    helpUI.page = hints();
  }
  function stepHelpPage(d) {
    const at = SCHEMES.indexOf(helpUI.page);
    const next = SCHEMES[Math.max(0, Math.min(SCHEMES.length - 1, at + d))];
    if (next === helpUI.page) return false;
    helpUI.page = next;
    sound.play('menu');
    return true;
  }
  function closeHelp(play = true) {
    if (!open.help) return;
    if (play) sound.play('panelClose');
    open.help = false;
  }
  // The window when the boss is beaten (labs/graphics/finale-window.js): it stands until RETURN TO OPEN SPACE (Enter, Esc or a click);
  // the flight goes on under it.
  function openFinale() {
    sound.play('panelOpen');
    open.finale = true;
  }
  function closeFinale() {
    if (!open.finale) return;
    sound.play('panelClose');
    open.finale = false;
  }
  // Whether a screen (the controls list, the card, a composer, the hangar, INFO, the room, the map, the two-tabs window) stands over
  // the flight: any entry of POPUPS shown.
  function anyScreen() {
    return POPUPS.some((p) => p.shown());
  }
  // ----------------------------------------------------------- pilot card ---

  // The pilot screen (C). The flight goes on underneath it, the ship's controls let go (anyScreen).
  // It owns the keyboard while open: arrows choose a souvenir, 1-3 put it in a
  // cockpit slot, N renames, 0 or Escape closes.
  // The card's detail shows each souvenir's lore: drafts from souvenir-lore.js, for SX to approve (2026-09-30).
  const pilotUI = { selected: 0, editing: false, message: null, messageLife: 0, nameBox: null, lore: SOUVENIR_LORE };

  function openPilot() {
    sound.play('panelOpen');
    closeHelp(false);
    open.pilot = true;
    pilotUI.message = null;
    // The opening's optional look at the card (src/opening.js): done when it is opened, by whatever way.
    noteCardOpened(world);
  }

  function closePilot() {
    if (pilotUI.editing) finishRename(false);
    sound.play('panelClose');
    open.pilot = false;
  }

  function pilotMessage(text) {
    pilotUI.message = text;
    pilotUI.messageLife = 2.4;
  }

  // The field is HTML over the canvas: under the CRT filter it is placed where
  // the curved screen shows the name's place on the card. Placed again every
  // frame it is open, so a resized window or card takes it along; the style is
  // written only when a value changes.
  function placeNameField() {
    const box = pilotUI.nameBox;
    if (!box) return;
    const a = crt.project(box.x, box.y), b = crt.project(box.x + box.w, box.y + box.h);
    const place = { left: `${a.x}px`, top: `${a.y}px`, width: `${b.x - a.x}px`, height: `${b.y - a.y}px` };
    for (const [key, value] of Object.entries(place)) if (nameInput.style[key] !== value) nameInput.style[key] = value;
  }

  function startRename() {
    if (!pilotUI.nameBox) return;
    pilotUI.editing = true;
    nameInput.style.display = 'block';
    placeNameField();
    nameInput.value = world.pilot.nickname;
    nameInput.focus();
    nameInput.select();
  }

  function finishRename(keep) {
    if (!pilotUI.editing) return;
    pilotUI.editing = false;
    if (keep) {
      const name = world.pilot.rename(nameInput.value);
      pilotMessage(`NAME / ${name}`);
      game.persist('renamed');
    }
    nameInput.style.display = 'none';
    nameInput.blur();
  }

  // Enter keeps, Escape cancels; neither reaches the game, which would otherwise
  // read the same Escape as "close the screen".
  nameInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;                      // Enter ends an input method's word, not the name
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finishRename(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishRename(false); }
  });
  // The field keeps only what the name can hold (src/pilot.js): a Russian layout's letters
  // do not show and then vanish on Enter.
  const filterName = () => {
    const kept = nicknameChars(nameInput.value);
    if (kept !== nameInput.value) nameInput.value = kept;
  };
  nameInput.addEventListener('input', (e) => { if (!e.isComposing) filterName(); });
  nameInput.addEventListener('compositionend', filterName);
  nameInput.addEventListener('blur', () => finishRename(true));

  // The choice `d` away in a list that wraps (+1 the next, -1 the one before: a click on a switch's ‹, or ← while the pointer is on it).
  const cycle = (list, worn, d) => list[(Math.max(0, list.indexOf(worn)) + d + list.length) % list.length];

  function nextPaintOnCard(d = 1) {
    const P = world.pilot, list = PAINTS.filter((p) => p.id === 'standard' || P.paints.has(p.id)).map((p) => p.id);
    const next = d > 0 ? nextPaint(P.paints, P.paint) : cycle(list, P.paint, d);
    if (next === P.paint) { pilotMessage('NO OTHER PAINT YET'); sound.play('refuse'); return; }
    P.wearPaint(next);
    pilotMessage(`PAINT / ${paintById(next).label}`);
    sound.play('menu');
    game.persist('paint');
  }

  // The cockpit scheme `d` away among those owned (src/pilot.js, the reference ships' rewards), the interface's own among them.
  function nextCockpitOnCard(d = 1) {
    const P = world.pilot;
    const next = d > 0 ? P.nextCockpit() : cycle([null, ...SPECIAL_IDS.filter((id) => P.cockpits.has(id))], P.cockpit, d);
    if (next === P.cockpit) { pilotMessage('NO OTHER COCKPIT YET'); sound.play('refuse'); return; }
    P.wearCockpit(next);
    pilotMessage(`COCKPIT / ${next ? specialById(next).cockpit.label : 'STANDARD'}`);
    sound.play('menu');
    game.persist('cockpit');
  }

  // The look `d` away among those owned (src/looks.js), NOW and ORIGINAL among them: the grade and the page's colours follow at once.
  function nextLookOnCard(d = 1) {
    const P = world.pilot;
    const next = d > 0 ? P.nextLook() : cycle(ownedLooks(P.looks).map((l) => l.id), P.look, d);   // always another: NOW and ORIGINAL are owned from the start
    P.wearLook(next);
    game.putOnLook();
    pilotMessage(`LOOK / ${lookById(next).name}`);
    sound.play('menu');
    game.persist('look');
  }

  // The charm `d` away (src/pilot.js): NONE, then each souvenir found in the order found, round to NONE. The locator's charm follows at once
  // (labs/graphics/charm.js); with no souvenir found there is nothing to hang, and the first find hangs by itself.
  function nextCharmOnCard(d = 1) {
    const P = world.pilot;
    if (!world.collection.kindsFound().length) { pilotMessage('NO SOUVENIR YET'); sound.play('refuse'); return; }
    const to = d > 0 ? P.nextCharm(world.collection) : cycle([CHARM_NONE, ...world.collection.kindsFound()], P.charm ?? CHARM_NONE, d);
    const next = P.wearCharm(to, world.collection);
    pilotMessage(`CHARM / ${next === CHARM_NONE ? 'NONE' : collectibleDef(next).label}`);
    sound.play('menu');
    game.persist('charm');
  }

  // The switch of the card's band the pointer is on, or null: ← → step it then (the pointer on a row is the focus, as in the pause).
  const SWITCHES = { paint: () => nextPaintOnCard, cockpit: () => nextCockpitOnCard, look: () => nextLookOnCard, charm: () => nextCharmOnCard };
  function switchUnder() {
    const p = game.pointer;
    if (!p?.inside || pilotUI.editing) return null;
    return Object.keys(SWITCHES).find((id) => inBox(pilotUI[`${id}Box`], p.x, p.y)) ?? null;
  }

  function pilotKeys() {
    const n = COLLECTIBLES.length;
    const per = CARD.across;
    // A key that moves the choice ticks, as the hangar's arrows do; at an edge nothing moves, so nothing ticks.
    const choose = (next) => { if (next !== pilotUI.selected) { pilotUI.selected = next; sound.play('menu'); } };
    const move = (d) => choose((pilotUI.selected + d + n) % n);
    // ← → step the switch the pointer is on (the foot says «← → CHANGE»); else they choose the souvenir, as they did.
    const under = switchUnder(), arrow = (key('right') ? 1 : 0) - (key('left') ? 1 : 0);
    if (under && arrow) SWITCHES[under]()(arrow);
    else if (arrow) move(arrow);
    if (key('up')) choose(Math.max(0, pilotUI.selected - per));
    if (key('down')) choose(Math.min(n - 1, pilotUI.selected + per));
    if (key('rename')) startRename();
    // The next paint owned (src/paint.js), STANDARD among them; a click on the PAINT line does the same.
    if (key('nextPaint')) nextPaintOnCard();
    // And the next cockpit scheme (the COCKPIT line under it).
    if (key('nextCockpit')) nextCockpitOnCard();
    // And the next look (the LOOK line under it).
    if (key('nextLook')) nextLookOnCard();
    // And the charm that hangs from the locator (the CHARM line under it).
    if (key('nextCharm')) nextCharmOnCard();
    if (key('close') || key('back') || key('card')) closePilot();
  }

  // ------------------------------------------------------------------ signs ---

  // The sign composer (L). It opens only where a sign may stand, leaves the flight going underneath it like the
  // pilot screen (controls let go, not paused), and owns the keyboard: arrows or
  // WASD choose a word, Enter adds it, Backspace takes the last one off, L
  // leaves the sign where the ship is, 0 or Escape cancels.
  // `type`: what the sign is (src/signs.js SIGN_TYPES), kept between signs as the pilot last chose it.
  const signUI = { words: [], selected: 0, type: DEFAULT_SIGN_TYPE, message: null, messageLife: 0 };

  function openSign() {
    const check = world.signCheck();
    if (!check.ok) { game.notices.notify(check.reason, null, { kind: 'refusal', life: 2.6, waits: false, fate: 'flip' }); sound.play('refuse'); return; }
    sound.play('panelOpen');
    closeHelp(false);
    open.sign = true;
    signUI.words = [];
    signUI.message = null;
  }

  function closeSign() {
    sound.play('panelClose');
    open.sign = false;
  }

  function signMessage(text) {
    signUI.message = text;
    signUI.messageLife = 2.4;
  }

  // The hangar (E4, src/hangar.js): HANGAR at a garage opens it, and in the home garage's room CHANGE STARSHIP or a click on the shuttle
  // (labs/graphics/garage-room.js; SX, 2026-10-13: «делаем в комнате кнопку change starship и выход, а клик по кораблю ведет на выбор корабля»).
  // The flight goes on underneath it like under the pilot card; it owns the keyboard while open: the arrows choose one of the ships on its two
  // shelves (src/hangarPanel.js FLEET: ← → one, ↑ ↓ a shelf), 1 or Enter takes it, 0 or Escape closes.
  const hangarUI = { selected: 0, message: null, messageLife: 0, bought: null };
  // The look the STANDARD wears (src/shipLooks.js, the page's: kept in this browser).
  const worn = () => game.shipLook?.worn;

  function openHangar() {
    closeHelp(false);
    open.hangar = true;
    hangarUI.selected = fleetIndexOf(world, worn());
    hangarUI.message = null;
    hangarUI.messageLife = 0;
  }

  function closeHangar() {
    sound.play('panelClose');
    open.hangar = false;
  }

  function hangarMessage(text) {
    hangarUI.message = text;
    hangarUI.messageLife = 2.8;
  }

  function hangarKeys() {
    const n = FLEET.length, step = (by) => { hangarUI.selected = (hangarUI.selected + by + n) % n; sound.play('menu'); };
    // ↑ ↓ the square in the same column of the other shelf, or its last when that shelf is shorter (the first holds five since 2026-10-16).
    const shelfOver = () => {
      const e = FLEET[hangarUI.selected], col = FLEET.filter((x) => x.shelf === e.shelf).indexOf(e);
      const other = FLEET.filter((x) => x.shelf !== e.shelf);
      hangarUI.selected = FLEET.indexOf(other[Math.min(col, other.length - 1)]);
      sound.play('menu');
    };
    if (key('left')) step(-1);
    if (key('right')) step(1);
    if (key('up') || key('down')) shelfOver();
    if (key('choose')) chooseShip(fleetOf(world, worn())[hangarUI.selected]);
    if (key('close') || key('back')) closeHangar();
  }
  // One of the shelves' ships taken: a ship had is flown (World.flyShip), one on sale bought (World.buyShip), a crew's not had yet says why; a look of the
  // STANDARD is the STANDARD flown (the world says why not: the opening, no hangar here) and then that drawing worn, kept in this browser.
  function chooseShip(e) {
    if (e.flying) { hangarMessage(`${e.label} ALREADY SELECTED`); sound.play('refuse'); return; }
    if (e.crew && !e.owned) { hangarMessage(`HELP ${e.who} FIRST`); sound.play('refuse'); return; }
    // CLIPPER and SCOOTY JR. once the opening is over (src/hangarPanel.js fleetOf `locked`): the reason fleetAction gives.
    if (e.locked) { hangarMessage(fleetAction(world, e).reason); sound.play('refuse'); return; }
    if (!e.look) { if (e.owned) world.flyShip(e.ship); else world.buyShip(e.ship); return; }
    const was = world.hangar.flying;
    if (!world.flyShip(e.ship)) return;
    if (!game.shipLook?.wear(e.look)) { hangarMessage(`${e.label} UNAVAILABLE`); sound.play('refuse'); return; }
    // (Another hull until now: the world's shipChanged says it, labs/graphics/notices.js.)
    if (was === e.ship) { hangarMessage(`SHIP SELECTED / ${e.label}`); sound.play('engineStart'); }
  }

  // A station's info (src/stationPanel.js): INFO in a station's menu opens it,
  // over a flight that goes on like the hangar's; 0 or Escape closes it.
  // The garage's room (labs/graphics/garage-room.js createRoomScreen): its state, keys, clicks and drawing are its own module's; here it
  // is one of the screens, lent what it needs.
  const roomScreen = createRoomScreen({ world, renderer, sound, feedback, pageTime, open, key, closeHelp, openHelp, openPilot: () => openPilot(), openHangar: () => openHangar(),
    controls: () => roomControls(hints()), pointerDown: () => !!game.pointer?.down,
    questBoard: () => game.questBoard });
  const { room, openGarageRoom, leaveGarageRoom, settleGarageRoom, roomKeys } = roomScreen;
  // The map (labs/graphics/map-screen.js): TAB opens it over a flight that goes on and closes it again (SX's pick, 2026-10-02).
  // The sectors the pilot has been in are kept as the flight goes; `?map` in the lab opens it at the start, `?map=all`
  // shows every sector as visited.
  const map = createMap();
  function openMapScreen() {
    if (open.map) return;
    // A new pilot's map is fitted at the first station's dispatch (src/opening.js navFitted); until then the bearing leads.
    if (!navFitted(world)) { world.emit('actionRefused', { reason: 'NO MAP FITTED YET' }); return; }
    closeHelp(false);
    sound.play('panelOpen');
    open.map = true;
    openMap(map, pageTime());
  }
  function closeMapScreen() {
    if (!open.map) return;
    sound.play('panelClose');
    open.map = false;
    closeMap(map);
    renderer.canvas.style.cursor = '';
  }
  function mapKeys() {
    if (key('help')) { if (open.help) closeHelp(); else openHelp(); return; }
    if (key('map') || key('back') || key('close')) { if (open.help) closeHelp(); else closeMapScreen(); return; }
    FLAGS.forEach((_, i) => { if (tappedChoice(input, i) && map.pick !== i) { map.pick = i; sound.play('blip'); } });
    // Move and zoom the picture as the map editor does (W A S D or the arrows, Q E, F for the whole map): the ship's controls
    // are let go under a pop-up, so these keys fly nothing.
    const on = (action) => (held(input, action) ? 1 : 0), tap = (action) => (key(action) ? 1 : 0);
    mapMove(map, { x: on('right') - on('left'), y: on('down') - on('up'), zoom: on('zoomIn') - on('zoomOut') }, pageTime());
    // A tap (a click on the foot's keys too) steps the picture as a wheel's notch does.
    const step = { x: tap('right') - tap('left'), y: tap('down') - tap('up'), zoom: tap('zoomIn') - tap('zoomOut') };
    if (step.x || step.y || step.zoom) mapStep(map, step);
    if (key('fit')) mapFit(map);
  }
  // What the room's list holds: the quests (src/quests.js; each in its colour, a raid with its clock), and the cargo run on, green.
  // `shot`: where INFO's picture takes its fragment of the station, new each time it opens (SX, 2026-10-16: «рандомный фрагмент станции один к
  // одному»; a look-only choice: Math.random).
  const stationUI = { stationId: null, shot: null };

  function openStationInfo(id) {
    closeHelp(false);
    open.station = true;
    stationUI.stationId = id;
    stationUI.shot = { u: Math.random(), v: Math.random() };
  }

  function closeStationInfo() {
    sound.play('panelClose');
    open.station = false;
  }

  function stationKeys() {
    if (key('close') || key('back')) closeStationInfo();
  }

  function signKeys() {
    const n = WORDS.length;
    const per = WORDS_PER_ROW;
    // The same ticks as the hangar and the card: a move ticks, a refusal buzzes.
    const choose = (next) => { if (next !== signUI.selected) { signUI.selected = next; sound.play('menu'); } };
    const move = (d) => choose((signUI.selected + d + n) % n);
    const refuse = (message) => { signMessage(message); sound.play('refuse'); };
    if (key('left')) move(-1);
    if (key('right')) move(1);
    if (key('up')) choose(Math.max(0, signUI.selected - per));
    if (key('down')) choose(Math.min(n - 1, signUI.selected + per));
    if (key('addWord')) {
      const word = WORDS[signUI.selected];
      if (!world.collection.words.has(word.id)) refuse('NOT FOUND YET');
      else if (signUI.words.length >= SIGN_WORDS_MAX) refuse('SIGN FULL / REMOVE A WORD');
      else { signUI.words.push(word.id); sound.play('menu'); }
    }
    if (key('removeWord') && signUI.words.pop()) sound.play('menu');
    // T: the next type of sign (SX, 2026-10-01: «давай позволим выбирать тип»).
    if (key('signType')) {
      const at = SIGN_TYPES.findIndex((t) => t.id === signUI.type);
      signUI.type = SIGN_TYPES[(at + 1) % SIGN_TYPES.length].id;
      signMessage(signTypeLabel(signUI.type));
      sound.play('menu');
    }
    if (key('placeSign')) {
      if (!signUI.words.length) refuse('PICK A WORD FIRST');
      else if (world.leaveSign(signUI.words, signUI.type)) closeSign();
    }
    if (key('close') || key('back')) closeSign();
  }
  // Where a click on a find's notice takes the pilot: the card on that souvenir, the map, a pointer put on.
  function openCardOn(defId = null) {
    if (!open.pilot && !anyScreen()) openPilot();
    const at = defId ? COLLECTIBLES.findIndex((c) => c.id === defId) : -1;
    if (at >= 0) pilotUI.selected = at;
  }
  // On the pilot card the PAINT line is a button: a click puts on the next paint owned.
  const onPaintLine = (x, y) => {
    const box = open.pilot && pilotUI.paintBox;
    return !!box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  };
  const onCockpitLine = (x, y) => {
    const box = open.pilot && pilotUI.cockpitBox;
    return !!box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  };
  const onLookLine = (x, y) => {
    const box = open.pilot && pilotUI.lookBox;
    return !!box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  };
  const onCharmLine = (x, y) => {
    const box = open.pilot && pilotUI.charmBox;
    return !!box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  };

  // Each frame: a screen's line of message fades after its time.
  // The task the top banner shows (src/tasks.js focusedTask), where it leads and in its ink, for the map: the same target as the
  // bearing in the sky and the locator.
  function mapTarget() {
    const task = focusedTask(currentTasks(world), game.questBoard?.activeId ?? null), at = taskTarget(world, task);
    if (!at) return null;
    const ink = task.kind === 'quest' ? (QUEST_TONES[questTone(task.quest)] ?? QUEST_TONES.green).ink : routeInk(taskNavigation(world, task));
    return { ...at, ink };
  }
  function stepMessages(rawDt) {
    if (pilotUI.messageLife > 0) { pilotUI.messageLife -= rawDt; if (pilotUI.messageLife <= 0) pilotUI.message = null; }
    if (signUI.messageLife > 0) { signUI.messageLife -= rawDt; if (signUI.messageLife <= 0) signUI.message = null; }
    if (hangarUI.messageLife > 0) { hangarUI.messageLife -= rawDt; if (hangarUI.messageLife <= 0) hangarUI.message = null; }
  }

  // ----------------------------------------------------------- the registry ---

  // The keys that open a screen from flight (the input router's flightKeys asks first). At most one screen opens in a frame (SX's
  // bug hunt, 2026-09-30: C and P in one frame opened the card over a running world, a menu's number and C stacked two screens):
  // TAB, C, L and ? are read in this order, and the first to open one ends the frame's keys. True when the frame's keys end here.
  function openKeys() {
    const helpWasOpen = open.help;
    if (key('map')) { openMapScreen(); return true; }
    if (key('card')) openPilot();
    else if (key('sign')) openSign();
    else if (key('help')) { if (open.help) closeHelp(); else openHelp(); }
    return open.pilot || open.sign || (open.help && !helpWasOpen);
  }

  // The two-tabs window's keys, read before the page's own (the screen, the sound, the pause): while the window stands it holds
  // them all. True when it took the frame.
  function tabsKeys() {
    if (tabLocked()) return true;                       // paused for good: a newer tab plays
    if (!tabsUI.open) return false;
    if (key('back') || key('close')) closeTabs();
    else if (tabsUI.clear && [...input.pressed].some(isPlayKey)) {
      // The key that plays on does nothing in the flight, as the title's does not (title-final.js bindTitleMenu).
      input.down.clear();
      closeTabs();
    }
    return true;
  }

  // Which screen takes the frame's keys, first that holds: the map, the room (unless the card or the hangar stands over it), the hangar, INFO,
  // the card (its keys rest while its name is typed: the field has them), the composer. The controls list holds none: it stands
  // over the flight's own keys, which read it (flightKeys).
  const HOLDS = [
    { id: 'finale', holds: () => open.finale, keys: () => { if (key('confirm') || key('back') || key('close')) closeFinale(); } },
    { id: 'map', holds: () => open.map, keys: () => mapKeys() },
    { id: 'room', holds: () => open.room && !open.pilot && !open.hangar, keys: () => roomKeys() },
    { id: 'hangar', holds: () => open.hangar, keys: () => hangarKeys() },
    { id: 'station', holds: () => open.station, keys: () => stationKeys() },
    { id: 'pilot', holds: () => open.pilot, keys: () => { if (!pilotUI.editing) pilotKeys(); } },
    { id: 'sign', holds: () => open.sign, keys: () => signKeys() },
  ];
  // The keys of the screen that stands; false when none does (the flight's keys then).
  function screenKeys() {
    const on = HOLDS.find((s) => s.holds());
    if (!on) return false;
    on.keys();
    return true;
  }

  // Every screen as a pop-up, in the order they are drawn (the last on top): whether it stands (`shown`) and how it is drawn
  // (`draw(popup)`: `popup(close, paint, keep)` measures what `paint` draws, `close` what a click outside it does, `keep` the keys a
  // click on it may press).
  const POPUPS = [
    // The room's plate says its keys as the scheme reads them (src/controls.js roomControls).
    { id: 'room', shown: () => open.room, draw: (popup) => popup(() => leaveGarageRoom(), () => roomScreen.draw()) },
    { id: 'map', shown: () => open.map, draw: (popup) => popup(closeMapScreen, () => drawMap(renderer, map, world, pageTime(), { reducedMotion: feedback.reducedMotion, target: mapTarget(), scheme: hints() })) },
    { id: 'help', shown: () => open.help, draw: (popup) => {
      // The modes' pages: the head's choice is a button (a click on its ‹ steps back, anywhere else on it forward, and at the end of the row
      // the other way: there are two), and the foot's ← → page through them (keys a click presses).
      const keep = [...KEYS.close, ...KEYS.back, codesOf('left')[0], codesOf('right')[0]];
      popup(() => closeHelp(), () => {
        const drawn = drawControlsWindow(renderer, { page: helpUI.page, can: world.ship.params().can, steering: game.steering?.mode });
        noteAction(drawn.scheme.box, () => {
          const back = !!game.pointer && inBox(drawn.scheme.back, game.pointer.x, game.pointer.y);
          if (!stepHelpPage(back ? -1 : 1)) stepHelpPage(back ? 1 : -1);
        });
      }, keep);
    } },
    { id: 'tab-locked', shown: () => tabLocked(), draw: (popup) => {
      tabsUI.lockedSince ??= pageTime();
      popup(null, () => drawTabsWindow(renderer, 'older', { age: pageTime() - tabsUI.lockedSince, reducedMotion: feedback.reducedMotion }));
    } },
    { id: 'tabs', shown: () => !tabLocked() && tabsUI.open, draw: (popup) => {
      // Clear, a click anywhere plays on, as any key does (SX, 2026-10-02: «не реагирует на клик»); waiting, its ESC is a button.
      const playOn = tabsUI.clear ? () => closeTabs() : null;
      popup(playOn, () => drawTabsWindow(renderer, tabsUI.clear ? 'clear' : 'waiting', { age: pageTime() - tabsUI.since, reducedMotion: feedback.reducedMotion, onClick: playOn }));
    } },
    // The windows in the menus' look (labs/graphics/windows.js, SX's V2, 2026-10-05): each hands back the boxes a click reads here.
    { id: 'pilot', shown: () => open.pilot, draw: (popup) => popup(() => { if (!pilotUI.editing) closePilot(); }, () => {
      const drawn = drawPilotCard(renderer, world, pilotUI);
      pilotUI.nameBox = drawn.nameBox;
      pilotUI.paintBox = drawn.paintBox;
      pilotUI.cockpitBox = drawn.cockpitBox;
      pilotUI.lookBox = drawn.lookBox;
      pilotUI.charmBox = drawn.charmBox;
      pilotUI.tiles = drawn.tiles;
      pilotUI.backs = drawn.backs;
      if (pilotUI.editing) placeNameField();
    }) },
    { id: 'sign', shown: () => open.sign, draw: (popup) => popup(() => closeSign(), () => { signUI.wordBoxes = drawSignComposer(renderer, world, signUI).wordBoxes; }) },
    { id: 'hangar', shown: () => open.hangar, draw: (popup) => popup(() => closeHangar(), () => { hangarUI.ships = drawHangar(renderer, world, { ...hangarUI, worn: worn(), time: pageTime(), still: feedback.reducedMotion }).ships; }) },
    { id: 'finale', shown: () => open.finale, draw: (popup) => popup(() => closeFinale(), () => drawFinaleWindow(renderer, world, { onClose: () => closeFinale() }),
      [...KEYS.close, ...KEYS.back, ...KEYS.confirm]) },
    { id: 'station', shown: () => open.station, draw: (popup, now) => popup(() => closeStationInfo(), () => {
      // The station's own look in the window's shot, animated on the page's clock, `now` (the world goes on under the window, and
      // the picture is not the world's).
      drawStationInfo(renderer, world, { ...stationUI, time: now / 1000 });
    }) },
  ];

  // Draws every screen that stands, in POPUPS' order; returns the one on top ({ box, close }), or null.
  function drawPopups(now) {
    let onTop = null;
    const popup = (close, draw, keep = null) => { onTop = { box: measure(renderer, () => noteDuring(renderer, draw, keep)), close }; };
    for (const p of POPUPS) if (p.shown()) p.draw(popup, now);
    return onTop;
  }

  // The pointer over a screen that takes the pointer's whole picture (the garage's room, the map): the canvas's cursor hint there, or
  // null where no screen claims it.
  function pointerHint(x, y) {
    if (open.room && !open.pilot && !open.hangar && !open.help) return roomScreen.point(x, y);
    if (open.map && !open.help) { const at = mapPoint(map, x, y); return at === 'pick' ? 'pointer' : at === 'drag' ? 'grabbing' : at ? 'crosshair' : ''; }
    return null;
  }
  const onCardLine = (x, y) => onPaintLine(x, y) || onCockpitLine(x, y) || onLookLine(x, y) || onCharmLine(x, y);

  // A click at (x, y): the garage's room's, the map's, the card's lines and tiles, the hangar's ships, the sign's words. True when a
  // screen took it or one stands (then nothing under it answers).
  function click(x, y) {
    const p = { x, y };
    if (open.room && !open.pilot && !open.hangar && !open.help) return roomScreen.click(p.x, p.y);
    if (open.map && !open.help) {
      const did = mapClick(map, world.flags, p.x, p.y, pageTime(), world.rng('flag'));
      if (did) sound.play('blip');
      // A flag put is the pilot's for good (taken down only by hand, in space): saved at once, as a sign is.
      if (did === 'flag') game.persist('flag');
      return true;
    }
    // A switch of the pilot card: a click steps it on, on its ‹ back (labs/graphics/windows.js backs).
    const dir = (id) => (inBox(pilotUI.backs?.[id], p.x, p.y) ? -1 : 1);
    if (onPaintLine(p.x, p.y)) { nextPaintOnCard(dir('paint')); return true; }
    if (onCockpitLine(p.x, p.y)) { nextCockpitOnCard(dir('cockpit')); return true; }
    if (onLookLine(p.x, p.y)) { nextLookOnCard(dir('look')); return true; }
    if (onCharmLine(p.x, p.y)) { nextCharmOnCard(dir('charm')); return true; }
    // What the keyboard chooses with its arrows, a click chooses where it is (SX, 2026-10-03: the mouse reaches every element):
    // a tile on the pilot card, a ship in the hangar, and a word of the sign, which a click also adds as ENTER does.
    const hit = (list) => list?.find(({ box: b }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) ?? null;
    const tile = open.pilot && !pilotUI.editing ? hit(pilotUI.tiles) : null;
    if (tile) { if (tile.index !== pilotUI.selected) { pilotUI.selected = tile.index; sound.play('menu'); } return true; }
    const ship = open.hangar ? hit(hangarUI.ships) : null;
    if (ship) { if (ship.index !== hangarUI.selected) { hangarUI.selected = ship.index; sound.play('menu'); } return true; }
    const word = open.sign ? hit(signUI.wordBoxes) : null;
    if (word) { signUI.selected = word.index; input.pressed.add(KEYS.addWord[0]); return true; }
    return anyScreen();
  }

  return { open, pilotUI, signUI, hangarUI, stationUI, tabsUI, helpUI, room, map, tabLocked, anyScreen, openTabs, tabsClear, closeTabs,
    openHelp, closeHelp, stepHelpPage, openFinale, closeFinale, openPilot, closePilot, openSign, closeSign, openHangar, closeHangar, hangarMessage, openStationInfo,
    closeStationInfo, openGarageRoom, leaveGarageRoom, settleGarageRoom, openMapScreen, closeMapScreen, openCardOn, finishRename,
    pilotKeys, hangarKeys, stationKeys, signKeys, mapKeys, roomKeys, openKeys, tabsKeys, screenKeys, stepMessages, drawPopups, pointerHint,
    onCardLine, click };
}
