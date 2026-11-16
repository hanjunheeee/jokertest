// M-1 모바일 광고 시험 몫 도우미: 광고 설정·광고 꾸러미 불러오기를 가짜로 바꿔 끼움 (진짜 AdSense 스크립트·요청이 안 나가게)
// a18-*.test.js가 mobileLoader 바로 다음, 광고 화면을 부르기 전에 import (공용 아님)
import { stubModule } from "./helpers/mobileLoader.mjs"

// 누가 봐도 가짜인 광고 계정·단위 (모양만 ca-pub-숫자)
export const FAKE_CLIENT = "ca-pub-0000000000000000"
export const FAKE_SLOTS = Object.freeze({ banner: "1111111111", interstitial: "2222222222" })

// 이 빌드의 광고 설정 → 시험이 바꿀 수 있는 값 (setAds로)
stubModule("shared/ads/currentAdConfig.js", `
export let AD_CONFIG = Object.freeze({ provider: null, client: "", slots: Object.freeze({ banner: "", interstitial: "" }) })
export let AD_IS_DEV = false
globalThis.__m1SetAds = (config, isDev) => { AD_CONFIG = config; AD_IS_DEV = isDev }
`)
// 광고 꾸러미 불러오기·채우기 → 부른 계정만 적어 둠 (스크립트 안 붙임)
stubModule("shared/ads/loadAdScript.js", `
globalThis.__m1AdLoads = []
export function loadAdScript(client) { globalThis.__m1AdLoads.push(client); return Promise.resolve() }
export function requestAdFill() { return true }
`)

// 광고 설정 바꾸기 (config = readAdConfig 결과, isDev = 개발 서버)
export function setAds(config, isDev = false) {
    globalThis.__m1SetAds(config, isDev)
}
// 가짜 꾸러미를 부른 기록
export const adLoads = () => globalThis.__m1AdLoads ?? []
