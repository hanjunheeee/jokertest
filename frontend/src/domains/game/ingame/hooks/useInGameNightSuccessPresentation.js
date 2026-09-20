import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import {
  getInGameIdentityScopeVersion,
  readInGameReceiptScope,
  selectNightSuccessQueue,
  subscribeInGameIdentityScope,
  useInGameStore,
} from "../store/ingameStore.js"

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
 * finalStatus는 KILL·HEAL이 이 밤에 대해 이 대상(targetId — USER 관점의 targetId 또는 TARGET
 * 관점의 본인)으로 최소 한 번 finish된 뒤, 큐가 완전히 비고 같은 밤의 night_result_applied가
 * canonical roster에 반영됐을 때만 켜진다. 연출 자체(KILL·HEAL 표시)는 alive를 조금도 바꾸지
 * 않는다 — 최종 생존은 오직 roster에서만 읽는다(A-02).
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

  const current = queue[0] ?? null

  const scopeKey = gameId && authUuid
    ? `${gameId}|${authUuid}|${identityGeneration}|${identityScopeVersion}`
    : null

  // F-27b(AC-02): 최종 상태로 이어질 KILL/HEAL 추적. { scopeKey, nightDayIndex, targetId }.
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

  const finish = useCallback((outcome) => {
    if (!current) return
    const entry = current

    const auth = useAuthStore.getState()
    const receiptScope = readInGameReceiptScope({
      accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
      identityGeneration: auth.identityGeneration ?? null,
    })
    useInGameStore.getState().completeNightSuccess(entry.eventId, receiptScope, outcome)

    if (NIGHT_SUCCESS_FINAL_STATUS_TYPES.has(entry.type) && scopeKey) {
      const targetId = resolveNightSuccessTargetId(entry, authUuid)
      if (targetId) {
        setTrack({ scopeKey, nightDayIndex: entry.nightDayIndex, targetId })
      }
    }
  }, [current, scopeKey, authUuid])

  const onClose = useCallback(() => {
    setTrack(null)
  }, [])

  let finalStatus = null
  if (
    track
    && track.scopeKey === scopeKey
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
