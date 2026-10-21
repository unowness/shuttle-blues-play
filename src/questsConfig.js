// What the pilot is sent to: the side quests (their pacing, the four colours, the reference ships' legs) and the caches laid where he
// can find them. Moved out of src/config.js as they were (PLAN D5, 2026-10-09, the config split; owed by chat SC, 2026-10-04); CONFIG
// holds each section under its old name (CONFIG.quests is QUESTS.quests, CONFIG.cache is QUESTS.cache, the same objects), so every
// reader is unchanged. The rules are src/quests.js, src/questHooks.js, src/pacing.js (pure, read by tools/quest-economy-sim.mjs),
// src/specials.js and src/cachePlaces.js. A leg or a spread is the layout's u grown with the world (`spread`, src/worldScale.js).

import { spread } from './worldScale.js';

export const QUESTS = {
  cache: {
    // What a cache costs is its own since the v1 economy (src/rewards.js: every
    // souvenir 250 CR, a paint 300, 400 or 500); the ladder by souvenirs held is gone.
    interactRadius: 380,
    discoverRadius: 2600,
    scale: 1.25,            // 1.3 until SX, 2026-09-30: «Сундуки крупноваты»; 1.15 until his scales of 2026-10-17 («тайник может быть ... 1.25»)
    sparkColor: '#b6f5ee',
    shardColor: '#98a1ab',
    // A cache, souvenirs' or a paint's, floats and turns, and is knocked away when run into (SX, 2026-10-01: «флоутинг
    // какой-то должен быть у сундуков и сундуков с красками. Сделай им также легкое вращение вокруг своей оси. Довольно
    // медленно. И давай, если мы в них врезаемся, то они отлетают с ускорением куда-то подальше ... не летит с
    // бесконечным ускорением ... довольно быстро тормозит, там, когда за предел кадра ... вылетает»). It rises and sinks
    // `bob.amount` px once in `bob.period` s and turns at `spin` rad/s (a full turn in 40 to 80 s), each its own way and
    // phase, by its id. The hull meets it at `radius`: from `touchSpeed` it is thrown along the blow at `kick` times the
    // closing speed and slows by `drag` a second, so a blow at 600 u/s sends it some 850 u, out of the frame, and one at
    // 150 a little over 200; it is set turning by up to `knockSpin` rad/s more, which dies away by `spinDrag` a second.
    // The ship loses `give` of the closing speed and pays a light thing's price (CONFIG.hull.light: 2 to 5). Where it
    // was put back stays only while the pilot is in the sector (a cache is laid out again on coming back).
    // (`radius` 42 while the caches were drawn at 1.15; grown with the drawing to 1.25, 2026-10-17.)
    float: { bob: { amount: 5, period: 4.2 }, spin: [0.08, 0.16], radius: 46, touchSpeed: 40, kick: 2, drag: 1.4,
      knockSpin: 3, spinDrag: 0.8, give: 0.25 },
    // Where a cache is laid when it becomes the pilot's to find (src/cachePlaces.js; SX, 2026-10-02: «новые тайники не
    // обязательно должны в новом секторе быть ... я расставил их изначально на карте, но тут нужно интереснее сгенерировать
    // логику»; of the options, «Противовесы» and «Пул хороших мест»). Any open sector, its weight 1 / (1 + `crowd` × the
    // caches waiting there), times `here` for the sector the pilot is in. In it, one of SX's places (the catalogue's 24) that
    // is free, else a clear place found in `tries` draws `edge` of the sector off each side. A waiting cache keeps `apart` u
    // from every other waiting one and `hole` u from the secret hole; a place another cache already took is taken within
    // `taken` u. Once laid, a cache stays where it is until opened (the ledger keeps it).
    place: { here: 0.35, crowd: 1, apart: spread(1100), hole: 1400, edge: 0.1, tries: 160, taken: 60 },
  },

  // Side quests (src/quests.js; SX: «если ты накопил денег на новую краску, это может быть квест ... иногда это рандомный
  // ... высветится»): looked for every `checkEvery` s of flight, the first look `firstAfter` s in, offered at `chance` a
  // look when the wallet reaches something, one at a time, and a rest of none after one ends.
  //
  // THE PACING (the quest economy, reports/2026-10-02-quest-economy.md; the rules are src/pacing.js, measured by
  // tools/quest-economy-sim.mjs, which reads these numbers): SX, 2026-10-02: «квесты не сразу прям все открыты были, а как-то
  // равномерно подавались ... вначале было по квестам побогаче ... новых квестов все меньше к концу ... но ты не был
  // завален заданиями». Slots: one red (a raid OR a ship pestered), one side (yellow, blue, green), the guide while its
  // line runs, and nothing new while a reference ship stands or is flown. Tables are rows of [stations restored, ...],
  // straight between the rows.
  //   rest        s of none after the side slot frees (was 120 flat), by stations restored: short at the start, long late
  //   expire      s an offer not yet started stands before it goes quietly (it never did: an unwanted one held the slot)
  //   holdForRed  no new side or guide offer while a raid or a ship pestered is on
  //   unlock      what a kind waits for: deliveries done, finds opened, ruins cleared of guards, ruins restored, or `begun`, the restoration
  //               of a station begun (money in a ruin; SX, 2026-10-09: «как только мы начали квест по сбору станции, уже должны быть
  //               сайт-квесты про помощь NPC, сайт-квесты по рейдам, и прочее»): the stranger's cargo (3 deliveries), the wrecked ship
  //               (a cache and 4 deliveries) and the planet's errand (a station restored) come with the first money if that is sooner
  //               than their own gate, whichever comes first
  //   weights     how often a kind is drawn among those unlocked with something to offer (was even)
  //   grow        each station restored adds this share to a money quest's pay (freight's tariff adds a fifth), to 5 CR
  //   guide       the green radio line: `rest` s between its steps, `pay` the radio's thanks per step (src/guide.js)
  // `rescue`: a pilot out of fuel (the quests sheet's sample, «A PILOT OUT OF FUEL / BRING 20 FUEL»): `fuel` units given
  // for `pay` CR (three times the shops' price), drifting `clear` u from everything in its sector; it hails (`hail`) a
  // pilot within `hailReach` u once, and flies off over `leave` s when helped.
  //
  // Quests in four colours (QUESTS_V2_HANDOFF.md, SX, 2026-10-02), the first three of the new ones:
  // `pester` (red, SX: «Там 2-3 пирата просто пристают к маленькому кораблю»; three or four since his «на одного больше всегда»,
  // 2026-10-17): `squad` pirates (by weight) circle a small
  // friendly ship (one of `ships`, NPC_ART codes: TAXI, HOPPER, SAMPLER) held still in the open, `ring` u from it; the pilot
  // has `time` s on the pilot's clock to drive them off, and a ship freed pays `pay` CR (a short delivery pays 100-200). It
  // is called on its own clock beside the side quests, as a raid is (a red quest does not wait behind a green one): not
  // before `first` s of the pilot's clock and, with `afterFight`, a first pirate fight won (asked to defend someone only
  // after defending oneself), then `gap` s (a table by stations restored) from one's end to the next one's start, in this sector or one beside it,
  // on a spot `clear` u from everything and `edge` of a sector in from its seams (the ring is never seen coming in) and
  // `apart` u from the pilot. The squad wakes at `wake` u. A pirate fires at the ship every `fire` s (a bolt that ends
  // on its hull: nothing flies on across the ring). A ship going away takes `leave` s (`limp` s when it was too late).
  // `wreck` (yellow, SX: «Желтые это помочь кораблю, который разбился, дать ему денег»): a wrecked ship, sparking and
  // turning, asks one of `asks` CR (the ones the wallet covers) and gives, for it, a tip: a cache marked, a signal marked
  // (it is offered as the next quest) or a word for signs. `spark` s between its sparks, `broken` the share of its cells
  // gone, `clear` u from everything in its sector.
  // `errand` (blue, SX: «квест у планеты, ты подлетаешь, с тобой общаются через вот такой бабл ... просят привезти какой-то
  // там чемодан»): a planet within `reach` u of its limb says its three lines and offers the job; the suitcase is taken at
  // a working station between `minLeg` and `maxLeg` u of it and brought back for `pay` CR; on the way back, once the pilot has flown
  // `ambush.after` of the way (at least `min`, at most `max` u) and at least `minLeft` u remain, a squad of `squad`
  // comes after the pilot. Its legs, like the reference ships', are the layout's u grown with the world (src/worldScale.js spread).
  // `errand.suitcase`, how the suitcase aboard is drawn (src/errands.js drawSuitcase; SX's L4C on labs/graphics/sketches/quest-objects.html,
  // 2026-10-15: «пусть он наверное тоже будет на короткой веревочке и из него должны вылетать иногда детальки как будто что то из него
  // сыпется», then «этот»): its glyphs at `scale` of the world's cell (the cargo container's 1.0, a cache's 1.15: SX, «рядом с кораблем
  // не должно ощущаться резкое изменение масштаба»). Since SX, 2026-10-17 («чтобы он сбоку пристегивался к кораблю и сбоку торчал, когда мы
  // летим. Лучше так, наверное. Отличить его от обычного груза»): clamped to the hull's left side, `clamp` px of bar from the hull's drawn
  // side to its handle, standing out from it, no rope. `rope`, `swing` and `side` are the voice recorder's (src/chorusArt.js), which hangs as
  // the suitcase did: `rope` px of rope from the hull's drawn rear to its handle, swinging by `swing` (two waves: [rad, rad/s, rad, rad/s]),
  // turned `side` rad off the line behind while a cargo is towed (the two never cross);
  // `spill`: a bit of what is packed comes out every `every` s plus up to `jitter` s, a `skip` share of the moments with none, lives
  // `life` s, flies `speed` px/s away from the ship within `spread` rad, turns by up to `spin` rad/s, drawn at `size`.
  // The money quests' pays since the economy SX chose (2026-10-04: «по экономике согласен»; Codex's study, proposal.json `quests`):
  // `rescue.pay` 150 (75 until then), `pester.pay` 300 (150), `errand.pay` 450 (220), `stranger.fee` 75 (50); a raid won's thanks
  // are CONFIG.raids.thanks (350). Each grows by `grow` a station restored, as before; the radio's and the reference ships' as they were.
  // `apart` (SX's item 5, 2026-10-04: side quests were put too close together; chat W): u every open quest's place keeps from every
  // other's (src/spots.js; checks/quest-spacing.mjs): 2,400 u, about one and a half screens at 1440 px, until SX's «больше» (2026-10-04,
  // the picks hub); now 3,000 u of his layout, grown with the world (src/worldScale.js spread): 6,000 u, about four screens.
  quests: { checkEvery: 15, firstAfter: 20, chance: 0.5, apart: spread(3000),
    rest: [[0, 60], [1, 120], [2, 150], [4, 240], [6, 360], [8, 480]],
    expire: 600, holdForRed: true, grow: 0.1,
    unlock: { find: {}, rescue: { deliveries: 1 }, signal: { deliveries: 2 }, stranger: { deliveries: 3, begun: true },
      wreck: { finds: 1, deliveries: 4, begun: true }, rebuild: { cleared: 1 }, planet: { restored: 1, begun: true }, freight: { deliveries: 1 } },
    weights: { rescue: 1, stranger: 1.5, wreck: 0.7, planet: 1.5, find: 1, rebuild: 1, signal: 0.6 },
    // The freight hint (src/freight.js; SX, 2026-10-09, after a flight: «постоянно довольно мало денег и ничего не отсылает не намекает
    // на то, что нужно отвести груз ... вот я дошел до миссии, где надо вложить деньги, мне нет денег, и мне не приходят никакие
    // квесты»). A blue side quest that sends a pilot with a ruin to fund and a wallet under the ruin's least instalment, carrying no
    // cargo, to the nearest station with a job on offer. It is not drawn with the other kinds: it comes ahead of the draw, once the
    // pilot has been stuck for `wait` s (the pilot's own time, kept from the look that first saw it; a look is `checkEvery` s, so
    // up to that much more), and not again within `rest` s of the last one's end, however it ended. Both are in memory only, as the
    // other rests are. Done when a job is taken; nothing of its own is paid (the freight pays by itself).
    freight: { wait: 90, rest: 300 },
    // The memory of the last 20 minutes and its counterweights (src/pacing.js; SX, 2026-10-02: «сколько раз за последние 20 минут
    // пилот встретил такого нпс и постепенно повышать вероятности встретить другого типа и также с квестами»). A note (a kind
    // offered, a ship met or asked about) counts 1 and fades over `window` s of the pilot's clock; a count weighs `lean` per
    // point, never under `floor`; `met` and `asked` what a ship met in passing and a ship a quest is about add to its count;
    // `offerFloor` the least share of its chance an offer keeps when every kind there is was offered lately. `lean` 1 turns it all off.
    mix: { window: 1200, lean: 0.6, floor: 0.12, met: 1, asked: 2, offerFloor: 0.3 },
    stranger: { fee: 75 },
    guide: { rest: 120, pay: { 'first-run': 50, 'a-souvenir': 25, 'on-the-radio': 25, 'the-guards': 100,
      'first-coins-in': 50, 'a-paint': 25, 'home': 25, 'rebuild': 200 } },
    // The radio's first NPC quest (src/questHooks.js stepRadioCall; SX, 2026-10-06: «первый квест нпс, мы получаем по радио через 1
    // минуту после его получения»): a pilot out of fuel calls `after` s of the pilot's clock after the radio is given; where none can be
    // placed now (the side slot taken, the ship down, O-08, a reference ship), it tries again `retry` s later.
    npcCall: { after: 60, retry: 5 },
    // The words a ship says are pools, never the last line again, with each ship's own besides (src/voices.js; SX, 2026-10-02:
    // «нпс разными фразами должны благодарить и говорить фразочки»): `hail` the plea a pilot out of fuel makes to one who comes
    // near, `thanks` what it says when fuelled.
    rescue: { fuel: 20, pay: 150, clear: 900,
      hail: ['ANYONE HAVE FUEL TO SPARE?', "TANK'S EMPTY. CAN YOU TRANSFER FUEL?", 'DRIFTING HERE. NEED FUEL.', "CAN'T RESTART. NO FUEL LEFT.", 'FUEL CALL. ANYONE IN RANGE?'],
      thanks: ["FUEL RECEIVED. THAT'S A RELIEF.", 'ENOUGH FOR THE NEXT LEG. THANKS.', 'THAT SHOULD DO IT. THANKS, PILOT.', 'TRANSFER RECEIVED. MUCH OBLIGED.', 'THANKS. I WAS GETTING WORRIED.', 'I CAN GET MOVING NOW. THANK YOU.'],
      hailReach: 460, leave: 3 },
    pester: {
      first: 360, afterFight: true, gap: [[0, 480, 720], [4, 900, 1500], [8, 1500, 2400]], time: 180, squad: [[3, 0.5], [4, 0.5]], ships: ['N15', 'N16', 'N28'],
      ring: 300, wake: 900, clear: 700, edge: 0.22, apart: 2000, pay: 300, fire: [1.6, 3.4], leave: 3.5, limp: 7,
      hailReach: 460,
      help: ['PIRATES HAVE ME PINNED. HELP!', 'ANYONE FREE TO DEAL WITH PIRATES?', 'TOO MANY OF THEM. NEED COVER.', 'MAYDAY. PIRATES FIRING ON ME.', "PIRATES WON'T LET ME THROUGH."],
      thanks: ["THEY'RE GONE. THANK YOU.", 'STILL HERE, SOMEHOW. THANKS.', 'THAT GIVES ME A WAY OUT. THANK YOU.', 'THANKS FOR DRIVING THEM OFF.', 'GOOD COVER, PILOT. APPRECIATED.', 'GLAD YOU WERE NEARBY. THANK YOU.'],
    },
    wreck: {
      asks: [40, 60, 90], clear: 900, hailReach: 460, leave: 3, spark: [0.5, 1.4], broken: 0.22,
      thanks: ["THANKS. I'VE A LEAD FOR YOU.", 'LET ME SHARE A TIP IN RETURN.', 'I CAN OFFER A TIP. THANK YOU.', 'THANKS, PILOT. THIS MAY BE USEFUL.', 'THAT COVERS IT. I HAVE A LEAD.'],
    },
    // The reference ships' rare quests (src/specials.js; QUESTS_V2_HANDOFF.md round three; paced by the quest economy,
    // SX, 2026-10-02: «Раз в ~30 мин»): a ship out of O-08 stands still in the pilot's sector, rarely, for `stay` s, `apart` u
    // from the pilot and `clear` u from everything. They come in `order` (each [ship, ruins restored it waits for, CR it
    // pays when its quest is won, on top of its paint, cockpit and note: SX picked «Вещи и CR»]), each until its note is
    // held, the gentlest first. The first not before `first` s of the pilot's clock; after one ends (won, lost or left
    // unmet) `rest` s of none, then a chance a minute (`chance`, looked for every `checkEvery` s) and a sure one once `pity`
    // s have passed since it ended. Measured by tools/quest-economy-sim.mjs on the steady pilot: the first at about 46
    // minutes, 28 minutes from one's coming to the next's, the sixth about 3.5 hours in (a ship failed comes again, and
    // 15 % fail). Said over its head within `reach` u of it. The pay is flat: they come late, where a station's worth is a small part of a wallet.
    //   delorean   a race to a station 7-13 km off at `speed` u/s on average, and `slack` s over
    //   swordfish  `waves` of pirates one after another at a place in this or the next sector, from `arrive` u (a squad is four
//              at most, CONFIG.pirates.maxGroup: so are the waves)
    //   express    `cars` crates from a planet to as many stations in turn, the top speed `loadTop` of itself with them
    //   falcon     `waves` at a ruin, each coming in from `ring` u off it, the next when no more than `overlap` are left
    //   serenity   a station two sectors off at `speed` u/s and `slack` s over, the hull falling to `hullEnd` of its own
    //              by the deadline
    //   xwing      `time` s to cross from here to a station or planet away up and to the right, pirates in squads of
    //              `squad` every `spawnEvery` s, never more than `cap` at once
    // A leg (`minLeg`, `maxLeg`) is a distance of the map: written in u of SX's layout, grown with the world (src/worldScale.js spread).
    special: {
      first: 2100, rest: 600, chance: 1 / 10, pity: 1500, checkEvery: 15, stay: 900, apart: 2200, clear: 900, edge: 0.2, reach: 460,
      // The ruins each waits for are what its quest's geometry needs (chat E1, 2026-10-04; Codex's economy study found the gates
      // the map really makes): EXPRESS three working stations in reach of a planet, so one restored (the start has two); SERENITY
      // a station two sectors off, so three (J-06 opens with the third); until then they were 0 and 1, and the ship that was due
      // could not be met at all (its plan found nothing) while the clock that paces them ran as if it could.
      order: [['delorean', 0, 300], ['scooby', 1, 300], ['express', 1, 300], ['serenity', 3, 350], ['swordfish', 2, 400], ['falcon', 3, 450], ['xwing', 4, 500]],
      invuln: 2.4,
      // The timed runs' paces (`speed`) and the X-WING's `time` follow the ships' tops: 380 and 260 until the world and the ships slowed (W2),
      // 285 and 195 and 160 s until the tops went to 0.85 of that, and 242, 166 and 188 s until 0.8 of it (2026-10-05), and 228, 156 and
      // 200 s until 0.9 of it, and 257, 176 and 178 s until 0.999 of it (2026-10-06): a run's clock as fair as it was.
      delorean: { speed: 285, slack: 15, minLeg: spread(7000), maxLeg: spread(13000) },
      swordfish: { waves: [3, 4, 4, 4], arrive: 1100, pause: 3 },
      express: { cars: 3, minLeg: spread(2500), maxLeg: spread(11000), loadTop: 0.85 },
      falcon: { waves: [4, 4, 4, 4], arrive: 1400, ring: 1500, overlap: 2 },
      serenity: { speed: 195, slack: 20, hullEnd: 0.05 },
      xwing: { time: 160, minLeg: spread(9000), maxLeg: spread(20000), spawnEvery: [6, 10], squad: 2, cap: 6 },
      // The MYSTERY MACHINE's run (src/specialQuests.js scooby, src/scoobySnacks.js; SX, 2026-10-21: «давай надо собрать 75 минимум из 100,
      // надо еще таймер подобрать удобный», «Таймер на весь квест»): `trails` trails of `per` snacks, `gap` u apart along each, laid in the
      // sector where the van stands (each a walk of `legs` legs `leg` u long, bending up to `turn` rad, its snacks `clear` u off every
      // planet, hole and station, `edge` of the sector in from its sides, `apart` u from the other trails and the van; `tries` walks a
      // trail); `need` of them taken within the clock wins. The clock: the way through the trails a win needs (src/scoobySnacks.js
      // trailWay: the nearest first, as many as hold `need`) at `speed` u/s and `slack` s over. Measured 2026-10-21 (a bot on the van's
      // chassis steering its velocity at up to 500 u/s, 18 plans: 6 sectors x 3 seeds): the 75 taken in 39-51 s; the clock 1:24-1:48,
      // 1.9 to 2.4 times that, for a pilot's hands («надо еще таймер подобрать удобный»). A snack is taken within the coin's reach (CONFIG.pickup.collectRadius) and the hull's, `nose` u
      // more for the drawing's nose. `smoke`: the pipes' puffs (src/scoobySnacks.js stepSmoke). `art`: the snack drawn (SX's K1 LINE).
      scooby: { trails: 4, per: 25, need: 75, gap: 70, legs: 6, leg: 380, turn: 0.75, clear: 520, edge: 0.08, apart: 650, tries: 60,
        speed: 270, slack: 45, nose: 18,
        smoke: { every: 0.045, life: 1.1, speed: 80, carry: 0.15, drag: 2.4, scatter: 0.55, moving: 140, max: 120, grow: 1.1,
          ink: '#B7BEC6', alpha: 0.85, glyphs: ['·', '∘', 'o', 'O', 'O'] },
        art: { scale: 0.5, spin: 1.1, body: '#C47A45', knob: '#EDD3A2' } },
    },
    errand: {
      pay: 450, reach: 460, minLeg: spread(2500), maxLeg: spread(9000),
      ambush: { after: 0.4, min: 900, max: 2600, minLeft: 1500, squad: [[2, 0.6], [3, 0.4]] },
      suitcase: { scale: 1.05, clamp: 7, rope: 26, swing: [0.28, 1.4, 0.08, 3.1], side: 0.6,
        spill: { every: 0.6, jitter: 0.4, skip: 0.25, life: [1.6, 2.5], speed: [34, 80], spread: 1.8, spin: 4, size: 1.15 } },
    },
    // `chorus`, COMMONS's chain THE CHORUS (src/chorus.js; SX, 2026-10-15: «Давай цепочку»): it begins when the pilot comes within `hear` u
    // of the ring restored (a little past its window's 620, so the ring and the pieces over it are on the screen), and the AI greets again once the pilot has been `again` times as far; a recorder buoy lies `clear` u off
    // everything in its sector and is taken within `reach` u; each voice played back pays an errand's pay (src/pacing.js 'planet'), the
    // four back `finale` CR once. `beat`: how long a piece stands before the next (s): `base` and `perChar` a recording by its length,
    // `noise` the static, `hole` a missing one. `line`: a said piece over the station (src/feedback.js) lives `life` s, `shown` at once.
    // `art`, the recorder (SX's C2, labs/graphics/sketches/quest-objects.html; src/chorusArt.js): drawn at `lying` of the world's cell where
    // it lies and `carried` on the rope (the suitcase's rope and swing, turned to the other side); its inks COMMONS's own tones (the RING
    // look's `lit` and `mid`, labs/graphics/station-art.js) and its pupil white as the ring's lamps; the AI's own words in `own`.
    chorus: { hear: 750, again: 2, clear: 700, reach: 460, finale: 1000,
      beat: { base: 0.9, perChar: 0.05, noise: 1.2, hole: 1.6 },
      line: { life: 6, shown: 3 },
      art: { lying: 1.35, carried: 1.05, body: '#A99BE0', inner: '#7e73a6', own: '#A99BE0' } },
  },
};
