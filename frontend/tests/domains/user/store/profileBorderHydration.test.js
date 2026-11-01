import assert from "node:assert/strict"
import test, { mock } from "node:test"

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
let currentUser = { uuid: "user-1" }
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../../../src/shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: (...args) => postImpl(...args),
    },
  },
})

mock.module("../../../../src/domains/auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: currentUser }),
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

const { useProfileCustomizationStore } = await import("../../../../src/domains/user/store/profileCustomization.store.js")
const { useEconomyStore } = await import("../../../../src/domains/economy/store/economy.store.js")
const { PLAYER_PROFILE_ASSETS } = await import("../../../../src/shared/constants/playerProfileAssets.js")
const { DEFAULT_PROFILE_BORDER_ITEM_ID } = await import("../../../../src/domains/user/constants/profileEditLayout.js")

const createDeferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

function resetStores() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
  useProfileCustomizationStore.getState().reset()
}

test("A-12: 서버 loadout 조회 결과가 편집기를 한 번도 열지 않아도 표시·선택에 그대로 복원된다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfileBorderId: "profile-border-귀족" } })

  await useEconomyStore.getState().fetchSummary()

  const { frameSrc, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedBorderItemId, "profile-border-귀족")
  assert.equal(frameSrc, "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"))
})

test("A-08: 계정 A에서 시작한 fetchSummary가 계정 B로 전환된 뒤 늦게 도착하면 B의 표시 테두리를 바꾸지 않는다", async () => {
  resetStores()
  const deferred = createDeferred()
  getImpl = (endpoint) => (endpoint.endsWith("/wallet")
    ? Promise.resolve({ balanceGold: 0, balanceDiamond: 0 })
    : deferred.promise)

  const fetchPromise = useEconomyStore.getState().fetchSummary()
  setCurrentUser({ uuid: "user-2" })

  deferred.resolve({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
  await fetchPromise

  const { frameSrc, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedBorderItemId, DEFAULT_PROFILE_BORDER_ITEM_ID, "user-1의 늦은 응답이 user-2 화면에 반영되면 안 된다")
  assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
})

test("A-08: 계정 A에서 시작한 equip 성공 응답이 계정 B로 전환된 뒤 늦게 도착해도 표시 테두리를 바꾸지 않는다", async () => {
  resetStores()
  const deferred = createDeferred()
  postImpl = () => deferred.promise

  const equipPromise = useEconomyStore.getState().equip({ slot: "PROFILE_BORDER", itemId: "profile-border-귀족" })
  setCurrentUser({ uuid: "user-2" })

  deferred.resolve({ loadout: { selectedProfileBorderId: "profile-border-귀족" } })
  await equipPromise

  const { frameSrc, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedBorderItemId, DEFAULT_PROFILE_BORDER_ITEM_ID, "user-1의 늦은 equip 성공이 user-2 화면에 반영되면 안 된다")
  assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
})

test("로그아웃 후 표시는 기본값으로 돌아가고, 재로그인(같은 경로 — 새 fetchSummary)으로 새 계정의 실제 loadout이 복원된다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfileBorderId: "profile-border-귀족" } })
  await useEconomyStore.getState().fetchSummary()
  assert.equal(useProfileCustomizationStore.getState().selectedBorderItemId, "profile-border-귀족")

  setCurrentUser(null)

  assert.equal(useProfileCustomizationStore.getState().selectedBorderItemId, DEFAULT_PROFILE_BORDER_ITEM_ID)
  assert.equal(useProfileCustomizationStore.getState().frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)

  setCurrentUser({ uuid: "user-3" })
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfileBorderId: "profile-border-남작" } })
  await useEconomyStore.getState().fetchSummary()

  assert.equal(useProfileCustomizationStore.getState().selectedBorderItemId, "profile-border-남작")
  assert.equal(
    useProfileCustomizationStore.getState().frameSrc,
    "/shopItem/player- profileborder/프로필프레임-남작.png".normalize("NFD"),
  )
})
