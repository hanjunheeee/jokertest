// 6차 묶음: 알림 합치기·줄 검사·보이는 목록, 알림 스토어 읽음·모두 읽음·읽은 알림 지우기·계정 바뀜
import test from "node:test"
import assert from "node:assert/strict"

import {
  __setNotificationsApiForTests,
  isConfirmedReadRow,
  isNotificationBackedSourceKey,
  mergeNotifications,
  selectUnreadCount,
  selectVisibleNotifications,
  useNotificationsStore,
} from "../../src/domains/notifications/store/notifications.store.js"
import { resolveBodyState } from "../../src/domains/notifications/utils/visibleNotifications.js"
import { useAuthStore } from "../../src/domains/auth/store/auth.store.js"

const ME = "11111111-1111-4111-8111-111111111111"
const READ_AT = "2026-11-09T01:00:00.000Z"
const row = (extra = {}) => ({
  id: "n1",
  type: "system",
  sourceKey: "system:seed:1",
  createdAt: "2026-11-09T00:00:00.000Z",
  readAt: null,
  ...extra,
})
const ns = () => useNotificationsStore.getState()

function login() {
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: ME }, loggedOutIntentionally: false })
  ns().__resetForTests()
  ns().syncAccount()
}

test.afterEach(() => __setNotificationsApiForTests(null))

test("알림 합치기: 최신순, 같은 시각이면 id 역순", () => {
  const out = mergeNotifications([], [
    row({ id: "a", createdAt: "2026-11-09T00:00:00Z" }),
    row({ id: "b", createdAt: "2026-11-09T00:00:00Z" }),
    row({ id: "c", createdAt: "2026-11-09T05:00:00Z" }),
  ])
  assert.deepEqual(out.map((n) => n.id), ["c", "b", "a"])
})

test("알림 합치기: 읽음 시각은 한쪽만 있으면 그 시각, 둘 다면 먼저 읽은 시각", () => {
  const early = "2026-11-09T01:00:00Z"
  const late = "2026-11-09T02:00:00Z"
  assert.equal(mergeNotifications([row({ readAt: early })], [row({ readAt: null })])[0].readAt, early)
  assert.equal(mergeNotifications([row({ readAt: late })], [row({ readAt: early })])[0].readAt, early)
  assert.equal(mergeNotifications([row()], [row({ readAt: late })])[0].readAt, late)
})

test("알림 합치기: id·소리 키 없는 줄은 버림", () => {
  assert.deepEqual(mergeNotifications([], [{ id: "x" }, row({ sourceKey: "" }), null]), [])
})

test("알림 기반 소리 키: system·받은 친구 신청·업적·받은 초대만", () => {
  assert.equal(isNotificationBackedSourceKey("system:maint"), true)
  assert.equal(isNotificationBackedSourceKey("friend-request:abc:received"), true)
  assert.equal(isNotificationBackedSourceKey("friend-request:abc:accepted"), false)
  assert.equal(isNotificationBackedSourceKey("game-invite:a:b:received"), false)
  assert.equal(isNotificationBackedSourceKey(null), false)
})

test("읽음 확정 줄: 같은 id에 읽을 수 있는 읽음 시각이 있어야 확정", () => {
  assert.equal(isConfirmedReadRow(row({ readAt: READ_AT }), "n1"), true)
  assert.equal(isConfirmedReadRow(row({ readAt: READ_AT }), "n2"), false)
  assert.equal(isConfirmedReadRow(row({ readAt: "not a date" }), "n1"), false)
  assert.equal(isConfirmedReadRow(row({ readAt: new Date(Number.NaN) }), "n1"), false)
  assert.equal(isConfirmedReadRow(row({ readAt: "  " }), "n1"), false)
})

test("보이는 알림: 설정에서 끈 종류만 숨기고 모르는 종류는 늘 보임", () => {
  const items = [row({ id: "s", type: "system" }), row({ id: "f", type: "friend-request" }), row({ id: "z", type: "custom" })]
  const visible = selectVisibleNotifications(items, { "system-notification": false })
  assert.deepEqual(visible.map((n) => n.id), ["f", "z"])
  assert.equal(selectUnreadCount(items, { "system-notification": false }), 2)
  assert.equal(selectVisibleNotifications(items, undefined).length, 3)
})

test("알림 창 본문 상태: 오류·불러오는 중·비어 있음·목록", () => {
  assert.equal(resolveBodyState("error", 3), "error")
  assert.equal(resolveBodyState("idle", 3), "loading")
  assert.equal(resolveBodyState("loading", 0), "loading")
  assert.equal(resolveBodyState("success", 0), "empty")
  assert.equal(resolveBodyState("success", 2), "list")
})

test("알림 읽음: 로그인 안 했으면 anonymous, 빈 id면 invalid", async () => {
  useAuthStore.setState({ isLoggedIn: false, user: null })
  ns().__resetForTests()
  ns().syncAccount()
  assert.deepEqual(await ns().markRead("n1"), { ok: false, reason: "anonymous" })
  login()
  assert.deepEqual(await ns().markRead(""), { ok: false, reason: "invalid" })
})

test("알림 읽음: 서버가 읽음 시각을 돌려주면 목록에 반영하고 처리 중 표시를 끔", async () => {
  login()
  useNotificationsStore.setState({ items: [row()] })
  __setNotificationsApiForTests({ markNotificationReadApi: async (id) => row({ id, readAt: READ_AT }) })
  const r = await ns().markRead("n1")
  assert.equal(r.ok, true)
  assert.equal(ns().items[0].readAt, READ_AT)
  assert.deepEqual(ns().readPendingIds, [])
})

test("알림 읽음: 응답에 읽음 시각이 없으면 미확정 오류로 남김", async () => {
  login()
  useNotificationsStore.setState({ items: [row()] })
  __setNotificationsApiForTests({ markNotificationReadApi: async () => row() })
  assert.deepEqual(await ns().markRead("n1"), { ok: false, reason: "unconfirmed" })
  assert.match(ns().readErrors.n1, /읽음 확정/)
  assert.equal(ns().items[0].readAt, null)
})

test("알림 읽음: 요청 실패면 서버 문구를 오류로 남김, 다시 시도 전에 지울 수 있음", async () => {
  login()
  __setNotificationsApiForTests({ markNotificationReadApi: async () => { throw new Error("서버 오류") } })
  assert.deepEqual(await ns().markRead("n1"), { ok: false, reason: "error" })
  assert.equal(ns().readErrors.n1, "서버 오류")
  ns().clearReadError("n1")
  assert.deepEqual(ns().readErrors, {})
})

test("알림 읽음: 응답 오기 전에 계정이 바뀌면 결과를 버림(stale)", async () => {
  login()
  let release
  __setNotificationsApiForTests({
    markNotificationReadApi: () => new Promise((resolve) => { release = () => resolve(row({ readAt: READ_AT })) }),
  })
  const pending = ns().markRead("n1")
  await Promise.resolve()
  useAuthStore.setState({ isLoggedIn: true, user: { uuid: "22222222-2222-4222-8222-222222222222" } })
  ns().syncAccount()
  release()
  assert.deepEqual(await pending, { ok: false, reason: "stale" })
  assert.deepEqual(ns().items, [])
})

test("모두 읽음: 실패한 알림만 안 읽음으로 되돌림", async () => {
  login()
  useNotificationsStore.setState({ items: [row({ id: "a" }), row({ id: "b" })], status: "success" })
  __setNotificationsApiForTests({
    markNotificationReadApi: async (id) => {
      if (id === "b") throw new Error("x")
      return row({ id, readAt: READ_AT })
    },
  })
  const r = await ns().markVisibleUnreadAsRead({})
  assert.deepEqual(r, { ok: false, marked: 1, failed: 1 })
  const byId = Object.fromEntries(ns().items.map((n) => [n.id, n.readAt]))
  // 성공한 것은 읽음으로 남음 (미리 찍은 시각과 서버 시각 중 이른 쪽)
  assert.equal(typeof byId.a, "string")
  assert.equal(byId.b, null)
})

test("모두 읽음: 설정에서 숨긴 종류는 읽음 처리 안 함", async () => {
  login()
  useNotificationsStore.setState({ items: [row({ id: "s", type: "system" }), row({ id: "f", type: "friend-request" })] })
  const asked = []
  __setNotificationsApiForTests({ markNotificationReadApi: async (id) => { asked.push(id); return row({ id, readAt: READ_AT }) } })
  const r = await ns().markVisibleUnreadAsRead({ "system-notification": false })
  assert.equal(r.marked, 1)
  assert.deepEqual(asked, ["f"])
  assert.equal(ns().items.find((n) => n.id === "s").readAt, null)
})

test("모두 읽음: 보이는 안 읽은 게 없으면 요청 없이 0", async () => {
  login()
  useNotificationsStore.setState({ items: [row({ readAt: READ_AT })] })
  assert.deepEqual(await ns().markVisibleUnreadAsRead({}), { ok: true, marked: 0 })
})

test("읽은 알림 지우기: 실패하면 뺀 알림만 다시 넣고, 그사이 온 알림은 남김", async () => {
  login()
  useNotificationsStore.setState({ items: [row({ id: "r", readAt: READ_AT }), row({ id: "u" })] })
  __setNotificationsApiForTests({
    deleteReadNotificationsApi: async () => {
      useNotificationsStore.setState((s) => ({ items: mergeNotifications(s.items, [row({ id: "new", createdAt: "2026-11-09T09:00:00Z" })]) }))
      throw new Error("삭제 실패")
    },
  })
  const r = await ns().deleteReadNotifications()
  assert.deepEqual(r, { ok: false, reason: "error" })
  assert.deepEqual(ns().items.map((n) => n.id).sort(), ["new", "r", "u"])
  assert.equal(ns().deleteReadError, "삭제 실패")
  ns().closeModal()
  assert.equal(ns().deleteReadError, null)
})

test("읽은 알림 지우기: 성공이면 읽은 것만 빠지고 지운 수를 돌려줌", async () => {
  login()
  useNotificationsStore.setState({ items: [row({ id: "r", readAt: READ_AT }), row({ id: "u" })] })
  __setNotificationsApiForTests({ deleteReadNotificationsApi: async () => ({}) })
  assert.deepEqual(await ns().deleteReadNotifications(), { ok: true, deleted: 1 })
  assert.deepEqual(ns().items.map((n) => n.id), ["u"])
})

test("계정 맞추기: 같은 계정이면 세대 그대로, 바뀌면 목록 비우고 세대 올림", () => {
  login()
  const gen = ns().accountGeneration
  useNotificationsStore.setState({ items: [row()] })
  assert.equal(ns().syncAccount(), gen)
  assert.equal(ns().items.length, 1)
  useAuthStore.setState({ isLoggedIn: false, user: null })
  assert.equal(ns().syncAccount(), gen + 1)
  assert.deepEqual(ns().items, [])
  assert.equal(ns().accountId, null)
})
