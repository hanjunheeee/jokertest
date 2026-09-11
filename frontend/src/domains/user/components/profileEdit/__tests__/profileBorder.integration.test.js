import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"

// F-12(AC-06) 재검토 대응 — useAchievements.test.js와 같은 이유로 renderHook은 DOM
// 전역이 필요하다(useMyProfile.roleStatistics.test.js 관례).
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

// 이 훅이 ProfileEditOverlay.jsx가 실제로 그대로 쓰는 편집 로직이다 — Overlay 자체는
// MyPageLayout.jsx(이 슬라이스 범위 밖)에서 ".jsx"로 import되어 확장자를 바꿀 수 없고,
// node:test는 JSX 구문을 파싱하지 못한다(이 저장소 관례, ForbiddenRecordsUnlockCondition.js
// 참고). 이 훅을 직접 렌더 테스트하는 것이 곧 실제 편집 동작(소유 목록 유도, equipProfile
// 호출 계약, 실패·재시도, 중복 확인 방지)을 검증하는 것이다.
//
// F-13 재검토: 사진도 더 이상 프론트 전용 무료 편집이 아니다 — 사진·테두리 모두
// equipProfile(POST /economy/equip-profile) 하나로 확정되고, 바뀐 슬롯만 요청에 실린다.
//
// economy.store.js·profileCustomization.store.js는 실제 코드를 그대로 쓰고(둘 다 F-12
// 잠금 계약의 일부), API 경계와 auth store만 economy.store.test.js와 같은 방식으로
// mock.module로 대체한다.
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
const { useProfileCustomizationStore } = await import("../../../store/profileCustomization.store.js")

const createDeferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function resetStores() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
  useProfileCustomizationStore.getState().reset()
}

const walletOk = { balanceGold: 100, balanceDiamond: 100 }

test("A-10: 편집기가 열리면 서버 소유 entitlements에서 유도한 테두리만 보여준다(평민 기본 + 귀족 실소유, 남작은 미소유라 제외)", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [
        { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" },
        { itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" },
        { itemId: "player-profile-금빛가면", itemType: "PROFILE_PHOTO" },
      ],
      loadout: { selectedProfileBorderId: "profile-border-평민" },
    })

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  const ids = result.current.ownedBorderOptions.map((o) => o.itemId).sort()
  assert.deepEqual(ids, ["profile-border-귀족", "profile-border-평민"])
  assert.ok(!ids.includes("profile-border-남작"), "보유하지 않은 남작 테두리는 목록에 없어야 한다")
})

test("A-09: 로딩 중에는 borderListStatus가 loading이고, 조회가 실패하면 error로 바뀐다", async () => {
  resetStores()
  const deferred = createDeferred()
  getImpl = () => deferred.promise

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  assert.equal(result.current.borderListStatus, "loading")

  await act(async () => { deferred.reject(new Error("network")); await Promise.resolve() })
  await waitFor(() => assert.equal(result.current.borderListStatus, "error"))
})

test("F-13 AC-02: 테두리만 바뀐 확인은 실제 equipProfile(POST /economy/equip-profile)을 borderItemId만 담아 호출하고, 성공하면 편집기를 닫는다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-평민" } })
  const equipCalls = []
  postImpl = async (endpoint, body) => {
    equipCalls.push({ endpoint, body })
    return { loadout: { selectedProfileBorderId: body.borderItemId } }
  }

  let closed = 0
  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => { closed += 1 } }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(equipCalls.length, 1)
  assert.equal(equipCalls[0].endpoint, "/economy/equip-profile")
  assert.equal(equipCalls[0].body.borderItemId, "profile-border-귀족")
  assert.equal(equipCalls[0].body.photoItemId, undefined, "사진이 바뀌지 않았으면 photoItemId를 보내면 안 된다")
  assert.equal(closed, 1)
})

test("A-11: equip이 실패하면 오류를 보여주고 초안을 유지하며 편집기를 닫지 않는다 — 재시도하면 복구된다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-평민" } })
  let attempt = 0
  postImpl = async () => {
    attempt += 1
    if (attempt === 1) throw new Error("서버 오류")
    return { loadout: { selectedProfileBorderId: "profile-border-귀족" } }
  }

  let closed = 0
  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => { closed += 1 } }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  await act(async () => { await result.current.handleConfirm() })
  assert.equal(closed, 0, "실패했으므로 편집기를 닫으면 안 된다")
  assert.equal(result.current.confirmError, "서버 오류")
  assert.equal(result.current.draftBorderItemId, "profile-border-귀족", "실패해도 사용자가 고른 초안은 유지되어야 한다")

  await act(async () => { await result.current.handleConfirm() })
  assert.equal(closed, 1, "재시도가 성공하면 편집기가 닫혀야 한다")
  assert.equal(result.current.confirmError, null)
})

test("AC-04: 저장이 진행 중일 때 확인을 다시 눌러도 equip이 두 번 호출되지 않는다(중복 확인 방지)", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-평민" } })
  const deferred = createDeferred()
  let calls = 0
  postImpl = async () => { calls += 1; return deferred.promise }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let firstConfirm
  act(() => { firstConfirm = result.current.handleConfirm() })
  assert.equal(result.current.confirmStatus, "saving")
  await act(async () => { await result.current.handleConfirm() }) // 저장 중 재클릭 — 무시되어야 한다

  assert.equal(calls, 1, "진행 중인 저장이 있으면 두 번째 확인 클릭은 새 요청을 만들면 안 된다")

  await act(async () => {
    deferred.resolve({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
    await firstConfirm
  })
})

test("F-13 AC-01/AC-02: 테두리를 바꾸지 않고 사진만 바꾸면 photoItemId만 담아 equipProfile을 호출하고, 서버 확정 결과만 반영한다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }], loadout: { selectedProfilePhotoId: "player-profile-금빛가면", selectedProfileBorderId: "profile-border-평민" } })
  const equipCalls = []
  postImpl = async (endpoint, body) => {
    equipCalls.push({ endpoint, body })
    return { loadout: { selectedProfilePhotoId: body.photoItemId } }
  }

  let closed = 0
  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => { closed += 1 } }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftPhotoItemId("player-profile-드워프"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(equipCalls.length, 1)
  assert.equal(equipCalls[0].endpoint, "/economy/equip-profile")
  assert.equal(equipCalls[0].body.photoItemId, "player-profile-드워프")
  assert.equal(equipCalls[0].body.borderItemId, undefined, "테두리가 바뀌지 않았으면 borderItemId를 보내면 안 된다")
  assert.equal(closed, 1)
  assert.equal(useProfileCustomizationStore.getState().selectedPhotoItemId, "player-profile-드워프", "서버가 확정한 결과만 반영되어야 한다")
})

test("F-13 AC-02: 사진·테두리 둘 다 바뀌지 않았으면 아무 요청도 보내지 않고 곧바로 닫는다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }], loadout: { selectedProfilePhotoId: "player-profile-금빛가면", selectedProfileBorderId: "profile-border-평민" } })
  let calls = 0
  postImpl = async () => { calls += 1; return { loadout: {} } }

  let closed = 0
  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => { closed += 1 } }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  await act(async () => { await result.current.handleConfirm() })

  assert.equal(calls, 0)
  assert.equal(closed, 1)
})

test("F-13 AC-02: 사진·테두리를 동시에 바꾸면 두 값을 한 번의 equipProfile 요청에 함께 담아 보낸다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
      loadout: { selectedProfilePhotoId: "player-profile-금빛가면", selectedProfileBorderId: "profile-border-평민" },
    })
  const equipCalls = []
  postImpl = async (endpoint, body) => {
    equipCalls.push({ endpoint, body })
    return { loadout: { selectedProfilePhotoId: body.photoItemId, selectedProfileBorderId: body.borderItemId } }
  }

  let closed = 0
  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => { closed += 1 } }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftPhotoItemId("player-profile-드워프"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  await act(async () => { await result.current.handleConfirm() })

  assert.equal(equipCalls.length, 1, "사진·테두리가 함께 바뀌었어도 확인은 요청 하나로 확정되어야 한다")
  assert.equal(equipCalls[0].body.photoItemId, "player-profile-드워프")
  assert.equal(equipCalls[0].body.borderItemId, "profile-border-귀족")
  assert.equal(closed, 1)
})

test("AC-02: 변경 사항을 확인하지 않고 닫으면(취소) 실제 장착 상태는 그대로 유지된다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
      loadout: { selectedProfilePhotoId: "player-profile-금빛가면", selectedProfileBorderId: "profile-border-평민" },
    })
  let calls = 0
  postImpl = async () => { calls += 1; return { loadout: {} } }

  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => {} }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftPhotoItemId("player-profile-드워프"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))
  // handleConfirm을 호출하지 않고 초안만 바꾼 채로 끝난다(Escape·배경 클릭과 같은 취소 경로).

  assert.equal(calls, 0, "확인을 누르지 않았으면 서버에 어떤 요청도 가면 안 된다")
  assert.equal(useProfileCustomizationStore.getState().selectedPhotoItemId, "player-profile-금빛가면", "취소했으면 실제 장착 사진이 바뀌면 안 된다")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-평민", "취소했으면 실제 장착 테두리가 바뀌면 안 된다")
})

test("A-08: 편집기를 닫았다가 다시 열면 이전에 남은 미확정 초안이 아니라 실제 장착 상태로 되돌아간다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : {
      entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }],
      loadout: { selectedProfilePhotoId: "player-profile-금빛가면", selectedProfileBorderId: "profile-border-평민" },
    })
  postImpl = async () => { throw new Error("이 테스트는 확인을 호출하지 않는다") }

  const { result, rerender } = renderHook(
    ({ open }) => useProfileBorderEditor({ open, onClose: () => {} }),
    { initialProps: { open: true } },
  )
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))

  act(() => result.current.setDraftBorderItemId("profile-border-귀족")) // 미확정 선택을 남긴다

  rerender({ open: false }) // Escape/배경 클릭으로 닫음(확인 없음)
  rerender({ open: true }) // 다시 연다

  assert.equal(result.current.draftBorderItemId, "profile-border-평민", "재개방 시 초안은 이전 미확정 선택이 아니라 실제 장착 상태로 되돌아가야 한다")
})

test("A-08: equip 응답이 도착하기 전에 계정이 바뀌면 그 성공으로 편집기를 닫지 않는다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? walletOk
    : { entitlements: [{ itemId: "profile-border-귀족", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-평민" } })
  const deferred = createDeferred()
  postImpl = () => deferred.promise

  let closed = 0
  const { result } = renderHook(() => useProfileBorderEditor({ open: true, onClose: () => { closed += 1 } }))
  await waitFor(() => assert.equal(result.current.borderListStatus, "ready"))
  act(() => result.current.setDraftBorderItemId("profile-border-귀족"))

  let confirmPromise
  act(() => { confirmPromise = result.current.handleConfirm() })

  setCurrentUser({ uuid: "user-2" }) // 대기 중 계정 전환 — economy store가 reset되며 generation이 올라간다

  await act(async () => {
    deferred.resolve({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
    await confirmPromise
  })

  assert.equal(closed, 0, "이전 계정 요청의 늦은 성공으로 편집기가 닫히면 안 된다")
})
