/**
 * @file harness.js
 * @desc CLI simulation harness for the in-game core.
 *
 * Run with: npm run game:harness --prefix backend
 */

const {
  CHAT_CHANNELS,
  GAME_EVENT_TYPES,
  NIGHT_ACTION_TYPES,
  ROLES,
  TRIBUNAL_VOTES,
  castDayVote,
  castTribunalVote,
  createFixedClock,
  createGameState,
  handlePlayerDisconnect,
  resolveDayVote,
  resolveNight,
  resolveTribunalVote,
  sendChat,
  submitNightAction,
} = require("./index");

function createHarnessPlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `P${index + 1}`,
    name: `플레이어 ${index + 1}`,
  }));
}

function findByRole(state, role) {
  return state.players.find((player) => player.role === role);
}

function findCitizenTarget(state, excludedIds = new Set()) {
  return state.players.find(
    (player) =>
      player.alive &&
      player.team === "CITIZEN" &&
      !excludedIds.has(player.id),
  );
}

function logRecentEvents(state, fromIndex = 0) {
  state.events.slice(fromIndex).forEach((event) => {
    const target = event.targetId ? ` target=${event.targetId}` : "";
    const actor = event.actorId ? ` actor=${event.actorId}` : "";
    console.log(`[${event.type}] day=${event.day} phase=${event.phase}${actor}${target}`);
  });
}

/**
 * Runs a deterministic 8-player flow without UI, Socket.io, or DB.
 */
function runGameCoreHarness() {
  const clock = createFixedClock("2026-07-09T00:00:00.000Z");
  let state = createGameState({
    gameId: "harness-game",
    players: createHarnessPlayers(8),
    seed: "joker-harness",
    clock,
  });

  console.log(`[DAY ${state.dayIndex}] phase=${state.phase} alive=${state.players.filter((p) => p.alive).length}`);

  const doctor = findByRole(state, ROLES.DOCTOR);
  const guard = findByRole(state, ROLES.GUARD);
  const witchHunter = findByRole(state, ROLES.WITCH_HUNTER);
  const jokers = state.players.filter((player) => player.role === ROLES.JOKER);
  const candidate = findCitizenTarget(
    state,
    new Set([doctor?.id, guard?.id, witchHunter?.id].filter(Boolean)),
  );

  state = castDayVote(state, jokers[0].id, candidate.id, { clock });
  state = castDayVote(state, doctor.id, candidate.id, { clock });
  state = castDayVote(state, guard.id, candidate.id, { clock });
  state = resolveDayVote(state, { clock });

  console.log(`[TRIBUNAL] candidate=${state.tribunal.candidateId}`);
  state = castTribunalVote(state, jokers[0].id, TRIBUNAL_VOTES.APPROVE, { clock });
  state = castTribunalVote(state, doctor.id, TRIBUNAL_VOTES.APPROVE, { clock });
  state = castTribunalVote(state, guard.id, TRIBUNAL_VOTES.APPROVE, { clock });
  state = resolveTribunalVote(state, { clock });

  const protectedTarget = findCitizenTarget(state, new Set([doctor.id]));
  state = submitNightAction(
    state,
    doctor.id,
    { type: NIGHT_ACTION_TYPES.PROTECT, actorId: doctor.id, targetId: protectedTarget.id },
    { clock },
  );
  jokers
    .filter((joker) => state.players.find((player) => player.id === joker.id)?.alive)
    .forEach((joker) => {
      state = submitNightAction(
        state,
        joker.id,
        {
          type: NIGHT_ACTION_TYPES.ASSASSINATE,
          actorId: joker.id,
          targetId: protectedTarget.id,
        },
        { clock },
      );
    });
  state = submitNightAction(
    state,
    guard.id,
    { type: NIGHT_ACTION_TYPES.INVESTIGATE, actorId: guard.id, targetId: jokers[0].id },
    { clock },
  );
  state = submitNightAction(
    state,
    witchHunter.id,
    { type: NIGHT_ACTION_TYPES.CONFIRM, actorId: witchHunter.id, targetId: protectedTarget.id },
    { clock },
  );

  console.log(`[NIGHT] doctor protects=${protectedTarget.id}, jokers target=${protectedTarget.id}`);
  const eventStart = state.events.length;
  state = resolveNight(state, { clock, rng: "joker-harness-night" });
  logRecentEvents(state, eventStart);

  state = sendChat(state, jokers[0].id, CHAT_CHANNELS.PUBLIC, "낮이 밝았습니다.", { clock });
  const disconnectTarget = state.players.find(
    (player) => player.alive && player.team === "CITIZEN" && player.id !== doctor.id,
  );
  state = handlePlayerDisconnect(state, disconnectTarget.id, { clock });

  console.log(`[WIN_CHECK] ${state.winResult ? `${state.winResult.winner}:${state.winResult.reason}` : "no winner"}`);
  console.log(`[EVENTS] total=${state.events.length}`);

  return state;
}

if (require.main === module) {
  runGameCoreHarness();
}

module.exports = {
  runGameCoreHarness,
};
