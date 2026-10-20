/**
 * 플레이어 추방 모달 — 인게임 설정 → 방관리 진입.
 *
 * F-21(AC-02): **진행 중 세션**의 추방을 실제 서버 명령(kick_game_player)에 잇는다.
 * 목록은 ingameStore의 canonical roster에서 오고, 확인·전송·실패·결과 재조회 수명은
 * 대기방과 공유하는 useKickPlayerRequest가 소유한다.
 *
 * 시각 shell은 SettingKickPlayerModalShell을 쓰고, 대기방도 같은 shell에 본문만 주입한다.
 */
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

  // 추방 목록은 **아직 참여 중인** 참가자다. 사망 여부로 거르지 않는다 — 사망했어도 참여
  // 중이면 추방할 수 있고(A-06), 참여가 끝난 참가자만 목록에서 빠진다.
  const targets = useMemo(() => (state?.players ?? [])
    .filter((player) => player?.uuid && player.uuid !== authUuid)
    .filter((player) => player.isParticipating !== false)
    .map((player) => ({
      uuid: player.uuid,
      nickname: player.nickname,
      membershipId: player.membershipId ?? null,
    })), [state, authUuid])

  /**
   * 확인이 열린 뒤 이 화면이 다른 판·다른 소속으로 옮겨갔는지 판정하는 값이다.
   *
   * gameId만으로는 부족하다 — 서버 기동과 **요청자 자신의 소속**까지 넣어야 "그 기동의, 그
   * 판의, 그 소속이었던 나"가 된다(대기방 경로와 같은 계약).
   */
  const getMembershipScopeId = useCallback(() => {
    const current = useInGameStore.getState()
    if (!current.gameId || !current.state) return null
    const myMembershipId = (current.state.players ?? [])
      .find((player) => player.uuid === authUuid)?.membershipId ?? null
    return `${current.state.bootEpoch ?? ""}:${current.gameId}:${myMembershipId ?? ""}`
  }, [authUuid])

  /**
   * F-21(AC-04): UNKNOWN 이후 **서버에서** 현재 판 상태를 다시 받아온다. 화면이 들고 있는
   * roster는 놓친 사건만큼 낡아 있을 수 있고, 결과를 모르는 요청이 남은 상태에서 그 목록으로
   * 새 대상을 지목하면 이미 실행된 추방을 되풀이하게 된다. 조회일 뿐 자동 재전송이 아니다.
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

  // 모달을 닫으면 확인 중인 대상과 안내를 함께 정리한다 — 다음에 열었을 때 옛 확인이
  // 남아 있으면 그 사이 바뀐 목록 위에서 승인 버튼이 눌릴 수 있다.
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
