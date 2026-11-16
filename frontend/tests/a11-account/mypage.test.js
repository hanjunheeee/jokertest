// 마이페이지 화면 부품 시험 (단추 네 개·계정 관리 길·꾸미기 창·전적 칸·배너) + 상태마다 안 보일 것·그 밖
// 목록 A11b 화면 부품 A11-F-742~750, A11-F-775~785
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup, within, act } = await import("@testing-library/react")
const { installFetch, HOLD, flushUi, renderRoutes, signIn, resetStores, profileBody } = await import("./a11Kit.mjs")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { default: MyPageLayout } = await import("../../src/domains/user/components/MyPageLayout.jsx")
const { default: AccountPanel } = await import("../../src/domains/user/components/AccountPanel.jsx")
const { default: LobbyPage } = await import("../../src/domains/lobby/pages/LobbyPage.jsx")
const { PasswordResetRequestPage, PasswordResetPage } = await import("../../src/domains/auth/pages/PasswordResetPage.jsx")
const { default: FindIdPage } = await import("../../src/domains/auth/pages/FindIdPage.jsx")

const PROFILE = "/user/me/profile"
const TOKEN = "TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"

test.afterEach(() => { cleanup(); resetStores() })

// 마이페이지를 그림 (프로필 답 + 그 밖 요청 답)
async function myPage(answer = profileBody(), routes = {}) {
  const net = installFetch({ [`GET ${PROFILE}`]: answer, ...routes })
  signIn()
  const view = renderRoutes([
    { path: "/mypage", element: React.createElement(MyPageLayout) },
    { path: "/account", element: React.createElement("p", null, "계정 관리 화면") },
    { path: "/mypage/emoticons", element: React.createElement("p", null, "이모티콘 화면") },
  ], { entries: ["/mypage"] })
  await flushUi()
  return { net, view }
}

// 마이페이지 단추 네 개 (그림 틀 단추, 글자로 이름)
const BUTTON_NAMES = ["계정 관리", "프로필 수정", "스킨&카드 착용", "이모티콘"]
const actionButtons = () => screen.getAllByRole("button").filter((b) => BUTTON_NAMES.includes(b.textContent.trim()))

// 재설정 링크 화면 (verify·confirm 답)
async function resetPage(verifyAnswer, confirmAnswer = { status: 200, body: { ok: true } }) {
  installFetch({ "GET /auth/password-reset/verify": verifyAnswer, "POST /auth/password-reset/confirm": confirmAnswer })
  const view = renderRoutes([
    { path: "/password-reset", element: React.createElement(PasswordResetPage) },
    { path: "/login", element: React.createElement("p", null, "로그인 화면") },
  ], { entries: [`/password-reset?token=${TOKEN}`] })
  await flushUi()
  return view
}

// 인증 틀(form) 안의 입력 칸 수 (구석 소리 조절 막대는 뺌)
const formInputs = () => document.querySelector("form")?.querySelectorAll("input").length ?? 0

// 새 비번 칸이 있는지
const newPasswordFields = () => document.querySelectorAll("input[name='password'], input[name='passwordConfirm']").length

test("A11-F-742 단추 4개가 '계정 관리'·'프로필 수정'·'스킨&카드 착용'·'이모티콘' 순서", async () => {
  await myPage()
  assert.deepEqual(actionButtons().map((b) => b.textContent.trim()), BUTTON_NAMES)
})

test("A11-F-743 '계정 관리' → /account", async () => {
  const { view } = await myPage()
  fireEvent.click(screen.getByRole("button", { name: "계정 관리" }))
  await flushUi()
  assert.equal(view.path(), "/account")
})

test("A11-F-744 '프로필 수정' → 꾸미기 창 + 탭 두 개(사진·테두리)", async () => {
  await myPage()
  fireEvent.click(screen.getByRole("button", { name: "프로필 수정" }))
  await flushUi()
  const dialog = screen.getByRole("dialog", { name: "프로필 수정" })
  const tabs = within(dialog).getAllByRole("tab")
  assert.equal(tabs.length, 2)
  assert.match(tabs[0].textContent, /프로필|사진/)
  assert.match(tabs[1].textContent, /테두리/)
})

test("A11-F-745 꾸미기 창 닫기 → 마이페이지 그대로", async () => {
  const { view } = await myPage()
  fireEvent.click(screen.getByRole("button", { name: "프로필 수정" }))
  await flushUi()
  // 창 안의 닫기 단추 (뒤판에도 같은 이름 단추가 있음)
  const dialog = screen.getByRole("dialog", { name: "프로필 수정" })
  const closers = screen.getAllByRole("button", { name: "프로필 수정 닫기" })
  fireEvent.click(closers.find((b) => dialog.contains(b)) ?? closers[0])
  await flushUi()
  assert.equal(screen.queryByRole("dialog", { name: "프로필 수정" }), null)
  assert.equal(view.path(), "/mypage")
  assert.equal(actionButtons().length, 4)
})

test("A11-F-746 전적 칸 '전체 판수'·'승률' 라벨과 값", async () => {
  await myPage(profileBody({ total_games: 1234, account_win_rate: 0.756 }))
  const text = document.body.textContent
  assert.match(text, /전체 판수/)
  assert.match(text, /1,234/)
  assert.match(text, /승률/)
  assert.match(text, /75\.6%/)
})

test("A11-F-747 직업 문구", async () => {
  await myPage(profileBody({ highest_win_rate_role: "의사" }))
  // 강조 낱말은 대괄호로 묶여 보임 → 괄호는 빼고 봄
  const text = document.body.textContent.replace(/[[\]]/g, "")
  assert.match(text, /이 자는 의사의 가면을 쓸 때 가장 잔혹합니다\./)
})

test("A11-F-748 못 받음 → '전적을 불러오지 못했습니다.' + '다시 불러오기'", async () => {
  await myPage({ status: 500, body: { success: false, message: "서버 오류" } })
  assert.match(screen.getByRole("status").textContent, /전적을 불러오지 못했습니다\./)
  assert.ok(screen.getByRole("button", { name: "전적 다시 불러오기" }))
  assert.match(screen.getByRole("button", { name: "전적 다시 불러오기" }).textContent, /다시 불러오기/)
})

test("A11-F-749 '다시 불러오기' → 프로필 요청 1번", async () => {
  const { net } = await myPage({ status: 500, body: { success: false, message: "서버 오류" } })
  const before = net.to("GET", PROFILE).length
  net.routes[`GET ${PROFILE}`] = profileBody()
  fireEvent.click(screen.getByRole("button", { name: "전적 다시 불러오기" }))
  await flushUi()
  assert.equal(net.to("GET", PROFILE).length, before + 1)
  assert.match(document.body.textContent, /전체 판수/)
})

test("A11-F-750 배너에 닉네임", async () => {
  await myPage(profileBody({ nickname: "가면손님" }))
  const banners = [...document.querySelectorAll("p")].filter((p) => p.textContent === "가면손님")
  assert.ok(banners.length >= 1)
})

// ── 상태마다 안 보일 것·그 밖 ──

test("A11-F-775 linkInvalid엔 새 비번 칸 없음", async () => {
  await resetPage({ status: 200, body: { ok: false, code: "INVALID" } })
  assert.ok(screen.getByRole("button", { name: "다시 요청하기" }), "준비: 잘못된 링크 화면")
  assert.equal(newPasswordFields(), 0)
})

test("A11-F-776 socialOnly엔 칸 없음 + '로그인으로 이동'", async () => {
  await resetPage({ status: 200, body: { ok: true, status: "VALID" } }, { status: 400, body: { ok: false, code: "SOCIAL_ONLY" } })
  fireEvent.change(screen.getByPlaceholderText("8~64자 비밀번호 (영문·숫자 포함)"), { target: { value: "TestOnly-Pass-1" } })
  fireEvent.change(screen.getByPlaceholderText("비밀번호를 다시 입력하세요"), { target: { value: "TestOnly-Pass-1" } })
  fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }))
  await flushUi()
  assert.equal(formInputs(), 0)
  assert.ok(screen.getByRole("button", { name: "로그인으로 이동" }))
})

test("A11-F-777 found엔 입력 칸 없음", async () => {
  installFetch({ "POST /auth/find-id": { status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } } })
  renderRoutes([{ path: "/find-id", element: React.createElement(FindIdPage) }], { entries: ["/find-id"] })
  fireEvent.change(screen.getByPlaceholderText("닉네임을 입력하세요"), { target: { value: "가면손님" } })
  fireEvent.change(document.querySelector("input[name='birthDate']"), { target: { value: "1999-04-17" } })
  fireEvent.click(screen.getByRole("button", { name: "아이디 찾기" }))
  await flushUi()
  assert.equal(screen.getByRole("status").textContent, "ga***@example.com", "준비: 찾음")
  assert.equal(formInputs(), 0)
})

test("A11-F-778 소셜 계정 이메일 섹션 '번호 받기'가 비번 없이 켜짐", async () => {
  const net = installFetch({
    "GET /user/me/account": { status: 200, body: { success: true, data: { email: "social-user@example.com", hasLocalPassword: false } } },
    "POST /user/me/email/code": { status: 200, body: { success: true, data: { expiresInSec: 600, resendAfterSec: 60 } } },
  })
  signIn()
  renderRoutes([{ path: "/account", element: React.createElement(AccountPanel) }], { entries: ["/account"] })
  await flushUi()
  const section = screen.getByRole("heading", { name: "이메일 변경" }).closest("section")
  const button = within(section).getByRole("button", { name: "번호 받기" })
  assert.equal(button.disabled, false)
  fireEvent.change(section.querySelector("input[name='newEmail']"), { target: { value: "new-user@example.com" } })
  fireEvent.click(button)
  await flushUi()
  assert.equal(net.to("POST", "/user/me/email/code").length, 1)
  assert.equal(net.to("POST", "/user/me/email/code")[0].body.currentPassword, undefined)
})

test("A11-F-779 '스킨&카드 착용' → 착용 창 열림", async () => {
  await myPage()
  fireEvent.click(screen.getByRole("button", { name: "스킨&카드 착용" }))
  await flushUi()
  assert.ok(screen.getByRole("dialog", { name: "스킨&카드 착용" }))
})

test("A11-F-780 '이모티콘' → /mypage/emoticons", async () => {
  const { view } = await myPage()
  fireEvent.click(screen.getByRole("button", { name: "이모티콘" }))
  await flushUi()
  assert.equal(view.path(), "/mypage/emoticons")
})

test("A11-F-781 닉네임 바꾼 뒤 로비 배너가 새 닉네임으로 다시 그려짐", async () => {
  const empty = { status: 200, body: { success: true, data: [] } }
  installFetch({
    // 첫 프로필만 답하고, 그 뒤 다시 받기는 쥐고 안 줌 (화면이 바꾼 값으로 다시 그리는지만 봄)
    [`GET ${PROFILE}`]: (_body, count) => (count === 1 ? profileBody({ nickname: "가면손님" }) : HOLD),
    "GET /user/me/account": { status: 200, body: { success: true, data: { email: "account-user@example.com", hasLocalPassword: true } } },
    "PATCH /user/me/nickname": { status: 200, body: { success: true, message: "닉네임이 변경되었습니다." } },
    "GET /friends": empty,
    "GET /friends/requests/incoming": empty,
    "GET /friends/favorites": empty,
    "GET /friends/blocks": empty,
    "GET /friends/invites": empty,
  })
  signIn({ uuid: "u-a11", nickname: "가면손님" })
  useAuthStore.setState({ sessionBootstrap: "done" })
  const view = renderRoutes([
    { path: "/lobby", element: React.createElement(LobbyPage) },
    { path: "/account", element: React.createElement(AccountPanel) },
  ], { entries: ["/lobby"] })
  await flushUi(8)
  assert.equal(within(screen.getByRole("button", { name: "마이페이지" })).getByText("가면손님").textContent, "가면손님", "준비: 로비 배너 옛 닉네임")
  await act(async () => { await view.router.navigate("/account") })
  await flushUi()
  const section = screen.getByRole("heading", { name: "닉네임 변경" }).closest("section")
  fireEvent.change(section.querySelector("input[name='nickname']"), { target: { value: "새가면" } })
  fireEvent.click(within(section).getByRole("button", { name: "변경" }))
  await flushUi()
  await act(async () => { await view.router.navigate("/lobby") })
  await flushUi(8)
  const banner = screen.getByRole("button", { name: "마이페이지" })
  assert.match(banner.textContent, /새가면/)
  assert.doesNotMatch(banner.textContent, /가면손님/)
})

test("A11-F-782 꾸미기 창 탭 바꾸기 (aria-selected)", async () => {
  await myPage()
  fireEvent.click(screen.getByRole("button", { name: "프로필 수정" }))
  await flushUi()
  const tabs = within(screen.getByRole("dialog", { name: "프로필 수정" })).getAllByRole("tab")
  assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["true", "false"])
  fireEvent.click(tabs[1])
  await flushUi()
  const after = within(screen.getByRole("dialog", { name: "프로필 수정" })).getAllByRole("tab")
  assert.deepEqual(after.map((t) => t.getAttribute("aria-selected")), ["false", "true"])
})

test("A11-F-783 확인 중엔 새 비번 칸 없음", async () => {
  await resetPage(HOLD)
  assert.equal(screen.getByRole("status").textContent, "링크를 확인하고 있어요", "준비: 확인 중")
  assert.equal(newPasswordFields(), 0)
})

test("A11-F-784 아이디 찾기 조회 중 단추 '조회 중'·꺼짐", async () => {
  installFetch({ "POST /auth/find-id": HOLD })
  renderRoutes([{ path: "/find-id", element: React.createElement(FindIdPage) }], { entries: ["/find-id"] })
  fireEvent.change(screen.getByPlaceholderText("닉네임을 입력하세요"), { target: { value: "가면손님" } })
  fireEvent.change(document.querySelector("input[name='birthDate']"), { target: { value: "1999-04-17" } })
  fireEvent.click(screen.getByRole("button", { name: "아이디 찾기" }))
  await flushUi()
  assert.equal(screen.getByRole("button", { name: "조회 중" }).matches(":disabled"), true)
})

test("A11-F-785 재설정 요청 첫 화면엔 '다시 보내기' 없음", async () => {
  installFetch({})
  renderRoutes([{ path: "/password-reset/request", element: React.createElement(PasswordResetRequestPage) }], {
    entries: ["/password-reset/request"],
  })
  await flushUi()
  assert.ok(screen.getByRole("button", { name: "재설정 링크 보내기" }), "준비: 첫 화면")
  assert.equal(screen.queryByRole("button", { name: "다시 보내기" }), null)
})
