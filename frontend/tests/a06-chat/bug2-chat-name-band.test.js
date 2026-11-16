// 판 채팅 줄 이름 띠 시험: 이름에만 그 사람 색 + 카드 이름판과 같은 띠, 말은 기본 글자색, 설정 끄면 띠 없음, 죽은 사람 줄은 회색 이름 띠
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-202~218, 결정 2026-11-16 밤 "이름만 그 사람 색, 말은 기본 글자색, 이름엔 이름판 띠"
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, startFakeClock, tick, useSettingsStore } from "./a06Kit.mjs"

const { INTRO_HOLD_MS } = await import("../../src/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js")

const { INGAME_PLAYER_THEME_PALETTE } = await import("../../src/shared/constants/ingamePlayerTheme.js")
const { NAMEPLATE_BANDS, pickNameplateBand, worstBandContrast } = await import("../../src/domains/game/ingame/utils/nameplateBand.js")
const { DEAD_CHAT_NAME_COLOR, resolveChatNameBand } = await import("../../src/domains/game/ingame/utils/chatNameBand.js")

const firstChatChecks = useSettingsStore.getState().chatChecks
test.afterEach(() => {
  useSettingsStore.setState({ chatChecks: firstChatChecks })
  return resetTable()
})

// 글자 대비 기준 (WCAG 보통 글)
const MIN_CONTRAST = 4.5

// "#ffffff" → "rgb(255, 255, 255)" (jsdom style.color 모양)
const rgbText = (hex) => `rgb(${[0, 2, 4].map((at) => parseInt(hex.replace("#", "").slice(at, at + 2), 16)).join(", ")})`
// 줄 안 이름 띠 칸·본문 칸 (본문은 줄의 마지막 칸)
const bandOf = (li) => li.querySelector("[data-chat-name-band]")
const bodyOf = (li) => [...li.querySelectorAll("span")].at(-1)
// 글로 줄 찾기
const rowByText = (rows, text) => rows.find((li) => li.textContent.includes(text))
const setNicknameColor = (on) => useSettingsStore.setState({ chatChecks: { ...firstChatChecks, "nickname-color": on } })

// 팔레트 색마다: 채팅 이름 띠 위 가장 나쁜 대비 (뒤 종이가 흰색·검정 어느 쪽이어도)
INGAME_PLAYER_THEME_PALETTE.forEach((entry, index) => {
  test(`A06-F-${202 + index} 채팅 이름 색 ${index}번(${entry.color}) → 고른 띠 위 대비 4.5 이상`, () => {
    const band = resolveChatNameBand({ color: entry.color }, true)
    assert.ok(band, "띠가 없음")
    assert.equal(band.style.color, entry.color, "이름 글자색이 그 사람 색이 아님")
    const contrast = worstBandContrast(band.style.color, NAMEPLATE_BANDS[band.kind])
    assert.ok(contrast >= MIN_CONTRAST, `${entry.color} ${band.kind} 띠 ${contrast.toFixed(2)}`)
  })
})

test("A06-F-212 10명 판 낮 채팅 → 줄마다 이름만 그 사람 색 띠 칸 안, 말 칸엔 색 없음(기본 글자색)", async () => {
  const t = await openTable({ n: 10, me: 0, roles: { 9: "JOKER" }, phase: "DAY", view: "page" })
  for (let i = 1; i < 10; i += 1) await t.dayChat(i, `말${i}`)
  const rows = t.rowEls("board")
  for (let i = 1; i < 10; i += 1) {
    const li = rowByText(rows, `말${i}`)
    const color = INGAME_PLAYER_THEME_PALETTE[i].color
    const band = bandOf(li)
    assert.ok(band, `${i}번 줄 이름 띠 없음`)
    assert.equal(band.textContent, t.nick(i))
    assert.equal(band.style.color, rgbText(color), `${i}번 이름 색`)
    assert.equal(band.getAttribute("data-chat-name-band"), pickNameplateBand(color), `${i}번 띠 종류`)
    assert.equal(bodyOf(li).style.color, "", `${i}번 말 칸에 색이 들어감`)
  }
})

test("A06-F-213 \"닉네임 색상 표시\" 끔 → 이름 띠 없음, 이름·말 모두 기본색", async () => {
  setNicknameColor(false)
  const t = await openTable({ n: 6, me: 0, roles: { 5: "JOKER" }, phase: "DAY", view: "page" })
  await t.dayChat(1, "끈 줄")
  const li = rowByText(t.rowEls("board"), "끈 줄")
  assert.equal(bandOf(li), null)
  for (const span of li.querySelectorAll("span")) assert.equal(span.style.color, "", "칸에 색이 들어감")
})

test("A06-F-214 죽은 사람 줄 → 이름은 회색 띠(대비 4.5 이상), 말은 기본색 / 산 사람 줄 이름은 그 사람 색", async () => {
  const t = await openTable({ n: 7, me: 3, roles: { 0: "JOKER", 5: "DOCTOR" }, dead: [3, 4], phase: "DAY", view: "page" })
  await t.dayChat(1, "산사람말")
  await t.deadChat(4, "죽은사람말")
  const rows = t.rowEls("board")
  const dead = rowByText(rows, "죽은사람말")
  assert.equal(bandOf(dead).style.color, rgbText(DEAD_CHAT_NAME_COLOR))
  assert.equal(bodyOf(dead).style.color, "")
  const kind = bandOf(dead).getAttribute("data-chat-name-band")
  assert.ok(worstBandContrast(DEAD_CHAT_NAME_COLOR, NAMEPLATE_BANDS[kind]) >= MIN_CONTRAST)
  assert.equal(bandOf(rowByText(rows, "산사람말")).style.color, rgbText(INGAME_PLAYER_THEME_PALETTE[1].color))
})

test("A06-F-215 죽은 사람 줄은 \"닉네임 색상 표시\" 꺼도 회색 이름 띠 (산 사람 줄과 구분)", async () => {
  setNicknameColor(false)
  const t = await openTable({ n: 7, me: 3, roles: { 0: "JOKER", 5: "DOCTOR" }, dead: [3, 4], phase: "DAY", view: "page" })
  await t.dayChat(1, "산사람말")
  await t.deadChat(4, "죽은사람말")
  const rows = t.rowEls("board")
  assert.equal(bandOf(rowByText(rows, "죽은사람말"))?.style.color, rgbText(DEAD_CHAT_NAME_COLOR))
  assert.equal(bandOf(rowByText(rows, "산사람말")), null)
})

test("A06-F-216 크게 보기 창 줄도 같은 규칙 (이름 띠 + 말 기본색)", async () => {
  const t = await openTable({ n: 6, me: 0, roles: { 5: "JOKER" }, phase: "DAY", view: "page" })
  await t.openCloseup()
  await t.dayChat(2, "크게말")
  const li = rowByText(t.rowEls("closeup"), "크게말")
  assert.equal(bandOf(li)?.style.color, rgbText(INGAME_PLAYER_THEME_PALETTE[2].color))
  assert.equal(bodyOf(li).style.color, "")
})

test("A06-F-217 띠는 줄 높이를 안 바꾸는 글 칸(inline, 위아래 여백 없음), 줄 글은 그대로 '닉네임:\"글\"'", async () => {
  const t = await openTable({ n: 6, me: 0, roles: { 5: "JOKER" }, phase: "DAY", view: "page" })
  await t.dayChat(1, "높이")
  const li = rowByText(t.rowEls("board"), "높이")
  const band = bandOf(li)
  assert.equal(band.tagName, "SPAN")
  assert.doesNotMatch(band.className, /\b(inline-block|block|flex|py-\S+|pt-\S+|pb-\S+)\b/)
  assert.equal(li.textContent, `${t.nick(1)}:"높이"`)
})

test("A06-F-218 재판 창 채팅 줄도 같은 규칙 (이름 띠 + 말 기본색)", async () => {
  startFakeClock()
  const t = await openTable({ n: 7, me: 1, roles: { 0: "JOKER", 5: "DOCTOR" }, phase: "DAY", view: "page" })
  await t.openTribunal(3)
  await tick(INTRO_HOLD_MS)
  await t.dayChat(2, "재판말")
  const li = rowByText(t.rowEls("tribunal"), "재판말")
  assert.ok(li, "재판 창 줄이 없음 (준비 잘못)")
  assert.equal(bandOf(li)?.style.color, rgbText(INGAME_PLAYER_THEME_PALETTE[2].color))
  assert.equal(bodyOf(li).style.color, "")
})
