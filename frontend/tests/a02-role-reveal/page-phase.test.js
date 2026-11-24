// 판 화면 부품 시험(jsdom): 역할 확인 단계의 판 화면 전체를 그려 채팅 칸·이모티콘·투표/준비 단추·역할 창 닫힘·둘째 판 창을 봄 (화면 부품)
// 목록 A02-F-187~192·227~229 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  RTL, cardOf, dismissOverlays, installSocket, loginAs, renderInGamePage, resetAll, useInGameStore, waitUntil,
} from "./a02Render.mjs"
import { autoCounts, buildGameStarted, firstOf, nextGameId, ofRole, seatCode, seatPlayers } from "./a02Fixtures.mjs"

test.afterEach(() => {
  resetAll()
  mock.timers.reset()
})

const REVEAL = { name: "내 역할 보기" }
const revealDialog = () => RTL.screen.queryByRole("dialog", REVEAL)

// 6명 판 의사로 시작 알림을 넣고 판 화면을 그림 (역할 창이 뜰 때까지)
async function pageInRoleReveal({ seats = seatPlayers(autoCounts(6), { gameTag: "page" }), role = "DOCTOR", gameId = nextGameId("page") } = {}) {
  const me = firstOf(seats, role)
  const socket = installSocket()
  loginAs(me)
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(seats, me, { gameId })) })
  renderInGamePage()
  await waitUntil(() => revealDialog() !== null, { what: "역할 창 뜸" })
  return { seats, me, socket, gameId }
}

// 막혀서 못 쓰는지 (꺼짐·읽기만·inert 안에 있음 중 하나)
const isOff = (el) => el.disabled === true || el.readOnly === true || el.closest("[inert]") !== null

test("A02-F-187 역할 확인 단계 판 화면 → 채팅 입력칸·보내기 꺼짐 (역할 창을 닫은 뒤에도)", async () => {
  await pageInRoleReveal()
  await dismissOverlays()
  await waitUntil(() => revealDialog() === null, { what: "역할 창 닫힘" })
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL")
  const input = document.querySelector("textarea")
  const send = RTL.screen.getByRole("button", { name: "채팅 보내기" })
  assert.ok(input !== null, "채팅 입력칸이 화면에 있음")
  assert.equal(isOff(input), true, "채팅 입력칸 꺼짐")
  assert.equal(isOff(send), true, "보내기 꺼짐")
})

// 결정 2026-11-16 오전 둘째 "이모티콘": 낮에만 → 역할 확인 10초 동안은 팔레트가 안 열림
test("A02-F-188 역할 확인 단계 판 화면 → 내 카드 우클릭해도 이모티콘 팔레트 안 열림, send_emoji 안 나감", async () => {
  const { me, socket } = await pageInRoleReveal()
  await dismissOverlays()
  RTL.fireEvent.contextMenu(cardOf(me.nickname))
  await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
  assert.equal(RTL.screen.queryByRole("button", { name: "안녕 보내기" }) === null, true, "이모티콘 칸이 뜸")
  assert.equal(socket.sent.some((s) => s.event === "send_emoji"), false)
})

test("A02-F-189 역할 확인 단계 판 화면 → 투표·준비 단추 없음", async () => {
  const { seats, me } = await pageInRoleReveal()
  await dismissOverlays()
  for (const name of ["투표 시작 준비", "준비 완료", "기권", "투표하기"]) {
    assert.equal(RTL.screen.queryByRole("button", { name }) === null, true, name)
  }
  // 남의 카드를 눌러도 투표 항목 없음
  const other = seats.find((p) => p.uuid !== me.uuid)
  RTL.fireEvent.click(cardOf(other.nickname))
  assert.equal(RTL.screen.queryByRole("menuitem", { name: "투표하기" }) === null, true, "투표하기 없음")
})

test("A02-F-190 역할 창이 열린 채 첫 낮 알림 → 역할 창 없음, \"낮이 되었습니다\" 글", async () => {
  const { gameId } = await pageInRoleReveal()
  RTL.act(() => {
    useInGameStore.getState().applyPhaseChanged({ gameId, phase: "DAY", dayIndex: 1, dayPhaseDeadline: Date.now() + 60_000 })
  })
  await waitUntil(() => revealDialog() === null, { what: "역할 창 닫힘" })
  await waitUntil(() => RTL.screen.queryByText("낮이 되었습니다") !== null, { what: "낮 안내 글" })
})

test("A02-F-191 가짜 시계 10초 → 역할 창 없음", async () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  const seats = seatPlayers(autoCounts(6), { gameTag: "f191" })
  const me = firstOf(seats, "DOCTOR")
  installSocket()
  loginAs(me)
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(seats, me, { gameId: nextGameId("f191") })) })
  renderInGamePage()
  // 그리기 뒤 남은 예약(첫 프레임 등) 돌림
  RTL.act(() => { mock.timers.tick(0) })
  assert.ok(revealDialog() !== null, "처음엔 역할 창 열림")
  RTL.act(() => { mock.timers.tick(9_999) })
  assert.ok(revealDialog() !== null, "9,999ms엔 아직 열림")
  RTL.act(() => { mock.timers.tick(1) })
  // 10초 판정은 가짜 시계로 끝, 창이 빠지는 그리기는 진짜 시계로 돌려서 기다림
  // (닫힌 뒤 가짜 시계를 더 넘기면 0ms 예약이 끝없이 다시 걸려 안 끝남)
  mock.timers.reset()
  await waitUntil(() => revealDialog() === null, { what: "역할 창 닫힘" })
})

test("A02-F-192 첫 판 의사(동료 B) 끝 → 둘째 판 시민 → 창 다시 뜸, B 이름·\"동료\" 글 없음", async () => {
  const first = seatCode("J1D2C3", { gameTag: "f192" })
  const [, b] = ofRole(first, "DOCTOR")
  await pageInRoleReveal({ seats: first, role: "DOCTOR" })
  assert.match(revealDialog().textContent, new RegExp(b.nickname))
  await dismissOverlays()
  await waitUntil(() => revealDialog() === null, { what: "첫 판 역할 창 닫힘" })

  // 둘째 판(J1D1C4): 나는 시민, B는 혼자 의사
  const me = ofRole(first, "DOCTOR")[0]
  const second = first.map((p) => (p.uuid === me.uuid ? { ...p, role: "CITIZEN" } : p))
  const meSecond = second.find((p) => p.uuid === me.uuid)
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(second, meSecond, { gameId: nextGameId("f192-2nd") })) })
  await waitUntil(() => revealDialog() !== null, { what: "둘째 판 역할 창 뜸" })
  const text = revealDialog().textContent
  assert.match(text, /귀족/)
  assert.doesNotMatch(text, new RegExp(b.nickname))
  assert.doesNotMatch(text, /동료/)
})

// 입장 준비 덮개: 역할 확인(ROLE_REVEAL) 동안 화면을 어둡게 하고 "가면무도회에 입장하는 중입니다." (역할 창은 위에 그대로)
const ENTRY_TEXT = "가면무도회에 입장하는 중입니다."
const entryCover = () => document.querySelector("[data-ingame-entry-preparing]")

test("A02-F-227 역할 확인 단계 판 화면 → 입장 준비 덮개(상태 알림·바쁨) + \"가면무도회에 입장하는 중입니다.\", 역할 창을 닫아도 남음", async () => {
  await pageInRoleReveal()
  assert.ok(entryCover() !== null, "덮개 없음")
  assert.equal(entryCover().getAttribute("role"), "status")
  assert.equal(entryCover().getAttribute("aria-busy"), "true")
  assert.equal(entryCover().textContent, ENTRY_TEXT)
  await dismissOverlays()
  await waitUntil(() => revealDialog() === null, { what: "역할 창 닫힘" })
  assert.ok(entryCover() !== null, "역할 창을 닫자 덮개가 사라짐")
})

test("A02-F-228 입장 준비 덮개가 뜬 채 첫 낮 알림 → 덮개 없어짐", async () => {
  const { gameId } = await pageInRoleReveal()
  assert.ok(entryCover() !== null, "덮개가 처음부터 없음 (준비 잘못)")
  RTL.act(() => {
    useInGameStore.getState().applyPhaseChanged({ gameId, phase: "DAY", dayIndex: 1, dayPhaseDeadline: Date.now() + 60_000 })
  })
  await waitUntil(() => entryCover() === null, { what: "덮개 닫힘" })
  assert.equal(document.body.textContent.includes(ENTRY_TEXT), false)
})

test("A02-F-229 역할 확인 단계 시간 바 → 단계 글 없이도 빈 명패 + 타이머 판(role=timer) 보임", async () => {
  await pageInRoleReveal()
  const timebar = document.querySelector('[aria-label$="시간 흐름"]')
  assert.ok(timebar !== null, "시간 바 없음")
  const strip = timebar.querySelector("[data-ingame-chat-phase-timer-strip]")
  assert.ok(strip !== null, "명패+타이머 판 없음")
  assert.equal(strip.querySelector("p")?.textContent, "")
  assert.ok(strip.querySelector('[role="timer"]') !== null, "타이머 숫자 칸 없음")
})
