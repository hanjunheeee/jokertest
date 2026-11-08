// 신고 창 시험: 누구를 신고할 수 있나·입력 검사·본문·오류 안내, 창 상태(보내기·중복·제한·두 번 막기), 데스크톱 창 그리기
import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true })
for (const [name, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))
mock.module("../../../src/shared/env.js", { namedExports: { API_BASE_URL: "", DISCORD_SUPPORT_URL: undefined } })

const { canReportPlayer, validateReportForm, buildReportBody, resolveReportError, reportKeyOf } =
  await import("../../../src/domains/report/utils/reportForm.js")
const { REPORT_COPY, REPORT_ERROR_MESSAGES, REPORT_ERROR_FALLBACK, REPORT_REASONS } =
  await import("../../../src/domains/report/constants/reportCopy.js")
const { useReportDialog } = await import("../../../src/domains/report/hooks/useReportDialog.js")
const { default: ReportDialog } = await import("../../../src/domains/report/components/ReportDialog.jsx")
const { renderHook, render, act, cleanup, fireEvent } = await import("@testing-library/react")

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const GAME = "33333333-3333-4333-8333-333333333333"
const apiError = (status, code) => Object.assign(new Error(code), { status, code, ok: false })

test.afterEach(() => cleanup())

test("사유 넷(욕설·비매너·부정행위·기타)은 서버 코드와 짝", () => {
  assert.deepEqual(REPORT_REASONS.map((r) => [r.code, r.label]), [["ABUSE", "욕설"], ["GRIEFING", "비매너"], ["CHEATING", "부정행위"], ["ETC", "기타"]])
})

test("신고 버튼: 자기 자신·판 id 없음(미리보기)·uuid 아닌 대상은 안 보임, 대소문자 달라도 나는 나", () => {
  assert.equal(canReportPlayer({ targetUuid: OTHER, selfUuid: ME, gameId: GAME }), true)
  assert.equal(canReportPlayer({ targetUuid: ME, selfUuid: ME, gameId: GAME }), false)
  assert.equal(canReportPlayer({ targetUuid: ME.toUpperCase(), selfUuid: ME, gameId: GAME }), false)
  assert.equal(canReportPlayer({ targetUuid: OTHER, selfUuid: ME, gameId: null }), false)
  assert.equal(canReportPlayer({ targetUuid: "preview-1", selfUuid: ME, gameId: GAME }), false)
})

test("입력 검사·본문: 사유 필수, 기타는 메모 필수, 빈 메모는 안 보냄", () => {
  assert.equal(validateReportForm({ reasonCode: null, memo: "" }), REPORT_COPY.needReason)
  assert.equal(validateReportForm({ reasonCode: "ETC", memo: "  " }), REPORT_COPY.needMemo)
  assert.equal(validateReportForm({ reasonCode: "ABUSE", memo: "x".repeat(501) }), REPORT_COPY.memoTooLong)
  assert.equal(validateReportForm({ reasonCode: "ABUSE", memo: "" }), null)
  assert.deepEqual(buildReportBody({ targetUuid: OTHER, gameId: GAME, reasonCode: "ABUSE", memo: "  " }), { targetUuid: OTHER, gameId: GAME, reasonCode: "ABUSE" })
  assert.deepEqual(buildReportBody({ targetUuid: OTHER, gameId: GAME, reasonCode: "ETC", memo: " 잠수 " }), { targetUuid: OTHER, gameId: GAME, reasonCode: "ETC", memo: "잠수" })
})

test("오류 안내: 중복(신고됨으로 봄)·429 제한·자기 자신·같이 안 한 판·모르는 오류", () => {
  assert.deepEqual(resolveReportError(apiError(409, "DUPLICATE_REPORT")), { message: REPORT_ERROR_MESSAGES.DUPLICATE_REPORT, alreadyReported: true })
  assert.equal(resolveReportError(apiError(429, "RATE_LIMITED")).message, REPORT_ERROR_MESSAGES.RATE_LIMITED)
  assert.equal(resolveReportError({ status: 429 }).message, REPORT_ERROR_MESSAGES.RATE_LIMITED)
  assert.equal(resolveReportError(apiError(400, "SELF_REPORT")).message, REPORT_ERROR_MESSAGES.SELF_REPORT)
  assert.equal(resolveReportError(apiError(404, "GAME_NOT_FOUND")).message, REPORT_ERROR_MESSAGES.GAME_NOT_FOUND)
  assert.equal(resolveReportError(new TypeError("offline")).message, REPORT_ERROR_FALLBACK)
})

const setup = (submit) => renderHook(() => useReportDialog({ gameId: GAME, selfUuid: ME, submit }))

test("창 상태: 나는 못 엶, 사유 없이 보내면 안내만, 보내면 접수 안내·신고됨, 두 번 눌러도 한 번", async () => {
  const sent = []
  let release
  const { result } = setup((body) => { sent.push(body); return new Promise((resolve) => { release = resolve }) })
  act(() => result.current.open({ uuid: ME, nickname: "나" }))
  assert.equal(result.current.isOpen, false)

  act(() => result.current.open({ uuid: OTHER, nickname: "가" }))
  assert.equal(result.current.isOpen, true)
  await act(async () => { await result.current.send() })
  assert.equal(result.current.message, REPORT_COPY.needReason)
  assert.equal(sent.length, 0)

  act(() => result.current.setReason("ABUSE"))
  await act(async () => { result.current.send(); result.current.send() })
  assert.equal(result.current.isSending, true)
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0], { targetUuid: OTHER, gameId: GAME, reasonCode: "ABUSE" })
  await act(async () => { release({ ok: true, reportId: "r1" }) })
  assert.equal(result.current.isDone, true)
  assert.equal(result.current.message, REPORT_COPY.sent)
  assert.equal(result.current.isReported(OTHER), true)
  assert.equal(result.current.isReported(ME), false)
  assert.equal(reportKeyOf(GAME, OTHER.toUpperCase()), reportKeyOf(GAME, OTHER))
})

test("창 상태: 중복은 신고됨으로, 제한은 오류로 남겨 다시 보낼 수 있음, 닫은 뒤 온 답은 버림", async () => {
  let next = () => Promise.reject(apiError(409, "DUPLICATE_REPORT"))
  const { result } = setup(() => next())
  act(() => result.current.open({ uuid: OTHER, nickname: "가" }))
  act(() => result.current.setReason("CHEATING"))
  await act(async () => { await result.current.send() })
  assert.equal(result.current.isDone, true)
  assert.equal(result.current.message, REPORT_ERROR_MESSAGES.DUPLICATE_REPORT)
  assert.equal(result.current.isReported(OTHER), true)

  next = () => Promise.reject(apiError(429, "RATE_LIMITED"))
  act(() => result.current.open({ uuid: OTHER, nickname: "가" }))
  act(() => result.current.setReason("GRIEFING"))
  await act(async () => { await result.current.send() })
  assert.equal(result.current.status, "error")
  assert.equal(result.current.message, REPORT_ERROR_MESSAGES.RATE_LIMITED)
  assert.equal(result.current.isSending, false)

  let release
  next = () => new Promise((resolve) => { release = resolve })
  await act(async () => { result.current.send() })
  act(() => result.current.close())
  await act(async () => { release({ ok: true }) })
  assert.equal(result.current.isOpen, false)
  assert.equal(result.current.message, null)
})

test("데스크톱 신고 창: 대상 이름·사유 고르기·메모·보내기·접수 안내, 닫기", async () => {
  const sent = []
  function Harness() {
    const dialog = useReportDialog({ gameId: GAME, selfUuid: ME, submit: async (body) => { sent.push(body); return { ok: true } } })
    return React.createElement(React.Fragment, null,
      React.createElement("button", { type: "button", onClick: () => dialog.open({ uuid: OTHER, nickname: "가면" }) }, "열기"),
      React.createElement(ReportDialog, { dialog }))
  }
  const view = render(React.createElement(Harness))
  assert.equal(document.querySelector('[data-testid="report-dialog"]'), null)
  fireEvent.click(view.getByText("열기"))
  assert.equal(document.querySelector('[data-testid="report-target"]').textContent, "가면")
  fireEvent.click(view.getByRole("radio", { name: "기타" }))
  fireEvent.click(document.querySelector('[data-testid="report-submit"]'))
  assert.equal(document.querySelector('[data-testid="report-message"]').textContent, REPORT_COPY.needMemo)
  fireEvent.change(view.getByRole("textbox", { name: REPORT_COPY.memoLabel }), { target: { value: "계속 방해" } })
  await act(async () => { fireEvent.click(document.querySelector('[data-testid="report-submit"]')) })
  assert.deepEqual(sent, [{ targetUuid: OTHER, gameId: GAME, reasonCode: "ETC", memo: "계속 방해" }])
  assert.equal(document.querySelector('[data-testid="report-message"]').textContent, REPORT_COPY.sent)
  assert.equal(document.querySelector('[data-testid="report-submit"]'), null)
  fireEvent.click(document.querySelector('[data-testid="report-cancel"]'))
  assert.equal(document.querySelector('[data-testid="report-dialog"]'), null)
})
