/**
 * @file gameCore.test.js
 * @desc Core game-flow scenarios required by the harness prompt.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CHAT_CHANNELS,
  DEATH_REASONS,
  GAME_EVENT_TYPES,
  GAME_PHASES,
  NIGHT_ACTION_TYPES,
  ROLES,
  TEAMS,
  TRIBUNAL_VOTES,
  WIN_REASONS,
  applyWinCondition,
  assignRoles,
  canSendChat,
  castDayVote,
  castTribunalVote,
  createFixedClock,
  createGameState,
  enterNight,
  handlePlayerDisconnect,
  resolveDevelopmentGameConfig,
  resolveDayVote,
  resolveNight,
  resolveTribunalVote,
  submitNightAction,
} = require("../index");

const clock = createFixedClock("2026-07-09T00:00:00.000Z");

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `P${index + 1}`,
    name: `Player ${index + 1}`,
  }));
}

function roleCounts(playerStates) {
  return playerStates.reduce((acc, player) => {
    acc[player.role] = (acc[player.role] ?? 0) + 1;
    return acc;
  }, {});
}

function stateWithRoles(roles) {
  return createGameState({
    gameId: `game-${roles.join("-")}`,
    players: roles.map((role, index) => ({
      id: `P${index + 1}`,
      name: `Player ${index + 1}`,
      role,
    })),
    clock,
  });
}

function eventTypes(state) {
  return state.events.map((event) => event.type);
}

test("should assign one joker, one doctor, and three nobles for five players", () => {
  const assigned = assignRoles(players(5), { rng: "roles-5" });
  assert.deepEqual(roleCounts(assigned), {
    [ROLES.JOKER]: 1,
    [ROLES.DOCTOR]: 1,
    [ROLES.NOBLE]: 3,
  });
});

test("should assign two jokers and special citizen roles for eight players", () => {
  const assigned = assignRoles(players(8), { rng: "roles-8" });
  assert.deepEqual(roleCounts(assigned), {
    [ROLES.JOKER]: 2,
    [ROLES.GUARD]: 1,
    [ROLES.DOCTOR]: 1,
    [ROLES.WITCH_HUNTER]: 1,
    [ROLES.NOBLE]: 3,
  });
});

test("should allow one-player development sandbox config without changing official defaults", () => {
  assert.throws(() => createGameState({
    gameId: "official-one-player",
    players: players(1),
    seed: "official-one-player",
    clock,
  }));

  const state = createGameState({
    gameId: "dev-one-player",
    players: players(1),
    seed: "dev-one-player",
    clock,
    config: resolveDevelopmentGameConfig(),
  });

  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].role, ROLES.JOKER);
});

test("should allow two-player development sandbox config", () => {
  const state = createGameState({
    gameId: "dev-two-player",
    players: players(2),
    seed: "dev-two-player",
    clock,
    config: resolveDevelopmentGameConfig(),
  });

  assert.deepEqual(roleCounts(state.players), {
    [ROLES.JOKER]: 1,
    [ROLES.DOCTOR]: 1,
  });
});

test("should skip execution and enter night when day vote is tied", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.NOBLE,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);

  state = castDayVote(state, "P1", "P3", { clock });
  state = castDayVote(state, "P2", "P4", { clock });
  state = resolveDayVote(state, { clock });

  assert.equal(state.phase, GAME_PHASES.NIGHT);
  assert.equal(state.players.every((player) => player.alive), true);
  assert.equal(eventTypes(state).includes(GAME_EVENT_TYPES.GUILLOTINE_BROKEN), true);
});

test("should execute tribunal candidate when approve votes are greater", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.NOBLE,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);

  state = castDayVote(state, "P1", "P5", { clock });
  state = castDayVote(state, "P2", "P5", { clock });
  state = castDayVote(state, "P3", "P5", { clock });
  state = resolveDayVote(state, { clock });
  state = castTribunalVote(state, "P1", TRIBUNAL_VOTES.APPROVE, { clock });
  state = castTribunalVote(state, "P2", TRIBUNAL_VOTES.APPROVE, { clock });
  state = castTribunalVote(state, "P3", TRIBUNAL_VOTES.APPROVE, { clock });
  state = resolveTribunalVote(state, { clock });

  const candidate = state.players.find((player) => player.id === "P5");
  assert.equal(candidate.alive, false);
  assert.equal(candidate.deathReason, DEATH_REASONS.EXECUTED);
  assert.equal(state.phase, GAME_PHASES.NIGHT);
});

test("should keep tribunal candidate alive when approve votes are not greater", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.NOBLE,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);

  state = castDayVote(state, "P1", "P5", { clock });
  state = castDayVote(state, "P2", "P5", { clock });
  state = resolveDayVote(state, { clock });
  state = castTribunalVote(state, "P1", TRIBUNAL_VOTES.REJECT, { clock });
  state = castTribunalVote(state, "P2", TRIBUNAL_VOTES.APPROVE, { clock });
  state = castTribunalVote(state, "P3", TRIBUNAL_VOTES.REJECT, { clock });
  state = resolveTribunalVote(state, { clock });

  const candidate = state.players.find((player) => player.id === "P5");
  assert.equal(candidate.alive, true);
  assert.equal(state.phase, GAME_PHASES.NIGHT);
  assert.equal(eventTypes(state).includes(GAME_EVENT_TYPES.EXECUTION_REJECTED), true);
});

test("should block joker assassination when doctor protects target", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.GUARD,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);
  state = enterNight(state, { clock });

  state = submitNightAction(
    state,
    "P2",
    { type: NIGHT_ACTION_TYPES.PROTECT, actorId: "P2", targetId: "P4" },
    { clock },
  );
  state = submitNightAction(
    state,
    "P1",
    { type: NIGHT_ACTION_TYPES.ASSASSINATE, actorId: "P1", targetId: "P4" },
    { clock },
  );
  state = resolveNight(state, { clock, rng: "doctor-block" });

  assert.equal(state.players.find((player) => player.id === "P4").alive, true);
  assert.equal(eventTypes(state).includes(GAME_EVENT_TYPES.ASSASSINATION_BLOCKED), true);
});

test("should deterministically choose one target when two jokers disagree", () => {
  const base = stateWithRoles([
    ROLES.JOKER,
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.GUARD,
    ROLES.WITCH_HUNTER,
    ROLES.NOBLE,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);

  const prepare = () => {
    let state = enterNight(base, { clock });
    state = submitNightAction(
      state,
      "P1",
      { type: NIGHT_ACTION_TYPES.ASSASSINATE, actorId: "P1", targetId: "P6" },
      { clock },
    );
    state = submitNightAction(
      state,
      "P2",
      { type: NIGHT_ACTION_TYPES.ASSASSINATE, actorId: "P2", targetId: "P7" },
      { clock },
    );
    return state;
  };

  const first = resolveNight(prepare(), { clock, rng: "joker-disagree" });
  const second = resolveNight(prepare(), { clock, rng: "joker-disagree" });
  const firstKill = first.events.find(
    (event) => event.type === GAME_EVENT_TYPES.PLAYER_ASSASSINATED,
  ).targetId;
  const secondKill = second.events.find(
    (event) => event.type === GAME_EVENT_TYPES.PLAYER_ASSASSINATED,
  ).targetId;

  assert.equal(firstKill, secondKill);
  assert.equal(["P6", "P7"].includes(firstKill), true);
});

test("should auto skip a missing night action after timeout", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.GUARD,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);
  state = enterNight(state, { clock });
  state = resolveNight(state, { clock, rng: "timeout" });

  const skipEvent = state.events.find(
    (event) =>
      event.type === GAME_EVENT_TYPES.NIGHT_ACTION_SKIPPED &&
      event.actorId === "P2",
  );
  assert.ok(skipEvent);
});

test("should immediately kill disconnected alive player and recheck win", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.NOBLE,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);
  state = handlePlayerDisconnect(state, "P3", { clock });

  const disconnected = state.players.find((player) => player.id === "P3");
  assert.equal(disconnected.alive, false);
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.deathReason, DEATH_REASONS.DISCONNECTED);
});

test("should declare citizen victory when all jokers are eliminated", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.NOBLE,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);
  state = handlePlayerDisconnect(state, "P1", { clock });

  assert.equal(state.phase, GAME_PHASES.ENDED);
  assert.deepEqual(state.winResult, {
    winner: TEAMS.CITIZEN,
    reason: WIN_REASONS.ALL_JOKERS_ELIMINATED,
  });
});

test("should declare joker victory when jokers reach parity", () => {
  const state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.NOBLE,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);
  const parityState = {
    ...state,
    players: state.players.map((player) =>
      ["P3", "P4", "P5"].includes(player.id)
        ? { ...player, alive: false, deathReason: DEATH_REASONS.UNKNOWN }
        : player,
    ),
  };

  const ended = applyWinCondition(parityState, { clock });

  assert.equal(ended.phase, GAME_PHASES.ENDED);
  assert.deepEqual(ended.winResult, {
    winner: TEAMS.JOKER,
    reason: WIN_REASONS.JOKERS_REACHED_PARITY,
  });
});

test("should separate public and joker night chat permissions", () => {
  let state = stateWithRoles([
    ROLES.JOKER,
    ROLES.DOCTOR,
    ROLES.GUARD,
    ROLES.NOBLE,
    ROLES.NOBLE,
  ]);
  state = enterNight(state, { clock });
  state.players = state.players.map((player) =>
    player.id === "P5"
      ? { ...player, alive: false, deathReason: DEATH_REASONS.UNKNOWN }
      : player,
  );

  assert.equal(canSendChat("P2", CHAT_CHANNELS.PUBLIC, state), false);
  assert.equal(canSendChat("P1", CHAT_CHANNELS.JOKER_NIGHT, state), true);
  assert.equal(canSendChat("P5", CHAT_CHANNELS.PUBLIC, state), false);
});
