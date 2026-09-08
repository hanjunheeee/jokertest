import test from "node:test"
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

const { renderHook } = await import("@testing-library/react")
const { useSkinCardWearSelection } = await import("../useSkinCardWearSelection.js")
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

test("카드 보기에서 카드를 고르면 draft 카드 프레임이 바뀐다", () => {
  const { result } = renderSelection()

  act(() => result.current.togglePreviewMode())

  const otherCard = getPlayerCardItems().find(
    (item) => item.id !== SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  )
  assert.ok(otherCard, "기본 카드 말고도 고를 카드가 있어야 한다")

  act(() => result.current.selectItem(otherCard))

  assert.equal(result.current.draftCardFrameId, otherCard.id)
  assert.equal(result.current.preview.frameSrc, otherCard.frameSrc)
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
