/**
 * @file events.js
 * @desc Structured event creation helpers.
 *
 * Events are the bridge future UI/Socket layers can subscribe to. They carry a
 * stable type plus actor/target/visibility metadata instead of only text.
 */

const { normalizeClock } = require("./clock");
const { EVENT_VISIBILITY } = require("./types");

/**
 * Appends one GameEvent to a cloned GameState. This mutates only the state
 * object passed in by a resolver, never the caller's original state.
 * @param {Object} state
 * @param {string} type
 * @param {Object} [details]
 * @param {{ clock?: { now: () => string } }} [deps]
 * @returns {Object}
 */
function pushGameEvent(state, type, details = {}, deps = {}) {
  const clock = normalizeClock(deps.clock);
  if (!Array.isArray(state.events)) state.events = [];

  const event = {
    id: details.id ?? `${state.id}:event:${state.events.length + 1}`,
    gameId: state.id,
    type,
    phase: state.phase,
    day: state.dayIndex,
    createdAt: clock.now(),
    visibility: details.visibility ?? EVENT_VISIBILITY.PUBLIC,
  };

  if (details.actorId) event.actorId = details.actorId;
  if (details.targetId) event.targetId = details.targetId;
  if (details.message) event.message = details.message;
  if (details.payload) event.payload = { ...details.payload };

  state.events.push(event);
  return event;
}

module.exports = {
  pushGameEvent,
};
