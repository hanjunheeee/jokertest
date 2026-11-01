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
const { DEFAULT_PROFILE_BORDER_ITEM_ID, DEFAULT_PROFILE_PHOTO_ITEM_ID } = await import("../../../../src/domains/user/constants/profileEditLayout.js")

function resetStores() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
  useProfileCustomizationStore.getState().reset()
}

test("초기 프로필 사진·테두리는 shared 기본 에셋이다", () => {
  resetStores()

  const { photoSrc, frameSrc, selectedBorderItemId } = useProfileCustomizationStore.getState()

  assert.equal(photoSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
  assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
  assert.equal(selectedBorderItemId, DEFAULT_PROFILE_BORDER_ITEM_ID)
})

test("applyEquippedPhoto는 서버 itemId를 실제 표시 자산으로 바꾸고(F-13 A-10) 테두리는 건드리지 않는다", () => {
  resetStores()

  useProfileCustomizationStore.getState().applyEquippedPhoto("player-profile-기사")

  const { photoSrc, frameSrc, selectedPhotoItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedPhotoItemId, "player-profile-기사")
  assert.equal(photoSrc, "/shopItem/player-profile/프로필-기사.png".normalize("NFD"))
  assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
})

test("applyEquippedPhoto(null)은 기본 사진으로 되돌린다", () => {
  resetStores()
  useProfileCustomizationStore.getState().applyEquippedPhoto("player-profile-기사")

  useProfileCustomizationStore.getState().applyEquippedPhoto(null)

  const { photoSrc, selectedPhotoItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedPhotoItemId, DEFAULT_PROFILE_PHOTO_ITEM_ID)
  assert.equal(photoSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
})

test("applyEquippedBorder는 서버 itemId를 실제 표시 자산으로 바꿔 반영한다(A-10)", () => {
  resetStores()

  useProfileCustomizationStore.getState().applyEquippedBorder("profile-border-귀족")

  const { frameSrc, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedBorderItemId, "profile-border-귀족")
  assert.equal(frameSrc, "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"))
})

test("applyEquippedBorder(null)은 기본 테두리로 되돌린다", () => {
  resetStores()
  useProfileCustomizationStore.getState().applyEquippedBorder("profile-border-귀족")

  useProfileCustomizationStore.getState().applyEquippedBorder(null)

  const { frameSrc, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedBorderItemId, DEFAULT_PROFILE_BORDER_ITEM_ID)
  assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
})

test("reset은 적용된 커스터마이징을 기본값으로 되돌린다", () => {
  resetStores()
  useProfileCustomizationStore.getState().applyEquippedPhoto("player-profile-기사")
  useProfileCustomizationStore.getState().applyEquippedBorder("profile-border-남작")

  useProfileCustomizationStore.getState().reset()

  const { photoSrc, frameSrc, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(photoSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
  assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
  assert.equal(selectedBorderItemId, DEFAULT_PROFILE_BORDER_ITEM_ID)
})

test("economy store의 fetchSummary가 loadout을 채우면 사진·테두리 표시가 자동으로 반영된다(편집기를 열지 않아도, F-13 AC-04)", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfilePhotoId: "player-profile-기사", selectedProfileBorderId: "profile-border-귀족" } })

  await useEconomyStore.getState().fetchSummary()

  const { photoSrc, frameSrc, selectedPhotoItemId, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedPhotoItemId, "player-profile-기사")
  assert.equal(photoSrc, "/shopItem/player-profile/프로필-기사.png".normalize("NFD"))
  assert.equal(selectedBorderItemId, "profile-border-귀족")
  assert.equal(frameSrc, "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"))
})

test("계정을 전환하면(economy store reset) 표시 사진·테두리도 기본값으로 되돌아간다(F-13 AC-04)", async () => {
  resetStores()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfilePhotoId: "player-profile-기사", selectedProfileBorderId: "profile-border-귀족" } })
  await useEconomyStore.getState().fetchSummary()
  assert.equal(useProfileCustomizationStore.getState().selectedBorderItemId, "profile-border-귀족")

  setCurrentUser({ uuid: "user-2" })

  const { photoSrc, frameSrc, selectedPhotoItemId, selectedBorderItemId } = useProfileCustomizationStore.getState()
  assert.equal(selectedPhotoItemId, DEFAULT_PROFILE_PHOTO_ITEM_ID)
  assert.equal(photoSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
  assert.equal(selectedBorderItemId, DEFAULT_PROFILE_BORDER_ITEM_ID)
  assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
})

test("로그아웃하면 로컬 사진 선택도 기본값으로 되돌아간다", () => {
  resetStores()
  useProfileCustomizationStore.getState().applyEquippedPhoto("player-profile-기사")

  setCurrentUser(null)

  assert.equal(useProfileCustomizationStore.getState().photoSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
})
