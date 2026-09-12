import assert from "node:assert/strict"
import test, { mock } from "node:test"

// F-14(AC-01/AC-03) 대응: skinCardWear.store.js가 이제 economy.store.js·auth.store.js를
// 모듈 로드 시점에 구독한다(서버 loadout 반영, 계정 전환 초기화) — profileCustomization.
// store.test.js와 같은 이유로, 실제 fetch/localStorage를 태우지 않도록 API 경계와 auth
// store를 mock.module로 먼저 대체한 뒤에 이 store를 불러와야 한다.
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

const { useSkinCardWearStore } = await import("../skinCardWear.store.js")
const { useEconomyStore } = await import("../../../economy/store/economy.store.js")
const {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
} = await import("../../constants/skinCardWear/skinCardWearCatalog.js")

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
  // 직업 탭마다 기본 스킨이 하나씩 있어야 목록·미리보기가 빈 상태로 열리지 않습니다.
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

// ── F-14 AC-01: economy store의 loadout 변화를 실제 착용 상태에 반영 ────────────────────

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
  // 서버가 null로 응답한(미장착) 직업은 그 직업의 기본 스킨으로 대체되어야 한다 — 목록이
  // 빈 값으로 열리면 안 된다.
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
