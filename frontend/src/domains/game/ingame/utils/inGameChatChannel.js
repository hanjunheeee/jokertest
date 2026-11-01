// 채팅 채널 이름과 지금 보낼·볼 채널 고르기 (단계·생존·직업 기준)
// 내 판 채팅 문맥 고르기·낮 채팅 상태·낮 채팅 세션 훅이 사용
import { selectInGameSelfAlive } from "./selfAlive.js"

// 채팅 채널 이름 (낮·죽은 사람·직업별 밤 채널)
export const INGAME_CHAT_CHANNELS = Object.freeze({
  DAY: "DAY",
  DEAD: "DEAD",
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "DOCTOR",
  GUARD: "GUARD",
  WITCH_HUNTER: "WITCH_HUNTER",
})

// 밤에 직업별로 여는 채널
const NIGHT_ROLE_CHANNELS = new Set([
  INGAME_CHAT_CHANNELS.JOKER,
  INGAME_CHAT_CHANNELS.CITIZEN,
  INGAME_CHAT_CHANNELS.DOCTOR,
  INGAME_CHAT_CHANNELS.GUARD,
  INGAME_CHAT_CHANNELS.WITCH_HUNTER,
])

// 밤 직업 채널: 살아 있으면 내 직업 채널, 죽었으면 조커만 그대로
function resolveNightRoleChannel(state, alive) {
  const role = state?.self?.role
  if (!NIGHT_ROLE_CHANNELS.has(role)) return null
  if (alive) return role
  return role === INGAME_CHAT_CHANNELS.JOKER ? role : null
}

// 보낼 채널: 낮·재판엔 살아 있을 때 낮 채널, 밤엔 직업 채널 (생존 모르면 null)
export function resolveInGameChatSendChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null

  if (state?.phase === "DAY") return alive ? INGAME_CHAT_CHANNELS.DAY : null
  if (state?.phase === "TRIBUNAL") return alive ? INGAME_CHAT_CHANNELS.DAY : null
  if (state?.phase === "NIGHT") return resolveNightRoleChannel(state, alive)
  return null
}

// 볼 채널: 낮엔 낮 채널, 밤엔 직업 채널, 그 밖엔 살아 있을 때만 낮 채널
export function resolveInGameChatViewChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null
  if (state?.phase === "DAY") return INGAME_CHAT_CHANNELS.DAY
  if (state?.phase === "NIGHT") return resolveNightRoleChannel(state, alive)
  return alive ? INGAME_CHAT_CHANNELS.DAY : null
}
