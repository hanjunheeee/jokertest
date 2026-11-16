// 약관 칸·재동의 창 부품 시험 — 전체 동의·하나씩·보기 창·못 불러옴·체크 상자 이름·재동의 창 닫힘
// 목록 A11a 화면 부품 A11-F-243~255, A11-F-270 (jsdom에 진짜 약관 칸·재동의 창을 그림, 서버는 가짜 답)
import test from "node:test"
import assert from "node:assert/strict"
import { h, rtl, TERMS, serve, sent, resetAll, settle, useAuthStore } from "./a11Kit.mjs"

const { default: SignupTermsAgreement } = await import("../../src/domains/auth/components/terms/SignupTermsAgreement.jsx")
const { default: TermsReconsentGate } = await import("../../src/domains/auth/components/terms/TermsReconsentGate.jsx")
const { useSignupTerms } = await import("../../src/domains/auth/hooks/terms/useSignupTerms.js")
const { screen, fireEvent, within } = rtl

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

const TERMS_OK = { status: 200, body: { success: true, data: { terms: TERMS } } }
const ALL = "전체 동의"
// 읽기 이름 (jsdom은 "(필수)" 뒤 빈칸을 붙여 읽어서 이름 끝부분으로 찾음)
const TERMS_ROW = /이용약관 동의$/
const PRIVACY_ROW = /개인정보 처리방침 동의$/
const AGE_ROW = /만 14세 이상입니다$/

// 진짜 약관 훅 + 약관 칸
function TermsBox() {
  const signupTerms = useSignupTerms({ active: true })
  return h(SignupTermsAgreement, { signupTerms })
}
async function renderTerms(answer = TERMS_OK) {
  serve({ "GET /auth/terms": answer })
  rtl.render(h(TermsBox))
  await settle()
}
const box = (name) => screen.getByRole("checkbox", { name })
const checked = (name) => box(name).getAttribute("aria-checked")
async function click(el) { await rtl.act(async () => { fireEvent.click(el) }) }

test("A11-F-243 \"전체 동의\" 누름 → 약관 전부 + \"만 14세 이상입니다\" 켜짐", async () => {
  await renderTerms()
  await click(box(ALL))
  assert.deepEqual([checked(TERMS_ROW), checked(PRIVACY_ROW), checked(AGE_ROW), checked(ALL)], ["true", "true", "true", "true"])
})

test("A11-F-244 다 켜진 채 \"전체 동의\" 다시 → 다 꺼짐", async () => {
  await renderTerms()
  await click(box(ALL))
  await click(box(ALL))
  assert.deepEqual([checked(TERMS_ROW), checked(PRIVACY_ROW), checked(AGE_ROW), checked(ALL)], ["false", "false", "false", "false"])
})

test("A11-F-245 다 켠 뒤 하나 끔 → \"전체 동의\" 꺼짐", async () => {
  await renderTerms()
  await click(box(ALL))
  await click(box(PRIVACY_ROW))
  assert.equal(checked(ALL), "false")
})

test("A11-F-246 약관마다 \"보기\" → 그 약관 전체 보기 창 열림", async () => {
  await renderTerms()
  const viewButtons = screen.getAllByRole("button", { name: "보기" })
  assert.equal(viewButtons.length, TERMS.length)
  const titles = []
  for (let i = 0; i < viewButtons.length; i += 1) {
    await click(screen.getAllByRole("button", { name: "보기" })[i])
    titles.push(screen.getByRole("dialog").querySelector("h2").textContent)
    await click(within(screen.getByRole("dialog")).getByRole("button", { name: "닫기" }))
  }
  assert.deepEqual(titles, ["이용약관", "개인정보 처리방침"])
})

test("A11-F-247 보기 창에 약관 제목·본문", async () => {
  await renderTerms()
  await click(screen.getAllByRole("button", { name: "보기" })[0])
  const dialog = screen.getByRole("dialog", { name: "이용약관" })
  assert.ok(dialog.textContent.includes(TERMS[0].body))
})

test("A11-F-248 보기 창 닫기 → 창 없음, 체크 상태 그대로", async () => {
  await renderTerms()
  await click(box(TERMS_ROW))
  await click(screen.getAllByRole("button", { name: "보기" })[1])
  await click(within(screen.getByRole("dialog")).getByRole("button", { name: "닫기" }))
  assert.equal(screen.queryByRole("dialog"), null)
  assert.deepEqual([checked(TERMS_ROW), checked(PRIVACY_ROW), checked(AGE_ROW)], ["true", "false", "false"])
})

const TERMS_FAIL = { status: 500, body: { success: false, message: "서버 내부에서 에러가 발생했습니다." } }

test("A11-F-249 GET /auth/terms 실패 → 실패 글 + \"다시 시도\" 단추", async () => {
  await renderTerms(TERMS_FAIL)
  assert.ok(screen.getByText(/약관을 불러오지 못했습니다/))
  assert.ok(screen.getByRole("button", { name: "다시 시도" }))
})

test("A11-F-250 실패 뒤 다시 누름 → 다시 불러와 약관 줄 보임", async () => {
  await renderTerms((req, n) => (n === 1 ? TERMS_FAIL : TERMS_OK))
  // 다시 단추 글자는 249가 따로 봄, 여기는 다시 불러오는지만 봄
  await click(screen.getByRole("button", { name: /^다시/ }))
  await settle()
  assert.equal(sent("GET", "/auth/terms").length, 2)
  assert.ok(box(TERMS_ROW))
  assert.ok(box(PRIVACY_ROW))
})

test("A11-F-251 줄마다 role=checkbox·이름(이용약관/개인정보 처리방침/만 14세)", async () => {
  await renderTerms()
  const names = screen.getAllByRole("checkbox").map((el) => el.textContent)
  for (const word of ["이용약관", "개인정보 처리방침", "만 14세"]) {
    assert.ok(names.some((n) => n.includes(word)), `${word} 이름 상자 없음`)
  }
})

test("A11-F-252 필수 줄마다 \"(필수)\" 표시 글", async () => {
  await renderTerms()
  for (const name of [TERMS_ROW, PRIVACY_ROW, AGE_ROW]) assert.ok(box(name).textContent.includes("(필수)"))
})

// 재동의 창: 로그인한 계정 + 새 필수 버전 2개
const PENDING = [
  { ...TERMS[0], id: 11, version: "2.0" },
  { ...TERMS[1], id: 12, version: "2.0" },
]
async function renderGate({ loggedIn = true } = {}) {
  serve({
    "GET /user/me/terms": { status: 200, body: { success: true, data: { pending: PENDING, reconsentRequired: true } } },
    "POST /user/me/terms/agree": { status: 200, body: { success: true, data: { pending: [], reconsentRequired: false } } },
  })
  if (loggedIn) useAuthStore.getState().login({ uuid: "u-a11-gate", nickname: "시험사람", role: "USER" })
  rtl.render(h(TermsReconsentGate))
  await settle()
}

test("A11-F-253 재동의 창: 닫기 단추 없음·Esc로 안 닫힘", async () => {
  await renderGate()
  const dialog = screen.getByRole("dialog", { name: "약관이 바뀌었습니다" })
  assert.equal(within(dialog).queryByRole("button", { name: "닫기" }), null)
  await rtl.act(async () => { fireEvent.keyDown(window, { key: "Escape" }) })
  assert.ok(screen.getByRole("dialog", { name: "약관이 바뀌었습니다" }))
})

test("A11-F-254 필수 다 골라 동의 → 창 사라짐", async () => {
  await renderGate()
  const dialog = screen.getByRole("dialog", { name: "약관이 바뀌었습니다" })
  for (const el of within(dialog).queryAllByRole("checkbox")) await click(el)
  await click(within(dialog).getByRole("button", { name: "모두 동의하고 계속" }))
  await settle()
  assert.deepEqual(sent("POST", "/user/me/terms/agree")[0]?.body, { agreedTermsVersionIds: [11, 12] })
  assert.equal(screen.queryByRole("dialog", { name: "약관이 바뀌었습니다" }), null)
})

test("A11-F-255 하나 덜 고름 → 동의 단추 꺼짐", async () => {
  await renderGate()
  const dialog = screen.getByRole("dialog", { name: "약관이 바뀌었습니다" })
  const boxes = within(dialog).queryAllByRole("checkbox")
  assert.equal(boxes.length, PENDING.length, "재동의 창에 약관마다 고르는 상자가 없음")
  await click(boxes[0])
  assert.equal(within(dialog).getByRole("button", { name: "모두 동의하고 계속" }).disabled, true)
})

test("A11-F-270 로그인 화면(로그아웃 상태)에선 재동의 창 안 그림", async () => {
  await renderGate({ loggedIn: false })
  assert.equal(screen.queryByRole("dialog"), null)
  assert.equal(sent("GET", "/user/me/terms").length, 0)
})
