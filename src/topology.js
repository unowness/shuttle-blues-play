import { wrapCentered, wrapTo } from './util.js';

// How the coordinate space behaves at its edges.
//
// Two topologies exist on purpose. WRAP is the original toroidal arena, kept
// for duels and the development sandbox, where a closed field is the point.
// PLANE is the exploration topology: a bounded rectangle whose edges lead to
// neighbouring sectors on a grid.
//
// Everything that measures distance, proximity or screen placement calls
// delta(), so swapping the topology changes gravity, collision, pickup range,
// culling and the camera together instead of only position wrapping.

export const WRAP = 'wrap';
export const PLANE = 'plane';

class WrapTopology {
  constructor(width, height) {
    this.mode = WRAP;
    this.width = width;
    this.height = height;
  }

  // Shortest offset the short way around the torus.
  delta(ax, ay, bx, by) {
    return { x: wrapCentered(ax - bx, this.width), y: wrapCentered(ay - by, this.height) };
  }

  // The two axes of delta(), a number each and nothing made (see PlaneTopology.dx).
  dx(ax, bx) { return wrapCentered(ax - bx, this.width); }
  dy(ay, by) { return wrapCentered(ay - by, this.height); }

  // A torus has no outside, so a position is always brought back inside.
  contain(x, y) {
    return { x: wrapTo(x, this.width), y: wrapTo(y, this.height), exit: null };
  }

  // Nothing ever leaves.
  isOutside() { return false; }
}

class PlaneTopology {
  constructor(width, height) {
    this.mode = PLANE;
    this.width = width;
    this.height = height;
  }

  // Ordinary Euclidean offset. Objects in other sectors are not present, so
  // there is nothing to measure the short way around.
  delta(ax, ay, bx, by) {
    return { x: ax - bx, y: ay - by };
  }

  // The two axes of delta(), a number each and nothing made: a loop over every rock, pirate or step of a path asked for an {x, y}
  // for each and V8 did not always inline the call away (the step's contacts, the pirates' dodging, the warning ahead, the course:
  // tens of KB of garbage a frame, 2026-10-09). `dx(ax, bx)` is `delta(ax, ay, bx, by).x`, `dy(ay, by)` its `.y`, to the last bit.
  dx(ax, bx) { return ax - bx; }
  dy(ay, by) { return ay - by; }

  // Reports which edges a position has passed without deciding what happens
  // next; that is the world's business, because it depends on whether a
  // neighbouring sector exists.
  contain(x, y) {
    const ex = x < 0 ? -1 : x >= this.width ? 1 : 0;
    const ey = y < 0 ? -1 : y >= this.height ? 1 : 0;
    return { x, y, exit: ex || ey ? { ex, ey } : null };
  }

  isOutside(x, y) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height;
  }
}

export function makeTopology(mode, width, height) {
  return mode === WRAP
    ? new WrapTopology(width, height)
    : new PlaneTopology(width, height);
}
