// The economy's numbers: the delivery clock, fuel, the freight tariff and the pirates' take, the new pilot's wallet, chalk,
// and the raids and the ruins' guards. Moved out of src/config.js as they were (chat E1, 2026-10-04, the roadmap's refactoring
// piece: the economy part of the config in its own file); CONFIG holds each section under its old name (CONFIG.delivery is
// ECONOMY.delivery, the same object), so every reader is unchanged. What a ruin costs is in the sector catalogue (src/sectors.js),
// what a find costs in src/rewards.js, a ship in src/hangar.js; the quests' pays are CONFIG.quests (src/config.js).

export const ECONOMY = {
  // The delivery clock (SX, 2026-09-29: "грузы пока не имеют ценности", "Возможно
  // стоит добавить таймер для доставки груза"). A contract's par is `parBase` plus
  // the straight distance between its stations at `parPace`, rounded to
  // `parRound`. Delivered at or under `fastShare` of par it pays `fastBonus`
  // more, easing to the plain reward at par; every started `lateStep` over par
  // cuts `lateCut`, never below `floor`. Pay is rounded to `payRound`. The clock
  // is the pilot's own (Progress.clock, saved), so a lost cargo keeps
  // running while it lies in space. `base` is what a new job's reward is of the contract's own (src/contracts.js quoteJob).
  delivery: {
    // A bot flying straight at 600 u/s makes par with a little to spare; the full
    // bonus needs the red step (tools: see DECISIONS.md, 2026-09-29, E2).
    // SX, 2026-09-30: «Таймеры сейчас по доставке слишком плотные, надо оставить
    // челлендж, но не делать его таким жестким». Par was 8 s plus the distance at
    // 480 u/s, and every started 10 s late cut a tenth. Now 15 s plus the distance
    // at 340 u/s (about 45 % more time on a long run), times the cargo's own `par`
    // (CONFIG.cargo.sizes: a large one is slower to tow), and a tenth is cut every
    // started 15 s. The bonus for a fast run stays as it was: that is the challenge.
    // Then the economy SX chose (2026-10-04: «по экономике согласен»; Codex's study, proposal.json `delivery`): par 25 s plus
    // the distance at 300 u/s (it was 15 and 340: room for a rock family, a manoeuvre and a small mistake), a twentieth cut
    // every started 15 s to three quarters (a tenth, to half), and every new job's reward 1.35 times the contract's, to 5 CR
    // (`base`: the authored, the runs and other pilots' lost cargo alike; an accepted job keeps the reward and the terms it
    // was quoted, src/contracts.js). The fast bonus as it was.
    // `parPace` three quarters of the 300 it was when the world went from twice the layout to one and a half times it and the top speeds
    // to two thirds (chat W2, 2026-10-04): a route takes the seconds it took, so its par does. Then 0.85 of 225 with the tops (SX,
    // 2026-10-05: «скорость полета слишком высокая»; src/chassis.js): a route takes 1/0.85 of its seconds, and so does its par, so the
    // clock's bonus and cut come at the same share of the top as before. A job keeps the par it was quoted (src/contracts.js parTime).
    // Then 0.8 of 225 with the tops at 0.8 of W2's (SX, 2026-10-05: «скорость можно смело делать 800»): 191.25 until then. Then 0.9
    // of 225 with the tops at 0.9 (SX, 2026-10-06: «Скорость у корабля надо делать 900 все-таки»): 180 until then. Then 0.999 of 225
    // with the tops at 999 (SX, the same day: «Или 999 давай делать»): 202.5 until then.
    // `parShare`: every par a quarter shorter (SX, 2026-10-17: «таймеры по доставке грузов ... слишком длинные»; his pick of «Доставка на
    // 25 % короче»): 1:35 -> 1:10, 2:15 -> 1:40; the opening's first freight 3:00 -> 2:15 (src/contracts.js OPENING_TARGET).
    parBase: 25,          // s
    parPace: 224.775,     // u/s over the straight distance between the stations
    parShare: 0.75,
    parRound: 5,          // s
    fastShare: 0.6,
    fastBonus: 0.25,
    lateStep: 15,         // s
    lateCut: 0.05,
    floor: 0.75,
    payRound: 5,          // CR
    base: 1.35,
    // The freight rule (src/contracts.js freightReward): `fixed` CR plus `perU` CR a u of the straight way between the stations, times the
    // cargo's share and a contract's own. 30 + 9.2 a thousand u until the world grew twice as wide (chat SC, 2026-10-04); then SX: the pay
    // a u up so the money keeps pace with the longer ways (his answer 2: the first restoration near 20 minutes, the cautious novice
    // finishing; the pirates as dangerous). Measured with Codex's simulator (docs/decisions/2026-10.md, "SC: SX's answers"). Then the
    // world three quarters as wide with the ships two thirds as fast (chat W2, 2026-10-04): a route takes the seconds it took, so a u
    // pays 4/3 of 0.020 and a minute's flying pays what it did.
    fixed: 30,
    perU: 0.0267,
  },

  // Fuel (SX, 2026-09-29: "возможно стоит сделать систему горючего которое надо
  // пополнять"; FEATURE_PLAN.md section 11, E2). The engine burns it by output:
  // `burn` units a second at full forward thrust, `retroBurn` at full retro,
  // scaled by the spools, so a tap costs little and a long hold a lot. Turning,
  // coasting and the brake on SPACE are free, so braking stays as SX likes it.
  // An empty tank leaves `limp` of the engine's authority: slow, never stranded.
  // Any docked station sells it at `price` CR a unit. A respawn tops the tank up
  // to at least `respawnMin`. `low` is when the pilot is told.
  // SX, 2026-09-30, after flying it dry: «горючее слишком быстро заканчивается».
  // Burn went 2.5 times slower (2 and 1.2 to 0.8 and 0.5), and after the next
  // flight, «топливо все еще слишком быстро заканчивается», five times slower
  // again: a full tank is 625 s of full thrust, ten minutes with the key held
  // (it was 50 s, then 125 s). The ship keeps its speed only under thrust
  // (drag), so a pilot holds it most of a flight; ten minutes of that is a long
  // stretch of exploring, a pirate fight or two, and several deliveries before
  // the first refuel, and the canisters from rocks go five times further.
  // Placeholder economy.
  // Then, the same evening: «Сделай на 10% быстрее расход топлива»: 0.176 and
  // 0.11, a tank of 568 s (9:28) at full thrust. Then, after the next flights:
  // «Топливо вообще не успевает заканчиваться пока что». 125 s was too short and
  // 568 s never ran dry, so the tank now sits near their geometric middle: 0.42
  // and 0.26, 238 s (about four minutes) of full thrust. A rock family's 12.6
  // units are half a minute of thrust, so shooting rocks still helps without
  // replacing a station.
  fuel: {
    tank: 100,
    // SX, 2026-10-02: «у меня еще топливо стало заканчиваться часто», «Игра должна быть не душная, но и не совсем
    // простая». Measured (the garage chat's balance pass): a held key emptied the tank in 4.0 min (6.0 at 70 % of the
    // time, 8.6 at half), and since the rocks' fuel was cut (2026-10-01) they give back a fortieth of a tank, not an
    // eighth. STEADIER: 0.42 -> 0.30 (and retro 0.26 -> 0.185), the rocks as they are: 5.6 / 8.4 / 12.1 min, a refuel
    // every ten minutes of heavy flying a planned stop rather than a chore.
    burn: 0.30,           // units / s at full forward output
    retroBurn: 0.185,     // units / s at full retro output
    limp: 0.15,           // share of thrust and retro left on an empty tank
    // 2 since 2026-10-04 (the economy SX chose, proposal.json `fuel`; it was 1): a droid sells at 3, HOME at 0.5.
    price: 2,             // CR a unit
    low: 25,
    respawnMin: 40,
    // With the tank full a canister stays where it lies; flying through one
    // says TANK FULL, at most once in this many seconds.
    fullCue: 6,
  },

  // The v1 economy (ECONOMY_V1_HANDOFF.md, SX + Codex, accepted by SX 2026-09-30:
  // «в целом я согласен с твоей экономикой и про пиратов, и все остальное»).
  // What a ruin costs is in the sector catalogue (`cost`), what a find costs in
  // src/rewards.js, a ship in src/hangar.js.
  //   networkBonus  each restored station adds this share of the original freight
  //                 tariff to every delivery accepted after it: 1.0 with none, 2.6
  //                 with all eight (src/ruins.js networkMultiplier). Only freight.
  //   pirates       a pilot destroyed by pirates loses `share` of the wallet, whole
  //                 credits rounded down, never more than `cap` (it was every coin).
  // Since 2026-10-04 (proposal.json `delivery`): each station restored adds 0.15 of the tariff, to 2.2 with all eight (it was 0.2,
  // to 2.6), so the network rewards the work rather than paying past it; `networkMax` holds it there.
  // Since E1 LIGHT (SX, 2026-10-17: «по экономике давай пока Е1 возьмем»): 0.1 a station, to 1.8 (it was 0.15, to 2.2). Measured on the
  // sim's pilot that matches SX's friend's finished save: the tariff tripled a late hour's pay while every price stayed flat, and the
  // wallet ran to 21k at 100 min (docs/decisions/2026-10.md, "E1 LIGHT…"). A job keeps the tariff it was quoted (src/contracts.js).
  economy: {
    networkBonus: 0.1,
    networkMax: 1.8,
    pirates: { share: 0.2, cap: 250 },
  },

  // What a NEW pilot starts with: 150 CR, once, at the first start of a fresh save
  // (the page sets it; a World built by a check starts at 0). It is not a floor:
  // a wallet spent, robbed or invested stays as it is (SX, 2026-09-30: «Отрубай
  // страховку эту» - the 150 CR top-up at every load and respawn is switched off;
  // the economy is rebalanced in the next round).
  wallet: {
    // 150 until 2026-10-02 (SX: «явно не хватает денег. Проверь экономику и поправь ее в начале, чтобы денег было
    // побольше»): a first souvenir's 250 at once, with the 150 of working money kept. The measure (garage chat, its
    // economy pass): DECISIONS.md, 2026-10-02.
    start: 400,
  },

  // The first-dock support (codex/economy-2026-10-03/CLAUDE_HANDOFF.md section 6; src/starterSupport.js; chat N2 part 2, 2026-10-08): a
  // pilot with no station restored who has flown `after` s of their own clock (25 minutes; never the wall's) and finished `deliveries`
  // runs is offered one more; the next delivery after the offer builds the start ruin's construction by what its price still needs less
  // what the wallet holds above `keep` CR (the operating reserve), once the pirates on it are down and the pilot is at it. Never the wallet.
  support: { after: 1500, deliveries: 5, keep: 150 },

  // Chalk (SX, 2026-09-29: "мелки чтобы оставлять знаки"; FEATURE_PLAN.md section 11,
  // E3). Every sign left uses one piece. A new pilot starts with `start`; any docked
  // station sells up to `box` pieces at a time for `price` CR each, and a pilot
  // carries at most `max`.
  chalk: {
    start: 3,
    max: 20,
    box: 5,
    price: 5,             // CR a piece
  },

  // Raids and guards (SX, 2026-10-01, GARAGE_QUESTS_HANDOFF.md step 3: «Вокруг разрушенной станции есть пираты. Когда
  // ты ее там находишь, там группа пиратов, ты их расстреливаешь, начинаешь в нее вкладывать деньги, и она какое-то время
  // живет спокойно, но в моменте надо рассчитать по экономике и по срокам, чтобы не задалбывало через какое-то время
  // появляется информация, квест, что пираты окружили такую-то планету ... Если ты за пять минут успел, их разбить, то
  // типа все окей. Если не успел, то они воруют 50% от того, от денег, которых вложили в восстановление станции. Также
  // можно защищать обычные станции ... если за пять минут не успеешь, то их ломают на ... 25%»).
  // A ruin not yet restored is guarded by a squad of `guards` ships by its price (the dearer, the more; since 2026-10-08 always, funded
  // or not, and back `guardsEvery` s after it was beaten), and takes no money until they are down. Raids come one at a time on the pilot's clock (the quest economy,
  // reports/2026-10-02-quest-economy.md, src/pacing.js): none before the pilot has restored `restored` station, the
  // first `quiet` s after that restoration and never before `notBefore` s (SX, 2026-10-09: «как только мы начали квест по сбору станции, уже
  // должны быть сайт-квесты ... по рейдам»: the first money in a ruin opens the gate as a restoration does, and the first raid is then due
  // `begunQuiet` s after the look that saw it, and never before `notBefore` s), then `gap` s from one's end to the next one's
  // start (a table of [stations restored, least, most], straight between the rows: the handoff's «not to nag», the
  // raids thinning as the network grows), on a working station picked at random, a restored ruin `ruinWeight` times as likely as another, never one restored less than
  // `quiet` s ago, nor one within `clear` u of the ship (they would appear in view), nor a broken one. A raid gives
  // `time` s; late, a restored ruin is closed until `ruinShare` of its price repairs it (they took half of what went in)
  // and drawn at that share; another station until `stationShare` of `stationValue` does, drawn at 1 - that. A raid won
  // pays `thanks` CR (SX, 2026-10-02: 150), grown by the quests' `grow`.
  // SX, 2026-10-02: «Рейд пиратов вокруг станций должен содержать много пиратов, причем разные типы кораблей но все в одной
  // раскраске, если я зачистил станцию но улетел и долго не возвращался там они снова скапливаются». A raid's `squad` is
  // [ships, share] (2-4 until then), of every hull (src/pirates.js pickMixedTypes) in one paint, the ring they circle on
  // `spacing` u between ships at least (a zone's four took a 360 u gap round the hull). `regather`: a station the pilot drove
  // pirates off (a raid won) and has not been in the sector of for `after` s of his clock fills with a gathering again, `size`
  // ships (the first number, one more for each `grow` s away after that, to the second), a ruin's guards' kind of squad: no
  // clock, no loss, and the station no refuge while it stands.
  raids: {
    restored: 1, notBefore: 1200, begunQuiet: 300, gap: [[1, 1080, 1680], [8, 1500, 2400]], thanks: 350, quiet: 900, time: 300,
    // 6-9 ships since SX, 2026-10-20 («Рейды 5–8 → 6–9»), the shares as they were.
    squad: [[6, 0.3], [7, 0.3], [8, 0.25], [9, 0.15]], spacing: 620,
    regather: { after: 600, size: [3, 6], grow: 300 },
    ruinWeight: 1.5, clear: 2600,
    ruinShare: 0.5, stationValue: 2000, stationShare: 0.25,
    // The economy SX chose (2026-10-04, his answer 11B on economy-decisions.html: «много пиратов» kept, 5-8 a raid; Codex's
    // lost-raid bill and pause taken): a raid won pays `thanks` 350 (it was 150), the first raid waits `quiet` 900 s after the
    // first restoration (it was 720), and a raid lost closes the station until `loss.base` + its price / `loss.per`, at most
    // `loss.cap`, repairs it (a working station's price read as `loss.value`): 210 to 338 CR where it was half a ruin's
    // price (950 to 2,350) or 500 for a working station. `ruinShare` and `stationShare` now only say how much of the drawing
    // stands (and the quest plate's DAMAGE); `stationValue` is read by tools/quest-economy-sim.mjs's own copy of the old bill.
    loss: { base: 150, per: 25, cap: 200, value: 1500 },
    // [a ruin's price up to, ships] (SX, 2026-10-08, flying the game: «около разбитых станций нет пиратов даже в квестах, должно быть от
    // 4 до 8 всегда»): the cheapest ruin has 4 ships round it, the dearest 8, five steps between (the eight ruins' prices run from 1,900 to
    // 4,700; the start ruin, 1,900, has 4). It was [[2200, 2], [4400, 3], [Infinity, 4]], and the start ruin's own `startGuards.size` 3.
    // One more each since SX, 2026-10-20 («Стража руин 4–8 → 5–9»): 5 round the cheapest, 9 round the dearest.
    guards: [[2200, 5], [2800, 6], [3600, 7], [4400, 8], [Infinity, 9]],
    // How long a ruin's guards stay away once they are beaten whole (or run), on the pilot's clock, before they are round it again, until it is
    // restored (SX, 2026-10-06, of the start ruin: «раз в 15 минут респавнятся там, пока станцию не починят»; every ruin's since 2026-10-08).
    // A squad met in part and left is whole again once as long has passed since it was made. Money already in a ruin stays in; no more goes in
    // while they fly there (src/raids.js postHeld).
    guardsEvery: 900,
    checkEvery: 1,
  },
};
