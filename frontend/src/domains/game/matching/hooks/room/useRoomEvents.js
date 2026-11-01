// 방 안 방송 받아서 대기방 상태에 반영
// hooks/room/useRoom이 씀, 방에 있을 때만 붙고 소속이 바뀌면(eventGen) 다시 붙음
// 옛 방·옛 소속·옛 설정 버전 이벤트는 버리고, 판정이 애매하면 방을 다시 확인함
import { useEffect } from 'react'
import { getSocket } from '@/shared/socket/socketClient.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useInGameStore } from '../../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { dispatchSfxEvent } from '@/shared/hooks/useSfxRuntime.js'
import { READY_EVENT, classifyReady } from '../../utils/roomVersion.js'
import { roomSfx, startSfx } from '../../utils/roomSfx.js'
import { onRoomEvents } from '../../socket/events.js'

export function useRoomEvents(ctx, { socket, roomId, onRoomDeleted, onGameStarted }) {
  useEffect(() => {
    if (!socket || !roomId) return

    const { addPlayer, removePlayer, updateHost, setPlayerReady, clearRoom, applyRoomSettings } =
      useMatchingStore.getState()
    const { memberGenRef, readyAggRef, bumpRef, resync, applyVerified, clearStart } = ctx

    // 붙인 소켓·계정·소속이 그대로일 때만 반영
    const attachedSocket = socket
    const attachedUuid = useAuthStore.getState().user?.uuid ?? null
    const attachedMembership = memberGenRef.current
    let owned = true
    const isCurrent = () =>
      owned
      && attachedSocket === getSocket()
      && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid
      && memberGenRef.current === attachedMembership

    // 반영하고 방 반영 세대 올림 (확인 중이던 요청은 다시 시작)
    const apply = (fn) => {
      fn()
      bumpRef.current?.()
    }

    const handleJoined = ({ player, canStart }) => {
      if (!isCurrent()) return
      readyAggRef.current += 1
      apply(() => addPlayer(player, canStart))
    }

    // 퇴장: 같은 방이고, 소속 id가 오면 지금 앉은 그 사람일 때만
    const handleLeft = ({ uuid, canStart, membershipId, roomId: eventRoomId }) => {
      if (!isCurrent()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      if (typeof membershipId === "string" && membershipId.length > 0) {
        const seated = useMatchingStore.getState().players?.find((player) => player.uuid === uuid)
        if (!seated) return
        if (typeof seated.membershipId === "string" && seated.membershipId !== membershipId) return
      }
      readyAggRef.current += 1
      apply(() => removePlayer(uuid, canStart))
    }

    // 방장 바뀜: 같은 방 인스턴스·서버 부팅일 때만, 설정 버전이 다르면 방 다시 확인
    const handleHost = ({
      hostUuid, canStart, roomId: eventRoomId, settingsVersion, roomInstanceId, bootEpoch,
    }) => {
      if (!isCurrent()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      const identity = useMatchingStore.getState()
      if (typeof roomInstanceId === "string" && typeof identity.roomInstanceId === "string"
        && roomInstanceId !== identity.roomInstanceId) return
      if (typeof bootEpoch === "string" && typeof identity.bootEpoch === "string"
        && bootEpoch !== identity.bootEpoch) return
      apply(() => updateHost(hostUuid, canStart))
      const known = useMatchingStore.getState().settingsVersion
      if (settingsVersion !== undefined && settingsVersion !== known) resync()
    }

    // 설정 바뀜: 지금 버전보다 새것만 반영
    const handleSettings = (payload) => {
      if (!isCurrent()) return
      if (!payload || payload.roomId !== roomId) return
      const known = useMatchingStore.getState().settingsVersion
      const incoming = payload.settingsVersion
      if (Number.isSafeInteger(incoming) && Number.isSafeInteger(known)) {
        if (incoming < known) return
        if (incoming === known) return
      }
      readyAggRef.current += 1
      apply(() => applyRoomSettings(payload))
    }

    // 준비 바뀜: 옛것이면 버림, 더 새 설정이면 방 다시 확인, 반영하면 효과음
    const handleReady = ({
      uuid, isReady, canStart, sfxEvent, roomId: eventRoomId, settingsVersion, readyRevision,
    }) => {
      if (!isCurrent()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      const verdict = classifyReady(useMatchingStore.getState(), uuid, { settingsVersion, readyRevision })
      if (verdict === READY_EVENT.STALE) return
      if (verdict === READY_EVENT.NEWER) {
        resync()
        return
      }
      readyAggRef.current += 1
      apply(() => setPlayerReady(uuid, isReady, canStart, readyRevision))
      const sfx = roomSfx('room-ready-changed', sfxEvent, useAuthStore.getState())
      if (sfx) dispatchSfxEvent(sfx)
    }

    // 방 삭제: 방 비우고 화면에 알림
    const handleDeleted = () => {
      if (!isCurrent()) return
      applyVerified(clearRoom)
      onRoomDeleted?.()
    }

    // 게임 시작: 판 정보 넣고 방 비운 뒤 화면 넘김, 시작 효과음
    const handleStarted = (payload) => {
      if (!isCurrent()) return
      clearStart()
      const { hostUuid } = useMatchingStore.getState()
      useInGameStore.getState().setGamePayload({ ...payload, hostUuid })
      applyVerified(clearRoom)
      onGameStarted?.(payload)

      const gameId = useInGameStore.getState().gameId
      const sfx = startSfx(gameId, payload, useAuthStore.getState())
      if (sfx) dispatchSfxEvent(sfx)
    }

    const off = onRoomEvents(socket, {
      joined: handleJoined,
      left: handleLeft,
      host: handleHost,
      ready: handleReady,
      deleted: handleDeleted,
      started: handleStarted,
      settings: handleSettings,
    })

    return () => {
      owned = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId, ctx.eventGen, onRoomDeleted, onGameStarted])
}
