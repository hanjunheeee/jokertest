// 밤 결과 연출 액션 묶음: 개인 결과·성공 연출 받기와 끝맺음·연출 대기 받기
// 입구 파일이 create 할 때 펼쳐 씀, 끝맺음 확인은 socket/night.js로 보냄
import { getSocket } from "../../../../../shared/socket/socketClient.js"
import {
  CLEARED_NIGHT_PRIVATE_RESULT,
  EMPTY_NIGHT_SUCCESS_QUEUE,
  NIGHT_SUCCESS_OUTCOMES,
} from "../../constants/store/ingameStore.js"
import { isSameReceiptScope, readSelfMembershipId } from "../../utils/store/scope.js"
import { isValidWait } from "../../utils/store/nightPresentationWait.js"
import { emitNightSuccessAck } from "../../socket/night.js"
import { records } from "./nightSuccessRecords.js"
import { prepareReception } from "./nightSuccessReception.js"
import { isReceiptCurrent } from "./receiptScope.js"

export const nightResultActions = (set) => ({
  // 밤 개인 결과 넣기 (지금 판 것만)
  setNightPrivateResult: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (!current.gameId || parsed.gameId !== current.gameId) return current
      return { nightPrivateResult: parsed }
    }),

  clearNightPrivateResult: () =>
    set((current) => (current.nightPrivateResult === null ? current : CLEARED_NIGHT_PRIVATE_RESULT)),

  // 밤 성공 연출 받기 (받기 판단을 통과한 것만 장부에 적고 대기열 뒤에 붙임)
  receiveNightSuccess: (payload, receiptScope = null) =>
    set((current) => {
      const prepared = prepareReception(current, payload, receiptScope, records)
      if (prepared.status !== "ACCEPT") return current

      records.set(prepared.entry.eventId, prepared.record)
      return { nightSuccessQueue: [...current.nightSuccessQueue, prepared.entry] }
    }),

  // 연출 대기 알림 받기 (그 판·그 밤, 본인 계정·지금 소속·지금 연결에서 받은 것만)
  receiveNightPresentationWait: (payload, receiptScope = null) =>
    set((current) => {
      if (!isValidWait(payload)) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (current.state.dayIndex !== payload.nightDayIndex) return current
      if (receiptScope === null || typeof receiptScope !== "object") return current
      if (receiptScope.accountId === null || receiptScope.accountId !== (current.state.self?.uuid ?? null)) {
        return current
      }
      if (receiptScope.gameId !== current.gameId) return current
      if (receiptScope.membershipId !== readSelfMembershipId(current.state)) return current
      if (!isReceiptCurrent(receiptScope, current)) return current

      // 대기 끝 알림이면 지우기만
      if (!payload.waiting) {
        return current.nightPresentationWait === null ? current : { nightPresentationWait: null }
      }
      // 같은 판·밤·범위로 이미 걸려 있으면 그대로
      const existing = current.nightPresentationWait
      if (existing !== null
        && existing.gameId === payload.gameId
        && existing.nightDayIndex === payload.nightDayIndex
        && isSameReceiptScope(existing.scope, receiptScope)) {
        return current
      }
      return {
        nightPresentationWait: Object.freeze({
          gameId: payload.gameId,
          nightDayIndex: payload.nightDayIndex,
          scope: receiptScope,
        }),
      }
    }),

  // 밤 성공 연출 끝맺음: 대기열에서 빼고 서버에 다 봤다고 알림
  // 같은 범위에서 받은 기록만, 한 번만 끝냄
  completeNightSuccess: (eventId, receiptScope = null, outcome = "COMPLETED") => {
    if (!NIGHT_SUCCESS_OUTCOMES.has(outcome)) return { status: "noop" }
    const record = records.get(eventId)
    if (!record || record.completed) return { status: "noop" }
    if (receiptScope === null || typeof receiptScope !== "object") return { status: "noop" }
    if (!isSameReceiptScope(record.scope, receiptScope)) return { status: "noop" }

    // 지금 범위일 때만 대기열에서 뺌
    let removed = false
    set((current) => {
      if (!isReceiptCurrent(receiptScope, current)) return current
      const filtered = current.nightSuccessQueue.filter((item) => item.eventId !== eventId)
      if (filtered.length === current.nightSuccessQueue.length) return current
      removed = true
      return { nightSuccessQueue: filtered.length === 0 ? EMPTY_NIGHT_SUCCESS_QUEUE : filtered }
    })
    if (!removed) return { status: "noop" }
    if (records.get(eventId) !== record) return { status: "noop" }

    record.completed = true

    // 소켓이 없거나 보내다 터지면 보내기 실패로 적음
    const socket = getSocket()
    if (!socket || typeof socket.emit !== "function") {
      record.ackStatus = "send_failed"
      return { status: "send_failed" }
    }
    try {
      emitNightSuccessAck(
        socket,
        {
          gameId: record.entry.gameId,
          nightDayIndex: record.entry.nightDayIndex,
          eventId: record.entry.eventId,
          ...(outcome === "ERROR" || outcome === "SKIPPED" ? { outcome } : {}),
        },
        (response) => {
          if (records.get(eventId) !== record) return
          record.ackStatus = response && typeof response === "object" && response.ok === true ? "accepted" : "rejected"
        },
      )
    } catch {
      record.ackStatus = "send_failed"
      return { status: "send_failed" }
    }
    return { status: "sent" }
  },
})
