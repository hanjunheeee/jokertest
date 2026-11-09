// 지난 판·약관 화면 시험 (AD-230·231·240 화면 쪽): 점검으로 끝남 글자·주소 칸으로 찾기·상세 참가자, 약관 시행일 한국 시각 → UTC
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, act } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: GamesPage } = await import("../../../src/admin/domains/games/pages/GamesPage.jsx")
const { kstInputToIso, toTermsInput } = await import("../../../src/admin/domains/terms/api/terms.api.js")

test.afterEach(() => cleanup())

const UUID = "11111111-1111-4111-8111-111111111111"
const GAME = "22222222-2222-4222-8222-222222222222"

const openAt = async (path) => {
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/games/*", element: React.createElement(GamesPage) }))))
  })
}

test("AD-230 화면: 주소 ?userUuid= 로 찾기, 점검으로 끝난 판은 '점검으로 끝남', 더 보기는 커서", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(`GET /admin-api/games?userUuid=${UUID}`, 200, {
    ok: true,
    items: [{ gameId: GAME, startedAt: "2026-11-10T02:53:00.000Z", endedAt: "2026-11-10T03:00:00.000Z", winner: "NONE", winReason: "MAINTENANCE", playerCount: 6, dayIndex: 2 }],
    nextBefore: GAME,
  })
  server.answer(`GET /admin-api/games?userUuid=${UUID}&before=${GAME}`, 200, { ok: true, items: [], nextBefore: null })
  await openAt(`/games?userUuid=${UUID}`)
  assert.ok(screen.getByText("점검으로 끝남"))
  assert.equal(screen.getByRole("link", { name: "2026-11-10 12:00" }).getAttribute("href"), `/games/${GAME}`)
  await act(async () => { screen.getByRole("button", { name: "더 보기" }).click() })
  assert.equal(server.calls.length, 2)
  assert.equal(screen.queryByRole("button", { name: "더 보기" }), null)
})

test("AD-230 화면: 판 하나 — 시간·참가자 직업·승패·죽은 이유, 이름은 회원 상세로", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer(`GET /admin-api/games/${GAME}`, 200, {
    ok: true,
    game: { gameId: GAME, startedAt: "2026-11-10T02:40:00.000Z", endedAt: "2026-11-10T03:00:30.000Z", winner: "JOKER", winReason: "JOKER_PARITY_REACHED", playerCount: 1, dayIndex: 3, completed: true, durationSec: 1230 },
    players: [
      { uuid: UUID, nickname: "가면1", role: "WITCH_HUNTER", team: "CITIZEN", won: false, alive: false, deathReason: "EXECUTION" },
    ],
  })
  await openAt(`/games/${GAME}`)
  assert.ok(screen.getByText("20분 30초"))
  assert.ok(screen.getByText("광대 진영"))
  const card = screen.getAllByRole("listitem")[0].textContent
  assert.match(card, /마녀사냥꾼/)
  assert.match(card, /패/)
  assert.match(card, /죽음 \(재판 처형\)/)
  assert.equal(screen.getByRole("link", { name: "가면1" }).getAttribute("href"), `/members/${UUID}`)
})

test("AD-231 화면: 없는 판 → 서버 문구, 다시 불러오기 없음", async () => {
  const server = createFakeServer()
  server.answer(`GET /admin-api/games/${GAME}`, 404, { ok: false, code: "GAME_NOT_FOUND", message: "그 판을 찾지 못했어요. 판 번호를 다시 확인해 주세요." })
  await openAt(`/games/${GAME}`)
  assert.match(screen.getByRole("alert").textContent, /그 판을 찾지 못했어요/)
  assert.equal(screen.queryByRole("button", { name: "다시 불러오기" }), null)
})

test("AD-240 화면: 약관 시행일 한국 시각 → UTC, 빈 본문·주소는 null", () => {
  assert.equal(kstInputToIso("2026-12-01T00:00"), "2026-11-30T15:00:00.000Z")
  assert.equal(kstInputToIso(""), "")
  assert.deepEqual(toTermsInput({ kind: "TERMS", version: " 1.1 ", title: "약관", body: " ", url: "https://x.example/t", effectiveAt: "2026-12-01T09:00", isRequired: false }), {
    kind: "TERMS", version: "1.1", title: "약관", body: null, url: "https://x.example/t", effectiveAt: "2026-12-01T00:00:00.000Z", isRequired: false,
  })
})
