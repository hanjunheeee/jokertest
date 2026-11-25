// 모바일 알림 시트 시험: 보이는 읽은 알림이 없으면 "읽은 메시지 삭제" 꺼짐, 하나라도 있으면 켜짐 + 알림 줄엔 받은 시각 칸 없음
// 목록 A13 모바일 A13-M-001·008, 합친 화면(2026-11-24 되돌림: 받은 시각 칸 없음)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-notification-sheet.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, flush, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, serve, useAuthStore } from "./a00-game.mjs"

const { default: NotificationSheet } = await import("@m/domains/notifications/components/NotificationSheet.jsx")
const { useNotificationsStore } = await import("@/domains/notifications/store/notifications.store.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    act(() => { useAuthStore.getState().logout() })
})

// 서버가 주는 알림 한 줄 (PC 시험 a13Kit note 모양)
function note(id, { type = "system", read = false } = {}) {
    return { id, type, sourceKey: `${type}:${id}:k`, title: `제목 ${id}`, body: `본문 ${id}`, target: null, createdAt: "2026-11-16T01:00:00.000Z", readAt: read ? "2026-11-16T02:00:00.000Z" : null }
}

// 알림 목록을 받은 뒤 알림 시트를 엶
async function openSheet(rows) {
    serve({ "GET /notifications": { status: 200, body: { data: rows } } })
    act(() => { useAuthStore.getState().login({ uuid: "m1-note", nickname: "가면손님" }) })
    useNotificationsStore.getState().syncAccount()
    await act(async () => { await useNotificationsStore.getState().loadSnapshot() })
    view = await renderRoute(fakeSocket(), React.createElement(NotificationSheet, { open: true, onClose: () => {} }), { path: "/lobby" })
    await flush(5)
}

test("A13-M-001 알림 시트 '읽은 메시지 삭제' 켜지는 때: 보이는 읽은 알림 0 → 꺼짐, 1 → 켜짐", async () => {
    await openSheet([])
    const none = buttonNamed("읽은 메시지 삭제")
    assert.ok(none, "삭제 단추가 없음")
    assert.equal(none.disabled, true, "읽은 알림이 없는데 켜짐")
    resetGame(view)
    view = null
    await openSheet([note("r1", { read: true })])
    assert.equal(buttonNamed("읽은 메시지 삭제").disabled, false, "읽은 알림 1개인데 꺼짐")
})

// ── 008: 알림 줄의 받은 시각 칸 (합친 화면은 시각 칸을 안 그림) ──

test("A13-M-008 받은 시각 값이 없는 알림(createdAt null) → time 칸 없음, 제목·본문은 그대로", async () => {
    await openSheet([{ ...note("t2"), createdAt: null }])
    const row = document.querySelector('[data-notification-id="t2"]')
    assert.ok(row, "알림 줄이 없음")
    assert.equal(row.querySelectorAll("time").length, 0)
    assert.ok(textOf(row).includes("제목 t2"), "제목이 없음")
    assert.ok(textOf(row).includes("본문 t2"), "본문이 없음")
})
