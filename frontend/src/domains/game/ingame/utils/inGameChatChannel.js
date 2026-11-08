// 채팅 채널 이름과 지금 보낼·볼·받을 채널 고르기 (단계·생존·직업 기준)
// 내 판 채팅 문맥 고르기·낮 채팅 상태·낮 채팅 세션 훅이 사용
// 죽은 사람은 낮·재판·밤 상관없이 죽은 사람 채널로 말함, 낮 채팅은 읽기만 (사용자 결정 2026-11-09)
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

// 죽은 사람 채널을 여는 단계 (서버와 같음)
const DEAD_CHAT_PHASES = new Set(["DAY", "TRIBUNAL", "NIGHT"])

// 밤 직업 채널: 산 사람만 내 직업 채널 (죽은 사람은 죽은 사람 채널로)
function resolveNightRoleChannel(state, alive) {
  const role = state?.self?.role
  if (!NIGHT_ROLE_CHANNELS.has(role)) return null
  return alive ? role : null
}

// 죽은 사람이 지금 죽은 사람 채널을 쓰는지
function deadChannelFor(state) {
  return DEAD_CHAT_PHASES.has(state?.phase) ? INGAME_CHAT_CHANNELS.DEAD : null
}

// 보낼 채널: 산 사람은 낮·재판엔 낮 채널, 밤엔 직업 채널, 죽은 사람은 언제나 죽은 사람 채널 (생존 모르면 null)
export function resolveInGameChatSendChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null
  if (!alive) return deadChannelFor(state)

  if (state?.phase === "DAY") return INGAME_CHAT_CHANNELS.DAY
  if (state?.phase === "TRIBUNAL") return INGAME_CHAT_CHANNELS.DAY
  if (state?.phase === "NIGHT") return resolveNightRoleChannel(state, alive)
  return null
}

// 볼 채널: 죽은 사람은 죽은 사람 채널(낮 채팅도 같이 보임), 산 사람은 낮엔 낮 채널, 밤엔 직업 채널, 그 밖엔 낮 채널
export function resolveInGameChatViewChannel(state) {
  const alive = selectInGameSelfAlive(state)
  if (alive === null) return null
  if (!alive) return deadChannelFor(state)
  if (state?.phase === "NIGHT") return resolveNightRoleChannel(state, alive)
  return INGAME_CHAT_CHANNELS.DAY
}

// 받아 둘 채널: 죽은 사람 채널을 보면 낮 채팅도 같이 받음 (죽어도 낮 채팅 읽기는 그대로)
// 예: "DEAD" → ["DEAD", "DAY"], "DAY" → ["DAY"], null → []
export function resolveInGameChatReadChannels(viewChannel) {
  if (viewChannel === INGAME_CHAT_CHANNELS.DEAD) return [INGAME_CHAT_CHANNELS.DEAD, INGAME_CHAT_CHANNELS.DAY]
  return viewChannel ? [viewChannel] : []
}
