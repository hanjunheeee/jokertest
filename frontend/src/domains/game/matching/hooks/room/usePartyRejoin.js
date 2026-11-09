// 판 끝난 뒤 방장이 만든 파티 방으로 다시 들어가기
// hooks/room/useRoom이 씀, 방에 없고 파티 방을 기다릴 때만 붙음
// 방송(파티 방 준비됨)·주기적 묻기·남아 있던 방송 세 길로 방 코드를 받아 들어감
// 방이 없어졌다·꽉 찼다는 거절이 오거나 너무 오래 기다리면 그만두고 onGiveUp으로 알림 (FE-005)
// 다른 Node 방이라는 답이면 그 Node로 옮긴 뒤 같은 요청을 한 번만 다시 보냄
import { useEffect, useRef } from 'react'
import { getSocket } from '@/shared/socket/socketClient.js'
import { followRoomOwner } from '@/shared/socket/nodeMove.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useInGameStore } from '../../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { PARTY_POLL_MS, PARTY_WAIT_MAX_MS } from '../../constants/roomTiming.js'
import { ROOM_MESSAGES } from '../../constants/roomMessages.js'
import {
  clearRejoinGameId,
  consumeRoomReady,
  persistRejoinGameId,
  rememberRoomReady,
} from '../../../shared/utils/partyMatchingRejoin.js'
import { askPartyRoom, joinByCode, onParty } from '../../socket/party.js'
import { askRoom } from '../../socket/room.js'

// 다시 해도 안 될 입장 거절 (방 없어짐·꽉 참·이미 시작·코드 다름·판 끝남)
const GIVE_UP_CODES = new Set([
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_ALREADY_STARTED',
  'ROOM_CODE_MISMATCH',
  'SESSION_ENDED',
])

// 파티 방 재입장 효과 (소켓·끝난 판 id·기다림 여부 바뀌면 다시 붙음)
export function usePartyRejoin(ctx, socket, endedGameId, awaitParty, onGiveUp) {
  // 기다리기 시작한 때 (소켓이 바뀌어 다시 붙어도 처음 때 그대로)
  const waitStartedAtRef = useRef(null)
  // 그만둘 때 부를 함수는 최신 것으로
  const onGiveUpRef = useRef(onGiveUp)
  useEffect(() => { onGiveUpRef.current = onGiveUp })

  useEffect(() => {
    const { awaitPartyRef, endedIdRef, partyBusyRef, applyGenRef, mountedRef, setSyncStatus } = ctx
    // 소켓 없거나 파티 방 안 기다리면 안 붙음
    if (!socket || !awaitPartyRef.current) {
      if (!awaitPartyRef.current) waitStartedAtRef.current = null
      return undefined
    }
    if (waitStartedAtRef.current === null) waitStartedAtRef.current = Date.now()

    // 붙인 소켓·계정이 그대로일 때만 응답 반영
    const attachedSocket = socket
    const attachedUuid = useAuthStore.getState().user?.uuid ?? null
    let owned = true
    const isCurrent = () =>
      owned
      && attachedSocket === getSocket()
      && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid

    // 알아낸 끝난 판 id 기억 (새로고침해도 남게 저장)
    const rememberGameId = (gameId) => {
      if (typeof gameId !== 'string' || gameId.length === 0) return
      endedIdRef.current = gameId
      persistRejoinGameId(attachedUuid, gameId)
    }

    // 방에 들어감: 끝난 판 지우고 방 넣고 확인 완료 표시
    const complete = (payload) => {
      if (!isCurrent()) return
      if (payload === null || typeof payload !== 'object') return
      const accountId = useAuthStore.getState().user?.uuid ?? null
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      clearRejoinGameId(accountId)
      partyBusyRef.current = false
      applyGenRef.current += 1
      if (mountedRef.current) setSyncStatus('verified')
    }

    // 마지막 들어가기 요청 { payload, moved } (Node 옮긴 뒤 다시 보낼 때 씀)
    let lastJoin = null

    // 파티 방 코드로 들어가기 요청
    const request = (payload) => {
      // 이미 방에 있거나 요청 중이면 안 보냄
      if (!isCurrent()) return
      if (useMatchingStore.getState().isInRoom) return
      if (partyBusyRef.current) return
      // 다른 판의 파티 방이면 무시, 판 id를 처음 알게 되면 기억
      const payloadGameId = typeof payload?.gameId === 'string' ? payload.gameId : null
      const knownGameId = endedIdRef.current
      if (payloadGameId && knownGameId && payloadGameId !== knownGameId) return
      if (payloadGameId && !knownGameId) rememberGameId(payloadGameId)
      // 방 코드 있어야 보냄, 방 id 있으면 같이 실음
      const roomCode = payload?.room?.roomCode
      if (typeof roomCode !== 'string' || roomCode.length === 0) return
      partyBusyRef.current = true
      const joinPayload = { roomCode }
      if (typeof payload?.room?.roomId === 'string' && payload.room.roomId.length > 0) {
        joinPayload.roomId = payload.room.roomId
      }
      lastJoin = { payload: joinPayload, moved: false }
      joinByCode(socket, joinPayload)
    }

    // 다른 Node 방이라는 거절이면 처음 한 번만 그 Node로 옮겨 같은 요청 다시, 옮기기 시작했으면 true
    // 옮기는 동안 요청 중 표시는 그대로 둬서 겹쳐 보내기 막음, 끝나면 어느 길이든 풂
    const retryOnOwnerNode = (answer) => {
      const join = lastJoin
      if (!join || join.moved) return false
      const stillMine = () => partyBusyRef.current && lastJoin === join
      const moving = followRoomOwner(answer, {
        isCurrent: stillMine,
        resend: () => {
          if (!isCurrent() || useMatchingStore.getState().isInRoom) {
            partyBusyRef.current = false
            return
          }
          joinByCode(socket, join.payload)
        },
        fail: () => { partyBusyRef.current = false },
      })
      if (moving) join.moved = true
      return moving
    }

    // 들어가기 성공 방송: 방 넣고 끝냄
    const handleJoined = (payload) => {
      complete(payload)
    }

    // 파티 방 준비됨 방송: 기억해 두고 바로 들어가기 시도
    const handleReady = (payload) => {
      rememberRoomReady(payload)
      request(payload)
    }

    // 이미 서버가 방에 넣어 줬는지 확인
    const syncRoom = () => {
      if (!isCurrent()) return Promise.resolve()
      if (!awaitPartyRef.current || useMatchingStore.getState().isInRoom) {
        return Promise.resolve()
      }
      return askRoom(socket)
        .then((response) => {
          if (!isCurrent()) return
          if (response?.ok && response.room) complete(response.room)
        })
        .catch(() => {})
    }

    // 기다리기 그만둠: 옛 응답 막고 기억 지운 뒤 화면에 알림
    let pollTimer = null
    const giveUp = (message) => {
      if (!isCurrent()) return
      owned = false
      if (pollTimer !== null) window.clearInterval(pollTimer)
      partyBusyRef.current = false
      clearRejoinGameId(attachedUuid)
      onGiveUpRef.current?.(message)
    }

    // 주기적 묻기: 지금 방 확인 + 파티 방 묻기 (앞 묻기 응답 오기 전엔 안 겹쳐 보냄)
    let pollBusy = false
    const poll = () => {
      if (!isCurrent()) return
      if (!awaitPartyRef.current || useMatchingStore.getState().isInRoom) return
      if (Date.now() - waitStartedAtRef.current > PARTY_WAIT_MAX_MS) {
        giveUp(ROOM_MESSAGES.PARTY_WAIT_TIMEOUT)
        return
      }
      void syncRoom()
      if (pollBusy) return
      pollBusy = true
      const pollPayload = endedIdRef.current ? { gameId: endedIdRef.current } : {}
      askPartyRoom(socket, pollPayload)
        .finally(() => { pollBusy = false })
        .then((response) => {
          if (!isCurrent()) return
          // 판이 다른 Node에 있었으면 그 Node로 옮긴 뒤 바로 다시 물음
          if (followRoomOwner(response, { isCurrent, resend: poll, fail: () => {} })) return
          if (!response?.ok || !response.room) return
          const resolvedGameId = response.gameId ?? endedIdRef.current
          if (resolvedGameId) rememberGameId(resolvedGameId)
          rememberRoomReady({ gameId: resolvedGameId, room: response.room })
          request({ gameId: resolvedGameId, room: response.room })
        })
        .catch(() => {
          partyBusyRef.current = false
        })
    }

    // 화면 오기 전에 받아 둔 방송이 있으면 먼저 씀, 그다음 바로 한 번 묻기
    const pendingParty = consumeRoomReady(endedIdRef.current)
    if (pendingParty) request(pendingParty)
    poll()

    // 들어가기 실패: 다시 해도 안 될 거절이면 그만두고, 아니면 다음 묻기 때 다시 시도
    const handleJoinFailed = (payload) => {
      if (!isCurrent()) return
      // 내가 보낸 파티 방 입장 요청의 실패만 봄
      if (!partyBusyRef.current) return
      if (retryOnOwnerNode(payload)) return
      partyBusyRef.current = false
      if (GIVE_UP_CODES.has(payload?.code)) giveUp(ROOM_MESSAGES.PARTY_ROOM_GONE)
    }

    // 방송 붙이고 주기적으로 묻기 시작
    const off = onParty(socket, { joined: handleJoined, joinFailed: handleJoinFailed, ready: handleReady })

    pollTimer = window.setInterval(poll, PARTY_POLL_MS)

    // 떠날 때 옛 응답 막고 타이머·방송 뗌
    return () => {
      owned = false
      window.clearInterval(pollTimer)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, endedGameId, awaitParty])
}
