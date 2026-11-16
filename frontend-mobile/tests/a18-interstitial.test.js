// 모바일 한 판 끝 광고 시험: 결과 화면에서 판마다 한 번만, 5초 전엔 닫기 단추 없음(Esc·뒤 막 눌러도 그대로), 5초 뒤 닫기, 열린 동안 뒤로 가기는 광고만 다룸
// 목록 A18 모바일 A18-M-009~014 (돌리기: frontend-mobile 폴더에서 node --test tests/a18-interstitial.test.js), 광고 꾸러미·요청은 가짜(a00-ads)
import "./helpers/mobileLoader.mjs"
import { FAKE_CLIENT, FAKE_SLOTS, setAds } from "./a00-ads.mjs"
import { React, act, renderHook } from "./helpers/dom.mjs"
import { test, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flushNow, pressKey, waitUntil } from "./a00-kit.mjs"
import { confirms, endGame, fakeSocket, resetGame, seat } from "./a00-game.mjs"

const { readAdConfig } = await import("@m/shared/ads/adConfig.js")
const { SEEN_GAMES_KEY } = await import("@m/shared/ads/seenGames.js")
const { useInterstitialAd } = await import("@m/shared/ads/useInterstitialAd.js")
const { default: GameResultPage } = await import("@m/domains/game/result/pages/GameResultPage.jsx")
const { ShellBottomSlotContext } = await import("@m/shared/layouts/mobileShellSlots.js")
const { setSocket } = await import("@/shared/socket/socketClient.js")
const { createBrowserRouter, RouterProvider } = await import("react-router-dom")
const { render } = await import("./helpers/dom.mjs")

const LIVE_ENV = { VITE_AD_PROVIDER: "adsense", VITE_ADSENSE_CLIENT: FAKE_CLIENT, VITE_ADSENSE_SLOT_BANNER: FAKE_SLOTS.banner, VITE_ADSENSE_SLOT_INTERSTITIAL: FAKE_SLOTS.interstitial }
const ROLES = ["CITIZEN", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN"]

let view = null
let hook = null
afterEach(() => {
    mock.timers.reset()
    hook?.unmount()
    hook = null
    resetGame(view)
    view = null
    setAds(readAdConfig({}), false)
    window.history.replaceState(null, "", "/")
})

// 판마다 다른 판 번호 (한 번 띄운 판은 기억되므로)
let gameSeq = 0
const nextGame = () => `m1-ad-game-${++gameSeq}`

// 가짜 시계 넘기기 (약속까지 풂)
async function tick(ms) {
    act(() => { mock.timers.tick(ms) })
    await flushNow(3)
}

// 광고 훅만: 그 단계·판 번호로 열리는지 (1.5초 늦춤 뒤)
async function adHookOpen({ stage, gameId, seen = [] }) {
    setAds(readAdConfig(LIVE_ENV), false)
    seat({ n: 5, phase: "DAY", gameId })
    window.localStorage.setItem(SEEN_GAMES_KEY, JSON.stringify(seen))
    mock.timers.enable({ apis: ["setTimeout"] })
    hook = renderHook(useInterstitialAd, { stage, isPreview: false, outcome: "win" })
    await tick(1_500)
    return hook.result.current.open
}

test("A18-M-009 한 판 끝 광고: 판 화면 단계 + 판 번호 → 안 띄움", async () => {
    assert.equal(await adHookOpen({ stage: "intro", gameId: nextGame() }), false)
})

test("A18-M-010 한 판 끝 광고: 결과 단계 + 처음 판 → 띄움", async () => {
    assert.equal(await adHookOpen({ stage: "result", gameId: nextGame() }), true)
})

test("A18-M-011 한 판 끝 광고: 결과 단계 + 이미 기억된 판 번호 → 안 띄움", async () => {
    const gameId = nextGame()
    assert.equal(await adHookOpen({ stage: "result", gameId, seen: [gameId] }), false)
})

// 결과 화면(브라우저 주소 기록 사용) → 연출 영상 끝 → 1.5초 뒤 광고 창이 열린 데까지
const adBox = () => document.querySelector("[data-interstitial-ad]")
async function resultWithAd() {
    setAds(readAdConfig(LIVE_ENV), false)
    seat({ n: 5, phase: "DAY", gameId: nextGame() })
    endGame({ roles: ROLES, winner: "CITIZEN" })
    // 판 화면 → 결과 화면으로 온 주소 기록
    window.history.replaceState(null, "", "/ingame")
    window.history.pushState(null, "", "/gameresult")
    mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: Date.now() })
    setSocket(fakeSocket())
    const bottom = document.createElement("div")
    document.body.appendChild(bottom)
    const router = createBrowserRouter([
        { path: "/gameresult", element: React.createElement(ShellBottomSlotContext.Provider, { value: bottom }, React.createElement(GameResultPage)) },
        { path: "*", element: React.createElement("p", { "data-elsewhere": "" }, "다른 화면") },
    ])
    view = render(React.createElement(RouterProvider, { router }))
    await flushNow(5)
    const video = document.querySelector("video")
    if (video) act(() => { video.dispatchEvent(new window.Event("ended")) })
    await flushNow(5)
    await tick(1_500)
    assert.ok(adBox(), "결과 화면에서 1.5초 뒤 광고 창이 안 열림")
    return router
}
const closeButton = () => (adBox() ? buttonNamed("닫기", adBox()) : null)
const resultShown = () => document.querySelector('section[aria-label="가면무도회 참가자 정체"]') !== null

test("A18-M-012 5초 전엔 못 닫음: 광고 창 열림, 가짜 시계 4.9초 → '닫기' 단추 없음, Esc·뒤 막 눌러도 창 그대로", async () => {
    await resultWithAd()
    await tick(4_900)
    assert.ok(closeButton() === null, "5초 전에 닫기 단추가 보임")
    pressKey("Escape", window)
    await flushNow(3)
    assert.ok(adBox(), "Esc로 광고 창이 닫힘")
    const backdrop = document.querySelector(".fixed.inset-0[aria-hidden='true']")
    if (backdrop) click(backdrop)
    await flushNow(3)
    assert.ok(adBox(), "뒤 막을 눌러 광고 창이 닫힘")
})

test("A18-M-013 5초 뒤 닫기: 가짜 시계 5초 → '닫기' 단추 보임, 누르면 창 닫힘, 결과 화면 그대로", async () => {
    const router = await resultWithAd()
    await tick(5_000)
    const close = closeButton()
    assert.ok(close, "5초가 지났는데 닫기 단추가 없음")
    mock.timers.reset()
    click(close)
    await waitUntil(() => adBox() === null, { label: "광고 창 닫힘" })
    assert.equal(router.state.location.pathname, "/gameresult")
    assert.ok(resultShown(), "광고를 닫았는데 결과 화면이 안 보임")
})

test("A18-M-014 광고가 열린 동안 뒤로 가기는 광고만 다룸: 4초 → 창 그대로·이동 없음·확인 창 없음, 6초 → 창만 닫힘", async () => {
    const router = await resultWithAd()
    await tick(4_000)
    window.history.back()
    await tick(0)
    await tick(0)
    assert.ok(adBox(), "4초에 뒤로 가기로 광고 창이 닫힘")
    assert.equal(router.state.location.pathname, "/gameresult", "4초에 뒤로 가기로 화면이 바뀜")
    assert.equal(confirms.length, 0, `4초에 확인 창이 뜸: ${confirms.join(" / ")}`)
    await tick(2_000)
    window.history.back()
    await tick(0)
    await tick(0)
    mock.timers.reset()
    await waitUntil(() => adBox() === null, { label: "6초 뒤로 가기로 광고 창 닫힘" })
    assert.equal(router.state.location.pathname, "/gameresult", "6초에 뒤로 가기로 화면이 바뀜")
    assert.equal(confirms.length, 0, `6초에 확인 창이 뜸: ${confirms.join(" / ")}`)
    assert.ok(resultShown(), "결과 화면이 안 보임")
})
