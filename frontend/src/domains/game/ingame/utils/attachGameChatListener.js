// 낮·죽은 사람 채팅 받기: 모양 검사, 지금 판·지금 보는 채널 것만 손잡이에 넘김
// 게임 채팅 세션 훅이 사용, 받기 등록은 socket/chat.js가 맡음
import { onChat } from "../socket/chat.js"
import { parseGameChatBroadcastPayload } from "./parseGameChatBroadcastPayload.js"
import { shouldAcceptGameChatMessage } from "./shouldAcceptGameChatMessage.js"

export function attachGameChatListener({ socket, eventName, channel, handler, getContext }) {
  const onMessage = (payload) => {
    const parsed = parseGameChatBroadcastPayload(payload)
    if (!parsed) return

    const context = getContext() ?? {}
    const accepted = shouldAcceptGameChatMessage({
      messageChannel: channel,
      messageGameId: parsed.gameId,
      currentGameId: context.gameId,
      currentAuthUuid: context.authUuid,
      currentViewChannel: context.viewChannel,
    })
    if (!accepted) return

    handler(channel, parsed, context)
  }

  return onChat(socket, eventName, onMessage)
}
