/**
 * @file rng.js
 * @desc Seeded RNG adapter used by role assignment and night action tie-breaks.
 *
 * The core never calls Math.random() directly. Tests and future servers can
 * inject any object with next()/integer()/pick()/shuffle().
 */

function hashSeed(seed) {
  const text = String(seed ?? "joker-core-default-seed");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/**
 * Creates a deterministic random source from a seed.
 * @param {string|number} seed
 * @returns {{ next: () => number, integer: (maxExclusive: number) => number, pick: <T>(items: T[]) => T, shuffle: <T>(items: T[]) => T[] }}
 */
function createSeededRng(seed = "joker-core-default-seed") {
  let state = hashSeed(seed);

  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const integer = (maxExclusive) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("RNG integer maxExclusive must be a positive integer");
    }
    return Math.floor(next() * maxExclusive);
  };

  const pick = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Cannot pick from an empty list");
    }
    return items[integer(items.length)];
  };

  const shuffle = (items) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = integer(index + 1);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  };

  return { next, integer, pick, shuffle };
}

/**
 * Normalizes user-provided RNG input into the adapter shape expected by core.
 * @param {Object|string|number} [rng]
 */
function normalizeRng(rng) {
  if (rng && typeof rng.next === "function") {
    const next = rng.next.bind(rng);
    const integerFromNext = (maxExclusive) => {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error("RNG integer maxExclusive must be a positive integer");
      }
      return Math.floor(next() * maxExclusive);
    };
    const pickFromNext = (items) => {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Cannot pick from an empty list");
      }
      return items[integerFromNext(items.length)];
    };
    const shuffleFromNext = (items) => {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = integerFromNext(index + 1);
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
      }
      return copy;
    };

    return {
      next,
      integer:
        typeof rng.integer === "function"
          ? rng.integer.bind(rng)
          : integerFromNext,
      pick: typeof rng.pick === "function" ? rng.pick.bind(rng) : pickFromNext,
      shuffle:
        typeof rng.shuffle === "function" ? rng.shuffle.bind(rng) : shuffleFromNext,
    };
  }

  return createSeededRng(rng);
}

module.exports = {
  createSeededRng,
  normalizeRng,
};
