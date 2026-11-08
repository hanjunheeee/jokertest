import assert from "node:assert/strict"
import test from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// FE-013 없는 주소·화면 오류 화면 라우트 시험

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })

installDomGlobal("alert", () => {})
dom.window.alert = () => {}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { mock } = await import("node:test")

mock.module("../../src/shared/env.js", {
  namedExports: {
    API_BASE_URL: "http://localhost:4000",
    DISCORD_SUPPORT_URL: undefined,
  },
})

mock.module("../../src/shared/api/client.js", {
  namedExports: {
    api: {
      get: async () => { throw new Error("network disabled in test") },
      post: async () => { throw new Error("network disabled in test") },
      put: async () => { throw new Error("network disabled in test") },
      patch: async () => { throw new Error("network disabled in test") },
      delete: async () => { throw new Error("network disabled in test") },
    },
    apiClient: async () => { throw new Error("network disabled in test") },
    refreshAccessToken: async () => { throw new Error("network disabled in test") },
  },
})

const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../src/app/routes/index.jsx")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")

test.afterEach(() => cleanup())

async function mountRouter() {
  let view
  await act(async () => {
    view = render(React.createElement(RouterProvider, { router }))
  })
  return view
}

async function goTo(path) {
  await act(async () => { await router.navigate(path) })
}

// FE-013: 없는 주소는 라우터 기본 글자 화면 대신 돌아갈 버튼이 있는 화면
test("FE-013: 없는 주소로 가면 '없는 주소' 화면과 로비로 가기 버튼이 뜸", async () => {
  await goTo("/no-such-page-xyz")
  const view = await mountRouter()
  await waitFor(() => assert.ok(view.container.querySelector('[data-route-error="not-found"]')))
  const buttons = [...view.container.querySelectorAll("button")].map((b) => b.textContent.trim())
  assert.ok(buttons.includes("로비로 가기"))
})

test("FE-013: 최상위 라우트에 오류 화면(errorElement)이 붙어 있음", () => {
  const top = router.routes[0]
  assert.ok(top.errorElement, "최상위 errorElement가 없음")
  assert.ok(top.children.some((route) => route.path === "*"), "없는 주소 경로가 없음")
})
