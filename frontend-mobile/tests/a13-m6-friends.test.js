// 모바일 로비 친구 시트 시험: 로비 친구 줄 차단·끊기 단추, 끊기 확인("친구를 끊을까요?")·취소·삭제 처리
// 목록 A13 모바일 A13-M-601 (돌리기: frontend-mobile 폴더에서 node --test --test-concurrency=1 tests/a13-m6-friends.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, textOf } from "./a00-kit.mjs"
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

test("A13-M-601 로비 친구 시트 친구 줄 → 차단·친구 끊기 단추, '친구를 끊을까요?' 확인 뒤 DELETE /friends/f1", async () => {
    let friends = [{ id: "f1", name: "가람", online: true, status: "ONLINE", accountProfilePhotoId: null, accountProfileBorderId: null }]
    serve({
        "GET /friends": () => ok(friends),
        "GET /friends/requests/incoming": ok([]),
        "GET /friends/requests/outgoing": ok([]),
        "GET /friends/favorites": ok([]),
        "GET /friends/blocks": ok([]),
        "GET /friends/invites": ok({ invites: [], cursor: "0" }),
        "DELETE /friends/f1": () => {
            friends = []
            return ok({ unfriended: true })
        },
    })
    act(() => { useAuthStore.getState().login({ uuid: "m6-friend", nickname: "가면손님" }) })
    view = await renderRoute(fakeSocket(), React.createElement(FriendsSheet, { open: true, onClose: () => {} }), { path: "/lobby" })
    await flush(5)
    const row = friendRow("f1")
    assert.equal(row !== null, true, "친구 줄이 없음")
    assert.deepEqual(buttonNames(row).filter((name) => !/즐겨찾기/.test(name)), ["가람 차단", "가람 친구 끊기"])
    assert.equal(textOf(row.querySelector("p")), "가람")

    // 한 번 누르면 묻기만 하고 요청 안 보냄
    click(buttonNamed("가람 친구 끊기", row))
    await flush(2)
    assert.equal(textOf(row.querySelector("[data-unfriend-confirm]")), "친구를 끊을까요?")
    assert.deepEqual(buttonNames(row).filter((name) => !/즐겨찾기/.test(name)), ["가람 친구 끊기 확인", "가람 친구 끊기 취소"])
    assert.equal(sentHttp("DELETE", "/friends/f1").length, 0)

    // 취소하면 원래 상태로 돌아옴
    click(buttonNamed("가람 친구 끊기 취소", row))
    await flush(2)
    assert.equal(row.querySelector("[data-unfriend-confirm]") === null, true)
    assert.deepEqual(buttonNames(row).filter((name) => !/즐겨찾기/.test(name)), ["가람 차단", "가람 친구 끊기"])

    // 다시 묻고 확인을 누르면 DELETE 요청 전송 후 줄 사라짐
    click(buttonNamed("가람 친구 끊기", row))
    await flush(2)
    click(buttonNamed("가람 친구 끊기 확인", row))
    await flush(5)
    assert.equal(sentHttp("DELETE", "/friends/f1").length, 1)
    assert.equal(friendRow("f1") === null, true)
})
