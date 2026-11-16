// 결과판 값 만들기 시험: 내 편 승패·직업 이름·줄 수·줄마다 골드·골드 글·이긴 진영 글·스냅샷으로 받아도 같은 값·내가 목록에 없을 때
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-F-014~038·040 (화면 상태)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./resultKit.mjs"

const { buildGameResultViewModel } = await import("../../src/domains/game/result/utils/buildGameResultViewModel.js")
const { formatGoldRewardLabel, resolveWinningTeamLabel } = await import("../../src/domains/game/result/constants/gameResultLabels.js")
const { normalizePublicWinResult } = await import("../../src/domains/game/ingame/utils/normalizePublicWinResult.js")

test.afterEach(K.resetAll)

// n명 판 공개 값 (자리 순서 직업, 기본 0번 광대·나머지 시민)
const winOf = (n, winner, { roles = null, gold = 1 } = {}) => K.winResultOf(K.seatsOf({ n, roles }), winner, gold)

test("A07-F-014 내 편이 이겼나: 내 팀 = 이긴 팀 → win", () => {
  const win = winOf(5, "CITIZEN")
  assert.equal(buildGameResultViewModel(win, win.reveals[2].uuid).outcome, "win")
})

test("A07-F-015 내 편이 이겼나: 내 팀 ≠ 이긴 팀 → lose", () => {
  const win = winOf(6, "CITIZEN")
  // 0번 = 광대 (진 편)
  assert.equal(buildGameResultViewModel(win, win.reveals[0].uuid).outcome, "lose")
})

test("A07-F-016 승자 없음이면 패배·진영 띠 없음: winner 없음 → lose, 이긴 진영 null", () => {
  const win = winOf(7, "CITIZEN")
  delete win.winner
  const vm = buildGameResultViewModel(win, win.reveals[3].uuid)
  assert.equal(vm.outcome, "lose")
  assert.equal(vm.winningTeam, null)
})

// 결과판 직업 이름 (결정 "결과 화면 — 마녀사냥꾼 이름", 시민은 지금 이름 "귀족" 그대로)
const JOB_CASES = [
  ["A07-F-017", "JOKER", "광대"],
  ["A07-F-018", "CITIZEN", "귀족"],
  ["A07-F-019", "DOCTOR", "주치의"],
  ["A07-F-020", "GUARD", "경비원"],
  ["A07-F-021", "WITCH_HUNTER", "마녀사냥꾼"],
]
for (const [no, role, label] of JOB_CASES) {
  test(`${no} 결과판 직업 이름: ${role} → "${label}"`, () => {
    // 10명 판, 2번 자리를 그 직업으로
    const roles = ["JOKER", "JOKER", role, "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN"]
    const win = winOf(10, "CITIZEN", { roles })
    const vm = buildGameResultViewModel(win, win.reveals[3].uuid)
    assert.equal(vm.players[2].job, label)
  })
}

// 결과판 줄 수 = 공개 줄 수 (5~10명)
for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
  const no = `A07-F-${String(22 + i).padStart(3, "0")}`
  test(`${no} 결과판 줄 수 = 공개 줄 수: 공개 ${n}줄 → 줄 ${n}개`, () => {
    const win = winOf(n, "JOKER")
    const vm = buildGameResultViewModel(win, win.reveals[1].uuid)
    assert.equal(vm.players.length, n)
    assert.deepEqual(vm.players.map((p) => p.id), win.reveals.map((r) => r.uuid))
  })
}

test("A07-F-028 줄마다 받은 골드 실림: 공개 줄 골드 1·0 섞임 → 결과판 줄 골드도 같은 자리 1·0", () => {
  const gold = [1, 0, 1, 1, 0, 1, 0, 1]
  const win = winOf(8, "CITIZEN", { gold })
  const vm = buildGameResultViewModel(win, win.reveals[1].uuid)
  assert.deepEqual(vm.players.map((p) => p.goldReward), gold)
})

// 골드 글 ("+1골드", 못 받으면 없음)
const GOLD_LABEL_CASES = [
  ["A07-F-029", 1, "+1골드"],
  ["A07-F-030", 2, "+2골드"],
  ["A07-F-031", 100, "+100골드"],
  ["A07-F-032", 0, null],
  ["A07-F-033", -1, null],
  ["A07-F-034", 1.5, null],
]
for (const [no, value, expected] of GOLD_LABEL_CASES) {
  test(`${no} 골드 글 만들기: ${value} → ${expected === null ? "없음" : `"${expected}"`}`, () => {
    assert.equal(formatGoldRewardLabel(value), expected)
  })
}

test("A07-F-035 이긴 진영 글: CITIZEN → \"시민 진영 승리\"", () => {
  assert.equal(resolveWinningTeamLabel("CITIZEN"), "시민 진영 승리")
})

test("A07-F-036 이긴 진영 글: JOKER → \"광대 진영 승리\"", () => {
  assert.equal(resolveWinningTeamLabel("JOKER"), "광대 진영 승리")
})

test("A07-F-037 모르는 진영 글 없음: \"NONE\" → 없음", () => {
  assert.equal(resolveWinningTeamLabel("NONE"), null)
  // 결과판 값에도 이긴 진영이 없음
  const win = winOf(5, "CITIZEN")
  win.winner = "NONE"
  assert.equal(buildGameResultViewModel(win, win.reveals[1].uuid).winningTeam, null)
})

test("A07-F-038 6명 판: 판 끝 알림으로 받은 결과판 = 스냅샷으로 받은 결과판", async () => {
  // 1) 밤 판(광대 2, 5번은 앞서 죽음) → 이 밤에 4번이 죽어 산 광대 2 = 나머지 2 → 서버가 판 끝 알림 (밤 결과 + 판 끝 칸)
  const sock = K.installFakeSocket()
  const g = K.liveGame({ n: 6, me: 2, roles: ["JOKER", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN", "CITIZEN"], dead: [5], phase: "NIGHT", dayIndex: 1 })
  await K.renderAt("/ingame", K.h("p", null, "판 화면 (시험 자리)"))
  const resultClosesAt = Date.now() + 180_000
  const endSeats = g.seats.map((s, i) => ({ ...s, alive: i === 4 ? false : s.alive }))
  const gold = [1, 1, 1, 1, 1, 1]
  await sock.serverSays("night_result_applied", {
    gameId: g.gameId,
    phase: "ENDED",
    dayIndex: 1,
    players: endSeats.map((s) => ({ uuid: s.uuid, isAlive: s.alive })),
    victimUuid: endSeats[4].uuid,
    deathReveals: [{ victimUuid: endSeats[4].uuid, source: "JOKER" }],
    doctorSaved: false,
    winResult: K.winResultOf(endSeats, "JOKER", gold),
    resultClosesAt,
  })
  const fromEvent = K.useInGameStore.getState().state
  assert.equal(fromEvent?.phase, "ENDED")
  const eventBoard = JSON.stringify(buildGameResultViewModel(fromEvent.winResult, g.meUuid, fromEvent.self?.team))

  // 2) 새로고침: 화면 판 값을 비우고 같은 판 스냅샷으로 다시 채움
  K.RTL.cleanup()
  K.useInGameStore.getState().clearGame()
  const snapshot = K.endedSnapshotOf({ gameId: g.gameId, seats: endSeats, me: 2, winner: "JOKER", gold, resultClosesAt, dayIndex: 1 })
  K.useInGameStore.getState().bootstrapSessionSnapshot(snapshot, null)
  const fromSnapshot = K.useInGameStore.getState().state
  assert.equal(fromSnapshot?.phase, "ENDED")
  const snapshotBoard = JSON.stringify(buildGameResultViewModel(fromSnapshot.winResult, g.meUuid, fromSnapshot.self?.team))

  assert.equal(snapshotBoard, eventBoard)
  // 같다는 것이 빈 값끼리 같은 게 아님
  assert.equal(JSON.parse(eventBoard).players.length, 6)
  assert.equal(JSON.parse(eventBoard).outcome, "lose")
})

test("A07-F-040 공개 목록에 내가 없으면 넘겨받은 팀으로: 내 uuid 없음 + 넘겨받은 팀 JOKER, 승자 JOKER → win", () => {
  const win = normalizePublicWinResult(winOf(5, "JOKER"))
  const vm = buildGameResultViewModel(win, "a07-not-in-list", "JOKER")
  assert.equal(vm.outcome, "win")
  // 넘겨받은 팀이 시민이면 패배 (늘 win이 아님)
  assert.equal(buildGameResultViewModel(win, "a07-not-in-list", "CITIZEN").outcome, "lose")
})
