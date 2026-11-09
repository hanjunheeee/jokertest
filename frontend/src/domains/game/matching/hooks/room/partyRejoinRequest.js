// 파티 방 들어가기 요청·성공 반영·다른 Node면 한 번 옮겨 다시 보내기
// partyRejoinRun·partyRejoinPoll이 씀, run은 partyRejoinRun이 붙을 때마다 새로 만드는 한 번치 상태
import { followRoomOwner } from '@/shared/socket/nodeMove.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useInGameStore } from '../../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { clearRejoinGameId, persistRejoinGameId } from '../../../shared/utils/partyMatchingRejoin.js'
import { joinByCode } from '../../socket/party.js'

// 알아낸 끝난 판 id 기억 (새로고침해도 남게 저장)
export function rememberGameId(run, gameId) {
  if (typeof gameId !== 'string' || gameId.length === 0) return
  run.ctx.endedIdRef.current = gameId
  persistRejoinGameId(run.attachedUuid, gameId)
}

// 방에 들어감: 끝난 판 지우고 방 넣고 확인 완료 표시
export function completeJoin(run, payload) {
  if (!run.isCurrent()) return
  if (payload === null || typeof payload !== 'object') return
  const { partyBusyRef, applyGenRef, mountedRef, setSyncStatus } = run.ctx
  const accountId = useAuthStore.getState().user?.uuid ?? null
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().setRoom(payload)
  clearRejoinGameId(accountId)
  partyBusyRef.current = false
  applyGenRef.current += 1
  if (mountedRef.current) setSyncStatus('verified')
}

// 파티 방 코드로 들어가기 요청
export function requestJoin(run, payload) {
  const { endedIdRef, partyBusyRef } = run.ctx
  // 이미 방에 있거나 요청 중이면 안 보냄
  if (!run.isCurrent()) return
  if (useMatchingStore.getState().isInRoom) return
  if (partyBusyRef.current) return
  // 다른 판의 파티 방이면 무시, 판 id를 처음 알게 되면 기억
  const payloadGameId = typeof payload?.gameId === 'string' ? payload.gameId : null
  const knownGameId = endedIdRef.current
  if (payloadGameId && knownGameId && payloadGameId !== knownGameId) return
  if (payloadGameId && !knownGameId) rememberGameId(run, payloadGameId)
  // 방 코드 있어야 보냄, 방 id 있으면 같이 실음
  const roomCode = payload?.room?.roomCode
  if (typeof roomCode !== 'string' || roomCode.length === 0) return
  partyBusyRef.current = true
  const joinPayload = { roomCode }
  if (typeof payload?.room?.roomId === 'string' && payload.room.roomId.length > 0) {
    joinPayload.roomId = payload.room.roomId
  }
  run.lastJoin = { payload: joinPayload, moved: false }
  joinByCode(run.socket, joinPayload)
}

// 다른 Node 방이라는 거절이면 처음 한 번만 그 Node로 옮겨 같은 요청 다시, 옮기기 시작했으면 true
// 옮기는 동안 요청 중 표시는 그대로 둬서 겹쳐 보내기 막음, 끝나면 어느 길이든 풂
export function retryOnOwnerNode(run, answer) {
  const { partyBusyRef } = run.ctx
  const join = run.lastJoin
  if (!join || join.moved) return false
  const stillMine = () => partyBusyRef.current && run.lastJoin === join
  const moving = followRoomOwner(answer, {
    isCurrent: stillMine,
    resend: () => {
      if (!run.isCurrent() || useMatchingStore.getState().isInRoom) {
        partyBusyRef.current = false
        return
      }
      joinByCode(run.socket, join.payload)
    },
    fail: () => { partyBusyRef.current = false },
  })
  if (moving) join.moved = true
  return moving
}
