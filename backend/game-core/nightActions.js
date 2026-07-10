/**
 * @file nightActions.js
 * @desc Night action submission and priority-based resolution.
 */

const { pushGameEvent } = require("./events");
const {
  assertPhase,
  cloneGameState,
  getPlayer,
  killPlayer,
  requireAliveConnectedPlayer,
  requirePlayer,
} = require("./gameState");
const { enterNextDay } = require("./phaseMachine");
const { normalizeRng } = require("./rng");
const { applyWinCondition } = require("./winConditions");
const {
  DEATH_REASONS,
  EVENT_VISIBILITY,
  GAME_EVENT_TYPES,
  GAME_PHASES,
  NIGHT_ACTION_TYPES,
  ROLES,
  TEAMS,
} = require("./types");

const ACTIONABLE_NIGHT_ROLES = new Set([
  ROLES.JOKER,
  ROLES.DOCTOR,
  ROLES.GUARD,
  ROLES.WITCH_HUNTER,
]);

function getExpectedActionTypesForRole(role) {
  if (role === ROLES.DOCTOR) return [NIGHT_ACTION_TYPES.PROTECT];
  if (role === ROLES.JOKER) return [NIGHT_ACTION_TYPES.ASSASSINATE];
  if (role === ROLES.GUARD) return [NIGHT_ACTION_TYPES.INVESTIGATE];
  if (role === ROLES.WITCH_HUNTER) return [NIGHT_ACTION_TYPES.CONFIRM];
  return [];
}

function validateNightAction(state, actorId, action) {
  const actor = requireAliveConnectedPlayer(state, actorId);
  if (action.actorId !== actorId) {
    throw new Error("Night action actorId must match submitting player");
  }

  if (action.type === NIGHT_ACTION_TYPES.SKIP) return;

  const expectedTypes = getExpectedActionTypesForRole(actor.role);
  if (!expectedTypes.includes(action.type)) {
    throw new Error(`Role ${actor.role} cannot submit ${action.type}`);
  }

  requireAliveConnectedPlayer(state, action.targetId);

  if (
    action.type === NIGHT_ACTION_TYPES.PROTECT &&
    !state.config.allowDoctorSelfProtect &&
    action.targetId === actorId
  ) {
    throw new Error("Doctor self-protect is disabled by config");
  }
}

/**
 * Records one night action. The actual result is delayed until resolveNight so
 * priority order is handled in one predictable pipeline.
 * @param {Object} state
 * @param {string} actorId
 * @param {Object} action
 * @param {Object} [deps]
 */
function submitNightAction(state, actorId, action, deps = {}) {
  assertPhase(state, GAME_PHASES.NIGHT);
  validateNightAction(state, actorId, action);

  const next = cloneGameState(state);
  next.nightActions.actionsByActor[actorId] = { ...action };

  pushGameEvent(
    next,
    GAME_EVENT_TYPES.NIGHT_ACTION_SUBMITTED,
    {
      actorId,
      targetId: action.targetId,
      visibility: EVENT_VISIBILITY.PRIVATE,
      message: "밤 액션이 제출되었습니다.",
      payload: { actionType: action.type },
    },
    deps,
  );

  return next;
}

function addMissingSkips(state, deps) {
  state.players
    .filter(
      (player) =>
        player.alive &&
        player.connected &&
        ACTIONABLE_NIGHT_ROLES.has(player.role) &&
        !state.nightActions.actionsByActor[player.id],
    )
    .forEach((player) => {
      state.nightActions.actionsByActor[player.id] = {
        type: NIGHT_ACTION_TYPES.SKIP,
        actorId: player.id,
      };
      pushGameEvent(
        state,
        GAME_EVENT_TYPES.NIGHT_ACTION_SKIPPED,
        {
          actorId: player.id,
          visibility: EVENT_VISIBILITY.PRIVATE,
          message: "제한 시간 내 밤 액션을 선택하지 않아 자동으로 건너뜁니다.",
        },
        deps,
      );
    });
}

function getValidActionEntries(state, actionType) {
  return Object.entries(state.nightActions.actionsByActor).filter(
    ([actorId, action]) => {
      const actor = getPlayer(state, actorId);
      return (
        actor?.alive &&
        actor.connected &&
        action.type === actionType &&
        (!action.targetId || getPlayer(state, action.targetId))
      );
    },
  );
}

function resolveProtections(state, deps) {
  const protectedTargetIds = new Set();

  getValidActionEntries(state, NIGHT_ACTION_TYPES.PROTECT).forEach(
    ([actorId, action]) => {
      const actor = requirePlayer(state, actorId);
      if (actor.role !== ROLES.DOCTOR) return;
      protectedTargetIds.add(action.targetId);
      pushGameEvent(
        state,
        GAME_EVENT_TYPES.PROTECTION_APPLIED,
        {
          actorId,
          targetId: action.targetId,
          visibility: EVENT_VISIBILITY.PRIVATE,
          message: "주치의의 보호가 적용되었습니다.",
        },
        deps,
      );
    },
  );

  return protectedTargetIds;
}

function resolveJokerAssassination(state, protectedTargetIds, rng, deps) {
  const assassinationActions = getValidActionEntries(
    state,
    NIGHT_ACTION_TYPES.ASSASSINATE,
  ).filter(([actorId]) => requirePlayer(state, actorId).role === ROLES.JOKER);

  if (assassinationActions.length === 0) return;

  const uniqueTargetIds = [
    ...new Set(assassinationActions.map(([, action]) => action.targetId)),
  ];
  const selectedTargetId =
    uniqueTargetIds.length === 1 ? uniqueTargetIds[0] : rng.pick(uniqueTargetIds);

  if (uniqueTargetIds.length > 1) {
    pushGameEvent(
      state,
      GAME_EVENT_TYPES.JOKER_TARGET_SELECTED,
      {
        targetId: selectedTargetId,
        visibility: EVENT_VISIBILITY.TEAM_JOKER,
        message: "광대들의 암살 대상이 엇갈려 하나의 대상만 선택되었습니다.",
        payload: { candidateTargetIds: uniqueTargetIds },
      },
      deps,
    );
  }

  if (protectedTargetIds.has(selectedTargetId)) {
    pushGameEvent(
      state,
      GAME_EVENT_TYPES.ASSASSINATION_BLOCKED,
      {
        targetId: selectedTargetId,
        message: "주치의의 보호로 광대의 암살이 무효화되었습니다.",
      },
      deps,
    );
    return;
  }

  killPlayer(state, selectedTargetId, DEATH_REASONS.ASSASSINATED);
  pushGameEvent(
    state,
    GAME_EVENT_TYPES.PLAYER_ASSASSINATED,
    {
      targetId: selectedTargetId,
      message: "광대의 암살로 플레이어가 사망했습니다.",
    },
    deps,
  );
}

function resolveGuardInvestigations(state, deps) {
  getValidActionEntries(state, NIGHT_ACTION_TYPES.INVESTIGATE).forEach(
    ([actorId, action]) => {
      const actor = requirePlayer(state, actorId);
      const target = requirePlayer(state, action.targetId);
      if (actor.role !== ROLES.GUARD) return;

      pushGameEvent(
        state,
        GAME_EVENT_TYPES.INVESTIGATION_RESULT,
        {
          actorId,
          targetId: target.id,
          visibility: EVENT_VISIBILITY.PRIVATE,
          message: "경비원의 조사 결과가 기록되었습니다.",
          payload: { isJokerTeam: target.team === TEAMS.JOKER },
        },
        deps,
      );
    },
  );
}

function resolveWitchHunterConfirms(state, deps) {
  getValidActionEntries(state, NIGHT_ACTION_TYPES.CONFIRM).forEach(
    ([actorId, action]) => {
      const actor = requirePlayer(state, actorId);
      const target = requirePlayer(state, action.targetId);
      if (actor.role !== ROLES.WITCH_HUNTER) return;

      // TODO: 마녀사냥꾼의 정확한 효과가 확정되면 payload를 교체한다.
      pushGameEvent(
        state,
        GAME_EVENT_TYPES.CONFIRM_RESULT,
        {
          actorId,
          targetId: target.id,
          visibility: EVENT_VISIBILITY.PRIVATE,
          message: "마녀사냥꾼의 확인 결과가 기록되었습니다.",
          payload: { role: target.role, team: target.team },
        },
        deps,
      );
    },
  );
}

function recordSubmittedSkips(state, deps) {
  getValidActionEntries(state, NIGHT_ACTION_TYPES.SKIP).forEach(([actorId]) => {
    pushGameEvent(
      state,
      GAME_EVENT_TYPES.NIGHT_ACTION_SKIPPED,
      {
        actorId,
        visibility: EVENT_VISIBILITY.PRIVATE,
        message: "플레이어가 밤 액션을 건너뛰었습니다.",
      },
      deps,
    );
  });
}

/**
 * Resolves night actions in the required priority order:
 * Doctor protection -> Joker assassination -> Guard investigation ->
 * Witch Hunter confirm. This ordering is isolated here so new roles can be
 * inserted without rewriting submission validation.
 * @param {Object} state
 * @param {{ rng?: Object|string|number }} [deps]
 */
function resolveNight(state, deps = {}) {
  assertPhase(state, GAME_PHASES.NIGHT);
  const next = cloneGameState(state);
  const rng = normalizeRng(deps.rng);

  addMissingSkips(next, deps);
  recordSubmittedSkips(next, deps);

  const protectedTargetIds = resolveProtections(next, deps);
  resolveJokerAssassination(next, protectedTargetIds, rng, deps);
  resolveGuardInvestigations(next, deps);
  resolveWitchHunterConfirms(next, deps);
  next.nightActions.resolved = true;

  const maybeEnded = applyWinCondition(next, deps);
  if (maybeEnded.phase === GAME_PHASES.ENDED) return maybeEnded;

  return enterNextDay(maybeEnded, deps);
}

module.exports = {
  submitNightAction,
  resolveNight,
};
