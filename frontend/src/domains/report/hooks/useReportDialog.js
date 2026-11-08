// 신고 창 상태: 대상 열기·사유·메모·보내기(두 번 막기)·결과 안내·신고됨 표시
// 데스크톱 전적 목록·결과 참가자 목록, 모바일 전적 시트·결과 목록이 씀
import { useRef, useState } from "react"
import { reportApi } from "../api/report.api.js"
import { REPORT_COPY } from "../constants/reportCopy.js"
import { buildReportBody, canReportPlayer, reportKeyOf, resolveReportError, validateReportForm } from "../utils/reportForm.js"

const EMPTY = { target: null, reasonCode: null, memo: "", status: "editing", message: null }

// gameId·selfUuid는 지금 판·나, submit은 시험이 갈아끼움
export function useReportDialog({ gameId, selfUuid, submit = reportApi.submit }) {
  const [form, setForm] = useState(EMPTY)
  const [reported, setReported] = useState(() => new Set())
  const sendingRef = useRef(false)
  // 보내는 사이 창을 닫거나 다른 대상을 열면 늦게 온 답은 버림
  const openTokenRef = useRef(0)

  const canReport = (targetUuid) => canReportPlayer({ targetUuid, selfUuid, gameId })
  const isReported = (targetUuid) => Boolean(gameId) && reported.has(reportKeyOf(gameId, targetUuid))

  // target = { uuid, nickname }
  const open = (target) => {
    if (!target || !canReport(target.uuid)) return
    openTokenRef.current += 1
    sendingRef.current = false
    setForm({ ...EMPTY, target })
  }
  const close = () => {
    openTokenRef.current += 1
    sendingRef.current = false
    setForm(EMPTY)
  }
  const setReason = (reasonCode) => setForm((prev) => (prev.status === "sending" ? prev : { ...prev, reasonCode, message: null, status: "editing" }))
  const setMemo = (memo) => setForm((prev) => (prev.status === "sending" ? prev : { ...prev, memo, message: null, status: "editing" }))

  const send = async () => {
    const { target, reasonCode, memo } = form
    if (!target || sendingRef.current || form.status === "sent") return
    const invalid = validateReportForm({ reasonCode, memo })
    if (invalid) { setForm((prev) => ({ ...prev, status: "error", message: invalid })); return }
    const token = openTokenRef.current
    const key = reportKeyOf(gameId, target.uuid)
    sendingRef.current = true
    setForm((prev) => ({ ...prev, status: "sending", message: null }))
    try {
      await submit(buildReportBody({ targetUuid: target.uuid, gameId, reasonCode, memo }))
      if (token !== openTokenRef.current) return
      setReported((prev) => new Set(prev).add(key))
      setForm((prev) => ({ ...prev, status: "sent", message: REPORT_COPY.sent }))
    } catch (error) {
      if (token !== openTokenRef.current) return
      const { message, alreadyReported } = resolveReportError(error)
      if (alreadyReported) setReported((prev) => new Set(prev).add(key))
      setForm((prev) => ({ ...prev, status: alreadyReported ? "sent" : "error", message }))
    } finally {
      if (token === openTokenRef.current) sendingRef.current = false
    }
  }

  return {
    ...form,
    isOpen: form.target !== null,
    isSending: form.status === "sending",
    isDone: form.status === "sent",
    canReport, isReported, open, close, setReason, setMemo, send,
  }
}
