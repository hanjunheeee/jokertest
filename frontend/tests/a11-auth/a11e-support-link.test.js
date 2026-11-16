// 고객센터 링크 시험 — 환경값 VITE_SUPPORT_URL을 가리는 함수 + 값이 있을 때 로그인 화면 링크 (2026-11-16 결정 여섯째 1)
// 목록 A11a 화면 A11-F-284~296, A11-F-298 (값 없을 때는 a11e-support-link-off.test.js — 환경값은 파일마다 한 번만 읽혀서 따로 둠)
import test, { mock } from "node:test"
import assert from "node:assert/strict"

const SUPPORT = "https://example.com/support"

// 빌드 환경값 흉내: 진짜 환경은 안 바꾸고 환경값 모듈만 바꿔 끼움 (화면을 불러오기 전에)
mock.module(new URL("../../src/shared/env.js", import.meta.url).href, {
  namedExports: { API_BASE_URL: "", SUPPORT_URL: SUPPORT },
})

const { h, rtl, resetAll, renderRoutes } = await import("./a11Kit.mjs")
const { resolveSupportLink } = await import("../../src/shared/utils/supportLink.js")
const { default: LoginPage } = await import("../../src/domains/auth/pages/LoginPage.jsx")
const { default: SupportLink } = await import("../../src/domains/auth/components/SupportLink.jsx")

const { screen } = rtl

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

// 받아들이는 값은 https 주소·mailto 둘뿐, 나머지는 "없음"(null)
const CASES = [
  ["284", "값 없음(undefined)", undefined, null],
  ["285", "빈 값", "", null],
  ["286", "빈칸만", "   ", null],
  ["287", "https 주소", SUPPORT, { href: SUPPORT, newTab: true }],
  ["288", "앞뒤 빈칸 붙은 https 주소", `  ${SUPPORT}  `, { href: SUPPORT, newTab: true }],
  ["289", "mailto 문의 이메일", "mailto:help@example.com", { href: "mailto:help@example.com", newTab: false }],
  ["290", "javascript: 글", "javascript:alert(1)", null],
  ["291", "http 주소(잠금 없는 주소)", "http://example.com/support", null],
  ["292", "앞머리 없는 주소", "example.com/support", null],
  ["293", "https 뒤가 빔", "https://", null],
  ["294", "mailto 뒤가 이메일 꼴이 아님", "mailto:help", null],
]

for (const [no, name, raw, expected] of CASES) {
  test(`A11-F-${no} 고객센터 주소 가리기: ${name} → ${expected ? expected.href : "없음"}`, () => {
    assert.deepEqual(resolveSupportLink(raw), expected)
  })
}

test("A11-F-295 값이 https 주소면 로그인 화면에 '고객센터' 링크 — 그 주소·새 창·auth-text-link 모양", () => {
  renderRoutes([{ path: "/login", element: h(LoginPage) }], { at: "/login" })
  const link = screen.getByRole("link", { name: "고객센터" })
  assert.equal(link.getAttribute("href"), SUPPORT)
  assert.equal(link.getAttribute("target"), "_blank")
  assert.equal(link.getAttribute("rel"), "noopener noreferrer")
  assert.ok(link.classList.contains("auth-text-link"), `class: ${link.className}`)
})

test("A11-F-296 값이 mailto면 새 창 속성 없이 메일 링크", () => {
  rtl.render(h(SupportLink, { rawUrl: "mailto:help@example.com" }))
  const link = screen.getByRole("link", { name: "고객센터" })
  assert.equal(link.getAttribute("href"), "mailto:help@example.com")
  assert.equal(link.hasAttribute("target"), false)
  assert.equal(link.hasAttribute("rel"), false)
})

test("A11-F-298 값이 javascript: 글이면 링크를 아예 안 그림 (빈 자리 없음)", () => {
  const { container } = rtl.render(h(SupportLink, { rawUrl: "javascript:alert(1)" }))
  assert.equal(container.innerHTML, "")
})
