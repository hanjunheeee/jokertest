// 모바일 친구 시트 줄 넘침 시험: 친구 줄 이름 칸 폭(폰 줄 폭 셈), 묻는 글·실패 글·끝난 까닭이 줄 아래 한 줄로 따로, 종이 위에서도 읽히는 색
// 목록 A13 모바일 A13-M-513~516 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-bug1-friend-rows.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click } from "./a00-kit.mjs"

const { default: FriendRow } = await import("@m/domains/lobby/components/friends/list/FriendRow.jsx")
const { default: CandidateRow } = await import("@m/domains/lobby/components/friends/add/CandidateRow.jsx")
const { default: InviteRow } = await import("@m/domains/lobby/components/friends/invite/InviteRow.jsx")
const { useFriendStore } = await import("@/domains/lobby/store/friend.store.js")

let view = null
afterEach(() => {
    view?.unmount()
    view = null
    act(() => useFriendStore.getState().__resetForTests())
})

const h = React.createElement
// 폰(375 폭) 친구 폴더 안 줄 폭: 실패 그림(A13-E-075)에서 잰 값
const ROW_WIDTH = 250
const VW = 375
const REM = 16
// 창 종이 평균색 (PC 시험 그림에서 잰 값과 같은 그림)
const PAPER = { r: 168, g: 128, b: 83 }
const COLORS = { "red-200": "#fecaca", "red-300": "#fca5a5", white: "#ffffff", black: "#000000" }

// "clamp(…)"·"2.5rem" → px (375 창)
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

// 클래스에서 길이: w-[…]·size-11·gap-1·-mx-3 (sm:·active: 붙은 건 안 봄)
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

// 칸 하나가 줄에서 차지하는 폭 (음수 바깥 여백 -mx-N은 빼고 셈)
function boxWidth(el) {
    const shrink = 2 * (classLength(el, "-mx") ?? 0)
    const own = classLength(el, "w") ?? classLength(el, "size")
    if (typeof own === "number") return own - shrink
    const kids = [...el.children]
    if (kids.length === 0) return 0
    const widths = kids.map(boxWidth)
    if (/(^|\s)flex(\s|$)/.test(el.getAttribute("class") ?? "")) {
        return widths.reduce((a, b) => a + b, 0) + (classLength(el, "gap") ?? 0) * (kids.length - 1) - shrink
    }
    return Math.max(...widths) - shrink
}

// 친구 줄 이름 칸 폭 = 줄 안쪽 폭 − 별·초상·단추 − 사이
function infoWidthOf(row) {
    const info = row.querySelector("p").parentElement
    const content = info.parentElement
    const pad = classLength(content, "px").percent
    const gap = classLength(content, "gap") ?? 0
    const others = [...content.children].filter((el) => el !== info)
    const used = others.map(boxWidth).reduce((a, b) => a + b, 0) + gap * others.length
    return ROW_WIDTH * (1 - (2 * pad) / 100) - used
}

// "오프라인" 글이 단추에 안 깔리려면 필요한 폭: 배지 + 사이 + 글자 수 × 글 크기
function statusNeed(row) {
    const text = [...row.querySelectorAll("span")].find((el) => /^(접속 중|오프라인)$/.test(el.textContent))
    const wrap = text.parentElement
    const fontPx = parseFloat(String(text.getAttribute("class")).match(/--app-text-size:(\d+)px/)[1])
    return boxWidth(wrap.children[0]) + (classLength(wrap, "gap") ?? 0) + "오프라인".length * fontPx
}

const hex = (s) => ({ r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16) })
const over = (top, alpha, under) => ({ r: top.r * alpha + under.r * (1 - alpha), g: top.g * alpha + under.g * (1 - alpha), b: top.b * alpha + under.b * (1 - alpha) })
function contrast(a, b) {
    const lum = ({ r, g, b: bl }) => {
        const [x, y, z] = [r, g, bl].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        return 0.2126 * x + 0.7152 * y + 0.0722 * z
    }
    const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (hi + 0.05) / (lo + 0.05)
}

// 글 칸 클래스로 창 종이 위 대비 셈 (bg-black/N 덧칠이 있으면 종이 위에 깔고 그 위 글자색)
function paperContrast(el) {
    const cls = String(el.getAttribute("class"))
    const bg = cls.match(/(?:^|\s)bg-black\/(\d+)(?:\s|$)/)
    const back = bg ? over(hex(COLORS.black), Number(bg[1]) / 100, PAPER) : PAPER
    const tx = cls.match(/(?:^|\s)text-(red-\d00|white|black)(?:\/(\d+))?(?:\s|$)/)
    assert.ok(tx, `글자색 클래스가 없음: ${cls}`)
    const color = tx[2] ? over(hex(COLORS[tx[1]]), Number(tx[2]) / 100, back) : hex(COLORS[tx[1]])
    return contrast(color, back)
}

// 글이 줄 그림 칸 밖, 줄(li) 바로 아래 칸에 있는지: 이름과 글의 가장 가까운 공통 조상이 li
function sitsUnderRow(row, note) {
    let common = row.querySelector("p")
    while (common && !common.contains(note)) common = common.parentElement
    return common === row
}

// 로비 친구 시트의 친구 줄 하나 (차단·끊기 단추, 8자 이름)
function drawFriendRow() {
    const friend = { id: "f1", name: "taegeuk8", online: false, status: "OFFLINE", accountProfilePhotoId: null, accountProfileBorderId: null }
    view = render(h("ul", null, h(FriendRow, { friend, invite: null, block: { onBlock: () => {}, blockingIds: new Set() } })))
    return document.querySelector('li[data-friend-id="f1"]')
}

test("A13-M-513 폰 로비 친구 줄: 차단·끊기 단추가 있어도 이름 칸 폭이 \"오프라인\" 글과 배지가 들어갈 만큼, 끊기를 눌러도 그대로", () => {
    const row = drawFriendRow()
    const need = statusNeed(row)
    assert.ok(infoWidthOf(row) >= need, `이름 칸 ${infoWidthOf(row).toFixed(1)}px < 필요 ${need.toFixed(1)}px`)
    click(buttonNamed("taegeuk8 친구 끊기"))
    assert.ok(infoWidthOf(row) >= need, `묻는 동안 이름 칸 ${infoWidthOf(row).toFixed(1)}px < 필요 ${need.toFixed(1)}px`)
})

test("A13-M-514 폰 친구 줄 끊기 → \"친구를 끊을까요?\"가 줄 아래 한 줄, 종이 위 대비 4.5 이상", () => {
    const row = drawFriendRow()
    click(buttonNamed("taegeuk8 친구 끊기"))
    const ask = row.querySelector("[data-unfriend-confirm]")
    assert.equal(ask?.textContent, "친구를 끊을까요?")
    assert.ok(sitsUnderRow(row, ask), "묻는 글이 줄 안 이름 칸에 있음")
    assert.ok(paperContrast(ask) >= 4.5, `대비 ${paperContrast(ask).toFixed(2)}`)
})

test("A13-M-515 폰 친구 추가 찾은 줄 신청 실패 글 → 줄 아래 한 줄, role=alert, 종이 위 대비 4.5 이상", () => {
    view = render(h("ul", null, h(CandidateRow, {
        candidate: { id: "c1", name: "t2d0ee32", status: "ONLINE" }, sent: false, sendError: "이미 친구 신청 중입니다.", blocking: false,
    })))
    const row = document.querySelector('li[data-candidate-id="c1"]')
    const error = row.querySelector("[data-send-error]")
    assert.equal(error.getAttribute("role"), "alert")
    assert.ok(sitsUnderRow(row, error), "실패 글이 줄 안 좁은 칸에 있음")
    assert.ok(paperContrast(error) >= 4.5, `대비 ${paperContrast(error).toFixed(2)}`)
})

test("A13-M-516 폰 받은 초대 줄 수락 실패 글(3번 추방) → 줄 아래 한 줄, 보낸 사람 이름은 줄 안 그대로, 종이 위 대비 4.5 이상", () => {
    const invite = {
        inviteId: "inv-1", receiverId: "me", senderId: "s-1", senderName: "민수", status: "PENDING", revision: 1, creationSeq: "5",
        expiresAt: new Date(Date.now() + 180_000).toISOString(),
    }
    view = render(h("ul", null, h(InviteRow, {
        invite, processing: false, targeted: false, error: "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.", onAccept: () => {}, onDecline: () => {},
    })))
    const row = document.querySelector('li[data-invite-id="inv-1"]')
    const error = row.querySelector("[data-invite-error]")
    assert.ok(sitsUnderRow(row, error), "실패 글이 줄 안 좁은 칸에 있음")
    assert.ok(paperContrast(error) >= 4.5, `대비 ${paperContrast(error).toFixed(2)}`)
    assert.equal(row.querySelector("p").textContent, "민수")
})
