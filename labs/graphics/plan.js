// A load plan: named steps, run a little at a time, with progress that is the share
// of the work actually done (never a timer).
//
// A step's `run(step)` may be
//   - plain: does its work and returns;
//   - async: returns a promise (a fetch); the plan waits for it, and goes on to
//     nothing else until it settles;
//   - a generator function: each `yield` hands control back, so one step can be
//     spread over as many frames as it needs (the plan resumes it on the next pump).
// While it runs a step may set `step.label` (the status line) and `step.fraction`
// (0 to 1, how far through it is). A step that throws is recorded in `failures` and
// skipped: a missing file or a failed warm-up costs its own work, never the game.
//
// `pump(budgetMs)` does work for about that long and returns; the caller pumps once a
// frame. Each step records when it started and finished and how long its own code ran
// (`work`, ms), so the load can be measured. Pure: the only outside things are the
// clock (`now`) and `console.warn`.

export function createPlan({ now = () => performance.now(), warn = (...a) => console.warn(...a) } = {}) {
  const steps = [];
  let index = 0;              // the step being run
  let iterator = null;        // its generator, if it is one
  let pending = null;         // its promise, if it is async
  const failures = [];

  const finish = (step, error) => {
    if (error) { failures.push({ id: step.id, error }); warn(`load step "${step.id}" failed:`, error); }
    step.done = true;
    step.fraction = 1;
    step.finishedAt = now();
    iterator = null;
    pending = null;
    index++;
  };

  const plan = {
    steps,
    failures,
    // `weight` is the step's share of the bar; give it about the time it takes.
    add({ id, label = id.toUpperCase(), weight = 1, run }) {
      steps.push({ id, label, weight, run, done: false, started: false, fraction: 0, startedAt: null, finishedAt: null, work: 0 });
      return plan;
    },
    get done() { return index >= steps.length; },
    get current() { return steps[index] || null; },
    get label() { return (steps[index] || steps.at(-1))?.label ?? ''; },
    // 0 to 1: finished steps count in full, the running one by its own fraction.
    get progress() {
      let total = 0, got = 0;
      for (const s of steps) {
        total += s.weight;
        got += s.weight * (s.done ? 1 : Math.max(0, Math.min(1, s.fraction || 0)));
      }
      return total ? got / total : 1;
    },
    pump(budgetMs = 6) {
      const start = now();
      while (index < steps.length && !pending) {
        const step = steps[index];
        const t0 = now();
        try {
          if (!step.started) {
            step.started = true;
            step.startedAt = t0;
            const out = step.run(step);
            if (out && typeof out.next === 'function') iterator = out;
            else if (out && typeof out.then === 'function') {
              pending = out.then(() => finish(step), (error) => finish(step, error));
              step.work += now() - t0;
              return;
            } else { step.work += now() - t0; finish(step); if (now() - start >= budgetMs) return; continue; }
          }
          if (iterator) {
            const r = iterator.next();
            if (r.done) finish(step);
            else if (typeof r.value === 'number') step.fraction = r.value;
          }
        } catch (error) {
          finish(step, error);
        }
        step.work += now() - t0;
        if (now() - start >= budgetMs) return;
      }
    },
  };
  return plan;
}
