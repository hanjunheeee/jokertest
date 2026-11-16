// M-1 모바일 상점 시험 몫 도우미: 가짜 경제 서버(지갑·가진 것·내역·상품·열린 주문)·모바일 상점 화면 그리기·설명 칸·구매 단추 찾기
// frontend-mobile/tests/a12-*.test.js(M-1 몫)가 a00-kit·a00-game 다음에 부름, 공용 아님 (답 모양은 PC 시험 a12-store/storeKit.mjs와 같음)
import { React, act } from "./helpers/dom.mjs"
import { click, flush, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, router, serveMatch, useAuthStore } from "./a00-game.mjs"

const { default: StorePage } = await import("@m/domains/store/pages/StorePage.jsx")

// 서버 재화 상품 (백엔드 a12 흐름 시험의 상품 모양)
export const DIA_PRODUCT = Object.freeze({
    productId: "dia-100", kind: "DIAMOND_TOPUP", displayName: "다이아 100", payCurrency: "KRW", payAmount: 1100,
    grantCurrency: "DIAMOND", grantAmount: 100, bonusAmount: 10, version: 3,
})
export const GOLD_PRODUCT = Object.freeze({
    productId: "gold-500", kind: "GOLD_PURCHASE", displayName: "골드 500", payCurrency: "DIAMOND", payAmount: 50,
    grantCurrency: "GOLD", grantAmount: 500, bonusAmount: 0, version: 2,
})

// 서버 답 하나, 끊김
export const reply = (status, body) => ({ status, body })
export const offline = (message = "Failed to fetch") => ({ offline: message })
// 답을 나중에 줌 (안 주면 끝까지 기다림)
export function later() {
    let resolve
    const promise = new Promise((r) => { resolve = r })
    return { promise, give: (value) => resolve(value) }
}

// 시험마다 다른 계정 (기기 기록·스토어가 안 섞임)
let uuidSeq = 0
export const nextUuid = () => `m1-store-${++uuidSeq}`

// 가짜 경제 서버 켜고 로그인 → { uuid }
export function startStore({ gold = 0, diamond = 0, entitlements = [], products = [], transactions = [], openOrders = [], uuid = nextUuid() } = {}) {
    const loadout = { selectedProfilePhotoId: null, selectedProfileBorderId: null, selectedCardFrameId: null, selectedSkinsByJob: {}, revision: "rev-1" }
    const owned = entitlements.map((itemId) => ({ itemId, itemType: "ITEM", source: "PURCHASE", acquiredAt: "2026-11-16T00:00:00.000Z" }))
    // 정하지 않은 길은 404 (빈 성공 답이 "구매 완료"로 읽히지 않게, PC storeKit과 같음) — 먼저 걸어 맨 뒤에 걸림
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) serveMatch(method, /./, reply(404, { success: false, message: "없는 경로" }))
    serveMatch("GET", /^\/economy\/accounts\/[^/]+\/wallet$/, reply(200, { balanceGold: gold, balanceDiamond: diamond }))
    serveMatch("GET", /^\/economy\/accounts\/[^/]+\/entitlements$/, reply(200, { entitlements: owned, loadout }))
    serveMatch("GET", /^\/economy\/accounts\/[^/]+\/transactions$/, reply(200, { transactions }))
    serveMatch("GET", /^\/economy\/currency-products$/, reply(200, { ok: true, products }))
    serveMatch("GET", /^\/economy\/topup\/orders$/, reply(200, { ok: true, orders: openOrders }))
    act(() => { useAuthStore.getState().login({ uuid, nickname: "상점손님" }) })
    return { uuid }
}

// 모바일 상점 화면 그림 (search = 결제 복귀 주소 쿼리), 입장 영상은 건너뛰기 단추로 넘김, alert는 앱처럼 양피지 창
export async function openStore({ search = "" } = {}) {
    window.history.replaceState(null, "", `/store${search}`)
    const view = await renderRoute(fakeSocket(), React.createElement(StorePage), { path: `/store${search}`, parchment: true })
    await flush(8)
    const skip = document.querySelector('button[aria-label="인트로 건너뛰기"]')
    if (skip) {
        click(skip)
        await flush(8)
    }
    return view
}
// 같은 화면에서 주소 쿼리만 바뀜 (결제창에서 돌아옴)
export async function navigateStore(search) {
    window.history.replaceState(null, "", `/store${search}`)
    await act(async () => { await router.navigate(`/store${search}`) })
    await flush(8)
}

// 분류 단추 누르기
export async function pickCategory(label) {
    const list = document.querySelector('[aria-label="카테고리 목록"]')
    const button = [...(list?.querySelectorAll("button") ?? [])].find((b) => textOf(b) === label)
    if (!button) throw new Error(`분류 없음: ${label}`)
    click(button)
    await flush(8)
}
// 상품 칸 (이름 글자로)
function slotOf(name) {
    const want = name.replace(/[-\s]+/g, "")
    return [...document.querySelectorAll("button[aria-pressed]")]
        .filter((b) => !b.closest('[aria-label="카테고리 목록"]') && !b.closest("section"))
        .find((b) => b.textContent.replace(/\s+/g, "").includes(want)) ?? null
}
export async function pickItem(name) {
    const slot = slotOf(name)
    if (!slot) throw new Error(`상품 칸 없음: ${name}`)
    click(slot)
    await flush(8)
}
// 고른 상품 설명 칸·구매 단추·꺼진 까닭 줄·단추 아래 안내 자리
export const detail = () => document.querySelector('section[aria-label="선택한 아이템 정보"]')
export const detailName = () => textOf(detail()?.querySelector("h2"))
export const buyButton = () => detail()?.querySelector("button") ?? null
export const reasonEl = () => detail()?.querySelector('[data-testid="purchase-block-reason"]') ?? null
export const belowButton = () => buyButton()?.parentElement?.nextElementSibling ?? null
export const belowText = () => textOf(belowButton())
// 화면에 그 글이 몇 번 나오나 (겹침 확인)
export const countText = (text) => document.body.textContent.split(text).length - 1
// 구매 단추 누르기
export async function pressBuy() {
    click(buyButton())
    await flush(10)
}
