// 사망 창 시험(화면 부품, 판 화면 전체): 벌 없음 글·관전 계속·나가기 단추, 나가기 확인 글, 나가기 실패 안내, 관전 계속 뒤 같은 판·새 판, 키보드로 닫기
// 목록 A09-끊김-나가기-탈주.md A09-F-201~204·251·252·273, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/dead-choice-panel.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { markRoleRevealSeen } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")

test.afterEach(() => K.reset())

const DEAD_DIALOG = "사망 후 선택"
const DEAD_LINE = "사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다."
const deadDialog = () => K.dialogNamed(DEAD_DIALOG)

// 낮 투표 중 처형된 내가 판 화면을 봄
async function deadPage({ n = 6, me = 2 } = {}) {
  const t = K.seat({ n, me, jokers: [0], dead: [me] })
  await K.renderPage()
  assert.ok(deadDialog() !== null, "사망 창 없음")
  return t
}

test("A09-F-201 6명 판 죽은 사람 사망 창 → \"사망한 뒤라 나가도 탈주가 아니며…\" 글", async () => {
  await deadPage()
  assert.ok(deadDialog().textContent.includes(DEAD_LINE))
})

test("A09-F-202 7명 판 사망 창 → \"관전 계속\"·\"나가기\" 단추", async () => {
  await deadPage({ n: 7, me: 3 })
  const labels = [...deadDialog().querySelectorAll("button")].map((b) => b.textContent.trim())
  assert.ok(labels.some((l) => l.startsWith("관전 계속")), `단추: ${labels.join(",")}`)
  assert.ok(labels.some((l) => l.includes("나가기")), `단추: ${labels.join(",")}`)
})

test("A09-F-203 8명 판 사망 창 \"게임 나가기\" 누름 → 확인 창 글 = 죽은 사람 글", async () => {
  await deadPage({ n: 8, me: 4 })
  K.dialogs.confirmAnswer = false
  await K.click(K.buttonByText("게임 나가기", deadDialog()))
  assert.equal(K.dialogs.confirms.length, 1)
  assert.ok(K.dialogs.confirms[0].includes(DEAD_LINE), `글: ${K.dialogs.confirms[0]}`)
  assert.equal(K.dialogs.confirms[0].includes("패배"), false)
})

test("A09-F-204 5명 판 죽은 사람 나가기 실패 → 사망 글 + \"나가기에 실패했습니다…\" + 다시 시도", async () => {
  const t = await deadPage({ n: 5, me: 1 })
  K.dialogs.confirmAnswer = true
  await K.click(K.buttonByText("게임 나가기", deadDialog()))
  await t.answer("leave_game_session", { ok: false, code: "LEAVE_NOT_ALLOWED" })
  const dialog = deadDialog()
  assert.ok(dialog !== null, "사망 창이 닫힘")
  assert.ok(dialog.textContent.includes("당신은 사망했습니다."))
  assert.ok(dialog.textContent.includes("나가기에 실패했습니다"), dialog.textContent)
  assert.ok(K.buttonByText("다시 시도", dialog) !== null, "다시 시도 단추 없음")
})

test("A09-F-251 6명 판 \"관전 계속\" 고른 뒤 밤·다음 낮으로 넘어가도 사망 창 안 뜸 [지금 동작]", async () => {
  const t = await deadPage({ n: 6, me: 2 })
  await K.click(K.buttonByText("관전 계속하기", deadDialog()))
  assert.ok(deadDialog() === null, "관전 계속 뒤에도 창이 있음")
  // 낮 투표 모두 기권 → 밤
  const aliveCount = t.seats.filter((s) => s.alive).length
  await t.say("day_vote_resolved", {
    gameId: t.gameId, dayIndex: 1, phase: "NIGHT", round: 1, outcome: "ABSTAINED", tribunalTargetUuid: null,
    publicVoteCount: aliveCount, publicAbstainCount: aliveCount, revoteExcludedUuids: [],
  })
  assert.equal(t.state().phase, "NIGHT")
  assert.ok(deadDialog() === null, "밤에 사망 창이 다시 뜸")
  // 아무도 안 죽은 밤 → 2일 낮
  await t.say("night_result_applied", {
    gameId: t.gameId, phase: "DAY", dayIndex: 2, players: t.seats.map((s) => ({ uuid: s.uuid, alive: s.alive })),
    victimUuid: null, deathReveals: [], doctorSaved: false, dayPhaseDeadline: Date.now() + 60_000,
  })
  assert.equal(t.state().phase, "DAY")
  assert.ok(deadDialog() === null, "다음 낮에 사망 창이 다시 뜸")
})

test("A09-F-252 7명 판 관전 계속 뒤 새 판에서 죽음 → 사망 창 다시 뜸 [지금 동작]", async () => {
  const t = await deadPage({ n: 7, me: 3 })
  await K.click(K.buttonByText("관전 계속하기", deadDialog()))
  assert.ok(deadDialog() === null)
  // 새 판 (같은 사람들, 역할 확인 창은 이미 닫음, 처음엔 산 채)
  const nextSeats = t.state().players.map((p) => ({ ...p, alive: true }))
  const next = { ...t.state(), id: "a09-next-game", players: nextSeats }
  markRoleRevealSeen("a09-next-game", t.me)
  await K.RTL.act(async () => { K.useInGameStore.getState().setGamePayload({ gameId: "a09-next-game", state: next }) })
  await K.flush()
  assert.ok(deadDialog() === null, "새 판 시작에 사망 창이 뜸")
  // 새 판에서 내가 죽음 (판에서 빠짐 알림)
  await t.say("player_eliminated", {
    gameId: "a09-next-game", phase: "DAY", dayIndex: 1, victimUuid: t.me,
    players: nextSeats.map((p) => ({ uuid: p.uuid, alive: p.uuid !== t.me })),
  })
  assert.equal(t.player(3).alive, false, "새 판에서 죽음 반영")
  assert.ok(deadDialog() !== null, "새 판에서 사망 창이 안 뜸")
})

test("A09-F-273 6명 판 사망 창 \"관전 계속하기\"에 초점 두고 Enter → 창 닫힘", async () => {
  await deadPage({ n: 6, me: 1 })
  const keep = K.buttonByText("관전 계속하기", deadDialog())
  await K.RTL.act(async () => { keep.focus() })
  assert.ok(document.activeElement === keep, "초점이 단추에 안 감")
  await K.pressEnter(keep)
  assert.ok(deadDialog() === null, "Enter로 안 닫힘")
})
