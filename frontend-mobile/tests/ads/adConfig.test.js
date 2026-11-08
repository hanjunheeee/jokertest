// 광고 환경값 읽기·자리별 그리기 방식 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import { readAdConfig, slotMode } from "../../src/shared/ads/adConfig.js"

const FULL = {
    VITE_AD_PROVIDER: " AdSense ",
    VITE_ADSENSE_CLIENT: "ca-pub-1234567890",
    VITE_ADSENSE_SLOT_BANNER: "111",
    VITE_ADSENSE_SLOT_INTERSTITIAL: "222",
}

test("값이 다 있으면 adsense·계정·광고 단위 2개 (앞뒤 빈칸·대소문자 정리)", () => {
    const config = readAdConfig(FULL)
    assert.equal(config.provider, "adsense")
    assert.equal(config.client, "ca-pub-1234567890")
    assert.deepEqual({ ...config.slots }, { banner: "111", interstitial: "222" })
})

test("공급자 없음·모르는 공급자·계정 모양 틀림이면 광고 안 씀", () => {
    assert.equal(readAdConfig({}).provider, null)
    assert.equal(readAdConfig(undefined).provider, null)
    assert.equal(readAdConfig({ ...FULL, VITE_AD_PROVIDER: "admob" }).provider, null)
    assert.equal(readAdConfig({ ...FULL, VITE_ADSENSE_CLIENT: "pub-123" }).provider, null)
    assert.equal(readAdConfig({ ...FULL, VITE_ADSENSE_CLIENT: "" }).client, "")
})

test("설정 다 있으면 live, 광고 단위 빠진 자리는 개발 placeholder·운영 off", () => {
    const config = readAdConfig({ ...FULL, VITE_ADSENSE_SLOT_INTERSTITIAL: "" })
    assert.equal(slotMode(config, "banner", false), "live")
    assert.equal(slotMode(config, "interstitial", false), "off")
    assert.equal(slotMode(config, "interstitial", true), "placeholder")
})

test("설정 없으면 운영 off, 개발 placeholder", () => {
    const config = readAdConfig({})
    assert.equal(slotMode(config, "banner", false), "off")
    assert.equal(slotMode(config, "banner", true), "placeholder")
    assert.equal(slotMode(null, "banner", false), "off")
})
