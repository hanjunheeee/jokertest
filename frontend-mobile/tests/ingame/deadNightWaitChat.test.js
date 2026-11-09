// 밤 대기 창과 죽은 사람 채팅 시험 (사용자 규칙: 죽은 사람끼리 대화는 낮밤 상관없음, 2026-11-09)
// 죽은 사람은 대기 창이 안 덮고 화면 잠금도 안 걸림, 산 사람은 그대로 덮이고 잠김
import { stubModule } from "../helpers/mobileLoader.mjs"
import { renderHook, act } from "../helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

// 결과 화면 이동은 길 찾기 틀이 필요해 빈 훅으로 (이 시험과 상관없음)
stubModule("/hooks/useInGameResultNavigation.js", "export function useInGameResultNavigation() {}")
const { useInGameStore, readInGameReceiptScope } = await import("@/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("@/domains/auth/store/auth.store.js")
const { useOverlayLayer } = await import("@m/domains/game/ingame/hooks/overlays/useOverlayLayer.js")
const { useOverlayBridge } = await import("@m/domains/game/ingame/hooks/overlays/overlayBridge.js")

const GAME_ID = "dead-night-wait"
const SELF = "u1"

// 2일차 밤 판 깔고 대기 알림 걸기 (selfAlive: 내 생존)
function seedNightWait(selfAlive) {
    act(() => {
        useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF, nickname: "A" }, identityGeneration: 0 })
        useInGameStore.setState({ gameId: null, state: null, nightPresentationWait: null, snapshotSeq: 0 })
        useInGameStore.getState().setGamePayload({
            gameId: GAME_ID,
            state: {
                id: GAME_ID,
                phase: "NIGHT",
                dayIndex: 2,
                dayPhase: null,
                players: [
                    { uuid: SELF, nickname: "A", alive: selfAlive },
                    { uuid: "u2", nickname: "B", alive: true },
                    { uuid: "u3", nickname: "C", alive: true },
                ],
                self: { uuid: SELF, nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
            },
        })
        useInGameStore.setState({
            nightPresentationWait: Object.freeze({
                gameId: GAME_ID,
                nightDayIndex: 2,
                scope: readInGameReceiptScope({ accountId: SELF, identityGeneration: 0 }),
            }),
        })
    })
}

// 연출 층 훅 그리고 밤 입장 안내는 확인으로 닫음 (안내 잠금은 이 시험 대상 아님)
function mountLayer() {
    const view = renderHook(() => useOverlayLayer())
    for (let i = 0; i < 3 && view.result.current.phaseEntrance.open; i += 1) {
        act(() => view.result.current.phaseEntrance.confirm())
    }
    assert.equal(view.result.current.phaseEntrance.open, false, "전제: 밤 입장 안내 닫힘")
    return view
}

afterEach(() => {
    act(() => {
        useInGameStore.getState().clearGame()
        useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 0 })
    })
})

test("죽은 사람 + 밤 + 대기 알림: 대기 창 안 덮고 화면(채팅) 안 잠김", () => {
    seedNightWait(false)
    const view = mountLayer()
    assert.equal(view.result.current.waitOpen, true, "전제: 대기 알림은 걸려 있음")
    assert.equal(useOverlayBridge.getState().surfaceLocked, false, "죽은 사람 채팅이 잠김")
    assert.equal(view.result.current.waitCovers, false, "죽은 사람한테 대기 창이 덮음")
    view.unmount()
})

test("산 사람 + 밤 + 대기 알림: 대기 창 덮고 화면 잠김 (지금 동작 그대로)", () => {
    seedNightWait(true)
    const view = mountLayer()
    assert.equal(view.result.current.waitOpen, true)
    assert.equal(view.result.current.waitCovers, true)
    assert.equal(useOverlayBridge.getState().surfaceLocked, true)
    view.unmount()
})
