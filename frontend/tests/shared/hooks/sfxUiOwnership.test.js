import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://127.0.0.1:5183",
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MouseEvent", dom.window.MouseEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")
const { useSfxRuntime, dispatchUiSfx, __setSfxPlayerForTests } = await import("../../../src/shared/hooks/useSfxRuntime.js")
const { createExitConfirmController } = await import(
  "../../../src/domains/game/ingame/utils/createExitConfirmController.js"
)

function recordingPlayer() {
  const events = []
  return {
    events,
    kinds: () => events.map((event) => event.kind),
    player: {
      dispatch(event) {
        events.push(event)
        return { status: "accepted", reason: null, completion: Promise.resolve("played") }
      },
      claimAudio: () => ({ status: "suppressed", reason: null, attach() {}, release() {} }),
      getMix: () => ({ gain: 0.8, muted: false }),
      subscribeMix: () => () => {},
      getSilenceLog: () => [],
      syncScope() {},
      refreshMix() {},
      dispose() {},
    },
  }
}

async function flush() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

function mountRuntime() {
  const rendered = renderHook(() => useSfxRuntime())
  const recorder = recordingPlayer()
  __setSfxPlayerForTests(recorder.player)
  return {
    ...recorder,
    unmount() {
      rendered.unmount()
      __setSfxPlayerForTests(null)
    },
  }
}

function withButton(attributes = {}, onClick) {
  const button = document.createElement("button")
  button.type = "button"
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value)
  if (onClick) button.addEventListener("click", onClick)
  document.body.appendChild(button)
  return button
}

test.afterEach(() => {
  document.body.innerHTML = ""
})

test("AC-01 일반 활성 버튼 클릭은 capture 하나가 소유해 정확히 한 번 울린다", async () => {
  const runtime = mountRuntime()
  const button = withButton()

  button.click()
  await flush()

  assert.deepEqual(runtime.kinds(), ["ui-click"])
  runtime.unmount()
})

test("AC-01 data-sfx-kind 표식이 확인/취소 의미를 정한다", async () => {
  const runtime = mountRuntime()
  withButton({ "data-sfx-kind": "ui-cancel" }).click()
  withButton({ "data-sfx-kind": "ui-confirm" }).click()
  await flush()

  assert.deepEqual(runtime.kinds(), ["ui-cancel", "ui-confirm"])
  runtime.unmount()
})

test("AC-01 disabled·aria-disabled·inert·submit 제어는 소리를 내지 않는다", async () => {
  const runtime = mountRuntime()

  const disabled = withButton()
  disabled.disabled = true
  disabled.click()

  withButton({ "aria-disabled": "true" }).click()
  withButton({ inert: "" }).click()

  const form = document.createElement("form")
  const submit = document.createElement("button")
  submit.type = "submit"
  form.appendChild(submit)
  document.body.appendChild(form)
  submit.click()

  await flush()
  assert.deepEqual(runtime.kinds(), [])
  runtime.unmount()
})

test("AC-01 data-sfx-owner=explicit 영역은 바깥 capture가 무조건 제외한다", async () => {
  const runtime = mountRuntime()
  const wrapper = document.createElement("div")
  wrapper.setAttribute("data-sfx-owner", "explicit")
  const inner = document.createElement("button")
  inner.type = "button"
  wrapper.appendChild(inner)
  document.body.appendChild(wrapper)

  inner.click()
  await flush()

  assert.deepEqual(runtime.kinds(), [])
  runtime.unmount()
})

test("AC-04 같은 native Event를 여러 리스너가 공유해도 소리는 한 번이다", async () => {
  const runtime = mountRuntime()
  const button = withButton({ "data-sfx-owner": "explicit" }, (event) => {
    dispatchUiSfx("ui-cancel", event)
    dispatchUiSfx("ui-cancel", event)
  })

  button.click()
  await flush()

  assert.deepEqual(runtime.kinds(), ["ui-cancel"])
  runtime.unmount()
})

test("AC-01 form submit 경계가 확인음을 소유하고 같은 제출에 두 번 울리지 않는다", async () => {
  const runtime = mountRuntime()
  const form = document.createElement("form")
  const submit = document.createElement("button")
  submit.type = "submit"
  form.appendChild(submit)
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    dispatchUiSfx("ui-confirm", event)
  })
  document.body.appendChild(form)

  const submitEvent = new dom.window.Event("submit", { bubbles: true, cancelable: true })
  form.dispatchEvent(submitEvent)
  dispatchUiSfx("ui-confirm", submitEvent)
  await flush()

  assert.deepEqual(runtime.kinds(), ["ui-confirm"])
  runtime.unmount()
})

test("AC-01 native confirm 호출 버튼을 제외하고 결과 콜백만 한 번 울린다", async () => {
  const runtime = mountRuntime()
  const button = withButton({ "data-sfx-owner": "explicit" }, () => {
    dispatchUiSfx("ui-confirm")
  })

  button.click()
  await flush()

  assert.deepEqual(runtime.kinds(), ["ui-confirm"])
  runtime.unmount()
})

test("AC-04 반복 입력은 물리 활성화마다 한 번씩이고 누적되지 않는다", async () => {
  const runtime = mountRuntime()
  const button = withButton()

  button.click()
  await flush()
  button.click()
  await flush()
  button.click()
  await flush()

  assert.deepEqual(runtime.kinds(), ["ui-click", "ui-click", "ui-click"])
  const ids = new Set(runtime.events.map((event) => event.eventId))
  assert.equal(ids.size, 3)
  runtime.unmount()
})

test("AC-06 재생기가 던져도 클릭 처리가 멈추지 않는다", async () => {
  const rendered = renderHook(() => useSfxRuntime())
  let calls = 0
  __setSfxPlayerForTests({
    dispatch() {
      calls += 1
      throw new Error("재생기 실패(테스트 주입)")
    },
  })
  const businessCalls = []
  const button = withButton({}, () => businessCalls.push("clicked"))

  assert.doesNotThrow(() => button.click())
  await flush()

  assert.equal(calls, 1)
  assert.deepEqual(businessCalls, ["clicked"])

  rendered.unmount()
  __setSfxPlayerForTests(null)
})

test("AC-06 언마운트 뒤에는 capture가 제거되어 아무 소리도 나지 않는다", async () => {
  const runtime = mountRuntime()
  const button = withButton()
  runtime.unmount()

  const after = recordingPlayer()
  __setSfxPlayerForTests(after.player)
  button.click()
  await flush()
  __setSfxPlayerForTests(null)

  assert.deepEqual(after.kinds(), [])
})

test("AC-01 나가기 확인은 confirm 반환 경계가 소유하고 기존 leave 계약을 유지한다", () => {
  const decisions = []
  const leaves = []

  const approve = createExitConfirmController({
    confirm: () => true,
    requestLeave: () => leaves.push("leave"),
    onDecision: (kind) => decisions.push(kind),
  })
  assert.equal(approve(), true)

  const cancel = createExitConfirmController({
    confirm: () => false,
    requestLeave: () => leaves.push("leave"),
    onDecision: (kind) => decisions.push(kind),
  })
  assert.equal(cancel(), false)

  assert.deepEqual(decisions, ["ui-confirm", "ui-cancel"])
  assert.deepEqual(leaves, ["leave"])
})

test("AC-06 소리 통지가 던져도 나가기 판단과 leave 호출은 바뀌지 않는다", () => {
  const leaves = []
  const controller = createExitConfirmController({
    confirm: () => true,
    requestLeave: () => leaves.push("leave"),
    onDecision: () => {
      throw new Error("소리 실패(테스트 주입)")
    },
  })

  assert.equal(controller(), true)
  assert.deepEqual(leaves, ["leave"])
})
