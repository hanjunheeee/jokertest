// 모바일 신고 창 시험: 대상 이름·사유·메모·보내기·제한 안내 뒤 다시 보내기, 줄 버튼 신고됨 잠김
import "../helpers/mobileLoader.mjs"
import { React, render, act } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

const { useReportDialog } = await import("@/domains/report/hooks/useReportDialog.js")
const { REPORT_COPY, REPORT_ERROR_MESSAGES } = await import("@/domains/report/constants/reportCopy.js")
const { default: ReportSheet } = await import("@m/domains/report/ReportSheet.jsx")
const { default: ReportRowButton } = await import("@m/domains/report/ReportRowButton.jsx")

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const GAME = "33333333-3333-4333-8333-333333333333"
const q = (id) => document.querySelector(`[data-testid="${id}"]`)
const click = async (node) => { await act(async () => { node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })) }) }

test("모바일 신고 창: 사유 골라 보내기, 제한(429)은 경고로 남고 다시 보내면 접수", async () => {
    const sent = []
    let reply = () => Promise.reject(Object.assign(new Error("x"), { status: 429, code: "RATE_LIMITED" }))
    let dialogRef
    function Harness() {
        const dialog = useReportDialog({ gameId: GAME, selfUuid: ME, submit: (body) => { sent.push(body); return reply() } })
        dialogRef = dialog
        return React.createElement(ReportSheet, { dialog })
    }
    const view = render(React.createElement(Harness))
    assert.equal(q("report-sheet"), null)
    act(() => dialogRef.open({ uuid: OTHER, nickname: "가면" }))
    assert.equal(q("report-target").textContent, "가면")
    const abuse = [...document.querySelectorAll('[role="radio"]')].find((node) => node.textContent === "욕설")
    await click(abuse)
    assert.equal(abuse.getAttribute("aria-checked"), "true")
    await click(q("report-submit"))
    assert.equal(q("report-message").textContent, REPORT_ERROR_MESSAGES.RATE_LIMITED)
    assert.equal(q("report-message").getAttribute("role"), "alert")
    reply = () => Promise.resolve({ ok: true })
    await click(q("report-submit"))
    assert.equal(sent.length, 2)
    assert.equal(q("report-message").textContent, REPORT_COPY.sent)
    assert.equal(q("report-submit"), null)
    view.unmount()
})

test("모바일 줄 신고 버튼: 신고됨이면 잠기고 글자 바뀜", () => {
    const view = render(React.createElement(ReportRowButton, { name: "가면", done: true, onClick: () => {} }))
    const button = q("report-row-button")
    assert.equal(button.disabled, true)
    assert.equal(button.getAttribute("aria-label"), `가면 ${REPORT_COPY.rowDoneLabel}`)
    view.unmount()
})
