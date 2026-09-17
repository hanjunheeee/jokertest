import { useCallback, useMemo, useState } from "react"
// 상대 경로로 둔다 — 이 훅은 node:test에서 실제로 마운트해 검증하는 대기방 추방의 **실제
// 소비 경계**이고, `@/` 별칭은 vite만 해석할 수 있어 그 실행을 막는다(useKickPlayerRequest·
// useGameSessionSocketEvents와 같은 관례).
import { useMatchingStore, selectRoomMembershipId } from "../store/matchingStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { useKickPlayerRequest } from "../../ingame/hooks/useKickPlayerRequest.js"

/**
 * F-21(AC-02/AC-04/AC-05/AC-06): **대기방** 추방의 실제 화면 경계.
 *
 * useMatchingPage가 이 훅을 그대로 소비하고, GameMatchingPage가 그 값을 추방 모달
 * (SettingKickPlayerModalContent)에 넘긴다. 전송·확인·실패·결과 재조회 수명은 인게임과
 * **같은** useKickPlayerRequest가 소유하므로 두 화면이 갈라지지 않는다.
 *
 * ── 이 훅이 책임지는 것 ────────────────────────────────────────────────────────
 *
 * 1. **목록은 서버가 준 실제 참가자다.** matchingStore.players(=buildRoomPayload의 복사본)에서
 *    본인만 빼고, 서버가 발급한 membershipId가 있는 항목만 대상이 된다. 화면이 만들어 낸
 *    식별자로는 아무도 추방할 수 없다.
 * 2. **비방장에게는 액션 자체가 없다.** canKick이 false면 페이지가 진입 버튼을 그리지 않고,
 *    그래도 호출되면 buildRequest가 null을 돌려 요청이 0회다(서버도 같은 판정을 독립적으로
 *    다시 한다 — 화면 상태는 권한 경계가 아니다).
 * 3. **요청 payload는 전부 서버 값이다.** roomId·roomInstanceId·bootEpoch·요청자 소속·대상
 *    소속 모두 store에 적재된 서버 응답에서 읽는다. 화면이 만드는 값은 requestId뿐이다.
 * 4. **확인의 유효 범위는 "그 방의 그 소속"이다.** getMembershipScopeId가 방 인스턴스를
 *    가리키므로, 확인 도중 방이 바뀌거나 대상이 나갔다 다시 들어오면 그 확인은 무효다.
 */
export function useMatchingRoomKick({ isRoomVerified = false } = {}) {
  const [modalOpen, setModalOpen] = useState(false)

  const myUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const isInRoom = useMatchingStore((s) => s.isInRoom)
  const players = useMatchingStore((s) => s.players)
  const hostUuid = useMatchingStore((s) => s.hostUuid)

  const isHost = Boolean(isInRoom && myUuid && myUuid === hostUuid)
  // 방 검증(isRoomVerified)을 함께 요구한다 — 아직 서버가 확정해 주지 않은 소속으로 남을
  // 내보내려 하면, 그 요청은 어차피 거부되고 화면만 성공한 것처럼 보인다(F-19 초대와 같은 경계).
  const canKick = Boolean(isHost && isRoomVerified)

  /** 지금 이 화면이 붙어 있는 방 인스턴스. 바뀌면 진행 중인 확인·응답은 이 화면의 것이 아니다. */
  const getMembershipScopeId = useCallback(() => {
    const state = useMatchingStore.getState()
    if (!state.isInRoom || !state.roomId) return null
    return `${state.roomId}:${state.roomInstanceId ?? ""}`
  }, [])

  /**
   * 확정된 대상으로 서버 payload를 만든다. 여기서 읽는 값은 **호출 시점의** canonical store다
   * (렌더 시점 클로저를 캡처하지 않는다) — 확인과 전송 사이에 방이 바뀌었으면 null을 돌려
   * 요청을 0회로 만든다.
   */
  const buildRequest = useCallback(({ target, requestId }) => {
    const state = useMatchingStore.getState()
    const authUuid = useAuthStore.getState().user?.uuid ?? null
    if (!authUuid || !state.isInRoom) return null
    // 방장 권한은 요청 시점에 다시 본다. 확인을 여는 사이 방장이 바뀌었을 수 있다.
    if (state.hostUuid !== authUuid) return null
    if (typeof state.roomId !== "string" || !state.roomId) return null
    if (typeof state.roomInstanceId !== "string" || !state.roomInstanceId) return null
    if (typeof state.bootEpoch !== "string" || !state.bootEpoch) return null
    const requesterMembershipId = selectRoomMembershipId(state, authUuid)
    if (!requesterMembershipId) return null
    // 대상 소속도 지금 명단에 그대로 있는 값이어야 한다(확인 당시의 값을 그대로 믿지 않는다).
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

  const kick = useKickPlayerRequest({ scope: "ROOM", buildRequest, getMembershipScopeId })

  /** 추방할 수 있는 실제 대상들. 본인은 빠지고, 서버 소속이 없는 항목은 지목할 수 없다. */
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

  // 모달을 닫으면 확인 중인 대상과 안내를 함께 정리한다 — 다음에 열었을 때 옛 확인이 남아
  // 있으면 그 사이 바뀐 목록 위에서 승인 버튼이 눌릴 수 있다.
  const closeKickModal = useCallback(() => {
    setModalOpen(false)
    kick.reset()
  }, [kick.reset])

  // 방장이 아니게 되거나 방을 떠나면 열려 있던 모달을 닫는다(열린 채로 두면 이미 권한이 없는
  // 목록 위에서 계속 지목하게 된다 — 전송은 어차피 buildRequest가 막는다).
  const effectiveOpen = modalOpen && canKick

  return {
    canKick,
    kickModalOpen: effectiveOpen,
    openKickModal,
    closeKickModal,
    kickTargets: targets,
    kickPendingTarget: kick.pendingTarget,
    kickStatus: kick.status,
    kickErrorCode: kick.errorCode,
    isKicking: kick.isSending,
    canLookupKickResult: kick.canLookupResult,
    requestKickConfirm: kick.requestConfirm,
    cancelKickConfirm: kick.cancelConfirm,
    // 승인 시점의 목록을 그대로 넘긴다 — 확인 당시의 소속이 아직 그대로인지 훅이 대조한다.
    confirmKick: () => kick.confirmKick(targets),
    lookupKickResult: kick.lookupResult,
  }
}
