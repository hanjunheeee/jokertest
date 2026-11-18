// 인게임 화면 낮 시작 순서 시험(화면 전체): 누가 보든 같은 연출(죽음 영상+글 / 아무 일 없음 글 창 / 없음), 연출 → "낮이 되었습니다"·결과 화면, 새로고침엔 다시 안 틂, 직업·보호받은 사람 안 드러남
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-587~632·685~690, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/dawn-page-order.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

// 7명 판 자리: 0 광대, 1 의사, 2 당할 A(시민), 3 산 시민, 4 죽은 관전자, 5·6 시민
const ROLES7 = { 0: "JOKER", 1: "DOCTOR" }
const A = 2

// 1일 밤 판을 열고 인게임 화면 전체를 그림
async function nightPage({ n = 7, me = 3, roles = ROLES7, dead = n >= 7 ? [4] : [], dayIndex = 1 } = {}) {
  const g = await kit.openGame({ n, me, roles, dead, dayIndex })
  await g.page()
  return g
}

// 지금 화면에 보이는 낮 시작 모습을 글자로: "영상+글:…" / "아무 일 창:…" / "낮이 되었습니다" / "없음"
function dawnLook() {
  if (kit.dawnVideo()) return `영상+글:${kit.dawnVideoMessage()}`
  if (kit.dawnDialog("QUIET")) return `아무 일 창:${kit.dawnDialog("QUIET").textContent.includes(kit.QUIET_TEXT) ? "글 맞음" : "글 틀림"}`
  if (kit.dawnDialog()) return `글 창:${kit.dawnDialog().getAttribute("data-ingame-dawn-report")}`
  if (kit.dayEntrance()) return kit.DAY_ENTRANCE_TEXT
  return "없음"
}

// ── 받는 사람 × 경우 (버그 5: 영상이 광대·당한 사람에게만 가던 것)
const CASES = [
  ["죽음", { victim: A }, () => `영상+글:${kit.killedText(kit.NAMES[A])}`],
  // 의사가 살렸든 광대가 안 죽였든 같은 글 창 (사용자 결정 2026-11-18)
  ["살림", { victim: null, saved: true }, () => "아무 일 창:글 맞음"],
  ["광대 안 죽임", { victim: null, saved: false }, () => "아무 일 창:글 맞음"],
]
const VIEWERS = [["산 시민", 3], ["광대", 0], ["당한 A", A], ["죽은 관전자", 4], ["의사", 1]]
let no = 587
for (const [caseName, send, expect] of CASES) {
  for (const [viewerName, me] of VIEWERS) {
    test(`A05-F-${no} [버그 5] 7명 판 ${viewerName} 화면 · 밤 결과 ${caseName} → ${expect()}`, async () => {
      const g = await nightPage({ me })
      await g.nightResult(send)
      assert.equal(dawnLook(), expect())
    })
    no += 1
  }
}

// ── 연출을 닫은 뒤 다음 화면
test("A05-F-602 죽음·낮: 영상이 끝나면 → \"낮이 되었습니다\" 창", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.nightResult({ victim: A })
  assert.ok(kit.dawnVideo(), "영상이 없음 (준비 잘못)")
  await kit.finishDawn()
  await kit.waitUntil(() => kit.dayEntrance() !== null, { what: "낮이 되었습니다 창" })
  assert.match(kit.dayEntrance().textContent, /낮이 되었습니다/)
})

test("A05-F-603 살림·낮: 아무 일 창 \"확인\" → \"낮이 되었습니다\" 창", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.nightResult({ victim: null, saved: true })
  assert.ok(kit.dawnDialog("QUIET"), "아무 일 창이 없음 (준비 잘못)")
  await kit.finishDawn()
  await kit.waitUntil(() => kit.dayEntrance() !== null, { what: "낮이 되었습니다 창" })
  assert.match(kit.dayEntrance().textContent, /낮이 되었습니다/)
})

test("A05-F-604 광대 안 죽임·낮: 아무 일 창 \"확인\" → \"낮이 되었습니다\" 창", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.nightResult({ victim: null, saved: false })
  assert.ok(kit.dawnDialog("QUIET"), "아무 일 창이 없음")
  assert.equal(kit.dayEntrance(), null)
  await kit.finishDawn()
  await kit.waitUntil(() => kit.dayEntrance() !== null, { what: "낮이 되었습니다 창" })
})

test("A05-F-605 죽음·판 끝(5명 광대 2): 영상이 끝나면 → 결과 화면으로 감", async () => {
  const g = await nightPage({ n: 5, me: 3, roles: { 0: "JOKER", 1: "JOKER" } })
  await g.nightResult({ victim: A, ended: "JOKER" })
  assert.ok(kit.dawnVideo(), "영상이 없음 (준비 잘못)")
  await kit.endVideo()
  await kit.waitUntil(() => g.path() === "/gameresult", { what: "결과 화면 이동" })
  assert.ok(kit.RTL.screen.queryByText(kit.RESULT_PAGE_TEXT))
})

test("A05-F-606 재판 처형으로 판 끝(5명): 낮 시작 연출 없이 결과 화면 (재판 추방 연출은 A04 몫이라 끝까지 넘김)", async () => {
  kit.useFakeClock()
  const g = await kit.openGame({ n: 5, me: 3, roles: { 0: "JOKER" }, phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE" })
  await g.page()
  // 낮 투표 판정 → 0번 재판 → 유죄 → 시민 이김
  await g.say("day_vote_resolved", {
    gameId: g.gameId, dayIndex: 1, phase: "TRIBUNAL", round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: g.uuid(0),
    publicVoteCount: 5, publicAbstainCount: 0, revoteExcludedUuids: [], tribunalDeadline: Date.now() + 60_000,
  })
  assert.equal(g.state().phase, "TRIBUNAL", "재판으로 안 넘어감 (준비 잘못)")
  const after = g.seats.map((s, i) => ({ uuid: s.uuid, isAlive: i !== 0 }))
  await g.say("tribunal_vote_resolved", {
    gameId: g.gameId, dayIndex: 1, phase: "ENDED", defendantUuid: g.uuid(0), outcome: "GUILTY",
    executedUuid: g.uuid(0),
    players: after,
    winResult: {
      winner: "CITIZEN",
      reveals: g.seats.map((s, i) => ({
        uuid: s.uuid, nickname: s.nickname, role: s.role, team: s.role === "JOKER" ? "JOKER" : "CITIZEN",
        alive: i !== 0, deathReason: i === 0 ? "EXECUTION" : null, goldReward: 0,
      })),
    },
    resultClosesAt: Date.now() + 180_000,
  })
  assert.equal(g.state().phase, "ENDED", "판이 안 끝남 (준비 잘못)")
  assert.ok(kit.noDawn(), "낮 시작 연출이 뜸")
  // 재판 추방 연출(영상 끝 → 멈춤·어두워짐·글) 넘기기
  const expulsionVideo = document.querySelector("[data-ingame-tribunal-expulsion] video")
  assert.ok(expulsionVideo, "재판 추방 영상이 없음 (준비 잘못)")
  await kit.RTL.act(async () => { kit.RTL.fireEvent(expulsionVideo, new window.Event("ended")) })
  await kit.tick(450)
  await kit.tick(0)
  await kit.tick(1_600)
  assert.ok(kit.noDawn(), "낮 시작 연출이 뜸")
  await kit.tick(3_200)
  assert.ok(kit.noDawn(), "낮 시작 연출이 뜸")
  assert.equal(g.path(), "/gameresult")
})

// ── 연출이 안 끝났으면 다음이 안 뜸
test("A05-F-607 죽음·낮: 영상이 도는 동안 \"낮이 되었습니다\" 없음", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.nightResult({ victim: A })
  assert.ok(kit.dawnVideo(), "영상이 없음 (준비 잘못)")
  assert.equal(kit.dayEntrance(), null)
})

test("A05-F-608 살림·낮: 아무 일 창이 떠 있는 동안 \"낮이 되었습니다\" 없음", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.nightResult({ victim: null, saved: true })
  assert.ok(kit.dawnDialog("QUIET"), "아무 일 창이 없음 (준비 잘못)")
  assert.equal(kit.dayEntrance(), null)
})

test("A05-F-609 죽음·판 끝: 영상이 도는 동안 결과 화면으로 안 감", async () => {
  const g = await nightPage({ n: 5, me: 3, roles: { 0: "JOKER", 1: "JOKER" } })
  await g.nightResult({ victim: A, ended: "JOKER" })
  assert.ok(kit.dawnVideo(), "영상이 없음 (준비 잘못)")
  assert.equal(g.path(), "/ingame")
  assert.equal(kit.RTL.screen.queryByText(kit.RESULT_PAGE_TEXT), null)
})

// ── [임시 9] 밤 암살로 판 끝: 누구든 영상+글 → 결과 화면 (5명, 광대 0·1)
const END_VIEWERS = [["이긴 광대", 0], ["진 산 시민", 3], ["당한 A", A]]
END_VIEWERS.forEach(([name, me], i) => {
  test(`A05-F-${610 + i} [임시 9] 5명 광대 2 판 끝 · ${name} 화면 → 영상+글 뒤 결과 화면`, async () => {
    const g = await nightPage({ n: 5, me, roles: { 0: "JOKER", 1: "JOKER" } })
    await g.nightResult({ victim: A, ended: "JOKER" })
    assert.equal(dawnLook(), `영상+글:${kit.killedText(g.nick(A))}`)
    await kit.endVideo()
    await kit.waitUntil(() => g.path() === "/gameresult", { what: "결과 화면 이동" })
    assert.ok(kit.RTL.screen.queryByText(kit.RESULT_PAGE_TEXT))
  })
})

// ── 새로고침하면 지난 낮 시작 연출을 다시 안 틂 (6명, 나는 3번 시민)
const RELOADS = [
  ["죽음·연출 중", { victim: A }, false, "dead"],
  ["죽음·닫은 뒤", { victim: A }, true, "dead"],
  ["살림·연출 중", { victim: null, saved: true }, false, "alive"],
  ["살림·닫은 뒤", { victim: null, saved: true }, true, "alive"],
  ["광대 안 죽임·연출 중", { victim: null, saved: false }, false, "alive"],
]
RELOADS.forEach(([name, send, closeFirst, aStatus], i) => {
  test(`A05-F-${613 + i} 6명 ${name} 새로고침 → 연출 안 뜸, A 카드 상태 ${aStatus}(스냅샷대로)`, async () => {
    const g = await nightPage({ n: 6, me: 3, dead: [] })
    await g.nightResult(send)
    if (closeFirst) await kit.finishDawn()
    await g.reload({ phase: "DAY", dayIndex: 2 })
    assert.equal(g.state()?.dayIndex, 2, "스냅샷이 안 들어감 (준비 잘못)")
    assert.ok(kit.noDawn(), "연출이 다시 뜸")
    assert.equal(kit.cardInfo(g.nick(A))?.getAttribute("data-ingame-player-status"), aStatus)
  })
})

test("A05-F-618 6명 밤 중(광대 차례 끝 뒤) 새로고침 → 연출 안 뜸, A 카드 산 사람", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.turnStarts("JOKER")
  await g.turnEnds("JOKER")
  await g.reload({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR", nightTurnDeadline: Date.now() + 30_000 })
  assert.equal(g.state()?.nightTurnRole, "DOCTOR", "스냅샷이 안 들어감 (준비 잘못)")
  assert.ok(kit.noDawn(), "연출이 뜸")
  assert.equal(kit.cardInfo(g.nick(A))?.getAttribute("data-ingame-player-status"), "alive")
})

// ── [지금 동작] 연출 뒤에 뜨는 다른 창
test("A05-F-619 [지금 동작] 8명 경비원 화면, 죽음 + 조사 결과 → 연출 먼저, 닫은 뒤 조사 결과 창", async () => {
  const g = await nightPage({ n: 8, me: 5, roles: { 0: "JOKER", 1: "DOCTOR", 5: "GUARD" } })
  await g.turnStarts("GUARD")
  await g.turnEnds("GUARD")
  await g.privateResult({ actionType: "INVESTIGATE", targetId: g.uuid(3), role: "CITIZEN" })
  await g.nightResult({ victim: A })
  assert.ok(kit.dawnVideo(), "영상이 먼저 안 뜸")
  assert.equal(kit.privateResultDialog(), null)
  await kit.finishDawn()
  await kit.waitUntil(() => kit.privateResultDialog() !== null, { what: "조사 결과 창" })
  assert.match(kit.privateResultDialog().textContent, new RegExp(g.nick(3)))
})

test("A05-F-620 [지금 동작] 6명 당한 A 화면 → 연출 먼저, 닫은 뒤 관전·나가기 창", async () => {
  const g = await nightPage({ n: 6, me: A, dead: [] })
  await g.nightResult({ victim: A })
  assert.ok(kit.dawnVideo(), "영상이 먼저 안 뜸")
  assert.equal(kit.deadChoiceDialog(), null)
  await kit.finishDawn()
  await kit.waitUntil(() => kit.deadChoiceDialog() !== null, { what: "관전·나가기 창" })
  assert.match(kit.deadChoiceDialog().textContent, /관전 계속하기/)
})

// ── 명단 크기·당한 사람 자리와 상관없이 이름이 맞음
const SEATS = [
  ["5명 첫 자리", 5, 0],
  ["6명 끝 자리", 6, 5],
  ["7명 가운데", 7, 3],
  ["8명 셋째", 8, 2],
  ["10명 끝 자리", 10, 9],
]
SEATS.forEach(([name, n, victim], i) => {
  test(`A05-F-${621 + i} ${name}가 당함 → 글의 닉네임 = 그 사람`, async () => {
    // 광대는 당한 사람 다음 자리, 나는 그다음 자리
    const joker = (victim + 1) % n
    const me = (victim + 2) % n
    const g = await nightPage({ n, me, roles: { [joker]: "JOKER" }, dead: [] })
    await g.nightResult({ victim })
    assert.equal(kit.dawnVideoMessage(), kit.killedText(g.nick(victim)))
  })
})

// ── 살림: 보호받은 사람(2번)이 화면 어디에도 안 드러남, 글은 아무 일 없음 글 (8명)
const SAVED_VIEWERS = [["산 시민", 3], ["죽은 관전자", 4], ["광대", 0]]
SAVED_VIEWERS.forEach(([name, me], i) => {
  test(`A05-F-${626 + i} 8명 살림 · ${name} 화면 → 글·카드 어디에도 보호받은 사람 표시·이름 없음`, async () => {
    const g = await nightPage({ n: 8, me, roles: { 0: "JOKER", 1: "DOCTOR" }, dead: [4] })
    await g.nightResult({ victim: null, saved: true })
    const dialog = kit.dawnDialog("QUIET")
    assert.ok(dialog, "아무 일 창이 없음 (준비 잘못)")
    assert.doesNotMatch(dialog.textContent, new RegExp(g.nick(A)))
    const card = kit.cardInfo(g.nick(A))
    assert.equal(card?.getAttribute("data-ingame-player-status"), "alive")
    assert.doesNotMatch(card.textContent, /보호|살림|살려|공격/)
    // 다른 산 사람 카드와 표시가 같음
    assert.equal(card.getAttribute("data-ingame-player-status"), kit.cardInfo(g.nick(6)).getAttribute("data-ingame-player-status"))
  })
})

// ── 죽음: A 카드에 직업이 안 보임 (7명)
const KILL_VIEWERS = [["산 시민", 3], ["죽은 관전자", 4], ["의사", 1]]
KILL_VIEWERS.forEach(([name, me], i) => {
  test(`A05-F-${629 + i} 7명 죽음 · ${name} 화면 → A 카드 "사망", 직업 이름 없음`, async () => {
    const g = await nightPage({ me })
    await g.nightResult({ victim: A })
    const card = kit.cardInfo(g.nick(A))
    assert.match(card?.textContent ?? "", /사망/)
    assert.doesNotMatch(card.textContent, kit.ROLE_WORDS)
  })
})

test("A05-F-632 6명 영상을 끝까지 봐도 화면이 \"다 봤다\"(acknowledge_night_action_success)를 안 보냄", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.nightResult({ victim: A })
  await kit.finishDawn()
  assert.equal(g.sentEvents().includes("acknowledge_night_action_success"), false)
})

test("A05-F-685 [지금 동작] 7명 연출 동안 카드는 막힌 판 안(inert·누름 꺼짐)에 있음 → 누를 수 없음", async () => {
  const g = await nightPage({ me: 3 })
  await g.nightResult({ victim: A })
  assert.ok(kit.dawnVideo(), "영상이 없음 (준비 잘못)")
  const locked = kit.cardOf(g.nick(5)).closest("[inert]")
  assert.ok(locked !== null, "카드가 막힌 판 안에 없음")
  assert.match(locked.className, /pointer-events-none/)
})

// ── 세 밤 연달아 낮마다 맞는 연출 (10명, 광대 0·1, 의사 2, 나는 5번 시민)
const THREE_NIGHTS = [
  { victim: 3 },
  { victim: null, saved: true },
  { victim: null, saved: false },
]
const THREE_EXPECT = [
  (g) => `영상+글:${kit.killedText(g.nick(3))}`,
  () => "아무 일 창:글 맞음",
  () => "아무 일 창:글 맞음",
]
THREE_NIGHTS.forEach((_, night) => {
  test(`A05-F-${686 + night} 10명 세 밤 연달아(죽음 → 살림 → 광대 안 죽임) · ${night + 2}일 낮 → ${["영상+글", "아무 일 글", "아무 일 글"][night]}`, async () => {
    const g = await nightPage({ n: 10, me: 5, roles: { 0: "JOKER", 1: "JOKER", 2: "DOCTOR" }, dead: [] })
    for (let i = 0; i < night; i += 1) {
      await g.nightResult(THREE_NIGHTS[i])
      if (!kit.noDawn()) await kit.finishDawn()
      await g.dayToNight()
    }
    await g.nightResult(THREE_NIGHTS[night])
    assert.equal(g.state().dayIndex, night + 2, "날짜가 틀림 (준비 잘못)")
    assert.equal(dawnLook(), THREE_EXPECT[night](g))
  })
})

test("A05-F-689 6명 같은 밤 결과 사건이 두 번 → 연출 닫은 뒤 다시 안 뜸", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  const payload = g.nightResultPayload({ victim: A })
  await g.say("night_result_applied", payload)
  assert.ok(kit.dawnVideo(), "영상이 없음 (준비 잘못)")
  await kit.finishDawn()
  await g.say("night_result_applied", payload)
  assert.ok(kit.noDawn(), "연출이 다시 뜸")
})

test("A05-F-690 6명 다른 판 id의 밤 결과 → 연출 없음", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await g.say("night_result_applied", g.nightResultPayload({ victim: A, gameId: "a05-dawn-old-game" }))
  assert.ok(kit.noDawn(), "연출이 뜸")
  assert.equal(g.state().phase, "NIGHT")
})

// ── 그 밤 사이 끊김·나가기 탈락이 화면에 보였으면 "아무 일도" 글을 안 띄움 (거짓말 안 되게, 2026-11-18)
// 밤 사이 seat 자리가 탈락 (서버 player_eliminated 모양)
async function dropAtNight(g, seat) {
  g.seats[seat].alive = false
  await g.say("player_eliminated", {
    gameId: g.gameId, phase: "NIGHT", dayIndex: g.dayIndex, victimUuid: g.uuid(seat),
    players: g.seats.map((s) => ({ uuid: s.uuid, alive: s.alive })),
  })
}

test("A05-F-704 6명 밤 사이 5번이 끊겨 탈락 + 광대 안 죽임 → 아무 일 창 없이 바로 \"낮이 되었습니다\", 5번 카드 사망", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await dropAtNight(g, 5)
  assert.equal(kit.cardInfo(g.nick(5))?.getAttribute("data-ingame-player-status"), "dead", "탈락이 안 들어감 (준비 잘못)")
  await g.nightResult({ victim: null })
  assert.ok(kit.noDawn(), "아무 일 창이 뜸")
  await kit.waitUntil(() => kit.dayEntrance() !== null, { what: "낮이 되었습니다 창" })
})

test("A05-F-705 6명 1밤 사이 탈락이 보였어도 2밤에 아무도 안 죽으면 → 2밤 뒤엔 아무 일 창 뜸 (지난 밤 표시 안 남음)", async () => {
  const g = await nightPage({ n: 6, me: 3, dead: [] })
  await dropAtNight(g, 5)
  await g.nightResult({ victim: null })
  assert.ok(kit.noDawn(), "1밤 뒤 아무 일 창이 뜸 (준비 잘못)")
  await g.dayToNight()
  await g.nightResult({ victim: null })
  assert.equal(dawnLook(), "아무 일 창:글 맞음")
})
