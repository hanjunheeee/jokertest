// 카드에서 판 추방 훅: 대상 목록·요청 만들기·보내기 전 소속 확인
// 조작 Provider(카드 메뉴용)·설정 추방 창이 따로 사용, 스냅샷 묻기는 socket/session.js를 부름
import { useCallback, useMemo } from "react"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameStore } from "../store/ingameStore.js"
import { captureVerificationGuard } from "./kick/guards.js"
import { useKickPlayerRequest } from "./useKickPlayerRequest.js"
import { askSnapshot } from "../socket/session.js"

// 판 추방 대상·진행 상태와 추방 함수 (보내기 흐름은 useKickPlayerRequest)
export function useInGameKickFromCard() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const state = useInGameStore((s) => s.state)

  // 나를 뺀, 판에 남아 있는 사람만 대상
  const targets = useMemo(() => (state?.players ?? [])
    .filter((player) => player?.uuid && player.uuid !== authUuid)
    .filter((player) => player.isParticipating !== false)
    .map((player) => ({
      uuid: player.uuid,
      nickname: player.nickname,
      membershipId: player.membershipId ?? null,
    })), [state, authUuid])

  // 부팅 세대·판·내 소속으로 만든 범위 id (요청 중 바뀌면 결과를 버림)
  const getMembershipScopeId = useCallback(() => {
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return null
    const myMembershipId = (current.state.players ?? [])
      .find((player) => player.uuid === authUuid)?.membershipId ?? null
    return `${current.state.bootEpoch ?? ""}:${current.gameId}:${myMembershipId ?? ""}`
  }, [authUuid])

  // 보내기 전에 스냅샷을 다시 받아 내 소속이 아직 맞는지 확인
  const verifyMembership = useCallback(() => new Promise((resolve) => {
    const socket = getSocket()
    const current = useInGameStore.getState()
    // 소켓·판 없으면 바로 실패
    if (!socket || !current.gameId) { resolve(false); return }
    const gameIdAtRequest = current.gameId
    // 결과는 한 번만 알림
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    // 물을 때 계정·소켓·범위·참여 수정 번호를 잡아 둠
    const isStillCurrent = captureVerificationGuard({
      socket,
      getMembershipScopeId,
      getRevision: () => useInGameStore.getState().state?.participationRevision ?? 0,
    })
    try {
      askSnapshot(socket, gameIdAtRequest, (response) => {
        // 그사이 범위가 바뀌었거나 응답이 실패·다른 판이면 실패
        if (!isStillCurrent()) { finish(false); return }
        if (!response || response.ok !== true) { finish(false); return }
        if (response.gameId !== gameIdAtRequest) { finish(false); return }
        if (useInGameStore.getState().gameId !== gameIdAtRequest) { finish(false); return }

        // 스냅샷 순번이 올라가야 반영된 것으로 봄
        const seqBefore = useInGameStore.getState().snapshotSeq
        useInGameStore.getState().applySessionSnapshot(response)
        if (useInGameStore.getState().snapshotSeq === seqBefore) { finish(false); return }
        finish(true)
      })
    } catch {
      // 묻다가 던지면 실패
      finish(false)
    }
  }), [getMembershipScopeId])

  // 판 추방 요청 내용 (내 소속·대상 소속·방 정보가 다 있어야 만듦)
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

  // 판 추방 범위로 추방 요청 흐름 붙임
  const kick = useKickPlayerRequest({
    scope: "GAME", buildRequest, getMembershipScopeId, verifyMembership,
  })

  const { requestConfirm } = kick

  // uuid로 대상 찾아 확인 단계로 (카드 메뉴용, 목록에 없으면 무시)
  const requestConfirmByUuid = useCallback((uuid) => {
    const target = targets.find((entry) => entry.uuid === uuid)
    if (!target) return
    requestConfirm(target)
  }, [targets, requestConfirm])

  return {
    targets,
    pendingTarget: kick.pendingTarget,
    status: kick.status,
    errorCode: kick.errorCode,
    isSending: kick.isSending,
    canLookupResult: kick.canLookupResult,
    isAwaitingResolution: kick.isAwaitingResolution,
    requestConfirm,
    requestConfirmByUuid,
    cancelConfirm: kick.cancelConfirm,
    confirmKick: kick.confirmKick,
    lookupResult: kick.lookupResult,
    reset: kick.reset,
  }
}
