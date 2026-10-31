import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
let currentUser = { uuid: "user-1" }
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../../../../shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: (...args) => postImpl(...args),
    },
  },
})

mock.module("../../../../auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: currentUser }),
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

const { render, cleanup, act } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: SkinCardWearOverlay } = await import("../SkinCardWearOverlay.jsx")
const { useEconomyStore } = await import("../../../../economy/store/economy.store.js")
const { useSkinCardWearStore } = await import("../../../store/skinCardWear.store.js")
const {
  SKIN_CARD_WEAR_JOB_TABS,
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  buildDefaultSkinsByJob,
  getDefaultSkinIdForJob,
  getPlayerCardItems,
  getSkinItemsForJob,
} = await import("../../../constants/skinCardWear/skinCardWearCatalog.js")

const FIRST_JOB_ID = SKIN_CARD_WEAR_JOB_TABS[0].id

function flatLoadout({ selectedCardFrameId = null, selectedSkinsByJob = null, revision = "server-rev-0" } = {}) {
  return { entitlements: [], loadout: { selectedCardFrameId, selectedSkinsByJob, revision } }
}

function resetAll() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
  useSkinCardWearStore.getState().reset()
}

async function flushMicrotasks(times = 8) {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- 실제 순차적으로 여러 tick을 흘려보내야 한다.
    await act(async () => { await Promise.resolve() })
  }
}

function countingGet(response) {
  let calls = 0
  const impl = async () => { calls += 1; return response }
  return { impl, count: () => calls }
}

test("F-14(R-IMPL P1): 여는 즉시 authoritative 조회를 부르고, 이미 열려 있는 동안 GET이 무한 반복되지 않는다", async () => {
  resetAll()
  const walletCalls = { n: 0 }
  getImpl = async (endpoint) => {
    walletCalls.n += 1
    return endpoint.endsWith("/wallet") ? { balanceGold: 0, balanceDiamond: 0 } : flatLoadout()
  }

  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await flushMicrotasks(40)
  const afterFirstSettle = walletCalls.n

  assert.ok(afterFirstSettle > 0, "열면 최소 한 번은 authoritative 조회를 해야 한다")
  assert.ok(afterFirstSettle <= 2, `여는 것으로 wallet GET이 정확히 한 번만 일어나야 한다(관측값 ${afterFirstSettle})`)

  await flushMicrotasks(40)
  assert.equal(walletCalls.n, afterFirstSettle, "열려 있는 동안 추가 조회 없이 GET 횟수가 고정되어야 한다(무한 루프 회귀)")
})

test("F-14(R-IMPL P1): 배경에서 내용이 같은 loadout이 다시 도착해도(참조만 다름) 진행 중인 편집 draft가 지워지지 않는다", async () => {
  resetAll()
  const appliedSkins = buildDefaultSkinsByJob()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : flatLoadout({ selectedSkinsByJob: appliedSkins }))

  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await flushMicrotasks()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  assert.ok(otherSkin, "테스트 전제: 첫 직업에는 기본 스킨 말고도 고를 스킨이 있어야 한다")

  const selectButton = document.querySelector(`button[aria-label^="${otherSkin.name}"]`)
  assert.ok(selectButton, "선택 가능한 스킨 버튼이 실제 DOM에 렌더돼야 한다")
  act(() => { selectButton.click() })
  assert.equal(selectButton.getAttribute("aria-pressed"), "true", "클릭한 스킨이 즉시 선택 상태가 되어야 한다")

  await act(async () => { await useEconomyStore.getState().fetchSummary() })
  await flushMicrotasks()

  const sameButtonAfter = document.querySelector(`button[aria-label^="${otherSkin.name}"]`)
  assert.equal(sameButtonAfter.getAttribute("aria-pressed"), "true", "내용이 같은 배경 갱신으로 진행 중이던 선택이 지워지면 안 된다")
})

test("F-14(R-IMPL P1/AC-05): 부분 성공(스킨 성공 + 카드 명시적 거부) 뒤에도 아직 저장되지 않은 카드 초안이 지워지지 않고 오류가 표시된다", async () => {
  resetAll()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : flatLoadout())

  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await flushMicrotasks()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  const skinButton = document.querySelector(`button[aria-label^="${otherSkin.name}"]`)
  act(() => { skinButton.click() })

  const otherCard = getPlayerCardItems().find((item) => item.id !== SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID)
  act(() => { useEconomyStore.setState({ entitlements: [{ itemId: otherCard.id, itemType: "PLAYER_CARD_FRAME" }] }) })

  const toggleButton = document.querySelector('button[aria-label="플레이어 카드 미리보기로 전환"]')
  assert.ok(toggleButton)
  act(() => { toggleButton.click() })
  const cardButton = document.querySelector(`button[aria-label^="${otherCard.name}"]`)
  assert.ok(cardButton, "소유한 카드 버튼이 실제 DOM에 렌더돼야 한다")
  act(() => { cardButton.click() })
  assert.equal(cardButton.getAttribute("aria-pressed"), "true")

  postImpl = async (endpoint, body) => {
    if (body.slot === "PLAYER_CARD_FRAME") {
      throw Object.assign(new Error("보유하지 않은 상품은 장착할 수 없습니다."), { code: "ITEM_NOT_OWNED" })
    }
    return { loadout: {} }
  }

  const confirmButton = document.querySelector('button[aria-busy]')
  assert.ok(confirmButton)
  await act(async () => { confirmButton.click() })
  await flushMicrotasks()

  const alert = document.querySelector('[role="alert"]')
  assert.ok(alert, "명시적 거부는 오류 메시지를 화면에 남겨야 한다")
  assert.equal(alert.textContent, "보유하지 않은 상품은 장착할 수 없습니다.")

  const cardButtonAfter = [...document.querySelectorAll('button[aria-pressed]')].find((btn) => btn === cardButton)
  assert.equal(cardButtonAfter.getAttribute("aria-pressed"), "true", "거부된 카드 슬롯의 사용자 선택이 지워지면 안 된다")
})

test("F-14(AC-05/A-06): 저장 확인 버튼을 연속으로 두 번 눌러도 실제 POST는 한 번만 전송된다", async () => {
  resetAll()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : flatLoadout())

  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await flushMicrotasks()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  const skinButton = document.querySelector(`button[aria-label^="${otherSkin.name}"]`)
  act(() => { skinButton.click() })

  let postCalls = 0
  let resolvePost
  postImpl = async () => {
    postCalls += 1
    return new Promise((resolve) => { resolvePost = () => resolve({ loadout: {} }) })
  }

  const confirmButton = document.querySelector('button[aria-busy]')
  act(() => {
    confirmButton.click()
    confirmButton.click()
  })
  await flushMicrotasks()

  assert.equal(postCalls, 1, "연속 클릭이 중복 전송을 일으키면 안 된다")

  await act(async () => {
    resolvePost()
    await flushMicrotasks()
  })
})

test("F-14(AC-03): 저장 확인 중 계정이 전환되면 새 계정 화면에 이전 요청의 결과가 반영되지 않는다", async () => {
  resetAll()
  const gets = countingGet(flatLoadout())
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 0, balanceDiamond: 0 } : gets.impl())

  const onClose = mock.fn()
  render(React.createElement(SkinCardWearOverlay, { open: true, onClose }))
  await flushMicrotasks()

  const otherSkin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  const skinButton = document.querySelector(`button[aria-label^="${otherSkin.name}"]`)
  act(() => { skinButton.click() })

  postImpl = async () => {
    setCurrentUser({ uuid: "user-2" })
    return { loadout: {} }
  }

  const confirmButton = document.querySelector('button[aria-busy]')
  await act(async () => {
    confirmButton.click()
    await flushMicrotasks()
  })

  assert.equal(onClose.mock.callCount(), 0, "계정 전환으로 무효화된 저장은 화면을 닫으면 안 된다(성공으로 오인 금지)")
})

test("F-14 AC-02/AC-03: 계정을 전환하면 새 계정의 실제 소유·장착 상태만 목록에 표시된다", async () => {
  resetAll()
  const premiumSkin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.source === "premium")
  assert.ok(premiumSkin, "테스트 전제: 프리미엄 스킨이 있어야 한다")

  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return { balanceGold: 0, balanceDiamond: 0 }
    if (endpoint.includes("/user-1/")) {
      return {
        entitlements: [{ itemId: premiumSkin.id, itemType: "SKIN" }],
        loadout: { selectedCardFrameId: null, selectedSkinsByJob: { [FIRST_JOB_ID]: premiumSkin.id } },
      }
    }
    return { entitlements: [], loadout: { selectedCardFrameId: null, selectedSkinsByJob: null } }
  }

  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await flushMicrotasks()

  const buttonForUser1 = document.querySelector(`button[aria-label^="${premiumSkin.name}"]`)
  assert.ok(buttonForUser1, "user-1이 보유한 프리미엄 스킨 버튼이 렌더돼야 한다")
  assert.equal(buttonForUser1.hasAttribute("disabled"), false, "보유한 항목은 disabled가 아니어야 한다")
  assert.equal(buttonForUser1.getAttribute("aria-label"), `${premiumSkin.name}, 착용 중`, "user-1은 실제로 이 스킨을 장착 중이어야 한다")

  act(() => { setCurrentUser({ uuid: "user-2" }) })
  await flushMicrotasks()

  const buttonForUser2 = document.querySelector(`button[aria-label^="${premiumSkin.name}"]`)
  assert.ok(buttonForUser2, "계정 전환 뒤에도 같은 스킨 항목이 목록에 있어야 한다")
  assert.equal(buttonForUser2.hasAttribute("disabled"), true, "user-2는 이 스킨을 보유하지 않으므로 disabled여야 한다")
  assert.equal(buttonForUser2.getAttribute("aria-label"), `${premiumSkin.name}, 미보유`, "user-2 화면에 이전 계정의 장착 표시가 남으면 안 된다")
})


test('operator: delayed opening GET must preserve a dirty draft and callback rerenders', async () => {
  resetAll()
  let release
  const pending = new Promise((resolve) => { release = resolve })
  let calls = 0
  getImpl = async () => { calls += 1; return pending }
  const view = render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  const skin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.source === 'basic' && item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  const selected = () => document.querySelector('button[aria-label^="' + skin.name + '"]')
  act(() => selected().click())
  assert.equal(selected().getAttribute('aria-pressed'), 'true')
  await act(async () => { release({ ...flatLoadout(), balanceGold: 0, balanceDiamond: 0 }) })
  await flushMicrotasks()
  assert.equal(selected().getAttribute('aria-pressed'), 'true', 'opening GET erased dirty selection')
  view.rerender(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await flushMicrotasks()
  assert.equal(calls, 2, 'new callback identity restarted opening fetch')
  assert.equal(selected().getAttribute('aria-pressed'), 'true')
})

test('operator: old save completion must not close a reopened wear dialog', async () => {
  resetAll()
  getImpl = async () => ({ ...flatLoadout(), balanceGold: 0, balanceDiamond: 0 })
  let release
  postImpl = () => new Promise((resolve) => { release = resolve })
  let closes = 0
  const onClose = () => { closes += 1 }
  const view = render(React.createElement(SkinCardWearOverlay, { open: true, onClose }))
  await flushMicrotasks()
  const skin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.source === 'basic' && item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  act(() => document.querySelector('button[aria-label^="' + skin.name + '"]').click())
  act(() => document.querySelector('button[aria-busy]').click())
  assert.equal(typeof release, 'function')
  view.rerender(React.createElement(SkinCardWearOverlay, { open: false, onClose }))
  view.rerender(React.createElement(SkinCardWearOverlay, { open: true, onClose }))
  await flushMicrotasks()
  await act(async () => { release({ loadout: {} }) })
  await flushMicrotasks()
  assert.equal(closes, 0, 'old save closed the newly opened dialog')
  assert.ok(document.querySelector('[role="dialog"]'))
})


test('operator: failed reconciliation GET cannot confirm matching cached equipment', async () => {
  resetAll()
  getImpl = async () => ({ ...flatLoadout(), balanceGold: 0, balanceDiamond: 0 })
  let closes = 0
  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => { closes += 1 } }))
  await flushMicrotasks()
  const skin = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.source === 'basic' && item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  act(() => document.querySelector('button[aria-label^="' + skin.name + '"]').click())
  postImpl = async () => {
    useEconomyStore.setState((state) => ({ loadout: { ...state.loadout, selectedSkinsByJob: { [FIRST_JOB_ID]: skin.id } } }))
    throw new Error('reply lost')
  }
  getImpl = async () => { throw new Error('reconciliation unavailable') }
  await act(async () => { document.querySelector('button[aria-busy]').click() })
  await flushMicrotasks()
  assert.equal(closes, 0)
  assert.match(document.querySelector('[role="alert"]').textContent, /저장 결과를 확인하지 못했습니다/)
})


test('operator: editing during opening GET must never save untouched slots', async () => {
  resetAll()
  let release
  const pending = new Promise((resolve) => { release = resolve })
  getImpl = async () => pending
  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  const chosen = getSkinItemsForJob(FIRST_JOB_ID).find((item) => item.source === 'basic' && item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  act(() => document.querySelector('button[aria-label^="' + chosen.name + '"]').click())
  const untouchedJob = SKIN_CARD_WEAR_JOB_TABS[1].id
  const saved = getSkinItemsForJob(untouchedJob).find((item) => item.source === 'basic' && item.id !== getDefaultSkinIdForJob(untouchedJob))
  assert.ok(saved)
  await act(async () => { release({
    ...flatLoadout({ selectedSkinsByJob: { ...buildDefaultSkinsByJob(), [untouchedJob]: saved.id } }),
    balanceGold: 0, balanceDiamond: 0,
  }) })
  await flushMicrotasks()
  const writes = []
  postImpl = async (endpoint, body) => { writes.push(body); return { loadout: {} } }
  await act(async () => document.querySelector('button[aria-busy]').click())
  await flushMicrotasks()
  assert.deepEqual(writes.map(({slot,itemId}) => ({slot,itemId})), [{ slot: 'JOB_SKIN_NOBLE', itemId: chosen.id }], 'untouched server equipment was overwritten by a stale default draft')
})


test('operator: pending save prevents later selection from being silently lost', async () => {
  resetAll()
  getImpl = async () => ({ ...flatLoadout(), balanceGold: 0, balanceDiamond: 0 })
  let release
  postImpl = () => new Promise((resolve) => { release = resolve })
  render(React.createElement(SkinCardWearOverlay, { open: true, onClose: () => {} }))
  await flushMicrotasks()
  const alternatives = getSkinItemsForJob(FIRST_JOB_ID).filter((item) => item.source === 'basic' && item.id !== getDefaultSkinIdForJob(FIRST_JOB_ID))
  const button = (item) => document.querySelector('button[aria-label^="' + item.name + '"]')
  act(() => button(alternatives[0]).click())
  act(() => document.querySelector('button[aria-busy]').click())
  assert.equal(typeof release, 'function')
  act(() => button(alternatives[1]).click())
  assert.equal(button(alternatives[0]).getAttribute('aria-pressed'), 'true', 'selection changed while the preceding draft was being saved')
  assert.equal(button(alternatives[1]).getAttribute('aria-pressed'), 'false')
  await act(async () => release({ loadout: {} }))
})


test("F16 unchanged skin/card confirmation has zero UI SFX and zero equip requests",async()=>{
  resetAll();getImpl=async endpoint=>endpoint.endsWith("/wallet")?{balanceGold:0,balanceDiamond:0}:flatLoadout()
  let posts=0;postImpl=async()=>{posts++;throw Error("unexpected save")}
  const {__setSfxPlayerForTests}=await import("../../../../../shared/hooks/useSfxRuntime.js")
  const events=[];__setSfxPlayerForTests({dispatch:event=>events.push(event)})
  try{
    const view=render(React.createElement(SkinCardWearOverlay,{open:true,onClose:()=>{}}));await flushMicrotasks()
    await act(async()=>{view.getByRole("button",{name:"적용",exact:true}).click()})
    assert.equal(posts,0);assert.deepEqual(events,[])
  }finally{__setSfxPlayerForTests(null)}
})
