// 모바일 역할 공개 창 시험: 같은 직업 동료 줄(닉네임, 줄 머리 글은 직업과 상관없이 "동료 광대" — 지금 화면 글), 시민·혼자인 직업은 동료 없음, 10초에 저절로 닫힘
// 목록 A02 모바일 A02-M-001~008 (돌리기: frontend-mobile 폴더에서 node --test tests/a02-role-reveal-overlay.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render, act } from "./helpers/dom.mjs"
import { test, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { textOf, waitUntil } from "./a00-kit.mjs"

const { default: RoleRevealOverlay } = await import("@m/domains/game/ingame/components/overlays/RoleRevealOverlay.jsx")
const { getInGameRoleRevealInfo } = await import("@/domains/game/ingame/utils/roleReveal.js")

let view = null
afterEach(() => { view?.unmount(); view = null; mock.timers.reset() })

const NAMES = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차"]
const TEAM = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }

// n명 판 명단 (u0 = 나)
function players(n) {
    return NAMES.slice(0, n).map((nickname, i) => ({ uuid: `u${i}`, nickname }))
}

// 서버가 보내는 내 판 정보(self) → 화면이 쓰는 역할 공개 값
function roleInfoOf(role, allies) {
    const self = { uuid: "u0", nickname: "가", role, team: TEAM[role], ...(allies === undefined ? {} : { allies }) }
    return getInGameRoleRevealInfo(self, { authUuid: "u0" })
}

// 열림 값을 들고 있는 틀 (닫히면 open false)
function Holder({ roleInfo, list }) {
    const [open, setOpen] = React.useState(true)
    return React.createElement(RoleRevealOverlay, { open, onClose: () => setOpen(false), roleInfo, players: list })
}

function drawReveal(role, allies, n) {
    const roleInfo = roleInfoOf(role, allies)
    assert.ok(roleInfo, "역할 공개 값이 안 만들어짐")
    view = render(React.createElement(Holder, { roleInfo, list: players(n) }))
    return document.querySelector("[data-ingame-role-reveal]")
}

const ALLY_CASES = [
    ["A02-M-001", "광대", "JOKER", 5],
    ["A02-M-002", "의사", "DOCTOR", 7],
    ["A02-M-003", "경비원", "GUARD", 8],
    ["A02-M-004", "마녀사냥꾼", "WITCH_HUNTER", 10],
]
// 동료 줄 머리 글은 상대 화면(RoleRevealOverlay)에 "동료 광대"로 박혀 있음 → 의사·경비원·마녀사냥꾼도 같은 글 (지금 화면대로 봄)
for (const [id, label, role, n] of ALLY_CASES) {
    test(`${id} 모바일 역할 창 동료 줄: ${label} 2명(${n}명 판) → "동료 광대" 줄 + 상대 닉네임 "나"`, () => {
        const box = drawReveal(role, ["u1"], n)
        assert.ok(box, "역할 창이 없음")
        assert.equal(box.getAttribute("data-ingame-role-reveal"), role)
        const text = textOf(box)
        assert.ok(text.includes(label), `직업 이름 "${label}"이 없음: ${text}`)
        assert.ok(text.includes("동료 광대"), `"동료 광대" 줄이 없음: ${text}`)
        const chips = [...box.querySelectorAll("li")].map((li) => textOf(li))
        assert.deepEqual(chips, ["나"])
    })
}

test("A02-M-005 모바일 시민(6명 판) → '동료' 글 없음", () => {
    const box = drawReveal("CITIZEN", undefined, 6)
    assert.ok(box, "역할 창이 없음")
    assert.ok(!textOf(box).includes("동료"), "시민에게 동료 글이 보임")
})

test("A02-M-006 모바일 직업 1명: 의사 혼자(6명 판 자동 구성) → '동료' 글 없음", () => {
    const box = drawReveal("DOCTOR", [], 6)
    assert.ok(box, "역할 창이 없음")
    assert.ok(textOf(box).includes("의사"), "직업 이름이 없음")
    assert.ok(!textOf(box).includes("동료"), "혼자인 의사에게 동료 글이 보임")
})

test("A02-M-007 모바일 10초 저절로 닫힘: 9,999ms → 창 있음", () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    drawReveal("JOKER", ["u1"], 5)
    act(() => mock.timers.tick(9_999))
    assert.ok(document.querySelector("[data-ingame-role-reveal]"), "10초 전에 창이 닫힘")
})

test("A02-M-008 모바일 10초 저절로 닫힘: 10,000ms → 창 없음", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    drawReveal("JOKER", ["u1"], 5)
    act(() => mock.timers.tick(9_999))
    act(() => mock.timers.tick(1))
    mock.timers.reset()
    // 닫힘 움직임은 진짜 시계로 끝남 → 사라질 때까지 기다림 (끝내 남으면 실패)
    await waitUntil(() => document.querySelector("[data-ingame-role-reveal]") === null, { label: "10초 뒤 창 닫힘" })
})
