import { CONFIG } from './config.js';
import { clamp, TAU, easeOutQuad } from './util.js';
import { resolveChassis, DEFAULT_CHASSIS, dangerSpeedOf, thrustShare, bodyRadius } from './chassis.js';

export class Ship {
  constructor(model, chassisId = DEFAULT_CHASSIS) {
    this.chassis = resolveChassis(chassisId);
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.angle = -Math.PI / 2;   // screen coords: -PI/2 points up
    this.angVel = 0;
    this.thrusting = false;
    this.retroing = false;
    this.cooldown = 0;
    this.alive = true;
    this.respawnIn = 0;
    this.invuln = CONFIG.ship.invulnTime;
    // 1 right after touching a planet's orbit, easing to 0 (World.stepOrbits).
    this.jolt = 0;
    // Engine spool, 0..1, forward and retro (src/chassis.js). Physics state,
    // not presentation: src/helm.js reads both for the lab's THR/RET gauge
    // but never writes them.
    this.spool = 0;
    this.retroSpool = 0;
    // Share of engine authority the fuel allows: 1, or CONFIG.fuel.limp on an
    // empty tank. The world sets it (World.step); nothing here burns fuel.
    this.limp = 1;
    // The towed cargo's share of the top speed (CONFIG.cargo.sizes `top`): 1 with
    // nothing in tow; the world sets it (World.step). Its mass pulls on the hull
    // through the tether (src/tow.js), not through this.
    this.loadTop = 1;
    // The gravity on the hull this step, u/s^2 (src/shipStep.js sets it): the push's curve keeps enough to climb out (thrustShare).
    this.pull = 0;
    // The speed the engine's forward push gave this step (u/s, along the nose, before the drag; 0 off the throttle): the drift's glide
    // keeps its gain under what flying straight would gain with it (src/drift.js stepGlide).
    this.push = 0;
    // Seconds before a black hole can take the ship again after throwing it out.
    this.holeGrace = 0;
    this.turnInput = 0;
    this.braking = false;
    this.flamePhase = 0;
    this.animating = false;
    this.wasAnimating = false;
    this.animCursor = 0;
    this.frameTimer = 0;
    this.setModel(model);
  }

  setChassis(chassisId) {
    this.chassis = resolveChassis(chassisId);
  }

  setModel(model) {
    this.model = model;
    this.metrics = null;
    this.animCursor = 0;
    this.frameTimer = 0;
    this.wasAnimating = false;
  }

  // Frame 0 (or whichever the file marks active) is the idle pose. The rest
  // are an exhaust loop that runs while a direction key is held.
  get frameCells() {
    const m = this.model;
    if (!m.frames || m.frames.length < 2) return m.cells;
    if (!this.animating) return m.frames[m.idleFrame];
    return m.frames[m.loop[this.animCursor % m.loop.length]];
  }

  stepAnimation(dt) {
    const m = this.model;
    if (!m.frames || m.frames.length < 2) return;
    if (!this.animating) {
      this.frameTimer = 0;
      this.animCursor = 0;
      return;
    }
    if (!this.wasAnimating) { this.animCursor = 0; this.frameTimer = 0; return; }
    const spf = 1 / m.fps;
    this.frameTimer += dt;
    while (this.frameTimer >= spf) {
      this.frameTimer -= spf;
      this.animCursor = (this.animCursor + 1) % m.loop.length;
    }
  }

  // Drawing metrics only. Cell size comes from the renderer's measured font, so
  // everything produced here is presentation. Collision size and weapon reach
  // deliberately do not appear: they come from the chassis, in world units.
  measureDrawing(cellW, cellH) {
    const s = this.model.scale;
    this.metrics = { w: cellW * s, h: cellH * s };
    return this.metrics;
  }

  // The hull's body: the chassis's, or the one its table gives the drawing worn (src/chassis.js LOOK_BODIES: the STANDARD in a look of
  // its own, MODERN or SCOOTY JR.). Every reader of the ship's size asks here, so the worn look's body is the one that meets.
  get radius() { return bodyRadius(this.chassis, this.model?.id); }
  // What the drawing worn adds to the chassis's body, u (0 for SX's ship and every hull without a row): the cargo's reach follows it.
  get bodyExtra() { return this.radius - this.chassis.colliderRadius; }

  // How far the drawing reaches behind the pivot, in pixels. Presentation
  // only: things attached to the tail are drawn from here, but nothing that
  // decides play may read it, because it changes with the artwork.
  drawnRear() {
    const m = this.metrics || { h: 14 };
    let rear = 0;
    for (const c of this.frameCells) if (c.y > rear) rear = c.y;
    return (rear + 0.5) * m.h;
  }
  // How far the drawing reaches to either side of the pivot, in pixels (presentation only, as drawnRear: the suitcase is clamped there).
  drawnSide() {
    const m = this.metrics || { w: 9 };
    let side = 0;
    for (const c of this.frameCells) if (Math.abs(c.x) > side) side = Math.abs(c.x);
    return (side + 0.5) * m.w;
  }
  // Rotation that maps model space (art points up) onto the heading.
  get facing() { return this.angle + Math.PI / 2 + this.model.baseRotation; }

  // The chassis itself: no allocation per step, and no path by which a model
  // file reaches these numbers.
  params() {
    return this.chassis;
  }

  step(dt, input) {
    const P = this.params();
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.push = 0;

    if (!this.alive) {
      this.respawnIn -= dt;
      this.thrusting = false;
      this.animating = false;
      this.wasAnimating = false;
      this.spool = 0;
      this.retroSpool = 0;
      return;
    }

    // What the pilot asks of the ship this step, for its drawing only (the lab's
    // thrusters and cockpit glass, labs/graphics/ship-motion.js): nothing in the
    // flight reads these.
    this.turnInput = input.turn;
    this.braking = !!input.damp;

    // W, A, S or D all drive the exhaust animation.
    this.wasAnimating = this.animating;
    this.animating = input.thrust || input.retro || input.turn !== 0;
    this.stepAnimation(dt);

    // A jolted hull answers weakly: turn and thrust authority drop toward the
    // chassis grips and come back as `jolt` fades. At jolt 0 both factors are
    // exactly 1, so ordinary flight is unchanged bit for bit.
    const j = Math.min(1, this.jolt);
    const turnGrip = j > 0 ? 1 - (1 - P.joltTurnGrip) * j : 1;
    const thrustGrip = j > 0 ? 1 - (1 - P.joltThrustGrip) * j : 1;

    // Turning eases into its rate instead of snapping, so A/D taps read as
    // nudges rather than teleports.
    const wanted = input.turn * P.turnRate;
    this.angVel += (wanted - this.angVel) * clamp(P.turnAccel * turnGrip * dt, 0, 1);
    this.angle += this.angVel * dt;
    if (this.angle > Math.PI) this.angle -= TAU;
    if (this.angle < -Math.PI) this.angle += TAU;

    const ux = Math.cos(this.angle), uy = Math.sin(this.angle);
    this.thrusting = input.thrust;
    this.retroing = input.retro && !input.thrust;

    // Engine spool: snaps to spoolFloor the instant thrust starts (so a tap
    // is never dead), then climbs at 1/spoolUpTime while held and falls at
    // 1/spoolDownTime once released (src/chassis.js has the exact floor-to-1
    // and 1-to-0 times). Retro spools the same way on its own numbers. The
    // dampers do not spool; SX likes braking as it is.
    if (this.thrusting) {
      if (this.spool < P.spoolFloor) this.spool = P.spoolFloor;
      this.spool = Math.min(1, this.spool + dt / P.spoolUpTime);
    } else {
      this.spool = Math.max(0, this.spool - dt / P.spoolDownTime);
    }
    if (this.retroing) {
      if (this.retroSpool < P.retroSpoolFloor) this.retroSpool = P.retroSpoolFloor;
      this.retroSpool = Math.min(1, this.retroSpool + dt / P.retroSpoolUpTime);
    } else {
      this.retroSpool = Math.max(0, this.retroSpool - dt / P.spoolDownTime);
    }

    if (this.thrusting) {
      // Past dangerSpeed, forward authority tapers toward dangerThrustFloor:
      // reaching true top speed takes a deliberate, sustained push, not a
      // single accidental moment of holding W. On an ease-out (SX, 2026-10-07:
      // «я бы максимальную скорость еще подольше брал»; src/chassis.js thrustShare):
      // quick as the red begins, slow into the floor, so the top comes late.
      const speed = Math.hypot(this.vx, this.vy);
      const top = P.maxSpeed * this.loadTop;
      const dangerSpeed = dangerSpeedOf(top, P);
      // The push grows with the speed (src/chassis.js thrustShare: SX, 2026-10-07), against the hull's own top, not the cargo's. An
      // empty tank's limp keeps the even push it had: a limping hull is gentle already, and must still crawl to a pump.
      let authority = this.spool * this.limp * (this.limp < 1 ? 1 : thrustShare(speed, P.maxSpeed, this.pull / P.thrust));
      if (speed > dangerSpeed) {
        const taper = easeOutQuad(Math.min(1, (speed - dangerSpeed) / (top - dangerSpeed)));
        authority *= 1 - (1 - P.dangerThrustFloor) * taper;
      }
      this.push = P.thrust * authority * thrustGrip * dt;
      this.vx += ux * P.thrust * authority * thrustGrip * dt;
      this.vy += uy * P.thrust * authority * thrustGrip * dt;
    }
    if (this.retroing) {
      // Tail first the retro pushes no faster than the hull's reverse top (src/chassis.js reverseShare): its push this step at most what
      // is left below it; a hull already flying tail first faster (turned round at speed) keeps what it has.
      const back = -(this.vx * ux + this.vy * uy), reverseTop = P.maxSpeed * P.reverseShare;
      const retro = Math.min(P.retro * this.retroSpool * this.limp * thrustGrip * dt, Math.max(0, reverseTop - back));
      this.vx -= ux * retro; this.vy -= uy * retro;
    }

    const drag = input.damp ? P.damperDrag : P.drag;
    const k = Math.max(0, 1 - drag * dt);
    this.vx *= k; this.vy *= k;

    const f = this.topShare(Math.hypot(this.vx, this.vy), dt);
    if (f < 1) { this.vx *= f; this.vy *= f; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.flamePhase += dt * 34;
  }

  // The share of a speed `sp` the tops let through at a step's end, 1 under both: past the hull's top a wall; past a cargo's lower top
  // a pull, not a wall, the hull slowing over a second or so, so taking on a large cargo at speed is felt as a pull, never as a jolt.
  // The drift's glide asks it too, for the speed flying straight would keep (src/drift.js stepGlide).
  topShare(sp, dt) {
    const P = this.params(), top = P.maxSpeed * this.loadTop;
    if (sp > P.maxSpeed) return P.maxSpeed / sp;
    if (sp > top) return Math.max(top / sp, 1 - 1.5 * dt);
    return 1;
  }

  // Flown by the way in (src/approach.js) in place of `step`: put where its pose says, nose and all, the burns the pose's
  // push asks drawn and heard (the spools follow them as the pilot's would), the turn read as the stick's for the drawing.
  flyTo(dt, pose) {
    const P = this.params();
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.x = pose.x; this.y = pose.y;
    this.vx = pose.vx; this.vy = pose.vy;
    this.angle = Math.atan2(Math.sin(pose.angle), Math.cos(pose.angle));
    this.angVel = pose.angVel;
    this.turnInput = clamp(pose.angVel / P.turnRate, -1, 1);
    this.braking = false;
    this.thrusting = pose.thrust;
    this.retroing = pose.retro && !pose.thrust;
    const follow = clamp(dt * 8, 0, 1);
    this.spool += ((this.thrusting ? pose.spool : 0) - this.spool) * follow;
    this.retroSpool += ((this.retroing ? pose.retroSpool : 0) - this.retroSpool) * follow;
    this.wasAnimating = this.animating;
    this.animating = this.thrusting || this.retroing || Math.abs(this.turnInput) > 0.05;
    this.stepAnimation(dt);
    this.flamePhase += dt * 34;
  }

  // A hull with no gun (src/chassis.js `can`: SCOOTY JR.) never fires: no shot, no sound.
  wantsToFire(input) {
    return this.alive && input.fire && this.cooldown <= 0 && this.params().can?.fire !== false;
  }

  fire() {
    const P = this.params();
    this.cooldown = P.fireInterval;
    const ux = Math.cos(this.angle), uy = Math.sin(this.angle);
    return {
      x: this.x + ux * P.muzzleOffset,
      y: this.y + uy * P.muzzleOffset,
      vx: this.vx + ux * P.muzzleSpeed,
      vy: this.vy + uy * P.muzzleSpeed,
      life: CONFIG.bullet.life,
      // What a hit costs a pirate, for a chassis with a stronger gun (src/chassis.js `gun`); the standard's says nothing.
      ...(P.gun ? { damage: P.gun } : null),
    };
  }

  // Glyph list for the debris burst.
  debris() {
    const m = this.metrics || { w: 8, h: 14 };
    const a = this.facing, ca = Math.cos(a), sa = Math.sin(a);
    return this.frameCells.map((c) => {
      const lx = c.x * m.w, ly = c.y * m.h;
      return { dx: lx * ca - ly * sa, dy: lx * sa + ly * ca, ch: c.ch, color: c.color, size: this.model.scale };
    });
  }

  draw(r, sx, sy) {
    if (!this.alive) return;
    const m = this.metrics || this.measureDrawing(r.cellW, r.cellH);
    const a = this.facing;
    const ca = Math.cos(a), sa = Math.sin(a);
    const blink = this.invuln > 0 && (Math.floor(this.invuln * 12) & 1) === 0;
    const alpha = blink ? 0.32 : 1;

    if (this.thrusting && this.model.flame) {
      const flicker = 0.55 + 0.45 * Math.sin(this.flamePhase);
      const pal = CONFIG.ship.colors.flame;
      this.model.flame.forEach((c, i) => {
        const lx = c.x * m.w, ly = (c.y + (i % 2) * 0.12) * m.h;
        r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, a,
          pal[(i + Math.floor(this.flamePhase * 0.5)) % pal.length], alpha * flicker, this.model.scale);
      });
    }

    for (const c of this.frameCells) {
      const lx = c.x * m.w, ly = c.y * m.h;
      r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, a, c.color, alpha, this.model.scale);
    }
  }
}
