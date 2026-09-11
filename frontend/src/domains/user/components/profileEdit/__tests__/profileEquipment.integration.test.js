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
  // CODEX-1 재검토: 이전 버전은 최초 조회부터 목표 장착값(귀족)을 돌려줘 저장이 아무것도
  // 바꾸지 않은 채로 "성공"처럼 보였다(borderChanged가 애초에 false가 되어 confirm이
  // postImpl조차 호출하지 않고 즉시 종료됨). 최초 조회(1회차)는 이전 장착값(평민)을,
  // confirm 실패 후의 재조회(2회차부터)는 서버가 실제로 확정한 새 값(귀족)을 돌려주게 해
  // "재조회가 실제로 상태를 바꿨다"를 증명한다.
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

test("F-13 AC-02/AC-04/A-08: 응답 유실 재조회를 기다리는 동안 계정이 바뀌면, 이전 계정의 재조회 결과로 지금 계정 화면을 덮어쓰지 않는다", async () => {
  resetStores()
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  postImpl = async () => { throw new TypeError("network disconnected") }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let confirmPromise
  act(() => { confirmPromise = result.current.handleConfirm() })
  // 계정 전환 이후에는(B 계정) 실제로 다른 값을 돌려주게 만든다 — A의 폐기된 재조회 결과가
  // 실수로 반영되면 A가 보던 값(평민)이 B 화면에 남게 된다.
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-브론즈" })(endpoint)
  setCurrentUser({ uuid: "user-2" }) // 저장·재조회가 끝나기 전에 계정 전환 — economy store가 reset되고 generation이 올라간다

  await act(async () => { await confirmPromise })

  assert.equal(result.current.confirmStatus, "idle")
  assert.equal(useEconomyStore.getState().requestGeneration >= 1, true, "계정 전환은 generation을 올려 이전 계정 응답을 무효화한다")
  assert.notEqual(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-평민",
    "폐기된 A 계정의 재조회 결과(평민)가 B 계정 화면에 캐시로 남으면 안 된다",
  )
})

test("F-13 AC-04: 편집기를 닫고 다른 계정으로 전환한 뒤 다시 열면, 이전 계정의 캐시가 아니라 새 계정이 실제로 서버에서 조회한 장착값·보유 목록으로 복원된다", async () => {
  resetStores()
  const dataByUser = {
    "user-1": {
      loadout: { selectedProfileBorderId: "profile-border-평민" },
      entitlements: [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }],
    },
    "user-2": {
      loadout: { selectedProfileBorderId: "profile-border-귀족" },
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
  assert.equal(result.current.draftBorderItemId, "profile-border-평민")
  assert.deepEqual(result.current.ownedBorderOptions.map((o) => o.itemId), ["profile-border-평민"])

  rerender({ open: false }) // 편집기를 닫음
  setCurrentUser({ uuid: "user-2" }) // 다른 계정으로 전환(로그인 세션 교체와 동일한 store reset 경로)
  rerender({ open: true }) // 새 계정으로 편집기를 다시 염

  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
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

test("F-13 AC-04: 로그아웃 후 재로그인하면 편집기는 로그아웃 이전의 캐시가 아니라 재로그인한 계정이 실제로 서버에서 조회한 값으로 복원된다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-귀족" } })
  postImpl = async () => { throw new Error("이 테스트는 확인을 호출하지 않는다") }

  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => {} }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.equal(result.current.draftBorderItemId, "profile-border-귀족")

  rerender({ open: false })
  setCurrentUser(null) // 로그아웃 — economy store가 초기 상태로 reset된다
  rerender({ open: true })
  await waitFor(() => assert.equal(useEconomyStore.getState().status, "error"), { timeout: 1000 }) // resolveUserId 가드: 로그인 필요

  rerender({ open: false })
  setCurrentUser({ uuid: "user-1" }) // 재로그인(같은 계정)
  rerender({ open: true })

  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.equal(result.current.draftBorderItemId, "profile-border-귀족", "재로그인 후 로그아웃 이전 캐시가 아니라 서버의 실제 값으로 복원되어야 한다")
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

test("F-13 AC-03: 업적 획득 후 서고 화면이 실제로 트리거하는 economy 재조회(useAchievements.js의 syncEconomyIfSuccess)가 도착하면, 열려 있는 편집기의 선택 목록에도 즉시 반영된다", async () => {
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

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  assert.deepEqual(result.current.ownedBorderOptions.map((o) => o.itemId), ["profile-border-평민"])

  // frontend/src/domains/library/hooks/useAchievements.js의 syncEconomyIfSuccess가 업적 조회
  // 성공 시 실제로 호출하는 진입점과 동일하다 — 그 훅을 다시 마운트하지 않고 그 훅이
  // 트리거하는 실제 economy store 진입점만 재사용해 실제 연결(업적 → economy 갱신 → 편집기
  // 목록)을 증명한다.
  await act(async () => { await useEconomyStore.getState().fetchSummary() })

  assert.deepEqual(
    result.current.ownedBorderOptions.map((o) => o.itemId).sort(),
    ["profile-border-광대", "profile-border-평민"],
    "업적 획득 후 economy 상태가 갱신되면 편집기를 다시 열지 않아도 목록에 즉시 반영되어야 한다",
  )
})
