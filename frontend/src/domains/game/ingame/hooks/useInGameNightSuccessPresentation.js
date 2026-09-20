import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getInGameIdentityScopeVersion,
  isSameInGameReceiptScope,
  readInGameReceiptScope,
  readNightSuccessReceiptScope,
  selectNightSuccessQueue,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"

/**
 * F-27b(AC-02, CODEX 반려 수정): "이 밤에 더 이상 HEAL이 오지 않는다"를 판정하는 유일한 근거.
 *
 * backend/game-core/gameSession.js의 applyNightRoleStep(1730-1754)은 DOCTOR 역할 스텝을 적용할
 * 때(성공 여부와 무관하게) closeNightHealing을 호출한다 — 그 함수 자체의 주석이 "상태·사유와
 * 무관하게 의사 턴이 끝나면 치료 가능성이 닫힌다"고 명시한다(closeNightHealing, 1716-1724).
 * 그 스텝이 확정되는 시점에 서버는 night_turn_ended(role: "DOCTOR")를 방송한다 — 그래서 그
 * 방송의 도착이 곧 "이 밤의 치료 가능성이 닫혔다"는 서버가 주는 값이다.
 *
 * 반대로 NIGHT_TURN_ORDER(역할이 도는 순서) 자체는 이 판정의 근거로 쓰지 않는다 —
 * constants/nightTurn/ingameNightTurnAnnouncement.js가 "안내 문구 사전의 정렬일 뿐, 현재 턴을
 * 결정하지 않는다"고 명시적으로 경고하는 값이고, 과거에 프런트가 이 순서를 스스로 가정해
 * 진행시키다가 서버 턴과 어긋난 회귀가 있었다(같은 파일 6-8행). 그래서 "GUARD·WITCH_HUNTER의
 * 사건이 도착했으니 DOCTOR 턴은 끝났을 것"이라는 추론은 쓰지 않고, DOCTOR 자신의 종료 방송만
 * 근거로 삼는다.
 */
const HEAL_WINDOW_CLOSING_ROLE = "DOCTOR"

// F-27b(AC-02): 최종 생존 표시로 이어질 수 있는 두 종류뿐이다 — INVESTIGATE·CONFIRM은 roster의
// alive를 바꾸지 않는다.
const NIGHT_SUCCESS_FINAL_STATUS_TYPES = new Set(["KILL", "HEAL"])

/**
 * F-27b(AC-02): buildNightSuccessQueueEntry는 USER 관점에만 targetId를 복사한다 — TARGET
 * 전용 사건(perspectives가 "TARGET"뿐인 사건)은 수신자 본인이 대상이므로, 여기서 본인 uuid로
 * 보충한다. 어느 쪽도 아니면(형태가 어긋났거나 아직 본인을 모르면) null이다.
 */
function resolveNightSuccessTargetId(entry, selfUuid) {
  if (typeof entry?.targetId === "string" && entry.targetId.length > 0) return entry.targetId
  if (Array.isArray(entry?.perspectives) && entry.perspectives.includes("TARGET")) {
    return typeof selfUuid === "string" && selfUuid.length > 0 ? selfUuid : null
  }
  return null
}

/**
 * F-27b(AC-02): 이 밤(nightDayIndex)의 결과가 canonical roster에 반영됐는가.
 *
 * isNightSuccessWindowOpen(store 내부)의 복원 창과 같은 전이 계약을 읽는다 — NIGHT n의 결과는
 * DAY n+1(dayIndex 증가) 또는 ENDED(그 밤에 바로 게임이 끝나면 dayIndex는 그대로일 수 있다)로만
 * 반영된다. 아직 NIGHT n 그대로이거나 다른 밤을 가리키면 아직 반영 전이다.
 */
function isInGameNightResultReflected(state, nightDayIndex) {
  if (!state || !Number.isInteger(state.dayIndex)) return false
  if (state.phase === "NIGHT") return false
  return state.dayIndex > nightDayIndex || state.phase === "ENDED"
}

/**
 * F-27b: 밤 성공 사건 큐(night_action_success)를 광대→의사→경비원→마녀사냥꾼 순서로 하나씩
 * 소비하는 연출 훅.
 *
 * 도착 순서는 store의 FIFO 큐(selectNightSuccessQueue)가 그대로 지킨다 — 이 훅은 그 선두
 * 항목만 "현재 사건"으로 내보내고, 뒤 항목은 앞이 finish로 끝나 큐에서 빠질 때까지 표시하지
 * 않는다.
 *
 * finish(outcome)는 재생 완료(COMPLETED)·재생 오류(ERROR)·사용자 건너뛰기(SKIPPED) 중 하나를
 * 받아 store의 completeNightSuccess로 그대로 넘긴다. finish는 **자기가 만들어진 렌더의
 * current를 클로저로 캡처**한다(가변 ref를 나중에 읽지 않는다) — 그래서 큐가 이미 다음 사건으로
 * 넘어간 뒤에 도착한 옛 finish 호출도 항상 자기 사건의 eventId로만 completeNightSuccess를
 * 부른다. 그 사건은 이미 completed=true로 기록돼 있으므로(큐가 넘어갔다는 것 자체가 그 사건이
 * 먼저 완료됐다는 뜻이다) store가 noop으로 막는다 — 옛 콜백이 새 사건을 완료하는 일은 없다.
 *
 * finalStatus는 **이 밤의 KILL이 finish되고, 그 대상에 대한 HEAL도 finish됐거나(치료 성공)
 * HEAL이 더 오지 않는다는 것이 확인된 뒤에만** 켜진다 — "더 오지 않는다"는 DOCTOR 역할의
 * night_turn_ended 방송(HEAL_WINDOW_CLOSING_ROLE)으로만 판정한다(추측하지 않는다, 위 상수의
 * 주석 참고). 거기에 더해 큐가 완전히 비고 같은 밤의 night_result_applied가 canonical
 * roster에 반영돼야 한다. 연출 자체(KILL·HEAL 표시)는 alive를 조금도 바꾸지 않는다 — 최종
 * 생존은 오직 roster에서만 읽는다(A-02).
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 더 높은 우선순위 오버레이(자기 역할 공개, 사망 연출)가 떠
 *   있는가. true인 동안에는 표시하지 않되 큐·추적 기록은 그대로 보존한다.
 */
export function useInGameNightSuccessPresentation({ hold = false } = {}) {
  const queue = useInGameStore(selectNightSuccessQueue)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
  // F-23 계열과 같은 이유 — 계정/소속 축의 전이(같은 판의 이탈→재입장 A→B→A 포함)까지 범위에
  // 반영하려면 값 비교가 아니라 store가 세는 전이 세대가 필요하다.
  const identityScopeVersion = useSyncExternalStore(
    subscribeInGameIdentityScope, getInGameIdentityScopeVersion, getInGameIdentityScopeVersion,
  )

  // F-27b(AC-03): 연결 축도 추적·리스너 범위에 넣는다. 소켓이 교체되면 이전 연결이 수락한
  // 사건 기록은 store에서 취소되는데(cancelNightSuccessRecords), 추적만 남아 있으면 새 연결의
  // 첫 사건이 지난 연결의 killDone/healDone을 물려받는다.
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const socketEpochId = getInGameSocketEpochId(socket)

  const current = queue[0] ?? null

  const scopeKey = gameId && authUuid
    ? `${gameId}|${authUuid}|${identityGeneration}|${identityScopeVersion}|${socketEpochId}`
    : null

  /**
   * F-27b(AC-03/AC-08): **이 사건 객체**에 결속된 수락 범위. 같은 사건 객체를 보고 있는 동안
   * 고정되므로 리렌더가 표시(영상 effect)를 다시 시작시키지 않는다.
   *
   * eventId가 아니라 객체 동일성으로 묻는 것이 핵심이다 — 재접속으로 같은 eventId가 복원되면
   * 새 entry와 새 범위가 기록에 들어가는데, 그때 옛 표시가 자기 entry로 물으면 null이 돌아와
   * 옛 콜백이 새 표시를 완료시키지 못한다(readNightSuccessReceiptScope 참고).
   */
  const capturedReceiptScope = useMemo(() => readNightSuccessReceiptScope(current), [current])

  // F-27b(AC-02): 최종 상태로 이어질 KILL/HEAL 추적.
  // { scopeKey, nightDayIndex, targetId, killDone, healDone, healWindowClosed }.
  const [track, setTrack] = useState(null)

  // 범위가 바뀌면(계정 전이·소속 왕복·게임 교체) 이전 신원이 남긴 추적은 더 이상 이 화면의
  // 사실이 아니다.
  useEffect(() => {
    setTrack(null)
  }, [scopeKey])

  // 같은 범위 안에서도 새 밤이 시작되면 지난 밤의 추적은 폐기한다 — 새 밤의 첫 KILL/HEAL이
  // finish될 때 다시 채워진다.
  useEffect(() => {
    if (gameState?.phase !== "NIGHT" || !Number.isInteger(gameState?.dayIndex)) return
    setTrack((prev) => (prev && prev.nightDayIndex === gameState.dayIndex ? prev : null))
  }, [gameState?.phase, gameState?.dayIndex])

  // F-27b(AC-02): DOCTOR의 night_turn_ended가 "이 밤엔 HEAL이 더 오지 않는다"는 유일한 근거다
  // (HEAL_WINDOW_CLOSING_ROLE 주석 참고). useGameSessionSocketEvents와 별개로 이 훅이 직접
  // 구독한다(useInGameKillReveal이 night_result_applied/tribunal_vote_resolved를 독립 구독하는
  // 것과 같은 관례) — 표시 전용 파생이라 canonical nightTurnRole을 건드리지 않는다.
  useEffect(() => {
    if (!socket || typeof socket.on !== "function") return undefined
    const handleNightTurnEnded = (payload) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return
      if (payload.role !== HEAL_WINDOW_CLOSING_ROLE) return
      if (typeof payload.gameId !== "string" || payload.gameId !== gameId) return
      if (!Number.isInteger(payload.dayIndex)) return
      setTrack((prev) => {
        if (!prev || prev.scopeKey !== scopeKey || prev.nightDayIndex !== payload.dayIndex) return prev
        if (prev.healWindowClosed) return prev
        return { ...prev, healWindowClosed: true }
      })
    }
    socket.on("night_turn_ended", handleNightTurnEnded)
    return () => socket.off("night_turn_ended", handleNightTurnEnded)
  }, [socket, gameId, scopeKey])

  /**
   * F-27b(AC-03/AC-08): 표시 완료 보고.
   *
   * 예전에는 완료 범위를 **호출 시점에 새로 읽어** 넘겼다. 그래서 재접속으로 같은 eventId가
   * 복원된 뒤 옛 표시의 ended·reject가 늦게 도착하면, 그 호출이 지금 범위를 들고 와서 **새
   * 기록**을 완료시키고 ACK까지 보냈다(그 화면은 아직 아무것도 보지 못했는데 연출이 사라진다).
   *
   * 이제는 이 사건 객체에 결속된 **수락 당시 범위**만 쓴다. 그 범위가 없거나(이미 완료됐거나
   * 다른 entry의 기록이다) 지금 범위와 한 축이라도 다르면 아무 것도 하지 않는다 — 보고도,
   * 추적 갱신도 없다. 그리고 store가 noop을 돌려준 호출은 **실제 소비가 아니므로** 최종 생존
   * 추적도 건드리지 않는다(중복 보고가 killDone/healDone을 세우지 못한다).
   */
  const finish = useCallback((outcome) => {
    if (!current) return
    const entry = current
    const capturedScope = capturedReceiptScope
    if (capturedScope === null) return

    const auth = useAuthStore.getState()
    const receiptScope = readInGameReceiptScope({
      accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
      identityGeneration: auth.identityGeneration ?? null,
    })
    if (!isSameInGameReceiptScope(capturedScope, receiptScope)) return
    const result = useInGameStore.getState().completeNightSuccess(entry.eventId, capturedScope, outcome)
    if (!result || result.status === "noop") return

    if (NIGHT_SUCCESS_FINAL_STATUS_TYPES.has(entry.type) && scopeKey) {
      const targetId = resolveNightSuccessTargetId(entry, authUuid)
      if (targetId) {
        const isKill = entry.type === "KILL"
        setTrack((prev) => {
          if (prev && prev.scopeKey === scopeKey && prev.nightDayIndex === entry.nightDayIndex
            && prev.targetId === targetId) {
            return { ...prev, killDone: prev.killDone || isKill, healDone: prev.healDone || !isKill }
          }
          return {
            scopeKey,
            nightDayIndex: entry.nightDayIndex,
            targetId,
            killDone: isKill,
            healDone: !isKill,
            healWindowClosed: false,
          }
        })
      }
    }
  }, [current, capturedReceiptScope, scopeKey, authUuid])

  const onClose = useCallback(() => {
    setTrack(null)
  }, [])

  let finalStatus = null
  if (
    track
    && track.scopeKey === scopeKey
    && track.killDone
    && (track.healDone || track.healWindowClosed)
    && queue.length === 0
    && isInGameNightResultReflected(gameState, track.nightDayIndex)
  ) {
    const player = (gameState?.players ?? []).find((p) => p?.uuid === track.targetId) ?? null
    if (player && typeof player.alive === "boolean") {
      finalStatus = { targetId: track.targetId, alive: player.alive }
    }
  }

  return {
    current,
    open: !hold && (current !== null || finalStatus !== null),
    pending: current !== null,
    finish,
    // F-27b(AC-04/AC-05): 사건별 자산 검증 상태. KILL만 실제 영상(kill-animation.mp4)이 있고,
    // 나머지 세 종류는 전용 영상이 없는 동안 항상 PENDING이다 — 임시 연출을 확인해도 이 값은
    // 바뀌지 않는다(임시 연출 확인 ≠ 최종 영상 검증 완료).
    assetStatus: current ? (current.type === "KILL" ? "VERIFIED" : "PENDING") : null,
    finalStatus,
    onClose,
  }
}
