// 판 끝난 뒤 방장이 만든 파티 방으로 다시 들어가기
// hooks/room/useRoom이 씀, 방에 없고 파티 방을 기다릴 때만 붙음
// 방송(파티 방 준비됨)·주기적 묻기·남아 있던 방송 세 길로 방 코드를 받아 들어감
import { useEffect } from 'react'
import { getSocket } from '@/shared/socket/socketClient.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useInGameStore } from '../../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { PARTY_POLL_MS } from '../../constants/roomTiming.js'
import {
  clearPartyRejoinGameId,
  consumePartyMatchingRoomReady,
  persistPartyRejoinGameId,
  rememberPartyMatchingRoomReady,
} from '../../utils/partyMatchingRejoin.js'
import { askPartyRoom, joinByCode, onParty } from '../../socket/party.js'
import { askRoom } from '../../socket/room.js'

export function usePartyRejoin(ctx, socket, endedGameId, awaitParty) {
  useEffect(() => {
    const { awaitPartyRef, endedIdRef, partyBusyRef, applyGenRef, mountedRef, setSyncStatus } = ctx
    if (!socket || !awaitPartyRef.current) return undefined

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
      persistPartyRejoinGameId(attachedUuid, gameId)
    }

    // 방에 들어감: 끝난 판 지우고 방 넣고 확인 완료 표시
    const complete = (payload) => {
      if (!isCurrent()) return
      if (payload === null || typeof payload !== 'object') return
      const accountId = useAuthStore.getState().user?.uuid ?? null
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      clearPartyRejoinGameId(accountId)
      partyBusyRef.current = false
      applyGenRef.current += 1
      if (mountedRef.current) setSyncStatus('verified')
    }

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
      joinByCode(socket, joinPayload)
    }

    const handleJoined = (payload) => {
      complete(payload)
    }

    // 파티 방 준비됨 방송: 기억해 두고 바로 들어가기 시도
    const handleReady = (payload) => {
      rememberPartyMatchingRoomReady(payload)
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

    // 주기적 묻기: 지금 방 확인 + 파티 방 묻기
    const poll = () => {
      if (!isCurrent()) return
      if (!awaitPartyRef.current || useMatchingStore.getState().isInRoom) return
      void syncRoom()
      const pollPayload = endedIdRef.current ? { gameId: endedIdRef.current } : {}
      askPartyRoom(socket, pollPayload)
        .then((response) => {
          if (!isCurrent()) return
          if (!response?.ok || !response.room) return
          const resolvedGameId = response.gameId ?? endedIdRef.current
          if (resolvedGameId) rememberGameId(resolvedGameId)
          rememberPartyMatchingRoomReady({ gameId: resolvedGameId, room: response.room })
          request({ gameId: resolvedGameId, room: response.room })
        })
        .catch(() => {
          partyBusyRef.current = false
        })
    }

    // 화면 오기 전에 받아 둔 방송이 있으면 먼저 씀, 그다음 바로 한 번 묻기
    const pendingParty = consumePartyMatchingRoomReady(endedIdRef.current)
    if (pendingParty) request(pendingParty)
    poll()

    const handleJoinFailed = () => {
      partyBusyRef.current = false
    }

    const off = onParty(socket, { joined: handleJoined, joinFailed: handleJoinFailed, ready: handleReady })

    const pollTimer = window.setInterval(poll, PARTY_POLL_MS)

    return () => {
      owned = false
      window.clearInterval(pollTimer)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, endedGameId, awaitParty])
}
