/**
 * @file disconnects.js
 * @desc Player disconnect handling.
 */

const { pushGameEvent } = require("./events");
const {
  assertGameActive,
  cloneGameState,
  killPlayer,
  requirePlayer,
  updatePlayer,
} = require("./gameState");
const { applyWinCondition } = require("./winConditions");
const {
  DEATH_REASONS,
  GAME_EVENT_TYPES,
  NIGHT_ACTION_TYPES,
} = require("./types");

function removeVotesAndTargetsForPlayer(state, playerId) {
  delete state.dayVotes.votesByVoter[playerId];
  Object.entries(state.dayVotes.votesByVoter).forEach(([voterId, targetId]) => {
    if (targetId === playerId) delete state.dayVotes.votesByVoter[voterId];
  });

  delete state.tribunal.votesByVoter[playerId];

  delete state.nightActions.actionsByActor[playerId];
  Object.entries(state.nightActions.actionsByActor).forEach(([actorId, action]) => {
    if (action.targetId === playerId) {
      state.nightActions.actionsByActor[actorId] = {
        type: NIGHT_ACTION_TYPES.SKIP,
        actorId,
      };
    }
  });
}

/**
 * Marks a disconnecting player as dead and immediately rechecks win state. Any
 * pending vote/action involving that player is cleared or converted to SKIP so
 * later resolvers do not target an invalid participant.
 * @param {Object} state
 * @param {string} playerId
 * @param {Object} [deps]
 */
function handlePlayerDisconnect(state, playerId, deps = {}) {
  assertGameActive(state);
  requirePlayer(state, playerId);

  const next = cloneGameState(state);
  updatePlayer(next, playerId, { connected: false });
  killPlayer(next, playerId, DEATH_REASONS.DISCONNECTED);
  removeVotesAndTargetsForPlayer(next, playerId);

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.PLAYER_DISCONNECTED,
    {
      targetId: playerId,
      message: "돌연사: 플레이어가 폭풍우에 휩쓸려 사망했습니다.",
    },
    deps,
  );

  return applyWinCondition(next, deps);
}

module.exports = {
  handlePlayerDisconnect,
};
