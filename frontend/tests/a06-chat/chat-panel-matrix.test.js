// 채팅 칸 표 시험(jsdom, 인게임 화면 전체) — 단계 5 × 나 5칸마다 입력칸·까닭 글·"죽은 사람끼리"·Enter 때 나가는 사건
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-081~103 (역할 확인 × 죽은 사람 2칸은 목록대로 뺌)
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, startFakeClock, tick } from "./a06Kit.mjs"

const { INTRO_HOLD_MS } = await import("../../src/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js")

test.afterEach(resetTable)

const CLOSED_TEXT = "밤에는 시민이 채팅을 쓸 수 없습니다"

// 단계 5 (역할 확인·낮 토론·낮 투표·재판·밤)
const PHASES = [
  { key: "역할 확인", phase: "ROLE_REVEAL" },
  { key: "낮 토론", phase: "DAY", dayPhase: "DAY_DISCUSSION" },
  { key: "낮 투표", phase: "DAY", dayPhase: "DAY_VOTE" },
  { key: "재판", phase: "TRIBUNAL" },
  { key: "밤", phase: "NIGHT" },
]
// 나 5 (산 시민·산 광대·산 의사·죽은 시민·죽은 광대)
const ME = [
  { key: "산 시민", role: "CITIZEN", alive: true },
  { key: "산 광대", role: "JOKER", alive: true },
  { key: "산 의사", role: "DOCTOR", alive: true },
  { key: "죽은 시민", role: "CITIZEN", alive: false },
  { key: "죽은 광대", role: "JOKER", alive: false },
]

// 칸마다 기대 (목록 기대값 그대로)
function expectedFor(p, me) {
  if (p.phase === "ROLE_REVEAL") return { event: null }
  if (!me.alive) return { input: true, closed: false, dead: true, event: "submit_game_chat_message" }
  if (p.phase === "NIGHT") {
    if (me.role === "CITIZEN") return { input: false, closed: true, dead: false, event: null }
    return { input: true, closed: false, dead: false, event: "submit_joker_chat_message" }
  }
  return { input: true, closed: false, dead: false, event: "submit_game_chat_message" }
}

// 7명 판: 0번 광대(동료 광대), 5번 의사(동료 의사), 나 = 2번, 재판이면 피고 3번
async function openCell(p, me) {
  if (p.phase === "TRIBUNAL") startFakeClock()
  const t = await openTable({
    n: 7,
    me: 2,
    myRole: me.role,
    roles: { 0: "JOKER", 5: "DOCTOR" },
    dead: me.alive ? [] : [2],
    phase: p.phase,
    dayPhase: p.dayPhase ?? "DAY_VOTE",
    defendant: p.phase === "TRIBUNAL" ? 3 : null,
    view: "page",
  })
  // 재판 창은 처음 연출 1초 뒤 채팅이 열림
  if (p.phase === "TRIBUNAL") await tick(INTRO_HOLD_MS)
  return t
}

let number = 81
for (const p of PHASES) {
  for (const me of ME) {
    if (p.phase === "ROLE_REVEAL" && !me.alive) continue
    const id = `A06-F-${String(number).padStart(3, "0")}`
    number += 1
    const exp = expectedFor(p, me)
    test(`${id} 채팅 칸 표: ${p.key} × ${me.key}`, async () => {
      const t = await openCell(p, me)
      assert.ok(t.box(), "채팅 칸이 화면에 없음")

      if (exp.input !== undefined) {
        assert.equal(t.input() !== null, exp.input, `입력칸 ${exp.input ? "있어야" : "없어야"} 함`)
        // 있으면 잠긴 덮개(inert) 밖이어야 사람이 씀
        if (exp.input) assert.equal(t.input().closest("[inert]") === null, true, "입력칸이 잠긴 덮개 안에 있음")
        assert.equal(t.closedText()?.textContent ?? null, exp.closed ? CLOSED_TEXT : null)
        assert.equal(t.deadBadge()?.textContent ?? null, exp.dead ? "죽은 사람끼리" : null)
      }

      // 칠 수 있으면 글 하나 치고 Enter
      if (t.input()) {
        await t.type("확인 글")
        await t.enter()
      }
      const game = t.sentOf("submit_game_chat_message")
      const role = t.sentOf("submit_joker_chat_message")
      if (exp.event === null) {
        assert.equal(game.length + role.length, 0, "사건이 나감")
      } else {
        const other = exp.event === "submit_game_chat_message" ? role : game
        assert.deepEqual(t.sentOf(exp.event), [{ gameId: t.gameId, text: "확인 글" }])
        assert.equal(other.length, 0, "다른 채팅 사건도 나감")
      }
    })
  }
}
