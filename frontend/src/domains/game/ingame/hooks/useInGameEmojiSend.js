import { useCallback } from "react"

import { getSocket } from "../../../../shared/socket/socketClient.js"
import { isSameInGameReceiptScope, readInGameReceiptScope } from "../store/ingameStore.js"
import { inGameEmojiScopeKey, readInGameEmojiScope } from "../utils/selectInGameEmojiScope.js"

/** 연결·소유권이 없어 **보내지도 않은** 요청. 서버 거부 코드와 절대 겹치지 않는 로컬 값이다. */
export const INGAME_EMOJI_SEND_UNAVAILABLE = "CONNECTION_UNAVAILABLE"

/** 보냈으나 ACK를 받지 못했다(동기 예외·거부·형태 없는 응답). 역시 로컬 값이다. */
export const INGAME_EMOJI_SEND_ACK_FAILED = "ACK_FAILED"

/** 보냈고 응답도 왔지만 그 사이 범위가 지나갔다 — 화면에 적용하지 않는다. */
export const INGAME_EMOJI_SEND_STALE = "STALE_SCOPE"

/**
 * E-3(F-33 AC-03): 인게임 이모티콘 전송 경로.
 *
 * ── 언제나 **해결된** 결과를 돌려준다 ───────────────────────────────────────
 * 팔레트 칸을 누르는 것은 화면 조작이라, 그 경로에서 처리되지 않은 rejection이 생기면
 * 사용자에게는 아무 일도 일어나지 않은 것처럼 보이고 콘솔만 더러워진다. 그래서 연결 없음·
 * 동기 throw·ACK 거부를 전부 여기서 흡수해 `{ok:false, code}`로 바꾼다 — 호출부는 결과만
 * 읽으면 된다.
 *
 * ── 늦은 ACK는 적용하지 않는다 ───────────────────────────────────────────────
 * 보낸 뒤 응답이 오는 사이에 소켓이 교체·재연결되거나, 계정이 바뀌거나, 다른 판으로 옮겨
 * 갔을 수 있다. 그런 응답은 **지금 화면의 사실이 아니다.** 요청 시점에 소켓 객체와
 * readInGameReceiptScope 한 벌을 캡처해 두고, 응답 뒤에 (a) 같은 소켓 객체인가, (b) 이모티콘
 * scope(계정·신원 세대·gameId + ENDED·참여 재검사)가 그대로인가, (c) 수신 범위 여덟 축이
 * 전부 같은가를 다시 묻는다. 하나라도 다르면 stale 실패로 해결한다.
 *
 * 이 훅은 store를 구독하지 않는다 — 값은 전부 **보내는 그 순간** 직접 읽는다. 렌더 시점
 * 클로저를 캡처하면 그 사이 지나간 판의 gameId로 보내게 된다.
 */
export function useInGameEmojiSend() {
  const send = useCallback(async (itemId) => {
    if (typeof itemId !== "string" || itemId.length === 0) {
      return { ok: false, code: INGAME_EMOJI_SEND_UNAVAILABLE }
    }

    const requestScope = readInGameEmojiScope()
    if (requestScope === null) return { ok: false, code: INGAME_EMOJI_SEND_UNAVAILABLE }

    const requestSocket = getSocket()
    if (!requestSocket || requestSocket.connected !== true || typeof requestSocket.emitWithAck !== "function") {
      return { ok: false, code: INGAME_EMOJI_SEND_UNAVAILABLE }
    }

    const requestReceipt = readInGameReceiptScope({
      accountId: requestScope.accountId,
      identityGeneration: requestScope.identityGeneration,
    })

    let ack
    try {
      ack = await requestSocket.emitWithAck("send_emoji", {
        gameId: requestScope.gameId,
        itemId,
      })
    } catch (error) {
      // 동기 throw도 await가 rejection으로 바꿔 주므로 한 곳에서 잡힌다.
      return { ok: false, code: INGAME_EMOJI_SEND_ACK_FAILED }
    }

    // (a) 같은 연결 객체인가.
    if (getSocket() !== requestSocket) return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    // (b) 이모티콘 scope가 그대로인가(ENDED·참여 재검사를 포함한다).
    const currentScope = readInGameEmojiScope()
    if (inGameEmojiScopeKey(currentScope) !== inGameEmojiScopeKey(requestScope)) {
      return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    }
    // (c) 수신 범위 여덟 축이 전부 같은가(소켓 세대·id·연결 여부·소속·소속 세대까지).
    const currentReceipt = readInGameReceiptScope({
      accountId: currentScope.accountId,
      identityGeneration: currentScope.identityGeneration,
    })
    if (!isSameInGameReceiptScope(requestReceipt, currentReceipt)) {
      return { ok: false, stale: true, code: INGAME_EMOJI_SEND_STALE }
    }

    // 서버 ack를 그대로 돌려준다(거부 코드 7종은 서버 계약이라 여기서 다시 해석하지 않는다).
    if (ack === null || typeof ack !== "object" || Array.isArray(ack)) {
      return { ok: false, code: INGAME_EMOJI_SEND_ACK_FAILED }
    }
    return ack
  }, [])

  return { send }
}
