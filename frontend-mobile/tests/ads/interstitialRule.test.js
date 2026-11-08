// 한 판 끝 광고 판정(판 번호·띄울지·5초 셈) 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    INTERSTITIAL_WAIT_SEC,
    pickGameKey,
    secondsLeft,
    shouldOpenInterstitial,
} from "../../src/shared/ads/interstitialRule.js"

test("판 번호: 실제 판 gameId 먼저, 개발 미리보기만 preview:승패, 나머지 null", () => {
    assert.equal(pickGameKey({ gameId: " g-1 " }), "g-1")
    assert.equal(pickGameKey({ gameId: "g-1", isPreview: true, outcome: "win", isDev: true }), "g-1")
    assert.equal(pickGameKey({ gameId: null, isPreview: true, outcome: "lose", isDev: true }), "preview:lose")
    assert.equal(pickGameKey({ gameId: null, isPreview: true, outcome: "win", isDev: false }), null)
    assert.equal(pickGameKey({ gameId: "", isPreview: false }), null)
})

test("결과 단계·자리 켜짐·판 번호 있음·처음 본 판일 때만 띄움", () => {
    const base = { stage: "result", mode: "live", gameKey: "g1", seen: [] }
    assert.equal(shouldOpenInterstitial(base), true)
    assert.equal(shouldOpenInterstitial({ ...base, mode: "placeholder" }), true)
    assert.equal(shouldOpenInterstitial({ ...base, stage: "intro" }), false)
    assert.equal(shouldOpenInterstitial({ ...base, stage: "unavailable" }), false)
    assert.equal(shouldOpenInterstitial({ ...base, mode: "off" }), false)
    assert.equal(shouldOpenInterstitial({ ...base, gameKey: null }), false)
    assert.equal(shouldOpenInterstitial({ ...base, seen: ["g0", "g1"] }), false)
})

test("5초 셈: 올림으로 5→1, 다 지나면 0에서 멈춤", () => {
    assert.equal(INTERSTITIAL_WAIT_SEC, 5)
    assert.equal(secondsLeft(1000, 1000), 5)
    assert.equal(secondsLeft(1000, 2100), 4)
    assert.equal(secondsLeft(1000, 5999), 1)
    assert.equal(secondsLeft(1000, 6000), 0)
    assert.equal(secondsLeft(1000, 99999), 0)
    // 시계가 뒤로 가도 5초 넘게 안 셈
    assert.equal(secondsLeft(5000, 1000), 5)
})
