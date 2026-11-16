// 탈락·참여 바뀜·내 진행 알림 반영 시험(화면 상태): 탈락하면 죽음·직업 안 보임, 승부면 판 끝, 다른 판·옛 알림 무시, 방장 바뀜, 내 표 기권
// 목록 A09-끊김-나가기-탈주.md A09-F-124~132, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/eliminated-store.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

test.afterEach(() => K.reset())

const ROLE_WORDS = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN"]

test("A09-F-124 7명 판 낮 투표 중 4번 자리 player_eliminated(승부 없음) → 그 사람 죽음·직업 안 보임·판 계속", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0], roles: { 4: "DOCTOR" } })
  await K.renderEventsOnly()
  await t.say("player_eliminated", t.eliminatedPayload(4))
  const victim = t.player(4)
  assert.equal(victim.alive, false)
  assert.equal(Object.hasOwn(victim, "role"), false, "탈락한 사람 직업이 판 값에 들어옴")
  assert.equal(JSON.stringify(victim).includes("DOCTOR"), false)
  assert.equal(t.state().phase, "DAY")
  assert.equal(t.state().winResult ?? null, null)
})

test("A09-F-125 5명 판 광대 player_eliminated + 승패 칸 → 판 끝 상태·전원 직업", async () => {
  const t = K.seat({ n: 5, me: 1, jokers: [0], roles: { 2: "DOCTOR" } })
  await K.renderEventsOnly()
  await t.say("player_eliminated", t.eliminatedPayload(0, { winner: "CITIZEN" }))
  assert.equal(t.state().phase, "ENDED")
  const reveals = t.state().winResult?.reveals ?? []
  assert.equal(reveals.length, 5)
  for (const reveal of reveals) assert.ok(ROLE_WORDS.includes(reveal.role), `직업 없음: ${reveal.uuid}`)
  assert.equal(reveals.find((r) => r.uuid === t.uuid(0)).role, "JOKER")
})

test("A09-F-126 6명 판 다른 판 id의 player_eliminated → 무시 [지금 동작]", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  await K.renderEventsOnly()
  await t.say("player_eliminated", t.eliminatedPayload(3, { gameId: "a09-other-game" }))
  assert.equal(t.player(3).alive, true)
})

test("A09-F-127 8명 판 이미 처형된 5번 자리 player_eliminated → 그대로 죽음, 다른 사람 생사 그대로", async () => {
  const t = K.seat({ n: 8, me: 1, jokers: [0, 2], dead: [5] })
  await K.renderEventsOnly()
  const before = t.state().players.map((p) => `${p.uuid}:${p.alive}`).join(",")
  await t.say("player_eliminated", t.eliminatedPayload(5))
  assert.equal(t.state().players.map((p) => `${p.uuid}:${p.alive}`).join(","), before)
  assert.equal(t.state().phase, "DAY")
})

test("A09-F-128 10명 판 내가 탈락(player_eliminated victim = 나) → 판 비우고 빠진 까닭 글", async () => {
  const t = K.seat({ n: 10, me: 3, jokers: [0, 1] })
  await K.renderEventsOnly()
  await t.say("player_eliminated", t.eliminatedPayload(3))
  await K.flush()
  assert.equal(K.useInGameStore.getState().gameId, null, "판이 그대로 남음")
  assert.equal(K.dialogs.alerts.length, 1, `알림: ${JSON.stringify(K.dialogs.alerts)}`)
  assert.ok(K.dialogs.alerts[0].includes("제외"), `글: ${K.dialogs.alerts[0]}`)
})

test("A09-F-129 7명 판 session_participation_changed 2번 자리 빠짐 → 그 사람 isParticipating false", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0], dead: [2] })
  await K.renderEventsOnly()
  await t.say("session_participation_changed", t.participationPayload({ leftIndexes: [2] }))
  assert.equal(t.player(2).isParticipating, false)
  assert.equal(t.player(3).isParticipating, true)
})

test("A09-F-130 6명 판 방장(0번) 빠짐 + 방장 1번으로 → 방장 표시 1번", async () => {
  const t = K.seat({ n: 6, me: 2, jokers: [3] })
  await K.renderEventsOnly()
  assert.equal(K.useInGameStore.getState().hostUuid, t.uuid(0))
  await t.say("session_participation_changed", t.participationPayload({ leftIndexes: [0], hostIndex: 1 }))
  assert.equal(K.useInGameStore.getState().hostUuid, t.uuid(1))
  assert.equal(t.state().hostUuid, t.uuid(1))
})

test("A09-F-131 8명 판 참여 번호가 더 낮은 옛 참여 알림 → 무시 [지금 동작]", async () => {
  const t = K.seat({ n: 8, me: 2, jokers: [0, 1] })
  await K.renderEventsOnly()
  await t.say("session_participation_changed", t.participationPayload({ leftIndexes: [5], revision: 3 }))
  assert.equal(t.player(5).isParticipating, false)
  // 늦게 온 옛 알림(번호 2): 5번이 다시 참여 중이라 함
  await t.say("session_participation_changed", t.participationPayload({ leftIndexes: [], revision: 2 }))
  assert.equal(t.player(5).isParticipating, false)
  assert.equal(t.state().participationRevision, 3)
})

test("A09-F-132 6명 판 표 낸 뒤 session_self_progress 내 표 없음 → \"표 냈음\" 표시 꺼짐", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0], selfExtra: { hasSubmittedDayVote: true, dayVoteTargetUuid: "x" } })
  // 표 대상은 명단 안 사람으로
  K.RTL.act(() => {
    K.useInGameStore.setState((s) => ({ state: { ...s.state, self: { ...s.state.self, dayVoteTargetUuid: t.uuid(2) } } }))
  })
  const box = await K.renderActionProbe()
  assert.equal(box.ctx.dayVoteHasSubmitted, true, "처음엔 표 냈음")
  await t.say("session_self_progress", t.selfProgressPayload({ hasSubmittedDayVote: false, dayVoteTargetUuid: null }))
  assert.equal(t.state().self.hasSubmittedDayVote, false)
  assert.equal(box.ctx.dayVoteHasSubmitted, false)
})
