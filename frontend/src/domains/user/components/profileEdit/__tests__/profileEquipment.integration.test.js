import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { register } from "node:module"
import React from "react"

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

// F-13 AC-03(CODEX-4): "실제 옵션 렌더링 근거"를 남기려면 ProfileEditOptionGrid.jsx를 이
// 저장소의 node:test 실행에서 실제로 import·마운트할 수 있어야 한다 — 이 파일은 .js라
// vite alias·JSX 변환을 직접 풀 수 없는(이 저장소 관례) 제약이 있다. 이미
// frontend/.../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs가 이 제약을 없애는
// module.register() ESM 훅(oxc 변환 + "@/" alias 해석, production 코드 변경 없음)을
// 만들어 뒀으므로 새 하네스를 또 만들지 않고 그대로 재사용한다.
register(new URL("../../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
// F-13 AC-03(CODEX-2) — 업적 조회 성공에서 economy 갱신을 유발하는 실제 연결(useAchievements.js의
// syncEconomyIfSuccess)을 직접 fetchSummary를 호출해 흉내내지 않고 실제 훅을 마운트해
// 증명하려면, 그 훅이 실제로 부르는 진입점(getMyAchievementsApi)만 useAchievements.test.js와
// 동일한 방식으로 가로챈다 — achievements.api.js는 @/shared/api/client 별칭을 쓰므로(이
// 저장소의 node:test 실행에서 별칭이 해석되지 않는다) 그 안쪽이 아니라 이 모듈 전체를
// 대체한다.
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

// F-13 AC-03 재검토(CODEX-5): ownedPhotoOptions는 이제 정적 배열이 아니라 서버
// entitlements에서 유도되므로(ownedBorderOptions와 같은 계약), 실제 계정이 보유한 사진
// entitlement 행을 흉내낼 공용 fixture가 필요하다 — 지금 카탈로그의 16종은 전부 기본 지급
// (defaultGrant:true)이므로 "모든 계정이 항상 전부 보유"를 흉내낼 때는 이 전체 목록을 쓴다.
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

test("F-13 AC-02(CODEX-4): 저장 응답을 기다리는 동안 편집기를 닫고 다시 열지 않으면, 뒤늦게 도착한 성공 응답을 취소로 취급하지 않고 실제로 서버에 확정된 값을 store에 그대로 반영하며 onClose를 다시 부르지 않는다", async () => {
  // CODEX-4 반송 근거: "close without reopen" 시나리오 자체가 시험에 없었고, "서버가 실제로
  // 확정한 저장을 취소처럼 취급하면 안 된다"(진짜 서버 상태를 일관되게 보존)는 지시를
  // 검증할 증거가 없었다. economy.store.js의 equipProfile은 계정 세대(requestGeneration)만
  // 검사하므로(같은 계정 안에서 편집기를 닫기만 한 것은 세대를 바꾸지 않는다) 뒤늦은 성공은
  // store.loadout에 실제로 반영되어야 한다 — 이 훅의 세션 무효화(editorSessionRef)는 오직
  // "지금 화면(이 훅 인스턴스)"의 UI 상태(confirmStatus/onClose)만 억제할 뿐, 이미 서버에
  // 커밋된 진실 자체를 감추거나 되돌리지 않는다.
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
  // CODEX-2 반송 근거: useProfileBorderEditor.handleConfirm의 isStale() 분기가 한때
  // setConfirmStatus("idle")을 실행해, 이미 폐기된 세션(A)의 응답이 새로 연 세션(B)의
  // 진행 중인 saving 상태를 실수로 idle로 되돌릴 수 있었다(B가 저장을 시작조차 하지 않은
  // 채로 남는 회귀). 위 CODEX-1 테스트는 B가 아직 아무 것도 시작하지 않은 상태만 검증했다
  // — 이 테스트는 B도 실제로 handleConfirm을 호출해 saving 중인 상태에서 A의 응답이
  // 도착하는, 지시서가 명시한 정확한 시나리오를 고정한다. economy.store.js의 equipProfile은
  // 계정 세대(requestGeneration)만 검사하므로(같은 계정 안에서의 편집기 재오픈은 세대가
  // 바뀌지 않는다) A의 성공은 store.loadout 자체는 정상적으로 반영한다 — 이 테스트가
  // 검증하는 것은 store가 아니라 "지금 화면(이 훅 인스턴스)의 UI 상태"가 A가 아니라
  // 오직 B에 의해서만 정착되어야 한다는 것이다.
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

  // 세션 A: 귀족으로 확정 시도, 응답 대기 상태로 둔다.
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(result.current.confirmStatus, "saving")
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // 사용자가 A의 응답을 기다리지 않고 편집기를 닫음
  rerender({ open: true }) // 즉시 다시 연다 — 세션 B 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.draftBorderItemId, "profile-border-평민", "B의 초안은 실제 장착값으로 리셋되어야 한다")
  assert.equal(result.current.confirmStatus, "idle", "B는 아직 아무 것도 시작하지 않았으므로 idle이어야 한다")

  // 세션 B: 남작으로 확정 시도, 역시 응답 대기 상태로 둔다 — 지금 A와 B 둘 다 saving 중인
  // 요청이 있다(핵심 시나리오: "session B save pending").
  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(result.current.confirmStatus, "saving", "B가 시작한 저장은 saving 상태여야 한다")
  assert.equal(postDeferreds.length, 2, "A와 B 각각 정확히 한 번씩 POST가 나가야 한다")

  // A의 응답이 이제 뒤늦게 성공으로 도착한다 — 이미 폐기된 세션의 완료다.
  await act(async () => {
    postDeferreds[0].resolve({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
    await confirmAPromise
  })

  assert.equal(result.current.confirmStatus, "saving", "A의 완료는 진행 중인 B의 saving 상태를 해제하면 안 된다(이전 반송 지적의 회귀)")
  assert.equal(result.current.confirmError, null, "A의 완료가 B 화면에 오류를 남기면 안 된다")
  assert.equal(closeCount, 0, "A의 완료는 B 세션의 편집기를 닫으면 안 된다")
  assert.equal(result.current.draftBorderItemId, "profile-border-남작", "A의 완료가 B의 진행 중인 초안을 되돌리면 안 된다")

  // B의 응답이 도착(성공)하면 그제서야 B 자신이 정착한다.
  await act(async () => {
    postDeferreds[1].resolve({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })

  assert.equal(result.current.confirmStatus, "idle", "B 자신의 완료는 정상적으로 saving을 해제해야 한다")
  assert.equal(closeCount, 1, "오직 B의 완료만 B의 편집기를 닫아야 한다")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작", "마지막으로 확정된 값(B)이 최종 장착 상태여야 한다")
})

test("F-13 AC-02(CODEX-5): 세션 B가 세션 A보다 먼저 확정돼도, A의 뒤늦은 성공(역전된 완료 순서)이 이미 확정된 B의 값을 store에서 되돌리지 않는다(CODEX-2 시험의 반대 순서)", async () => {
  // CODEX-5 반송 근거: 지금까지의 시험은 전부 A가 B보다 먼저 완료되는 순서만 검증했다 —
  // "완료 순서가 아니라 시작 순서로 승자를 가른다"는 계약은 순서를 뒤집어도(B가 먼저
  // 확정되고 A가 그 뒤에 뒤늦게 성공으로 도착해도) 성립해야 증명된다. economy.store.js의
  // loadoutAttemptSeq 가드가 실제로 이 역전된 순서에서도 store.loadout을 지키는지 훅을
  // 통해 끝까지 확인한다.
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

  // 세션 A: 귀족으로 확정 시도, 응답 대기 상태로 둔다.
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // A의 응답을 기다리지 않고 닫음
  rerender({ open: true }) // 세션 B 시작

  // 세션 B: 남작으로 확정 시도, 먼저 응답을 받아 확정된다.
  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 2)

  await act(async () => {
    postDeferreds[1]({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
  assert.equal(closeCount, 1, "B 자신의 완료만 편집기를 닫아야 한다")

  // A(더 먼저 시작된 세션)가 그제서야 뒤늦게 성공으로 도착한다.
  await act(async () => {
    postDeferreds[0]({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
    await confirmAPromise
  })

  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "완료 순서가 역전돼도(B가 먼저 확정) A의 뒤늦은 성공이 이미 확정된 B의 값을 덮어쓰면 안 된다",
  )
  assert.equal(closeCount, 1, "이미 폐기된 세션 A의 뒤늦은 완료가 onClose를 추가로 부르면 안 된다")
})

test("F-13 AC-02(CODEX-5): 세션 A가 저장 응답 대기 중 편집기를 닫았다 다시 열어 세션 B가 저장을 시작해 먼저 확정되면, A의 뒤늦은 거부(전송 불확실)가 도착해도 이미 확정된 B의 값과 편집기 상태를 전혀 건드리지 않는다", async () => {
  // 계획 메모 지시 시나리오 — "A pending -> close/reopen -> B saving -> A late reject/refresh
  // completion -> B success"를 실제 훅으로 끝까지 재현한다. A의 거부는 editorSessionRef가
  // 이미 무효화한 뒤 도착하므로 isStale()이 fetchSummary 호출 자체를 막아야 한다(재조회조차
  // 시도하면 안 된다 — 이미 위 CODEX-4 시험이 단일 세션 안에서는 고정했지만, 여기서는 그
  // 사이 실제로 다른 세션(B)이 저장을 확정한 뒤에도 똑같이 성립하는지 확인한다).
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

  // 세션 A: 귀족으로 확정 시도, 응답 대기.
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // 닫음
  rerender({ open: true }) // 세션 B 시작

  // 세션 B: 남작으로 확정 시도, 먼저 확정된다.
  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 2)
  await act(async () => {
    postDeferreds[1].resolve({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
  assert.equal(closeCount, 1)

  // A의 저장이 이제야 거부(code 없음, 전송 불확실)로 도착한다 — 이미 폐기된 세션의 완료다.
  await act(async () => {
    postDeferreds[0].reject(new TypeError("network disconnected"))
    await confirmAPromise
  })

  assert.equal(
    walletCalls,
    walletCallsBeforeConfirm,
    "이미 폐기된 세션 A의 거부는 재조회(fetchSummary)조차 시도하면 안 된다(isStale()이 fetchSummary보다 먼저 확인된다)",
  )
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "A의 뒤늦은 거부가 이미 확정된 B의 값을 덮어쓰면 안 된다",
  )
  assert.equal(result.current.confirmStatus, "idle")
  assert.equal(result.current.confirmError, null, "폐기된 세션의 거부가 지금 화면(B)에 오류를 남기면 안 된다")
  assert.equal(closeCount, 1, "A의 뒤늦은 완료가 onClose를 추가로 부르면 안 된다")
})

test("F-13 AC-02(CODEX-6): 세션 A가 저장 응답을 기다리는 동안 편집기를 닫았다 다시 열어 세션 B가 저장을 시작해 아직 saving 중일 때(B 완료 이전), A의 뒤늦은 거부(전송 불확실)가 도착해도 진행 중인 B의 saving 상태·초안·편집기·재조회를 전혀 건드리지 않는다", async () => {
  // CODEX-6 반송 근거: 위 CODEX-5 시험은 A의 뒤늦은 거부가 "B가 이미 확정된 뒤"에만
  // 도착하는 순서만 검증했다 — 계획 메모가 명시한 "session B save pending"(B가 아직
  // saving 중일 때 A의 거부가 도착) 순서는 어느 시험도 재현하지 않았다. isStale()이
  // editorSessionRef만으로 판정되므로 이 순서 자체는 위 CODEX-2(A의 성공 버전)와 동일한
  // 보호를 받아야 하지만, "A의 응답이 거부(재조회 시도)"라는 점에서 그 재조회 시도조차
  // B의 saving을 건드리면 안 된다는 것을 별도로 고정해야 한다.
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

  // 세션 A: 귀족으로 확정 시도, 응답 대기 상태로 둔다.
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)

  rerender({ open: false }) // 사용자가 A의 응답을 기다리지 않고 편집기를 닫음
  rerender({ open: true }) // 즉시 다시 연다 — 세션 B 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.confirmStatus, "idle", "B는 아직 아무 것도 시작하지 않았으므로 idle이어야 한다")

  // 세션 B: 남작으로 확정 시도, 응답 대기 상태로 둔다 — 지금 A와 B 둘 다 아직 완료되지
  // 않은 saving 요청이 있다(핵심 시나리오: "session B save pending").
  act(() => result.current.setDraftBorderItemId("profile-border-남작"))
  let confirmBPromise
  act(() => { confirmBPromise = result.current.handleConfirm() })
  assert.equal(result.current.confirmStatus, "saving", "B가 시작한 저장은 saving 상태여야 한다")
  assert.equal(postDeferreds.length, 2, "A와 B 각각 정확히 한 번씩 POST가 나가야 한다")

  // A의 저장이 이제 뒤늦게 거부(code 없음, 전송 불확실)로 도착한다 — B는 아직 완료되지
  // 않았다(B의 POST는 여전히 응답 대기 중이다).
  await act(async () => {
    postDeferreds[0].reject(new TypeError("network disconnected"))
    await confirmAPromise
  })

  assert.equal(
    walletCalls,
    walletCallsBeforeConfirm,
    "이미 폐기된 세션 A의 거부는 재조회(fetchSummary)조차 시도하면 안 된다 — 진행 중인 B의 saving과 무관해야 한다",
  )
  assert.equal(result.current.confirmStatus, "saving", "A의 뒤늦은 거부가 아직 완료되지 않은 B의 saving 상태를 해제하면 안 된다(핵심 회귀)")
  assert.equal(result.current.confirmError, null, "A의 뒤늦은 거부가 진행 중인 B 화면에 오류를 남기면 안 된다")
  assert.equal(closeCount, 0, "A의 뒤늦은 거부가 아직 진행 중인 B의 편집기를 닫으면 안 된다")
  assert.equal(result.current.draftBorderItemId, "profile-border-남작", "A의 뒤늦은 거부가 B의 진행 중인 초안을 되돌리면 안 된다")

  // B의 응답이 이제 도착(성공)하면 그제서야 B 자신이 정상적으로 정착한다.
  await act(async () => {
    postDeferreds[1].resolve({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
    await confirmBPromise
  })

  assert.equal(result.current.confirmStatus, "idle", "B 자신의 완료는 정상적으로 saving을 해제해야 한다")
  assert.equal(closeCount, 1, "오직 B의 완료만 B의 편집기를 닫아야 한다")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작", "마지막으로 확정된 값(B)이 최종 장착 상태여야 한다")
})

test("F-13 AC-02(CODEX-6): 세션 A의 거부로 시작된 재조회(fetchSummary)가 아직 끝나지 않은 상태에서 편집기를 닫았다 다시 열어 세션 B가 저장을 시작해 먼저 확정되면, A가 시작한(더 먼저 시작된) 재조회가 뒤늦게 끝나도 이미 확정된 B의 값과 화면을 덮어쓰지 않는다", async () => {
  // CODEX-6 반송 근거: "earlier refresh completion" — 지금까지의 시험은 A 자신의 응답
  // (성공이든 거부든)이 뒤늦게 도착하는 경우만 다뤘다. 이 시험은 A가 아직 유효한 세션일
  // 때 스스로 시작시킨 재조회(fetchSummary, 응답 유실 뒤 서버 상태 확인)가 세션이 무효화된
  // *이후에도* 계속 진행 중이다가, 더 최신 시도(B)가 이미 확정된 뒤에야 뒤늦게 끝나는
  // 순서를 재현한다 — economy.store.js의 loadoutAttemptSeq 가드(store 레벨)와 훅의
  // isStale()(세션 레벨)이 함께 이 순서에서도 성립하는지 훅을 통해 끝까지 확인한다.
  resetStores()
  // 마운트 시 최초 조회는 즉시 풀리는 값으로 둔다 — 아래에서 제어할 deferred는 오직 A의
  // 거부가 유발하는 재조회(fetchSummary) 한 번뿐이어야 한다.
  getImpl = async (endpoint) => readyLoadout({ selectedProfileBorderId: "profile-border-평민" })(endpoint)
  const postDeferreds = []
  postImpl = () => new Promise((resolve, reject) => { postDeferreds.push({ resolve, reject }) })

  let closeCount = 0
  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => { closeCount += 1 } }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  // 최초 조회가 끝난 뒤부터는 GET을 제어 가능한 deferred로 바꿔, A의 거부가 유발하는
  // 재조회만 붙잡아둘 수 있게 한다.
  const walletDeferreds = []
  getImpl = (endpoint) => new Promise((resolve) => {
    if (endpoint.endsWith("/wallet")) {
      walletDeferreds.push(() => resolve(walletOk))
    } else {
      walletDeferreds.push(() => resolve({
        entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
        // A가 시작한 재조회가 실제로 돌려주는(오래된) 값 — B가 확정한 값과 달라야
        // "덮어쓰지 않는다"를 의미 있게 증명할 수 있다.
        loadout: { selectedProfileBorderId: "profile-border-평민" },
      }))
    }
  })

  // 세션 A: 귀족으로 확정 시도 — 응답은 거부(전송 불확실)라 자체적으로 재조회를 시작한다.
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  let confirmAPromise
  act(() => { confirmAPromise = result.current.handleConfirm() })
  assert.equal(postDeferreds.length, 1)
  await act(async () => { postDeferreds[0].reject(new TypeError("network disconnected")) })
  // handleConfirm의 catch가 isStale()을 먼저 확인하지만(아직 유효한 세션이므로 통과),
  // confirmedRejection이 아니라서 fetchSummary()를 실제로 호출한다 — 그 안의
  // Promise.all(api.get, api.get)이 등록될 때까지 매크로태스크 경계로 넘겨준다.
  for (let i = 0; i < 10 && walletDeferreds.length < 2; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(walletDeferreds.length, 2, "A의 거부는 서버 상태를 재조회해야 한다(응답 유실)")
  assert.equal(result.current.confirmStatus, "saving", "재조회가 끝나기 전까지는 아직 A 자신의 handleConfirm이 진행 중이다")

  rerender({ open: false }) // A의 재조회가 아직 끝나지 않은 채로 편집기를 닫음
  rerender({ open: true }) // 세션 B 시작(초안이 실제 장착값으로 리셋됨)
  assert.equal(result.current.confirmStatus, "idle", "B는 아직 아무 것도 시작하지 않았으므로 idle이어야 한다")

  // 세션 B: 남작으로 확정 시도, 먼저 확정된다(A의 재조회는 여전히 응답 대기 중이다).
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

  // A가 더 먼저 시작시킨 재조회가 이제야(B가 확정된 뒤에) 끝난다 — B보다 오래된 정보다.
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
  // CODEX-4 반송 근거: notEqual만으로는 "A의 값(평민)만 아니면 무엇이든 통과"하므로, B 계정의
  // 실제 서버 값이 반영됐는지는 증명하지 못한다(예: 빈 값·undefined·엉뚱한 다른 계정 값도
  // 전부 통과해버린다) — B 계정이 실제로 응답한 정확한 값(브론즈)과 정확히 같아야 한다.
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-브론즈",
    "폐기된 A 계정의 재조회 결과(평민)를 버리는 것에서 그치지 않고, 지금 계정(B)이 실제로 응답한 값으로 정확히 채워져야 한다",
  )
})

test("F-13 AC-04: 편집기를 닫고 다른 계정으로 전환한 뒤 다시 열면, 이전 계정의 캐시가 아니라 새 계정이 실제로 서버에서 조회한 장착값·보유 목록으로 복원된다", async () => {
  resetStores()
  // CODEX-4 반송 근거: 이 시험은 테두리 복원만 검증했고 사진 복원은 다루지 않았다 —
  // 사진 16종은 모두 기본 지급이라 보유 목록 자체는 계정마다 같지만, "지금 선택된" 사진
  // (loadout.selectedProfilePhotoId)은 계정마다 다를 수 있으므로 그 복원도 별도로 고정한다.
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
  // CODEX-2 반송 근거: 이전 버전은 useAchievements.js를 전혀 마운트하지 않고
  // useEconomyStore.getState().fetchSummary()를 테스트가 직접 호출해 "업적 → economy 갱신"
  // 연결 자체를 증명하지 못했다(그 연결이 끊어져도 이 직접 호출만으로는 테스트가 여전히
  // 통과한다). 이제 실제 useAchievements 훅을 renderHook으로 마운트하고, 그 훅이 실제로
  // 호출하는 getMyAchievementsApi(mock.module로 전송만 가로챈다, 위 useAchievements.test.js와
  // 동일한 관례)가 성공 응답을 돌려주게 해, 훅 내부의 실제 syncEconomyIfSuccess가 스스로
  // economy store를 갱신하는지를 검증한다.
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

test("F-13 AC-03(CODEX-4): 실제 ProfileEditOptionGrid를 마운트하면 사진 탭은 16종 실제 이미지 전부를, 테두리 탭은 방금 업적으로 획득한 테두리를 실제 DOM 옵션으로 보여준다 — 훅 필드가 아니라 렌더된 화면 자체를 검증한다", async () => {
  // CODEX-4 반송 근거: 지금까지의 AC-03 시험은 useProfileBorderEditor 훅이 돌려주는
  // ownedBorderOptions 배열(필드)만 확인했을 뿐, 실제 화면(ProfileEditOptionGrid.jsx)이 그
  // 값을 옵션으로 그리는지는 증명하지 않았다 — 사진 탭의 "실제 옵션 렌더링 근거"도 전혀
  // 없었다(정적 PROFILE_EDIT_PHOTO_OPTIONS를 실제로 그리는지 확인한 적이 없다). 이 시험은
  // 실제 훅 + 실제 컴포넌트 + 실제 업적 성공 이벤트를 전부 연결해 최종 DOM의 <img src>까지
  // 확인한다.
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

  // 사진 탭 — 정적이지만 실제로 16종 전부가, 실제 자산 경로로 렌더되는지 확인한다.
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

  // 테두리 탭 — 업적 성공 이전에는 아직 광대를 보유하지 않았다.
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
  // CODEX-5 반송 근거: 이전까지 사진 탭은 항상 PROFILE_EDIT_PHOTO_OPTIONS 정적 배열
  // 16종 전부를 그렸다 — 실제 서버가 응답한 entitlements와 무관했다(계정이 일부만
  // 보유해도, 심지어 하나도 보유하지 않아도 16장이 그대로 보였다). 이 시험은 계정이
  // 카탈로그 16종 중 일부만 실제로 보유한 상태를 흉내내, 실제 렌더된 DOM이 보유한
  // 사진만 옵션으로 보여주는지 확인한다(보유하지 않은 사진은 옵션 자체가 존재하지
  // 않아야 한다).
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
