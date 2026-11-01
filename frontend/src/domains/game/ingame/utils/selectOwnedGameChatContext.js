// 내 판 채팅 문맥 고르기: 판 id와 지금 볼·보낼 채널 (내 판 아니면 빈 문맥)
// 낮 채팅 세션 훅·이모티콘 범위 고르기가 사용
import { resolveInGameChatSendChannel, resolveInGameChatViewChannel } from "./inGameChatChannel.js"

// 내 판이 아닐 때 돌려주는 빈 문맥
const EMPTY_CONTEXT = Object.freeze({ gameId: null, viewChannel: null, sendChannel: null })

// 계정·판 id가 있고 판 상태의 본인이 이 계정일 때만 채널 고름
export function selectOwnedGameChatContext({ gameId, state } = {}, authUuid) {
  if (typeof authUuid !== "string" || authUuid.length === 0) return EMPTY_CONTEXT
  if (typeof gameId !== "string" || gameId.length === 0) return EMPTY_CONTEXT
  if (state === null || typeof state !== "object" || Array.isArray(state)) return EMPTY_CONTEXT
  if (state.self?.uuid !== authUuid) return EMPTY_CONTEXT

  return {
    gameId,
    viewChannel: resolveInGameChatViewChannel(state),
    sendChannel: resolveInGameChatSendChannel(state),
  }
}
