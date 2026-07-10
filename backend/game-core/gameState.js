/**
 * @file gameState.js
 * @desc GameState creation, cloning, and validation helpers.
 */

const { resolveGameConfig } = require("./config");
const { assignRoles } = require("./roleAssignment");
const { pushGameEvent } = require("./events");
const {
  DEATH_REASONS,
  GAME_EVENT_TYPES,
  GAME_PHASES,
  getTeamForRole,
} = require("./types");

function createEmptyDayVotes() {
  return {
    votesByVoter: {},
    resolved: false,
    candidateId: null,
  };
}

function createEmptyTribunal(candidateId = null) {
  return {
    candidateId,
    votesByVoter: {},
    resolved: false,
  };
}

function createEmptyNightActions() {
  return {
    actionsByActor: {},
    resolved: false,
    results: [],
  };
}

function normalizePlayerInput(player, index) {
  return {
    id: player.id ?? player.uuid ?? `player-${index + 1}`,
    name: player.name ?? player.nickname ?? `Player ${index + 1}`,
    role: player.role,
    team: player.team,
    alive: player.alive ?? true,
    connected: player.connected ?? true,
    deathReason: player.deathReason,
  };
}

function buildPlayers({ players, rolesByPlayerId, rng, config }) {
  const normalizedPlayers = players.map(normalizePlayerInput);
  const hasProvidedRoles =
    rolesByPlayerId ||
    normalizedPlayers.every((player) => Boolean(player.role));

  if (!hasProvidedRoles) {
    return assignRoles(normalizedPlayers, { rng, config });
  }

  return normalizedPlayers.map((player) => {
    const role = rolesByPlayerId?.[player.id] ?? player.role;
    if (!role) throw new Error(`Missing role for player ${player.id}`);

    return {
      ...player,
      role,
      team: player.team ?? getTeamForRole(role),
      alive: player.alive ?? true,
      connected: player.connected ?? true,
    };
  });
}

/**
 * Creates a new GameState from lobby players. Role assignment is deterministic
 * when a seed/RNG is injected.
 * @param {{ gameId: string, players: Object[], seed?: string|number, rng?: Object, clock?: Object, config?: Object, rolesByPlayerId?: Object }} options
 */
function createGameState(options) {
  const config = resolveGameConfig(options.config);
  const players = buildPlayers({
    players: options.players,
    rolesByPlayerId: options.rolesByPlayerId,
    rng: options.rng ?? options.seed,
    config,
  });

  if (!config.supportedPlayerCounts.includes(players.length)) {
    throw new Error(`Unsupported player count: ${players.length}`);
  }

  const state = {
    id: options.gameId,
    phase: GAME_PHASES.DAY,
    dayIndex: 1,
    initialPlayerCount: players.length,
    players,
    dayVotes: createEmptyDayVotes(),
    tribunal: createEmptyTribunal(),
    nightActions: createEmptyNightActions(),
    events: [],
    winResult: null,
    config,
  };

  pushGameEvent(
    state,
    GAME_EVENT_TYPES.GAME_CREATED,
    {
      message: "게임 상태가 생성되었습니다.",
      payload: { playerCount: players.length },
    },
    { clock: options.clock },
  );

  return state;
}

function cloneGameState(state) {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    dayVotes: {
      ...state.dayVotes,
      votesByVoter: { ...state.dayVotes.votesByVoter },
    },
    tribunal: {
      ...state.tribunal,
      votesByVoter: { ...state.tribunal.votesByVoter },
    },
    nightActions: {
      ...state.nightActions,
      actionsByActor: Object.fromEntries(
        Object.entries(state.nightActions.actionsByActor).map(([actorId, action]) => [
          actorId,
          { ...action },
        ]),
      ),
      results: state.nightActions.results.map((result) => ({ ...result })),
    },
    events: state.events.map((event) => ({
      ...event,
      payload: event.payload ? { ...event.payload } : undefined,
    })),
    winResult: state.winResult ? { ...state.winResult } : null,
  };
}

function getPlayer(state, playerId) {
  return state.players.find((player) => player.id === playerId) ?? null;
}

function requirePlayer(state, playerId) {
  const player = getPlayer(state, playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return player;
}

function requireAliveConnectedPlayer(state, playerId) {
  const player = requirePlayer(state, playerId);
  if (!player.alive) throw new Error(`Player is dead: ${playerId}`);
  if (!player.connected) throw new Error(`Player is disconnected: ${playerId}`);
  return player;
}

function assertGameActive(state) {
  if (state.phase === GAME_PHASES.ENDED || state.winResult) {
    throw new Error("Game has already ended");
  }
}

function assertPhase(state, phase) {
  assertGameActive(state);
  if (state.phase !== phase) {
    throw new Error(`Expected phase ${phase}, received ${state.phase}`);
  }
}

function updatePlayer(state, playerId, patch) {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error(`Unknown player: ${playerId}`);
  state.players[index] = { ...state.players[index], ...patch };
}

function getAlivePlayers(state) {
  return state.players.filter((player) => player.alive);
}

function getAliveConnectedPlayers(state) {
  return state.players.filter((player) => player.alive && player.connected);
}

function getAliveJokers(state) {
  return getAlivePlayers(state).filter((player) => player.team === "JOKER");
}

function getAliveCitizens(state) {
  return getAlivePlayers(state).filter((player) => player.team === "CITIZEN");
}

function killPlayer(state, playerId, deathReason = DEATH_REASONS.UNKNOWN) {
  requirePlayer(state, playerId);
  updatePlayer(state, playerId, {
    alive: false,
    deathReason,
  });
}

module.exports = {
  createGameState,
  cloneGameState,
  createEmptyDayVotes,
  createEmptyTribunal,
  createEmptyNightActions,
  getPlayer,
  requirePlayer,
  requireAliveConnectedPlayer,
  assertGameActive,
  assertPhase,
  updatePlayer,
  getAlivePlayers,
  getAliveConnectedPlayers,
  getAliveJokers,
  getAliveCitizens,
  killPlayer,
};
