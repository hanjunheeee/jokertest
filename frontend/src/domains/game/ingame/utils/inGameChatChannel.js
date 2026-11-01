import { selectInGameSelfAlive } from "./selfAlive.js"

export const INGAME_CHAT_CHANNELS = Object.freeze({
  DAY: "DAY",
  DEAD: "DEAD",
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "DOCTOR",
  GUARD: "GUARD",
  WITCH_HUNTER: "WITCH_HUNTER",
})

const NIGHT_ROLE_CHANNELS = new Set([
  INGAME_CHAT_CHANNELS.JOKER,
  INGAME_CHAT_CHANNELS.CITIZEN,
  INGAME_CHAT_CHANNELS.DOCTOR,
  INGAME_CHAT_CHANNELS.GUARD,
  INGAME_CHAT_CHANNELS.WITCH_HUNTER,
])

function resolveNightRoleChannel(state, alive) {
  const role = state?.self?.role
  if (!NIGHT_ROLE_CHANNELS.has(role)) return null
  if (alive) return role
  return role === INGAME_CHAT_CHANNELS.JOKER ? role : null
}

export function resolveInGameChatSendChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null

  if (state?.phase === "DAY") return alive ? INGAME_CHAT_CHANNELS.DAY : null
  if (state?.phase === "TRIBUNAL") return alive ? INGAME_CHAT_CHANNELS.DAY : null
  if (state?.phase === "NIGHT") return resolveNightRoleChannel(state, alive)
  return null
}

export function resolveInGameChatViewChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null
  if (state?.phase === "DAY") return INGAME_CHAT_CHANNELS.DAY
  if (state?.phase === "NIGHT") return resolveNightRoleChannel(state, alive)
  return alive ? INGAME_CHAT_CHANNELS.DAY : null
}
