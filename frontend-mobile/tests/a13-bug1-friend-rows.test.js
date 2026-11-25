// 모바일 친구 시트 줄 글 시험: 찾은 줄 신청 실패 글·받은 초대 줄 수락 실패 글이 그 줄 이름 아래 칸에 보이고 이름은 그대로
// 목록 A13 모바일 A13-M-515·516, 합친 화면(2026-11-24 되돌림: 글은 줄 안 이름 아래, 대비 손질 없음)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-bug1-friend-rows.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { textOf } from "./a00-kit.mjs"

const { default: CandidateRow } = await import("@m/domains/lobby/components/friends/add/CandidateRow.jsx")
const { default: InviteRow } = await import("@m/domains/lobby/components/friends/invite/InviteRow.jsx")
const { useFriendStore } = await import("@/domains/lobby/store/friend.store.js")

let view = null
afterEach(() => {
    view?.unmount()
    view = null
    act(() => useFriendStore.getState().__resetForTests())
})

const h = React.createElement

// 글이 이름(p)과 같은 글 칸 안, 이름 다음에 있는지
function sitsUnderName(row, note) {
    const name = row.querySelector("p")
    return name.parentElement.contains(note) && Boolean(name.compareDocumentPosition(note) & window.Node.DOCUMENT_POSITION_FOLLOWING)
}

test("A13-M-515 폰 친구 추가 찾은 줄 신청 실패 글 → 이름 아래 칸에 role=alert 글, 이름 그대로", () => {
    view = render(h("ul", null, h(CandidateRow, {
        candidate: { id: "c1", name: "t2d0ee32", status: "ONLINE" }, sent: false, sendError: "이미 친구 신청 중입니다.", blocking: false,
    })))
    const row = document.querySelector('li[data-candidate-id="c1"]')
    const error = row.querySelector("[data-send-error]")
    assert.ok(error, "실패 글이 없음")
    assert.equal(error.getAttribute("role"), "alert")
    assert.equal(textOf(error), "이미 친구 신청 중입니다.")
    assert.ok(sitsUnderName(row, error), "실패 글이 이름 아래 칸에 없음")
    assert.equal(textOf(row.querySelector("p")), "t2d0ee32")
})

test("A13-M-516 폰 받은 초대 줄 수락 실패 글(3번 추방) → 이름 아래 칸에 role=status 글, 보낸 사람 이름 그대로", () => {
    const invite = {
        inviteId: "inv-1", receiverId: "me", senderId: "s-1", senderName: "민수", status: "PENDING", revision: 1, creationSeq: "5",
        expiresAt: new Date(Date.now() + 180_000).toISOString(),
    }
    view = render(h("ul", null, h(InviteRow, {
        invite, processing: false, targeted: false, error: "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.", onAccept: () => {}, onDecline: () => {},
    })))
    const row = document.querySelector('li[data-invite-id="inv-1"]')
    const error = row.querySelector("[data-invite-error]")
    assert.ok(error, "실패 글이 없음")
    assert.equal(error.getAttribute("role"), "status")
    assert.equal(textOf(error), "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.")
    assert.ok(sitsUnderName(row, error), "실패 글이 이름 아래 칸에 없음")
    assert.equal(row.querySelector("p").textContent, "민수")
})
