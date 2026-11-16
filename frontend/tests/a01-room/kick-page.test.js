// 화면 부품 시험: 대기방 화면의 "참가자 추방" — 방장·확인 끝이면 켜짐, 확인 전엔 꺼지고 까닭 글, 성공하면 창 사라짐, 방장 바뀜
// 목록 A01-F-636~647·721·729~730 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/kick-page.test.js
// 까닭 글 색은 클래스 값까지만 봄 (jsdom은 그림을 안 그림), 진짜 보이는지는 브라우저 시험 몫
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, act, cleanup, within } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { useFakeSocket, signIn, resetAll, roomOf, installDialogs, installFakeFetch, HOLD, flush, pressEnter, classColor, contrast } =
  await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => { cleanup(); resetAll() })

const KICK = "참가자 추방"

// 대기방 화면 그리기: me로 로그인, 방 확인 답은 verified면 바로 / 아니면 쥐고 있음
async function openPage({ me = "host", room = roomOf({ n: 5, max: 6 }), verified = true } = {}) {
  signIn(me)
  installDialogs(dom)
  installFakeFetch({ "GET /friends": { body: { data: [] } } })
  const fake = useFakeSocket()
  fake.answer("get_current_room", verified ? { ok: true, room } : HOLD)
  useMatchingStore.getState().setRoom(room)
  render(h(MemoryRouter, { initialEntries: ["/game-matching"] },
    h(Routes, null,
      h(Route, { path: "/game-matching", element: h(GameMatchingPage) }),
      h(Route, { path: "/multiplay", element: h("div", null, "방 목록") }),
    )))
  await act(async () => { await flush() })
  return { fake, room }
}

const kickDialog = () => screen.queryByRole("dialog", { name: "플레이어 추방" })
const kickButton = () => screen.queryByRole("button", { name: KICK })

test("A01-F-636 방장 + 확인 끝 → \"참가자 추방\" 켜짐, 클릭 → 추방 창 열림", async () => {
  await openPage()
  assert.equal(kickButton().disabled, false)
  fireEvent.click(kickButton())
  assert.ok(kickDialog())
})

test("A01-F-637 손님 화면엔 \"참가자 추방\" 단추 없음", async () => {
  await openPage({ me: "guest-1" })
  assert.equal(kickButton(), null)
})

test("A01-F-638 [버그 7] 방장 + 확인 전 → 단추 disabled + kick-locked-reason 글 (마우스 올림 글 아님)", async () => {
  await openPage({ verified: false })
  assert.equal(kickButton().disabled, true)
  assert.equal(kickButton().getAttribute("title"), null)
  const reason = screen.getByTestId("kick-locked-reason")
  assert.equal(reason.textContent, "방 정보를 서버에서 확인하는 중이라 아직 추방할 수 없습니다.")
})

test("A01-F-639 까닭 글과 단추가 이어짐: 단추 aria-describedby = 까닭 글 id", async () => {
  await openPage({ verified: false })
  const reason = screen.getByTestId("kick-locked-reason")
  assert.ok(reason.id)
  assert.equal(kickButton().getAttribute("aria-describedby"), reason.id)
})

test("A01-F-640 까닭 글 role=\"status\"", async () => {
  await openPage({ verified: false })
  assert.equal(screen.getByTestId("kick-locked-reason").getAttribute("role"), "status")
})

test("A01-F-641 확인 전 → 확인 끝 → kick-locked-reason 없음, 단추 켜짐", async () => {
  const { fake, room } = await openPage({ verified: false })
  assert.ok(screen.getByTestId("kick-locked-reason"))
  await act(async () => { fake.release("get_current_room", { ok: true, room }); await flush() })
  assert.equal(screen.queryByTestId("kick-locked-reason"), null)
  assert.equal(kickButton().disabled, false)
})

test("A01-F-642 까닭 글 칸에 밝은 글자·어두운 바탕 클래스", async () => {
  await openPage({ verified: false })
  const reason = screen.getByTestId("kick-locked-reason")
  const fg = classColor(reason.className, "text")
  const bg = classColor(reason.className, "bg")
  assert.ok(fg && bg, `색 클래스 없음 (${reason.className})`)
  assert.notEqual(fg, bg)
  assert.ok(contrast(fg, bg) >= 4.5, `대비 ${contrast(fg, bg).toFixed(2)}`)
})

test("A01-F-643 꺼진 단추 클릭 → 창 없음", async () => {
  await openPage({ verified: false })
  fireEvent.click(kickButton())
  assert.equal(kickDialog(), null)
})

test("A01-F-644 닫기 단추(읽기 이름 \"플레이어 추방 닫기\") 클릭 → 창 닫힘", async () => {
  await openPage()
  fireEvent.click(kickButton())
  const closeInDialog = within(kickDialog()).getByRole("button", { name: "플레이어 추방 닫기" })
  fireEvent.click(closeInDialog)
  assert.equal(kickDialog(), null)
})

test("A01-F-645 [버그 7] 창 열고 줄 클릭 → 성공 답 → 창 없음, 방장 단추 줄 다시 보임", async () => {
  const { fake } = await openPage()
  fake.answer("kick_room_player", { ok: true, status: "KICKED" })
  fireEvent.click(kickButton())
  await act(async () => { fireEvent.click(within(kickDialog()).getAllByRole("button", { name: "추방" })[0]); await flush() })
  assert.equal(fake.sentOf("kick_room_player").length, 1)
  assert.equal(kickDialog(), null)
  assert.ok(kickButton())
})

test("A01-F-646 거절 답 → 창 그대로 + kick-error", async () => {
  const { fake } = await openPage()
  fake.answer("kick_room_player", { ok: false, code: "ALREADY_LEFT" })
  fireEvent.click(kickButton())
  await act(async () => { fireEvent.click(within(kickDialog()).getAllByRole("button", { name: "추방" })[0]); await flush() })
  assert.ok(kickDialog())
  assert.equal(screen.getByTestId("kick-error").textContent, "이미 방에서 나간 참가자입니다.")
})

test("A01-F-647 창 떠 있는 동안 방장 단추 줄(방 설정 변경·참가자 추방) 안 그림", async () => {
  await openPage()
  assert.ok(screen.getByRole("button", { name: "방 설정 변경" }))
  fireEvent.click(kickButton())
  assert.equal(kickButton(), null)
  assert.equal(screen.queryByRole("button", { name: "방 설정 변경" }), null)
})

test("A01-F-721 꺼진 \"참가자 추방\"에 Enter → 창 없음 (jsdom 흉내)", async () => {
  await openPage({ verified: false })
  pressEnter(kickButton())
  assert.equal(kickDialog(), null)
})

test("A01-F-729 host_changed { 나 } + 확인 끝 → \"참가자 추방\" 켜짐, 열면 대상 = 나 뺀 사람", async () => {
  const { fake } = await openPage({ me: "guest-1" })
  assert.equal(kickButton(), null)
  await act(async () => {
    fake.serverSays("host_changed", { hostUuid: "guest-1", roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1", settingsVersion: 1 })
    await flush()
  })
  assert.equal(kickButton().disabled, false)
  fireEvent.click(kickButton())
  const rows = within(kickDialog()).getAllByRole("listitem")
  assert.equal(rows.length, 4)
  assert.equal(rows.some((row) => row.textContent.includes("사람2")), false, "나(사람2)는 대상에 없음")
})

test("A01-F-730 방장이 남에게 넘어간 알림 → \"참가자 추방\" 없음, 열려 있던 창 닫힘", async () => {
  const { fake } = await openPage()
  fireEvent.click(kickButton())
  assert.ok(kickDialog())
  await act(async () => {
    fake.serverSays("host_changed", { hostUuid: "guest-1", roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1", settingsVersion: 1 })
    await flush()
  })
  assert.equal(kickDialog(), null)
  assert.equal(kickButton(), null)
})
