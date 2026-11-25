// 모바일 양피지 확인·알림 창 시험(합친 화면): 겹 순서 z-[140]/z-[141]로 맨 위(사망 창 68·광고 120·점검 130보다 위), 확인 → 참·취소/배경 → 거짓, 알림은 차례로 한 개씩
// 목록 A09 모바일 A09-M-601~604, 2026-11-24 되돌린 화면(baa5c898) + toParchmentHostLayer에 맞춘 새 시험 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-m6-parchment-dialogs.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { click, flush, textOf } from "./a00-kit.mjs"

const { default: ParchmentConfirmHost } = await import("@m/shared/ui/modal/parchment/ParchmentConfirmHost.jsx")
const { default: ParchmentAlertHost } = await import("@m/shared/ui/modal/parchment/ParchmentAlertHost.jsx")
const { installParchmentConfirm, getParchmentConfirmState, resolveParchmentConfirm } = await import("@m/shared/ui/modal/parchment/parchmentConfirm.js")
const { showParchmentAlert, dismissParchmentAlert, getParchmentAlertMessage } = await import("@m/shared/ui/modal/parchment/parchmentAlert.js")
const { appConfirm, setAppConfirmHandler } = await import("@/shared/utils/appConfirm.js")

let view = null
afterEach(() => {
    view?.unmount()
    view = null
    while (getParchmentConfirmState() !== null) resolveParchmentConfirm(false)
    while (getParchmentAlertMessage() !== null) dismissParchmentAlert()
    setAppConfirmHandler(null)
    try { window.sessionStorage.clear() } catch { /* 저장소 막힘 무시 */ }
    document.body.innerHTML = ""
})

// 클래스 낱말 목록 → z 값들 (예: "fixed inset-0 z-[140]" → ["z-[140]"])
const zOf = (el) => String(el.getAttribute("class")).split(/\s+/).filter((t) => /^z-/.test(t))
const zNumber = (token) => Number(token.replace(/^z-\[?/, "").replace(/\]$/, ""))

// 양피지 창 한 벌의 덮개(누르면 닫힘)·감싸개 겹 값 확인
function assertTopLayer(root) {
    const backdrop = root.querySelector(":scope > button")
    const wrap = root.querySelector(":scope > div")
    assert.ok(Boolean(backdrop && wrap), "덮개·감싸개가 없음")
    assert.deepEqual(zOf(backdrop), ["z-[140]"], `덮개 겹: ${backdrop.getAttribute("class")}`)
    assert.deepEqual(zOf(wrap), ["z-[141]"], `감싸개 겹: ${wrap.getAttribute("class")}`)
    // 덮개는 화면 기준(fixed), 감싸개는 원래 값이 "pointer-events-none absolute …"로 시작해 absolute 그대로 (겹 값만 바뀜)
    assert.ok(backdrop.classList.contains("fixed"), "덮개가 화면 기준(fixed)이 아님")
    assert.ok(wrap.classList.contains("absolute"), "감싸개 자리 잡기가 바뀜")
    // 판 안 겹 창들(사망 선택 68·추방 70·광고 120·점검 130)보다 위
    for (const token of [...zOf(backdrop), ...zOf(wrap)]) assert.ok(zNumber(token) > 130, `${token}이 점검 창(130)보다 아래`)
}

// 확인 창을 띄우고 답 약속을 { answer }로 돌려줌 (약속을 그대로 돌려주면 async 함수가 답까지 기다려 멈춤)
async function askConfirm(message) {
    installParchmentConfirm()
    view = render(React.createElement(ParchmentConfirmHost))
    let answer
    await act(async () => { answer = appConfirm(message) })
    await flush(2)
    return { answer }
}
const confirmRoot = () => document.querySelector("[data-parchment-confirm]")
const confirmButton = (label) => [...(confirmRoot()?.querySelectorAll('[role="alertdialog"] button') ?? [])].find((b) => textOf(b) === label) ?? null

test("A09-M-601 앱 확인 창(appConfirm) → 양피지 확인 창(role=alertdialog '확인')에 글 그대로, 덮개 z-[140]·감싸개 z-[141]로 맨 위", async () => {
    const { answer } = await askConfirm("방을 삭제하면 모든 참가자가 나가게 됩니다.\n삭제하시겠습니까?")
    const root = confirmRoot()
    assert.ok(root !== null, "확인 창이 안 뜸")
    const dialog = root.querySelector('[role="alertdialog"]')
    assert.equal(dialog.getAttribute("aria-label"), "확인")
    assert.equal(dialog.querySelector("p").textContent, "방을 삭제하면 모든 참가자가 나가게 됩니다.\n삭제하시겠습니까?")
    assertTopLayer(root)
    assert.ok(Boolean(confirmButton("확인") && confirmButton("취소")), "확인·취소 단추가 없음")
    click(confirmButton("확인"))
    assert.equal(await answer, true)
})

test("A09-M-602 확인 창 '취소' → 거짓으로 답하고 닫힘, 다시 띄워 덮개를 누르면 → 거짓", async () => {
    const { answer: first } = await askConfirm("나가시겠습니까?")
    click(confirmButton("취소"))
    assert.equal(await first, false)
    await flush(2)
    assert.ok(confirmRoot() === null, "취소했는데 창이 남음")
    let second
    await act(async () => { second = appConfirm("다시 묻습니다") })
    await flush(2)
    click(confirmRoot().querySelector(":scope > button"))
    assert.equal(await second, false)
})

test("A09-M-603 양피지 알림 창(role=alertdialog '안내') → 덮개 z-[140]·감싸개 z-[141]로 맨 위, '확인' 누르면 닫힘", async () => {
    view = render(React.createElement(ParchmentAlertHost))
    act(() => { showParchmentAlert("서버 연결을 확인할 수 없습니다.") })
    await flush(2)
    const root = document.querySelector("[data-parchment-alert]")
    assert.ok(root !== null, "알림 창이 안 뜸")
    const dialog = root.querySelector('[role="alertdialog"]')
    assert.equal(dialog.getAttribute("aria-label"), "안내")
    assert.equal(textOf(dialog.querySelector("p")), "서버 연결을 확인할 수 없습니다.")
    assertTopLayer(root)
    const ok = [...dialog.querySelectorAll("button")].find((b) => textOf(b) === "확인")
    assert.ok(Boolean(ok), "확인 단추가 없음")
    click(ok)
    await flush(2)
    assert.ok(document.querySelector("[data-parchment-alert]") === null, "확인했는데 알림이 남음")
})

test("A09-M-604 알림 두 개가 잇달아 옴 → 한 번에 하나, 첫 알림을 닫으면 둘째가 뜸", async () => {
    view = render(React.createElement(ParchmentAlertHost))
    act(() => {
        showParchmentAlert("첫째 안내")
        showParchmentAlert("둘째 안내")
    })
    await flush(2)
    const text = () => textOf(document.querySelector('[data-parchment-alert] [role="alertdialog"] p'))
    assert.equal(document.querySelectorAll("[data-parchment-alert]").length, 1)
    assert.equal(text(), "첫째 안내")
    click([...document.querySelectorAll('[data-parchment-alert] [role="alertdialog"] button')].find((b) => textOf(b) === "확인"))
    await flush(2)
    assert.equal(text(), "둘째 안내")
})
