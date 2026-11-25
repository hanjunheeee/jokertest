// 모바일 상점 구매 안내 시험: 서버 거절·끊김·다이아 부족·로그인 풀림 글이 판 위 안내 상자에 한 번만, 지갑 못 받으면 단추 꺼짐
// 목록 A12 모바일 A12-M-003~007·010~012, 합친 화면(2026-11-24 되돌림: 안내는 판 위, 잔액 미리 검사 없음)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a12-store-notice.test.js)
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

// 스킨(처음 고른 상품, 500골드) 앞에 선 화면, 구매 답은 answer
async function skinStore({ gold = 1000, answer } = {}) {
    const account = S.startStore({ gold })
    if (answer) serveMatch("POST", BULK, answer)
    view = await S.openStore()
    assert.ok(S.detail(), "고른 상품 설명 칸이 없음")
    return account
}
// 프로필 테두리 분류 첫 상품 "남작"(200골드)
async function borderStore(gold) {
    S.startStore({ gold })
    view = await S.openStore()
    await S.pickCategory("프로필 테두리")
    assert.equal(S.detailName(), "남작", "준비: 남작이 안 골라짐")
}

test("A12-M-003 잔액 경계: 200골드 테두리 + 잔액 200 → 켜짐, 까닭 줄 없음", async () => {
    await borderStore(200)
    assert.equal(S.buyButton().disabled, false)
    assert.ok(S.reasonEl() === null, "잔액이 딱 맞는데 까닭 줄이 있음")
})

test("A12-M-004 서버 거절 글 자리: 409 '이미 보유한 상품입니다.' → 판 위 구매 결과 안내 (단추 아래 칸 없음)", async () => {
    await skinStore({ answer: S.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: ALREADY }) })
    await S.pressBuy()
    assert.ok(textOf(S.purchaseNotice()).includes(ALREADY), `판 위: ${S.topText()}`)
    assert.equal(S.belowText(), "", "단추 아래에 글이 있음")
})

test("A12-M-005 끊김은 우리말: 'Failed to fetch' → 판 위 안내에 우리말 끊김 글, 영어 없음", async () => {
    await skinStore({ answer: S.offline("Failed to fetch") })
    await S.pressBuy()
    const top = S.topText()
    assert.ok(top.includes("인터넷 연결이 끊겨"), `판 위: ${top}`)
    assert.doesNotMatch(top, /[A-Za-z]/)
})

test("A12-M-006 지갑 못 받음 → 구매 단추 꺼짐 (까닭 글 칸은 없음)", async () => {
    S.startStore({ gold: 500 })
    serveMatch("GET", /\/wallet$/, S.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." }))
    view = await S.openStore()
    await S.pickCategory("프로필 테두리")
    assert.equal(S.buyButton().disabled, true, "지갑을 못 받았는데 단추가 켜짐")
    assert.ok(S.reasonEl() === null, "까닭 글 칸이 있음")
})

test("A12-M-007 다이아 부족 골드 구매 → 판 위 골드 구매 안내에 부족 글 + '다이아 충전하러 가기'", async () => {
    S.startStore({ gold: 0, diamond: 0, products: [S.DIA_PRODUCT, S.GOLD_PRODUCT] })
    serveMatch("POST", /^\/economy\/gold-purchases$/, S.reply(400, { ok: false, code: "INSUFFICIENT_DIAMOND", message: "다이아 잔액이 부족합니다." }))
    view = await S.openStore()
    await S.pickCategory("인게임 재화")
    await S.pickItem("골드 500")
    assert.equal(S.detailName(), "골드 500", "준비: 골드 500이 안 골라짐")
    // 다이아 0이면 미리 꺼질 수 있음 → 켜져 있을 때만 눌러 서버 답을 받음
    if (!S.buyButton().disabled) await S.pressBuy()
    const box = document.querySelector('[data-testid="gold-feedback"]')
    assert.ok(box, `골드 구매 안내가 없음: ${S.topText()}`)
    assert.ok(textOf(box).includes("다이아가 부족합니다"), `안내: ${textOf(box)}`)
    assert.ok(buttonNamed("다이아 충전하러 가기", box) !== null, `안내: ${textOf(box)}`)
})

test("A12-M-010 로그인 풀림: 구매 중 401 → 다시 그리면 판 위 안내에 로그인 풀림 글", async () => {
    setUnauthorizedHandler(handleAuthUnauthorized)
    try {
        const { uuid } = await skinStore({ answer: S.reply(401, { success: false, message: "로그인이 필요합니다." }) })
        await S.pressBuy()
        assert.equal(useAuthStore.getState().user, null, "401인데 로그아웃이 안 됨")
        // 기기 저장소(구매 기록)는 그대로 두고 화면만 내렸다가 같은 계정으로 다시 그림
        view.unmount()
        view = null
        S.startStore({ gold: 1000, uuid })
        view = await S.openStore()
        assert.ok(S.topText().includes("구매 중 로그인이 풀려"), `판 위: ${S.topText()}`)
    } finally {
        setUnauthorizedHandler(null)
    }
})

test("A12-M-011 막힘 상태 첫 줄 빈 줄 없음: 판 위 구매 결과 안내 상자 → 첫 줄부터 글", async () => {
    // 기기 저장소 읽기 오류로 막힘 상태가 된 계정
    const proto = Object.getPrototypeOf(window.localStorage)
    const original = proto.getItem
    proto.getItem = () => { throw new window.DOMException("저장소 막힘", "SecurityError") }
    try {
        S.startStore({ gold: 1000 })
    } finally {
        proto.getItem = original
    }
    view = await S.openStore()
    const box = S.purchaseNotice()
    assert.ok(box, `판 위 안내 상자가 없음: ${S.topText()}`)
    assert.ok(box.firstElementChild, "안내 상자가 빔")
    assert.notEqual(textOf(box.firstElementChild), "", "안내 상자 첫 줄이 빈 줄")
})

test("A12-M-012 같은 글 한 번만: 실패 하나 → 판 위 안내에 겹쳐 두 번 안 보임", async () => {
    await skinStore({ answer: S.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: ALREADY }) })
    await S.pressBuy()
    assert.equal(S.countText(ALREADY), 1)
    assert.equal(S.countText(REJECTED), 1)
})
