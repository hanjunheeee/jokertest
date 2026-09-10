import assert from "node:assert/strict"
import test, { mock } from "node:test"

// economy.store.js가 실제 fetch를 내보내지 않도록 API 경계·auth store를 mock.module로
// 대체합니다(useMyProfile.test.js와 같은 패턴). mock.module의 키는 economy.store.js
// 안에서 쓴 import 지정자 문자열과 같아야 합니다.
let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
let currentUser = { uuid: "user-1" }

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
    useAuthStore: { getState: () => ({ user: currentUser }) },
  },
})

const { useEconomyStore } = await import("../economy.store.js")

function resetStore() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
}

test("fetchSummary는 지갑·소유품·장착 상태를 저장한다", async () => {
  resetStore()
  getImpl = async (endpoint) => {
    if (endpoint === "/economy/accounts/user-1/wallet") return { balanceGold: 300 }
    if (endpoint === "/economy/accounts/user-1/entitlements") {
      return { entitlements: [{ itemId: "player-profile-금빛가면" }], loadout: { selectedProfilePhotoId: "player-profile-금빛가면" } }
    }
    throw new Error(`unexpected endpoint: ${endpoint}`)
  }

  await useEconomyStore.getState().fetchSummary()

  const state = useEconomyStore.getState()
  assert.equal(state.status, "ready")
  assert.equal(state.balanceGold, 300)
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
    if (endpoint.endsWith("/wallet")) return { balanceGold: 10 }
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
    if (endpoint.endsWith("/wallet")) return { balanceGold: 0 }
    return { entitlements: [], loadout: {} }
  }

  await useEconomyStore.getState().purchase({ itemId: "profile-border-남작" })

  assert.equal(seenReferenceIds.length, 1)
  assert.equal(summaryFetchCount, 2)
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "confirmed")
})

test("응답을 잃어버린 구매를 재시도하면 같은 참조 사건 ID를 재사용한다", async () => {
  resetStore()
  let shouldFail = true
  const seenReferenceIds = []
  postImpl = async (endpoint, body) => {
    seenReferenceIds.push(body.referenceEventId)
    if (shouldFail) throw new Error("네트워크 끊김")
    return { idempotent: true, ledgerEntry: { id: 1 } }
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 0 } : { entitlements: [], loadout: {} })

  await assert.rejects(() => useEconomyStore.getState().purchase({ itemId: "profile-border-남작" }))
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "unknown")

  shouldFail = false
  await useEconomyStore.getState().retryPurchase("profile-border-남작")

  assert.equal(seenReferenceIds.length, 2)
  assert.equal(seenReferenceIds[0], seenReferenceIds[1], "재시도는 같은 참조 사건 ID를 재사용해야 한다")
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
