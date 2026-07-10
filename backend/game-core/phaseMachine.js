/**
 * @file phaseMachine.js
 * @desc Centralized phase transitions for DAY, TRIBUNAL, NIGHT, and ENDED.
 */

const { pushGameEvent } = require("./events");
const {
  cloneGameState,
  createEmptyDayVotes,
  createEmptyNightActions,
  createEmptyTribunal,
} = require("./gameState");
const { GAME_EVENT_TYPES, GAME_PHASES } = require("./types");

/**
 * Moves from day voting into the tribunal phase with one candidate.
 * @param {Object} state
 * @param {string} candidateId
 * @param {Object} [deps]
 */
function enterTribunal(state, candidateId, deps = {}) {
  const next = cloneGameState(state);
  next.phase = GAME_PHASES.TRIBUNAL;
  next.tribunal = createEmptyTribunal(candidateId);

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.PHASE_CHANGED,
    {
      message: "단두대의 심판 단계로 전환되었습니다.",
      targetId: candidateId,
      payload: { phase: GAME_PHASES.TRIBUNAL },
    },
    deps,
  );
  pushGameEvent(
    next,
    GAME_EVENT_TYPES.TRIBUNAL_STARTED,
    {
      message: "낮 투표 최다 득표자가 처형 후보가 되었습니다.",
      targetId: candidateId,
    },
    deps,
  );

  return next;
}

/**
 * Moves into night and resets night-action submissions for the new night.
 * @param {Object} state
 * @param {Object} [deps]
 */
function enterNight(state, deps = {}) {
  const next = cloneGameState(state);
  next.phase = GAME_PHASES.NIGHT;
  next.nightActions = createEmptyNightActions();

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.PHASE_CHANGED,
    {
      message: "피의 장막 단계로 전환되었습니다.",
      payload: { phase: GAME_PHASES.NIGHT },
    },
    deps,
  );

  return next;
}

/**
 * Starts the next day after night resolution. Vote and tribunal state are reset
 * here so phase cleanup is not scattered across night-action resolvers.
 * @param {Object} state
 * @param {Object} [deps]
 */
function enterNextDay(state, deps = {}) {
  const next = cloneGameState(state);
  next.phase = GAME_PHASES.DAY;
  next.dayIndex += 1;
  next.dayVotes = createEmptyDayVotes();
  next.tribunal = createEmptyTribunal();
  next.nightActions = createEmptyNightActions();

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.PHASE_CHANGED,
    {
      message: "거짓된 왈츠 단계로 전환되었습니다.",
      payload: { phase: GAME_PHASES.DAY, dayIndex: next.dayIndex },
    },
    deps,
  );

  return next;
}

module.exports = {
  enterTribunal,
  enterNight,
  enterNextDay,
};
