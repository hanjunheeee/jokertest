/**
 * @file clock.js
 * @desc Clock adapter for deterministic GameEvent timestamps.
 */

const systemClock = Object.freeze({
  now: () => new Date().toISOString(),
});

/**
 * Creates a clock that always returns the same timestamp.
 * @param {string} isoTimestamp
 */
function createFixedClock(isoTimestamp = "2026-01-01T00:00:00.000Z") {
  return Object.freeze({
    now: () => isoTimestamp,
  });
}

/**
 * @param {{ now?: () => string }} [clock]
 */
function normalizeClock(clock) {
  if (clock && typeof clock.now === "function") return clock;
  return systemClock;
}

module.exports = {
  systemClock,
  createFixedClock,
  normalizeClock,
};
