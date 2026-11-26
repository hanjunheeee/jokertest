// 모바일 대기방 추방 시험: 방 확인 전 잠금·까닭 글, 줄 단추 한 번에 즉시 추방, 확인 상자 없음, 보내는 중 결과 확인 숨김
// 목록 A01b 모바일 A01-M-501~505 검증용 시험 파일
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, buttonsNamed, click, textOf } from "./a00-kit.mjs"

const { default: HostActions } = await import("@m/domains/game/matching/components/layout/HostActions.jsx")
const { default: KickSheet } = await import("@m/domains/game/matching/components/kick/KickSheet.jsx")
const { default: KickStatus } = await import("@m/domains/game/matching/components/kick/KickStatus.jsx")

let view = null
afterEach(() => { view?.unmount(); view = null })

// 5명 대기방에서 방장 빼고 4명 추방 대상 목록
const TARGETS = ["나", "다", "라", "마"].map((nickname, i) => ({ uuid: `u${i + 1}`, membershipId: `m${i + 1}`, nickname }))

// 추방 창이 받는 값 묶음 생성
function kickPage(extra = {}) {
    const sent = []
    return {
        sent,
        page: {
            kickModalOpen: true, closeKickModal: () => {}, kickTargets: TARGETS, kickPendingTarget: null,
            kickStatus: "IDLE", kickErrorCode: null, isKicking: false, canLookupKickResult: false,
            isAwaitingKickResolution: false, requestKickConfirm: (p) => sent.push(p.nickname), lookupKickResult: () => {},
            ...extra,
        },
    }
}

test("A01-M-501 방 확인 전 방장: 추방 단추 꺼짐 + kickLockedReason 글·title 표시, 확인 후 켜지고 까닭 글 사라짐", () => {
    const reason = "서버와 연결되어 있지 않아 추방할 수 없습니다."
    view = render(React.createElement(HostActions, {
        visible: true, hidden: false, canEditSettings: false, isKickHost: true, canKick: false,
        kickLockedReason: reason, onOpenSettings: () => {}, onOpenKickModal: () => {},
    }))
    const kick = [...view.container.querySelectorAll("button")].find((b) => /추방/.test(textOf(b)))
    assert.ok(kick, `추방 단추가 없음: ${buttonNames(view.container).join(" | ")}`)
    assert.equal(kick.disabled, true, "확인 전인데 추방 단추가 켜짐")
    assert.equal(kick.getAttribute("title"), reason)
    const note = view.container.querySelector('[data-testid="kick-locked-reason"]')
    assert.ok(note, "추방 잠김 까닭 글 칸이 없음")
    assert.equal(textOf(note), reason)
    assert.equal(kick.getAttribute("aria-describedby"), note.id)

    view.rerender(React.createElement(HostActions, {
        visible: true, hidden: false, canEditSettings: true, isKickHost: true, canKick: true,
        kickLockedReason: null, onOpenSettings: () => {}, onOpenKickModal: () => {},
    }))
    const ready = [...view.container.querySelectorAll("button")].find((b) => /추방/.test(textOf(b)))
    assert.equal(ready.disabled, false)
    assert.equal(ready.getAttribute("title"), null)
    assert.equal(view.container.querySelector('[data-testid="kick-locked-reason"]'), null)
})

test("A01-M-502 [버그 7] 줄의 '추방' 한 번 = 바로 보냄, 보내는 중에도 kick-confirm 확인 칸·'취소' 없음", () => {
    const { page } = kickPage({ kickPendingTarget: TARGETS[1], kickStatus: "SENDING", isKicking: true })
    view = render(React.createElement(KickSheet, { page }))
    const dialog = document.querySelector('[data-testid="kick-sheet"]')
    assert.ok(dialog, "추방 창이 없음")
    assert.equal(dialog.querySelector('[data-testid="kick-confirm"]'), null, "옛 2차 확인 칸이 남아 있음")
    assert.equal(buttonsNamed("취소", dialog).length, 0, "'취소' 단추가 있음")

    const fresh = kickPage()
    view.rerender(React.createElement(KickSheet, { page: fresh.page }))
    const rowKick = buttonsNamed("추방", dialog)
    assert.equal(rowKick.length, 4, "대상 4명 줄의 추방 단추 수가 다름")
    click(rowKick[1])
    assert.deepEqual(fresh.sent, ["다"], "한 번 눌렀는데 보낸 대상이 다름")
})

test("A01-M-503 [버그 7] 실패 + ALREADY_LEFT → kick-error '이미 방에서 나간 참가자입니다.'", () => {
    view = render(React.createElement(KickStatus, { status: "FAILED", errorCode: "ALREADY_LEFT", canLookupResult: false, isAwaitingResolution: false, onLookupResult: () => {} }))
    const err = view.container.querySelector('[data-testid="kick-error"]')
    assert.ok(err, "실패 글이 없음")
    assert.equal(textOf(err), "이미 방에서 나간 참가자입니다.")
    assert.equal(err.getAttribute("role"), "alert")
})

test("A01-M-504 혼자 있는 방: 대상 0 → '추방할 수 있는 참가자가 없습니다.'", () => {
    const { page } = kickPage({ kickTargets: [] })
    view = render(React.createElement(KickSheet, { page }))
    const empty = document.querySelector('[data-testid="kick-empty-targets"]')
    assert.ok(empty, "빈 목록 글이 없음")
    assert.equal(textOf(empty), "추방할 수 있는 참가자가 없습니다.")
    assert.equal(buttonsNamed("추방").length, 0)
})

test("A01-M-505 결과 모름 + 영수증 → kick-unknown 글 + '결과 확인' 단추, 보내는 중(SENDING)엔 '결과 확인' 숨김", () => {
    let asked = 0
    view = render(React.createElement(KickStatus, { status: "SENDING", errorCode: null, canLookupResult: true, isAwaitingResolution: false, onLookupResult: () => { asked += 1 } }))
    assert.equal(buttonNamed("결과 확인", view.container), null, "보내는 중인데 '결과 확인' 단추가 뜸")

    view.rerender(React.createElement(KickStatus, { status: "UNKNOWN", errorCode: null, canLookupResult: true, isAwaitingResolution: false, onLookupResult: () => { asked += 1 } }))
    const unknown = view.container.querySelector('[data-testid="kick-unknown"]')
    assert.ok(unknown, "결과 모름 글이 없음")
    assert.ok(textOf(unknown).length > 0)
    const lookup = buttonNamed("결과 확인", view.container)
    assert.ok(lookup, "'결과 확인' 단추가 없음")
    click(lookup)
    assert.equal(asked, 1)
})
