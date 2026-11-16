// 모바일 대기방 추방 시험 [버그 7]: 잠긴 까닭이 폰 화면 글로 보이고, 줄의 "추방" 한 번에 바로 보내고, 실패·결과 모름 글이 보임
// 목록 A01b 모바일 A01-M-501~505 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-kick-sheet.test.js)
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

// 5명 대기방에서 방장 빼고 4명 (추방 대상)
const TARGETS = ["나", "다", "라", "마"].map((nickname, i) => ({ uuid: `u${i + 1}`, membershipId: `m${i + 1}`, nickname }))

// 추방 창이 받는 값 묶음 (보낸 대상은 sent에 모음)
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

test("A01-M-501 [버그 7] 방 확인 전 방장: 폰 화면에 잠긴 까닭 글이 보이고 추방 단추는 꺼짐", () => {
    view = render(React.createElement(HostActions, {
        visible: true, hidden: false, canEditSettings: true, isKickHost: true, canKick: false,
        onOpenSettings: () => {}, onOpenKickModal: () => {},
    }))
    const reason = view.container.querySelector('[data-testid="kick-locked-reason"]')
    assert.ok(reason, "잠긴 까닭 글이 없음")
    assert.ok(textOf(reason).length > 0, "까닭 글이 빔")
    const kick = buttonNamed("참가자 추방", view.container) ?? [...view.container.querySelectorAll("button")].find((b) => /추방/.test(textOf(b)))
    assert.ok(kick, `추방 단추가 없음: ${buttonNames(view.container).join(" | ")}`)
    assert.equal(kick.disabled, true, "확인 전인데 추방 단추가 켜짐")
    // 단추가 그 글을 가리킴 (읽어 주는 도구가 같이 읽음)
    assert.equal(kick.getAttribute("aria-describedby"), reason.id)
})

test("A01-M-502 [버그 7] 줄의 '추방' 한 번 = 바로 보냄, 확인 칸·'취소' 없음", () => {
    const { page, sent } = kickPage()
    view = render(React.createElement(KickSheet, { page }))
    const dialog = document.querySelector('[data-testid="kick-sheet"]')
    assert.ok(dialog, "추방 창이 없음")
    const rowKick = buttonsNamed("추방", dialog)
    assert.equal(rowKick.length, 4, "대상 4명 줄의 추방 단추 수가 다름")
    click(rowKick[1])
    assert.deepEqual(sent, ["다"], "한 번 눌렀는데 보낸 대상이 다름")
    assert.equal(buttonsNamed("취소", dialog).length, 0, "'취소' 단추가 있음")
    assert.equal(buttonsNamed("확인", dialog).length, 0, "확인 단추가 있음")
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

test("A01-M-505 결과 모름 + 영수증 → kick-unknown 글 + '결과 확인' 단추", () => {
    let asked = 0
    view = render(React.createElement(KickStatus, { status: "UNKNOWN", errorCode: null, canLookupResult: true, isAwaitingResolution: false, onLookupResult: () => { asked += 1 } }))
    const unknown = view.container.querySelector('[data-testid="kick-unknown"]')
    assert.ok(unknown, "결과 모름 글이 없음")
    assert.ok(textOf(unknown).length > 0)
    const lookup = buttonNamed("결과 확인", view.container)
    assert.ok(lookup, "'결과 확인' 단추가 없음")
    click(lookup)
    assert.equal(asked, 1)
})
