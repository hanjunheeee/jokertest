import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// renderHook은 DOM 전역이 필요하다. 설치 방식은 기존 훅 테스트(useLibraryTab.test.js)와 동일하다.
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

// F-14(AC-01/AC-02/AC-05) 대응: useSkinCardWearSelection이 이제 economy.store.js·
// auth.store.js를 confirmLoadout에서 직접 부른다 — profileCustomization.store.test.js와
// 같은 이유로, 실제 fetch/localStorage를 태우지 않도록 API 경계와 auth store를
// mock.module로 먼저 대체한 뒤에 이 hook을 불러와야 한다.
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

const { renderHook } = await import("@testing-library/react")
const { useSkinCardWearSelection, SKIN_CARD_WEAR_CONFIRM_STATUS } = await import("../useSkinCardWearSelection.js")
const { useEconomyStore } = await import("../../../economy/store/economy.store.js")
const {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  SKIN_CARD_WEAR_JOB_TABS,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
  getPlayerCardItems,
  getSkinCardWearItemById,
  getSkinItemsForJob,
} = await import("../../constants/skinCardWear/skinCardWearCatalog.js")
const {
  SKIN_CARD_WEAR_PREVIEW_MODE_CARD,
  SKIN_CARD_WEAR_PREVIEW_MODE_SKIN,
} = await import("../../constants/skinCardWear/skinCardWearLayout.js")

const FIRST_JOB_ID = SKIN_CARD_WEAR_JOB_TABS[0].id
const SECOND_JOB_ID = SKIN_CARD_WEAR_JOB_TABS[1].id

function resetEconomy() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
  // F-14(AC-01, R-IMPL2 "MUST CLOSE UNVERSIONED PUBLIC WRITE") — 실제 화면에서는 Overlay가
  // 열리자마자 fetchSummary로 authoritative revision을 먼저 읽어 두므로(SkinCardWearOverlay.jsx
  // 열림 effect), confirmLoadout이 호출될 때 store.equip()은 revision을 이미 알고 있는 채로
  // 시작한다. 이 파일은 훅만 단독으로 렌더해 그 Overlay 마운트 단계를 거치지 않으므로, 여기서
  // 같은 전제를 직접 만들어 둔다 — 그러지 않으면 매 equip() 호출이 먼저 authoritative GET을
  // 시도하게 되어(economy.store.js sendLoadoutWrite의 requireKnownRevision), 아래 테스트들이
  // 검증하려는 "명시적 거부/전송 불확실 직후 첫 POST" 시나리오가 흐트러진다.
  useEconomyStore.setState((state) => ({ loadout: { ...state.loadout, revision: "known-rev" } }))
}

function renderSelection() {
  return renderHook(() =>
    useSkinCardWearSelection({
      initialSkinsByJob: buildDefaultSkinsByJob(),
      initialCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    }),
  )
}

test("처음 열면 첫 직업 탭의 기본 스킨이 선택되고 스킨 미리보기를 보여준다", () => {
  const { result } = renderSelection()

  assert.equal(result.current.activeJobIndex, 0)
  assert.equal(result.current.activeJobId, FIRST_JOB_ID)
  assert.equal(result.current.previewMode, SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
  assert.equal(result.current.selectedItemId, getDefaultSkinIdForJob(FIRST_JOB_ID))

  // 목록은 현재 직업의 스킨만 담고, 미리보기는 그 스킨의 서 있는 일러스트를 가리켜야 합니다.
  assert.deepEqual(
    result.current.listItems.map((item) => item.id),
    getSkinItemsForJob(FIRST_JOB_ID).map((item) => item.id),
  )
  assert.equal(result.current.preview.mode, "skin")
  assert.equal(
    result.current.preview.standingSrc,
    getSkinCardWearItemById(getDefaultSkinIdForJob(FIRST_JOB_ID)).standingSrc,
  )
})

test("스킨을 고르면 선택 상태와 draft 구성, 미리보기가 함께 바뀐다", () => {
  const { result } = renderSelection()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find(
    (item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID),
  )
  assert.ok(otherSkin, "첫 직업에는 기본 스킨 말고도 고를 스킨이 있어야 한다")

  act(() => result.current.selectItem(otherSkin))

  assert.equal(result.current.selectedItemId, otherSkin.id)
  assert.equal(result.current.draftSkinsByJob[FIRST_JOB_ID], otherSkin.id)
  assert.equal(result.current.preview.standingSrc, otherSkin.standingSrc)
})

test("직업 탭을 바꾸면 그 직업의 draft 스킨이 선택되고 목록도 따라 바뀐다", () => {
  const { result } = renderSelection()

  act(() => result.current.setActiveJobIndex(1))

  assert.equal(result.current.activeJobIndex, 1)
  assert.equal(result.current.activeJobId, SECOND_JOB_ID)
  assert.equal(result.current.selectedItemId, getDefaultSkinIdForJob(SECOND_JOB_ID))
  assert.deepEqual(
    result.current.listItems.map((item) => item.id),
    getSkinItemsForJob(SECOND_JOB_ID).map((item) => item.id),
  )
})

test("카드 보기로 전환하면 플레이어 카드 목록과 카드 미리보기로 바뀐다", () => {
  const { result } = renderSelection()

  act(() => result.current.togglePreviewMode())

  assert.equal(result.current.previewMode, SKIN_CARD_WEAR_PREVIEW_MODE_CARD)
  assert.equal(result.current.selectedItemId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  assert.deepEqual(
    result.current.listItems.map((item) => item.id),
    getPlayerCardItems().map((item) => item.id),
  )

  // 카드 미리보기는 카드 프레임과 현재 직업 스킨의 클로즈업을 함께 보여줍니다.
  assert.equal(result.current.preview.mode, "card")
  assert.equal(
    result.current.preview.frameSrc,
    getSkinCardWearItemById(SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID).frameSrc,
  )
  assert.equal(
    result.current.preview.portraitSrc,
    getSkinCardWearItemById(getDefaultSkinIdForJob(FIRST_JOB_ID)).closeupSrc,
  )
})

test("카드 보기에서 소유한 카드를 고르면 draft 카드 프레임이 바뀐다", () => {
  resetEconomy()
  const otherCard = getPlayerCardItems().find(
    (item) => item.id !== SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  )
  assert.ok(otherCard, "기본 카드 말고도 고를 카드가 있어야 한다")
  // F-14(AC-02): 기본 카드가 아닌 프리미엄 카드는 entitlements에 있어야만 선택할 수 있다.
  useEconomyStore.setState({ entitlements: [{ itemId: otherCard.id, itemType: "PLAYER_CARD_FRAME" }] })

  const { result } = renderSelection()
  act(() => result.current.togglePreviewMode())

  act(() => result.current.selectItem(otherCard))

  assert.equal(result.current.draftCardFrameId, otherCard.id)
  assert.equal(result.current.preview.frameSrc, otherCard.frameSrc)
})

// ── F-14 AC-02: 소유권 게이트 ────────────────────────────────────────────────

test("F-14 AC-02: 기본 스킨·기본 카드는 entitlements 없이도 항상 owned:true다", () => {
  resetEconomy()
  const { result } = renderSelection()

  assert.ok(result.current.listItems.every((item) => item.source !== "basic" || item.owned === true))

  act(() => result.current.togglePreviewMode())
  const defaultCard = result.current.listItems.find((item) => item.id === SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  assert.equal(defaultCard.owned, true)
})

test("F-14 AC-02: entitlements에 없는 프리미엄 스킨·카드는 owned:false이고 선택해도 draft가 바뀌지 않는다", () => {
  resetEconomy()
  const { result } = renderSelection()

  const premiumSkin = result.current.listItems.find((item) => item.source === "premium")
  assert.ok(premiumSkin, "프리미엄 스킨 목록이 있어야 한다")
  assert.equal(premiumSkin.owned, false)

  const draftBefore = result.current.draftSkinsByJob[FIRST_JOB_ID]
  act(() => result.current.selectItem(premiumSkin))
  assert.equal(result.current.selectedItemId, draftBefore, "미보유 항목 선택은 selectedItemId를 바꾸면 안 된다")
  assert.equal(result.current.draftSkinsByJob[FIRST_JOB_ID], draftBefore, "미보유 항목 선택은 draft를 바꾸면 안 된다")

  act(() => result.current.togglePreviewMode())
  const premiumCard = result.current.listItems.find((item) => item.id !== SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  assert.equal(premiumCard.owned, false)
  act(() => result.current.selectItem(premiumCard))
  assert.equal(result.current.draftCardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID, "미보유 카드 선택은 draft를 바꾸면 안 된다")
})

test("F-14 AC-02: entitlements에 있는 프리미엄 스킨은 owned:true가 되고 선택할 수 있다", () => {
  resetEconomy()
  const { result } = renderSelection()
  const premiumSkin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.source === "premium")
  assert.ok(premiumSkin)
  act(() => { useEconomyStore.setState({ entitlements: [{ itemId: premiumSkin.id, itemType: "SKIN" }] }) })

  const owned = result.current.listItems.find((item) => item.id === premiumSkin.id)
  assert.equal(owned.owned, true)

  act(() => result.current.selectItem(premiumSkin))
  assert.equal(result.current.draftSkinsByJob[FIRST_JOB_ID], premiumSkin.id)
})

test("카드 보기에서 다시 전환하면 스킨 보기와 직업 스킨 선택으로 돌아온다", () => {
  const { result } = renderSelection()

  act(() => result.current.togglePreviewMode())
  act(() => result.current.togglePreviewMode())

  assert.equal(result.current.previewMode, SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
  assert.equal(result.current.selectedItemId, getDefaultSkinIdForJob(FIRST_JOB_ID))
})

test("resetDraft는 적용된 구성으로 탭·선택·draft를 되돌린다", () => {
  const { result } = renderSelection()

  const otherSkin = getSkinItemsForJob(SECOND_JOB_ID).find(
    (item) => item.id !== getDefaultSkinIdForJob(SECOND_JOB_ID),
  )
  assert.ok(otherSkin, "두 번째 직업에는 기본 스킨 말고도 고를 스킨이 있어야 한다")

  act(() => result.current.setActiveJobIndex(1))
  act(() => result.current.selectItem(otherSkin))

  const applied = buildDefaultSkinsByJob()
  act(() => result.current.resetDraft({ skinsByJob: applied, cardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID }))

  assert.equal(result.current.activeJobIndex, 0)
  assert.equal(result.current.previewMode, SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
  assert.deepEqual(result.current.draftSkinsByJob, applied)
  assert.equal(result.current.draftCardFrameId, SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  assert.equal(result.current.selectedItemId, getDefaultSkinIdForJob(FIRST_JOB_ID))
})

// ── F-14 AC-01/AC-02/AC-05: confirmLoadout ──────────────────────────────────

function stubWalletAndEntitlements(loadoutOverrides = {}) {
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedCardFrameId: null, selectedSkinsByJob: null, ...loadoutOverrides } })
}

test("F-14 AC-01: 바뀐 것이 없으면 서버 요청 없이 즉시 성공(changed:false)한다", async () => {
  resetEconomy()
  const { result } = renderSelection()
  let postCalls = 0
  postImpl = async () => { postCalls += 1; return { loadout: {} } }

  let outcome
  await act(async () => {
    outcome = await result.current.confirmLoadout({
      appliedSkinsByJob: buildDefaultSkinsByJob(),
      appliedCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    })
  })

  assert.deepEqual(outcome, { ok: true, changed: false })
  assert.equal(postCalls, 0, "바뀐 슬롯이 없으면 equip을 전혀 호출하면 안 된다")
  assert.equal(result.current.confirmStatus, SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
})

test("F-14 AC-01: 바뀐 슬롯만 골라 equip을 호출하고 성공하면 SUCCESS 상태가 된다", async () => {
  resetEconomy()
  const { result } = renderSelection()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find(
    (item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID),
  )
  act(() => result.current.selectItem(otherSkin))

  const otherCard = getPlayerCardItems().find((item) => item.id !== SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  // F-14(AC-02): 프리미엄 카드는 entitlements에 있어야만 선택할 수 있다.
  act(() => { useEconomyStore.setState({ entitlements: [{ itemId: otherCard.id, itemType: "PLAYER_CARD_FRAME" }] }) })
  act(() => result.current.togglePreviewMode())
  act(() => result.current.selectItem(otherCard))

  const postedRequests = []
  postImpl = async (endpoint, body) => { postedRequests.push({ endpoint, body }); return { loadout: {} } }
  stubWalletAndEntitlements({ selectedCardFrameId: otherCard.id, selectedSkinsByJob: { [FIRST_JOB_ID]: otherSkin.id } })

  let outcome
  await act(async () => {
    outcome = await result.current.confirmLoadout({
      appliedSkinsByJob: buildDefaultSkinsByJob(),
      appliedCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    })
  })

  assert.deepEqual(outcome, { ok: true, changed: true })
  assert.equal(result.current.confirmStatus, SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
  assert.equal(postedRequests.length, 2, "바뀐 스킨 슬롯 하나 + 카드 슬롯 하나만 전송해야 한다")
  const skinRequest = postedRequests.find((r) => r.body.itemId === otherSkin.id)
  const cardRequest = postedRequests.find((r) => r.body.itemId === otherCard.id)
  assert.ok(skinRequest && skinRequest.endpoint === "/economy/equip")
  assert.ok(cardRequest && cardRequest.body.slot === "PLAYER_CARD_FRAME")
})

test("F-14 AC-02/AC-05: 명시적 거부(code 있음)는 초안을 유지한 채 ERROR 상태와 오류 메시지를 남긴다", async () => {
  resetEconomy()
  const { result } = renderSelection()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find(
    (item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID),
  )
  act(() => result.current.selectItem(otherSkin))

  postImpl = async () => { throw Object.assign(new Error("보유하지 않은 상품은 장착할 수 없습니다."), { code: "ITEM_NOT_OWNED" }) }

  let outcome
  await act(async () => {
    outcome = await result.current.confirmLoadout({
      appliedSkinsByJob: buildDefaultSkinsByJob(),
      appliedCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    })
  })

  assert.equal(outcome.ok, false)
  assert.equal(result.current.confirmStatus, SKIN_CARD_WEAR_CONFIRM_STATUS.ERROR)
  assert.equal(result.current.confirmError, "보유하지 않은 상품은 장착할 수 없습니다.")
  // 거부돼도 사용자가 고른 초안은 그대로 남아야 재시도·수정이 가능하다.
  assert.equal(result.current.draftSkinsByJob[FIRST_JOB_ID], otherSkin.id)
})

test("F-14 AC-05: 전송 불확실(code 없음)은 UNCERTAIN 상태가 되고 authoritative GET으로 재조정을 시도한다", async () => {
  resetEconomy()
  const { result } = renderSelection()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find(
    (item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID),
  )
  act(() => result.current.selectItem(otherSkin))

  postImpl = async () => { throw new Error("네트워크 오류(테스트 주입)") } // code 없음 = 전송 불확실
  let getCalled = false
  getImpl = async (endpoint) => {
    getCalled = true
    return endpoint.endsWith("/wallet")
      ? { balanceGold: 0, balanceDiamond: 0 }
      : { entitlements: [], loadout: { selectedCardFrameId: null, selectedSkinsByJob: null } }
  }

  let outcome
  await act(async () => {
    outcome = await result.current.confirmLoadout({
      appliedSkinsByJob: buildDefaultSkinsByJob(),
      appliedCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    })
  })

  assert.deepEqual(outcome, { ok: false, uncertain: true })
  assert.equal(result.current.confirmStatus, SKIN_CARD_WEAR_CONFIRM_STATUS.UNCERTAIN)
  assert.ok(getCalled, "전송 불확실 뒤에는 authoritative GET(fetchSummary)으로 재조정을 시도해야 한다")
})

test("F-14 AC-03: 저장 도중 계정이 전환되면 stale로만 보고하고 confirmStatus를 성공/실패로 확정하지 않는다", async () => {
  resetEconomy()
  const { result } = renderSelection()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find(
    (item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID),
  )
  act(() => result.current.selectItem(otherSkin))

  postImpl = async () => {
    // equip 응답을 기다리는 동안 계정이 전환됐다고 가정한다.
    setCurrentUser({ uuid: "user-2" })
    return { loadout: {} }
  }

  let outcome
  await act(async () => {
    outcome = await result.current.confirmLoadout({
      appliedSkinsByJob: buildDefaultSkinsByJob(),
      appliedCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    })
  })

  assert.deepEqual(outcome, { ok: false, stale: true })
  // 이전 계정의 화면에 성공도 실패도 잘못 표시하면 안 된다(A-04) — SAVING에서 확정되지 않은 채 남는다.
  assert.equal(result.current.confirmStatus, SKIN_CARD_WEAR_CONFIRM_STATUS.SAVING)
})

test("F-14 AC-05(A-06): saving 중 중복 확인 호출은 두 번째 호출을 즉시 거부하고 중복 전송하지 않는다", async () => {
  resetEconomy()
  const { result } = renderSelection()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find(
    (item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID),
  )
  act(() => result.current.selectItem(otherSkin))

  let resolvePost
  let postCalls = 0
  postImpl = async () => {
    postCalls += 1
    return new Promise((resolve) => { resolvePost = () => resolve({ loadout: {} }) })
  }
  stubWalletAndEntitlements({ selectedSkinsByJob: { [FIRST_JOB_ID]: otherSkin.id } })

  let firstPromise
  let secondOutcome
  await act(async () => {
    firstPromise = result.current.confirmLoadout({
      appliedSkinsByJob: buildDefaultSkinsByJob(),
      appliedCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    })
    secondOutcome = await result.current.confirmLoadout({
      appliedSkinsByJob: buildDefaultSkinsByJob(),
      appliedCardFrameId: SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
    })
  })

  assert.deepEqual(secondOutcome, { ok: false, reason: "ALREADY_SAVING" })
  assert.equal(postCalls, 1, "두 번째 확인 호출이 중복 전송을 일으키면 안 된다")

  await act(async () => {
    resolvePost()
    await firstPromise
  })
  assert.equal(result.current.confirmStatus, SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
})
