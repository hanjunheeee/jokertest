import { useCallback, useMemo } from "react"
// 상대 경로로 둔다 — 이 훅은 node:test에서 실제로 마운트해 검증하는 대상이고, `@/` 별칭은
// vite만 해석할 수 있어 그 실행을 막는다(useKickPlayerRequest와 같은 관례).
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useKickPlayerRequest, captureVerificationGuard } from "./useKickPlayerRequest.js"

/**
 * V-2(AC-03): **플레이어 카드 좌클릭 메뉴**의 추방 경로.
 *
 * 설정 → 방관리 모달(SettingKickPlayerModal.jsx)과 **같은 서버 계약**을 써야 한다 — 같은
 * scope("GAME"), 같은 buildRequest 8필드, 같은 소속 범위 식, 같은 서버 재확인. 두 화면이 각자
 * payload를 만들면 한쪽만 고쳐져 조용히 갈라지고, 그 차이는 서버가 STALE_MEMBERSHIP으로
 * 거절할 때에야 드러난다. 그래서 여기 있는 세 함수는 모달의 것과 **줄 단위로 같은 구현**이다
 * (kickPlayerFlow.test.js가 두 경로의 실제 payload를 requestId만 빼고 전필드 비교한다).
 *
 * 모달을 그대로 재사용하지 않는 이유는 입력 모양 하나뿐이다: 카드 메뉴는 uuid 문자열만 알고
 * 있고 useKickPlayerRequest.requestConfirm은 { uuid, nickname, membershipId } 객체를 요구한다.
 * 그 변환(requestConfirmByUuid)을 여기서 한 번만 한다 — 카드 메뉴가 roster를 따로 읽어
 * 대상 객체를 꾸며내면 목록 필터(본인 제외·참여 중만)가 두 곳으로 갈린다.
 */
export function useInGameKickFromCard() {
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const state = useInGameStore((s) => s.state)

  // 추방 목록은 **아직 참여 중인** 참가자다. 사망 여부로 거르지 않는다 — 사망했어도 참여
  // 중이면 추방할 수 있고, 참여가 끝난 참가자만 목록에서 빠진다(모달과 같은 규칙).
  const targets = useMemo(() => (state?.players ?? [])
    .filter((player) => player?.uuid && player.uuid !== authUuid)
    .filter((player) => player.isParticipating !== false)
    .map((player) => ({
      uuid: player.uuid,
      nickname: player.nickname,
      membershipId: player.membershipId ?? null,
    })), [state, authUuid])

  /** "그 기동의, 그 판의, 그 소속이었던 나". gameId만으로는 부족하다(모달과 같은 계약). */
  const getMembershipScopeId = useCallback(() => {
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return null
    const myMembershipId = (current.state.players ?? [])
      .find((player) => player.uuid === authUuid)?.membershipId ?? null
    return `${current.state.bootEpoch ?? ""}:${current.gameId}:${myMembershipId ?? ""}`
  }, [authUuid])

  /**
   * UNKNOWN 이후 **서버에서** 현재 판 상태를 다시 받아온다. 적용 경계는 참조 보존 no-op일 수
   * 있으므로, 실제로 반영됐을 때만(snapshotSeq가 올랐을 때만) 재확인 성공으로 본다.
   */
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
        // 적용 **전에** 전부 묻는다.
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

  /** 서버 payload 8필드. 하나라도 없으면 null을 돌려 요청 0회로 만든다(모달과 동일). */
  const buildRequest = useCallback(({ target, requestId }) => {
    const current = useInGameStore.getState()
    const currentState = current.state
    if (!current.gameId || !currentState) return null
    // 요청자 자신의 소속도 서버 roster에서 읽는다 — 화면이 만들어 낸 값을 보내지 않는다.
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

  const kick = useKickPlayerRequest({
    scope: "GAME", buildRequest, getMembershipScopeId, verifyMembership,
  })

  const { requestConfirm } = kick

  /**
   * 카드 메뉴 전용 입구. 목록에 없는 uuid(본인·이미 나간 참가자·엉뚱한 값)는 **아무 일도 하지
   * 않는다** — 없는 대상으로 확인 단계를 열면 그 확인은 어떤 payload로도 이어질 수 없다.
   */
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
    // 객체용(모달 본문의 목록 행이 쓴다)과 uuid용(카드 메뉴가 쓴다)을 **별개 필드**로 둔다.
    requestConfirm,
    requestConfirmByUuid,
    cancelConfirm: kick.cancelConfirm,
    confirmKick: kick.confirmKick,
    lookupResult: kick.lookupResult,
    reset: kick.reset,
  }
}
