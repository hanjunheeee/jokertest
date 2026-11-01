// 대기방 강퇴: 대상 목록·확인 창·강퇴 요청
// useMatchingPage가 씀, 요청 보내기·결과 확인은 인게임과 같이 쓰는 useKickPlayerRequest에 맡김
import { useCallback, useMemo, useState } from "react"
import { useMatchingStore, selectRoomMembershipId } from "../store/matchingStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { askRoomCb } from "../socket/room.js"
import { useKickPlayerRequest, captureVerificationGuard } from "../../ingame/hooks/useKickPlayerRequest.js"

export function useMatchingRoomKick({ isRoomVerified = false } = {}) {
  const [modalOpen, setModalOpen] = useState(false)

  const myUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const isInRoom = useMatchingStore((s) => s.isInRoom)
  const players = useMatchingStore((s) => s.players)
  const hostUuid = useMatchingStore((s) => s.hostUuid)

  // 방장이고 방 확인이 끝났을 때만 강퇴 가능
  const isHost = Boolean(isInRoom && myUuid && myUuid === hostUuid)
  const canKick = Boolean(isHost && isRoomVerified)

  // 지금 소속 묶음 id (서버 부팅·방·방 인스턴스·내 소속), 바뀌면 진행 중 강퇴는 무효
  const getMembershipScopeId = useCallback(() => {
    const state = useMatchingStore.getState()
    if (!state.isInRoom || !state.roomId) return null
    const authUuid = useAuthStore.getState().user?.uuid ?? null
    const myMembershipId = authUuid ? selectRoomMembershipId(state, authUuid) : null
    return `${state.bootEpoch ?? ""}:${state.roomId}:${state.roomInstanceId ?? ""}:${myMembershipId ?? ""}`
  }, [])

  // 강퇴 결과가 애매할 때 서버에 지금 방을 물어 같은 방인지 확인하고 방을 새로 넣음
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
      askRoomCb(socket, (response) => {
        // 그사이 소속이 바뀌었거나 방이 없거나 다른 방이면 실패
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

  // 강퇴 요청 만들기: 내가 방장이고 대상이 지금도 같은 소속으로 앉아 있을 때만
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
    if (target.uuid === authUuid) return null
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

  // 강퇴 대상: 나를 뺀, 소속 id가 있는 사람
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

  // 닫으면 진행 상태도 지움
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
