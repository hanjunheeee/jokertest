// 판 진행 이벤트 손잡이 (판 끝·추방·방·계정·이모지): 판 정리·화면 이동·캐시·말풍선
// 판 진행 이벤트 훅이 구독 붙일 때마다 새로 만듦, 판 정리 함수는 끊김 감시도 씀
import { useMatchingStore, isCurrentRoomKickEvent } from "../../../matching/store/matchingStore.js"
import { rememberRoomReady } from "../../../shared/utils/partyMatchingRejoin.js"
import { isCurrentGameKickEvent, useInGameStore } from "../../store/ingameStore.js"
import { useInGameEmojiBubbleStore } from "../../store/inGameEmojiBubble.store.js"
import { createGameEndedHandler, createSessionEndFinalizer } from "../../utils/sessionEnd.js"
import { currentAccountId, refreshCaches, isRegistrationScopeCurrent } from "./scope.js"

// 사건 모양 검사용 (배열·null 빼고 객체만)
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

// 판 정리: 판·방 비우고 멀티 화면으로
export function buildFinalizer(navigate) {
  return createSessionEndFinalizer({
    clearGame: () => useInGameStore.getState().clearGame(),
    clearRoom: () => useMatchingStore.getState().clearRoom(),
    navigate,
  })
}

// registered: 구독을 붙인 때의 수신 범위 (판 끝·추방·캐시는 범위 대신 판 id·계정으로 거름)
export function createRoomHandlers(registered, navigate) {
  const isCurrent = () => isRegistrationScopeCurrent(registered)

  // 지금 판이 끝나면 정리
  const gameEnded = createGameEndedHandler({
    getCurrentGameId: () => useInGameStore.getState().gameId,
    finalize: buildFinalizer(navigate),
  })

  // 내가 지금 판에서 추방됨: 판 비우고, 방에도 없으면 멀티 화면으로
  const gameKicked = (payload) => {
    if (!isPlainObject(payload)) return
    const accountId = currentAccountId()
    if (accountId === null || payload.targetUuid !== accountId) return
    if (!isCurrentGameKickEvent(useInGameStore.getState(), payload)) return
    useInGameStore.getState().clearGame()
    if (useMatchingStore.getState().isInRoom) return
    navigate("/multiplay", { replace: true })
  }

  // 내가 지금 방에서 추방됨: 방 비우고, 판에도 없으면 멀티 화면으로
  const roomKicked = (payload) => {
    if (!isPlainObject(payload)) return
    const accountId = currentAccountId()
    if (accountId === null || payload.targetUuid !== accountId) return
    if (!isCurrentRoomKickEvent(useMatchingStore.getState(), payload)) return
    useMatchingStore.getState().clearRoom()
    if (useInGameStore.getState().gameId !== null) return
    navigate("/multiplay", { replace: true })
  }

  // 서버가 계정 캐시를 버리라고 함
  const cacheInvalidated = (payload) => {
    if (!isPlainObject(payload)) return
    refreshCaches(payload.scopes, { invalidate: true })
  }

  // 지금 판 이모지 말풍선 띄우기
  const emojiShown = (payload) => {
    if (!isCurrent()) return
    if (!isPlainObject(payload)) return
    const currentGameId = useInGameStore.getState().gameId
    if (typeof currentGameId !== "string" || currentGameId.length === 0) return
    if (payload.gameId !== currentGameId) return
    if (typeof payload.uuid !== "string" || payload.uuid.length === 0) return
    if (typeof payload.itemId !== "string" || payload.itemId.length === 0) return
    useInGameEmojiBubbleStore.getState().setActiveEmoji(payload.uuid, payload.itemId, payload.sentAt)
  }

  // 파티 매칭 방 준비됨 (다시 들어갈 때 쓰려고 적어 둠)
  const partyRoomReady = (payload) => {
    if (!isCurrent()) return
    rememberRoomReady(payload)
  }

  return { gameEnded, gameKicked, roomKicked, cacheInvalidated, emojiShown, partyRoomReady }
}
