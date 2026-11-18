// 판 끝 → 결과 화면 이동 시험: 판 끝 알림이 두 번 와도 이동 한 번, 처형 영상이 끝난 뒤 이동, 밤 암살로 끝나면 낮 연출 뒤 이동
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-F-039·043·044 (화면 상태, 인게임 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./resultKit.mjs"

const { default: InGamePage } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")
const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")

test.afterEach(K.resetAll)

const RESULT_TEXT = "결과 화면 (시험 자리)"

// 인게임 화면을 그림 (/gameresult는 자리 글)
const renderGame = () => K.renderAt("/ingame", K.h(InGamePage), { extra: { "/gameresult": K.h("p", null, RESULT_TEXT) } })

// 밤 끝에 판이 끝나는 알림 (서버 buildNightResultAppliedPayload + 판 끝 칸 모양)
// victim: 그 밤에 죽은 자리 (없으면 null)
function nightEndPayload(g, { victim = null, winner = "CITIZEN" } = {}) {
  if (victim !== null) g.seats[victim].alive = false
  return {
    gameId: g.gameId,
    phase: "ENDED",
    dayIndex: 1,
    players: g.seats.map((s) => ({ uuid: s.uuid, isAlive: s.alive })),
    victimUuid: victim === null ? null : g.seats[victim].uuid,
    deathReveals: victim === null ? [] : [{ victimUuid: g.seats[victim].uuid, source: "JOKER" }],
    winResult: K.winResultOf(g.seats, winner, 1),
    resultClosesAt: Date.now() + 180_000,
  }
}

test("A07-F-039 6명 판: 같은 판 끝 알림이 두 번 와도 결과 화면 이동은 한 번", async () => {
  K.startFakeClock()
  const sock = K.installFakeSocket()
  const g = K.liveGame({ n: 6, me: 2, phase: "NIGHT", dayIndex: 1 })
  const view = await renderGame()
  const payload = nightEndPayload(g)
  await sock.serverSays("night_result_applied", payload)
  await sock.serverSays("night_result_applied", payload)
  await K.tick(0)
  assert.equal(view.path(), "/gameresult")
  assert.deepEqual(view.navigations, ["/gameresult"])
})

// 재판 중 판 (피고 = 0번 광대), 서버 스냅샷의 재판 칸 모양
function tribunalGame(n) {
  const g = K.liveGame({ n, me: 1, phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE" })
  K.useInGameStore.getState().clearGame()
  const deadline = Date.now() + 60_000
  const snapshot = K.liveSnapshotOf({
    gameId: g.gameId, seats: g.seats, me: 1, phase: "TRIBUNAL", dayIndex: 1,
    over: {
      tribunalDeadline: deadline,
      dayVoteResolution: { round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: g.seats[0].uuid, publicVoteCount: n, publicAbstainCount: 0, revoteExcludedUuids: [] },
      tribunal: { defendantUuid: g.seats[0].uuid, resolved: false },
      progress: { kind: "TRIBUNAL", doneCount: 0, requiredCount: n - 1 },
      self: { uuid: g.meUuid, nickname: g.seats[1].nickname, role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false, hasSubmittedTribunalVote: false },
    },
  })
  markRoleRevealSeen(g.gameId, g.meUuid)
  K.useInGameStore.getState().bootstrapSessionSnapshot(snapshot, null)
  if (K.useInGameStore.getState().state?.phase !== "TRIBUNAL") throw new Error("재판 판 넣기 실패")
  return g
}

// 재판 유죄로 마지막 광대 처형 → 판 끝 (서버 buildTribunalVoteResolvedPayload + 판 끝 칸 모양, 표 수·직업 칸은 서버가 안 실음)
function guiltyEndPayload(g) {
  g.seats[0].alive = false
  return {
    gameId: g.gameId,
    dayIndex: 1,
    phase: "ENDED",
    defendantUuid: g.seats[0].uuid,
    outcome: "GUILTY",
    executedUuid: g.seats[0].uuid,
    players: g.seats.map((s) => ({ uuid: s.uuid, isAlive: s.alive })),
    winResult: K.winResultOf(g.seats, "CITIZEN", 1),
    resultClosesAt: Date.now() + 180_000,
  }
}

test("A07-F-043 5명 판: 처형 영상 도는 동안엔 결과 화면으로 안 가고, 영상이 끝난 뒤 결과 화면", async () => {
  K.startFakeClock()
  const sock = K.installFakeSocket()
  const g = tribunalGame(5)
  const view = await renderGame()
  await sock.serverSays("tribunal_vote_resolved", guiltyEndPayload(g))
  assert.equal(K.useInGameStore.getState().state.phase, "ENDED")
  const layer = document.querySelector("[data-ingame-tribunal-expulsion]")
  assert.ok(layer !== null, "처형 영상 창이 없음")
  await K.tick(2_000)
  // 영상 도는 중: 아직 판 화면
  assert.equal(view.path(), "/ingame")
  assert.equal(view.navigations.length, 0)
  // 영상 끝 → 멈춤 0.45초 → 어두워짐 1.6초 → 글 3.2초 뒤 결과 화면
  await K.RTL.act(async () => { K.RTL.fireEvent(layer.querySelector("video"), new window.Event("ended")) })
  await K.tick(450)
  await K.tick(0)
  await K.tick(1_600)
  await K.tick(3_200)
  assert.equal(view.path(), "/gameresult")
  assert.deepEqual(view.navigations, ["/gameresult"])
})

test("A07-F-044 7명 판: 밤 암살로 판 끝 → 암살 연출·\"지난밤 ○○님이 살해당했습니다\" 뒤에 결과 화면", async () => {
  K.startFakeClock()
  const sock = K.installFakeSocket()
  // 광대 2 · 나머지 5 중 5·6번은 앞서 죽음 → 이 밤에 4번이 죽어 산 광대 2 = 나머지 2 → 광대 승
  const g = K.liveGame({ n: 7, me: 3, roles: ["JOKER", "JOKER", "CITIZEN", "CITIZEN", "CITIZEN", "DOCTOR", "CITIZEN"], dead: [5, 6], phase: "NIGHT", dayIndex: 1 })
  const view = await renderGame()
  await sock.serverSays("night_result_applied", nightEndPayload(g, { victim: 4, winner: "JOKER" }))
  await K.tick(0)
  // 연출 글이 보임, 아직 판 화면
  assert.match(document.body.textContent, new RegExp(`지난밤 ${g.seats[4].nickname}님이 살해당했습니다`))
  assert.equal(view.path(), "/ingame")
  // 연출을 다 봄 (영상을 못 그리는 곳에선 글 창 "확인") → 결과 화면
  const confirm = K.button("확인")
  if (confirm) {
    await K.click(confirm)
  } else {
    const video = document.querySelector("[data-ingame-night-success-source-video]")
    await K.RTL.act(async () => { K.RTL.fireEvent(video, new window.Event("ended")) })
  }
  await K.tick(0)
  assert.equal(view.path(), "/gameresult")
  assert.deepEqual(view.navigations, ["/gameresult"])
})
