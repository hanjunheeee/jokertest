import { parseGameChatBroadcastPayload } from "./parseGameChatBroadcastPayload.js"
import { shouldAcceptGameChatMessage } from "./shouldAcceptGameChatMessage.js"

/**
 * 채널 하나의 수신 이벤트 리스너 등록/해제를 순수 함수로 추출한다(attachJokerChatListener와
 * 동일한 관례). parser 호출과 gameId·채널 게이팅을 이 함수 안에서 전담해, handler는 "지금
 * 반영해도 되는 메시지"만 보게 된다.
 *
 * getContext()는 호출 시점의 최신 { gameId, authUuid, viewChannel }을 돌려줘야 한다 — 리스너
 * 등록 당시의 값을 클로저로 굳혀두면 그 사이 사망하거나 게임·계정이 바뀐 상태를 반영하지
 * 못한다. handler는 게이팅을 통과한 그 맥락을 세 번째 인자로 함께 받으므로, 상태에 반영할 때
 * "어느 신원(gameId + 인증 계정)의 메시지인지"를 다시 추측하지 않아도 된다.
 *
 * 반환되는 해제 함수는 등록한 그 함수 참조만 off한다 — socket이 교체될 때 이전 socket의
 * 리스너가 남지 않는다.
 */
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

  socket.on(eventName, onMessage)
  return () => socket.off(eventName, onMessage)
}
