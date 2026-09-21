import assert from "node:assert/strict"
import test from "node:test"
import { createRequire, register } from "node:module"
import { randomUUID } from "node:crypto"
import { JSDOM } from "jsdom"
import React from "react"

// F-29 복구 흐름 통합 시험 — 화면과 DB 두 경계를 **한 번에** 지난다.
//
// 기존 시험은 둘 중 하나만 본다: PasswordResetPage.ui.test.js·FindIdPage.ui.test.js는 fetch
// 응답을 시험이 직접 만들어 주고, backend/tests/db/f29a·f29b는 화면을 마운트하지 않는다. 그
// 사이(실제 화면이 만든 요청을 실제 라우터·서비스·모델·MySQL이 처리하고, 그 결과가 다시 실제
// 화면에 반영되는 구간)는 어느 쪽도 확인하지 않았다.
//
// 그래서 이 파일은 실제 app/routes/index.jsx의 **그 라우터**를 마운트하고, 실제 auth.api.js →
// client.js → response.js를 거쳐 backend/tests/helpers/f29RecoveryFixture.cjs가 띄운 실제
// /auth 라우터로 보낸다. 대체하는 것은 두 가지뿐이다:
//   (1) 메일 전달 — 실제 외부 수신함이 없으므로 메모리 어댑터가 받는다(AC-06은 그래서
//       이 파일로 검증되지 않는다. 아래 AC-06 주석 참고).
//   (2) 시험용 브라우저 환경 — jsdom과, 쿠키 저장소·지연·응답 유실을 흉내 내는 전달 계층.
// 정상 흐름의 find-id·request·verify·confirm·login 응답은 하나도 고정 JSON으로 바꾸지 않는다.
//
// F01_TEST_DATABASE_URL이 없으면 각 케이스는 실패가 아니라 명시적 skip(=미검증)으로 남는다.

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
// ProtectedRoute는 미인증 진입에 alert로 안내한다 — jsdom 기본 alert는 예외를 던지므로 조용한
// 스텁으로 바꾼다(이 파일의 대상은 공개 경로라 호출되지 않아야 하지만, 실제 라우터 전체를
// 마운트하므로 방어적으로 둔다).
installDomGlobal("alert", () => {})
dom.window.alert = () => {}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// "@/" 별칭·JSX 변환은 저장소 공용 훅을 그대로 쓰고, import.meta.env를 읽는 shared/env.js만
// 별도 훅으로 갈아끼운다(mock.module과 달리 실험 플래그가 필요 없어, 격리 DB 실행기의
// `node --test <파일>` 단독 실행에서도 그대로 돈다).
register(new URL("../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))
register(new URL("./testSupport/viteEnvStubLoaderHooks.mjs", import.meta.url))

// ── 시험 전달 계층 ─────────────────────────────────────────────────────────────
// 브라우저가 해 주는 일(쿠키 보관·전송)만 대신하고, 요청·응답 자체는 손대지 않는다. 지연과
// 응답 유실은 시험이 명시적으로 켤 때만 작동한다.
const nativeFetch = globalThis.fetch

let apiBase = ""
let fetchCalls = []
let beforeSend = null // async (call) => void
let afterReceive = null // async (call, response) => "drop" | undefined
let cookieJar = new Map()

const cookieHeader = () => [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ")

async function testFetch(input, init = {}) {
  const raw = String(input)
  const url = raw.startsWith("http") ? raw : `${apiBase}${raw}`
  // credentials·cache는 브라우저 전용 의미다 — Node fetch에 그대로 넘기지 않고, 쿠키는 아래
  // 저장소가 대신 싣는다.
  const { credentials, cache, headers: givenHeaders, ...rest } = init
  const headers = { ...(givenHeaders || {}) }
  // 시험이 특정 세션 쿠키를 직접 지정한 요청은 그대로 둔다(폐기된 옛 세션을 재현하는
  // 케이스가 그렇게 쓴다) — 지정이 없을 때만 저장소가 브라우저처럼 대신 싣는다.
  if (!headers.cookie) {
    const jarCookie = cookieHeader()
    if (jarCookie) headers.cookie = jarCookie
  }

  const call = { url: raw, method: rest.method || "GET", body: rest.body }
  fetchCalls.push(call)
  if (beforeSend) await beforeSend(call)

  const response = await nativeFetch(url, { ...rest, headers })

  for (const rawCookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = rawCookie.split(";")
    const index = pair.indexOf("=")
    if (index > 0) cookieJar.set(pair.slice(0, index).trim(), pair.slice(index + 1))
  }

  if (afterReceive) {
    const verdict = await afterReceive(call, response)
    if (verdict === "drop") {
      // 서버는 이미 처리를 끝냈고(본문까지 읽는다) 클라이언트만 결과를 받지 못한 상황이다.
      await response.json().catch(() => {})
      throw new TypeError("Failed to fetch")
    }
  }
  return response
}

installDomGlobal("fetch", testFetch)

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../../../app/routes/index.jsx")

const require = createRequire(import.meta.url)
const fixtureModule = require("../../../../../../backend/tests/helpers/f29RecoveryFixture.cjs")

const availability = await fixtureModule.checkAvailability()

const unavailable = (t) => {
  if (!availability.ok) {
    t.skip(availability.reason)
    return true
  }
  return false
}

test.beforeEach(() => {
  fetchCalls = []
  beforeSend = null
  afterReceive = null
  cookieJar = new Map()
})

test.afterEach(() => cleanup())

test.after(async () => {
  if (availability.ok) await fixtureModule.closeF29RecoveryFixtures()
})

// ── 화면 조작 헬퍼 ─────────────────────────────────────────────────────────────

async function goTo(path) {
  await act(async () => { await router.navigate(path) })
}

// main.jsx와 같이 StrictMode로 감싼다 — 개발 실행의 이중 effect(마운트 → 정리 → 재마운트)에서
// GET verify가 한 번만 나가는지까지 같은 조건으로 확인하기 위함이다.
async function mountRouter() {
  let view
  await act(async () => {
    view = render(React.createElement(React.StrictMode, null, React.createElement(RouterProvider, { router })))
  })
  return view
}

const setInput = (view, name, value) => {
  fireEvent.change(view.container.querySelector(`input[name="${name}"]`), { target: { value } })
}

const submitForm = async (view) => {
  await act(async () => { fireEvent.submit(view.container.querySelector("form")) })
}

const clickText = async (view, text) => {
  await act(async () => { fireEvent.click(view.getByText(text)) })
}

const statusText = (view) => view.container.querySelector('[role="status"]')?.textContent ?? ""
const alertText = (view) => [...view.container.querySelectorAll('[role="alert"]')].map((n) => n.textContent).join(" | ")

/** 메일에 담긴 링크의 경로+쿼리만 꺼낸다 — 실제 사용자가 그 링크를 여는 것과 같은 진입이다. */
const linkPathOf = (mail) => {
  const url = new URL(mail.params.resetUrl)
  return `${url.pathname}${url.search}`
}

const postJson = (path, body) => testFetch(path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
})

// ── AC-01: 로그인 화면 → 요청 → 메일 링크 → 새 비밀번호 → 로그인 ─────────────────

test("AC-01: 비로그인 상태에서 로그인 화면의 비밀번호 찾기로 들어가 실제 DB·메일 링크를 거쳐 새 비밀번호로 로그인까지 끊김 없이 진행된다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t)
  apiBase = fx.baseURL

  const email = `ac01-${randomUUID()}@example.com`
  const user = await fx.createLocalUser({ nickname: "복구유저", email })

  await goTo("/login")
  const view = await mountRouter()

  // (1) 로그인 화면의 링크로 진입한다 — 경로를 시험이 직접 치지 않는다.
  await clickText(view, "비밀번호 찾기")
  await waitFor(() => assert.equal(router.state.location.pathname, "/password-reset/request"))

  // (2) 이메일 제출 → 실제 POST /auth/password-reset/request.
  setInput(view, "email", email)
  await submitForm(view)
  await waitFor(() => assert.notEqual(statusText(view), ""))

  const requestCalls = fetchCalls.filter((c) => c.url === "/auth/password-reset/request")
  assert.equal(requestCalls.length, 1)
  assert.equal(requestCalls[0].method, "POST")

  // 완료 안내는 발송 성공을 단정하지 않는다 — 서버가 답한 것은 "접수"뿐이다.
  assert.equal(statusText(view).includes("보내드렸어요"), false, "응답에 없는 '발송 완료'를 화면이 단정하면 안 된다")

  assert.equal(await fx.db.PasswordResetToken.count({ where: { user_id: user.uuid } }), 1, "실제 DB에 토큰이 발급돼야 한다")
  assert.equal(fx.outbox.length, 1)
  assert.equal(fx.outbox[0].template, "PASSWORD_RESET")
  assert.equal(fx.outbox[0].to, email)

  // (3) 메일 링크로 이동 → 실제 GET verify(비소비).
  const beforeVerify = await fx.db.PasswordResetToken.findOne({ where: { user_id: user.uuid } })
  await goTo(linkPathOf(fx.outbox[0]))
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))

  const verifyCalls = fetchCalls.filter((c) => c.url.startsWith("/auth/password-reset/verify"))
  assert.equal(verifyCalls.length, 1, "같은 방문의 StrictMode 이중 effect에도 GET은 한 번이어야 한다")
  assert.equal(verifyCalls[0].method, "GET")

  const afterVerify = await fx.db.PasswordResetToken.findOne({ where: { user_id: user.uuid } })
  assert.equal(afterVerify.used, false, "GET verify는 토큰을 소비하면 안 된다")
  assert.equal(afterVerify.revoked_at, beforeVerify.revoked_at)

  const before = await fx.db.User.findByPk(user.uuid)

  // (4) 새 비밀번호 제출 → 실제 POST confirm.
  setInput(view, "password", "fresh-secret-1")
  setInput(view, "passwordConfirm", "fresh-secret-1")
  await submitForm(view)
  await waitFor(() => assert.ok(view.container.textContent.includes("비밀번호가 재설정되었어요")))
  assert.equal(view.container.querySelector('input[name="password"]'), null, "성공하면 비밀번호 입력은 사라진다")

  const usedRow = await fx.db.PasswordResetToken.findOne({ where: { user_id: user.uuid } })
  assert.equal(usedRow.used, true, "confirm은 실제 DB에서 토큰을 소비해야 한다")
  const after = await fx.db.User.findByPk(user.uuid)
  assert.notEqual(after.password_hash, before.password_hash)

  // (5) 완료 화면에서 로그인으로 이동 → 실제 /login 화면.
  await clickText(view, "로그인으로 이동")
  await waitFor(() => assert.equal(router.state.location.pathname, "/login"))

  // (6) 새 비밀번호로만 로그인된다.
  const newLogin = await postJson("/auth/login", { email, password: "fresh-secret-1" })
  assert.equal(newLogin.status, 200)
  const oldLogin = await postJson("/auth/login", { email, password: user.password })
  assert.equal(oldLogin.status, 401)
})

test("AC-01: 응답이 늦는 동안 다시 제출해도 실제 서버로 나가는 요청은 한 번뿐이다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t)
  apiBase = fx.baseURL
  const email = `ac01-slow-${randomUUID()}@example.com`
  await fx.createLocalUser({ nickname: "지연유저", email })

  let release
  const gate = new Promise((resolve) => { release = resolve })
  beforeSend = async (call) => { if (call.url === "/auth/password-reset/request") await gate }

  await goTo("/password-reset/request")
  const view = await mountRouter()
  setInput(view, "email", email)
  await submitForm(view)
  await submitForm(view)

  assert.equal(fetchCalls.filter((c) => c.url === "/auth/password-reset/request").length, 1)

  beforeSend = null
  await act(async () => { release() })
  await waitFor(() => assert.notEqual(statusText(view), ""))
  assert.equal(fx.outbox.length, 1, "서버에도 요청이 한 번만 도달해야 한다")
})

// ── AC-01/AC-03: 커밋 이후 응답 유실 — 화면은 완료를 단정하지 않는다 ─────────────────

test("AC-03: confirm이 DB에 커밋된 뒤 응답이 유실되면 화면은 완료를 단정하지 않고 입력을 보존하며, 같은 링크 재시도는 USED로 거부된다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t)
  apiBase = fx.baseURL
  const email = `ac03-lost-${randomUUID()}@example.com`
  const user = await fx.createLocalUser({ nickname: "유실유저", email })

  await goTo("/password-reset/request")
  const view = await mountRouter()
  setInput(view, "email", email)
  await submitForm(view)
  await waitFor(() => assert.notEqual(statusText(view), ""))

  await goTo(linkPathOf(fx.outbox[0]))
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))

  afterReceive = async (call) => (call.url === "/auth/password-reset/confirm" ? "drop" : undefined)
  setInput(view, "password", "lost-response-1")
  setInput(view, "passwordConfirm", "lost-response-1")
  await submitForm(view)

  await waitFor(() => assert.ok(alertText(view).includes("서버와 통신할 수 없습니다")))
  assert.equal(view.container.textContent.includes("비밀번호가 재설정되었어요"), false, "응답을 받지 못했으면 완료로 단정하면 안 된다")
  assert.equal(view.container.querySelector('input[name="password"]').value, "lost-response-1", "입력은 보존된다")

  // 서버 쪽은 이미 끝났다 — 토큰은 소비됐고 비밀번호는 바뀌었다.
  const row = await fx.db.PasswordResetToken.findOne({ where: { user_id: user.uuid } })
  assert.equal(row.used, true)

  // 같은 화면에서 그대로 다시 제출하면 USED 안내로 전이한다(자동 재시도가 아니라 사용자 제출).
  afterReceive = null
  await submitForm(view)
  await waitFor(() => assert.ok(view.container.textContent.includes("이미 사용된 링크예요")))

  const newLogin = await postJson("/auth/login", { email, password: "lost-response-1" })
  assert.equal(newLogin.status, 200, "유실된 것은 응답뿐이므로 새 비밀번호는 실제로 적용돼 있어야 한다")
  const oldLogin = await postJson("/auth/login", { email, password: user.password })
  assert.equal(oldLogin.status, 401)
})

// ── AC-01: verify·confirm 합산 IP 제한(429) ───────────────────────────────────

test("AC-01: verify 요청이 실제 IP 제한(429)에 걸리면 제한 안내를 보여주고 자동으로 다시 호출하지 않는다", async (t) => {
  if (unavailable(t)) return
  // 실제 기본 계약과 같은 방식(합산 IP 제한)이되, 케이스에서 빨리 도달하도록 한도만 1로 둔다.
  const fx = await fixtureModule.createF29RecoveryFixture(t, { limits: { PASSWORD_RESET_CHECK_IP_MAX: '1' } })
  apiBase = fx.baseURL
  const email = `ac01-429-${randomUUID()}@example.com`
  await fx.createLocalUser({ nickname: "제한유저", email })

  await goTo("/password-reset/request")
  const view = await mountRouter()
  setInput(view, "email", email)
  await submitForm(view)
  await waitFor(() => assert.notEqual(statusText(view), ""))

  const linkPath = linkPathOf(fx.outbox[0])

  // 첫 방문은 한도 안이다(1회) — ready까지 간다.
  await goTo(linkPath)
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))

  // 두 번째 방문의 GET verify는 429다.
  await goTo("/password-reset/request")
  await goTo(linkPath)
  await waitFor(() => assert.ok(alertText(view).includes("확인 요청이 너무 많습니다")))

  const verifyCount = fetchCalls.filter((c) => c.url.startsWith("/auth/password-reset/verify")).length
  assert.equal(verifyCount, 2, "429 이후 자동 재시도가 있으면 안 된다")
  assert.equal(view.container.textContent.includes("유효하지 않은 링크예요"), false, "제한을 링크 무효로 단정하면 안 된다")
})

// ── AC-02: 아이디 찾기 화면 → 실제 DB → 마스킹된 이메일만 ────────────────────────

test("AC-02: 로그인 화면의 아이디 찾기로 들어가 일치/불일치를 실제 DB로 확인하고, 성공 응답에는 마스킹된 이메일만 담긴다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t)
  apiBase = fx.baseURL

  // 기대 마스킹 값은 여기 직접 고정한다 — 생산 maskEmail을 기대값 계산기로 쓰면 그 함수가
  // 바뀌어도 시험이 따라 바뀌어 아무것도 고정하지 못한다.
  await fx.createLocalUser({ nickname: "찾기대상", email: "abc@example.com", birthDate: "1995-05-05" })

  await goTo("/login")
  const view = await mountRouter()
  await clickText(view, "아이디 찾기")
  await waitFor(() => assert.equal(router.state.location.pathname, "/find-id"))

  setInput(view, "nickname", "찾기대상")
  setInput(view, "birthDate", "1995-05-05")
  await submitForm(view)

  await waitFor(() => assert.equal(statusText(view), "a***c@e***.com"))
  assert.equal(view.container.textContent.includes("abc@example.com"), false, "전체 이메일이 화면에 남으면 안 된다")

  // 같은 요청의 실제 응답 본문에도 마스킹 값과 ok만 있다.
  const raw = await postJson("/auth/find-id", { nickname: "찾기대상", birthDate: "1995-05-05" })
  const body = await raw.json()
  assert.deepEqual(Object.keys(body).sort(), ["maskedEmail", "ok"])
  assert.equal(body.maskedEmail, "a***c@e***.com")

  // 날짜 불일치는 공통 안내이고 입력은 보존된다.
  await clickText(view, "다시 찾기")
  setInput(view, "nickname", "찾기대상")
  setInput(view, "birthDate", "1995-05-06")
  await submitForm(view)
  await waitFor(() => assert.ok(alertText(view).includes("입력한 정보와 일치하는 계정을 찾을 수 없습니다.")))
  assert.equal(view.container.querySelector('input[name="nickname"]').value, "찾기대상")

  // 조회 시도는 계정 존재 여부와 무관하게 이메일 없이 기록된다.
  const logged = await fx.db.AccountFindRequest.findAll({ where: { request_type: "FIND_ID" }, raw: true })
  assert.equal(logged.length, 3)
  for (const row of logged) assert.equal(row.email, null)
})

// ── AC-05: 미등록·소셜 전용·로컬 계정의 응답과 화면이 모두 같다 ───────────────────

test("AC-05: 미등록 이메일·소셜 전용 계정·로컬 계정의 재설정 요청은 상태·본문·완료 화면이 모두 같고, 소셜 전용 계정에는 토큰 없이 제공자 안내만 나간다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t)
  apiBase = fx.baseURL

  const localEmail = `ac05-local-${randomUUID()}@example.com`
  const socialEmail = `ac05-social-${randomUUID()}@example.com`
  const missingEmail = `ac05-missing-${randomUUID()}@example.com`
  const local = await fx.createLocalUser({ nickname: "로컬계정", email: localEmail })
  const social = await fx.createSocialOnlyUser({ nickname: "소셜계정", email: socialEmail })

  const socialRow = await fx.db.User.findByPk(social.uuid)
  assert.equal(socialRow.has_local_password, false, "전제: 소셜 가입 계정은 로컬 비밀번호가 없다")

  const screens = []
  for (const email of [localEmail, socialEmail, missingEmail]) {
    await goTo("/password-reset/request")
    const view = await mountRouter()
    setInput(view, "email", email)
    await submitForm(view)
    await waitFor(() => assert.notEqual(statusText(view), ""))
    screens.push(statusText(view))
    cleanup()
  }
  assert.equal(new Set(screens).size, 1, "계정 유형에 따라 완료 화면이 달라지면 계정 존재 여부가 드러난다")

  // 응답 상태·본문도 같다.
  const responses = []
  for (const email of [localEmail, socialEmail, missingEmail]) {
    const res = await postJson("/auth/password-reset/request", { email })
    responses.push({ status: res.status, body: await res.json() })
  }
  assert.deepEqual(responses[0], responses[1])
  assert.deepEqual(responses[1], responses[2])
  assert.deepEqual(responses[0], { status: 200, body: { ok: true } })

  // 드러나지 않는 차이는 메일 내용과 DB에만 있다.
  const templatesFor = (email) => fx.outbox.filter((m) => m.to === email).map((m) => m.template)
  assert.deepEqual(new Set(templatesFor(localEmail)), new Set(["PASSWORD_RESET"]))
  assert.deepEqual(new Set(templatesFor(socialEmail)), new Set(["SOCIAL_LOGIN_GUIDE"]))
  assert.equal(templatesFor(missingEmail).length, 0, "없는 계정에는 어떤 메일도 나가지 않는다")

  assert.equal(await fx.db.PasswordResetToken.count({ where: { user_id: social.uuid } }), 0, "소셜 전용 계정에는 토큰을 만들지 않는다")
  assert.ok(await fx.db.PasswordResetToken.count({ where: { user_id: local.uuid } }) > 0)

  // 메일 전송이 실패해도(반환 실패·예외 각각) 응답은 그대로다.
  fx.mail.failNextWithResult()
  const failedResult = await postJson("/auth/password-reset/request", { email: localEmail })
  assert.deepEqual({ status: failedResult.status, body: await failedResult.json() }, { status: 200, body: { ok: true } })
  fx.mail.failNextWithThrow()
  const thrownResult = await postJson("/auth/password-reset/request", { email: localEmail })
  assert.deepEqual({ status: thrownResult.status, body: await thrownResult.json() }, { status: 200, body: { ok: true } })
})

// ── AC-04: 재설정 성공이 기존 HTTP 세션과 유휴 Socket.IO 연결을 함께 폐기한다 ────────

test("AC-04: 재설정이 성공하면 클라이언트 이벤트 없이도 기존 HTTP 세션이 거부되고 유휴 소켓이 force_disconnect로 끊기며, 다른 계정의 소켓은 유지된다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t, { socket: true })
  apiBase = fx.baseURL

  const { io: connectSocket } = await import("socket.io-client")

  const targetEmail = `ac04-target-${randomUUID()}@example.com`
  const otherEmail = `ac04-other-${randomUUID()}@example.com`
  const target = await fx.createLocalUser({ nickname: "폐기대상", email: targetEmail })
  await fx.createLocalUser({ nickname: "무관계정", email: otherEmail })

  const loginFor = async (email, password) => {
    const res = await postJson("/auth/login", { email, password })
    assert.equal(res.status, 200)
    const cookies = res.headers.getSetCookie?.() ?? []
    const pick = (name) => cookies.find((c) => c.startsWith(`${name}=`)).split(";")[0].split("=")[1]
    return { accessToken: pick("accessToken"), refreshToken: pick("refreshToken") }
  }

  const targetSession = await loginFor(targetEmail, target.password)
  const otherSession = await loginFor(otherEmail, "correct-horse-1")

  const connect = async (accessToken) => {
    const socket = connectSocket(fx.baseURL, {
      transports: ["websocket"],
      extraHeaders: { cookie: `accessToken=${accessToken}` },
      reconnection: false,
    })
    await new Promise((resolve, reject) => {
      socket.on("connect", resolve)
      socket.on("connect_error", reject)
    })
    return socket
  }

  const targetSocket = await connect(targetSession.accessToken)
  const otherSocket = await connect(otherSession.accessToken)
  t.after(() => { targetSocket.close(); otherSocket.close() })

  // 클라이언트는 이 뒤로 어떤 이벤트도 보내지 않는다 — 이벤트 가드가 아니라 주기 재검증이
  // 끊었다고 말할 수 있어야 한다.
  const forceDisconnects = []
  targetSocket.on("force_disconnect", (payload) => forceDisconnects.push(payload))
  const otherForceDisconnects = []
  otherSocket.on("force_disconnect", (payload) => otherForceDisconnects.push(payload))

  const meBefore = await testFetch("/auth/me", { headers: { cookie: `accessToken=${targetSession.accessToken}` } })
  assert.equal(meBefore.status, 200, "전제: 재설정 이전 세션은 유효하다")

  await postJson("/auth/password-reset/request", { email: targetEmail })
  const token = fixtureModule.tokenOf(fx.outbox.at(-1))

  // "남은 재설정 토큰까지 폐기된다"를 확인하려면 **소비되지 않을** 다른 토큰이 있어야 한다.
  // 정상 경로는 새 발급 때마다 기존 미사용 토큰을 폐기하므로 미사용 토큰을 둘로 만들 수
  // 없다 — 그래서 확정 직전에 같은 계정의 별도 미사용 행을 직접 심는다.
  const planted = await fx.plantUnusedResetToken({ userId: target.uuid })
  const plantedBefore = await fx.db.PasswordResetToken.findByPk(planted.id)
  assert.equal(plantedBefore.used, false, "전제: 심어 둔 토큰은 확정 이전에 미사용이다")
  assert.equal(plantedBefore.revoked_at, null)
  const plantedVerifyBefore = await testFetch(`/auth/password-reset/verify?token=${encodeURIComponent(planted.rawToken)}`)
  assert.deepEqual(await plantedVerifyBefore.json(), { ok: true, status: "VALID" }, "전제: 심어 둔 토큰은 확정 이전에 실제로 쓸 수 있다")

  const confirmRes = await postJson("/auth/password-reset/confirm", { token, newPassword: "revoke-all-pw-1" })
  assert.equal(confirmRes.status, 200)

  // 새 로그인을 한 번도 거치지 않은 시점이다 — 폐기의 주체가 confirm임이 분명해진다.
  cookieJar = new Map()
  const meAfter = await testFetch("/auth/me", { headers: { cookie: `accessToken=${targetSession.accessToken}` } })
  assert.equal(meAfter.status, 401)
  const refreshAfter = await testFetch("/auth/refresh", { method: "POST", headers: { cookie: `refreshToken=${targetSession.refreshToken}` } })
  assert.equal(refreshAfter.status, 401)

  // 주기 재검증(5초)이 유휴 소켓을 끊는다.
  await new Promise((resolve) => setTimeout(resolve, 9000))
  assert.equal(forceDisconnects.length >= 1, true, "유휴 소켓이 주기 재검증으로 끊기지 않았다")
  assert.equal(targetSocket.connected, false)

  assert.deepEqual(otherForceDisconnects, [], "다른 계정의 소켓까지 끊으면 안 된다")
  assert.equal(otherSocket.connected, true)

  // 남은 재설정 토큰(확정에 쓰이지 않은 그 행)도 함께 폐기된다 — 재로그인만이 길이다.
  const plantedAfter = await fx.db.PasswordResetToken.findByPk(planted.id)
  assert.equal(plantedAfter.used, true, "확정에 쓰이지 않은 다른 토큰이 미사용으로 남으면 안 된다")
  assert.ok(plantedAfter.revoked_at, "남은 토큰은 폐기 시각이 찍혀야 한다")

  const plantedVerifyAfter = await testFetch(`/auth/password-reset/verify?token=${encodeURIComponent(planted.rawToken)}`)
  assert.deepEqual(await plantedVerifyAfter.json(), { ok: false, code: "INVALID" })
  const plantedConfirm = await postJson("/auth/password-reset/confirm", { token: planted.rawToken, newPassword: "planted-should-fail-1" })
  assert.equal(plantedConfirm.status, 400)
  assert.deepEqual(await plantedConfirm.json(), { ok: false, code: "INVALID" }, "폐기된 남은 토큰으로는 다시 재설정할 수 없어야 한다")

  const remaining = await fx.db.PasswordResetToken.count({ where: { user_id: target.uuid, used: false } })
  assert.equal(remaining, 0)
  const relogin = await postJson("/auth/login", { email: targetEmail, password: "revoke-all-pw-1" })
  assert.equal(relogin.status, 200)
})

// ── AC-06: 이 파일이 검증하지 않는 것 ──────────────────────────────────────────
//
// 실제 메일 게이트웨이 설정과 외부 테스트 수신함이 제공되지 않아, "실제로 도착한 메일의
// 링크로 로그인까지 된다"는 AC-06은 여기서 검증되지 않는다(미검증). 메모리 outbox는 전달
// 경계를 대체한 것이므로 수신 증거로 쓰지 않는다 — 위 케이스들은 전부 "서버가 만든 링크"를
// 읽을 뿐 "메일이 도착했다"고 단정하지 않는다.
