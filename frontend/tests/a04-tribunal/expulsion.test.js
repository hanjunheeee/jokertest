// 추방 연출 상태 시험: 유죄면 처형된 사람으로 연출 시작, 무죄·취소면 없음, 같은 판정은 한 번, 연출이 끝나야 결과 화면으로
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-097~104
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, React, useFakeClock, tick, RESULT_PAGE_TEXT } from "./tribunalTable.mjs"

const { useInGameTribunalExpulsionPresentation } = await import("../../src/domains/game/ingame/hooks/useInGameTribunalExpulsionPresentation.js")
const {
  buildInGameTribunalExpulsionMessage,
  resolveInGameTribunalExpulsionNickname,
} = await import("../../src/domains/game/ingame/constants/ingameTribunalExpulsionPresentation.js")

test.afterEach(resetTable)

// 추방 연출 값 엿보기 (인게임 화면처럼 멈춤 없이 부름)
function ExpulsionProbe({ t }) {
  t.expulsion = useInGameTribunalExpulsionPresentation({ hold: false })
  return null
}
const expulsionView = (t) => React.createElement(ExpulsionProbe, { t })

// 재판 중인 판 + 추방 연출 엿보기 (나는 1번 자리)
async function tribunalTable(n, { defendant = 3, ...options } = {}) {
  const t = await openTable({ n, view: expulsionView, ...options })
  await t.openTribunal(defendant)
  return t
}

// 추방 영상 끝까지 보기: 영상 끝 → 멈춤 0.45초 → 어두워짐 1.6초 → 글 3.2초 (가짜 시계)
async function watchExpulsionToEnd() {
  const video = document.querySelector("[data-ingame-tribunal-expulsion] video")
  assert.ok(video, "추방 영상이 없음")
  await RTL.act(async () => {
    RTL.fireEvent(video, new window.Event("ended"))
  })
  await tick(450)
  await tick(0)
  await tick(1_600)
  await tick(3_200)
}

test("A04-F-097 6명 판: 유죄 알림 → 추방 연출 시작·대상 = 피고", async () => {
  const t = await tribunalTable(6)
  assert.equal(t.expulsion.open, false)
  await t.resolve("GUILTY")
  assert.equal(t.expulsion.open, true)
  assert.ok(t.expulsion.presentationId.includes(t.uuid(3)), "연출 대상이 피고가 아님")
  assert.match(t.expulsion.message, new RegExp(`\\[${t.nick(3)}\\]님이`))
})

test("A04-F-098 7명 판: 무죄 → 추방 연출 없음", async () => {
  const t = await tribunalTable(7)
  await t.resolve("NOT_GUILTY")
  assert.equal(t.expulsion.open, false)
  assert.equal(t.expulsion.pending, false)
})

test("A04-F-099 8명 판: 취소(CANCELLED) → 추방 연출 없음", async () => {
  const t = await tribunalTable(8)
  await t.resolve("CANCELLED")
  assert.equal(t.expulsion.open, false)
  assert.equal(t.expulsion.pending, false)
})

test("A04-F-100 5명 판: 닉네임 \"가면\" 처형 → \"[가면]님이 가면무도회에서 추방당하셨습니다.\"", async () => {
  const t = await tribunalTable(5, { defendant: 2, names: { 2: "가면" } })
  await t.resolve("GUILTY")
  assert.equal(t.expulsion.message, "[가면]님이 가면무도회에서 추방당하셨습니다.")
})

test("A04-F-101 6명 판: 명단에 없는 uuid면 기본 이름 \"[한 플레이어]님이…\"", async () => {
  const t = await tribunalTable(6)
  const name = resolveInGameTribunalExpulsionNickname(t.state().players, "a04-not-in-roster")
  assert.equal(buildInGameTribunalExpulsionMessage(name), "[한 플레이어]님이 가면무도회에서 추방당하셨습니다.")
})

test("A04-F-102 7명 판: 같은 유죄 알림 두 번이어도 연출 시작 1번", async () => {
  const t = await tribunalTable(7)
  const payload = await t.resolve("GUILTY")
  const firstId = t.expulsion.presentationId
  assert.equal(t.expulsion.open, true)
  await RTL.act(async () => {
    t.expulsion.consume(firstId)
  })
  assert.equal(t.expulsion.open, false)
  await t.say("tribunal_vote_resolved", payload)
  assert.equal(t.expulsion.open, false)
  assert.equal(t.expulsion.pending, false)
})

test("A04-F-103 5명 판: 마지막 광대 처형 → 추방 연출이 끝나기 전엔 결과 화면으로 안 감", async () => {
  useFakeClock()
  const t = await openTable({ n: 5, view: "page" })
  await t.openTribunal(0)
  await t.resolve("GUILTY", { ended: "CITIZEN" })
  assert.equal(t.state().phase, "ENDED")
  assert.notEqual(document.querySelector("[data-ingame-tribunal-expulsion]"), null)
  await tick(2_000)
  assert.equal(t.path(), "/ingame")
  assert.deepEqual(t.navigations, [])
  assert.equal(RTL.screen.queryByText(RESULT_PAGE_TEXT), null)
})

test("A04-F-104 5명 판: 추방 연출 끝 → 결과 화면으로 한 번 이동", async () => {
  useFakeClock()
  const t = await openTable({ n: 5, view: "page" })
  await t.openTribunal(0)
  await t.resolve("GUILTY", { ended: "CITIZEN" })
  await watchExpulsionToEnd()
  assert.equal(t.path(), "/gameresult")
  assert.notEqual(RTL.screen.queryByText(RESULT_PAGE_TEXT), null)
  // 이동은 한 번만
  assert.deepEqual(t.navigations, ["/gameresult"])
})
