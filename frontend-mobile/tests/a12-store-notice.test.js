// 모바일 상점 구매 안내 시험: 잔액 부족·지갑 오류 사전 차단 및 단추 아래 사유·구매 결과 한 곳 표시
// 목록 A12 모바일 A12-M-003~007·010~012 (돌리기: frontend-mobile 폴더에서 node --test --test-concurrency=1 tests/a12-store-notice.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, textOf } from "./a00-kit.mjs"
import { resetGame, serveMatch, useAuthStore } from "./a00-game.mjs"
import * as S from "./a00-store.mjs"

const { setUnauthorizedHandler } = await import("@/shared/api/response.js")
const { handleAuthUnauthorized } = await import("@/domains/auth/api/unauthorized.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    act(() => { useAuthStore.getState().logout() })
    try { window.localStorage.clear() } catch { /* 막힌 저장소 무시 */ }
    window.history.replaceState(null, "", "/")
})

const BULK = /^\/economy\/purchases\/bulk$/
const REJECTED = "구매가 거부되었습니다. 재화는 차감되지 않았습니다."
const ALREADY = "이미 보유한 상품입니다."
const WALLET_ERROR = "보유 재화를 불러오지 못해 구매할 수 없습니다. 보유 재화 칸의 재시도를 눌러 주세요."

async function skinStore({ gold = 1000, answer } = {}) {
    const account = S.startStore({ gold })
    if (answer) serveMatch("POST", BULK, answer)
    view = await S.openStore()
    assert.ok(S.detail(), "고른 상품 설명 칸이 없음")
    return account
}
async function borderStore(gold) {
    S.startStore({ gold })
    view = await S.openStore()
    await S.pickCategory("프로필 테두리")
    assert.equal(S.detailName(), "남작", "준비: 남작이 안 골라짐")
}

test("A12-M-003 잔액 경계: 200골드 테두리 + 잔액 200 → 켜짐·까닭 없음, 잔액 199 → 꺼짐·'잔액이 부족합니다.'", async () => {
    await borderStore(200)
    assert.equal(S.buyButton().disabled, false)
    assert.ok(S.reasonEl() === null, "잔액이 딱 맞는데 까닭 줄이 있음")

    resetGame(view)
    view = null
    await borderStore(199)
    assert.equal(S.buyButton().disabled, true)
    assert.equal(textOf(S.reasonEl()), "잔액이 부족합니다.")
})

test("A12-M-004 서버 거절 글 자리: 409 '이미 보유한 상품입니다.' → 단추 바로 아래에만 표시, 판 위엔 없음", async () => {
    await skinStore({ answer: S.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: ALREADY }) })
    await S.pressBuy()
    assert.ok(S.belowText().includes(ALREADY), `단추 아래: ${S.belowText()}`)
    assert.equal(S.topText(), "", `판 위에 중복 표시됨: ${S.topText()}`)
})

test("A12-M-005 끊김은 우리말: 'Failed to fetch' → 단추 아래 우리말 끊김 글, 영어 없음", async () => {
    await skinStore({ answer: S.offline("Failed to fetch") })
    await S.pressBuy()
    const below = S.belowText()
    assert.ok(below.includes("인터넷 연결이 끊겨"), `단추 아래: ${below}`)
    assert.doesNotMatch(below, /[A-Za-z]/)
})

test("A12-M-006 지갑 못 받음 → 구매 단추 꺼짐 + 단추 아래 지갑 오류 까닭 표시", async () => {
    S.startStore({ gold: 500 })
    serveMatch("GET", /\/wallet$/, S.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." }))
    view = await S.openStore()
    await S.pickCategory("프로필 테두리")
    assert.equal(S.buyButton().disabled, true, "지갑을 못 받았는데 단추가 켜짐")
    assert.equal(textOf(S.reasonEl()), WALLET_ERROR)
})

test("A12-M-007 다이아 부족 골드 구매 → 단추 아래 골드 구매 안내에 부족 글 + '다이아 충전하러 가기'", async () => {
    S.startStore({ gold: 0, diamond: 0, products: [S.DIA_PRODUCT, S.GOLD_PRODUCT] })
    serveMatch("POST", /^\/economy\/gold-purchases$/, S.reply(400, { ok: false, code: "INSUFFICIENT_DIAMOND", message: "다이아 잔액이 부족합니다." }))
    view = await S.openStore()
    await S.pickCategory("인게임 재화")
    await S.pickItem("골드 500")
    assert.equal(S.detailName(), "골드 500", "준비: 골드 500이 안 골라짐")
    if (!S.buyButton().disabled) await S.pressBuy()
    const box = S.detail().querySelector('[data-testid="gold-feedback"]')
    assert.ok(box, `단추 아래 골드 구매 안내가 없음: ${S.belowText()}`)
    assert.ok(textOf(box).includes("다이아가 부족합니다"), `안내: ${textOf(box)}`)
    assert.ok(buttonNamed("다이아 충전하러 가기", box) !== null, `안내: ${textOf(box)}`)
})

test("A12-M-010 로그인 풀림: 구매 중 401 → 다시 그리면 단추 아래 안내에 로그인 풀림 글", async () => {
    setUnauthorizedHandler(handleAuthUnauthorized)
    try {
        const { uuid } = await skinStore({ answer: S.reply(401, { success: false, message: "로그인이 필요합니다." }) })
        await S.pressBuy()
        assert.equal(useAuthStore.getState().user, null, "401인데 로그아웃이 안 됨")
        view.unmount()
        view = null
        S.startStore({ gold: 1000, uuid })
        view = await S.openStore()
        assert.ok(S.belowText().includes("구매 중 로그인이 풀려"), `단추 아래: ${S.belowText()}`)
    } finally {
        setUnauthorizedHandler(null)
    }
})

test("A12-M-011 막힘 상태 첫 줄 빈 줄 없음: 단추 아래 구매 결과 안내 상자 → 첫 줄부터 글", async () => {
    const proto = Object.getPrototypeOf(window.localStorage)
    const original = proto.getItem
    proto.getItem = () => { throw new window.DOMException("저장소 막힘", "SecurityError") }
    try {
        S.startStore({ gold: 1000 })
    } finally {
        proto.getItem = original
    }
    view = await S.openStore()
    const box = S.belowButton()?.querySelector('[role="status"]')
    assert.ok(box, `단추 아래 안내 상자가 없음: ${S.belowText()}`)
    assert.ok(box.firstElementChild, "안내 상자가 빔")
    assert.notEqual(textOf(box.firstElementChild), "", "안내 상자 첫 줄이 빈 줄")
})

test("A12-M-012 같은 글 한 번만: 실패 하나 → 화면 전체에 한 번만 보임", async () => {
    await skinStore({ answer: S.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: ALREADY }) })
    await S.pressBuy()
    assert.equal(S.countText(ALREADY), 1)
    assert.equal(S.countText(REJECTED), 1)
})
