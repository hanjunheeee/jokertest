/**
 * @file voting.js
 * @desc Day vote submission and resolution.
 */

const { pushGameEvent } = require("./events");
const {
  assertPhase,
  cloneGameState,
  getAliveConnectedPlayers,
  requireAliveConnectedPlayer,
} = require("./gameState");
const { enterNight, enterTribunal } = require("./phaseMachine");
const { applyWinCondition } = require("./winConditions");
const { GAME_EVENT_TYPES, GAME_PHASES } = require("./types");

function countVotes(state) {
  const validTargets = new Set(
    getAliveConnectedPlayers(state).map((player) => player.id),
  );
  const counts = new Map();

  Object.entries(state.dayVotes.votesByVoter).forEach(([voterId, targetId]) => {
    const voter = state.players.find((player) => player.id === voterId);
    if (!voter?.alive || !voter.connected || !validTargets.has(targetId)) return;
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  });

  return counts;
}

/**
 * Casts or replaces one day vote.
 * @param {Object} state
 * @param {string} voterId
 * @param {string} targetId
 * @param {Object} [deps]
 */
function castDayVote(state, voterId, targetId, deps = {}) {
  assertPhase(state, GAME_PHASES.DAY);
  requireAliveConnectedPlayer(state, voterId);
  requireAliveConnectedPlayer(state, targetId);

  if (!state.config.allowSelfDayVote && voterId === targetId) {
    throw new Error("Self day vote is disabled by config");
  }

  const next = cloneGameState(state);
  next.dayVotes.votesByVoter[voterId] = targetId;

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.DAY_VOTE_CAST,
    {
      actorId: voterId,
      targetId,
      message: "낮 투표가 기록되었습니다.",
    },
    deps,
  );

  return next;
}

/**
 * Resolves day voting. A single top target enters tribunal; tied top targets
 * intentionally break the guillotine and move directly to night with no death.
 * @param {Object} state
 * @param {Object} [deps]
 */
function resolveDayVote(state, deps = {}) {
  assertPhase(state, GAME_PHASES.DAY);
  const next = cloneGameState(state);
  const counts = countVotes(next);
  next.dayVotes.resolved = true;

  if (counts.size === 0) {
    pushGameEvent(
      next,
      GAME_EVENT_TYPES.DAY_VOTE_NO_CANDIDATE,
      {
        message: "낮 투표 후보가 없어 밤으로 넘어갑니다.",
      },
      deps,
    );
    return applyWinCondition(enterNight(next, deps), deps);
  }

  const highestCount = Math.max(...counts.values());
  const topCandidates = [...counts.entries()]
    .filter(([, count]) => count === highestCount)
    .map(([candidateId]) => candidateId);

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.DAY_VOTE_RESOLVED,
    {
      message: "낮 투표가 집계되었습니다.",
      payload: {
        voteCounts: Object.fromEntries(counts),
        topCandidates,
      },
    },
    deps,
  );

  if (topCandidates.length > 1) {
    pushGameEvent(
      next,
      GAME_EVENT_TYPES.GUILLOTINE_BROKEN,
      {
        message: "단두대 고장: 최다 득표자가 동점이므로 아무도 처형되지 않습니다.",
        payload: { topCandidates, highestCount },
      },
      deps,
    );
    return applyWinCondition(enterNight(next, deps), deps);
  }

  next.dayVotes.candidateId = topCandidates[0];
  return enterTribunal(next, topCandidates[0], deps);
}

module.exports = {
  castDayVote,
  resolveDayVote,
};
