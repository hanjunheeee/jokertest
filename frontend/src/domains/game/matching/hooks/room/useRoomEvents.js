// 방 안 방송 받아서 대기방 상태에 반영
// hooks/room/useRoom이 씀: game_started는 방 id 없어도 붙이고, 나머지는 방 있을 때만
// 옛 방·옛 소속·옛 설정 버전 이벤트는 버리고, 판정이 애매하면 방을 다시 확인함
import { useEffect } from 'react'
import { getSocket } from '@/shared/socket/socketClient.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useInGameStore } from '../../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { dispatchSfxEvent } from '@/shared/hooks/useSfxRuntime.js'
import { READY_EVENT, classifyReady } from '../../utils/roomVersion.js'
import { roomSfx, startSfx } from '../../utils/roomSfx.js'
import { onGameStarted as subscribeGameStarted, onRoomEvents } from '../../socket/events.js'
import { traceMatchingFlow } from '../../debug/matchingFlowTrace.js'

function createReceiptGuard(socket, ctx) {
  const attachedSocket = socket
  const attachedUuid = useAuthStore.getState().user?.uuid ?? null
  const attachedMembership = ctx.memberGenRef.current
  let owned = true
  const isCurrent = () =>
    owned
    && attachedSocket === getSocket()
    && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid
    && ctx.memberGenRef.current === attachedMembership
  const release = () => {
    owned = false
  }
  return { isCurrent, release }
}

// game_started: room_deleted 직후 memberGen이 올라가도 같은 소켓·계정이면 받음
function createGameStartReceiptGuard(socket) {
  const attachedSocket = socket
  const attachedUuid = useAuthStore.getState().user?.uuid ?? null
  let owned = true
  const isCurrent = () =>
    owned
    && attachedSocket === getSocket()
    && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid
  const release = () => {
    owned = false
  }
  return { isCurrent, release }
}

// 게임 시작 방송: 방 확인이 방을 먼저 비운 뒤에도 받게 소켓만 있으면 붙임
export function useGameStartedSocket(ctx, { socket, onGameStarted }) {
  useEffect(() => {
    if (!socket) {
      traceMatchingFlow("game_started_subscribe_skip", { reason: "no_socket" })
      return undefined
    }

    const { clearRoom } = useMatchingStore.getState()
    const { applyVerified, clearStart } = ctx
    const { isCurrent, release } = createGameStartReceiptGuard(socket)
    const attachedSocketId = socket.id ?? null
    const memberGen = ctx.memberGenRef.current
    const eventGen = ctx.eventGen

    traceMatchingFlow("game_started_subscribe", {
      socketId: attachedSocketId,
      memberGen,
      eventGen,
    })

    const handleStarted = (payload) => {
      const gameIdInPayload = payload?.gameId ?? payload?.state?.id ?? null
      traceMatchingFlow("game_started_event", {
        gameIdInPayload,
        memberGen: ctx.memberGenRef.current,
        eventGen: ctx.eventGen,
        socketId: socket.id ?? null,
        attachedSocketId,
        sameSocket: getSocket() === socket,
      })
      if (!isCurrent()) {
        traceMatchingFlow("game_started_ignored", {
          reason: "receipt_guard",
          gameIdInPayload,
          attachedSocketId,
          currentSocketId: getSocket()?.id ?? null,
          uuid: useAuthStore.getState().user?.uuid ?? null,
        })
        return
      }
      useMatchingStore.getState().clearLocalRoomTrust()
      clearStart()
      const { hostUuid, roomId: matchingRoomId } = useMatchingStore.getState()
      traceMatchingFlow("game_started_apply_before", {
        gameIdInPayload,
        matchingRoomId,
        hostUuid,
      })
      useInGameStore.getState().setGamePayload({ ...payload, hostUuid })
      applyVerified(clearRoom)
      const gameId = useInGameStore.getState().gameId
      traceMatchingFlow("game_started_apply_after", {
        gameId,
        matchingRoomIdAfter: useMatchingStore.getState().roomId,
        isInRoom: useMatchingStore.getState().isInRoom,
      })
      onGameStarted?.(payload)
      traceMatchingFlow("game_started_onGameStarted_called", { gameId })

      const sfx = startSfx(gameId, payload, useAuthStore.getState())
      if (sfx) dispatchSfxEvent(sfx)
    }

    const off = subscribeGameStarted(socket, handleStarted)
    return () => {
      traceMatchingFlow("game_started_unsubscribe", { socketId: attachedSocketId, eventGen })
      release()
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, ctx.eventGen, onGameStarted])
}

// 방 안 나머지 방송 (입장·퇴장·준비 등) — roomId 있을 때만
export function useRoomEvents(ctx, { socket, roomId, onRoomDeleted }) {
  useEffect(() => {
    if (!socket || !roomId) return undefined

    const { addPlayer, removePlayer, updateHost, setPlayerReady, clearRoom, applyRoomSettings } =
      useMatchingStore.getState()
    const { readyAggRef, bumpRef, resync, applyVerified } = ctx
    const { isCurrent, release } = createReceiptGuard(socket, ctx)

    const isSameInstance = ({ roomInstanceId, bootEpoch }) => {
      const identity = useMatchingStore.getState()
      if (typeof roomInstanceId === "string" && typeof identity.roomInstanceId === "string"
        && roomInstanceId !== identity.roomInstanceId) return false
      if (typeof bootEpoch === "string" && typeof identity.bootEpoch === "string"
        && bootEpoch !== identity.bootEpoch) return false
      return true
    }

    const apply = (fn) => {
      fn()
      bumpRef.current?.()
    }

    const handleJoined = ({ player, canStart, roomId: eventRoomId, roomInstanceId, bootEpoch }) => {
      if (!isCurrent()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      if (!isSameInstance({ roomInstanceId, bootEpoch })) return
      if (!player || typeof player.uuid !== "string") return
      readyAggRef.current += 1
      apply(() => addPlayer(player, canStart))
    }

    const handleLeft = ({ uuid, canStart, membershipId, roomId: eventRoomId, roomInstanceId, bootEpoch }) => {
      if (!isCurrent()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      if (!isSameInstance({ roomInstanceId, bootEpoch })) return
      if (typeof membershipId === "string" && membershipId.length > 0) {
        const seated = useMatchingStore.getState().players?.find((player) => player.uuid === uuid)
        if (!seated) return
        if (typeof seated.membershipId === "string" && seated.membershipId !== membershipId) return
      }
      const myUuid = useAuthStore.getState().user?.uuid ?? null
      if (myUuid && uuid === myUuid) {
        traceMatchingFlow("room_self_left_event", { roomId, eventRoomId })
        applyVerified(clearRoom)
        onRoomDeleted?.({ reason: "self_left_room", roomId })
        return
      }
      readyAggRef.current += 1
      apply(() => removePlayer(uuid, canStart))
    }

    const handleHost = ({
      hostUuid, canStart, roomId: eventRoomId, settingsVersion, roomInstanceId, bootEpoch,
    }) => {
      if (!isCurrent()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return
      if (!isSameInstance({ roomInstanceId, bootEpoch })) return
      apply(() => updateHost(hostUuid, canStart))
      const known = useMatchingStore.getState().settingsVersion
      if (settingsVersion !== undefined && settingsVersion !== known) resync()
    }

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

    const handleDeleted = () => {
      if (!isCurrent()) return
      const trustUntil = useMatchingStore.getState().roomLocalTrustUntil
      const currentRoomId = useMatchingStore.getState().roomId
      // 방장이 직접 삭제를 누른 경우에는 방장 본인에게 중복 알림을 띄우지 않음 (손님은 그대로 알림)
      const silent = Boolean(ctx.deletingRef.current || ctx.selfDeletedRef.current)
      traceMatchingFlow("room_deleted_event", { roomId: currentRoomId, trustUntil, silent })
      applyVerified(clearRoom)
      onRoomDeleted?.({ reason: "room_deleted_event", trustUntil, roomId: currentRoomId, silent })
    }

    const off = onRoomEvents(socket, {
      joined: handleJoined,
      left: handleLeft,
      host: handleHost,
      ready: handleReady,
      deleted: handleDeleted,
      settings: handleSettings,
    })

    return () => {
      release()
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId, ctx.eventGen, onRoomDeleted])
}