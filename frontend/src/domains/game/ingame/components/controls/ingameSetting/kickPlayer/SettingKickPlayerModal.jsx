import { useCallback, useEffect, useMemo } from "react"
import { useAuthStore } from "../../../../../../auth/store/auth.store.js"
import { useInGameStore } from "../../../../store/ingameStore.js"
import { getSocket } from "../../../../../../../shared/socket/socketClient.js"
import { useKickPlayerRequest, captureVerificationGuard } from "../../../../hooks/useKickPlayerRequest.js"
import SettingKickPlayerModalContent from "./SettingKickPlayerModalContent.jsx"
import SettingKickPlayerModalShell from "./SettingKickPlayerModalShell.jsx"

export default function SettingKickPlayerModal({ open, onClose }) {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const gameId = useInGameStore((s) => s.gameId)
  const state = useInGameStore((s) => s.state)

  const targets = useMemo(() => (state?.players ?? [])
    .filter((player) => player?.uuid && player.uuid !== authUuid)
    .filter((player) => player.isParticipating !== false)
    .map((player) => ({
      uuid: player.uuid,
      nickname: player.nickname,
      membershipId: player.membershipId ?? null,
    })), [state, authUuid])

  const getMembershipScopeId = useCallback(() => {
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return null
    const myMembershipId = (current.state.players ?? [])
      .find((player) => player.uuid === authUuid)?.membershipId ?? null
    return `${current.state.bootEpoch ?? ""}:${current.gameId}:${myMembershipId ?? ""}`
  }, [authUuid])

  const verifyMembership = useCallback(() => new Promise((resolve) => {
    const socket = getSocket()
    const current = useInGameStore.getState()
    if (!socket || !current.gameId) { resolve(false); return }
    const gameIdAtRequest = current.gameId
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const isStillCurrent = captureVerificationGuard({
      socket,
      getMembershipScopeId,
      getRevision: () => useInGameStore.getState().state?.participationRevision ?? 0,
    })
    try {
      socket.emit("get_session_snapshot", { gameId: gameIdAtRequest }, (response) => {
        if (!isStillCurrent()) { finish(false); return }
        if (!response || response.ok !== true) { finish(false); return }
        if (response.gameId !== gameIdAtRequest) { finish(false); return }
        if (useInGameStore.getState().gameId !== gameIdAtRequest) { finish(false); return }

        const seqBefore = useInGameStore.getState().snapshotSeq
        useInGameStore.getState().applySessionSnapshot(response)
        if (useInGameStore.getState().snapshotSeq === seqBefore) { finish(false); return }
        finish(true)
      })
    } catch {
      finish(false)
    }
  }), [getMembershipScopeId])

  const buildRequest = useCallback(({ target, requestId }) => {
    const current = useInGameStore.getState()
    const currentState = current.state
    if (!current.gameId || !currentState) return null
    const requesterMembershipId = (currentState.players ?? [])
      .find((player) => player.uuid === authUuid)?.membershipId ?? null
    if (!requesterMembershipId || !target.membershipId) return null
    if (!currentState.roomId || !currentState.roomInstanceId || !currentState.bootEpoch) return null
    return {
      requestId,
      bootEpoch: currentState.bootEpoch,
      roomId: currentState.roomId,
      roomInstanceId: currentState.roomInstanceId,
      requesterMembershipId,
      targetUuid: target.uuid,
      targetMembershipId: target.membershipId,
      gameId: current.gameId,
    }
  }, [authUuid])

  const kick = useKickPlayerRequest({ scope: "GAME", buildRequest, getMembershipScopeId, verifyMembership })

  useEffect(() => {
    if (!open) kick.reset()
  }, [open, kick.reset])

  return (
    <SettingKickPlayerModalShell open={open} onClose={onClose}>
      <SettingKickPlayerModalContent
        targets={targets}
        pendingTarget={kick.pendingTarget}
        status={kick.status}
        errorCode={kick.errorCode}
        isSending={kick.isSending}
        canLookupResult={kick.canLookupResult}
        isAwaitingResolution={kick.isAwaitingResolution}
        onRequestConfirm={kick.requestConfirm}
        onCancelConfirm={kick.cancelConfirm}
        onConfirmKick={kick.confirmKick}
        onLookupResult={kick.lookupResult}
      />
    </SettingKickPlayerModalShell>
  )
}
