// 문의 창 상태: 내 문의 목록 불러오기·문의 하나 보기·쓰기 폼(검사·보내기·두 번 막기)·보이는 칸 고르기
// 데스크톱 InquiryWindow·모바일 InquirySheet가 씀, api는 시험이 갈아끼움
import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildInquiryBody, INQUIRY_COPY, inquiryApi, resolveInquiryError, validateInquiryForm,
} from "../api/inquiry.api.js"

const EMPTY_FORM = { category: null, title: "", body: "", status: "editing", message: null }

// 목록에 넣을 줄 모양만 남김 (본문·답은 상세에서만)
// 예) { id: 3, category: "BUG", title: "멈춤", body: "…", status: "OPEN", createdAt: "…" } → { id: 3, category: "BUG", title: "멈춤", status: "OPEN", createdAt: "…", answeredAt: null }
const toSummary = (inquiry) => ({
  id: inquiry.id,
  category: inquiry.category,
  title: inquiry.title,
  status: inquiry.status ?? "OPEN",
  createdAt: inquiry.createdAt ?? null,
  answeredAt: inquiry.answeredAt ?? null,
})

// 내 문의 목록: 창이 열리거나 다시 불러오기를 누르면 받음, 닫힌 뒤 늦게 온 답은 버림
function useInquiryList(open, api) {
  const [list, setList] = useState({ status: "loading", items: [] })
  const [reloadSignal, setReloadSignal] = useState(0)

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    api.list().then(
      (res) => { if (alive) setList({ status: "ready", items: Array.isArray(res?.inquiries) ? res.inquiries : [] }) },
      () => { if (alive) setList((prev) => ({ status: "error", items: prev.items })) },
    )
    return () => { alive = false }
  }, [open, reloadSignal, api])

  const reloadList = useCallback(() => {
    setList((prev) => ({ status: "loading", items: prev.items }))
    setReloadSignal((n) => n + 1)
  }, [])

  // 방금 보낸 문의는 다시 안 받고 맨 위에 끼움
  const prependItem = useCallback((inquiry) => {
    setList((prev) => ({
      status: "ready",
      items: [toSummary(inquiry), ...prev.items.filter((item) => item.id !== inquiry.id)],
    }))
  }, [])

  return { list, reloadList, prependItem }
}

// 문의 하나: 고른 id 받기, 다른 것을 고르면 앞 요청 답은 버림
function useInquiryDetail(api) {
  const [detail, setDetail] = useState(null)
  const tokenRef = useRef(0)

  const loadDetail = useCallback(async (id) => {
    const token = ++tokenRef.current
    try {
      const res = await api.get(id)
      if (token !== tokenRef.current) return
      if (!res?.inquiry) throw Object.assign(new Error("not found"), { status: 404 })
      setDetail({ id, status: "ready", inquiry: res.inquiry, message: null })
    } catch (error) {
      if (token !== tokenRef.current) return
      setDetail({ id, status: "error", inquiry: null, message: resolveInquiryError(error) })
    }
  }, [api])

  const startDetail = useCallback((id) => {
    setDetail({ id, status: "loading", inquiry: null, message: null })
    loadDetail(id)
  }, [loadDetail])

  const dropDetail = useCallback(() => { tokenRef.current += 1 }, [])

  return { detail, setDetail, loadDetail, startDetail, dropDetail }
}

// 쓰기 폼: 검사 → 보내기(보내는 중엔 또 안 감) → 성공이면 onSent(문의)
function useInquiryForm(api, onSent) {
  const [form, setForm] = useState(EMPTY_FORM)
  const sendingRef = useRef(false)

  const edit = (key) => (value) =>
    setForm((prev) => (prev.status === "sending" ? prev : { ...prev, [key]: value, status: "editing", message: null }))

  const send = async () => {
    if (sendingRef.current) return
    const invalid = validateInquiryForm(form)
    if (invalid) { setForm((prev) => ({ ...prev, status: "error", message: invalid })); return }
    sendingRef.current = true
    setForm((prev) => ({ ...prev, status: "sending", message: null }))
    try {
      const res = await api.create(buildInquiryBody(form))
      setForm(EMPTY_FORM)
      onSent(res?.inquiry)
    } catch (error) {
      setForm((prev) => ({ ...prev, status: "error", message: resolveInquiryError(error) }))
    } finally {
      sendingRef.current = false
    }
  }

  return {
    form,
    setCategory: edit("category"),
    setTitle: edit("title"),
    setBody: edit("body"),
    send,
    isSending: form.status === "sending",
  }
}

// open = 창 열림, targetId = 알림에서 온 문의 id (있으면 바로 그 문의를 엶)
export function useInquiries({ open, targetId = null, api = inquiryApi }) {
  const [view, setView] = useState(targetId ? "detail" : "list")
  const [notice, setNotice] = useState(null)
  const { list, reloadList, prependItem } = useInquiryList(open, api)
  const { detail, setDetail, loadDetail, startDetail, dropDetail } = useInquiryDetail(api)

  // 열 때·알림 대상이 바뀔 때 보이는 칸을 맞춤 (effect 안 setState 대신 그리는 중에 바뀜을 보고 맞춤)
  const openKey = open ? `open|${targetId ?? ""}` : "closed"
  const [seenKey, setSeenKey] = useState("closed")
  if (seenKey !== openKey) {
    setSeenKey(openKey)
    if (open) {
      setNotice(null)
      setView(targetId ? "detail" : "list")
      setDetail(targetId ? { id: targetId, status: "loading", inquiry: null, message: null } : null)
    }
  }

  // 알림에서 온 문의는 열리자마자 받음 (setState는 받은 뒤에만)
  useEffect(() => {
    if (open && targetId) loadDetail(targetId)
  }, [open, targetId, loadDetail])

  const onSent = useCallback((inquiry) => {
    if (inquiry) prependItem(inquiry)
    else reloadList()
    setNotice(INQUIRY_COPY.sent)
    setView("list")
  }, [prependItem, reloadList])
  const formState = useInquiryForm(api, onSent)

  const showList = useCallback(() => { dropDetail(); setView("list") }, [dropDetail])
  const showForm = useCallback(() => { dropDetail(); setNotice(null); setView("form") }, [dropDetail])
  const openDetail = useCallback((id) => { setNotice(null); setView("detail"); startDetail(id) }, [startDetail])

  return { view, notice, list, reloadList, detail, openDetail, showList, showForm, ...formState }
}
