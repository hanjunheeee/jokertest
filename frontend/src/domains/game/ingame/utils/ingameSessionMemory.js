// 판 중 새로고침 대비 기억: 그 판 채팅 기록·역할 공개 창 본 것 (브라우저 탭 저장소, 그 판 것만)
// 낮·죽은 사람 채팅 세션 훅·같은 직업 채팅 세션 훅·역할 공개 훅이 씀, 서버 스냅샷엔 채팅 기록이 없음

// 저장 칸 이름 (종류마다 칸 하나라 새 판이 오면 옛 판 것은 덮임)
const CHAT_KEY_PREFIX = "mmc:ingame:chat:"
const ROLE_REVEAL_KEY = "mmc:ingame:roleRevealSeen"
// 채널마다 남기는 최근 말 수 (탭 저장소 크기 넘지 않게)
const MAX_MESSAGES = 200

// 탭 저장소 (막혀 있거나 없으면 null, 시험 환경·사생활 모드 대비)
function storage() {
  try {
    return globalThis.window?.sessionStorage ?? null
  } catch {
    return null
  }
}

// 판·계정 칸 이름이 맞는지
function isIdentity(gameId, authUuid) {
  return typeof gameId === "string" && gameId.length > 0 && typeof authUuid === "string" && authUuid.length > 0
}

// 저장해 둔 말 하나가 제 모양인지 (id·보낸 사람·글·시각)
function isStoredMessage(message) {
  return message !== null && typeof message === "object"
    && typeof message.id === "string" && message.id.length > 0
    && typeof message.senderUuid === "string"
    && typeof message.text === "string"
    && Number.isFinite(message.sentAt)
}

// 저장할 모양으로 줄이기 (최근 것만·필요한 칸만)
function trimMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages.slice(-MAX_MESSAGES).filter(isStoredMessage)
    .map(({ id, senderUuid, text, sentAt }) => ({ id, senderUuid, text, sentAt }))
}

// 그 판·그 계정 채팅 기록 읽기 → { 채널: [말] } (없거나 다른 판이면 null)
export function loadChatHistory(kind, gameId, authUuid) {
  if (!isIdentity(gameId, authUuid)) return null
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(`${CHAT_KEY_PREFIX}${kind}`)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (saved?.gameId !== gameId || saved?.authUuid !== authUuid) return null
    if (saved.channels === null || typeof saved.channels !== "object") return null
    const channels = {}
    for (const [channel, messages] of Object.entries(saved.channels)) {
      channels[channel] = Array.isArray(messages) ? messages.filter(isStoredMessage) : []
    }
    return channels
  } catch {
    return null
  }
}

// 그 판·그 계정 채팅 기록 쓰기 (다른 판 기록은 덮어 지움)
export function saveChatHistory(kind, gameId, authUuid, channels) {
  if (!isIdentity(gameId, authUuid)) return
  const store = storage()
  if (!store) return
  const trimmed = {}
  for (const [channel, messages] of Object.entries(channels ?? {})) trimmed[channel] = trimMessages(messages)
  try {
    store.setItem(`${CHAT_KEY_PREFIX}${kind}`, JSON.stringify({ gameId, authUuid, channels: trimmed }))
  } catch {
    // 저장 칸이 꽉 찼거나 막힘: 기억만 못 함
  }
}

// 이 판·이 계정에서 역할 공개 창을 이미 봤는지
export function hasSeenRoleReveal(gameId, authUuid) {
  if (!isIdentity(gameId, authUuid)) return false
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(ROLE_REVEAL_KEY) === `${gameId}:${authUuid}`
  } catch {
    return false
  }
}

// 역할 공개 창 봤다고 적기 (판 하나만 기억)
export function markRoleRevealSeen(gameId, authUuid) {
  if (!isIdentity(gameId, authUuid)) return
  const store = storage()
  if (!store) return
  try {
    store.setItem(ROLE_REVEAL_KEY, `${gameId}:${authUuid}`)
  } catch {
    // 막힘: 기억만 못 함
  }
}
