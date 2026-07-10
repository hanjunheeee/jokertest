/**
 * @file gameSession.js
 * @desc Socket.io bridge between in-memory rooms, game-core, and persistence.
 *
 * This file is intentionally the integration layer: it may know about Socket.io
 * and SQLite repository adapters, while game-core stays pure and reusable.
 */

const core = require("../game-core");
const { SqliteGameRepository } = require("../game-persistence/SqliteGameRepository");

const activeGames = new Map();
const playerGame = new Map();
const repository = new SqliteGameRepository();

function resolveRuntimeGameConfig() {
  if (process.env.NODE_ENV === "production") return undefined;
  return core.resolveDevelopmentGameConfig();
}

function socketForUser(io, uuid) {
  return [...io.sockets.sockets.values()].find(
    (socket) => socket.data?.user?.uuid === uuid,
  );
}

function getViewerEventFilter(state, viewerId) {
  const viewer = state.players.find((player) => player.id === viewerId);

  return (event) => {
    if (
      event.visibility === core.EVENT_VISIBILITY.PUBLIC ||
      event.visibility === core.EVENT_VISIBILITY.SYSTEM ||
      !event.visibility
    ) {
      return true;
    }

    if (event.visibility === core.EVENT_VISIBILITY.PRIVATE) {
      return event.actorId === viewerId || event.targetId === viewerId;
    }

    if (event.visibility === core.EVENT_VISIBILITY.TEAM_JOKER) {
      return viewer?.team === core.TEAMS.JOKER;
    }

    return false;
  };
}

/**
 * Builds a client-safe state. Other players' roles stay hidden until the game
 * ends, while the viewer always receives their own role/team for UI state.
 */
function buildClientGameState(state, viewerId) {
  const viewer = state.players.find((player) => player.id === viewerId);
  const revealAllRoles = state.phase === core.GAME_PHASES.ENDED;

  return {
    id: state.id,
    phase: state.phase,
    dayIndex: state.dayIndex,
    localPlayerId: viewerId,
    myRole: viewer?.role ?? null,
    myTeam: viewer?.team ?? null,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      connected: player.connected,
      deathReason: player.deathReason ?? null,
      role: revealAllRoles || player.id === viewerId ? player.role : null,
      team: revealAllRoles || player.id === viewerId ? player.team : null,
    })),
    dayVotes: {
      resolved: state.dayVotes.resolved,
      candidateId: state.dayVotes.candidateId,
      myVote: state.dayVotes.votesByVoter[viewerId] ?? null,
      voteCount: Object.keys(state.dayVotes.votesByVoter).length,
    },
    tribunal: {
      candidateId: state.tribunal.candidateId,
      resolved: state.tribunal.resolved,
      myVote: state.tribunal.votesByVoter[viewerId] ?? null,
    },
    nightActions: {
      resolved: state.nightActions.resolved,
      submitted: Boolean(state.nightActions.actionsByActor[viewerId]),
    },
    winResult: state.winResult,
    events: state.events.filter(getViewerEventFilter(state, viewerId)),
  };
}

async function saveState(state) {
  activeGames.set(state.id, state);
  state.players.forEach((player) => playerGame.set(player.id, state.id));
  await repository.saveGameState(state);
}

async function loadState(gameId) {
  if (!gameId) return null;
  if (activeGames.has(gameId)) return activeGames.get(gameId);

  const state = await repository.loadGameState(gameId);
  if (!state) return null;

  activeGames.set(gameId, state);
  state.players.forEach((player) => playerGame.set(player.id, gameId));
  return state;
}

async function getPlayerState(uuid, gameId = null) {
  const targetGameId = gameId ?? playerGame.get(uuid);
  const state = await loadState(targetGameId);
  if (!state) return null;
  if (!state.players.some((player) => player.id === uuid)) return null;
  return state;
}

function emitStateToPlayer(io, state, playerId, eventName = "game_state_sync") {
  const socket = socketForUser(io, playerId);
  if (!socket) return;

  socket.join(state.id);
  socket.emit(eventName, {
    gameId: state.id,
    state: buildClientGameState(state, playerId),
  });
}

function broadcastState(io, state, eventName = "game_state_update") {
  state.players.forEach((player) => emitStateToPlayer(io, state, player.id, eventName));
}

function emitGameError(socket, message, details = {}) {
  socket.emit("game_error", { message, ...details });
}

async function mutatePlayerGame(io, socket, uuid, mutator) {
  const state = await getPlayerState(uuid);
  if (!state) {
    emitGameError(socket, "진행 중인 게임을 찾을 수 없습니다.");
    return;
  }

  try {
    const next = await mutator(state);
    await saveState(next);
    broadcastState(io, next);
  } catch (error) {
    emitGameError(socket, error.message);
  }
}

/**
 * Creates a game from a matchmaking room and immediately persists/syncs it.
 */
async function startGameFromRoom(io, room) {
  const players = [...room.players.values()].map((player) => ({
    id: player.uuid,
    name: player.nickname,
  }));

  const state = core.createGameState({
    gameId: room.id,
    players,
    seed: room.id,
    config: resolveRuntimeGameConfig(),
  });

  await saveState(state);
  broadcastState(io, state, "game_started");
  return state;
}

function registerGameHandlers(io, socket, uuid) {
  socket.on("join_ingame", async ({ gameId } = {}) => {
    const state = await getPlayerState(uuid, gameId);
    if (!state) {
      emitGameError(socket, "동기화할 인게임 상태를 찾을 수 없습니다.");
      return;
    }

    emitStateToPlayer(io, state, uuid);
  });

  socket.on("send_game_chat", async ({ channel, text } = {}) => {
    await mutatePlayerGame(io, socket, uuid, (state) =>
      core.sendChat(state, uuid, channel ?? core.CHAT_CHANNELS.PUBLIC, text),
    );
  });

  socket.on("cast_day_vote", async ({ targetId } = {}) => {
    await mutatePlayerGame(io, socket, uuid, (state) =>
      core.castDayVote(state, uuid, targetId),
    );
  });

  socket.on("resolve_day_vote", async () => {
    await mutatePlayerGame(io, socket, uuid, (state) => core.resolveDayVote(state));
  });

  socket.on("cast_tribunal_vote", async ({ vote } = {}) => {
    await mutatePlayerGame(io, socket, uuid, (state) =>
      core.castTribunalVote(state, uuid, vote),
    );
  });

  socket.on("resolve_tribunal_vote", async () => {
    await mutatePlayerGame(io, socket, uuid, (state) => core.resolveTribunalVote(state));
  });

  socket.on("submit_night_action", async ({ action } = {}) => {
    await mutatePlayerGame(io, socket, uuid, (state) =>
      core.submitNightAction(state, uuid, { ...action, actorId: uuid }),
    );
  });

  socket.on("resolve_night", async () => {
    await mutatePlayerGame(io, socket, uuid, (state) => core.resolveNight(state));
  });
}

async function onDisconnect(io, uuid) {
  const state = await getPlayerState(uuid);
  if (!state || state.phase === core.GAME_PHASES.ENDED) return;

  try {
    const next = core.handlePlayerDisconnect(state, uuid);
    await saveState(next);
    broadcastState(io, next);
  } catch (error) {
    console.error("\x1b[31m[게임 이탈 처리 에러]\x1b[0m", error);
  }
}

module.exports = {
  startGameFromRoom,
  registerGameHandlers,
  onDisconnect,
  buildClientGameState,
};
