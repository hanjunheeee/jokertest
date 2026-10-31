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

const { useSkinCardWearStore } = await import("../../../../src/domains/user/store/skinCardWear.store.js")
const { useEconomyStore } = await import("../../../../src/domains/economy/store/economy.store.js")
const {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
} = await import("../../../../src/domains/user/constants/skinCardWear/skinCardWearCatalog.js")

function resetStores() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
  useSkinCardWearStore.getState().reset()
}

test("초기 착용 상태는 직업별 기본 스킨과 기본 플레이어 카드다", () => {
  resetStores()

  const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

  assert.deepEqual(skinsByJob, buildDefaultSkinsByJob())
  assert.equal(cardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  assert.equal(skinsByJob.noble, getDefaultSkinIdForJob("noble"))
  assert.equal(skinsByJob.witchHunter, getDefaultSkinIdForJob("witchHunter"))
})

test("applyLoadout은 넘긴 스킨 구성과 카드 프레임을 그대로 반영한다", () => {
  resetStores()
  const nextSkins = { ...buildDefaultSkinsByJob(), clown: "basic-skin-광대2" }

  useSkinCardWearStore.getState().applyLoadout({
    skinsByJob: nextSkins,
    cardFrameId: "player-card-왕관",
  })

  const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

  assert.equal(skinsByJob.clown, "basic-skin-광대2")
  assert.equal(cardFrameId, "player-card-왕관")
})

test("applyLoadout에 카드만 넘기면 스킨 구성은 이전 값을 유지한다", () => {
  resetStores()
  const before = useSkinCardWearStore.getState().skinsByJob

  useSkinCardWearStore.getState().applyLoadout({ cardFrameId: "player-card-악마" })

  const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

  assert.equal(cardFrameId, "player-card-악마")
  assert.deepEqual(skinsByJob, before)
})

test("reset은 적용된 착용 구성을 기본값으로 되돌린다", () => {
  resetStores()
  useSkinCardWearStore.getState().applyLoadout({
    skinsByJob: { noble: "basic-skin-귀족3" },
    cardFrameId: "player-card-사슬",
  })

  useSkinCardWearStore.getState().reset()

  const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

  assert.deepEqual(skinsByJob, buildDefaultSkinsByJob())
  assert.equal(cardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
})

test("economy store의 fetchSummary가 selectedSkinsByJob/selectedCardFrameId를 채우면 착용 상태가 자동으로 반영된다(오버레이를 열지 않아도)", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : {
        entitlements: [],
        loadout: {
          selectedCardFrameId: "player-card-보석",
          selectedSkinsByJob: { noble: null, clown: "basic-skin-광대2", guard: null, doctor: null, witchHunter: null },
        },
      })

  await useEconomyStore.getState().fetchSummary()

  const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()
  assert.equal(cardFrameId, "player-card-보석")
  assert.equal(skinsByJob.clown, "basic-skin-광대2")
  assert.equal(skinsByJob.noble, getDefaultSkinIdForJob("noble"))
  assert.equal(skinsByJob.guard, getDefaultSkinIdForJob("guard"))
})

test("F-14 AC-03: 계정을 전환하면(economy store reset) 착용 상태도 기본값으로 되돌아간다", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : {
        entitlements: [],
        loadout: {
          selectedCardFrameId: "player-card-보석",
          selectedSkinsByJob: { noble: "basic-skin-귀족2", clown: null, guard: null, doctor: null, witchHunter: null },
        },
      })
  await useEconomyStore.getState().fetchSummary()
  assert.equal(useSkinCardWearStore.getState().skinsByJob.noble, "basic-skin-귀족2")

  setCurrentUser({ uuid: "user-2" })

  const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()
  assert.deepEqual(skinsByJob, buildDefaultSkinsByJob())
  assert.equal(cardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
})

test("F-14 AC-03: 로그아웃하면 로컬 착용 캐시도 기본값으로 되돌아간다", () => {
  resetStores()
  useSkinCardWearStore.getState().applyLoadout({ cardFrameId: "player-card-왕관" })

  setCurrentUser(null)

  assert.equal(useSkinCardWearStore.getState().cardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
})
