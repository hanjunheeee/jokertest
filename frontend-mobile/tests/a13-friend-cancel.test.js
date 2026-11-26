// 모바일 친구 시트 시험: 친구 추가 탭 보낸 신청 목록·신청 취소, 대기방 시트 단추(초대·차단만), 차단/해제 실패 문구
// 목록 A13 모바일 A13-M-504·508·509 (돌리기: frontend-mobile 폴더에서 node --test --test-concurrency=1 tests/a13-friend-cancel.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, pageText, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, sentHttp, serve, useAuthStore } from "./a00-game.mjs"

const { default: FriendsSheet } = await import("@m/domains/lobby/components/friends/FriendsSheet.jsx")
const { useFriendStore } = await import("@/domains/lobby/store/friend.store.js")
const { useGameInviteStore } = await import("@/domains/lobby/store/gameInvite.store.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    act(() => {
        useAuthStore.getState().logout()
        useFriendStore.getState().__resetForTests()
        useGameInviteStore.getState().__resetForTests()
    })
})

// 내가 보낸 대기 신청 둘 (지유·가람)
const SENT = [
    { request_id: 31, id: "u-jy", name: "지유", created_at: "2026-11-16T02:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
    { request_id: 32, id: "u-gr", name: "가람", created_at: "2026-11-16T01:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
]
const friend = (id, name) => ({ id, name, online: true, status: "ONLINE", accountProfilePhotoId: null, accountProfileBorderId: null })
const ok = (data) => ({ status: 200, body: { success: true, data } })

const sentNames = () => [...document.querySelectorAll("li[data-outgoing-request-id]")].map((li) => textOf(li.querySelector("p")))
const friendRow = (id) => document.querySelector(`li[data-friend-id="${id}"]`)
const rowButtonNames = (row) => buttonNames(row).filter((name) => !/즐겨찾기/.test(name))

// 친구 시트를 엶 (props를 주면 대기방에서 연 것처럼)
async function openSheet(routes, props = {}) {
    serve({
        "GET /friends": ok([]),
        "GET /friends/requests/incoming": ok([]),
        "GET /friends/requests/outgoing": ok([]),
        "GET /friends/favorites": ok([]),
        "GET /friends/blocks": ok([]),
        "GET /friends/invites": ok({ invites: [], cursor: "0" }),
        ...routes,
    })
    act(() => { useAuthStore.getState().login({ uuid: "m1-friend", nickname: "가면손님" }) })
    view = await renderRoute(fakeSocket(), React.createElement(FriendsSheet, { open: true, onClose: () => {}, ...props }), { path: "/lobby" })
    await flush(5)
}

async function openAddTab(routes) {
    await openSheet(routes)
    click(buttonNamed("친구 추가"))
    await flush(5)
}

test("A13-M-504 친구 추가 탭 보낸 신청 2개 → '보낸 신청 (2)'와 취소 단추 표시, 취소 시 PUT /cancel 후 줄 제거", async () => {
    await openAddTab({
        "GET /friends/requests/outgoing": ok(SENT),
        "PUT /friends/requests/31/cancel": ok({ canceled: true }),
    })
    assert.deepEqual(sentNames(), ["지유", "가람"])
    assert.equal(pageText().includes("보낸 신청 (2)"), true)
    const cancelBtn = buttonNamed("지유에게 보낸 친구 신청 취소")
    assert.ok(cancelBtn, "지유 신청 취소 단추가 없음")
    click(cancelBtn)
    await flush(5)
    assert.equal(sentHttp("PUT", "/friends/requests/31/cancel").length, 1)
    assert.deepEqual(sentNames(), ["가람"])
    assert.equal(pageText().includes("보낸 신청 (1)"), true)
})

test("A13-M-508 대기방에서 연 친구 시트(초대 단추가 있는 시트)엔 끊기 단추가 없음 → 초대·차단 두 단추만", async () => {
    await openSheet({ "GET /friends": ok([friend("f1", "가람")]) }, { roomId: "room-1", isRoomVerified: true })
    assert.deepEqual(rowButtonNames(friendRow("f1")), ["가람 게임 초대", "가람 차단"])
})

test("A13-M-509 차단·차단 해제 실패 시 줄 아래 blockErrors 문구 표시", async () => {
    await openSheet({
        "GET /friends": ok([friend("f1", "가람")]),
        "POST /friends/blocks": { status: 500, body: { success: false, message: "차단 요청에 실패했습니다." } },
        "GET /friends/blocks": ok([{ id: "b1", name: "나래", accountProfilePhotoId: null, accountProfileBorderId: null }]),
        "DELETE /friends/blocks/b1": { status: 500, body: { success: false, message: "차단 해제에 실패했습니다." } },
    })
    click(buttonNamed("가람 차단"))
    await flush(5)
    const blockErr = friendRow("f1").querySelector('[data-block-error="f1"]')
    assert.ok(blockErr, "친구 줄 차단 실패 문구가 없음")
    assert.equal(textOf(blockErr), "차단 요청에 실패했습니다.")

    click(buttonNamed("차단 목록"))
    await flush(5)
    click(buttonNamed("나래 차단 해제"))
    await flush(5)
    const unblockErr = document.querySelector('[data-unblock-error="b1"]')
    assert.ok(unblockErr, "차단 해제 실패 문구가 없음")
    assert.equal(textOf(unblockErr), "차단 해제에 실패했습니다.")
})
