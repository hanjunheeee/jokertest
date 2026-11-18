// 낮 투표 "투표취소"(표 거두기)와 "기권" 단추 — 화면 부품 시험 (사용자 결정 2026-11-18)
// "투표취소"는 기권 표가 아니라 withdraw_day_vote로 표를 거둠, 기권 단추는 사람을 찍은 뒤에도 눌리고 기권한 뒤엔 꺼짐
// 목록 A03-낮투표.md 번호 A03-F-273~280
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, abstainButton, buttonByName, click, deferred, fakeSocket, fire, loginOnly, readCardMenu, renderPage,
  renderPanel, resetAll, seat, snapshot, uuidOf, voteVia,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const progressLine = () => document.querySelector('[role="dialog"][aria-label="투표 현황"] [data-testid="vote-status-progress"]')?.textContent ?? null

// 서버가 표·거두기 때마다 판 전원 각자에게 보내는 진행 알림 (mine: 받는 사람 자기 표 칸)
let seq = 0
const progressOf = (doneCount, requiredCount, mine = { hasSubmittedDayVote: false, dayVoteTargetUuid: null }) => {
  seq += 1
  return {
    gameId: GAME,
    phase: "DAY",
    dayIndex: 1,
    participationRevision: 0,
    selfProgressSeq: seq,
    progress: { kind: "DAY_VOTE", doneCount, requiredCount },
    self: { ...mine, dayVoteRound: 1 },
  }
}

// 6명 판 1일 투표 중, 나는 0번 시민 (조작 값 엿보기 있는 판)
async function votingPanel({ acks = {} } = {}) {
  const socket = fakeSocket({ acks })
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
  const sink = await renderPanel(socket)
  return { socket, sink }
}

test("A03-F-273 ① 3번에 표 낸 뒤 기권 단추 켜짐 → 누르면 기권(대상 null) 보냄, 낸 표가 기권으로 바뀜", async () => {
  const { socket, sink } = await votingPanel()
  assert.equal(await voteVia(3), true)
  assert.equal(abstainButton()?.disabled, false, "표 낸 뒤 기권 단추가 꺼짐")
  await click(abstainButton())
  assert.deepEqual(socket.sentOf("cast_day_vote").map((p) => p.targetId), [uuidOf(3), null])
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, null)
})

test("A03-F-274 ② 기권한 뒤 → 기권 단추 꺼짐·까닭 글 '이미 기권했습니다', 다른 카드엔 '투표하기' 그대로", async () => {
  await votingPanel()
  await click(abstainButton())
  assert.equal(abstainButton()?.disabled, true)
  assert.equal(abstainButton()?.getAttribute("title"), "이미 기권했습니다")
  assert.equal(await voteVia(2), true, "기권한 뒤 다른 사람 찍기")
  assert.equal(abstainButton()?.disabled, false, "다시 사람을 찍으면 기권 단추 켜짐")
})

test("A03-F-275 ③ 3번 카드 '투표취소' → withdraw_day_vote { gameId } 보냄, 기권 표는 안 보냄", async () => {
  const { socket } = await votingPanel()
  await voteVia(3)
  assert.equal(await voteVia(3, "투표취소"), true)
  assert.deepEqual(socket.sentOf("withdraw_day_vote"), [{ gameId: GAME }])
  assert.deepEqual(socket.sentOf("cast_day_vote").map((p) => p.targetId), [uuidOf(3)], "기권 표가 나감")
})

test("A03-F-276 ④ 투표취소 ok → '안 낸' 상태: 3번 카드 다시 '투표하기', 기권 단추 켜짐", async () => {
  const { sink } = await votingPanel()
  await voteVia(3)
  await voteVia(3, "투표취소")
  assert.equal(sink.ctx.dayVoteHasSubmitted, false)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, null)
  const items = await readCardMenu(3)
  assert.deepEqual(items.map((i) => i.name), ["투표하기"])
  assert.equal(abstainButton()?.disabled, false)
})

test("A03-F-277 ⑤ 투표취소 거절 → 전에 낸 표 그대로(3번 '투표취소'), 거절 글 보임", async () => {
  const message = "요청을 처리할 수 없습니다."
  const { sink } = await votingPanel({ acks: { withdraw_day_vote: { ok: false, code: "DAY_VOTE_ALREADY_RESOLVED", message } } })
  await voteVia(3)
  await voteVia(3, "투표취소")
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, uuidOf(3))
  assert.equal(sink.ctx.dayVoteError?.code, "DAY_VOTE_ALREADY_RESOLVED")
  assert.equal(document.body.textContent.includes(message), true, "거절 글이 화면에 없음")
})

test("A03-F-278 ⑥ 거두기 답 기다리는 중 → 기권 단추 꺼짐, 다시 눌러도 한 번만 보냄", async () => {
  const ack = deferred()
  const { socket } = await votingPanel({ acks: { withdraw_day_vote: () => ack.promise } })
  await voteVia(3)
  await voteVia(3, "투표취소")
  assert.equal(abstainButton()?.disabled, true)
  await click(abstainButton())
  assert.equal(socket.sentOf("withdraw_day_vote").length, 1)
  assert.equal(socket.sentOf("cast_day_vote").length, 1)
  ack.resolve({ ok: true })
})

test("A03-F-279 ⑦ 투표 현황 창 2/6 → 내가 거둔 뒤 서버 진행 알림 1/6 → '1 / 6명 투표함'", async () => {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderPage(socket)
  await click(buttonByName("투표 현황 열기"))
  await voteVia(3)
  await fire(socket, "session_self_progress", progressOf(2, 6, { hasSubmittedDayVote: true, dayVoteTargetUuid: uuidOf(3) }))
  // 메뉴를 닫은 뒤 창이 그대로인지 보고, 없으면 다시 엶
  if (!progressLine()) await click(buttonByName("투표 현황 열기"))
  assert.equal(progressLine(), "2 / 6명 투표함")
  await voteVia(3, "투표취소")
  await fire(socket, "session_self_progress", progressOf(1, 6))
  if (!progressLine()) await click(buttonByName("투표 현황 열기"))
  assert.equal(progressLine(), "1 / 6명 투표함")
})

test("A03-F-280 ⑧ 거둔 뒤 새로고침(스냅샷 '안 냄', 1/6) → 기권 켜짐·3번 카드 '투표하기', 기권 상태 스냅샷 → 기권 꺼짐", async () => {
  const socket = fakeSocket({
    acks: {
      get_session_snapshot: snapshot({
        extra: { dayPhaseDeadline: Date.now() + 30_000, progress: { kind: "DAY_VOTE", doneCount: 1, requiredCount: 6 } },
        self: { hasSubmittedDayVote: false, dayVoteTargetUuid: null, dayVoteRound: 1 },
      }),
    },
  })
  loginOnly()
  await renderPage(socket)
  assert.equal(abstainButton()?.disabled, false)
  assert.deepEqual((await readCardMenu(3)).map((i) => i.name), ["투표하기"])
  resetAll()

  const abstained = fakeSocket({
    acks: {
      get_session_snapshot: snapshot({
        extra: { dayPhaseDeadline: Date.now() + 30_000 },
        self: { hasSubmittedDayVote: true, dayVoteTargetUuid: null, dayVoteRound: 1 },
      }),
    },
  })
  loginOnly()
  await renderPage(abstained)
  assert.equal(abstainButton()?.disabled, true)
})
