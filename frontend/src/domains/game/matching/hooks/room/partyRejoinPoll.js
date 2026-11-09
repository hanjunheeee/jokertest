// 파티 방 주기적 묻기·이미 방에 넣어 줬는지 확인·기다리기 그만두기
// usePartyRejoin이 씀, run은 usePartyRejoin이 붙을 때마다 새로 만드는 한 번치 상태
import { followRoomOwner } from '@/shared/socket/nodeMove.js'
import { useMatchingStore } from '../../store/matchingStore'
import { PARTY_WAIT_MAX_MS } from '../../constants/roomTiming.js'
import { ROOM_MESSAGES } from '../../constants/roomMessages.js'
import { clearRejoinGameId, rememberRoomReady } from '../../../shared/utils/partyMatchingRejoin.js'
import { askPartyRoom } from '../../socket/party.js'
import { askRoom } from '../../socket/room.js'
import { completeJoin, rememberGameId, requestJoin } from './partyRejoinRequest.js'

// 이미 서버가 방에 넣어 줬는지 확인
function syncRoom(run) {
  if (!run.isCurrent()) return Promise.resolve()
  if (!run.ctx.awaitPartyRef.current || useMatchingStore.getState().isInRoom) {
    return Promise.resolve()
  }
  return askRoom(run.socket)
    .then((response) => {
      if (!run.isCurrent()) return
      if (response?.ok && response.room) completeJoin(run, response.room)
    })
    .catch(() => {})
}

// 기다리기 그만둠: 옛 응답 막고 기억 지운 뒤 화면에 알림
export function giveUp(run, message) {
  if (!run.isCurrent()) return
  run.owned = false
  if (run.pollTimer !== null) window.clearInterval(run.pollTimer)
  run.ctx.partyBusyRef.current = false
  clearRejoinGameId(run.attachedUuid)
  run.onGiveUpRef.current?.(message)
}

// 주기적 묻기: 지금 방 확인 + 파티 방 묻기 (앞 묻기 응답 오기 전엔 안 겹쳐 보냄)
export function poll(run) {
  const { awaitPartyRef, endedIdRef, partyBusyRef } = run.ctx
  if (!run.isCurrent()) return
  if (!awaitPartyRef.current || useMatchingStore.getState().isInRoom) return
  if (Date.now() - run.waitStartedAtRef.current > PARTY_WAIT_MAX_MS) {
    giveUp(run, ROOM_MESSAGES.PARTY_WAIT_TIMEOUT)
    return
  }
  void syncRoom(run)
  if (run.pollBusy) return
  run.pollBusy = true
  const pollPayload = endedIdRef.current ? { gameId: endedIdRef.current } : {}
  askPartyRoom(run.socket, pollPayload)
    .finally(() => { run.pollBusy = false })
    .then((response) => {
      if (!run.isCurrent()) return
      // 판이 다른 Node에 있었으면 그 Node로 옮긴 뒤 바로 다시 물음
      if (followRoomOwner(response, { isCurrent: run.isCurrent, resend: () => poll(run), fail: () => {} })) return
      if (!response?.ok || !response.room) return
      const resolvedGameId = response.gameId ?? endedIdRef.current
      if (resolvedGameId) rememberGameId(run, resolvedGameId)
      rememberRoomReady({ gameId: resolvedGameId, room: response.room })
      requestJoin(run, { gameId: resolvedGameId, room: response.room })
    })
    .catch(() => {
      partyBusyRef.current = false
    })
}
