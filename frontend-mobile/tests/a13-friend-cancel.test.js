// 모바일 친구 시트 시험: 친구 추가 탭에 보낸 신청 목록 없음, 친구 줄 단추(대기방 = 초대·차단, 로비 = 차단, 끊기 없음)
// 목록 A13 모바일 A13-M-504·508, 합친 화면(2026-11-24 되돌림: 보낸 신청 취소·친구 끊기 없음)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-friend-cancel.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, pageText, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, serve, useAuthStore } from "./a00-game.mjs"

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

// 내가 보낸 대기 신청 둘 (지유·가람) — 서버 보낸 신청 목록 한 줄 모양
const SENT = [
    { request_id: 31, id: "u-jy", name: "지유", created_at: "2026-11-16T02:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
    { request_id: 32, id: "u-gr", name: "가람", created_at: "2026-11-16T01:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
]
// 서버가 주는 친구 한 줄
const friend = (id, name) => ({ id, name, online: true, status: "ONLINE", accountProfilePhotoId: null, accountProfileBorderId: null })
const ok = (data) => ({ status: 200, body: { success: true, data } })

const sentNames = () => [...document.querySelectorAll("li[data-outgoing-request-id]")].map((li) => textOf(li.querySelector("p")))
const friendRow = (id) => document.querySelector(`li[data-friend-id="${id}"]`)
const rowButtonNames = (row) => buttonNames(row).filter((name) => !/즐겨찾기/.test(name))

// 친구 시트를 엶 (로비에서 연 것처럼, props를 주면 대기방에서 연 것처럼)
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

// 친구 추가 탭으로
async function openAddTab(routes) {
    await openSheet(routes)
    click(buttonNamed("친구 추가"))
    await flush(5)
}

test("A13-M-504 서버에 보낸 신청이 2개 있어도 친구 추가 탭엔 보낸 신청 줄·\"보낸 신청\" 글·취소 단추 없음", async () => {
    await openAddTab({ "GET /friends/requests/outgoing": ok(SENT) })
    assert.equal(sentNames().length, 0)
    assert.equal(pageText().includes("보낸 신청"), false)
    assert.equal(buttonNames().some((name) => /보낸 친구 신청 취소/.test(name)), false)
})

test("A13-M-508 대기방에서 연 친구 시트(초대 단추가 있는 시트)엔 끊기 단추가 없음 → 초대·차단 두 단추만", async () => {
    await openSheet({ "GET /friends": ok([friend("f1", "가람")]) }, { roomId: "room-1", isRoomVerified: true })
    assert.deepEqual(rowButtonNames(friendRow("f1")), ["가람 게임 초대", "가람 차단"])
})
