import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// 이 저장소의 node:test 실행에는 기본 JSX 로더가 없다 — testSupport/jsxNodeLoaderHooks.mjs가
// 만든 module.register() ESM 훅(TypeScript transpileModule + "@/" alias 해석)을 재사용해 실제
// GeneralSettingsTab.jsx를 그대로 마운트한다(기존 emoticonEntry.test.js와 같은 관례).
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
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
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, fireEvent, cleanup, act } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: GeneralSettingsTab } = await import("../GeneralSettingsTab.jsx")
const { useSettingsStore, buildDefaultSoundVolumes, buildDefaultGeneralChecks } = await import(
  "../../../store/settingsStore.js"
)
const { GENERAL_SETTING_TEXT_SIZE } = await import("../../../constants/generalSettings.js")

// jsdom은 Fullscreen API를 구현하지 않는다 — useFullscreen.js가 실제로 호출하는
// document.documentElement.requestFullscreen/document.exitFullscreen/fullscreenElement를
// 직접 흉내내 AC-03(성공·실패·해제)을 실제 이벤트 흐름으로 검증한다.
let fullscreenElement = null
let requestBehavior = () => Promise.resolve()
let exitBehavior = () => Promise.resolve()

Object.defineProperty(document, "fullscreenElement", {
  get: () => fullscreenElement,
  configurable: true,
})
document.documentElement.requestFullscreen = () => requestBehavior()
document.exitFullscreen = () => exitBehavior()

function fireFullscreenChange() {
  document.dispatchEvent(new dom.window.Event("fullscreenchange"))
}

function resetFullscreenStub() {
  fullscreenElement = null
  requestBehavior = () => {
    fullscreenElement = document.documentElement
    fireFullscreenChange()
    return Promise.resolve()
  }
  exitBehavior = () => {
    fullscreenElement = null
    fireFullscreenChange()
    return Promise.resolve()
  }
}

test.beforeEach(() => {
  resetFullscreenStub()
  localStorage.clear()
  useSettingsStore.setState({
    volumes: buildDefaultSoundVolumes(),
    generalChecks: buildDefaultGeneralChecks(),
    generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
    chatChecks: null,
    chatTextSize: null,
  })
})

test("F-15(AC-01): 귓속말 알림 항목은 없고 친구 초대·게임 초대·시스템 알림은 그대로 남는다", () => {
  const { queryByRole } = render(React.createElement(GeneralSettingsTab))

  assert.equal(queryByRole("checkbox", { name: "귓속말" }), null, "귓속말 항목이 남아 있으면 안 된다")
  assert.notEqual(queryByRole("checkbox", { name: "친구 초대" }), null)
  assert.notEqual(queryByRole("checkbox", { name: "게임 초대" }), null)
  assert.notEqual(queryByRole("checkbox", { name: "시스템 알림" }), null)
})

test("F-15(AC-03): 전체화면 요청이 성공하면(fullscreenchange 발생) 체크박스가 켜진다", async () => {
  const { getByRole } = render(React.createElement(GeneralSettingsTab))
  const checkbox = getByRole("checkbox", { name: "전체화면 전환" })
  assert.equal(checkbox.getAttribute("aria-checked"), "false")

  await act(async () => {
    fireEvent.click(checkbox)
    await Promise.resolve()
  })

  assert.equal(checkbox.getAttribute("aria-checked"), "true")
})

test("F-15(AC-03): 전체화면 요청이 실패하면 체크박스는 켜지지 않는다", async () => {
  requestBehavior = () => Promise.reject(new Error("사용자가 거부했습니다"))
  const { getByRole } = render(React.createElement(GeneralSettingsTab))
  const checkbox = getByRole("checkbox", { name: "전체화면 전환" })

  await act(async () => {
    fireEvent.click(checkbox)
    await Promise.resolve()
  })

  assert.equal(checkbox.getAttribute("aria-checked"), "false")
})

test("F-15(AC-03): 브라우저 밖에서(Esc 등) 전체화면이 해제되면 체크박스도 꺼진다", async () => {
  const { getByRole } = render(React.createElement(GeneralSettingsTab))
  const checkbox = getByRole("checkbox", { name: "전체화면 전환" })

  await act(async () => {
    fireEvent.click(checkbox)
    await Promise.resolve()
  })
  assert.equal(checkbox.getAttribute("aria-checked"), "true")

  // 우리 쪽 exitFullscreen()을 거치지 않고, 브라우저가 스스로 fullscreenElement를 비운 뒤
  // fullscreenchange만 쏘는 "외부 해제" 경로를 흉내낸다.
  await act(async () => {
    fullscreenElement = null
    fireFullscreenChange()
  })

  assert.equal(checkbox.getAttribute("aria-checked"), "false")
})

test("F-15(AC-02): 알림 체크박스를 바꾸면 실제로 체크 상태가 바뀌고, store에도 반영된다", () => {
  const { getByRole } = render(React.createElement(GeneralSettingsTab))
  const checkbox = getByRole("checkbox", { name: "친구 초대" })
  assert.equal(checkbox.getAttribute("aria-checked"), "true")

  fireEvent.click(checkbox)

  assert.equal(checkbox.getAttribute("aria-checked"), "false")
  assert.equal(useSettingsStore.getState().generalChecks["friend-invite"], false)
})

test("F-15(AC-02): 텍스트 크기 슬라이더를 옮기면 store 값이 바뀌고 화면 표시도 그 값을 보여준다", () => {
  const { getByRole, getByText } = render(React.createElement(GeneralSettingsTab))
  const slider = getByRole("slider", { name: GENERAL_SETTING_TEXT_SIZE.label })

  fireEvent.change(slider, { target: { value: String(GENERAL_SETTING_TEXT_SIZE.max) } })

  assert.equal(useSettingsStore.getState().generalTextSize, GENERAL_SETTING_TEXT_SIZE.max)
  assert.notEqual(getByText(String(GENERAL_SETTING_TEXT_SIZE.max)), null)
})

test("F-15(AC-02): 도움말 다시 보기를 누르면 튜토리얼 오버레이가 실제로 열린다", () => {
  const { getByText } = render(React.createElement(GeneralSettingsTab))

  fireEvent.click(getByText("다시 보기"))

  const dialog = document.querySelector('[role="dialog"][aria-label="게임 플레이 튜토리얼"]')
  assert.notEqual(dialog, null, "튜토리얼 오버레이가 열려야 한다")
})

test("F-15(AC-02): 설정 초기화를 누르면 체크·텍스트 크기가 기본값으로 되돌아가고 화면에도 반영된다", () => {
  const { getByRole, getByText } = render(React.createElement(GeneralSettingsTab))
  const friendInvite = getByRole("checkbox", { name: "친구 초대" })
  const slider = getByRole("slider", { name: GENERAL_SETTING_TEXT_SIZE.label })

  fireEvent.click(friendInvite)
  fireEvent.change(slider, { target: { value: String(GENERAL_SETTING_TEXT_SIZE.min) } })
  assert.equal(friendInvite.getAttribute("aria-checked"), "false")

  fireEvent.click(getByText("초기화"))

  assert.equal(friendInvite.getAttribute("aria-checked"), "true")
  assert.equal(useSettingsStore.getState().generalTextSize, GENERAL_SETTING_TEXT_SIZE.defaultValue)
  assert.notEqual(getByText(String(GENERAL_SETTING_TEXT_SIZE.defaultValue)), null)
})

test("F-15(AC-06): 새로고침을 흉내내도(같은 store를 다시 마운트) 바뀐 설정이 그대로 보인다", async () => {
  const first = render(React.createElement(GeneralSettingsTab))
  fireEvent.click(first.getByRole("checkbox", { name: "친구 초대" }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  first.unmount()

  // 실제 새로고침은 모듈을 다시 평가하지만, 여기서는 "값이 store가 아니라 컴포넌트
  // 로컬 state에 남아 있지 않다"만 확인해도 충분하다 — 로컬 state였다면 언마운트 시 사라진다.
  const second = render(React.createElement(GeneralSettingsTab))
  assert.equal(second.getByRole("checkbox", { name: "친구 초대" }).getAttribute("aria-checked"), "false")

  const raw = localStorage.getItem("settings-storage")
  assert.ok(raw && JSON.parse(raw).state.generalChecks["friend-invite"] === false)
})

// F-15(AC-02): "텍스트 크기" 설정의 실제 소비자.
//
// 앱 전체(인게임 제외)의 명시적 font-size 선언은 공용 .app-text-scaled 유틸리티 +
// --app-text-size 커스텀 속성으로 배율을 받는다(index.css 참고). 설정 화면도 다른 화면과
// 완전히 같은 방식을 쓰며, 원래 크기 값을 한 글자도 바꾸지 않고 그대로 커스텀 속성에
// 옮긴다 — 아래 시험은 실제 렌더된 요소가 그 형태인지 확인한다.
//
// 이전에 실패했던 방식들:
//   - .app-text-scalable { font-size: calc(1em * var(--app-text-scale)) }: @layer components
//     규칙이라 같은 요소의 Tailwind font-size 유틸리티(@layer utilities)에 밀렸고, 1em은
//     "부모 크기"라 적용되더라도 원래 clamp 크기가 아닌 값이 됐다.
//   - body의 font-size 상속만: 스스로 font-size를 지정하는 요소에는 닿지 않는다.
function appTextSizeValue(className) {
  const match = className.match(/\[--app-text-size:([^\]]+)\]/)
  assert.notEqual(match, null, `--app-text-size 선언이 없습니다: ${className}`)
  return match[1]
}

function assertScaledFontSize(element, originalFontSize, label) {
  const classNames = element.className.split(/\s+/)

  assert.ok(
    classNames.includes("app-text-scaled"),
    `${label}: 배율 유틸리티(app-text-scaled)를 달아야 실제 크기가 설정을 따른다`,
  )
  assert.ok(
    !classNames.includes("app-text-scalable"),
    `${label}: 유틸리티에 밀리는 .app-text-scalable에 다시 의존하면 안 된다`,
  )
  assert.equal(
    (element.className.match(/\[--app-text-size:/g) ?? []).length,
    1,
    `${label}: --app-text-size가 둘 이상이면 어느 쪽이 이길지 알 수 없다`,
  )
  assert.equal(
    element.className.match(/(?:^|\s)text-\[(?:clamp\(|[0-9.]+(?:rem|px|em)\])/),
    null,
    `${label}: 배율 없는 기본 font-size 유틸리티가 남아 있으면 배율이 무시된다`,
  )

  // 원래 크기 값이 한 글자도 바뀌지 않아야 기본 배율(1)에서 기존 화면과 동일하다.
  assert.equal(
    appTextSizeValue(element.className),
    originalFontSize,
    `${label}: 원래 크기 값을 그대로 옮겨야 한다`,
  )
}

test("F-15(AC-02): 본문 라벨이 공용 배율 유틸리티로 원래 clamp 크기를 그대로 싣는다", () => {
  const { getByText } = render(React.createElement(GeneralSettingsTab))

  // 원래 라벨 크기 clamp(1.02rem,1.5vw,1.18rem) — 세 항 모두 그대로 남아 있어야 한다.
  assertScaledFontSize(getByText("친구 초대"), "clamp(1.02rem,1.5vw,1.18rem)", "본문 라벨")
})

test("F-15(AC-02): 섹션 제목도 같은 방식으로 배율을 받는다", () => {
  const { getByText } = render(React.createElement(GeneralSettingsTab))

  assertScaledFontSize(getByText("알림"), "clamp(0.88rem,1.15vw,1rem)", "섹션 제목")
})

test("F-15(AC-02): 배율은 index.css의 한 규칙에서만 곱해지고 fallback이 1이다", () => {
  const indexCss = readFileSync(new URL("../../../../../app/index.css", import.meta.url), "utf8")

  // calc(var(--app-text-size,...) * var(--app-text-scale,1)) — 배율 변수가 없을 때 1이어야
  // 설정을 저장한 적 없는 화면이 기존과 동일하다(calc(x*1) === x).
  //
  // @layer utilities의 손수 클래스가 아니라 @utility로 선언해야 한다 — 손수 클래스에는
  // Tailwind가 variant·important를 붙이지 못해 [&_p]:!app-text-scaled 같은 후보가 아무
  // CSS도 만들지 못하고 버려진다(F-15 AC-02 반송 수정). 선언 본문은 그대로다.
  assert.match(
    indexCss,
    /@utility\s+app-text-scaled\s*\{\s*font-size:\s*calc\(var\(--app-text-size,\s*1rem\)\s*\*\s*var\(--app-text-scale,\s*1\)\);?\s*\}/,
  )

  // 곱셈이 일어나는 곳은 여전히 한 군데뿐이어야 한다 — 여러 규칙이 각자 곱하면 같은
  // 요소에 배율이 겹쳐 적용된다.
  const multipliers =
    indexCss.match(/var\(--app-text-size[^)]*\)\s*\*\s*var\(--app-text-scale/g) ?? []
  assert.equal(multipliers.length, 1, "배율을 곱하는 규칙은 하나여야 한다")
})
