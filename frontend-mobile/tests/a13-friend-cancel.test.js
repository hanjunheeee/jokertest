// 모바일 친구 시트 시험: 보낸 신청 목록·취소(단추 이름·요청·실패 글), 친구 끊기(한 번 확인·같은 자리 두 번·실패 글·대기방 시트엔 없음)
// 목록 A13 모바일 A13-M-501~508 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-friend-cancel.test.js)
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

// 내가 보낸 대기 신청 둘 (지유·가람) — 서버 보낸 신청 목록 한 줄 모양
const SENT = [
    { request_id: 31, id: "u-jy", name: "지유", created_at: "2026-11-16T02:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
    { request_id: 32, id: "u-gr", name: "가람", created_at: "2026-11-16T01:00:00.000Z", accountProfilePhotoId: null, accountProfileBorderId: null },
]
// 서버가 주는 친구 한 줄
const friend = (id, name) => ({ id, name, online: true, status: "ONLINE", accountProfilePhotoId: null, accountProfileBorderId: null })
const ok = (data) => ({ status: 200, body: { success: true, data } })

const sentNames = () => [...document.querySelectorAll("li[data-outgoing-request-id]")].map((li) => textOf(li.querySelector("p")))
const sentRow = (id) => document.querySelector(`li[data-outgoing-request-id="${id}"]`)
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

test("A13-M-501 친구 추가 탭(검색 전) → 보낸 신청 2줄, 줄마다 \"○○에게 보낸 친구 신청 취소\" 단추(보이는 글 \"취소\")", async () => {
    await openAddTab({ "GET /friends/requests/outgoing": ok(SENT) })
    assert.deepEqual(sentNames(), ["지유", "가람"])
    const button = buttonNamed("지유에게 보낸 친구 신청 취소", sentRow(31))
    assert.ok(button, `단추 이름: ${buttonNames(sentRow(31)).join(", ")}`)
    assert.equal(textOf(button), "취소")
    assert.ok(buttonNamed("가람에게 보낸 친구 신청 취소", sentRow(32)))
})

test("A13-M-502 지유 줄 취소 → PUT /friends/requests/31/cancel 1번, 지유 줄 없음·가람 줄 그대로", async () => {
    await openAddTab({
        "GET /friends/requests/outgoing": ok(SENT),
        "PUT /friends/requests/31/cancel": ok({ request_id: 31, status: "CANCELLED" }),
    })
    click(buttonNamed("지유에게 보낸 친구 신청 취소"))
    await flush(5)
    assert.equal(sentHttp("PUT", "/friends/requests/31/cancel").length, 1)
    assert.deepEqual(sentNames(), ["가람"])
})

test("A13-M-503 취소 실패(500) → 지유 줄 안에 \"취소하지 못했습니다. 다시 시도해 주세요.\", 줄은 남음", async () => {
    await openAddTab({
        "GET /friends/requests/outgoing": ok(SENT),
        "PUT /friends/requests/31/cancel": { status: 500, body: { message: "서버 오류" } },
    })
    click(buttonNamed("지유에게 보낸 친구 신청 취소"))
    await flush(5)
    assert.equal(textOf(sentRow(31).querySelector('[role="alert"]')), "취소하지 못했습니다. 다시 시도해 주세요.")
    assert.equal(sentRow(32).querySelector('[role="alert"]'), null)
    assert.deepEqual(sentNames(), ["지유", "가람"])
})

test("A13-M-504 보낸 신청 0개 → 줄도 \"보낸 신청\" 글도 없음", async () => {
    await openAddTab({})
    assert.equal(sentNames().length, 0)
    assert.equal(pageText().includes("보낸 신청"), false)
})

test("A13-M-505 친구 줄 끊기: 한 번 누르면 요청 0번·\"친구를 끊을까요?\", 확인을 누르면 DELETE /friends/f1 1번 뒤 그 줄 없음", async () => {
    let gone = false
    await openSheet({
        "GET /friends": () => ok(gone ? [friend("f2", "나래")] : [friend("f1", "가람"), friend("f2", "나래")]),
        "DELETE /friends/f1": () => { gone = true; return ok({ unfriendedId: "f1", cancelledInvites: [] }) },
    })
    const ask = buttonNamed("가람 친구 끊기", friendRow("f1"))
    assert.ok(ask, `단추 이름: ${buttonNames(friendRow("f1")).join(", ")}`)
    assert.equal(textOf(ask), "끊기")
    click(ask)
    assert.equal(sentHttp("DELETE", "/friends/f1").length, 0)
    assert.equal(textOf(friendRow("f1").querySelector("[data-unfriend-confirm]")), "친구를 끊을까요?")
    assert.deepEqual(rowButtonNames(friendRow("f1")), ["가람 친구 끊기 확인", "가람 친구 끊기 취소"])
    click(buttonNamed("가람 친구 끊기 확인", friendRow("f1")))
    await flush(5)
    assert.equal(sentHttp("DELETE", "/friends/f1").length, 1)
    assert.equal(friendRow("f1"), null)
    assert.ok(friendRow("f2"))
})

test("A13-M-506 끊기 단추 자리를 잇달아 두 번 누름 → 요청 0번 (두 번째 누름은 취소), 묻는 글 사라짐", async () => {
    await openSheet({ "GET /friends": ok([friend("f1", "가람")]) })
    const spot = buttonNamed("가람 친구 끊기", friendRow("f1"))
    click(spot)
    click(spot)
    await flush(3)
    assert.equal(sentHttp("DELETE", "/friends/f1").length, 0)
    assert.equal(friendRow("f1").querySelector("[data-unfriend-confirm]"), null)
    assert.ok(buttonNamed("가람 친구 끊기", friendRow("f1")))
})

test("A13-M-507 끊기 실패(서버 글 없는 500) → 그 줄에 \"친구를 끊지 못했습니다.\", 줄은 남음", async () => {
    await openSheet({
        "GET /friends": ok([friend("f1", "가람")]),
        "DELETE /friends/f1": { status: 500, body: {} },
    })
    click(buttonNamed("가람 친구 끊기", friendRow("f1")))
    click(buttonNamed("가람 친구 끊기 확인", friendRow("f1")))
    await flush(5)
    assert.equal(textOf(friendRow("f1").querySelector("[data-unfriend-error]")), "친구를 끊지 못했습니다.")
    assert.ok(buttonNamed("가람 친구 끊기", friendRow("f1")))
})

test("A13-M-508 대기방에서 연 친구 시트(초대 단추가 있는 시트)엔 끊기 단추가 없음 → 초대·차단 두 단추만", async () => {
    await openSheet({ "GET /friends": ok([friend("f1", "가람")]) }, { roomId: "room-1", isRoomVerified: true })
    assert.deepEqual(rowButtonNames(friendRow("f1")), ["가람 게임 초대", "가람 차단"])
})
