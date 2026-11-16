// 아이디 찾기 화면 부품 시험 (jsdom에 그려 칸·결과 글·단추 확인)
// 목록 A11b 화면 부품 A11-F-718~721
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup } = await import("@testing-library/react")
const { installFetch, NETWORK_DOWN, flushUi, renderRoutes } = await import("./a11Kit.mjs")
const { default: FindIdPage } = await import("../../src/domains/auth/pages/FindIdPage.jsx")
const { FIND_ID_TEXT } = await import("../../src/domains/auth/constants/recoveryMessages.js")

test.afterEach(() => cleanup())

// 아이디 찾기 화면을 그리고 (send면) 두 칸 넣어 찾기
async function findPage(answer, { send = true } = {}) {
  installFetch({ "POST /auth/find-id": answer })
  renderRoutes([{ path: "/find-id", element: React.createElement(FindIdPage) }], { entries: ["/find-id"] })
  if (send) {
    fireEvent.change(screen.getByPlaceholderText("닉네임을 입력하세요"), { target: { value: "가면손님" } })
    fireEvent.change(document.querySelector("input[name='birthDate']"), { target: { value: "1999-04-17" } })
    fireEvent.click(screen.getByRole("button", { name: "아이디 찾기" }))
    await flushUi()
  }
}

test("A11-F-718 첫 화면 → 닉네임·생년월일 칸 + '아이디 찾기'", async () => {
  await findPage(null, { send: false })
  assert.ok(screen.getByRole("textbox", { name: "닉네임을 입력하세요" }))
  const birth = document.querySelector("input[name='birthDate']")
  assert.equal(birth.getAttribute("type"), "date")
  assert.match(birth.closest("label").textContent, /생년월일/)
  assert.ok(screen.getByRole("button", { name: "아이디 찾기" }))
})

test("A11-F-719 found → '가입하신 이메일은 아래와 같아요' + 가린 이메일", async () => {
  await findPage({ status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } })
  assert.match(document.body.textContent, /가입하신 이메일은 아래와 같아요/)
  assert.equal(screen.getByRole("status").textContent, "ga***@example.com")
})

test("A11-F-720 notFound → 못 찾음 글 + '다시 입력'", async () => {
  await findPage({ status: 200, body: { ok: false, code: "NOT_FOUND" } })
  assert.ok(screen.getAllByRole("alert").some((el) => el.textContent === FIND_ID_TEXT.notFound))
  assert.ok(screen.getByRole("button", { name: "다시 입력" }))
})

test("A11-F-721 failed → '재시도' 단추", async () => {
  await findPage(NETWORK_DOWN)
  assert.ok(screen.getByRole("button", { name: "재시도" }))
})
