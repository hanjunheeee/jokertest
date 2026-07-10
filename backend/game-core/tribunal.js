/**
 * @file tribunal.js
 * @desc Tribunal approve/reject vote logic.
 */

const { pushGameEvent } = require("./events");
const {
  assertPhase,
  cloneGameState,
  getAliveConnectedPlayers,
  killPlayer,
  requireAliveConnectedPlayer,
  requirePlayer,
} = require("./gameState");
const { enterNight } = require("./phaseMachine");
const { applyWinCondition } = require("./winConditions");
const {
  DEATH_REASONS,
  GAME_EVENT_TYPES,
  GAME_PHASES,
  TRIBUNAL_VOTES,
} = require("./types");

/**
 * Records one tribunal approve/reject vote.
 * @param {Object} state
 * @param {string} voterId
 * @param {"APPROVE"|"REJECT"} vote
 * @param {Object} [deps]
 */
function castTribunalVote(state, voterId, vote, deps = {}) {
  assertPhase(state, GAME_PHASES.TRIBUNAL);
  requireAliveConnectedPlayer(state, voterId);

  if (!Object.values(TRIBUNAL_VOTES).includes(vote)) {
    throw new Error(`Unsupported tribunal vote: ${vote}`);
  }

  if (
    !state.config.allowTribunalCandidateVote &&
    state.tribunal.candidateId === voterId
  ) {
    throw new Error("Tribunal candidate vote is disabled by config");
  }

  const next = cloneGameState(state);
  next.tribunal.votesByVoter[voterId] = vote;

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.TRIBUNAL_VOTE_CAST,
    {
      actorId: voterId,
      targetId: state.tribunal.candidateId,
      message: "단두대 찬반 투표가 기록되었습니다.",
      payload: { vote },
    },
    deps,
  );

  return next;
}

function countTribunalVotes(state) {
  const aliveVoters = new Set(
    getAliveConnectedPlayers(state)
      .filter(
        (player) =>
          state.config.allowTribunalCandidateVote ||
          player.id !== state.tribunal.candidateId,
      )
      .map((player) => player.id),
  );

  return Object.entries(state.tribunal.votesByVoter).reduce(
    (acc, [voterId, vote]) => {
      if (!aliveVoters.has(voterId)) return acc;
      if (vote === TRIBUNAL_VOTES.APPROVE) acc.approve += 1;
      if (vote === TRIBUNAL_VOTES.REJECT) acc.reject += 1;
      return acc;
    },
    { approve: 0, reject: 0 },
  );
}

/**
 * Resolves the tribunal. Execution happens only when approve is strictly
 * greater than reject; ties are intentionally non-executions.
 * @param {Object} state
 * @param {Object} [deps]
 */
function resolveTribunalVote(state, deps = {}) {
  assertPhase(state, GAME_PHASES.TRIBUNAL);
  const candidateId = state.tribunal.candidateId;
  requirePlayer(state, candidateId);

  const next = cloneGameState(state);
  const counts = countTribunalVotes(next);
  next.tribunal.resolved = true;

  if (counts.approve > counts.reject) {
    killPlayer(next, candidateId, DEATH_REASONS.EXECUTED);
    pushGameEvent(
      next,
      GAME_EVENT_TYPES.PLAYER_EXECUTED,
      {
        targetId: candidateId,
        message: "단두대 찬성 다수로 후보자가 처형되었습니다.",
        payload: counts,
      },
      deps,
    );
  } else {
    pushGameEvent(
      next,
      GAME_EVENT_TYPES.EXECUTION_REJECTED,
      {
        targetId: candidateId,
        message: "단두대 찬성표가 부족해 후보자가 생존했습니다.",
        payload: counts,
      },
      deps,
    );
  }

  return applyWinCondition(enterNight(next, deps), deps);
}

module.exports = {
  castTribunalVote,
  resolveTribunalVote,
};
