import assert from "node:assert/strict"
import test from "node:test"

// store와 기본값은 모두 순수 JS라 API 경계 mock 없이 그대로 불러올 수 있습니다.
const { useProfileCustomizationStore } = await import("../profileCustomization.store.js")
const { PLAYER_PROFILE_ASSETS } = await import("../../../../shared/constants/playerProfileAssets.js")

function withCleanStore(run) {
  const initialState = useProfileCustomizationStore.getState()

  try {
    run()
  } finally {
    useProfileCustomizationStore.setState(initialState, true)
  }
}

test("초기 프로필 사진·테두리는 shared 기본 에셋이다", () => {
  withCleanStore(() => {
    useProfileCustomizationStore.getState().reset()

    const { photoSrc, frameSrc } = useProfileCustomizationStore.getState()

    assert.equal(photoSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
    assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
  })
})

test("applyCustomization은 넘긴 사진·테두리를 그대로 반영한다", () => {
  withCleanStore(() => {
    useProfileCustomizationStore.getState().applyCustomization({
      photoSrc: "/shopItem/player-profile/프로필-광대.png",
      frameSrc: "/shopItem/player- profileborder/프로필프레임-귀족.png",
    })

    const { photoSrc, frameSrc } = useProfileCustomizationStore.getState()

    assert.equal(photoSrc, "/shopItem/player-profile/프로필-광대.png")
    assert.equal(frameSrc, "/shopItem/player- profileborder/프로필프레임-귀족.png")
  })
})

test("applyCustomization에 한쪽만 넘기면 나머지는 이전 값을 유지한다", () => {
  withCleanStore(() => {
    useProfileCustomizationStore.getState().reset()
    useProfileCustomizationStore.getState().applyCustomization({ photoSrc: "/photo-only.png" })

    const { photoSrc, frameSrc } = useProfileCustomizationStore.getState()

    assert.equal(photoSrc, "/photo-only.png")
    // frameSrc를 넘기지 않았으므로 기본 테두리가 그대로 남아야 합니다.
    assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
  })
})

test("reset은 적용된 커스터마이징을 기본값으로 되돌린다", () => {
  withCleanStore(() => {
    useProfileCustomizationStore.getState().applyCustomization({
      photoSrc: "/photo.png",
      frameSrc: "/frame.png",
    })

    useProfileCustomizationStore.getState().reset()

    const { photoSrc, frameSrc } = useProfileCustomizationStore.getState()

    assert.equal(photoSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
    assert.equal(frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
  })
})
