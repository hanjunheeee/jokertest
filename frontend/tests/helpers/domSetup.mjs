// 화면 시험 공통 준비 파일, jsdom(가짜 브라우저 화면) 전역값 + JSX·@/ 길 풀기 + vite 환경값 흉내를 한 번에 켬
// 화면 부품·훅 시험이 맨 위에서 import 하고, 시험 대상은 그 뒤 await import()로 부름 (정적 import는 이 파일보다 먼저 풀려서)
//
// 쓰는 법
//   import { dom } from "../helpers/domSetup.mjs"
//   const { render, screen, fireEvent, cleanup } = await import("@testing-library/react")
//   const { default: Thing } = await import("../../src/domains/....jsx")
//   test.afterEach(() => cleanup())
// 시계: mock.timers.enable({ apis: ["setTimeout"] }) 를 쓰면 창의 setTimeout도 같이 따라감
// 못 보는 것: 색·가려짐·크기 (jsdom은 그림을 안 그림) → "보임"은 브라우저 시험 e2e/helpers/visible.js 몫
import { register } from "node:module"
import { JSDOM } from "jsdom"

export const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

for (const name of ["window", "document", "navigator"]) installDomGlobal(name, name === "window" ? dom.window : dom.window[name])
for (const name of ["HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "getComputedStyle"]) {
  installDomGlobal(name, dom.window[name])
}
installDomGlobal("requestAnimationFrame", (cb) => globalThis.setTimeout(() => cb(0), 0))
installDomGlobal("cancelAnimationFrame", (id) => globalThis.clearTimeout(id))
// 창의 시간 함수도 node 시계를 따르게 (가짜 시계 쓸 때 같이 넘어감)
dom.window.setTimeout = (...args) => globalThis.setTimeout(...args)
dom.window.clearTimeout = (id) => globalThis.clearTimeout(id)
// 영상은 jsdom에 없음 → 재생·멈춤은 아무것도 안 함
dom.window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve() }
dom.window.HTMLMediaElement.prototype.pause = function pause() {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("./viteEnvStubLoaderHooks.mjs", import.meta.url))
register(new URL("./jsxNodeLoaderHooks.mjs", import.meta.url))
