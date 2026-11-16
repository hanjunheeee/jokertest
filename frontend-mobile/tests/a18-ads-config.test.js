// 모바일 광고 설정·광고 자리 시험: 공급자·계정 모양이 틀리면 광고 안 씀, 자리마다 진짜 광고/없음/개발 회색 상자, 하단 배너는 게임 밖 허용 화면만
// 목록 A18 모바일 A18-M-001~008 (돌리기: frontend-mobile 폴더에서 node --test tests/a18-ads-config.test.js), 광고 꾸러미·요청은 가짜(a00-ads)
import "./helpers/mobileLoader.mjs"
import { FAKE_CLIENT, FAKE_SLOTS, adLoads, setAds } from "./a00-ads.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { flush, textOf } from "./a00-kit.mjs"

const { readAdConfig } = await import("@m/shared/ads/adConfig.js")
const { default: AdBanner } = await import("@m/shared/ads/AdBanner.jsx")
const { default: MobileShell } = await import("@m/shared/layouts/MobileShell.jsx")
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")

let view = null
afterEach(() => {
    view?.unmount()
    view = null
    setAds(readAdConfig({}), false)
    document.head.querySelectorAll("script").forEach((s) => s.remove())
})

// 광고를 다 갖춘 설정 (누가 봐도 가짜인 계정·단위)
const LIVE_ENV = { VITE_AD_PROVIDER: "adsense", VITE_ADSENSE_CLIENT: FAKE_CLIENT, VITE_ADSENSE_SLOT_BANNER: FAKE_SLOTS.banner, VITE_ADSENSE_SLOT_INTERSTITIAL: FAKE_SLOTS.interstitial }

test("A18-M-001 광고 설정 읽기: 공급자 adsense + 계정 ca-pub-123 + 배너 단위 → 공급자 adsense", () => {
    const config = readAdConfig({ VITE_AD_PROVIDER: "adsense", VITE_ADSENSE_CLIENT: "ca-pub-123", VITE_ADSENSE_SLOT_BANNER: "456" })
    assert.equal(config.provider, "adsense")
})

test("A18-M-002 광고 설정 읽기: 계정 pub-123(모양 틀림) → 공급자 없음", () => {
    const config = readAdConfig({ VITE_AD_PROVIDER: "adsense", VITE_ADSENSE_CLIENT: "pub-123", VITE_ADSENSE_SLOT_BANNER: "456" })
    assert.equal(config.provider, null)
})

test("A18-M-003 광고 설정 읽기: 공급자 admob → 없음", () => {
    const config = readAdConfig({ VITE_AD_PROVIDER: "admob", VITE_ADSENSE_CLIENT: "ca-pub-123", VITE_ADSENSE_SLOT_BANNER: "456" })
    assert.equal(config.provider, null)
})

test("A18-M-004 광고 자리 그리는 법: 설정 + 그 자리 단위 있음 → 진짜 광고 칸 (꾸러미는 가짜)", async () => {
    setAds(readAdConfig(LIVE_ENV), false)
    view = render(React.createElement(AdBanner))
    await flush()
    const ins = document.querySelector("aside[aria-label='광고'] ins.adsbygoogle")
    assert.ok(ins, "진짜 광고 칸이 없음")
    assert.equal(ins.getAttribute("data-ad-client"), FAKE_CLIENT)
    assert.equal(ins.getAttribute("data-ad-slot"), FAKE_SLOTS.banner)
    assert.ok(document.querySelector("[data-ad-placeholder]") === null, "진짜 광고인데 회색 상자")
    assert.ok(adLoads().includes(FAKE_CLIENT), "광고 꾸러미를 안 부름")
    assert.equal(document.querySelectorAll("script[src*='googlesyndication']").length, 0, "진짜 광고 스크립트가 붙음")
})

test("A18-M-005 광고 자리 그리는 법: 운영 빌드 + 설정 없음 → 아무것도 없음", () => {
    setAds(readAdConfig({}), false)
    view = render(React.createElement(AdBanner))
    assert.equal(view.container.innerHTML, "", "운영 빌드인데 광고 자리가 그려짐")
})

test("A18-M-006 광고 자리 그리는 법: 개발 + 설정 없음 → 회색 자리 상자", () => {
    setAds(readAdConfig({}), true)
    view = render(React.createElement(AdBanner))
    const box = document.querySelector("[data-ad-placeholder='banner']")
    assert.ok(box, "회색 자리 상자가 없음")
    assert.match(textOf(box), /광고 자리/)
    assert.ok(document.querySelector("ins.adsbygoogle") === null)
})

// 모바일 틀(MobileShell) 아래 그 주소 화면 → 하단 배너 줄이 있나
async function bannerOn(path) {
    setAds(readAdConfig(LIVE_ENV), false)
    const router = createMemoryRouter([
        { element: React.createElement(MobileShell), children: [{ path: "*", element: React.createElement("p", null, "화면") }] },
    ], { initialEntries: [path] })
    view = render(React.createElement(RouterProvider, { router }))
    await flush()
    const shown = document.querySelector("aside[aria-label='광고']") !== null
    view.unmount()
    view = null
    return shown
}

test("A18-M-007 배너는 게임 밖 허용 화면만: /lobby·/lobby/ → 보임", async () => {
    assert.equal(await bannerOn("/lobby"), true, "/lobby에 배너가 없음")
    assert.equal(await bannerOn("/lobby/"), true, "/lobby/에 배너가 없음")
})

test("A18-M-008 배너는 게임 밖 허용 화면만: /ingame → 안 보임", async () => {
    assert.equal(await bannerOn("/ingame"), false, "판 화면에 배너가 보임")
})
