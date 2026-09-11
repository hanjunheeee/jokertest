import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-13 AC-06 — 마이페이지에 이모티콘 "진입 버튼만" 추가한다. 버튼 클릭 이후의 탭 내용·
// 모달·장착 슬롯·보유 목록·구매/장착/전송 기능은 이 슬라이스 범위 밖이라 만들지 않는다
// (계획 A-08 반증 조건).
//
// F-13(CODEX-4) 재검토: 버튼 자신의 실행 본문(클릭 시 실제로 무슨 일이 일어나는가)은 더
// 이상 소스 정규식이 아니라 실제 jsdom 렌더 + 클릭 이벤트로 검증한다 —
// frontend/.../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs가 이미 만든
// module.register() ESM 훅을 재사용한다. EmoticonEntryButton은 MyPageFramedButton만
// 재사용하는 자기완결 컴포넌트(store/네트워크 의존 없음)라 그대로 마운트할 수 있다.
// MyPageLayout 전체는 useMyProfile·economy/profileCustomization store·라우팅까지 끌고 와
// 이 시험의 관심사(콜백 미전달 배선 한 줄)를 넘는 과도한 mock이 필요하므로, "버튼에
// onOpenEmoticons를 넘기지 않는다"는 배선 자체는 source 검증으로 유지한다 — 다만 그 배선이
// 실제로 무엇을 뜻하는지(콜백 없는 버튼이 클릭해도 안전하다는 것)는 위 실제 렌더 시험이
// 증명한다.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
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
test.afterEach(() => cleanup())

const { default: EmoticonEntryButton } = await import("../EmoticonEntryButton.jsx")

const buttonUrl = new URL("../EmoticonEntryButton.jsx", import.meta.url)
const layoutUrl = new URL("../../MyPageLayout.jsx", import.meta.url)

test("실제 EmoticonEntryButton을 콜백 없이 마운트하고 클릭하면(MyPageLayout이 실제로 쓰는 방식) 아무 예외도 없고 새 DOM(탭·모달·슬롯)도 생기지 않는다", () => {
  const { container, getByText } = render(React.createElement(EmoticonEntryButton))
  const beforeChildCount = container.querySelectorAll("*").length

  assert.doesNotThrow(() => fireEvent.click(getByText("이모티콘")))

  assert.equal(container.querySelectorAll("*").length, beforeChildCount, "클릭 이후에도 DOM 노드 수가 그대로여야 한다(새 탭/모달/슬롯이 생기지 않았다는 뜻)")
})

test("실제 EmoticonEntryButton에 onOpenEmoticons를 넘기면 클릭 시 정확히 그 콜백만 한 번 호출된다(버튼 자체의 연결 능력은 정상)", () => {
  let calls = 0
  const { getByText } = render(React.createElement(EmoticonEntryButton, { onOpenEmoticons: () => { calls += 1 } }))

  fireEvent.click(getByText("이모티콘"))
  assert.equal(calls, 1, "콜백을 넘기면 실제로 호출되어야 한다 — 버튼 자체가 아니라 MyPageLayout이 넘기지 않는 것이 미연결의 이유임을 구분한다")
})

test("EmoticonEntryButton은 기존 MyPageFramedButton만 재사용한다(새 탭·모달·슬롯 컴포넌트를 만들지 않는다)", async () => {
  const source = await readFile(buttonUrl, "utf8")
  assert.match(source, /import MyPageFramedButton from ".\/MyPageFramedButton\.jsx"/)
  assert.match(source, /<MyPageFramedButton label="이모티콘" onClick=\{onOpenEmoticons\} \/>/)
  // 후속 UI(탭/모달/슬롯/보유 목록)를 암시하는 상태·컴포넌트가 이 파일에 없어야 한다.
  assert.doesNotMatch(source, /useState/)
  assert.doesNotMatch(source, /Modal|Overlay|Panel|Grid/)
})

test("EmoticonEntryButton의 onOpenEmoticons는 선택 값이고 기본값이 아무 것도 하지 않는 no-op이다", async () => {
  const source = await readFile(buttonUrl, "utf8")
  assert.match(source, /onOpenEmoticons\s*=\s*\(\)\s*=>\s*\{\}/, "콜백을 넘기지 않으면 클릭해도 아무 일도 일어나지 않아야 한다")
})

test("MyPageLayout은 EmoticonEntryButton에 onOpenEmoticons를 넘기지 않는다(클릭해도 미연결 상태 유지)", async () => {
  const source = await readFile(layoutUrl, "utf8")
  assert.match(source, /<EmoticonEntryButton \/>/, "콜백 없이 버튼만 렌더해야 한다 — onOpenEmoticons를 넘기면 후속 기능이 연결된 것처럼 보인다")
  assert.doesNotMatch(source, /onOpenEmoticons=/, "MyPageLayout이 onOpenEmoticons를 넘기면 이 슬라이스 범위 밖인 후속 UI가 실제로 열리게 된다")
})

test("MyPageLayout은 프로필 수정·스킨카드 장착과 같은 자리에 이모티콘 버튼을 추가만 했을 뿐, 다른 버튼의 기존 오버레이 배선은 그대로 둔다", async () => {
  const source = await readFile(layoutUrl, "utf8")
  assert.match(source, /<ProfileEditOverlay open=\{profileEditOpen\} onClose=\{\(\) => setProfileEditOpen\(false\)\} \/>/)
  assert.match(source, /<SkinCardWearOverlay open=\{skinCardWearOpen\} onClose=\{\(\) => setSkinCardWearOpen\(false\)\} \/>/)
  // 이모티콘 전용 오버레이/패널은 아직 존재하지 않는다.
  assert.doesNotMatch(source, /Emoticon.*Overlay|Emoticon.*Panel|emoticonOpen/i)
})
