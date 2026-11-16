// 판 중 채팅 채널 고르기 시험 — 보낼·볼·받아 둘 채널, 밤 입력칸 닫힘, 같은 직업 채팅 읽기, 새로고침·죽음 뒤 채널
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-001~037, A06-F-072~075
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useInGameStore, flush } from "./a06Kit.mjs"

const {
  resolveInGameChatSendChannel,
  resolveInGameChatViewChannel,
  resolveInGameChatReadChannels,
  isNightChatInputClosed,
} = await import("../../src/domains/game/ingame/utils/inGameChatChannel.js")
const { canReadRoleNightChat, isJokerNightChatEligible } = await import("../../src/domains/game/ingame/utils/selfAlive.js")

test.afterEach(resetTable)

// 판 값 한 덩이 (나 = me, 5명 판, 나 말고는 산 시민)
function gameState({ phase, role = "CITIZEN", alive = true, inRoster = true }) {
  const players = ["me", "p1", "p2", "p3", "p4"].map((uuid) => ({ uuid, alive: uuid === "me" ? alive : true }))
  return {
    phase,
    dayIndex: phase === "ROLE_REVEAL" ? 0 : 1,
    self: { uuid: "me", role },
    players: inRoster ? players : players.filter((p) => p.uuid !== "me"),
  }
}

// ── 보낼 채널 ──
const SEND_ALIVE_DOCTOR = [
  ["A06-F-001", "ROLE_REVEAL", null, "역할 확인 = 없음"],
  ["A06-F-002", "DAY", "DAY", "낮 = DAY"],
  ["A06-F-003", "TRIBUNAL", "DAY", "재판 = DAY"],
  ["A06-F-004", "NIGHT", "DOCTOR", "밤 = DOCTOR"],
]
for (const [id, phase, expected, label] of SEND_ALIVE_DOCTOR) {
  test(`${id} 산 의사 보낼 채널: ${label}`, () => {
    assert.equal(resolveInGameChatSendChannel(gameState({ phase, role: "DOCTOR" })), expected)
  })
}

test("A06-F-005 판 끝(ENDED)엔 보낼 채널 없음 [지금 동작]", () => {
  assert.equal(resolveInGameChatSendChannel(gameState({ phase: "ENDED", role: "DOCTOR" })), null)
})

const NIGHT_SEND_BY_ROLE = [
  ["A06-F-006", "JOKER", "JOKER", "광대"],
  ["A06-F-007", "DOCTOR", "DOCTOR", "의사"],
  ["A06-F-008", "GUARD", "GUARD", "경비원"],
  ["A06-F-009", "WITCH_HUNTER", "WITCH_HUNTER", "마녀사냥꾼"],
  ["A06-F-010", "CITIZEN", null, "시민"],
]
for (const [id, role, expected, label] of NIGHT_SEND_BY_ROLE) {
  test(`${id} [단위 2] 밤 산 ${label} 보낼 채널 → ${expected ?? "없음"}`, () => {
    assert.equal(resolveInGameChatSendChannel(gameState({ phase: "NIGHT", role })), expected)
  })
}

const DEAD_SEND = [
  ["A06-F-011", "DAY", "낮"],
  ["A06-F-012", "TRIBUNAL", "재판"],
  ["A06-F-013", "NIGHT", "밤"],
]
for (const [id, phase, label] of DEAD_SEND) {
  test(`${id} 죽은 사람 ${label} 보낼 채널 → DEAD`, () => {
    assert.equal(resolveInGameChatSendChannel(gameState({ phase, alive: false })), "DEAD")
  })
}

test("A06-F-014 명단에 내 자리 없음(생존 모름) → 보낼 채널 없음 [지금 동작]", () => {
  assert.equal(resolveInGameChatSendChannel(gameState({ phase: "DAY", inRoster: false })), null)
})

// ── 볼 채널 ──
const VIEW = [
  ["A06-F-015", { phase: "DAY" }, "DAY", "산 낮 → DAY"],
  ["A06-F-016", { phase: "NIGHT", role: "DOCTOR" }, "DOCTOR", "산 의사 밤 → DOCTOR"],
  ["A06-F-017", { phase: "NIGHT", role: "CITIZEN" }, null, "산 시민 밤 → 없음"],
  ["A06-F-018", { phase: "DAY", alive: false }, "DEAD", "죽은 낮 → DEAD"],
  ["A06-F-019", { phase: "NIGHT", alive: false }, "DEAD", "죽은 밤 → DEAD"],
]
for (const [id, input, expected, label] of VIEW) {
  test(`${id} 볼 채널: ${label}`, () => {
    assert.equal(resolveInGameChatViewChannel(gameState(input)), expected)
  })
}

// ── 받아 둘 채널 ──
const READ = [
  ["A06-F-020", "DEAD", ["DEAD", "DAY"], "DEAD 볼 때 → DEAD·DAY"],
  ["A06-F-021", "DAY", ["DAY"], "DAY 볼 때 → DAY"],
  ["A06-F-022", null, [], "볼 채널 없음 → 빈 목록"],
]
for (const [id, view, expected, label] of READ) {
  test(`${id} 받아 둘 채널: ${label}`, () => {
    assert.deepEqual(resolveInGameChatReadChannels(view), expected)
  })
}

// ── 밤 입력칸 닫힘 표 ──
const CLOSED = [
  ["A06-F-023", { phase: "NIGHT", role: "CITIZEN" }, true, "밤 산 시민 → 닫힘"],
  ["A06-F-024", { phase: "NIGHT", role: "JOKER" }, false, "밤 산 광대 → 열림"],
  ["A06-F-025", { phase: "NIGHT", role: "DOCTOR" }, false, "밤 산 의사 → 열림"],
  ["A06-F-026", { phase: "NIGHT", role: "GUARD" }, false, "밤 산 경비원 → 열림"],
  ["A06-F-027", { phase: "NIGHT", role: "WITCH_HUNTER" }, false, "밤 산 마녀사냥꾼 → 열림"],
  ["A06-F-028", { phase: "NIGHT", role: "CITIZEN", alive: false }, false, "밤 죽은 시민 → 열림"],
  ["A06-F-029", { phase: "DAY", role: "CITIZEN" }, false, "낮 산 시민 → 열림"],
  ["A06-F-030", { phase: "TRIBUNAL", role: "CITIZEN" }, false, "재판 산 시민 → 열림"],
]
for (const [id, input, expected, label] of CLOSED) {
  test(`${id} [단위 2] 밤 입력칸 닫힘 표: ${label}`, () => {
    assert.equal(isNightChatInputClosed(gameState(input)), expected)
  })
}

// ── 밤 같은 직업 채팅을 읽나 ──
const READ_ROLE = [
  ["A06-F-031", { phase: "NIGHT", role: "JOKER" }, true, "밤 산 광대 → 예"],
  ["A06-F-032", { phase: "NIGHT", role: "DOCTOR" }, true, "밤 산 의사 → 예"],
  ["A06-F-033", { phase: "NIGHT", role: "CITIZEN" }, false, "밤 산 시민 → 아니오"],
  ["A06-F-034", { phase: "NIGHT", role: "JOKER", alive: false }, true, "밤 죽은 광대 → 예"],
  ["A06-F-035", { phase: "NIGHT", role: "DOCTOR", alive: false }, false, "밤 죽은 의사 → 아니오"],
  ["A06-F-036", { phase: "DAY", role: "JOKER" }, false, "낮 산 광대 → 아니오"],
]
for (const [id, input, expected, label] of READ_ROLE) {
  test(`${id} 밤 같은 직업 채팅 읽기: ${label}`, () => {
    assert.equal(canReadRoleNightChat(gameState(input)), expected)
  })
}

test("A06-F-037 밤 죽은 광대 → 같은 직업 채팅 보내기 자격 없음, 보낼 채널 DEAD", () => {
  const state = gameState({ phase: "NIGHT", role: "JOKER", alive: false })
  assert.equal(isJokerNightChatEligible(state), false)
  assert.equal(resolveInGameChatSendChannel(state), "DEAD")
})

// ── 새로고침(스냅샷)·죽음 뒤 채널 (스토어 값) ──
// 새로고침 흉내: 판 값 비우고 서버 스냅샷 모양으로 다시 채움
async function reloadFromSnapshot(t) {
  const snapshot = t.snapshot()
  await RTL.act(async () => {
    useInGameStore.getState().clearGame()
    useInGameStore.getState().bootstrapSessionSnapshot(snapshot, null)
  })
  await flush()
  assert.equal(useInGameStore.getState().gameId, t.gameId, "스냅샷을 스토어가 안 받음")
}

test("A06-F-072 [단위 2] 새로고침 스냅샷 밤·나 산 시민(5명 판) → 입력칸 닫힘", async () => {
  const t = await openTable({ n: 5, me: 1, myRole: "CITIZEN", roles: { 0: "JOKER" }, phase: "NIGHT", view: "none" })
  await reloadFromSnapshot(t)
  assert.equal(isNightChatInputClosed(useInGameStore.getState().state), true)
})

test("A06-F-073 새로고침 스냅샷 밤·나 산 의사(6명 판) → 보낼 채널 DOCTOR", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER" }, phase: "NIGHT", view: "none" })
  await reloadFromSnapshot(t)
  assert.equal(resolveInGameChatSendChannel(useInGameStore.getState().state), "DOCTOR")
})

test("A06-F-074 재판 결과 처형 = 나(6명 판) → 보낼 채널 DAY에서 DEAD로", async () => {
  const t = await openTable({ n: 6, me: 2, roles: { 0: "JOKER" }, phase: "DAY", view: "none" })
  await t.openTribunal(2)
  assert.equal(resolveInGameChatSendChannel(t.state()), "DAY")
  await t.resolveTribunal("GUILTY")
  assert.equal(resolveInGameChatSendChannel(t.state()), "DEAD")
})

test("A06-F-075 밤 의사가 지목됨(6명 판): 밤 동안 DOCTOR, 낮 시작 알림(희생자 = 나) 뒤 DEAD [지금 동작]", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER" }, phase: "NIGHT", view: "none" })
  // 광대가 나를 지목했어도 밤 결과 알림 전엔 산 사람
  assert.equal(resolveInGameChatSendChannel(t.state()), "DOCTOR")
  await t.nextDay({ victim: 1 })
  assert.equal(resolveInGameChatSendChannel(t.state()), "DEAD")
})
