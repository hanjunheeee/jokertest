import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { register } from "node:module"
import React from "react"

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

register(new URL("../../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
let getMyAchievementsImpl = async () => { throw new Error("getMyAchievementsApi stub not set") }
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

mock.module("../../../../library/api/achievements.api.js", {
  namedExports: {
    getMyAchievementsApi: (...args) => getMyAchievementsImpl(...args),
  },
})

const { renderHook, render, waitFor, act, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { useProfileBorderEditor } = await import("../useProfileBorderEditor.js")
const { useEconomyStore } = await import("../../../../economy/store/economy.store.js")
const { useAchievements } = await import("../../../../library/hooks/useAchievements.js")
const { useAchievementsStore } = await import("../../../../library/store/achievements.store.js")
const { default: ProfileEditOptionGrid } = await import("../ProfileEditOptionGrid.jsx")
const { PROFILE_EDIT_PHOTO_OPTIONS, PROFILE_EDIT_TAB_BORDER, PROFILE_PHOTO_ITEM_TYPE } =
  await import("../../../constants/profileEditLayout.js")

const allDefaultPhotoEntitlements = PROFILE_EDIT_PHOTO_OPTIONS.map(({ itemId }) => ({ itemId, itemType: PROFILE_PHOTO_ITEM_TYPE }))

function resetStores() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  getMyAchievementsImpl = async () => { throw new Error("getMyAchievementsApi stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
  useAchievementsStore.getState().reset()
}

const walletOk = { balanceGold: 100, balanceDiamond: 100 }

function readyLoadout(loadout) {
  return async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }], loadout })
}

test("F-13 AC-02: 서버가 명시적으로 거부(code 있음)하면 재조회 없이 오류만 보여주고 이전 장착 상태를 유지한다", async () => {
  resetStores()
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
  let entitlementsCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return walletOk
    entitlementsCalls += 1
    return {
      entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
      loadout: { selectedProfileBorderId: entitlementsCalls === 1 ? "profile-border-평민" : "profile-border-귀족" },
    }
  }
  postImpl = async () => { throw new TypeError("network disconnected") }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-평민",
    "최초 조회 값은 아직 이전 장착값이어야 실제 상태 변화를 증명할 수 있다",
  )

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-귀족",
    "재조회 결과가 실제 서버 진실이므로 이전 값(평민)에서 실제로 바뀌어 반영되어야 한다",
  )
  assert.equal(result.current.confirmUncertain, false, "재조회 자체는 성공했으므로 확인 불가 상태로 남으면 안 된다")
})

test("F-13 AC-02(CODEX-1): 응답 유실 뒤 재조회(서버 상태 확인)마저 실패하면, 단순 저장 오류와 구분되는 '확인 불가' 상태로 남는다(조용히 삼키지 않는다)", async () => {
  resetStores()
  let walletCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) {
      walletCalls += 1
      if (walletCalls > 1) throw new Error("재조회도 실패")
    }
    return readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  }
  postImpl = async () => { throw new TypeError("network disconnected") }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(result.current.confirmUncertain, true, "저장도 실패하고 그 결과 확인(재조회)도 실패하면 '확인 불가' 상태가 드러나야 한다")
  assert.notEqual(
    result.current.confirmError,
    "network disconnected",
    "재조회 실패는 원래의 저장 전송 오류와 다른, 구분되는 메시지여야 한다(조용히 원래 오류만 보여주면 안 된다)",
  )
})

test("F-13 AC-02(CODEX-1): 저장 응답을 기다리는 동안 편집기를 닫았다가 다시 열면, 그 사이 도착한 이전 세션의 늦은 성공 응답이 새로 연 세션을 대신 닫지 않는다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  let resolvePost
  postImpl = async () => new Promise((resolve) => { resolvePost = resolve })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let confirmPromise
  act(() => { confirmPromise = result.current.handleConfirm() }) // 저장 진행 중(응답 대기, 계정 전환 없음)

  rerender({ open: false }) // 사용자가 응답을 기다리지 않고 편집기를 닫음
  rerender({ open: true }) // 즉시 다시 연다 — 새 세션 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.draftBorderItemId, "profile-border-평민", "새로 연 세션의 초안은 실제 장착값으로 리셋되어야 한다")

  await act(async () => {
    resolvePost({ loadout: { selectedProfileBorderId: "profile-border-귀족" } }) // 이전 세션의 저장이 뒤늦게 성공
    await confirmPromise
  })

  assert.equal(closeCount, 0, "이미 닫혔다가 다시 열린 세션은 이전 세션의 늦은 성공으로 다시 닫히면 안 된다(계정은 그대로라 generation만으로는 구분되지 않는다)")
})

test("F-13 AC-02(CODEX-4): 저장 응답을 기다리는 동안 편집기를 닫고 다시 열지 않으면, 뒤늦게 도착한 성공 응답을 취소로 취급하지 않고 실제로 서버에 확정된 값을 store에 그대로 반영하며 onClose를 다시 부르지 않는다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  let resolvePost
  postImpl = async () => new Promise((resolve) => { resolvePost = resolve })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let confirmPromise
  act(() => { confirmPromise = result.current.handleConfirm() }) // 저장 진행 중(응답 대기)
  assert.equal(result.current.confirmStatus, "saving")

  rerender({ open: false }) // 사용자가 응답을 기다리지 않고 편집기를 닫고, 다시 열지 않는다

  await act(async () => {
    resolvePost({ loadout: { selectedProfileBorderId: "profile-border-귀족" } }) // 닫힌 뒤 뒤늦게 성공 도착
    await confirmPromise
  })

  assert.equal(closeCount, 0, "이미 닫힌 세션의 늦은 성공이 onClose를 다시 부르면 안 된다(중복 close)")
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-귀족",
    "서버가 실제로 확정한 저장은 편집기가 닫혀 있어도 취소로 취급되지 않고 store에 그대로 반영되어야 한다",
  )
})

test("F-13 AC-02(CODEX-4): 저장 응답을 기다리는 동안 편집기를 닫고 다시 열지 않으면, 뒤늦게 도착한 거부 응답은 이미 무효한 세션의 재조회·오류 표시를 유발하지 않는다", async () => {
  resetStores()
  let walletCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) walletCalls += 1
    return readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  }
  let rejectPost
  postImpl = async () => new Promise((_resolve, reject) => { rejectPost = reject })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  const walletCallsBeforeConfirm = walletCalls
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let confirmPromise
  act(() => { confirmPromise = result.current.handleConfirm() })
  rerender({ open: false }) // 닫고 다시 열지 않는다

  await act(async () => {
    rejectPost(new TypeError("network disconnected")) // 닫힌 뒤 뒤늦게 응답 유실(code 없음) 도착
    await confirmPromise
  })

  assert.equal(closeCount, 0, "이미 닫힌 세션은 onClose를 다시 부르면 안 된다")
  assert.equal(
    walletCalls,
    walletCallsBeforeConfirm,
    "이미 무효화된 세션의 거부는 재조회(서버 상태 확인)조차 시도하면 안 된다 — isStale() 확인이 fetchSummary보다 먼저다",
  )
  assert.equal(result.current.confirmError, null, "닫힌 세션에는 새 오류 메시지가 생기면 안 된다")
})

test("F-13 AC-02(CODEX-2): 세션 A가 저장 응답을 기다리는 동안 편집기를 닫았다 다시 열어 세션 B가 새로 저장을 시작하면, A의 뒤늦은 완료(성공)는 진행 중인 B의 saving 상태·초안·편집기를 전혀 건드리지 않고 오직 B 자신의 완료만 B를 정착시킨다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  const postDeferreds = []
  postImpl = async () => new Promise((resolve, reject) => { postDeferreds.push({ resolve, reject }) })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(result.current.confirmStatus, "saving")
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // 사용자가 A의 응답을 기다리지 않고 편집기를 닫음
  rerender({ open: true }) // 즉시 다시 연다 — 세션 B 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.draftBorderItemId, "profile-border-평민", "B의 초안은 실제 장착값으로 리셋되어야 한다")
  assert.equal(result.current.confirmStatus, "idle", "B는 아직 아무 것도 시작하지 않았으므로 idle이어야 한다")

  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(result.current.confirmStatus, "saving", "B가 시작한 저장은 saving 상태여야 한다")
  assert.equal(postDeferreds.length, 1, "B의 실제 전송은 A가 settle되기 전까지 큐에서 대기한다(직렬화)")

  await act(async () => {
    postDeferreds[0].resolve({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
    await confirmAPromise
  })
  for (let i = 0; i < 10 && postDeferreds.length < 2; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  assert.equal(postDeferreds.length, 2, "A가 settle된 뒤에야 B의 실제 POST가 큐에서 나가야 한다")

  assert.equal(result.current.confirmStatus, "saving", "A의 완료는 진행 중인 B의 saving 상태를 해제하면 안 된다(이전 반송 지적의 회귀)")
  assert.equal(result.current.confirmError, null, "A의 완료가 B 화면에 오류를 남기면 안 된다")
  assert.equal(closeCount, 0, "A의 완료는 B 세션의 편집기를 닫으면 안 된다")
  assert.equal(result.current.draftBorderItemId, "profile-border-남작", "A의 완료가 B의 진행 중인 초안을 되돌리면 안 된다")

  await act(async () => {
    postDeferreds[1].resolve({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })

  assert.equal(result.current.confirmStatus, "idle", "B 자신의 완료는 정상적으로 saving을 해제해야 한다")
  assert.equal(closeCount, 1, "오직 B의 완료만 B의 편집기를 닫아야 한다")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작", "마지막으로 확정된 값(B)이 최종 장착 상태여야 한다")
})

test("F-13 AC-02(CODEX-5, 직렬화 큐 재검증): profileQueue가 겹치는 확정을 실제 전송 순서로 직렬화하므로 '완료 순서 역전'은 같은 세션 안에서 더 이상 재현될 수 없음을 먼저 확인하고, 유일하게 가능한 순서(A settle → B 실제 전송 → B 완료)에서 A의 완료가 이미 확정된 B의 값을 store에서 되돌리지 않는다는 것도 확인한다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  const postDeferreds = []
  postImpl = () => new Promise((resolve) => { postDeferreds.push(resolve) })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // A의 응답을 기다리지 않고 닫음
  rerender({ open: true }) // 세션 B 시작

  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  assert.equal(postDeferreds.length, 1, "A가 settle되기 전에는 B의 실제 POST가 나갈 수 없다(완료 순서 역전이 구조적으로 불가능함을 직접 확인)")

  await act(async () => {
    postDeferreds[0]({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
    await confirmAPromise
  })
  for (let i = 0; i < 10 && postDeferreds.length < 2; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  assert.equal(postDeferreds.length, 2, "A가 settle된 뒤에야 B의 실제 POST가 나가야 한다")
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-귀족",
    "A가 자기 자신의 확정으로 성공했으므로(아직 B는 완료 전) 이 시점의 store는 A의 값을 반영해야 한다",
  )
  assert.equal(closeCount, 0, "A의 완료는 아직 진행 중인 B 세션의 편집기를 닫으면 안 된다")

  await act(async () => {
    postDeferreds[1]({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })

  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "B(나중에 시작된 세션)의 완료가 A의 값을 정상적으로 대체해야 한다",
  )
  assert.equal(closeCount, 1, "오직 B 자신의 완료만 편집기를 닫아야 한다")
})

test("F-13 AC-02(CODEX-5): 세션 A가 저장 응답 대기 중 편집기를 닫았다 다시 열어 세션 B가 저장을 시작하면, 그 뒤 도착하는 A의 거부(전송 불확실)는 재조회·오류 표시 없이 조용히 무시되고, 뒤이어 실제로 전송되는 B의 확정이 정상적으로 완료된다", async () => {
  resetStores()
  let walletCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) walletCalls += 1
    return readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  }
  const postDeferreds = []
  postImpl = () => new Promise((resolve, reject) => { postDeferreds.push({ resolve, reject }) })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  const walletCallsBeforeConfirm = walletCalls

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // 닫음
  rerender({ open: true }) // 세션 B 시작

  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1, "B의 실제 전송은 A가 settle되기 전까지 나가지 않는다(직렬화)")

  await act(async () => {
    postDeferreds[0].reject(new TypeError("network disconnected"))
    await confirmAPromise
  })

  assert.equal(
    walletCalls,
    walletCallsBeforeConfirm,
    "이미 폐기된 세션 A의 거부는 재조회(fetchSummary)조차 시도하면 안 된다(isStale()이 fetchSummary보다 먼저 확인된다)",
  )
  assert.equal(result.current.confirmError, null, "폐기된 세션의 거부가 지금 화면(B)에 오류를 남기면 안 된다")

  for (let i = 0; i < 10 && postDeferreds.length < 2; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  assert.equal(postDeferreds.length, 2, "A가 settle된 뒤에야 B의 실제 POST가 나가야 한다")
  assert.equal(result.current.confirmStatus, "saving", "B의 실제 POST가 이제 막 나갔을 뿐 아직 응답을 받지 못했으므로 saving 상태여야 한다")

  await act(async () => {
    postDeferreds[1].resolve({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })

  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "B가 정상적으로 확정한 값이 최종 장착 상태여야 한다",
  )
  assert.equal(result.current.confirmStatus, "idle")
  assert.equal(result.current.confirmError, null, "B 자신의 성공적인 완료에는 오류가 남으면 안 된다")
  assert.equal(closeCount, 1, "B 자신의 완료만 편집기를 닫아야 한다")
})

test("F-13 AC-02(CODEX-6): 세션 A가 저장 응답을 기다리는 동안 편집기를 닫았다 다시 열어 세션 B가 저장을 시작하면, A의 거부(전송 불확실)로 큐가 전진해 B의 실제 POST가 막 나간 직후(B가 아직 saving 중일 때)에도 B의 saving 상태·초안·편집기·재조회를 전혀 건드리지 않는다", async () => {
  resetStores()
  let walletCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) walletCalls += 1
    return readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  }
  const postDeferreds = []
  postImpl = () => new Promise((resolve, reject) => { postDeferreds.push({ resolve, reject }) })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  const walletCallsBeforeConfirm = walletCalls

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // 사용자가 A의 응답을 기다리지 않고 편집기를 닫음
  rerender({ open: true }) // 즉시 다시 연다 — 세션 B 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.confirmStatus, "idle", "B는 아직 아무 것도 시작하지 않았으므로 idle이어야 한다")

  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(result.current.confirmStatus, "saving", "B가 시작한 저장은 saving 상태여야 한다")
  assert.equal(postDeferreds.length, 1, "B의 실제 전송은 A가 settle되기 전까지 큐에서 대기한다(직렬화)")

  await act(async () => {
    postDeferreds[0].reject(new TypeError("network disconnected"))
    await confirmAPromise
  })

  assert.equal(
    walletCalls,
    walletCallsBeforeConfirm,
    "이미 폐기된 세션 A의 거부는 재조회(fetchSummary)조차 시도하면 안 된다 — 진행 중인 B의 saving과 무관해야 한다",
  )
  for (let i = 0; i < 10 && postDeferreds.length < 2; i += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  assert.equal(postDeferreds.length, 2, "A가 settle된 뒤에야 B의 실제 POST가 나가야 한다")
  assert.equal(result.current.confirmStatus, "saving", "A의 뒤늦은 거부가 아직 완료되지 않은 B의 saving 상태를 해제하면 안 된다(핵심 회귀)")
  assert.equal(result.current.confirmError, null, "A의 뒤늦은 거부가 진행 중인 B 화면에 오류를 남기면 안 된다")
  assert.equal(closeCount, 0, "A의 뒤늦은 거부가 아직 진행 중인 B의 편집기를 닫으면 안 된다")
  assert.equal(result.current.draftBorderItemId, "profile-border-남작", "A의 뒤늦은 거부가 B의 진행 중인 초안을 되돌리면 안 된다")

  await act(async () => {
    postDeferreds[1].resolve({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })

  assert.equal(result.current.confirmStatus, "idle", "B 자신의 완료는 정상적으로 saving을 해제해야 한다")
  assert.equal(closeCount, 1, "오직 B의 완료만 B의 편집기를 닫아야 한다")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작", "마지막으로 확정된 값(B)이 최종 장착 상태여야 한다")
})

test("F-13 AC-02(CODEX-6): 세션 A의 거부로 시작된 재조회(fetchSummary)가 아직 끝나지 않은 상태에서 편집기를 닫았다 다시 열어 세션 B가 저장을 시작해 먼저 확정되면, A가 시작한(더 먼저 시작된) 재조회가 뒤늦게 끝나도 이미 확정된 B의 값과 화면을 덮어쓰지 않는다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  const postDeferreds = []
  postImpl = () => new Promise((resolve, reject) => { postDeferreds.push({ resolve, reject }) })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  const walletDeferreds = []
  getImpl = (endpoint) => new Promise((resolve) => {
    if (endpoint.endsWith("/wallet")) {
      walletDeferreds.push(() => resolve(walletOk))
    } else {
      walletDeferreds.push(() => resolve({
        entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
        loadout: { selectedProfileBorderId: "profile-border-평민" },
      }))
    }
  })

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)
  await act(async () => { postDeferreds[0].reject(new TypeError("network disconnected")) })
  for (let i = 0; i < 10 && walletDeferreds.length < 2; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(walletDeferreds.length, 2, "A의 거부는 서버 상태를 재조회해야 한다(응답 유실)")
  assert.equal(result.current.confirmStatus, "saving", "재조회가 끝나기 전까지는 아직 A 자신의 handleConfirm이 진행 중이다")

  rerender({ open: false }) // A의 재조회가 아직 끝나지 않은 채로 편집기를 닫음
  rerender({ open: true }) // 세션 B 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.confirmStatus, "idle", "B는 아직 아무 것도 시작하지 않았으므로 idle이어야 한다")

  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 2)
  await act(async () => {
    postDeferreds[1].resolve({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
  assert.equal(closeCount, 1, "B 자신의 완료는 정상적으로 편집기를 닫아야 한다")

  await act(async () => {
    walletDeferreds.forEach((resolve) => resolve())
    await confirmAPromise
  })

  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "A가 더 먼저 시작시킨 재조회가 뒤늦게 끝나도 이미 확정된 더 최신 시도(B)의 값을 덮어쓰면 안 된다",
  )
  assert.equal(result.current.confirmStatus, "idle", "A의 뒤늦은 재조회 완료가 이미 정착된 B의 화면 상태를 되돌리면 안 된다")
  assert.equal(result.current.confirmError, null, "A의 뒤늦은 재조회 완료가 B 화면에 오류를 남기면 안 된다")
  assert.equal(closeCount, 1, "A의 뒤늦은 재조회 완료가 onClose를 추가로 부르면 안 된다")
})

test("F-13 AC-02 CODEX-7: B가 saving인 동안 A의 재조회 완료는 B 상태와 초안을 유지하고 B만 닫는다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  const postDeferreds = []
  postImpl = () => new Promise((resolve, reject) => { postDeferreds.push({ resolve, reject }) })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  const walletDeferreds = []
  getImpl = (endpoint) => new Promise((resolve) => {
    if (endpoint.endsWith("/wallet")) {
      walletDeferreds.push(() => resolve(walletOk))
    } else {
      walletDeferreds.push(() => resolve({
        entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
        loadout: { selectedProfileBorderId: "profile-border-평민" },
      }))
    }
  })

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)
  await act(async () => { postDeferreds[0].reject(new TypeError("network disconnected")) })
  for (let i = 0; i < 10 && walletDeferreds.length < 2; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(walletDeferreds.length, 2, "A의 거부는 서버 상태를 재조회해야 한다(응답 유실)")
  assert.equal(result.current.confirmStatus, "saving", "재조회가 끝나기 전까지는 아직 A 자신의 handleConfirm이 진행 중이다")

  rerender({ open: false }) // A의 재조회가 아직 끝나지 않은 채로 편집기를 닫음
  rerender({ open: true }) // 세션 B 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.confirmStatus, "idle", "B는 아직 아무 것도 시작하지 않았으므로 idle이어야 한다")

  act(() => {
    result.current.setDraftPhotoItemId("player-profile-기사")
    result.current.setDraftBorderItemId("profile-border-남작")
  })
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 2)
  assert.equal(result.current.confirmStatus, "saving")
  await act(async () => {
    walletDeferreds.forEach((resolve) => resolve())
    await confirmAPromise
  })
  assert.equal(result.current.confirmStatus, "saving", "A refresh must not settle pending B")
  assert.equal(result.current.confirmError, null)
  assert.equal(closeCount, 0, "A refresh must not close pending B")
  assert.equal(result.current.draftPhotoItemId, "player-profile-기사")
  assert.equal(result.current.draftBorderItemId, "profile-border-남작")
  assert.equal(useEconomyStore.getState().status, "ready")
  await act(async () => {
    postDeferreds[1].resolve({ loadout: {
      selectedProfilePhotoId: "player-profile-기사",
      selectedProfileBorderId: "profile-border-남작",
    } })
    await confirmBPromise
  })
  assert.equal(useEconomyStore.getState().loadout.selectedProfilePhotoId, "player-profile-기사")
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "A가 더 먼저 시작시킨 재조회가 뒤늦게 끝나도 이미 확정된 더 최신 시도(B)의 값을 덮어쓰면 안 된다",
  )
  assert.equal(result.current.confirmStatus, "idle", "A의 뒤늦은 재조회 완료가 이미 정착된 B의 화면 상태를 되돌리면 안 된다")
  assert.equal(result.current.confirmError, null, "A의 뒤늦은 재조회 완료가 B 화면에 오류를 남기면 안 된다")
  assert.equal(closeCount, 1, "A의 뒤늦은 재조회 완료가 onClose를 추가로 부르면 안 된다")
})


test("F-13 AC-02/AC-04/A-08: 응답 유실 재조회를 기다리는 동안 계정이 바뀌면, 이전 계정의 재조회 결과로 지금 계정 화면을 덮어쓰지 않는다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  postImpl = async () => { throw new TypeError("network disconnected") }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let confirmPromise
  act(() => { confirmPromise = result.current.handleConfirm() })
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-브론즈" })(endpoint)
  setCurrentUser({ uuid: "user-2" }) // 저장·재조회가 끝나기 전에 계정 전환 — economy store가 reset되고 generation이 올라간다

  await act(async () => { await confirmPromise })

  assert.equal(result.current.confirmStatus, "idle")
  assert.equal(useEconomyStore.getState().requestGeneration >= 1, true, "계정 전환은 generation을 올려 이전 계정 응답을 무효화한다")
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-브론즈",
    "폐기된 A 계정의 재조회 결과(평민)를 버리는 것에서 그치지 않고, 지금 계정(B)이 실제로 응답한 값으로 정확히 채워져야 한다",
  )
})

test("F-13 AC-04: 편집기를 닫고 다른 계정으로 전환한 뒤 다시 열면, 이전 계정의 캐시가 아니라 새 계정이 실제로 서버에서 조회한 장착값·보유 목록으로 복원된다", async () => {
  resetStores()
  const dataByUser = {
    "user-1": {
      loadout: { selectedProfilePhotoId: "player-profile-기사", selectedProfileBorderId: "profile-border-평민" },
      entitlements: [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }],
    },
    "user-2": {
      loadout: { selectedProfilePhotoId: "player-profile-드워프", selectedProfileBorderId: "profile-border-귀족" },
      entitlements: [
        { itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" },
        { itemId: "profile-border-남작", itemType: "PROFILE_BORDER" },
      ],
    },
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? walletOk : dataByUser[currentUser.uuid])
  postImpl = async () => { throw new Error("이 테스트는 확인을 호출하지 않는다") }

  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => {} }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.equal(result.current.draftPhotoItemId, "player-profile-기사")
  assert.equal(result.current.draftBorderItemId, "profile-border-평민")
  assert.deepEqual(result.current.ownedBorderOptions.map((o) => o.itemId), ["profile-border-평민"])

  rerender({ open: false }) // 편집기를 닫음
  setCurrentUser({ uuid: "user-2" }) // 다른 계정으로 전환(로그인 세션 교체와 동일한 store reset 경로)
  rerender({ open: true }) // 새 계정으로 편집기를 다시 염

  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.equal(
    result.current.draftPhotoItemId,
    "player-profile-드워프",
    "새 계정의 실제 장착 사진이어야 한다(이전 계정의 기사가 캐시로 남으면 안 된다)",
  )
  assert.equal(
    result.current.draftBorderItemId,
    "profile-border-귀족",
    "새 계정의 실제 장착값이어야 한다(이전 계정의 평민이 캐시로 남으면 안 된다)",
  )
  assert.deepEqual(
    result.current.ownedBorderOptions.map((o) => o.itemId).sort(),
    ["profile-border-귀족", "profile-border-남작"],
    "이전 계정(user-1)의 보유 목록이 새 계정 목록에 섞이면 안 된다",
  )
})

test("F-13 AC-04: 로그아웃 후 재로그인하면 편집기는 로그아웃 이전의 캐시가 아니라 재로그인한 계정이 실제로 서버에서 조회한 값(사진·테두리 모두)으로 복원된다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
      loadout: { selectedProfilePhotoId: "player-profile-그림자", selectedProfileBorderId: "profile-border-귀족" },
    })
  postImpl = async () => { throw new Error("이 테스트는 확인을 호출하지 않는다") }

  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => {} }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.equal(result.current.draftPhotoItemId, "player-profile-그림자")
  assert.equal(result.current.draftBorderItemId, "profile-border-귀족")

  rerender({ open: false })
  setCurrentUser(null) // 로그아웃 — economy store가 초기 상태로 reset된다
  rerender({ open: true })
  await waitFor(() => assert.equal(useEconomyStore.getState().status, "error"), { timeout: 1000 }) // resolveUserId 가드: 로그인 필요

  rerender({ open: false })
  setCurrentUser({ uuid: "user-1" }) // 재로그인(같은 계정)
  rerender({ open: true })

  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.equal(result.current.draftPhotoItemId, "player-profile-그림자", "재로그인 후 로그아웃 이전 캐시가 아니라 서버의 실제 사진 값으로 복원되어야 한다")
  assert.equal(result.current.draftBorderItemId, "profile-border-귀족", "재로그인 후 로그아웃 이전 캐시가 아니라 서버의 실제 테두리 값으로 복원되어야 한다")
  assert.deepEqual(result.current.ownedBorderOptions.map((o) => o.itemId), ["profile-border-귀족"])
})

test("F-13 AC-03: 구매 직후(economy store의 purchase가 이미 entitlements를 다시 읽어옴) 편집기를 다시 열지 않아도 새로 산 테두리가 즉시 선택 목록에 나타난다", async () => {
  resetStores()
  let entitlementsCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return walletOk
    entitlementsCalls += 1
    return {
      entitlements: entitlementsCalls === 1
        ? [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }]
        : [
          { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" },
          { itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }, // 방금 구매한 상품
        ],
      loadout: { selectedProfileBorderId: "profile-border-평민" },
    }
  }
  postImpl = async (endpoint) => {
    if (endpoint === "/economy/purchase") return { entitlement: { itemId: "profile-border-귀족" } }
    throw new Error(`unexpected post ${endpoint}`)
  }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.deepEqual(result.current.ownedBorderOptions.map((o) => o.itemId), ["profile-border-평민"])

  await act(async () => { await useEconomyStore.getState().purchase({ itemId: "profile-border-귀족" }) })

  assert.deepEqual(
    result.current.ownedBorderOptions.map((o) => o.itemId).sort(),
    ["profile-border-귀족", "profile-border-평민"],
    "구매가 성공하면 편집기를 다시 열지 않아도 목록에 즉시 반영되어야 한다",
  )
})

test("F-13 AC-03(CODEX-2): 실제 useAchievements 훅을 마운트해 실제 업적 조회 성공(그 훅 내부의 syncEconomyIfSuccess)이 economy를 갱신하면, 열려 있는 편집기의 선택 목록에도 즉시 반영된다 — fetchSummary를 직접 호출해 흉내내지 않는다", async () => {
  resetStores()
  let entitlementsCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return walletOk
    entitlementsCalls += 1
    return {
      entitlements: entitlementsCalls === 1
        ? [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }]
        : [
          { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" },
          { itemId: "profile-border-광대", itemType: "PROFILE_BORDER" }, // 방금 업적으로 획득한 상품
        ],
      loadout: { selectedProfileBorderId: "profile-border-평민" },
    }
  }
  getMyAchievementsImpl = async () => ([
    { id: "invited-guests-노블-win-10", current: 10, threshold: 10, achieved: true, granted: true },
  ])

  const editor = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(editor.result.current.borderListStatus, "ready"))
  assert.deepEqual(editor.result.current.ownedBorderOptions.map((o) => o.itemId), ["profile-border-평민"])
  const walletCallsBeforeAchievements = entitlementsCalls

  const achievementsHook = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(achievementsHook.result.current.status, "success"), { timeout: 1000 })

  await waitFor(() => assert.deepEqual(
    editor.result.current.ownedBorderOptions.map((o) => o.itemId).sort(),
    ["profile-border-광대", "profile-border-평민"],
  ), { timeout: 1000 })
  assert.ok(entitlementsCalls > walletCallsBeforeAchievements, "실제 업적 조회 성공이 economy 재조회를 스스로 유발해야 한다(테스트가 대신 호출한 것이 아니다)")
})

test("F-13 AC-03(설계 감사, 2026-09-11): 편집기 마운트가 시작시킨(더 오래된) 초기 조회가 실제 useAchievements 성공이 유발한(더 최신) 조회보다 늦게 응답해도, 방금 획득한 테두리가 선택 목록에서 다시 사라지지 않는다", async () => {
  resetStores()
  const initialGetDeferreds = []
  getImpl = (endpoint) => new Promise((resolve) => { initialGetDeferreds.push({ endpoint, resolve }) })

  const editor = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(initialGetDeferreds.length, 2))
  assert.equal(editor.result.current.borderListStatus, "loading", "초기 조회가 아직 응답하지 않았으므로 loading이어야 한다")

  getMyAchievementsImpl = async () => ([
    { id: "invited-guests-노블-win-10", current: 10, threshold: 10, achieved: true, granted: true },
  ])
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [
        { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" },
        { itemId: "profile-border-광대", itemType: "PROFILE_BORDER" }, // 방금 업적으로 획득
      ],
      loadout: { selectedProfileBorderId: "profile-border-평민" },
    })
  const achievementsHook = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(achievementsHook.result.current.status, "success"), { timeout: 1000 })
  await waitFor(() => assert.deepEqual(
    editor.result.current.ownedBorderOptions.map((o) => o.itemId).sort(),
    ["profile-border-광대", "profile-border-평민"],
  ), { timeout: 1000 })

  await act(async () => {
    initialGetDeferreds.forEach(({ endpoint, resolve }) => resolve(endpoint.endsWith("/wallet")
      ? walletOk
      : { entitlements: [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-평민" } }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  assert.deepEqual(
    editor.result.current.ownedBorderOptions.map((o) => o.itemId).sort(),
    ["profile-border-광대", "profile-border-평민"],
    "편집기 마운트가 시작시킨 더 오래된 조회의 뒤늦은 응답이 실제 업적 갱신으로 이미 반영된 소유 목록을 되돌리면 안 된다",
  )
})

test("F-13 AC-03(CODEX-4): 실제 ProfileEditOptionGrid를 마운트하면 사진 탭은 16종 실제 이미지 전부를, 테두리 탭은 방금 업적으로 획득한 테두리를 실제 DOM 옵션으로 보여준다 — 훅 필드가 아니라 렌더된 화면 자체를 검증한다", async () => {
  resetStores()
  let entitlementsCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return walletOk
    entitlementsCalls += 1
    return {
      entitlements: entitlementsCalls === 1
        ? [...allDefaultPhotoEntitlements, { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }]
        : [
          ...allDefaultPhotoEntitlements,
          { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" },
          { itemId: "profile-border-광대", itemType: "PROFILE_BORDER" }, // 방금 업적으로 획득
        ],
      loadout: { selectedProfileBorderId: "profile-border-평민" },
    }
  }
  getMyAchievementsImpl = async () => ([
    { id: "invited-guests-광대-win-10", current: 10, threshold: 10, achieved: true, granted: true },
  ])

  const editor = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(editor.result.current.borderListStatus, "ready"))

  const renderGrid = () => render(React.createElement(ProfileEditOptionGrid, {
    activeTab: editor.result.current.activeTab,
    ownedPhotoOptions: editor.result.current.ownedPhotoOptions,
    photoListStatus: editor.result.current.photoListStatus,
    selectedPhotoItemId: editor.result.current.draftPhotoItemId,
    onSelectPhoto: editor.result.current.setDraftPhotoItemId,
    onRetryLoadPhotos: editor.result.current.retryLoadPhotos,
    ownedBorderOptions: editor.result.current.ownedBorderOptions,
    borderListStatus: editor.result.current.borderListStatus,
    selectedBorderItemId: editor.result.current.draftBorderItemId,
    onSelectBorder: editor.result.current.setDraftBorderItemId,
    onRetryLoadBorders: editor.result.current.retryLoadBorders,
  }))

  const photoGrid = renderGrid()
  const photoImgs = [...photoGrid.container.querySelectorAll("img")]
  assert.equal(photoImgs.length, PROFILE_EDIT_PHOTO_OPTIONS.length, "사진 옵션이 서버 카탈로그 16종과 어긋나면 안 된다")
  for (const { src } of PROFILE_EDIT_PHOTO_OPTIONS) {
    const expected = encodeURI(src.normalize("NFC"))
    assert.ok(photoImgs.some((img) => img.getAttribute("src") === expected), `사진 옵션 ${src}가 실제 DOM에 없다`)
  }
  const selectedPhotoButton = photoGrid.container.querySelector('button[aria-pressed="true"]')
  assert.ok(selectedPhotoButton?.querySelector("img"), "현재 선택된 사진 옵션이 실제로 선택 표시되어야 한다")
  photoGrid.unmount()

  act(() => editor.result.current.setActiveTab(PROFILE_EDIT_TAB_BORDER))
  const beforeGrid = renderGrid()
  assert.equal(beforeGrid.container.querySelectorAll("img").length, 1, "업적 획득 전에는 평민 테두리 하나만 실제 옵션으로 보여야 한다")
  beforeGrid.unmount()

  const achievementsHook = renderHook(() => useAchievements())
  await waitFor(() => assert.equal(achievementsHook.result.current.status, "success"), { timeout: 1000 })
  await waitFor(() => assert.equal(editor.result.current.ownedBorderOptions.length, 2), { timeout: 1000 })

  const afterGrid = renderGrid()
  const borderImgs = [...afterGrid.container.querySelectorAll("img")]
  assert.equal(borderImgs.length, 2, "업적으로 방금 획득한 테두리가 재오픈 없이도 실제 DOM 옵션에 즉시 추가되어야 한다")
  const expectedNewBorderSrc = encodeURI("/shopItem/player- profileborder/프로필프레임-광대.png".normalize("NFC"))
  assert.ok(borderImgs.some((img) => img.getAttribute("src") === expectedNewBorderSrc), "방금 업적으로 획득한 테두리 이미지가 실제 DOM에 없다")
  afterGrid.unmount()
})

test("F-13 AC-03(CODEX-5): 사진 탭도 테두리 탭과 같은 계약을 따른다 — 정적 목록이 아니라 실제 entitlements에서 보유한 사진만 실제 DOM 옵션으로 보이고, 보유하지 않은 사진은 보이지 않는다", async () => {
  resetStores()
  const ownedPhotoIds = ["player-profile-기사", "player-profile-드워프"]
  const unownedPhotoIds = PROFILE_EDIT_PHOTO_OPTIONS
    .map((o) => o.itemId)
    .filter((itemId) => !ownedPhotoIds.includes(itemId))
  assert.ok(unownedPhotoIds.length > 0, "이 시험이 의미가 있으려면 미보유 사진이 최소 하나는 있어야 한다")

  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [
        ...ownedPhotoIds.map((itemId) => ({ itemId, itemType: PROFILE_PHOTO_ITEM_TYPE })),
        { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" },
      ],
      loadout: { selectedProfilePhotoId: "player-profile-기사", selectedProfileBorderId: "profile-border-평민" },
    })

  const editor = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(editor.result.current.photoListStatus, "ready"))
  assert.deepEqual(
    editor.result.current.ownedPhotoOptions.map((o) => o.itemId).sort(),
    [...ownedPhotoIds].sort(),
    "보유하지 않은 사진이 ownedPhotoOptions에 섞이면 안 된다",
  )

  const { container } = render(React.createElement(ProfileEditOptionGrid, {
    activeTab: editor.result.current.activeTab,
    ownedPhotoOptions: editor.result.current.ownedPhotoOptions,
    photoListStatus: editor.result.current.photoListStatus,
    selectedPhotoItemId: editor.result.current.draftPhotoItemId,
    onSelectPhoto: editor.result.current.setDraftPhotoItemId,
    onRetryLoadPhotos: editor.result.current.retryLoadPhotos,
    ownedBorderOptions: editor.result.current.ownedBorderOptions,
    borderListStatus: editor.result.current.borderListStatus,
    selectedBorderItemId: editor.result.current.draftBorderItemId,
    onSelectBorder: editor.result.current.setDraftBorderItemId,
    onRetryLoadBorders: editor.result.current.retryLoadBorders,
  }))

  const photoImgs = [...container.querySelectorAll("img")]
  assert.equal(photoImgs.length, ownedPhotoIds.length, "실제 DOM 옵션 수는 보유한 사진 수와 정확히 같아야 한다")
  for (const itemId of ownedPhotoIds) {
    const { src } = PROFILE_EDIT_PHOTO_OPTIONS.find((o) => o.itemId === itemId)
    const expected = encodeURI(src.normalize("NFC"))
    assert.ok(photoImgs.some((img) => img.getAttribute("src") === expected), `보유한 사진 ${itemId}가 실제 DOM에 없다`)
  }
  for (const itemId of unownedPhotoIds) {
    const { src } = PROFILE_EDIT_PHOTO_OPTIONS.find((o) => o.itemId === itemId)
    const forbidden = encodeURI(src.normalize("NFC"))
    assert.ok(!photoImgs.some((img) => img.getAttribute("src") === forbidden), `보유하지 않은 사진 ${itemId}가 실제 DOM 옵션에 보이면 안 된다`)
  }
})
