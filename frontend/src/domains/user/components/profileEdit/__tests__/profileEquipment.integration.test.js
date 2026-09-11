import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"

// F-13 AC-02 재검토 전용 회귀 — 기존 profileBorder.integration.test.js가 미리보기·취소·
// 확인·저장 거부·중복 확인 방지·계정 전환 차단(A-08)을 이미 폭넓게 검증하므로 여기서는
// 그 시나리오를 다시 반복하지 않는다. 이 파일은 그 스위트에 없던 한 가지만 고정한다:
// "응답 유실(전송 불확실)은 서버 상태 재조회로 확정한다"는 계획 메모 지시(economy.store.js의
// purchase()가 이미 구현한 confirmedRejection/unknown 구분을 useProfileBorderEditor.handleConfirm
// 에도 그대로 적용한 부분) — useMyProfile.roleStatistics.test.js와 같은 이유로 renderHook은
// DOM 전역이 필요하다.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
let currentUser = { uuid: "user-1" }
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

const { mock } = await import("node:test")

mock.module("../../../../../shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: (...args) => postImpl(...args),
    },
  },
})

mock.module("../../../../auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: currentUser }),
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

const { renderHook, waitFor, act, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { useProfileBorderEditor } = await import("../useProfileBorderEditor.js")
const { useEconomyStore } = await import("../../../../economy/store/economy.store.js")

function resetStores() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
}

const walletOk = { balanceGold: 100, balanceDiamond: 100 }

function readyLoadout(loadout) {
  return async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }], loadout })
}

test("F-13 AC-02: 서버가 명시적으로 거부(code 있음)하면 재조회 없이 오류만 보여주고 이전 장착 상태를 유지한다", async () => {
  resetStores()
  // fetchSummary()는 한 번 호출될 때마다 /wallet과 /entitlements 두 endpoint를 함께
  // 부른다(Promise.all) — "재조회 횟수"를 정확히 세려면 fetchSummary당 딱 한 번만 불리는
  // /wallet endpoint만 센다(entitlements까지 세면 fetchSummary 한 번이 +2로 잡혀 어긋난다).
  let walletCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) walletCalls += 1
    return readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  }
  const rejection = new Error("보유하지 않은 상품입니다.")
  rejection.code = "ITEM_NOT_OWNED"
  postImpl = async () => { throw rejection }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  const fetchSummaryCallsBeforeConfirm = walletCalls

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(result.current.confirmError, "보유하지 않은 상품입니다.")
  assert.equal(walletCalls, fetchSummaryCallsBeforeConfirm, "명시적 거부는 다시 조회할 필요가 없다(아무 것도 바뀌지 않았음이 이미 확정됨)")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-평민", "거부된 요청은 장착 상태를 바꾸지 않는다")
})

test("F-13 AC-02: 응답을 잃어버리면(code 없는 오류) 성공/실패를 추측하지 않고 서버 상태를 다시 읽는다", async () => {
  resetStores()
  let walletCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) walletCalls += 1
    return readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  }
  postImpl = async () => { throw new TypeError("network disconnected") } // code 없음 — 전송 불확실

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  const fetchSummaryCallsBeforeConfirm = walletCalls

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(result.current.confirmError, "network disconnected")
  assert.equal(walletCalls, fetchSummaryCallsBeforeConfirm + 1, "응답 유실은 서버 상태를 다시 읽어 진실을 확정해야 한다")
})

test("F-13 AC-02: 응답 유실 뒤 실제로는 서버에 저장이 성공해 있었다면, 재조회로 그 실제 값을 반영한다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
      // 재조회 시점에는 이미 서버가 실제로 확정한 값(귀족)을 돌려준다 — 첫 저장 응답만 유실됐을 뿐,
      // 서버는 실제로 처리를 완료했었다는 시나리오.
      loadout: { selectedProfileBorderId: "profile-border-귀족" },
    })
  postImpl = async () => { throw new TypeError("network disconnected") }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-귀족",
    "재조회 결과가 실제 서버 진실이므로 추측이 아니라 그 값으로 화면이 갱신되어야 한다",
  )
})

test("F-13 AC-02/A-08: 응답 유실 재조회를 기다리는 동안 계정이 바뀌면, 이전 계정의 재조회 결과로 지금 계정 화면을 덮어쓰지 않는다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  postImpl = async () => { throw new TypeError("network disconnected") }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let confirmPromise
  act(() => { confirmPromise = result.current.handleConfirm() })
  setCurrentUser({ uuid: "user-2" }) // 저장·재조회가 끝나기 전에 계정 전환 — economy store가 reset되고 generation이 올라간다

  await act(async () => { await confirmPromise })

  assert.equal(result.current.confirmStatus, "idle")
  assert.equal(useEconomyStore.getState().requestGeneration >= 1, true, "계정 전환은 generation을 올려 이전 계정 응답을 무효화한다")
})
