import { CONFIG } from './config.js';
import { Music, reverbFor } from './music.js';
import { Breakcore, KEY, PIVOT_IN, AMBIENT_NAMES } from './breakcore.js';

// The conductor of the game's two pieces (SX, 2026-10-16: «придумай, как это будет работать вместе с фоновым ... когда начинается
// битва, я хочу, чтобы довольно быстро начинал играть активно брейк ... переход ... плавный ... когда битва закончилась, постепенно
// брейк затихает в обычный эмбиент»; S1 of labs/graphics/sketches/breakcore.html; «Вносим в игру брейк с дирижёром»).
//
// In peace the ambient plays (src/music.js). A fight: the breakcore (src/breakcore.js) comes in at once with an ARRIVE bar, the full
// drums about a bar and a half after the fight began, its pads on the chord that shares most with the ambient's last (PIVOT_IN);
// the ambient takes no new chord and fades under them (`fadeAmbient`), what it was sounding ringing out. The fight over and `calm`
// s gone with none: LEAVE and LINGER, and the ambient back on the partner of the breakcore's last chord (PIVOT_OUT), two bars before
// the end, its slow swell under their release. A fight on the way out brings the drums back at the next bar not yet scheduled.
// Both pieces send their wet share to one room, the ambient's seeded impulse under a soft lowpass (`roomTop`; SX: «реверберацию
// ... чуть поаккуратнее ... фильтр ... чтобы он чуть мягче просто звучал»): one convolver, the dearest node there is, not two.
//
// Sound.update calls `setFight` with whether a fight is on (a squad's or a raid's encounter, the boss awake) and `update` with the
// audio clock. Presentation only: it is told the one thing, it reads nothing else of the world.
export class Score {
  // `ctx` the AudioContext, `out` the music bus, `rng` a random source (seeded in checks), `reverb` the room's samples at the
  // context's rate (reverbFor(ctx.sampleRate) when not given).
  constructor(ctx, out, { rng = Math.random, reverb = null } = {}) {
    const C = CONFIG.sound.score;
    this.ctx = ctx;
    // The one room: the seeded impulse, under its lowpass. No convolver (an old browser, the checks' stand-in): dry only.
    this.room = null;
    if (ctx.createConvolver) {
      const verb = ctx.createConvolver();
      const data = reverb || reverbFor(ctx.sampleRate);
      const ir = ctx.createBuffer(2, data[0].length, ctx.sampleRate);
      for (let c = 0; c < 2; c++) ir.getChannelData(c).set(data[c]);
      verb.buffer = ir;
      const top = ctx.createBiquadFilter();
      top.type = 'lowpass';
      top.frequency.value = C.roomTop;
      top.Q.value = -3;
      verb.connect(top); top.connect(out);
      this.room = verb;
    }
    this.ambient = new Music(ctx, out, { rng, room: this.room });
    this.fight = new Breakcore(ctx, out, { rng, room: this.room });
    this.want = false;
    this.calmFor = 0;
    this.state = 'calm';            // calm, fight, falling
    this.last = null;
  }

  setFight(on) { this.want = !!on; }

  update(now) {
    const C = CONFIG.sound.score;
    const dt = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    if (this.want) {
      this.calmFor = 0;
      if (this.state !== 'fight') this.rise(now);
    } else if (this.state === 'fight' && (this.calmFor += dt) >= C.calm) this.fall();
    const h = this.fight.handoff;
    if (this.state === 'falling' && h && now + this.fight.lookahead >= h.at) {
      this.ambient.resume(h.at, h.chord);
      this.level(1, Math.max(now, h.at - 0.2), 0.05, now);
      this.fight.handoff = null;
      this.state = 'calm';
    }
    this.ambient.update(now);
    this.fight.update(now);
  }

  rise(now) {
    const pivot = PIVOT_IN[this.ambient.chord];
    if (this.state === 'calm') {
      this.ambient.pause();
      this.level(0, now, CONFIG.sound.score.fadeAmbient, now);
    }
    this.fight.engage(now, pivot);
    this.state = 'fight';
  }

  fall() {
    this.fight.release();
    this.state = 'falling';
  }

  // The ambient's level, dry and wet together (its share of the room is the room's), heading for `to` from `at`.
  level(to, at, tau, now) {
    for (const g of [this.ambient.dry, this.ambient.wet]) {
      if (!g) continue;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(to, at, tau);
    }
  }

  // What is sounding, in words (the lab's and the checks').
  get words() {
    return this.state === 'calm' && this.fight.mode === 'idle'
      ? `AMBIENT ${AMBIENT_NAMES[this.ambient.chord]}`
      : `${this.fight.section.toUpperCase()} ${KEY.chords[this.fight.chord].name}`;
  }
}
