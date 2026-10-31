import { useCallback, useMemo, useState } from "react"
import { useMatchingStore, selectRoomMembershipId } from "../store/matchingStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useKickPlayerRequest, captureVerificationGuard } from "../../ingame/hooks/useKickPlayerRequest.js"

export function useMatchingRoomKick({ isRoomVerified = false } = {}) {
  const [modalOpen, setModalOpen] = useState(false)

  const myUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const isInRoom = useMatchingStore((s) => s.isInRoom)
  const players = useMatchingStore((s) => s.players)
  const hostUuid = useMatchingStore((s) => s.hostUuid)

  const isHost = Boolean(isInRoom && myUuid && myUuid === hostUuid)
  const canKick = Boolean(isHost && isRoomVerified)

  const getMembershipScopeId = useCallback(() => {
    const state = useMatchingStore.getState()
    if (!state.isInRoom || !state.roomId) return null
    const authUuid = useAuthStore.getState().user?.uuid ?? null
    const myMembershipId = authUuid ? selectRoomMembershipId(state, authUuid) : null
    return `${state.bootEpoch ?? ""}:${state.roomId}:${state.roomInstanceId ?? ""}:${myMembershipId ?? ""}`
  }, [])

  const verifyMembership = useCallback(() => new Promise((resolve) => {
    const socket = getSocket()
    if (!socket) { resolve(false); return }
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const isStillCurrent = captureVerificationGuard({
      socket,
      getMembershipScopeId,
      getRevision: () => useMatchingStore.getState().roomRevision,
    })
    try {
      socket.emit("get_current_room", {}, (response) => {
        if (!isStillCurrent()) { finish(false); return }
        if (!response || response.ok !== true) { finish(false); return }
        if (response.pending === true || !response.room) { finish(false); return }
        const state = useMatchingStore.getState()
        const room = response.room
        if (room.roomId !== state.roomId) { finish(false); return }
        if (room.roomInstanceId !== state.roomInstanceId) { finish(false); return }
        if (room.bootEpoch !== state.bootEpoch) { finish(false); return }
        useMatchingStore.getState().setRoom(room)
        finish(true)
      })
    } catch {
      finish(false)
    }
  }), [getMembershipScopeId])

  const buildRequest = useCallback(({ target, requestId }) => {
    const state = useMatchingStore.getState()
    const authUuid = useAuthStore.getState().user?.uuid ?? null
    if (!authUuid || !state.isInRoom) return null
    if (state.hostUuid !== authUuid) return null
    if (typeof state.roomId !== "string" || !state.roomId) return null
    if (typeof state.roomInstanceId !== "string" || !state.roomInstanceId) return null
    if (typeof state.bootEpoch !== "string" || !state.bootEpoch) return null
    const requesterMembershipId = selectRoomMembershipId(state, authUuid)
    if (!requesterMembershipId) return null
    const targetMembershipId = selectRoomMembershipId(state, target.uuid)
    if (!targetMembershipId || targetMembershipId !== target.membershipId) return null
    if (target.uuid === authUuid) return null // 본인 추방은 보내지 않는다(서버도 거부한다)
    return {
      requestId,
      bootEpoch: state.bootEpoch,
      roomId: state.roomId,
      roomInstanceId: state.roomInstanceId,
      requesterMembershipId,
      targetUuid: target.uuid,
      targetMembershipId,
    }
  }, [])

  const kick = useKickPlayerRequest({ scope: "ROOM", buildRequest, getMembershipScopeId, verifyMembership })

  const targets = useMemo(() => (players ?? [])
    .filter((player) => player?.uuid && player.uuid !== myUuid)
    .filter((player) => typeof player.membershipId === "string" && player.membershipId.length > 0)
    .map((player) => ({
      uuid: player.uuid,
      nickname: player.nickname,
      membershipId: player.membershipId,
    })), [players, myUuid])

  const openKickModal = useCallback(() => {
    if (!canKick) return
    setModalOpen(true)
  }, [canKick])

  const closeKickModal = useCallback(() => {
    setModalOpen(false)
    kick.reset()
  }, [kick.reset])

  const effectiveOpen = modalOpen && canKick

  return {
    canKick,
    isKickHost: isHost,
    kickModalOpen: effectiveOpen,
    openKickModal,
    closeKickModal,
    kickTargets: targets,
    kickPendingTarget: kick.pendingTarget,
    kickStatus: kick.status,
    kickErrorCode: kick.errorCode,
    isKicking: kick.isSending,
    canLookupKickResult: kick.canLookupResult,
    isAwaitingKickResolution: kick.isAwaitingResolution,
    requestKickConfirm: kick.requestConfirm,
    cancelKickConfirm: kick.cancelConfirm,
    confirmKick: () => kick.confirmKick(targets),
    lookupKickResult: kick.lookupResult,
  }
}
