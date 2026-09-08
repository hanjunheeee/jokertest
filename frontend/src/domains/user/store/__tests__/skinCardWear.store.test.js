import assert from "node:assert/strict"
import test from "node:test"

// catalog·store 모두 순수 JS라 API 경계 mock 없이 그대로 불러올 수 있습니다.
const { useSkinCardWearStore } = await import("../skinCardWear.store.js")
const {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
} = await import("../../constants/skinCardWear/skinCardWearCatalog.js")

function withCleanStore(run) {
  const initialState = useSkinCardWearStore.getState()

  try {
    run()
  } finally {
    useSkinCardWearStore.setState(initialState, true)
  }
}

test("초기 착용 상태는 직업별 기본 스킨과 기본 플레이어 카드다", () => {
  withCleanStore(() => {
    useSkinCardWearStore.getState().reset()

    const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

    assert.deepEqual(skinsByJob, buildDefaultSkinsByJob())
    assert.equal(cardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
    // 직업 탭마다 기본 스킨이 하나씩 있어야 목록·미리보기가 빈 상태로 열리지 않습니다.
    assert.equal(skinsByJob.noble, getDefaultSkinIdForJob("noble"))
    assert.equal(skinsByJob.witchHunter, getDefaultSkinIdForJob("witchHunter"))
  })
})

test("applyLoadout은 넘긴 스킨 구성과 카드 프레임을 그대로 반영한다", () => {
  withCleanStore(() => {
    const nextSkins = { ...buildDefaultSkinsByJob(), clown: "basic-skin-광대2" }

    useSkinCardWearStore.getState().applyLoadout({
      skinsByJob: nextSkins,
      cardFrameId: "player-card-왕관",
    })

    const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

    assert.equal(skinsByJob.clown, "basic-skin-광대2")
    assert.equal(cardFrameId, "player-card-왕관")
  })
})

test("applyLoadout에 카드만 넘기면 스킨 구성은 이전 값을 유지한다", () => {
  withCleanStore(() => {
    useSkinCardWearStore.getState().reset()
    const before = useSkinCardWearStore.getState().skinsByJob

    useSkinCardWearStore.getState().applyLoadout({ cardFrameId: "player-card-악마" })

    const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

    assert.equal(cardFrameId, "player-card-악마")
    assert.deepEqual(skinsByJob, before)
  })
})

test("reset은 적용된 착용 구성을 기본값으로 되돌린다", () => {
  withCleanStore(() => {
    useSkinCardWearStore.getState().applyLoadout({
      skinsByJob: { noble: "basic-skin-귀족3" },
      cardFrameId: "player-card-사슬",
    })

    useSkinCardWearStore.getState().reset()

    const { skinsByJob, cardFrameId } = useSkinCardWearStore.getState()

    assert.deepEqual(skinsByJob, buildDefaultSkinsByJob())
    assert.equal(cardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  })
})
