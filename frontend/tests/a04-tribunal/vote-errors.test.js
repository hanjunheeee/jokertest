// 재판 표 보내기 결과 시험: 서버 거절 코드마다 우리말 까닭 글·5초 응답 없음·성공 답이면 낸 표로 바뀜
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-014~033
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useFakeClock, tick } from "./tribunalTable.mjs"

test.afterEach(resetTable)

// 재판 중인 판 + 조작 묶음 (나는 1번 자리 시민, 3번 자리가 피고)
async function tribunalTable(n) {
  const t = await openTable({ n, view: "actions" })
  await t.openTribunal(3)
  return t
}

// 단추 함수로 표 하나 보냄 (서버 답 전까지 보내는 중)
async function send(t, vote = "GUILTY") {
  await RTL.act(async () => {
    t.ctx().submitTribunalVote(vote)
  })
}

// 서버 거절 코드 → 화면 글 (화면 문구 voteSubmitPatch.js)
const REJECTIONS = [
  ["A04-F-014", "TRIBUNAL_ALREADY_RESOLVED", "재판이 이미 판정되어 투표할 수 없습니다."],
  ["A04-F-015", "TRIBUNAL_VOTE_ALREADY_SUBMITTED", "이미 표를 냈습니다. 낸 표는 바꿀 수 없습니다."],
  ["A04-F-016", "DEFENDANT_CANNOT_VOTE", "재판에 오른 사람은 투표할 수 없습니다."],
  ["A04-F-017", "PLAYER_NOT_ALIVE", "죽은 사람은 투표할 수 없습니다."],
  ["A04-F-018", "INVALID_PHASE", "재판이 끝나 투표할 수 없습니다."],
  ["A04-F-019", "STALE_DAY_INDEX", "지난 재판이라 투표할 수 없습니다."],
  ["A04-F-020", "INVALID_TRIBUNAL_VOTE", "유죄나 무죄만 고를 수 있습니다."],
  ["A04-F-021", "NOT_IN_SESSION", "지금 참여 중인 판이 아니라 투표할 수 없습니다."],
  ["A04-F-022", "STALE_SESSION_MISMATCH", "지금 참여 중인 판이 아니라 투표할 수 없습니다."],
  ["A04-F-023", "STALE_SOCKET", "다른 창에서 접속 중이라 이 창에서는 투표할 수 없습니다."],
  ["A04-F-024", "INVALID_GAME_ID", "잘못된 요청입니다. 다시 시도해주세요."],
  ["A04-F-025", "INVALID_DAY_INDEX", "잘못된 요청입니다. 다시 시도해주세요."],
  ["A04-F-026", "INVALID_PAYLOAD", "잘못된 요청입니다. 다시 시도해주세요."],
  ["A04-F-027", "INTERNAL_ERROR", "서버에서 처리하지 못했습니다. 다시 시도해주세요."],
]

REJECTIONS.forEach(([id, code, text]) => {
  test(`${id} 6명 판: 서버 거절 ${code} → "${text}", 상태 idle`, async () => {
    const t = await tribunalTable(6)
    await send(t)
    // 서버 글은 영어로 와도 화면은 정해 둔 우리말 글을 씀
    await t.answer("cast_tribunal_vote", { ok: false, code, message: "server says no" })
    assert.equal(t.ctx().tribunalVoteError, text)
    assert.equal(t.ctx().tribunalVoteStatus, "idle")
  })
})

test("A04-F-028 6명 판: 표에 없는 코드 X·글 \"점검 중\" → 서버 글 \"점검 중\"", async () => {
  const t = await tribunalTable(6)
  await send(t)
  await t.answer("cast_tribunal_vote", { ok: false, code: "X", message: "점검 중" })
  assert.equal(t.ctx().tribunalVoteError, "점검 중")
  assert.equal(t.ctx().tribunalVoteStatus, "idle")
})

test("A04-F-029 6명 판: 코드 없음·글 \"\" → \"제출하지 못했습니다. 다시 시도해주세요.\"", async () => {
  const t = await tribunalTable(6)
  await send(t)
  await t.answer("cast_tribunal_vote", { ok: false, message: "" })
  assert.equal(t.ctx().tribunalVoteError, "제출하지 못했습니다. 다시 시도해주세요.")
})

test("A04-F-030 7명 판: 보낸 뒤 5초 응답 없음 → \"요청 시간이 초과되었습니다.\", 상태 idle", async () => {
  useFakeClock()
  const t = await tribunalTable(7)
  await send(t)
  await tick(5_000)
  assert.equal(t.ctx().tribunalVoteError, "요청 시간이 초과되었습니다.")
  assert.equal(t.ctx().tribunalVoteStatus, "idle")
})

test("A04-F-031 7명 판: 보낸 뒤 4.9초엔 아직 보내는 중, 글 없음", async () => {
  useFakeClock()
  const t = await tribunalTable(7)
  await send(t)
  await tick(4_900)
  assert.equal(t.ctx().tribunalVoteStatus, "submitting")
  assert.equal(t.ctx().tribunalVoteError, null)
})

;[
  ["A04-F-032", "GUILTY"],
  ["A04-F-033", "NOT_GUILTY"],
].forEach(([id, vote]) => {
  test(`${id} 8명 판: 성공 답 { ok: true, vote: ${vote} } → 상태 submitted·낸 표 ${vote}`, async () => {
    const t = await tribunalTable(8)
    await send(t, vote)
    await t.answer("cast_tribunal_vote", t.voteOk(vote))
    assert.equal(t.ctx().tribunalVoteStatus, "submitted")
    assert.equal(t.ctx().tribunalVoteSubmittedVote, vote)
  })
})
