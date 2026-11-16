// 재판 창 부품 시험(jsdom): 피고 카드·유죄/무죄 단추·안내 글·보내기·꺼짐·"재판 판정" 단추 없음·직업 안 보임·창 열림/닫힘
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-201~206, 210~213, 220~227, 232, 247, 248, 255, 256, 270
import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  openTable, resetTable, RTL, React,
  InGameActionProvider, InGameChatSessionProvider, InGameTribunalPresentationGate,
} from "./tribunalTable.mjs"

const { InGamePlayerSessionContext } = await import("../../src/domains/game/ingame/components/InGamePlayerSessionContext.js")
const { pickInGameJobPortrait } = await import("../../src/domains/game/ingame/utils/pickInGameJobPortrait.js")
const { publicAsset } = await import("../../src/shared/utils/publicAsset.js")

test.afterEach(resetTable)

const { screen, within } = RTL
const ROLE_WORDS = /광대|의사|경비원|마녀사냥꾼|시민/

// 재판 창 (없으면 null)
const tribunalDialog = () => screen.queryByRole("dialog", { name: "재판" })
const voteButton = (name) => within(tribunalDialog()).queryByRole("button", { name })

// 재판 중인 인게임 화면 (나는 1번 자리, 피고는 3번 자리)
async function tribunalPage(n, { defendant = 3, ...options } = {}) {
  const t = await openTable({ n, view: "page", ...options })
  await t.openTribunal(defendant)
  return t
}

;[
  ["A04-F-201", 5],
  ["A04-F-202", 7],
  ["A04-F-203", 10],
].forEach(([id, n]) => {
  test(`${id} ${n}명 판: 재판 상태 → 재판 창에 피고 카드·"유죄"·"무죄" 단추`, async () => {
    const t = await tribunalPage(n)
    const dialog = tribunalDialog()
    assert.ok(dialog, "재판 창이 없음")
    assert.match(dialog.textContent, new RegExp(t.nick(3)))
    assert.ok(voteButton("유죄"), "유죄 단추 없음")
    assert.ok(voteButton("무죄"), "무죄 단추 없음")
  })
})

test("A04-F-204 6명 판: 피고 화면 → 단추 없음 + \"당신은 피고인입니다. 투표할 수 없습니다.\"", async () => {
  await tribunalPage(6, { defendant: 1 })
  assert.equal(voteButton("유죄"), null)
  assert.equal(voteButton("무죄"), null)
  assert.ok(within(tribunalDialog()).queryByText("당신은 피고인입니다. 투표할 수 없습니다."))
})

test("A04-F-205 7명 판: 죽은 사람 화면 → 단추 없음 + \"사망한 참가자는 투표할 수 없습니다.\"", async () => {
  await tribunalPage(7, { dead: [1] })
  assert.equal(voteButton("유죄"), null)
  assert.ok(within(tribunalDialog()).queryByText("사망한 참가자는 투표할 수 없습니다."))
})

test("A04-F-206 8명 판: 낸 사람 화면 → 단추 없음 + \"투표가 완료되었습니다.\"", async () => {
  const t = await tribunalPage(8)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  assert.equal(voteButton("유죄"), null)
  assert.ok(within(tribunalDialog()).queryByText("투표가 완료되었습니다."))
})

test("A04-F-210 6명 판: \"유죄\" 누르면 cast_tribunal_vote vote GUILTY·지금 날짜", async () => {
  const t = await tribunalPage(6)
  await t.click(voteButton("유죄"))
  assert.deepEqual(t.sentOf("cast_tribunal_vote"), [{ gameId: t.gameId, dayIndex: 1, vote: "GUILTY" }])
})

test("A04-F-211 6명 판: \"무죄\" 누르면 NOT_GUILTY", async () => {
  const t = await tribunalPage(6)
  await t.click(voteButton("무죄"))
  assert.deepEqual(t.sentOf("cast_tribunal_vote").map((p) => p.vote), ["NOT_GUILTY"])
})

test("A04-F-212 7명 판: 누른 뒤 답 전 → 두 단추 disabled", async () => {
  const t = await tribunalPage(7)
  assert.equal(voteButton("유죄").disabled, false)
  await t.click(voteButton("유죄"))
  assert.equal(voteButton("유죄").disabled, true)
  assert.equal(voteButton("무죄").disabled, true)
})

test("A04-F-213 8명 판: 성공 답 → 단추 사라지고 \"투표가 완료되었습니다.\"", async () => {
  const t = await tribunalPage(8)
  await t.click(voteButton("무죄"))
  await t.answer("cast_tribunal_vote", t.voteOk("NOT_GUILTY"))
  assert.equal(voteButton("유죄"), null)
  assert.equal(voteButton("무죄"), null)
  assert.ok(within(tribunalDialog()).queryByText("투표가 완료되었습니다."))
})

test("A04-F-220 6명 판: 개발 빌드로 그린 재판 화면 어디에도 \"재판 판정\" 없음", () => {
  // 개발 빌드 환경값은 이 프로세스와 달라 따로 띄운 node에서 그림 (mobileChild.mjs dev-gate)
  const child = fileURLToPath(new URL("./mobileChild.mjs", import.meta.url))
  const out = execFileSync(process.execPath, [child, "dev-gate"], { encoding: "utf8", timeout: 60_000 })
  const result = JSON.parse(out.trim().split("\n").at(-1))
  assert.equal(result.devEnv, true)
  assert.equal(result.tribunalOpen, true)
  assert.ok(result.buttons.includes("유죄"), "재판 창 단추를 못 그림")
  assert.equal(result.buttons.some((name) => name.includes("재판 판정")), false)
  assert.doesNotMatch(result.text, /재판 판정/)
})

test("A04-F-221 6명 판: 운영 빌드로 그린 재판 화면 어디에도 \"재판 판정\" 없음", async () => {
  await tribunalPage(6)
  assert.ok(voteButton("유죄"), "재판 창 단추를 못 그림")
  assert.equal(screen.queryByRole("button", { name: /재판 판정/ }), null)
  assert.doesNotMatch(document.body.textContent, /재판 판정/)
})

test("A04-F-222 7명 판: 보드 명단에 피고가 없고 판 명단 닉네임 \"가면\" → 기본 그림 + \"가면\"", async () => {
  const h = React.createElement
  // 보드 명단이 빈 판 화면 (판 명단에는 피고가 있음)
  const emptyBoard = { players: [], localPlayerId: null, getPlayerById: () => null, getThemeByPlayerId: () => null, getThemeStylesByPlayerId: () => null }
  const t = await openTable({
    n: 7,
    names: { 3: "가면" },
    view: () => h(InGamePlayerSessionContext.Provider, { value: emptyBoard },
      h(InGameChatSessionProvider, null, h(InGameActionProvider, null, h(InGameTribunalPresentationGate)))),
  })
  await t.openTribunal(3)
  const dialog = tribunalDialog()
  assert.ok(dialog, "재판 창이 없음")
  assert.match(dialog.textContent, /가면/)
  const srcs = [...dialog.querySelectorAll("img")].map((img) => img.getAttribute("src"))
  assert.ok(srcs.includes(publicAsset(pickInGameJobPortrait(0))), `기본 그림이 아님: ${srcs.join(", ")}`)
})

test("A04-F-223 5명 판: 두 명단 어디에도 피고가 없으면 \"알 수 없는 플레이어\"", async () => {
  const t = await openTable({ n: 5, view: "page" })
  await t.say("day_vote_resolved", t.tribunalEntryPayload(3, { uuid: "a04-not-in-roster" }))
  assert.equal(t.state().phase, "TRIBUNAL")
  assert.match(tribunalDialog().textContent, /알 수 없는 플레이어/)
})

test("A04-F-224 6명 판: 단계 DAY → 재판 창 없음", async () => {
  await openTable({ n: 6, view: "page" })
  assert.equal(tribunalDialog(), null)
})

test("A04-F-225 8명 판: 판정 결과 반영 → 재판 창 닫힘", async () => {
  const t = await tribunalPage(8)
  assert.ok(tribunalDialog())
  await t.resolve("NOT_GUILTY")
  assert.equal(tribunalDialog(), null)
})

test("A04-F-226 [지금 동작] 6명 판: Esc 눌러도 재판 창 그대로", async () => {
  const t = await tribunalPage(6)
  await t.key(tribunalDialog(), "Escape")
  await t.key(document.body, "Escape")
  assert.ok(tribunalDialog(), "Esc로 재판 창이 닫힘")
  assert.ok(voteButton("유죄"))
})

test("A04-F-227 [지금 동작] 7명 판: 재판 창 뒤 판 화면(사람 카드)은 못 누름", async () => {
  const t = await tribunalPage(7)
  // 판 화면이 inert(누름·초점 막음)로 잠김 — jsdom은 inert를 지키지 않아 표시가 붙었는지로 봄
  const cards = [...document.querySelectorAll('[aria-haspopup="menu"]')]
  const defendantCard = cards.find((card) => card.textContent.includes(t.nick(3)))
  assert.ok(defendantCard, "판 화면의 피고 카드를 못 찾음")
  assert.notEqual(defendantCard.closest("[inert]"), null, "판 화면이 잠기지 않음")
  assert.equal(tribunalDialog().closest("[inert]"), null, "재판 창까지 잠김")
})

test("A04-F-232 10명 판: 재판 창 글·처형 결과 알림(executedRole) 뒤 화면에 직업 이름 없음", async () => {
  const t = await tribunalPage(10, { defendant: 0, jokers: [0, 5] })
  assert.doesNotMatch(tribunalDialog().textContent, ROLE_WORDS)
  const payload = await t.resolve("GUILTY")
  assert.equal(payload.executedRole, "JOKER")
  assert.equal(tribunalDialog(), null)
  assert.doesNotMatch(document.body.textContent, /광대/)
})

test("A04-F-247 6명 판: getByRole('button', { name: '유죄' })·'무죄'로 단추가 찾힘", async () => {
  await tribunalPage(6)
  assert.ok(screen.getByRole("button", { name: "유죄" }))
  assert.ok(screen.getByRole("button", { name: "무죄" }))
})

test("A04-F-248 7명 판: 보내는 중 두 단추에 disabled 속성", async () => {
  const t = await tribunalPage(7)
  await t.click(voteButton("무죄"))
  assert.equal(voteButton("유죄").hasAttribute("disabled"), true)
  assert.equal(voteButton("무죄").hasAttribute("disabled"), true)
})

test("A04-F-255 6명 판: \"유죄\" 두 번 빨리 눌러도 보내기 1번", async () => {
  const t = await tribunalPage(6)
  const guilty = voteButton("유죄")
  await RTL.act(async () => {
    RTL.fireEvent.click(guilty)
    RTL.fireEvent.click(guilty)
  })
  assert.equal(t.sentOf("cast_tribunal_vote").length, 1)
})

test("A04-F-256 7명 판: \"유죄\" 뒤 바로 \"무죄\" 눌러도 유죄 1번만", async () => {
  const t = await tribunalPage(7)
  const guilty = voteButton("유죄")
  const notGuilty = voteButton("무죄")
  await RTL.act(async () => {
    RTL.fireEvent.click(guilty)
    RTL.fireEvent.click(notGuilty)
  })
  assert.deepEqual(t.sentOf("cast_tribunal_vote").map((p) => p.vote), ["GUILTY"])
})

test("A04-F-270 8명 판: 피고 연결 끊김 알림이 와도 재판 창·단추 그대로", async () => {
  const t = await tribunalPage(8)
  await t.connection(3, false)
  assert.equal(t.player(3).isConnected, false)
  assert.ok(tribunalDialog(), "재판 창이 닫힘")
  assert.equal(voteButton("유죄").disabled, false)
  assert.equal(voteButton("무죄").disabled, false)
})
