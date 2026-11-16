// 카드 연결 끊김 배지 시험(화면 부품, 판 화면 전체): 산·끊김·죽고 끊김은 "연결 끊김", 탈락은 사망, 다시 붙으면 없어짐, 배지 글·읽기 이름, 여러 명
// 목록 A09-끊김-나가기-탈주.md A09-F-222~228, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/status-badge.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { computeAccessibleName } = await import("dom-accessibility-api")

test.afterEach(() => K.reset())

// 카드 칸 안 상태 글 (화면 읽기용 숨김 글, 없으면 null) → "연결 끊김" | "사망"
function badgeText(nickname) {
  const card = K.cardButton(nickname)
  const sr = [...card.querySelectorAll(".sr-only")].map((el) => el.textContent).find((t) => t === "연결 끊김" || t === "사망")
  return sr ?? null
}

test("A09-F-222 6명 판 산 사람 3번이 끊김 알림 → 그 카드 \"연결 끊김\" 배지", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0] })
  await K.renderPage()
  await t.say("session_player_connection_changed", t.connectionPayload(3, false))
  assert.equal(badgeText(t.nick(3)), "연결 끊김")
})

test("A09-F-223 7명 판 처형된 4번(판 자리 남음)이 끊김 → \"연결 끊김\" 배지 [지금 동작]", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0], dead: [4] })
  await K.renderPage()
  await t.say("session_player_connection_changed", t.connectionPayload(4, false))
  assert.equal(badgeText(t.nick(4)), "연결 끊김")
})

test("A09-F-224 8명 판 끊긴 5번이 60초 탈락(빠짐) → 사망 배지", async () => {
  const t = K.seat({ n: 8, me: 1, jokers: [0, 2], disconnected: [5] })
  await K.renderPage()
  await t.say("player_eliminated", t.eliminatedPayload(5))
  await t.say("session_participation_changed", t.participationPayload({ leftIndexes: [5] }))
  assert.equal(badgeText(t.nick(5)), "사망")
})

test("A09-F-225 5명 판 끊긴 2번이 다시 붙음 → 배지 없어짐", async () => {
  const t = K.seat({ n: 5, me: 1, jokers: [0], disconnected: [2] })
  await K.renderPage()
  assert.equal(badgeText(t.nick(2)), "연결 끊김", "처음엔 끊김 배지")
  await t.say("session_player_connection_changed", t.connectionPayload(2, true))
  assert.equal(badgeText(t.nick(2)), null)
})

test("A09-F-226 끊긴 카드 배지 글 = \"연결 끊김\"", async () => {
  const t = K.seat({ n: 6, me: 1, jokers: [0], disconnected: [4] })
  await K.renderPage()
  const texts = [...K.cardButton(t.nick(4)).querySelectorAll(".sr-only")].map((el) => el.textContent)
  assert.ok(texts.includes("연결 끊김"), `글: ${JSON.stringify(texts)}`)
})

test("A09-F-227 끊긴 카드의 읽기 프로그램용 이름에 \"연결 끊김\"", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0], disconnected: [5] })
  await K.renderPage()
  const name = computeAccessibleName(K.cardButton(t.nick(5)))
  assert.ok(name.includes("연결 끊김"), `읽기 이름: ${name}`)
  assert.ok(name.includes(t.nick(5)), `읽기 이름에 닉네임 없음: ${name}`)
})

test("A09-F-228 10명 판 3명(2·5·8번) 끊김 → 그 3명 카드에만 배지", async () => {
  const t = K.seat({ n: 10, me: 0, jokers: [1, 3], disconnected: [2, 5, 8] })
  await K.renderPage()
  const withBadge = t.seats.map((s, i) => (badgeText(s.nickname) === "연결 끊김" ? i : null)).filter((i) => i !== null)
  assert.deepEqual(withBadge, [2, 5, 8])
})
