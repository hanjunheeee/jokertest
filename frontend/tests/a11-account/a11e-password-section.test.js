// 계정 관리 "비밀번호 변경" 칸 시험 (소셜로만 가입한 계정엔 칸 대신 안내 글 · 새 비밀번호 확인 칸)
// 목록 A11b 화면 부품 A11-F-791~797 (비밀번호_점검 P-B1·P-S4, 6장 #34·#35)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup, within } = await import("@testing-library/react")
const { installFetch, flushUi, renderRoutes, signIn, resetStores } = await import("./a11Kit.mjs")
const { default: AccountPanel } = await import("../../src/domains/user/components/AccountPanel.jsx")

const LOCAL = { email: "account-user@example.com", hasLocalPassword: true }
const SOCIAL = { email: "social-user@example.com", hasLocalPassword: false }
const PATH = "/user/me/password"
const OLD_PW = "TestOnly-Old-1"
const NEW_PW = "TestOnly-New-1"
const SUCCESS = { status: 200, body: { success: true, message: "비밀번호가 변경되었습니다.", reloginRequired: false } }

test.afterEach(() => { cleanup(); resetStores() })

// 계정 관리 화면을 그림 (계정 정보 답 + 비번 바꾸기 답)
async function panel(account = LOCAL, answer = SUCCESS) {
  const net = installFetch({
    "GET /user/me/account": { status: 200, body: { success: true, data: account } },
    [`PATCH ${PATH}`]: answer,
  })
  signIn()
  renderRoutes([{ path: "/account", element: React.createElement(AccountPanel) }], { entries: ["/account"] })
  await flushUi()
  return net
}

// "비밀번호 변경" 칸(section)
const section = () => screen.getByRole("heading", { name: "비밀번호 변경" }).closest("section")
const field = (name) => section().querySelector(`input[name='${name}']`)

// 칸에 넣고 "변경" 누름 (안 준 칸은 안 건드림)
async function change(values) {
  for (const [name, value] of Object.entries(values)) fireEvent.change(field(name), { target: { value } })
  fireEvent.click(within(section()).getByRole("button", { name: "변경" }))
  await flushUi()
}

test("A11-F-791 소셜로만 가입한 계정 → 비밀번호 변경 칸에 입력 칸·변경 단추 없음 + '소셜 로그인 계정은 비밀번호가 없습니다.'", async () => {
  await panel(SOCIAL)
  assert.equal(section().querySelectorAll("input").length, 0)
  assert.equal(within(section()).queryByRole("button", { name: "변경" }), null)
  assert.ok(within(section()).getByText("소셜 로그인 계정은 비밀번호가 없습니다."))
})

test("A11-F-792 비번 계정 → 현재·새·새 비밀번호 확인 칸 3개, 안내 글 없음", async () => {
  await panel(LOCAL)
  assert.deepEqual(
    [...section().querySelectorAll("input")].map((el) => el.getAttribute("name")),
    ["currentPassword", "newPassword", "newPasswordConfirm"],
  )
  assert.equal(within(section()).queryByText("소셜 로그인 계정은 비밀번호가 없습니다."), null)
})

test("A11-F-793 새 비밀번호와 확인이 다름 → 요청 0번 + '비밀번호 확인이 일치하지 않습니다.'", async () => {
  const net = await panel(LOCAL)
  await change({ currentPassword: OLD_PW, newPassword: NEW_PW, newPasswordConfirm: "TestOnly-New-2" })
  assert.equal(net.to("PATCH", PATH).length, 0)
  assert.ok(within(section()).getByText("비밀번호 확인이 일치하지 않습니다."))
})

test("A11-F-794 확인 칸을 비워 둠 → 요청 0번 + '비밀번호 확인이 일치하지 않습니다.'", async () => {
  const net = await panel(LOCAL)
  await change({ currentPassword: OLD_PW, newPassword: NEW_PW })
  assert.equal(net.to("PATCH", PATH).length, 0)
  assert.ok(within(section()).getByText("비밀번호 확인이 일치하지 않습니다."))
})

test("A11-F-795 새 비밀번호와 확인이 같음 → 요청 1번, 보낸 값은 currentPassword·newPassword 둘뿐", async () => {
  const net = await panel(LOCAL)
  await change({ currentPassword: OLD_PW, newPassword: NEW_PW, newPasswordConfirm: NEW_PW })
  const sent = net.to("PATCH", PATH)
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].body, { currentPassword: OLD_PW, newPassword: NEW_PW })
})

test("A11-F-796 성공 뒤 → 세 칸 다 비움", async () => {
  await panel(LOCAL)
  await change({ currentPassword: OLD_PW, newPassword: NEW_PW, newPasswordConfirm: NEW_PW })
  assert.deepEqual(
    ["currentPassword", "newPassword", "newPasswordConfirm"].map((name) => field(name).value),
    ["", "", ""],
  )
})

test("A11-F-797 확인 칸 → autoComplete new-password, 보기 단추 누르면 text·다시 누르면 password", async () => {
  await panel(LOCAL)
  const input = field("newPasswordConfirm")
  assert.equal(input.getAttribute("autocomplete"), "new-password")
  const toggle = within(input.parentElement).getByRole("button")
  fireEvent.click(toggle)
  assert.equal(input.getAttribute("type"), "text")
  fireEvent.click(toggle)
  assert.equal(input.getAttribute("type"), "password")
})
