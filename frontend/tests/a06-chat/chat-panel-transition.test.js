// 단계·판이 바뀔 때 채팅 칸 시험(jsdom, 인게임 화면 전체) — 새로고침 스냅샷, 밤↔낮 목록 바뀜, 처형·밤 죽음 뒤 죽은 사람 칸, 쓰던 글 남음·새 판 비움
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-172~178, A06-F-199~200
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useInGameStore } from "./a06Kit.mjs"

const { saveChatHistory } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")

test.afterEach(resetTable)

const CLOSED_TEXT = "밤에는 귀족이 채팅을 쓸 수 없습니다"

// 새로고침 흉내: 판 값을 비우고 서버 스냅샷으로 채운 뒤 인게임 화면을 처음부터 그림
async function reloadPage(t, beforeMount = () => {}) {
  const snapshot = t.snapshot()
  RTL.cleanup()
  await RTL.act(async () => {
    useInGameStore.getState().clearGame()
    useInGameStore.getState().bootstrapSessionSnapshot(snapshot, null)
  })
  assert.equal(useInGameStore.getState().gameId, t.gameId, "스냅샷을 스토어가 안 받음")
  beforeMount()
  await t.mount("page")
}

test("A06-F-172 [단위 2] 새로고침 스냅샷 밤·나 산 시민 → 입력칸 없음·까닭 글", async () => {
  const t = await openTable({ n: 6, me: 2, roles: { 0: "JOKER", 5: "DOCTOR" }, phase: "NIGHT", view: "none" })
  await reloadPage(t)
  assert.equal(t.input("board") === null, true, "시민 입력칸이 있음")
  assert.equal(t.closedText("board")?.textContent, CLOSED_TEXT)
})

test("A06-F-173 새로고침 스냅샷 밤·나 산 의사 → 입력칸 있음", async () => {
  const t = await openTable({ n: 6, me: 5, myRole: "DOCTOR", roles: { 0: "JOKER" }, phase: "NIGHT", view: "none" })
  await reloadPage(t)
  assert.ok(t.input("board") !== null, "의사 입력칸이 없음")
  assert.equal(t.closedText("board") === null, true)
})

test("A06-F-174 새로고침 뒤 낮 줄 다시 그림: 저장 2줄 + 스냅샷 → 2줄 보임", async () => {
  const t = await openTable({ n: 6, me: 0, roles: { 5: "JOKER" }, phase: "DAY", view: "none" })
  await reloadPage(t, () => {
    saveChatHistory("game", t.gameId, t.me, {
      DAY: [
        { id: "k1", senderUuid: t.uuid(1), text: "기억한말1", sentAt: 1_000 },
        { id: "k2", senderUuid: t.uuid(2), text: "기억한말2", sentAt: 2_000 },
      ],
    })
  })
  const rows = t.rows("board")
  assert.equal(rows.length, 2)
  assert.ok(rows[0].includes("기억한말1") && rows[1].includes("기억한말2"))
})

test("A06-F-175 의사 밤 → 낮: 밤 줄 뒤 낮 시작 → 목록에 밤 줄 없음", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER", 2: "DOCTOR" }, phase: "NIGHT", view: "page" })
  await t.roleChat(2, "밤에만한말")
  assert.ok(t.rows("board").some((row) => row.includes("밤에만한말")), "밤 줄이 처음부터 안 보임")
  await t.nextDay()
  assert.equal(t.rows("board").some((row) => row.includes("밤에만한말")), false)
})

// 밤에 산 직업은 목록에 낮 채팅 + 직업 채팅을 시간 순으로 섞어 보임 (보내기는 직업 채널)
test("A06-F-176 의사 낮 → 밤: 낮 줄 뒤 밤 시작 → 목록에 낮 줄 그대로, 입력 열림", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER", 2: "DOCTOR" }, phase: "DAY", view: "page" })
  await t.dayChat(3, "낮에한말")
  assert.ok(t.rows("board").some((row) => row.includes("낮에한말")), "낮 줄이 처음부터 안 보임")
  await t.toNight()
  assert.equal(t.rows("board").some((row) => row.includes("낮에한말")), true)
  assert.ok(t.input("board") !== null, "밤 의사 입력칸이 없음")
})

test("A06-F-177 내가 처형됨(재판 결과 처형 = 나) → \"죽은 사람끼리\" 보임, 입력 있음", async () => {
  const t = await openTable({ n: 7, me: 3, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.openTribunal(3)
  await t.resolveTribunal("GUILTY")
  assert.equal(t.deadBadge("board")?.textContent, "죽은 사람끼리")
  assert.ok(t.input("board") !== null, "죽은 뒤 입력칸이 없음")
})

test("A06-F-178 밤에 내가 죽은 걸로 낮이 됨(희생자 = 나) → \"죽은 사람끼리\" 보임", async () => {
  const t = await openTable({ n: 6, me: 2, roles: { 0: "JOKER" }, phase: "NIGHT", view: "page" })
  await t.nextDay({ victim: 2 })
  assert.equal(t.deadBadge("board")?.textContent, "죽은 사람끼리")
})

test("A06-F-199 산 의사 낮 입력 \"x\" → 밤 → 다음 낮 → 낮 입력 \"x\" 남음 [지금 동작]", async () => {
  const t = await openTable({ n: 6, me: 1, myRole: "DOCTOR", roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.type("x")
  await t.toNight()
  assert.equal(t.input("board")?.value, "", "밤 칸에 낮 글이 보임")
  await t.nextDay()
  assert.equal(t.input("board")?.value, "x")
})

test("A06-F-200 판 1 입력 \"x\" → 판 2 시작 → 입력 \"\" [지금 동작]", async () => {
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.type("x")
  assert.equal(t.input("board")?.value, "x")
  await t.newGame()
  assert.equal(t.input("board")?.value, "")
})
