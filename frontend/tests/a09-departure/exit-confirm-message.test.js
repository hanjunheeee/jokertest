// 나가기 확인 창 글 고르기 시험(화면 상태): 단계 × 내 상태마다 산 사람 글·죽은 사람 글·벌 없는 글, 결과 화면 글, 누르는 순간 판 상태로 고름
// 목록 A09-끊김-나가기-탈주.md A09-F-001~036·180, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/exit-confirm-message.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { selectExitConfirmMessage } = await import("../../src/domains/game/ingame/utils/exitConfirm.js")

test.afterEach(() => K.reset())

// 산 사람 글에 꼭 있어야 할 것 (결정 "나가기 창": 패배·골드·탈주 제한)
const LOSS_LINE = "지금 나가면 패배로 기록되고 골드를 못 받습니다."
const LIMIT_LINE = "오늘 1번째 5분, 2번째 30분, 3번째부터 1일"
const DEAD_LINE = "사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다."

// 6명 판 판 상태 (스토어 모양: alive·isConnected·isParticipating), 나는 0번 자리
function gameStateFor(phase, dayPhase, myState) {
  const players = Array.from({ length: 6 }, (_, i) => ({
    uuid: `me-${i}`,
    nickname: K.NICKS[i],
    alive: true,
    isConnected: true,
    isParticipating: true,
  }))
  if (myState === "산·끊김") players[0].isConnected = false
  if (myState === "죽음") players[0].alive = false
  if (myState === "판에서 빠짐") Object.assign(players[0], { alive: false, isConnected: false, isParticipating: false })
  return {
    id: "a09-g",
    phase,
    dayIndex: 1,
    dayPhase: phase === "DAY" ? dayPhase : null,
    players,
    self: { uuid: "me-0", role: "CITIZEN", team: "CITIZEN" },
  }
}

// 표: 단계 6 × 내 상태 5 (값 30)
const PHASES = [
  ["역할 확인", "ROLE_REVEAL", null],
  ["낮 토론", "DAY", "DAY_DISCUSSION"],
  ["낮 투표", "DAY", "DAY_VOTE"],
  ["재판", "TRIBUNAL", null],
  ["밤", "NIGHT", null],
  ["판 끝", "ENDED", null],
]
const STATES = ["산·연결", "산·끊김", "죽음", "판에서 빠짐", "내 자리 없음"]

// 기대: 진행 중 산 사람 2종 = 산 사람 글, 진행 중 죽음 = 죽은 사람 글, 빠짐·자리 없음·판 끝 = 패배·탈주 글 없음
function expectedKind(phase, myState) {
  if (phase === "ENDED") return "벌 없음"
  if (myState === "산·연결" || myState === "산·끊김") return "산 사람"
  if (myState === "죽음") return "죽은 사람"
  return "벌 없음"
}

let no = 1
for (const [phaseName, phase, dayPhase] of PHASES) {
  for (const myState of STATES) {
    const id = `A09-F-${String(no).padStart(3, "0")}`
    no += 1
    const kind = expectedKind(phase, myState)
    test(`${id} ${phaseName} · 내 상태 ${myState} → ${kind} 글`, () => {
      const gameState = gameStateFor(phase, dayPhase, myState)
      const selfUuid = myState === "내 자리 없음" ? "outsider-uuid" : "me-0"
      const message = selectExitConfirmMessage({ gameState, selfUuid })
      if (kind === "산 사람") {
        assert.ok(message.includes(LOSS_LINE), `패배·골드 글 없음: ${message}`)
        assert.ok(message.includes(LIMIT_LINE), `탈주 제한 글 없음: ${message}`)
        assert.equal(message.includes(DEAD_LINE), false)
      } else if (kind === "죽은 사람") {
        assert.ok(message.includes(DEAD_LINE), `죽은 사람 글 없음: ${message}`)
        assert.equal(message.includes("패배"), false)
        assert.equal(message.includes(LIMIT_LINE), false)
      } else {
        assert.equal(message.includes("패배"), false, `패배 글이 있음: ${message}`)
        assert.equal(message.includes("탈주"), false, `탈주 글이 있음: ${message}`)
        assert.equal(message.includes("다른 방에 들어갈 수 없습니다"), false)
      }
    })
  }
}

test("A09-F-031 결과 화면(onResultScreen true) → \"로비로 나가시겠습니까?\"", () => {
  const message = selectExitConfirmMessage({ onResultScreen: true, gameState: gameStateFor("ENDED", null, "산·연결"), selfUuid: "me-0" })
  assert.equal(message, "로비로 나가시겠습니까?")
})

test("A09-F-032 판 상태 null → 패배·탈주 글 없음", () => {
  const message = selectExitConfirmMessage({ gameState: null, selfUuid: "me-0" })
  assert.equal(message.includes("패배"), false)
  assert.equal(message.includes("탈주"), false)
  assert.equal(message.includes("다른 방에 들어갈 수 없습니다"), false)
})

// 산 사람 글 세 줄 (값 3)
const ALIVE_LINES = [
  ["A09-F-033", "게임에서 나가시겠습니까?"],
  ["A09-F-034", LOSS_LINE],
  ["A09-F-035", LIMIT_LINE],
]
for (const [id, line] of ALIVE_LINES) {
  test(`${id} 낮 투표 중 산 사람 글에 "${line}"`, () => {
    const message = selectExitConfirmMessage({ gameState: gameStateFor("DAY", "DAY_VOTE", "산·연결"), selfUuid: "me-0" })
    assert.ok(message.includes(line), `받은 글: ${message}`)
  })
}

test("A09-F-036 밤 죽은 사람 글 → 벌 없음 안내, 패배 글 없음", () => {
  const message = selectExitConfirmMessage({ gameState: gameStateFor("NIGHT", null, "죽음"), selfUuid: "me-0" })
  assert.ok(message.includes(DEAD_LINE), `받은 글: ${message}`)
  assert.equal(message.includes("패배"), false)
})

test("A09-F-180 7명 판 산 상태로 연 뒤 재판에서 처형됨 → 나가기 누름 → 확인 창 글 = 죽은 사람 글", async () => {
  const t = K.seat({ n: 7, me: 2, jokers: [0], phase: "TRIBUNAL", defendant: 2 })
  const api = await K.renderExitProbe()
  // 서버: 재판 유죄 → 나(피고) 처형, 밤으로
  await t.say("tribunal_vote_resolved", {
    gameId: t.gameId, dayIndex: 1, phase: "NIGHT", defendantUuid: t.me,
    outcome: "GUILTY", executedUuid: t.me,
  })
  assert.equal(t.player(2).alive, false, "처형이 판 값에 반영됨")
  K.dialogs.confirmAnswer = false
  await K.call(() => api.current.requestExit())
  assert.equal(K.dialogs.confirms.length, 1)
  assert.ok(K.dialogs.confirms[0].includes(DEAD_LINE), `받은 글: ${K.dialogs.confirms[0]}`)
  assert.equal(K.dialogs.confirms[0].includes("패배"), false)
})
