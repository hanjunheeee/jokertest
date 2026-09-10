import assert from "node:assert/strict"
import test, { mock } from "node:test"

// economy.store.js가 실제 fetch를 내보내지 않도록 API 경계·auth store를 mock.module로
// 대체합니다(useMyProfile.test.js와 같은 패턴). mock.module의 키는 economy.store.js
// 안에서 쓴 import 지정자 문자열과 같아야 합니다.
//
// R-IMPL(2026-09-10, 반송) 대응: economy.store.js는 이제 모듈 로드 시점에
// useAuthStore.subscribe(...)를 호출해 로그아웃/계정 전환을 감지한다. 실제 zustand
// store처럼 subscribe(listener)가 (state, prevState)로 리스너를 부르는 최소한의 흉내를
// 내야 그 구독 로직을 실제로 태울 수 있다 — 이전 버전처럼 getState만 있는 평범한
// 객체로는 구독 자체가 일어나지 않아 계정 격리 결함이 테스트에서 드러나지 않았다.
let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
let currentUser = { uuid: "user-1" }
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../../../shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: (...args) => postImpl(...args),
    },
  },
})

mock.module("../../../auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: currentUser }),
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

const { useEconomyStore } = await import("../economy.store.js")

// 지연 응답(delayed response)/계정 전환 경합을 재현하기 위한 제어 가능한 프라미스.
const createDeferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function resetStore() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
}

test("fetchSummary는 지갑·소유품·장착 상태를 저장한다", async () => {
  resetStore()
  getImpl = async (endpoint) => {
    if (endpoint === "/economy/accounts/user-1/wallet") return { balanceGold: 300, balanceDiamond: 5 }
    if (endpoint === "/economy/accounts/user-1/entitlements") {
      return { entitlements: [{ itemId: "player-profile-금빛가면" }], loadout: { selectedProfilePhotoId: "player-profile-금빛가면" } }
    }
    throw new Error(`unexpected endpoint: ${endpoint}`)
  }

  await useEconomyStore.getState().fetchSummary()

  const state = useEconomyStore.getState()
  assert.equal(state.status, "ready")
  assert.equal(state.balanceGold, 300)
  assert.equal(state.balanceDiamond, 5)
  assert.equal(state.entitlements.length, 1)
  assert.equal(state.loadout.selectedProfilePhotoId, "player-profile-금빛가면")
})

test("로그인하지 않은 상태에서 fetchSummary는 요청 없이 에러 상태가 된다", async () => {
  resetStore()
  currentUser = null
  let called = false
  getImpl = async () => { called = true; return {} }

  await useEconomyStore.getState().fetchSummary()

  assert.equal(called, false)
  assert.equal(useEconomyStore.getState().status, "error")
})

test("fetchSummary 실패 시 status가 error가 되고 이전 값은 유지되지 않는다(재시도 가능)", async () => {
  resetStore()
  getImpl = async () => { throw new Error("네트워크 오류") }

  await useEconomyStore.getState().fetchSummary()

  const state = useEconomyStore.getState()
  assert.equal(state.status, "error")
  assert.equal(state.error, "네트워크 오류")
})

test("retry는 fetchSummary를 다시 실행한다", async () => {
  resetStore()
  let calls = 0
  getImpl = async (endpoint) => {
    calls += 1
    if (endpoint.endsWith("/wallet")) return { balanceGold: 10, balanceDiamond: 0 }
    return { entitlements: [], loadout: {} }
  }

  await useEconomyStore.getState().retry()

  assert.equal(calls, 2)
  assert.equal(useEconomyStore.getState().status, "ready")
})

test("purchase는 매번 새 referenceEventId를 발급하고, 성공하면 요약을 다시 불러온다", async () => {
  resetStore()
  const seenReferenceIds = []
  postImpl = async (endpoint, body) => {
    assert.equal(endpoint, "/economy/purchase")
    seenReferenceIds.push(body.referenceEventId)
    return { idempotent: false, ledgerEntry: { id: 1 } }
  }
  let summaryFetchCount = 0
  getImpl = async (endpoint) => {
    summaryFetchCount += 1
    if (endpoint.endsWith("/wallet")) return { balanceGold: 0, balanceDiamond: 0 }
    return { entitlements: [], loadout: {} }
  }

  await useEconomyStore.getState().purchase({ itemId: "profile-border-남작" })

  assert.equal(seenReferenceIds.length, 1)
  assert.equal(summaryFetchCount, 2)
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "confirmed")
})

test("응답을 잃어버린(전송 불확실) 구매를 재시도하면 같은 참조 사건 ID를 재사용한다", async () => {
  resetStore()
  let shouldFail = true
  const seenReferenceIds = []
  postImpl = async (endpoint, body) => {
    seenReferenceIds.push(body.referenceEventId)
    if (shouldFail) throw new Error("네트워크 끊김") // code 없음 = 서버 응답을 받지 못함
    return { idempotent: true, ledgerEntry: { id: 1 } }
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 0, balanceDiamond: 0 } : { entitlements: [], loadout: {} })

  await assert.rejects(() => useEconomyStore.getState().purchase({ itemId: "profile-border-남작" }))
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "unknown")

  shouldFail = false
  await useEconomyStore.getState().retryPurchase("profile-border-남작")

  assert.equal(seenReferenceIds.length, 2)
  assert.equal(seenReferenceIds[0], seenReferenceIds[1], "전송 불확실 재시도는 같은 참조 사건 ID를 재사용해야 한다")
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "confirmed")
})

test("equip은 서버가 돌려준 loadout으로 상태를 갱신한다", async () => {
  resetStore()
  postImpl = async (endpoint, body) => {
    assert.equal(endpoint, "/economy/equip")
    assert.deepEqual(body, { slot: "PROFILE_BORDER", itemId: "profile-border-남작" })
    return { loadout: { selectedProfileBorderId: "profile-border-남작" } }
  }

  await useEconomyStore.getState().equip({ slot: "PROFILE_BORDER", itemId: "profile-border-남작" })

  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
})

// ── F-08 R-IMPL: 서버 확정 거부 vs 전송 불확실 구분 ──────────────────────────

test("서버가 code와 함께 명시적으로 거부하면(확정 거부) status는 rejected이고, 재시도는 새 참조 사건 ID를 쓴다", async () => {
  resetStore()
  const seenReferenceIds = []
  postImpl = async (endpoint, body) => {
    seenReferenceIds.push(body.referenceEventId)
    const error = new Error("잔액이 부족합니다.")
    error.code = "INSUFFICIENT_BALANCE" // backend/utils/appError.js createError가 싣는 값
    throw error
  }

  await assert.rejects(() => useEconomyStore.getState().purchase({ itemId: "profile-border-남작" }))
  const pending = useEconomyStore.getState().pendingPurchases["profile-border-남작"]
  assert.equal(pending.status, "rejected")
  assert.equal(pending.code, "INSUFFICIENT_BALANCE")

  await assert.rejects(() => useEconomyStore.getState().retryPurchase("profile-border-남작"))
  assert.equal(seenReferenceIds.length, 2)
  assert.notEqual(seenReferenceIds[0], seenReferenceIds[1], "확정 거부 이후의 재시도는 새로운 시도이므로 새 참조 사건 ID를 써야 한다")
})

test("code 없는 실패(전송 불확실)는 status가 unknown이고 code는 비어 있다", async () => {
  resetStore()
  postImpl = async () => { throw new TypeError("Failed to fetch") }

  await assert.rejects(() => useEconomyStore.getState().purchase({ itemId: "profile-border-남작" }))
  const pending = useEconomyStore.getState().pendingPurchases["profile-border-남작"]
  assert.equal(pending.status, "unknown")
  assert.equal(pending.code, null)
})

// ── F-08 R-IMPL: 로그아웃/계정 전환 시 상태 격리 ─────────────────────────────

test("로그아웃(user → null)하면 잔액·소유품·진행 중이던 구매 상태가 모두 초기화된다", async () => {
  resetStore()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 999, balanceDiamond: 3 } : { entitlements: [{ itemId: "x" }], loadout: {} })
  await useEconomyStore.getState().fetchSummary()
  assert.equal(useEconomyStore.getState().balanceGold, 999)

  setCurrentUser(null)

  const state = useEconomyStore.getState()
  assert.equal(state.balanceGold, 0)
  assert.equal(state.balanceDiamond, 0)
  assert.equal(state.entitlements.length, 0)
  assert.equal(state.status, "idle")
})

test("다른 계정으로 전환하면 이전 계정의 상태가 남지 않는다", async () => {
  resetStore()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 500, balanceDiamond: 1 } : { entitlements: [], loadout: {} })
  await useEconomyStore.getState().fetchSummary()
  assert.equal(useEconomyStore.getState().balanceGold, 500)

  setCurrentUser({ uuid: "user-2" })

  assert.equal(useEconomyStore.getState().balanceGold, 0, "계정이 바뀌면 이전 계정의 잔액이 남아 있으면 안 된다")
  assert.equal(useEconomyStore.getState().status, "idle")
})

test("지연 응답(delayed response): fetchSummary가 끝나기 전에 계정이 바뀌면 늦게 도착한 응답이 새 계정 상태를 덮어쓰지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  getImpl = async (endpoint) => {
    await deferred.promise
    return endpoint.endsWith("/wallet") ? { balanceGold: 111, balanceDiamond: 0 } : { entitlements: [], loadout: {} }
  }

  const fetchPromise = useEconomyStore.getState().fetchSummary()
  assert.equal(useEconomyStore.getState().status, "loading")

  // 응답이 오기 전에 다른 계정으로 전환한다.
  setCurrentUser({ uuid: "user-2" })
  assert.equal(useEconomyStore.getState().status, "idle", "전환 즉시 리셋되어야 한다")

  // 이제야 user-1의 지연된 응답이 도착한다.
  deferred.resolve()
  await fetchPromise

  const state = useEconomyStore.getState()
  assert.equal(state.balanceGold, 0, "user-1의 뒤늦은 응답이 user-2의 화면(초기화된 상태)을 덮어쓰면 안 된다")
  assert.equal(state.status, "idle", "폐기된 세대의 응답은 status마저 바꾸면 안 된다")
})

test("지연 응답: purchase가 끝나기 전에 계정이 바뀌면 늦게 도착한 결과가 새 계정의 pendingPurchases에 쓰이지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  postImpl = async () => {
    await deferred.promise
    return { idempotent: false, ledgerEntry: { id: 1 } }
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 0, balanceDiamond: 0 } : { entitlements: [], loadout: {} })

  const purchasePromise = useEconomyStore.getState().purchase({ itemId: "profile-border-남작" })
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "pending")

  setCurrentUser({ uuid: "user-2" })
  assert.deepEqual(useEconomyStore.getState().pendingPurchases, {}, "계정 전환 즉시 이전 계정의 진행 중이던 구매 상태가 지워져야 한다")

  deferred.resolve()
  const result = await purchasePromise

  assert.equal(result.idempotent, false, "폐기된 세대라도 서버 호출 자체의 결과는 호출부에 그대로 반환된다")
  assert.deepEqual(useEconomyStore.getState().pendingPurchases, {}, "user-1의 뒤늦은 구매 완료가 user-2 화면에 흔적을 남기면 안 된다")
})
