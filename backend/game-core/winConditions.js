/**
 * @file winConditions.js
 * @desc Citizen/Joker win-condition checks.
 */

const { pushGameEvent } = require("./events");
const {
  cloneGameState,
  getAliveCitizens,
  getAliveJokers,
} = require("./gameState");
const {
  GAME_EVENT_TYPES,
  GAME_PHASES,
  TEAMS,
  WIN_REASONS,
} = require("./types");

/**
 * Checks the current board without mutating state.
 * @param {Object} state
 * @returns {{ winner: string, reason: string } | null}
 */
function checkWinCondition(state) {
  const aliveJokers = getAliveJokers(state).length;
  const aliveCitizens = getAliveCitizens(state).length;

  if (aliveJokers === 0) {
    return {
      winner: TEAMS.CITIZEN,
      reason: WIN_REASONS.ALL_JOKERS_ELIMINATED,
    };
  }

  // Parity immediately ends Mafia-style games because citizens can no longer
  // outvote the Joker team in later public decisions.
  if (aliveJokers >= aliveCitizens) {
    return {
      winner: TEAMS.JOKER,
      reason: WIN_REASONS.JOKERS_REACHED_PARITY,
    };
  }

  return null;
}

/**
 * Applies a win result if one exists. It is called only after major rule
 * resolution points so ordinary vote submissions do not prematurely end turns.
 * @param {Object} state
 * @param {Object} [deps]
 */
function applyWinCondition(state, deps = {}) {
  const next = cloneGameState(state);
  if (next.winResult) return next;

  const winResult = checkWinCondition(next);
  if (!winResult) return next;

  next.phase = GAME_PHASES.ENDED;
  next.winResult = winResult;

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.WIN_DECLARED,
    {
      message: `${winResult.winner} 진영이 승리했습니다.`,
      payload: winResult,
    },
    deps,
  );

  return next;
}

module.exports = {
  checkWinCondition,
  applyWinCondition,
};
