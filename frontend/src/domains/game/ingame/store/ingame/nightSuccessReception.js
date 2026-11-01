// 밤 성공 연출 받기 판단·스냅샷 복구 계획과 장부 기록
// 밤 결과(실시간)·스냅샷(복구)·투표 결과(밤 들어설 때 비움) 액션이 사용
import { NIGHT_SUCCESS_RESTORE_CONTEXT } from "../../constants/store/ingameStore.js"
import { readSelfMembershipId } from "../../utils/store/scope.js"
import {
  buildQueueEntry,
  entersNewNight,
  isSuccessWindowOpen,
  isValidSuccess,
} from "../../utils/store/nightSuccess.js"
import { clearQueue, records } from "./nightSuccessRecords.js"
import { isReceiptCurrent } from "./receiptScope.js"

// 거절 결과는 하나만 만들어 같이 씀
const REJECT = Object.freeze({ status: "REJECT" })

// 알림 하나를 받을지 판단: 받기·중복·거절 (restore가 있으면 복구로 보고 연결 검사는 건너뜀)
export function prepareReception(candidate, payload, receiptScope, known, restore = null) {
  // 알림 모양·판·받을 수 있는 시점
  if (!isValidSuccess(payload)) return REJECT
  if (!candidate?.gameId || !candidate?.state) return REJECT
  if (payload.gameId !== candidate.gameId) return REJECT
  if (!isSuccessWindowOpen(candidate.state, payload.nightDayIndex, restore)) return REJECT

  // 받은 범위가 본인 계정·그 판·지금 소속인지
  if (receiptScope === null || typeof receiptScope !== "object") return REJECT
  const selfUuid = candidate.state.self?.uuid ?? null
  if (receiptScope.accountId === null || receiptScope.accountId !== selfUuid) return REJECT
  if (receiptScope.gameId !== candidate.gameId) return REJECT
  if (receiptScope.membershipId !== readSelfMembershipId(candidate.state)) return REJECT

  // 실시간이면 연결까지 지금 그대로여야 함
  if (restore === null) {
    if (!isReceiptCurrent(receiptScope, candidate)) return REJECT
  }
  // 이미 받은 사건이면 중복
  if (known.has(payload.eventId)) return { status: "DUPLICATE" }

  const entry = buildQueueEntry(payload)
  return {
    status: "ACCEPT",
    entry,
    record: { scope: receiptScope, entry, completed: false, ackStatus: "pending" },
  }
}

// 스냅샷의 복구 목록으로 붙일 항목 고르기 (하나라도 거절이면 ok:false로 스냅샷 전체를 버림)
export function planRecovery(response, candidate, receiptScope, knownEventIds) {
  // 목록이 없거나 비면 붙일 것 없음, 배열이 아니거나 범위가 없으면 거절
  if (!Object.hasOwn(response ?? {}, "nightSuccessRecovery")) return { ok: true, entries: [] }
  const raw = response.nightSuccessRecovery
  if (!Array.isArray(raw)) return { ok: false }
  if (raw.length === 0) return { ok: true, entries: [] }
  if (receiptScope === null || typeof receiptScope !== "object") return { ok: false }

  // 목록 안에서 겹치는 것도 건너뜀
  const seen = new Set(knownEventIds)
  const entries = []
  for (const payload of raw) {
    const prepared = prepareReception(candidate, payload, receiptScope, seen, NIGHT_SUCCESS_RESTORE_CONTEXT)
    if (prepared.status === "REJECT") return { ok: false }
    if (prepared.status === "DUPLICATE") continue
    seen.add(prepared.entry.eventId)
    entries.push(prepared.entry)
  }
  return { ok: true, entries }
}

// 고른 복구 항목을 장부에 적고 대기열 뒤에 붙인 조각 돌려줌
export function commitRecovery(entries, ownerScope, baseQueue) {
  if (entries.length === 0) return {}
  for (const entry of entries) {
    records.set(entry.eventId, {
      scope: ownerScope, entry, completed: false, ackStatus: "pending",
    })
  }
  return { nightSuccessQueue: [...baseQueue, ...entries] }
}

// 새 밤에 들어서면 대기열 비우는 조각 (아니면 빈 조각)
export function clearOnNightEntry(before, after) {
  if (!entersNewNight(before, after)) return {}
  return clearQueue()
}
