// 계정 관리 화면 부품 시험 (닉네임·이메일 바꾸기·비번 바꾸기·회원 탈퇴 칸을 jsdom에 그려 글·칸·단추 확인) + 계정 관리·마이페이지 글
// 목록 A11b 화면 부품 A11-F-727~741, A11-F-764~774
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup, within, act } = await import("@testing-library/react")
const { installFetch, HOLD, flushUi, renderRoutes, signIn, resetStores, profileBody } = await import("./a11Kit.mjs")
const { default: AccountPanel } = await import("../../src/domains/user/components/AccountPanel.jsx")
const { default: MyPageLayout } = await import("../../src/domains/user/components/MyPageLayout.jsx")
const { PasswordResetPage } = await import("../../src/domains/auth/pages/PasswordResetPage.jsx")
const { WITHDRAW_NOTICE_LINES } = await import("../../src/domains/user/hooks/member/useWithdrawForm.js")

const LOCAL = { email: "account-user@example.com", hasLocalPassword: true }
const SOCIAL = { email: "social-user@example.com", hasLocalPassword: false }
const PW = "TestOnly-Pass-1"

test.afterEach(() => { cleanup(); resetStores() })

// 계정 관리 화면을 그림 (계정 정보 답 + 그 밖 요청 답)
async function panel({ account = LOCAL, accountAnswer, routes = {} } = {}) {
  const net = installFetch({
    "GET /user/me/account": accountAnswer ?? { status: 200, body: { success: true, data: account } },
    ...routes,
  })
  signIn()
  const view = renderRoutes([{ path: "/account", element: React.createElement(AccountPanel) }], { entries: ["/account"] })
  await flushUi()
  return { net, view }
}

// 제목으로 칸(section) 찾기
const sectionOf = (title) => screen.getByRole("heading", { name: title }).closest("section")

// 탈퇴 칸에 넣고 "탈퇴" → 확인 창
function openWithdraw(secret) {
  const section = sectionOf("회원 탈퇴")
  fireEvent.change(section.querySelector("input"), { target: { value: secret } })
  fireEvent.click(within(section).getByRole("button", { name: "탈퇴" }))
}

// 이메일 칸에 넣고 "번호 받기"
async function askEmailCode({ email = "new-user@example.com", password = PW } = {}) {
  const section = sectionOf("이메일 변경")
  fireEvent.change(section.querySelector("input[name='newEmail']"), { target: { value: email } })
  const pw = section.querySelector("input[name='emailChangePassword']")
  if (pw) fireEvent.change(pw, { target: { value: password } })
  fireEvent.click(within(section).getByRole("button", { name: "번호 받기" }))
  await flushUi()
  return section
}

// 보기 단추 눌러 칸 종류가 text ↔ password로 바뀌는지 → ["text", "password"]
function toggleTypes(input) {
  const toggle = within(input.parentElement).getByRole("button")
  fireEvent.click(toggle)
  const first = input.getAttribute("type")
  fireEvent.click(toggle)
  return [first, input.getAttribute("type")]
}

test("A11-F-727 섹션 닉네임·이메일 바꾸기·비밀번호·회원 탈퇴 보임", async () => {
  await panel()
  for (const title of ["닉네임 변경", "이메일 변경", "비밀번호 변경", "회원 탈퇴"]) {
    assert.ok(screen.getByRole("heading", { name: title }), title)
  }
})

test("A11-F-728 '지금 이메일: …'에 계정 이메일", async () => {
  await panel()
  assert.match(sectionOf("이메일 변경").textContent, /지금 이메일: account-user@example\.com/)
})

test("A11-F-729 비번 계정 → 이메일 섹션에 '현재 비밀번호' 칸", async () => {
  await panel({ account: LOCAL })
  assert.ok(within(sectionOf("이메일 변경")).getByPlaceholderText("현재 비밀번호"))
})

test("A11-F-730 소셜 계정 → 이메일 섹션에 '현재 비밀번호' 칸 없음", async () => {
  await panel({ account: SOCIAL })
  assert.equal(within(sectionOf("이메일 변경")).queryByPlaceholderText("현재 비밀번호"), null)
})

test("A11-F-731 비번 계정 탈퇴 → 비번 칸 + '본인 확인을 위해 비밀번호를 입력해주세요.'", async () => {
  await panel({ account: LOCAL })
  const section = sectionOf("회원 탈퇴")
  assert.match(section.textContent, /본인 확인을 위해 비밀번호를 입력해주세요\./)
  assert.equal(section.querySelector("input").getAttribute("type"), "password")
})

test("A11-F-732 소셜 탈퇴 → 이메일 칸 + 안내 글 + 칸 안내가 계정 이메일", async () => {
  await panel({ account: SOCIAL })
  const section = sectionOf("회원 탈퇴")
  assert.match(section.textContent, /본인 확인을 위해 계정 이메일을 그대로 입력해주세요\./)
  const input = section.querySelector("input")
  assert.equal(input.getAttribute("type"), "email")
  assert.equal(input.getAttribute("placeholder"), SOCIAL.email)
})

test("A11-F-733 확인 창 '정말 탈퇴할까요?' + 안내 4줄", async () => {
  await panel()
  openWithdraw(PW)
  const dialog = screen.getByRole("dialog", { name: "정말 탈퇴할까요?" })
  const lines = [...dialog.querySelectorAll("li")].map((li) => li.textContent)
  assert.equal(lines.length, 4)
  assert.deepEqual(lines, WITHDRAW_NOTICE_LINES)
  assert.match(lines[0], /되돌릴 수 없습니다/)
})

test("A11-F-734 처리 중 → '처리 중...'·꺼짐", async () => {
  await panel({ routes: { "POST /user/me/withdraw": HOLD } })
  openWithdraw(PW)
  fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }))
  await flushUi()
  const busy = screen.getByRole("button", { name: "처리 중..." })
  assert.equal(busy.disabled, true)
})

test("A11-F-735 계정 정보 못 받음 → '탈퇴' 꺼짐", async () => {
  await panel({ accountAnswer: { status: 500, body: { success: false, message: "서버 오류" } } })
  const button = within(sectionOf("회원 탈퇴")).getByRole("button", { name: "탈퇴" })
  assert.equal(button.disabled, true)
})

test("A11-F-736 번호 받은 뒤 '새 이메일로 받은 인증번호' 칸 + 단추 '확인'", async () => {
  await panel({ routes: { "POST /user/me/email/code": { status: 200, body: { success: true, data: { expiresInSec: 600, resendAfterSec: 60 } } } } })
  const section = await askEmailCode()
  assert.ok(within(section).getByPlaceholderText("새 이메일로 받은 인증번호"))
  assert.ok(within(section).getByRole("button", { name: "확인" }))
})

test("A11-F-737 비번 바꾸기 칸 autoComplete current-password·new-password", async () => {
  await panel()
  const section = sectionOf("비밀번호 변경")
  assert.equal(section.querySelector("input[name='currentPassword']").getAttribute("autocomplete"), "current-password")
  assert.equal(section.querySelector("input[name='newPassword']").getAttribute("autocomplete"), "new-password")
})

test("A11-F-738 비번 바꾸기 보기 단추 → text, 다시 → password", async () => {
  await panel()
  const section = sectionOf("비밀번호 변경")
  for (const name of ["currentPassword", "newPassword"]) {
    assert.deepEqual(toggleTypes(section.querySelector(`input[name='${name}']`)), ["text", "password"], name)
  }
})

test("A11-F-739 탈퇴 비번 칸 보기 단추 → text, 다시 → password", async () => {
  await panel({ account: LOCAL })
  assert.deepEqual(toggleTypes(sectionOf("회원 탈퇴").querySelector("input")), ["text", "password"])
})

test("A11-F-740 오류 결과가 결과 칸에 글로 들어감", async () => {
  await panel({
    routes: { "POST /user/me/withdraw": { status: 400, body: { success: false, code: "WITHDRAW_PASSWORD_INVALID", message: "비밀번호가 올바르지 않습니다." } } },
  })
  openWithdraw(PW)
  fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }))
  await flushUi()
  const section = sectionOf("회원 탈퇴")
  const message = [...section.querySelectorAll("p")].find((p) => p.textContent === "비밀번호가 올바르지 않습니다.")
  assert.ok(message, `탈퇴 칸 글: ${section.textContent}`)
  // 결과 글이 "탈퇴" 단추와 같은 아래 줄에 있음
  assert.ok(message.closest("div").parentElement.contains(within(section).getByRole("button", { name: "탈퇴" })))
})

test("A11-F-741 계정 정보 받는 중 → 이메일 '불러오는 중'", async () => {
  await panel({ accountAnswer: HOLD })
  assert.match(sectionOf("이메일 변경").textContent, /지금 이메일: 불러오는 중/)
})

// ── 계정 관리·마이페이지 글 ──

test("A11-F-764 재설정 저장 단추 '비밀번호 변경' → 보내는 중 '변경 중'·꺼짐", async () => {
  installFetch({
    "GET /auth/password-reset/verify": { status: 200, body: { ok: true, status: "VALID" } },
    "POST /auth/password-reset/confirm": HOLD,
  })
  renderRoutes([{ path: "/password-reset", element: React.createElement(PasswordResetPage) }], {
    entries: ["/password-reset?token=TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"],
  })
  await flushUi()
  assert.ok(screen.getByRole("button", { name: "비밀번호 변경" }), "준비: 저장 단추")
  fireEvent.change(screen.getByPlaceholderText("8~64자 비밀번호 (영문·숫자 포함)"), { target: { value: PW } })
  fireEvent.change(screen.getByPlaceholderText("비밀번호를 다시 입력하세요"), { target: { value: PW } })
  fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }))
  await flushUi()
  assert.equal(screen.getByRole("button", { name: "변경 중" }).matches(":disabled"), true)
})

test("A11-F-765 닉네임 409 글이 닉네임 섹션 안", async () => {
  await panel({ routes: { "PATCH /user/me/nickname": { status: 409, body: { success: false, message: "이미 사용 중인 닉네임입니다." } } } })
  const section = sectionOf("닉네임 변경")
  fireEvent.change(section.querySelector("input[name='nickname']"), { target: { value: "새가면" } })
  fireEvent.click(within(section).getByRole("button", { name: "변경" }))
  await flushUi()
  assert.match(section.textContent, /이미 사용 중인 닉네임입니다\./)
  assert.doesNotMatch(sectionOf("비밀번호 변경").textContent, /이미 사용 중인 닉네임/)
})

test("A11-F-766 '(n초 뒤)' 글", async () => {
  await panel({
    routes: { "POST /user/me/email/code": { status: 429, body: { success: false, code: "RESEND_TOO_SOON", message: "42초 뒤에 다시 보낼 수 있습니다.", resendAfterSec: 42 } } },
  })
  const section = await askEmailCode()
  assert.match(section.textContent, /\(42초 뒤\)/)
})

test("A11-F-767 '(남은 횟수 n)' 글", async () => {
  await panel({
    routes: {
      "POST /user/me/email/code": { status: 200, body: { success: true, data: { expiresInSec: 600, resendAfterSec: 60 } } },
      "POST /user/me/email/verify": { status: 400, body: { success: false, code: "CODE_INVALID", message: "인증번호가 올바르지 않습니다.", attemptsRemaining: 2 } },
    },
  })
  const section = await askEmailCode()
  fireEvent.change(within(section).getByPlaceholderText("새 이메일로 받은 인증번호"), { target: { value: "000000" } })
  fireEvent.click(within(section).getByRole("button", { name: "확인" }))
  await flushUi()
  assert.match(section.textContent, /\(남은 횟수 2\)/)
})

const WITHDRAW_TEXTS = [
  ["768", 409, "WITHDRAW_IN_GAME", "진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다."],
  ["769", 400, "WITHDRAW_PASSWORD_INVALID", "비밀번호가 올바르지 않습니다."],
  ["770", 400, "WITHDRAW_CONFIRM_MISMATCH", "계정 이메일을 정확히 입력해주세요."],
  ["771", 429, "WITHDRAW_LOCKED", "여러 번 잘못 입력했습니다. 잠시 후 다시 시도해주세요."],
]
for (const [no, status, code, text] of WITHDRAW_TEXTS) {
  test(`A11-F-${no} 탈퇴 ${code} 글이 탈퇴 칸에 보임`, async () => {
    const account = code === "WITHDRAW_CONFIRM_MISMATCH" ? SOCIAL : LOCAL
    await panel({ account, routes: { "POST /user/me/withdraw": { status, body: { success: false, code, message: text } } } })
    openWithdraw(account === SOCIAL ? "wrong-user@example.com" : PW)
    fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }))
    await flushUi()
    assert.ok(sectionOf("회원 탈퇴").textContent.includes(text), `탈퇴 칸 글: ${sectionOf("회원 탈퇴").textContent}`)
    assert.equal(screen.queryByRole("dialog"), null)
  })
}

test("A11-F-772 탈퇴 성공 글", async () => {
  await panel({ routes: { "POST /user/me/withdraw": { status: 200, body: { success: true, message: "회원 탈퇴가 완료되었습니다." } } } })
  openWithdraw(PW)
  fireEvent.click(screen.getByRole("button", { name: "탈퇴하기" }))
  await flushUi()
  assert.match(sectionOf("회원 탈퇴").textContent, /회원 탈퇴가 완료되었습니다\./)
})

// 마이페이지 본문을 그림 (프로필 답)
async function myPage(answer) {
  const net = installFetch({ "GET /user/me/profile": answer })
  signIn()
  renderRoutes([{ path: "/mypage", element: React.createElement(MyPageLayout) }], { entries: ["/mypage"] })
  await flushUi()
  return net
}

test("A11-F-773 전적 없음 글", async () => {
  await myPage(profileBody({ total_games: 0, account_win_rate: 0, highest_win_rate_role: null }))
  assert.match(document.body.textContent, /전적 없음/)
  assert.match(document.body.textContent, /아직 어떤 가면도 증명하지 못했습니다/)
})

test("A11-F-774 '최신 전적을 불러오지 못했습니다…' 글", async () => {
  const net = await myPage(profileBody())
  assert.match(document.body.textContent, /전체 판수/, "준비: 전적 보임")
  // 다음 받기는 실패 → 창으로 돌아옴(focus)이 다시 받기를 부름
  net.routes["GET /user/me/profile"] = { status: 500, body: { success: false, message: "서버 오류" } }
  await act(async () => { window.dispatchEvent(new window.Event("focus")) })
  await flushUi()
  assert.match(screen.getByRole("status").textContent, /최신 전적을 불러오지 못했습니다\. 아래 값은 갱신 전 값일 수 있습니다\./)
  // 옛 값은 그대로 보임
  assert.match(document.body.textContent, /전체 판수/)
})
