// 방 만들기 누르기 시험(게임 설정 화면 전체 + 가짜 소켓): 폼 값이 create_room으로 감, 만드는 중 꺼짐, 거절 알림, 단추 이름, 뒤로, 탭 바꿔도 값 남음
// 목록 A01a "화면 PC" A01-F-149~154
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup, waitFor, act } = await import("@testing-library/react")
const { default: GameSetupPage } = await import("../../src/domains/game/setup/pages/GameSetupPage.jsx")
const H = await import("./a01a-helpers.mjs")

const MAX = "최대 플레이어 수"
const JOKER = "광대(마피아) 플레이어 수"

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs()
  H.signIn("host")
})
test.afterEach(() => cleanup())

// 로그인한 방장이 게임 설정 화면을 엶
function openSetup(createAnswer) {
  const socket = H.useFakeSocket()
  if (createAnswer !== undefined) socket.answer("create_room", createAnswer)
  const view = H.renderAt("/game-setup", React.createElement(GameSetupPage))
  return { socket, ...view }
}

test("A01-F-149 정원 7·코드·광대 1 고르고 '게임 만들기' → 받은 create_room 값이 그 값", async () => {
  const { socket } = openSetup()
  H.stepTo(MAX, 7)
  fireEvent.click(screen.getByRole("checkbox", { name: "코드로만 참가" }))
  H.stepTo(JOKER, 1)
  H.press("게임 만들기")
  await waitFor(() => assert.equal(socket.sentOf("create_room").length, 1))
  const sent = socket.sentOf("create_room")[0]
  assert.equal(sent.maxPlayers, 7)
  assert.equal(sent.accessType, "code")
  assert.equal(sent.jokerCount, 1)
})

test("A01-F-150 답 오기 전 → '게임 만들기' 꺼짐", async () => {
  const later = H.deferred()
  openSetup(() => later.promise)
  H.press("게임 만들기")
  await waitFor(() => assert.equal(H.buttonNamed("게임 만들기").disabled, true))
  await act(async () => later.resolve({ ok: false, code: "INVALID_REQUEST", message: "잘못된 요청입니다." }))
})

test("A01-F-151 답 DESERTION_COOLDOWN → 알림 창 가짜가 받은 글 = '탈주로 4분 59초 뒤에 참여할 수 있습니다.'", async () => {
  openSetup({ ok: false, code: "DESERTION_COOLDOWN", message: "탈주로 4분 59초 뒤에 참여할 수 있습니다.", retryAfterMs: 299000 })
  H.press("게임 만들기")
  await waitFor(() => assert.deepEqual(H.alerts, ["탈주로 4분 59초 뒤에 참여할 수 있습니다."]))
})

test("A01-F-152 [지금 동작] '게임 만들기'·정원 +/− 단추가 화면 읽기 이름으로 찾아짐", () => {
  openSetup()
  assert.ok(screen.getByRole("button", { name: "게임 만들기" }))
  assert.ok(screen.getByRole("button", { name: `${MAX} 증가` }))
  assert.ok(screen.getByRole("button", { name: `${MAX} 감소` }))
})

test("A01-F-153 [지금 동작] 뒤로(취소) 단추 → 방 목록 쪽으로, create_room 안 보냄", async () => {
  const { socket, where } = openSetup()
  fireEvent.click(screen.getByRole("button", { name: "멀티플레이 선택으로 돌아가기" }))
  await waitFor(() => assert.equal(where.path, "/multiplay"))
  assert.equal(socket.sentOf("create_room").length, 0)
})

test("A01-F-154 [지금 동작] 일반 탭 정원 6 → 회의 탭 → 일반 탭 → 6 그대로", () => {
  openSetup()
  H.stepTo(MAX, 6)
  fireEvent.click(screen.getByRole("button", { name: "회의&투표" }))
  fireEvent.click(screen.getByRole("button", { name: "일반" }))
  assert.equal(H.stepperValue(MAX), 6)
})
