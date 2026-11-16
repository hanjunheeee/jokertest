// 받은 채팅 줄 그림 시험(jsdom, 인게임 화면 전체) — 닉네임·글, 스크립트 끼운 글은 글자로만, 줄바꿈·가린 글·이모지 글자, 맨 아래로 내리기, 글자 크기 설정
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-120~130, A06-F-189~193
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, React, flush } from "./a06Kit.mjs"

const { default: SettingChatTab } = await import("../../src/domains/game/ingame/components/controls/ingameSetting/SettingChatTab.jsx")

test.afterEach(resetTable)

// 6명 낮 판, 나 = 0번
const dayTable = (options = {}) => openTable({ n: 6, me: 0, roles: { 5: "JOKER" }, phase: "DAY", view: "page", ...options })
// 줄의 본문 칸 (닉네임 다음 마지막 칸)
const bodyOf = (li) => [...li.querySelectorAll("span")].at(-1)

test("A06-F-120 받은 글 줄: 닉네임 \"모모\"와 글 \"안녕\" 둘 다 보임", async () => {
  const t = await dayTable({ names: { 1: "모모" } })
  await t.dayChat(1, "안녕")
  const [row] = t.rows("board")
  assert.ok(row?.includes("모모"), "닉네임이 안 보임")
  assert.ok(row?.includes("안녕"), "글이 안 보임")
})

const XSS = [
  ["A06-F-121", "<script>alert(1)</script>"],
  ["A06-F-122", "<img src=x onerror=alert(1)>"],
  ["A06-F-123", "<b>굵게</b>"],
  ["A06-F-124", "<a href=\"javascript:alert(1)\">눌러</a>"],
]
for (const [id, text] of XSS) {
  test(`${id} 스크립트 끼워 넣은 글 ${text} → 글자 그대로, 줄 안에 script·img·b·a 요소 0`, async () => {
    const t = await dayTable()
    await t.dayChat(1, text)
    const row = t.rowEls("board")[0]
    assert.ok(row, "줄이 없음")
    assert.ok(row.textContent.includes(text), "글자 그대로 안 보임")
    assert.equal(row.querySelectorAll("script, img, b, a").length, 0)
  })
}

test("A06-F-125 줄바꿈 든 글 \"가\\n나\" → 두 줄로 보임(줄바꿈 살림) [지금 동작]", async () => {
  const t = await dayTable()
  await t.dayChat(1, "가\n나")
  const body = bodyOf(t.rowEls("board")[0])
  assert.ok(body.textContent.includes("가\n나"), "줄바꿈이 사라짐")
  assert.ok(body.className.split(/\s+/).includes("whitespace-pre-wrap"), "줄바꿈을 살리는 글 모양이 아님")
})

test("A06-F-126 가려진 글 \"너 **야\" → 그대로 보임", async () => {
  const t = await dayTable()
  await t.dayChat(1, "너 **야")
  assert.ok(t.rows("board")[0]?.includes("너 **야"))
})

// 줄에 "나" 표시가 있는지 (글자 "(나)"·"[나]", 또는 나를 뜻하는 속성 이름·값)
function hasSelfMark(li) {
  for (const el of [li, ...li.querySelectorAll("*")]) {
    for (const attr of el.attributes) {
      if (/self|mine|own/i.test(attr.name)) return true
      if (/(^|\s)(self|mine|own|me)(\s|$)/i.test(attr.value) || /내 글|^나$/.test(attr.value)) return true
    }
  }
  return /\(나\)|\[나\]/.test(li.textContent)
}

test("A06-F-127 내 글과 남 글 구분: 내 uuid 줄에만 나 표시 [지금 동작]", async () => {
  const t = await dayTable()
  await t.dayChat(0, "내가 씀")
  await t.dayChat(1, "남이 씀")
  const [mine, other] = t.rowEls("board")
  assert.equal(hasSelfMark(mine), true, "내 줄에 나 표시가 없음")
  assert.equal(hasSelfMark(other), false, "남 줄에 나 표시가 있음")
})

const SHAPES = [
  ["A06-F-128", "이모지 그림 글자", "😀"],
  ["A06-F-129", "숫자만", "123"],
  ["A06-F-130", "150자 한 단어", "a".repeat(150)],
]
for (const [id, label, text] of SHAPES) {
  test(`${id} 받은 글 모양: ${label} → 글 그대로 다 보임`, async () => {
    const t = await dayTable()
    await t.dayChat(1, text)
    const body = bodyOf(t.rowEls("board")[0])
    assert.equal(body.textContent, `"${text}"`)
  })
}

// 채팅 목록 스크롤 흉내 (jsdom은 높이를 안 재서 값을 손으로 줌)
function fakeScroll(log, { height, client = 200, top }) {
  const box = { height, top }
  Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => box.height })
  Object.defineProperty(log, "clientHeight", { configurable: true, get: () => client })
  Object.defineProperty(log, "scrollTop", { configurable: true, get: () => box.top, set: (v) => { box.top = v } })
  return box
}
// 다음 화면 그리기(0ms 예약)까지 진짜 시간으로 기다림
const nextFrame = () => RTL.act(() => new Promise((resolve) => { setTimeout(resolve, 20) }))

const SCROLL = [
  ["A06-F-189", "바닥 48px 안에서 새 글 → 맨 아래로", 760, 1_100],
  ["A06-F-190", "위로 올려 읽는 중 새 글 → 그 자리", 300, 300],
]
for (const [id, label, startTop, expectedTop] of SCROLL) {
  test(`${id} 새 글이 오면 맨 아래로(바닥 근처일 때만): ${label}`, async () => {
    const t = await dayTable()
    await t.dayChat(1, "앞 글")
    await nextFrame()
    const log = t.board().querySelector('[role="log"]')
    const box = fakeScroll(log, { height: 1_000, top: startTop })
    await RTL.act(async () => { log.dispatchEvent(new window.Event("scroll")) })
    box.height = 1_100
    await t.dayChat(2, "새 글")
    await nextFrame()
    assert.equal(box.top, expectedTop)
  })
}

// 설정 창 채팅 탭 밀대 (같은 설정 스토어를 봄)
async function renderChatTab() {
  await RTL.act(async () => { RTL.render(React.createElement(SettingChatTab)) })
  await flush()
  return document.querySelector('input[aria-label="채팅 글자 크기"]')
}
async function slide(slider, value) {
  await RTL.act(async () => { RTL.fireEvent.change(slider, { target: { value: String(value) } }) })
  await flush()
}
const rowScale = (t) => t.rowEls("board")[0]?.style.getPropertyValue("--ingame-chat-text-scale") ?? null

const SIZES = [
  ["A06-F-191", "작게", 0, "0.6"],
  ["A06-F-192", "보통", 50, "0.8"],
  ["A06-F-193", "크게", 100, "1"],
]
for (const [id, label, value, scale] of SIZES) {
  test(`${id} 설정 창 채팅 탭 글자 크기 ${label}(${value}) → 줄 글자 크기 값 ${scale} [지금 동작]`, async () => {
    const t = await dayTable()
    await t.dayChat(1, "크기 보기")
    const slider = await renderChatTab()
    assert.ok(slider, "글자 크기 밀대가 없음")
    // 처음 값과 다른 데서 시작해 바뀌는지 봄
    await slide(slider, value === 0 ? 100 : 0)
    const before = rowScale(t)
    await slide(slider, value)
    assert.equal(rowScale(t), scale)
    assert.notEqual(before, scale)
  })
}
