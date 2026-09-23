import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-33 E-2(설계도 §2-2) — **계약 변경**: F-13은 이모티콘 "진입 버튼만" 두고 클릭해도 아무
// 일도 일어나지 않는 상태를 이 파일의 시험으로 고정했다(의도된 걸림돌). E-2가 그 뒤의
// 화면(/mypage/emoticons)을 실제로 만들었으므로, "기능 부재"를 고정하던 단언
// (assert.doesNotMatch(source, /Emoticon.*Overlay|Emoticon.*Panel|emoticonOpen/i),
//  no-op 기본값 단언, MyPageLayout이 콜백을 넘기지 않는다는 단언 중 '미연결'의 근거였던 것)
// 은 "이동한다"는 새 계약으로 다시 쓴다. 이모티콘 이동과 무관한 레이아웃·오버레이 단언
// (ProfileEditOverlay·SkinCardWearOverlay)은 그대로 둔다.
//
// 버튼의 실행 본문은 소스 정규식이 아니라 실제 jsdom 렌더 + 클릭으로 검증한다 —
// frontend/.../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs가 이미 만든
// module.register() ESM 훅을 재사용한다. useNavigate는 MemoryRouter 안에서 실제
// react-router-dom 구현을 그대로 쓰고, 이동 결과는 라우터의 현재 위치로 확인한다(navigate를
// 대역으로 바꾸면 "그 함수를 불렀다"만 증명하고 실제 이동 경로는 증명하지 못한다).
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" })
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
register(new URL("../../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, fireEvent, cleanup } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route, useLocation } = await import("react-router-dom")
test.afterEach(() => cleanup())

const { default: EmoticonEntryButton } = await import("../EmoticonEntryButton.jsx")

const buttonUrl = new URL("../EmoticonEntryButton.jsx", import.meta.url)
const layoutUrl = new URL("../../MyPageLayout.jsx", import.meta.url)

/** 지금 라우터가 가리키는 경로를 화면에 그대로 찍는다 — 이동을 값으로 확인하기 위한 표식. */
function LocationProbe() {
  const location = useLocation()
  return React.createElement("span", { "data-testid": "location" }, location.pathname)
}

/** MyPageLayout이 실제로 쓰는 방식(props 없음)으로 버튼을 라우터 아래 마운트한다. */
const renderInRouter = (props) => render(
  React.createElement(
    MemoryRouter,
    { initialEntries: ["/mypage"] },
    React.createElement(
      Routes,
      null,
      React.createElement(Route, {
        path: "*",
        element: React.createElement(
          React.Fragment,
          null,
          React.createElement(EmoticonEntryButton, props),
          React.createElement(LocationProbe),
        ),
      }),
    ),
  ),
)

test("F-33 E-2: 콜백 없이 마운트한 EmoticonEntryButton(MyPageLayout이 실제로 쓰는 방식)을 클릭하면 /mypage/emoticons로 이동한다", () => {
  const { getByText, getByTestId } = renderInRouter()
  assert.equal(getByTestId("location").textContent, "/mypage", "클릭 전에는 아직 마이페이지에 있어야 한다")

  fireEvent.click(getByText("이모티콘"))

  assert.equal(
    getByTestId("location").textContent, "/mypage/emoticons",
    "이모티콘 버튼은 이모티콘 관리 화면으로 이동해야 한다(F-13의 no-op 계약을 대체한다)",
  )
})

test("F-33 E-2: onOpenEmoticons를 넘기면 그 콜백만 호출되고 라우트는 이동하지 않는다", () => {
  let calls = 0
  const { getByText, getByTestId } = renderInRouter({ onOpenEmoticons: () => { calls += 1 } })

  fireEvent.click(getByText("이모티콘"))

  assert.equal(calls, 1, "콜백을 넘기면 그 콜백이 정확히 한 번 호출되어야 한다")
  assert.equal(getByTestId("location").textContent, "/mypage", "콜백을 넘기면 이동은 일어나지 않는다")
})

test("EmoticonEntryButton은 기존 MyPageFramedButton만 재사용한다(자체 탭·모달·슬롯 컴포넌트를 만들지 않는다)", async () => {
  const source = await readFile(buttonUrl, "utf8")
  assert.match(source, /import MyPageFramedButton from ".\/MyPageFramedButton\.jsx"/)
  assert.match(source, /<MyPageFramedButton label="이모티콘" onClick=\{handleClick\} \/>/)
  // 팔레트 화면 자체는 별도 라우트(EmoticonPalettePage)가 맡는다 — 이 버튼은 이동만 한다.
  assert.doesNotMatch(source, /useState/)
  assert.doesNotMatch(source, /Modal|Overlay|Panel|Grid/)
})

test("F-33 E-2: EmoticonEntryButton의 기본 동작은 /mypage/emoticons 이동이다(더 이상 no-op 기본값이 아니다)", async () => {
  const source = await readFile(buttonUrl, "utf8")
  assert.match(source, /useNavigate/, "이동은 react-router의 useNavigate로 한다")
  assert.match(source, /navigate\("\/mypage\/emoticons"\)/, "이동 대상 경로가 라우터 잠금(ROUTE_WIRING_LOCK)과 같아야 한다")
  assert.doesNotMatch(source, /onOpenEmoticons\s*=\s*\(\)\s*=>\s*\{\}/, "no-op 기본값은 제거됐다 — 콜백이 없으면 이동한다")
})

test("MyPageLayout은 EmoticonEntryButton을 props 없이 마운트한다(이동은 버튼 자신의 기본 동작이다)", async () => {
  const source = await readFile(layoutUrl, "utf8")
  assert.match(source, /<EmoticonEntryButton \/>/, "레이아웃은 콜백 없이 버튼만 렌더한다")
  assert.doesNotMatch(source, /onOpenEmoticons=/, "레이아웃이 콜백을 넘기면 기본 이동 경로가 가려진다")
})

test("MyPageLayout은 프로필 수정·스킨카드 장착의 기존 오버레이 배선을 그대로 둔다", async () => {
  const source = await readFile(layoutUrl, "utf8")
  assert.match(source, /<ProfileEditOverlay open=\{profileEditOpen\} onClose=\{\(\) => setProfileEditOpen\(false\)\} \/>/)
  assert.match(source, /<SkinCardWearOverlay open=\{skinCardWearOpen\} onClose=\{\(\) => setSkinCardWearOpen\(false\)\} \/>/)
  // 이모티콘은 오버레이가 아니라 별도 화면(/mypage/emoticons)이다 — 레이아웃에 전용
  // 오버레이·패널 상태가 생기면 두 진입 경로가 갈라진다.
  assert.doesNotMatch(source, /Emoticon.*Overlay|Emoticon.*Panel|emoticonOpen/i)
})
