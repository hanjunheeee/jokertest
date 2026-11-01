// 밤 연출 대기 알림 검사·살아 있는지·스냅샷 복원 계획 (순수 계산)
// 인게임 스토어의 대기 알림 받기·스냅샷 반영·스토어 감시가 사용
import { isSameReceiptScope } from "./scope.js"

// 알림 모양 검사: 키는 판·밤 날짜·대기 여부 셋뿐
export function isValidWait(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  const keys = Object.keys(payload)
  if (keys.length !== 3) return false
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return false
  if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return false
  if (typeof payload.waiting !== "boolean") return false
  return true
}

// 대기가 아직 그 판·그 밤에 걸려 있는지
export function isWaitLive(wait, gameId, state) {
  if (wait === null || typeof wait !== "object") return false
  if (!gameId || wait.gameId !== gameId) return false
  if (state?.phase !== "NIGHT") return false
  return state?.dayIndex === wait.nightDayIndex
}

// 스냅샷의 대기 여부로 복원 계획 세우기 (ok:false면 스냅샷 전체를 버림)
export function planWaitRestore(response, candidate, ownerScope, previousWait) {
  // 응답에 대기 키가 없으면: 같은 범위에서 걸어 둔 대기가 살아 있을 때만 유지
  const hasKey = Object.hasOwn(response ?? {}, "presentationWaiting")
  if (!hasKey) {
    if (!isWaitLive(previousWait, candidate?.gameId ?? null, candidate?.state ?? null)) {
      return { ok: true, waiting: false }
    }
    if (!isSameReceiptScope(previousWait.scope, ownerScope)) return { ok: true, waiting: false }
    return { ok: true, waiting: true }
  }
  const waiting = response.presentationWaiting
  if (typeof waiting !== "boolean") return { ok: false }
  if (!waiting) return { ok: true, waiting: false }
  // 대기 중이라고 하면 본인 계정·그 판·밤일 때만 믿음
  if (ownerScope === null || typeof ownerScope !== "object") return { ok: false }
  if (!candidate?.gameId || !candidate?.state) return { ok: false }
  if (candidate.state.phase !== "NIGHT") return { ok: false }
  if (!Number.isInteger(candidate.state.dayIndex) || candidate.state.dayIndex < 0) return { ok: false }
  if (ownerScope.accountId === null || ownerScope.accountId !== (candidate.state.self?.uuid ?? null)) {
    return { ok: false }
  }
  if (ownerScope.gameId !== candidate.gameId) return { ok: false }
  return { ok: true, waiting: true }
}

// 계획대로 대기 조각 만들기
export function buildWaitPatch(waiting, ownerScope, gameId, state) {
  if (!waiting) return { nightPresentationWait: null }
  return {
    nightPresentationWait: Object.freeze({
      gameId: gameId ?? null,
      nightDayIndex: state?.dayIndex ?? null,
      scope: ownerScope,
    }),
  }
}
