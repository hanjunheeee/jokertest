/**
 * @file chatRules.js
 * @desc Pure chat permission checks for existing/future chat UI.
 */

const { pushGameEvent } = require("./events");
const {
  assertGameActive,
  cloneGameState,
  getPlayer,
  requireAliveConnectedPlayer,
} = require("./gameState");
const {
  CHAT_CHANNELS,
  EVENT_VISIBILITY,
  GAME_EVENT_TYPES,
  GAME_PHASES,
  ROLES,
} = require("./types");

/**
 * Determines whether a player can send to a channel. This does not create UI;
 * it only exposes the rule that UI/Socket code can call later.
 * @param {string} playerId
 * @param {string} channel
 * @param {Object} state
 */
function canSendChat(playerId, channel, state) {
  const player = getPlayer(state, playerId);
  if (!player?.alive || !player.connected) return false;

  if (channel === CHAT_CHANNELS.PUBLIC) {
    if (state.phase === GAME_PHASES.DAY) return true;
    if (state.phase === GAME_PHASES.TRIBUNAL) {
      return Boolean(state.config.allowPublicChatDuringTribunal);
    }
    return false;
  }

  if (channel === CHAT_CHANNELS.JOKER_NIGHT) {
    return state.phase === GAME_PHASES.NIGHT && player.role === ROLES.JOKER;
  }

  return false;
}

/**
 * Records an allowed chat message as a GameEvent. Real message delivery stays
 * outside the core so Socket/UI code can decide how to present it.
 * @param {Object} state
 * @param {string} playerId
 * @param {string} channel
 * @param {string} text
 * @param {Object} [deps]
 */
function sendChat(state, playerId, channel, text, deps = {}) {
  assertGameActive(state);
  requireAliveConnectedPlayer(state, playerId);

  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("Chat text is empty");
  if (!canSendChat(playerId, channel, state)) {
    throw new Error(`Player ${playerId} cannot send chat to ${channel}`);
  }

  const next = cloneGameState(state);
  pushGameEvent(
    next,
    GAME_EVENT_TYPES.CHAT_SENT,
    {
      actorId: playerId,
      visibility:
        channel === CHAT_CHANNELS.JOKER_NIGHT
          ? EVENT_VISIBILITY.TEAM_JOKER
          : EVENT_VISIBILITY.PUBLIC,
      message: trimmed,
      payload: { channel },
    },
    deps,
  );

  return next;
}

module.exports = {
  canSendChat,
  sendChat,
};
