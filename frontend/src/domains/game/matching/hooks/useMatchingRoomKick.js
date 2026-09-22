import { useCallback, useMemo, useState } from "react"
// 상대 경로로 둔다 — 이 훅은 node:test에서 실제로 마운트해 검증하는 대기방 추방의 **실제
// 소비 경계**이고, `@/` 별칭은 vite만 해석할 수 있어 그 실행을 막는다(useKickPlayerRequest·
// useGameSessionSocketEvents와 같은 관례).
import { useMatchingStore, selectRoomMembershipId } from "../store/matchingStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getSocket } from "../../../../shared/socket/socketClient.js"
import { useKickPlayerRequest, captureVerificationGuard } from "../../ingame/hooks/useKickPlayerRequest.js"

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

  /**
   * 지금 이 화면이 붙어 있는 **소속**. 바뀌면 진행 중인 확인·응답은 이 화면의 것이 아니다.
   *
   * 방 인스턴스만으로는 부족하다. 요청자 본인이 같은 방을 나갔다 **새 소속으로** 다시 들어와도
   * roomId·roomInstanceId는 그대로이므로 scope가 같아지고, 그러면 옛 확인이 새 소속으로 전송되고
   * 옛 ACK가 새 화면의 상태를 덮는다. 서버 기동(bootEpoch)과 **요청자 자신의 membershipId**까지
   * 넣어야 "그 방의, 그 기동의, 그 소속이었던 나"가 된다.
   */
  const getMembershipScopeId = useCallback(() => {
    const state = useMatchingStore.getState()
    if (!state.isInRoom || !state.roomId) return null
    const authUuid = useAuthStore.getState().user?.uuid ?? null
    const myMembershipId = authUuid ? selectRoomMembershipId(state, authUuid) : null
    return `${state.bootEpoch ?? ""}:${state.roomId}:${state.roomInstanceId ?? ""}:${myMembershipId ?? ""}`
  }, [])

  /**
   * F-21(AC-04): UNKNOWN 이후 **서버에서** 현재 방 상태를 다시 받아온다.
   *
   * 화면이 들고 있는 목록은 그 사이 놓친 사건만큼 낡아 있을 수 있고, 결과를 모르는 요청이
   * 남은 상태에서 그 목록으로 새 대상을 지목하면 이미 실행된 추방을 되풀이하게 된다.
   * get_current_room은 방 조회일 뿐 서버 상태를 바꾸지 않는다(자동 재전송이 아니다).
   *
   * ── setRoom은 되돌릴 수 없다 ──────────────────────────────────────────────────
   * 이 콜백의 setRoom은 **이 화면의 canonical 상태를 갈아끼운다**. 그래서 판정은 전부 그
   * mutation **앞**에 있어야 한다 — 뒤에서 useKickPlayerRequest가 세대를 비교해 "이 응답은
   * 내 것이 아니었다"고 판정해도 이미 덮인 store를 되돌릴 수 없고, 그 store에서 scope를 읽는
   * 비교 자체가 오염된다. captureVerificationGuard가 **보내기 전에** 캡처한 근거로 계정 전이·
   * 소켓 교체·같은 소켓 재연결·소속 변경·더 새로운 방 사건을 여기서 함께 거른다.
   */
  const verifyMembership = useCallback(() => new Promise((resolve) => {
    const socket = getSocket()
    if (!socket) { resolve(false); return }
    let settled = false
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    // 보내기 **전에** 동기적으로 캡처한다(응답 시점에는 이미 늦다).
    const isStillCurrent = captureVerificationGuard({
      socket,
      getMembershipScopeId,
      getRevision: () => useMatchingStore.getState().roomRevision,
    })
    try {
      // 서버는 (payload, callback) 형태로 등록돼 있다 — 빈 payload를 함께 보낸다.
      socket.emit("get_current_room", {}, (response) => {
        // ① 이 응답이 아직 이 화면의 것인가 — setRoom보다 먼저 묻는다.
        if (!isStillCurrent()) { finish(false); return }
        if (!response || response.ok !== true) { finish(false); return }
        // pending(미확정 입장 처리 중)은 "확인됐다"가 아니다 — 잠금을 풀지 않는다.
        if (response.pending === true || !response.room) { finish(false); return }
        // ② 서버가 돌려준 방이 지금 이 화면이 붙어 있는 바로 그 방인가. 다른 방이면 이
        //    조회는 이 확인의 근거가 아니다 — 추방 결과 재확인이 화면을 다른 방으로 옮기는
        //    부작용을 내서는 안 된다.
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

  const kick = useKickPlayerRequest({ scope: "ROOM", buildRequest, getMembershipScopeId, verifyMembership })

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
    // 방장이지만 아직 방 검증 전이라 추방을 열 수 없는 상태를 화면이 "비활성"으로 그리기 위한 값.
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
    // UNKNOWN 뒤 서버 재확인이 끝나기 전에는 새 확인을 열 수 없다(화면 안내의 근거).
    isAwaitingKickResolution: kick.isAwaitingResolution,
    requestKickConfirm: kick.requestConfirm,
    cancelKickConfirm: kick.cancelConfirm,
    // 승인 시점의 목록을 그대로 넘긴다 — 확인 당시의 소속이 아직 그대로인지 훅이 대조한다.
    confirmKick: () => kick.confirmKick(targets),
    lookupKickResult: kick.lookupResult,
  }
}
