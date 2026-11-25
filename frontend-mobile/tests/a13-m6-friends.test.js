// 모바일 로비 친구 시트 시험(합친 화면): 로비에서 연 친구 줄은 차단 단추 하나(끊기·초대 없음)
// 목록 A13 모바일 A13-M-601, 2026-11-24 되돌린 화면(baa5c898)에 맞춘 새 시험 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-m6-friends.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNames, flush, textOf } from "./a00-kit.mjs"
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

const ok = (data) => ({ status: 200, body: { success: true, data } })
const friendRow = (id) => document.querySelector(`li[data-friend-id="${id}"]`)

test("A13-M-601 로비에서 연 친구 시트 친구 줄 → 차단 단추 하나(끊기·초대·묻는 글 없음), 이름 그대로", async () => {
    serve({
        "GET /friends": ok([{ id: "f1", name: "가람", online: true, status: "ONLINE", accountProfilePhotoId: null, accountProfileBorderId: null }]),
        "GET /friends/requests/incoming": ok([]),
        "GET /friends/requests/outgoing": ok([]),
        "GET /friends/favorites": ok([]),
        "GET /friends/blocks": ok([]),
        "GET /friends/invites": ok({ invites: [], cursor: "0" }),
    })
    act(() => { useAuthStore.getState().login({ uuid: "m6-friend", nickname: "가면손님" }) })
    view = await renderRoute(fakeSocket(), React.createElement(FriendsSheet, { open: true, onClose: () => {} }), { path: "/lobby" })
    await flush(5)
    const row = friendRow("f1")
    assert.ok(row !== null, "친구 줄이 없음")
    assert.deepEqual(buttonNames(row).filter((name) => !/즐겨찾기/.test(name)), ["가람 차단"])
    assert.equal(textOf(row.querySelector("p")), "가람")
    assert.ok(row.querySelector("[data-unfriend-confirm]") === null, "끊기 묻는 글이 있음")
    assert.equal(sentHttp("DELETE", "/friends/f1").length, 0, "끊기 요청이 나감")
})
