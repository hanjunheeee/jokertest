// 한 판 끝 광고 열기 시점(결과 단계 1.5초 뒤·판마다 한 번) 시험 (가짜 시계)
// 광고 설정은 바꿔 끼워 "운영·설정 다 있음"으로 둠, 판 번호는 데스크톱 인게임 스토어 값
import { stubModule } from "../helpers/mobileLoader.mjs"
import { renderHook, act } from "../helpers/dom.mjs"
import { test, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

stubModule(
    "/shared/ads/currentAdConfig.js",
    `export const AD_CONFIG = globalThis.__adConfig
export const AD_IS_DEV = false`,
)
globalThis.__adConfig = { provider: "adsense", client: "ca-pub-1234567890", slots: { banner: "111", interstitial: "222" } }

const { useInterstitialAd } = await import("@m/shared/ads/useInterstitialAd.js")
const { useInGameStore } = await import("@/domains/game/ingame/store/ingameStore.js")
const { SEEN_GAMES_KEY } = await import("@m/shared/ads/seenGames.js")

beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout"] })
    window.localStorage.clear()
})
afterEach(() => mock.timers.reset())

function mount(gameId, stage) {
    act(() => useInGameStore.setState({ gameId }))
    return renderHook((p) => useInterstitialAd(p), { stage })
}

test("결과 단계 1.5초 뒤에 열림, 그 전엔 닫힘", () => {
    const hook = mount("판-가", "result")
    assert.equal(hook.result.current.mode, "live")
    act(() => mock.timers.tick(1_499))
    assert.equal(hook.result.current.open, false)
    act(() => mock.timers.tick(1))
    assert.equal(hook.result.current.open, true)
    hook.unmount()
})

test("결과 단계가 아니면 안 열림", () => {
    const hook = mount("판-나", "intro")
    act(() => mock.timers.tick(5_000))
    assert.equal(hook.result.current.open, false)
    hook.unmount()
})

test("열 때 판 번호를 저장소에 기억", () => {
    const hook = mount("판-다", "result")
    act(() => mock.timers.tick(1_500))
    assert.deepEqual(JSON.parse(window.localStorage.getItem(SEEN_GAMES_KEY)), ["판-다"])
    hook.unmount()
})

test("같은 판은 두 번 안 띄움 (닫고 다시 결과 화면에 와도)", () => {
    const first = mount("판-라", "result")
    act(() => mock.timers.tick(1_500))
    act(() => first.result.current.close())
    assert.equal(first.result.current.open, false)
    first.unmount()
    const again = mount("판-라", "result")
    act(() => mock.timers.tick(5_000))
    assert.equal(again.result.current.open, false)
    again.unmount()
})

test("저장소가 비어도 이번 접속 기억으로 같은 판 안 띄움", () => {
    const first = mount("판-마", "result")
    act(() => mock.timers.tick(1_500))
    first.unmount()
    window.localStorage.clear()
    const again = mount("판-마", "result")
    act(() => mock.timers.tick(5_000))
    assert.equal(again.result.current.open, false)
    again.unmount()
})

test("1.5초 전에 화면 떠나면 안 열리고 기억도 안 함", () => {
    const hook = mount("판-바", "result")
    act(() => mock.timers.tick(1_000))
    hook.unmount()
    act(() => mock.timers.tick(5_000))
    assert.equal(window.localStorage.getItem(SEEN_GAMES_KEY), null)
})

test("판 번호 없으면(미리보기 아님) 안 열림", () => {
    const hook = mount(null, "result")
    act(() => mock.timers.tick(5_000))
    assert.equal(hook.result.current.open, false)
    hook.unmount()
})

test("다른 판으로 바뀌면 앞 판 열림 표시는 꺼짐", () => {
    const hook = mount("판-사", "result")
    act(() => mock.timers.tick(1_500))
    assert.equal(hook.result.current.open, true)
    act(() => useInGameStore.setState({ gameId: "판-아" }))
    assert.equal(hook.result.current.open, false)
    hook.unmount()
})
