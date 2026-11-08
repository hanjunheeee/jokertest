// 낮·죽은 사람 채팅 화면 메시지 고르기: 보는 채널 메시지를 화면 모양으로, 죽은 사람 채널이면 낮 채팅도 시각 순으로 섞음
// 낮·죽은 사람 채팅 세션 훅이 씀 (죽어도 낮 채팅 읽기는 그대로, 사용자 결정 2026-11-09)
import { selectGameChatView } from "./gameChatReducer.js"
import { INGAME_CHAT_CHANNELS } from "./inGameChatChannel.js"
import { toJokerChatUiMessage } from "./jokerChatReceive.js"
import { mergeChatMessagesByTime } from "./mergeChatMessages.js"

// 채널 하나 메시지 → 화면 모양 + 채널 (판에 없는 보낸이는 뺌)
function channelMessages(state, gameId, authUuid, channel, getPlayerById) {
  return selectGameChatView(state, gameId, authUuid, channel).messages
    .map((message) => {
      const ui = toJokerChatUiMessage(message, getPlayerById)
      return ui ? { ...ui, channel } : null
    })
    .filter(Boolean)
}

// 예: 보는 채널 "DEAD" → 낮 말 { channel: "DAY" } + 죽은 사람 말 { channel: "DEAD" } 시각 순
export function selectGameChatMessages(state, gameId, authUuid, viewChannel, getPlayerById) {
  const own = channelMessages(state, gameId, authUuid, viewChannel, getPlayerById)
  if (viewChannel !== INGAME_CHAT_CHANNELS.DEAD) return own
  const day = channelMessages(state, gameId, authUuid, INGAME_CHAT_CHANNELS.DAY, getPlayerById)
  return mergeChatMessagesByTime(day, own)
}
