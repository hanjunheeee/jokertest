// 친구 창 줄 넘침 시험: 줄 안 이름 칸 폭(1280 창 셈), 묻는 글·실패 글·끝난 까닭이 줄 아래 한 줄로 따로, 그 글이 종이 위에서도 읽히는 색
// 목록 A13-F-541~546 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md "친구 창 줄 넘침" 장), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/friend-row-notes.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, within } = await import("@testing-library/react")
const { installFetch, signIn, resetAll, friend, openPanel, press } = await import("./a13Kit.mjs")
const { default: RecommendedFriendRow } = await import("../../src/domains/lobby/components/friendList/request/RecommendedFriendRow.jsx")
const { default: GameInviteRow } = await import("../../src/domains/lobby/components/friendList/invite/list/GameInviteRow.jsx")

test.afterEach(() => resetAll())

// PC 시험 창 크기 (브라우저 시험 기준 1280×800)
const VW = 1280
const REM = 16
// 창 종이 평균색 (브라우저 시험 그림에서 잰 값, 가르기 글 ④)
const PAPER = { r: 168, g: 128, b: 83 }
// 쓰는 글자색 (tailwind 값)
const COLORS = { "red-200": "#fecaca", "red-300": "#fca5a5", white: "#ffffff", black: "#000000" }

// "clamp(2.5rem,3.1vw,3.6rem)"·"3.6rem"·"44px" → 1280 창에서 px
function lengthPx(expr) {
  const one = (t) => {
    const v = parseFloat(t)
    if (t.endsWith("rem")) return v * REM
    if (t.endsWith("vw")) return (v * VW) / 100
    if (t.endsWith("px")) return v
    throw new Error(`모르는 길이 ${t}`)
  }
  const m = expr.match(/^clamp\(([^,]+),([^,]+),([^,]+)\)$/)
  return m ? Math.min(Math.max(one(m[2]), one(m[1])), one(m[3])) : one(expr)
}

// 클래스 하나에서 길이 값: w-[…]·size-[…]·gap-1 같은 것 (sm:·hover: 붙은 건 안 봄), 없으면 null
function classLength(el, prefix) {
  for (const token of String(el.getAttribute("class") ?? "").split(/\s+/)) {
    if (token.includes(":")) continue
    const arb = token.match(new RegExp(`^${prefix}-\\[(.+)\\]$`))
    if (arb) return arb[1].endsWith("%") ? { percent: parseFloat(arb[1]) } : lengthPx(arb[1])
    const num = token.match(new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`))
    if (num) return parseFloat(num[1]) * 4
  }
  return null
}

// 칸 하나가 차지하는 폭: 제 폭 클래스, 없으면 flex 칸은 안쪽 합 + 사이, 아니면 안쪽 중 가장 넓은 것
function boxWidth(el) {
  const own = classLength(el, "w") ?? classLength(el, "size")
  if (typeof own === "number") return own
  const kids = [...el.children]
  if (kids.length === 0) return 0
  const widths = kids.map(boxWidth)
  if (/(^|\s)flex(\s|$)/.test(el.getAttribute("class") ?? "")) {
    return widths.reduce((a, b) => a + b, 0) + (classLength(el, "gap") ?? 0) * (kids.length - 1)
  }
  return Math.max(...widths)
}

// 폴더 안 친구 줄의 이름 칸 폭 (1280 창): 패널 폭 → 안쪽 여백 → 폴더 여백·테두리 → 줄 여백 → 별·초상·단추 빼기
function infoWidthOf(row) {
  const aside = row.closest("aside")
  const panelW = Math.min(classLength(aside, "w"), classLength(aside, "max-w") ?? Infinity)
  const inner = aside.querySelector(":scope > div[style]")
  const insetX = parseFloat(inner.style.paddingLeft) + parseFloat(inner.style.paddingRight)
  const section = row.closest("section")
  const list = row.closest("ul")
  const rowW = panelW * (1 - insetX / 100) - 2 * (classLength(section, "px") ?? 0) - 2 - (classLength(list, "pr") ?? 0)
  const info = row.querySelector("p").parentElement
  const content = info.parentElement
  const pad = classLength(content, "px").percent
  const gap = classLength(content, "gap") ?? 0
  const others = [...content.children].filter((el) => el !== info)
  const used = others.map(boxWidth).reduce((a, b) => a + b, 0) + gap * others.length
  return rowW * (1 - (2 * pad) / 100) - used
}

// "오프라인" 글이 단추에 안 깔리려면 필요한 폭: 배지 + 사이 + 글자 수 × 글 크기 (접속 글 칸 크기로 셈)
function statusNeed(row) {
  const wrap = within(row).getByText(/^(접속 중|오프라인)$/).parentElement
  const badge = wrap.children[0]
  const fontPx = parseFloat(String(wrap.children[1].getAttribute("class")).match(/--app-text-size:(\d+)px/)[1])
  return boxWidth(badge) + (classLength(wrap, "gap") ?? 0) + "오프라인".length * fontPx
}

// 색 글자 "#fecaca" → { r, g, b }
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
const over = (top, alpha, under) => ({ r: top.r * alpha + under.r * (1 - alpha), g: top.g * alpha + under.g * (1 - alpha), b: top.b * alpha + under.b * (1 - alpha) })
function contrast(a, b) {
  const lum = ({ r, g, b: bl }) => {
    const [x, y, z] = [r, g, bl].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * x + 0.7152 * y + 0.0722 * z
  }
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

// 글 칸 클래스로 창 종이 위 대비 셈: bg-black/60 같은 덧칠이 있으면 종이 위에 깔고, 글자색(투명도 포함)을 그 위에
function paperContrast(el) {
  const cls = String(el.getAttribute("class"))
  const bg = cls.match(/(?:^|\s)bg-black\/(\d+)(?:\s|$)/)
  const back = bg ? over(hex(COLORS.black), Number(bg[1]) / 100, PAPER) : PAPER
  const tx = cls.match(/(?:^|\s)text-(red-\d00|white|black)(?:\/(\d+))?(?:\s|$)/)
  assert.ok(tx, `글자색 클래스가 없음: ${cls}`)
  const color = tx[2] ? over(hex(COLORS[tx[1]]), Number(tx[2]) / 100, back) : hex(COLORS[tx[1]])
  return contrast(color, back)
}

// 글이 줄 그림 칸(이름·단추가 있는 칸) 밖, 줄(li) 바로 아래 칸에 있는지: 이름과 글의 가장 가까운 공통 조상이 li
function sitsUnderRow(row, note) {
  const name = row.querySelector("p")
  let common = name
  while (common && !common.contains(note)) common = common.parentElement
  return common === row
}

const rowOf = (id) => document.querySelector(`li[data-friend-id="${id}"]`)

// 접속한 친구 둘(가람, 8자 이름 나래나래…)이 있는 친구 창 (일반 폴더가 펼쳐져 있음)
async function openWithFriends(panelProps = {}) {
  signIn()
  installFetch({ "GET /friends": { body: { data: [friend("f1", "가람", true), friend("f2", "나래나래나래나래", true)] } } })
  await openPanel(panelProps)
}

test("A13-F-541 1280 창 로비 친구 창: 차단·끊기 단추가 있어도 줄 이름 칸 폭이 \"오프라인\" 글과 배지가 들어갈 만큼", async () => {
  await openWithFriends()
  const row = rowOf("f2")
  const need = statusNeed(row)
  const width = infoWidthOf(row)
  assert.ok(width >= need, `이름 칸 ${width.toFixed(1)}px < 필요 ${need.toFixed(1)}px`)
  // 끊기를 눌러 확인·취소 두 단추가 된 뒤에도 이름 칸이 안 눌림 (묻는 글은 줄 아래라 이름 칸엔 이름·접속 글만)
  await press(within(row).getByRole("button", { name: "나래나래나래나래 친구 끊기" }))
  const asking = infoWidthOf(row)
  assert.ok(asking >= need, `묻는 동안 이름 칸 ${asking.toFixed(1)}px < 필요 ${need.toFixed(1)}px`)
})

test("A13-F-542 1280 창 대기방에서 연 친구 창(초대·차단 단추)도 줄 이름 칸 폭이 \"오프라인\" 글이 들어갈 만큼", async () => {
  await openWithFriends({ roomId: "room-1", isRoomVerified: true })
  const row = rowOf("f2")
  const width = infoWidthOf(row)
  assert.ok(width >= statusNeed(row), `이름 칸 ${width.toFixed(1)}px < 필요 ${statusNeed(row).toFixed(1)}px`)
})

test("A13-F-543 끊기 → \"친구를 끊을까요?\"가 이름 칸 안이 아니라 줄 아래 한 줄로, role=status, 종이 위 대비 4.5 이상", async () => {
  await openWithFriends()
  await press(within(rowOf("f1")).getByRole("button", { name: "가람 친구 끊기" }))
  const ask = rowOf("f1").querySelector("[data-unfriend-confirm]")
  assert.equal(ask?.textContent, "친구를 끊을까요?")
  assert.equal(ask.getAttribute("role"), "status")
  assert.ok(sitsUnderRow(rowOf("f1"), ask), "묻는 글이 줄 안 이름 칸에 있음")
  assert.ok(paperContrast(ask) >= 4.5, `대비 ${paperContrast(ask).toFixed(2)}`)
})

test("A13-F-544 친구 추가 탭 찾은 줄 신청 실패 글 → 줄 아래 한 줄, role=alert, 종이 위 대비 4.5 이상", async () => {
  render(React.createElement("ul", null, React.createElement(RecommendedFriendRow, {
    id: "c1", name: "t2d0ee32", status: "ONLINE", onSend: () => {}, onBlock: () => {}, sent: false,
    sendError: "이미 친구 신청 중입니다.",
  })))
  const row = document.querySelector('li[data-candidate-id="c1"]')
  const error = row.querySelector("[data-send-error]")
  assert.equal(error.textContent, "이미 친구 신청 중입니다.")
  assert.equal(error.getAttribute("role"), "alert")
  assert.ok(sitsUnderRow(row, error), "실패 글이 줄 안 좁은 칸에 있음")
  assert.ok(paperContrast(error) >= 4.5, `대비 ${paperContrast(error).toFixed(2)}`)
})

// 받은 초대 한 줄 (대기 중)
const INVITE = {
  inviteId: "inv-1", receiverId: "me", senderId: "s-1", senderName: "민수", roomId: "room-1",
  status: "PENDING", revision: 1, creationSeq: "5", expiresAt: new Date(Date.now() + 180_000).toISOString(),
}

test("A13-F-545 받은 초대 줄 수락 실패 글 → 줄 아래 한 줄, 보낸 사람 이름은 줄 안 그대로, 종이 위 대비 4.5 이상", async () => {
  render(React.createElement("ul", null, React.createElement(GameInviteRow, {
    invite: INVITE, onAccept: () => {}, onDecline: () => {}, processing: false, targeted: false,
    error: "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.",
  })))
  const row = document.querySelector('li[data-invite-id="inv-1"]')
  const error = row.querySelector("[data-invite-error]")
  assert.equal(error.textContent, "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.")
  assert.ok(sitsUnderRow(row, error), "실패 글이 줄 안 좁은 칸에 있음")
  assert.ok(paperContrast(error) >= 4.5, `대비 ${paperContrast(error).toFixed(2)}`)
  assert.equal(row.querySelector("p").textContent, "민수")
})

test("A13-F-546 끝난 초대 줄 까닭 글(\"이미 거절한 초대입니다.\") → 줄 아래 한 줄, 종이 위 대비 4.5 이상", async () => {
  render(React.createElement("ul", null, React.createElement(GameInviteRow, {
    invite: { ...INVITE, status: "DECLINED", revision: 2 }, onAccept: () => {}, onDecline: () => {}, processing: false, targeted: false, error: null,
  })))
  const row = document.querySelector('li[data-invite-id="inv-1"]')
  const ended = row.querySelector("[data-invite-ended]")
  assert.equal(ended.textContent, "이미 거절한 초대입니다.")
  assert.ok(sitsUnderRow(row, ended), "까닭 글이 줄 안 좁은 칸에 있음")
  assert.ok(paperContrast(ended) >= 4.5, `대비 ${paperContrast(ended).toFixed(2)}`)
})
