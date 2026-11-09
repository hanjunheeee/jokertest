// AD-251 열린 방·판 화면 시험: 서버 합친 목록·서버 칸, partial → "n2 못 받음", 30초 새로고침은 백그라운드 머리글
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, act } = await import("@testing-library/react")
const { default: LivePage, REFRESH_MS } = await import("../../../src/admin/domains/live/pages/LivePage.jsx")

test.afterEach(() => cleanup())

const KEY = "GET /admin-api/live"
const LIVE = {
  ok: true,
  onlineCount: 9,
  roomCount: 2,
  gameCount: 1,
  rooms: [
    { roomId: "r1", code: "ABCD", accessType: "PUBLIC", playerCount: 3, maxPlayers: 8, node: "n1" },
    { roomId: "r2", code: "WXYZ", accessType: "PRIVATE", playerCount: 1, maxPlayers: 6, node: "n2" },
  ],
  games: [{ gameId: "g1", roomCode: "QQQQ", playerCount: 6, aliveCount: 4, phase: "NIGHT", dayIndex: 2, startedAt: "2026-11-10T03:00:00.000Z", node: "n2" }],
  nodes: [
    { node: "n1", ok: true, onlineCount: 4, roomCount: 1, gameCount: 0 },
    { node: "n2", ok: true, onlineCount: 5, roomCount: 1, gameCount: 1 },
  ],
  partial: false,
  maintenance: { enabled: false, active: false, startsAt: null },
}

const open = async () => {
  await act(async () => { render(React.createElement(LivePage)) })
}

test("AD-251 합친 목록: 방 둘·판 하나에 서버 칸, 숫자 줄, 못 받음 안내 없음", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(KEY, 200, LIVE)
  await open()
  assert.match(screen.getByText(/접속 9명/).textContent, /대기방 2개 · 진행 판 1개/)
  const tables = screen.getAllByRole("table")
  assert.equal(tables.length, 3)
  const roomNodes = [...tables[1].querySelectorAll("tbody tr")].map((row) => row.lastElementChild.textContent)
  assert.deepEqual(roomNodes, ["n1", "n2"])
  assert.match(tables[0].textContent, /2일째 밤/)
  assert.equal(tables[0].querySelector("tbody tr").lastElementChild.textContent, "n2")
  assert.equal(screen.queryByRole("alert"), null)
})

test("AD-251 partial → 'n2 못 받음' 안내 + 받은 서버 것은 그대로 (휴대폰 카드)", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer(KEY, 200, {
    ...LIVE,
    rooms: [LIVE.rooms[0]],
    games: [],
    roomCount: 1,
    gameCount: 0,
    nodes: [LIVE.nodes[0], { node: "n2", ok: false, code: "RPC_TIMEOUT" }],
    partial: true,
  })
  await open()
  assert.match(screen.getByRole("alert").textContent, /n2 못 받음/)
  assert.ok(screen.getByText("ABCD"))
  assert.ok(screen.getByText(/못 받음 \(RPC_TIMEOUT\)/))
})

test("AD-251 30초마다 다시 읽음: 처음은 보통, 새로고침은 X-Admin-Background: 1", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] })
  const server = createFakeServer()
  server.answer(KEY, 200, LIVE)
  await open()
  assert.equal(server.calls.length, 1)
  assert.equal(server.calls[0].headers["X-Admin-Background"], undefined)
  server.answer(KEY, 200, { ...LIVE, onlineCount: 11 })
  await act(async () => { t.mock.timers.tick(REFRESH_MS) })
  assert.equal(server.calls.length, 2)
  assert.equal(server.calls[1].headers["X-Admin-Background"], "1")
  assert.ok(screen.getByText(/접속 11명/))
})

test("AD-251 단일 서버(nodes 없음) → 서버 칸은 '이 서버', 서버별 표 없음", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  const single = { ...LIVE, nodes: undefined, partial: undefined, games: [], rooms: [{ ...LIVE.rooms[0], node: undefined }] }
  server.answer(KEY, 200, single)
  await open()
  assert.equal(screen.getAllByRole("table").length, 1)
  assert.ok(screen.getByText("이 서버"))
})
