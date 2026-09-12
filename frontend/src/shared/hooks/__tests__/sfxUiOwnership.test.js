import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// F-16 AC-01/AC-04 · UI 입력 소유권 계약.
//
// **실제 production 런타임 코드**(useSfxRuntime이 설치하는 document capture 단일 소유자와
// dispatchUiSfx)를 jsdom에 마운트해, 실제 DOM 이벤트를 흘려보내고 재생기가 받은 사건을
// 센다. 핸들러를 복제하거나 소스를 정규식으로 훑지 않는다.
//
// 검사하는 계약(계획의 "입력 소유자 확정" 절):
//   - 일반 활성 버튼/링크는 capture 하나가 소유한다(물리 활성화당 최대 1).
//   - disabled/aria-disabled/inert/submit 제어와 data-sfx-owner="explicit" 영역은 제외한다.
//   - data-sfx-kind 표식이 의미(확인/취소)를 정한다.
//   - 같은 native Event는 한 번만 소비된다(키보드가 만든 click도 같은 이벤트 하나다).
//   - native confirm 호출 버튼은 explicit 표식으로 제외하고 결과 콜백만 소리를 낸다.
//   - 소리는 업무 콜백의 예외를 전파하지 않고, 언마운트 뒤에는 아무것도 울리지 않는다.
// ---------------------------------------------------------------------------

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
const { useSfxRuntime, dispatchUiSfx, __setSfxPlayerForTests } = await import("../useSfxRuntime.js")
const { createExitConfirmController } = await import(
  "../../../domains/game/ingame/utils/createExitConfirmController.js"
)

/** 재생기 대역 — dispatch된 사건만 기록한다(매체·자산과 무관하게 소유권만 본다). */
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

/** 비동기 후속 작업까지 완료한 뒤 사건 수를 확인한다. */
async function flush() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

/**
 * 실제 런타임을 마운트하고 기록용 재생기를 꽂는다.
 * useSfxRuntime의 effect가 진짜 재생기를 설치한 **뒤에** 갈아끼워야 하므로 순서가 중요하다.
 */
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

  // form 안의 submit 버튼 — 확인음은 form submit 경계가 소유하므로 클릭은 제외된다.
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
  // 겹친 리스너(backdrop + 닫기 등)가 같은 이벤트로 각각 명시 dispatch를 시도하는 상황.
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

  // 마우스 클릭이든 Enter든 브라우저는 같은 submit 이벤트 하나를 만든다 — 그 경계를 직접
  // 흘려보낸다(submit 버튼 클릭이 capture에서 제외된다는 것은 위 disabled/submit 시험이
  // 따로 확인한다).
  const submitEvent = new dom.window.Event("submit", { bubbles: true, cancelable: true })
  form.dispatchEvent(submitEvent)
  // 같은 제출 이벤트가 다시 전달돼도(중첩 리스너 등) 두 번째는 조용히 무시된다.
  dispatchUiSfx("ui-confirm", submitEvent)
  await flush()

  assert.deepEqual(runtime.kinds(), ["ui-confirm"])
  runtime.unmount()
})

test("AC-01 native confirm 호출 버튼을 제외하고 결과 콜백만 한 번 울린다", async () => {
  const runtime = mountRuntime()
  // Chrome은 capture와 React 콜백 사이에 microtask를 실행할 수 있다.
  // 실제 호출 버튼을 capture에서 제외해야 이벤트 루프 순서와 무관하게 한 번이다.
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
  // 물리 활성화 단위 ID는 매번 달라야 한다(같으면 재생기가 중복으로 묻어버린다).
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

  // 소리는 실패했지만 업무 콜백은 그대로 실행됐고, 예외가 바깥으로 새지 않았다.
  assert.equal(calls, 1)
  assert.deepEqual(businessCalls, ["clicked"])

  rendered.unmount()
  __setSfxPlayerForTests(null)
})

test("AC-06 언마운트 뒤에는 capture가 제거되어 아무 소리도 나지 않는다", async () => {
  const runtime = mountRuntime()
  const button = withButton()
  runtime.unmount()

  // 런타임이 사라진 뒤의 입력 — 리스너도 재생기도 없다.
  const after = recordingPlayer()
  __setSfxPlayerForTests(after.player)
  button.click()
  await flush()
  __setSfxPlayerForTests(null)

  assert.deepEqual(after.kinds(), [])
})

// ---------------------------------------------------------------------------
// native confirm 소유자 — 실제 controller 코드로 확인/취소와 업무 호출 수를 함께 센다
// ---------------------------------------------------------------------------

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
  // 취소는 leave 0, 승인은 leave 1 — 기존 계약 그대로다.
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
