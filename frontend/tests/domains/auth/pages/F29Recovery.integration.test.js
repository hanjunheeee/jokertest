import assert from "node:assert/strict"
import test from "node:test"
import { createRequire, register } from "node:module"
import { randomUUID } from "node:crypto"
import { JSDOM } from "jsdom"
import React from "react"

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

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))
register(new URL("../../../helpers/viteEnvStubLoaderHooks.mjs", import.meta.url))

const nativeFetch = globalThis.fetch

let apiBase = ""
let fetchCalls = []
let beforeSend = null
let afterReceive = null
let cookieJar = new Map()

const cookieHeader = () => [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; ")

async function testFetch(input, init = {}) {
  const raw = String(input)
  const url = raw.startsWith("http") ? raw : `${apiBase}${raw}`
  const { credentials, cache, headers: givenHeaders, ...rest } = init
  const headers = { ...(givenHeaders || {}) }
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
      await response.json().catch(() => {})
      throw new TypeError("Failed to fetch")
    }
  }
  return response
}

installDomGlobal("fetch", testFetch)

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../../../src/app/routes/index.jsx")

const require = createRequire(import.meta.url)
const fixtureModule = require("../../../../../backend/tests/helpers/f29RecoveryFixture.cjs")

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

async function goTo(path) {
  await act(async () => { await router.navigate(path) })
}

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

const linkPathOf = (mail) => {
  const url = new URL(mail.params.resetUrl)
  return `${url.pathname}${url.search}`
}

const postJson = (path, body) => testFetch(path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
})

test("AC-01: 비로그인 상태에서 로그인 화면의 비밀번호 찾기로 들어가 실제 DB·메일 링크를 거쳐 새 비밀번호로 로그인까지 끊김 없이 진행된다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t)
  apiBase = fx.baseURL

  const email = `ac01-${randomUUID()}@example.com`
  const user = await fx.createLocalUser({ nickname: "복구유저", email })

  await goTo("/login")
  const view = await mountRouter()

  await clickText(view, "비밀번호 찾기")
  await waitFor(() => assert.equal(router.state.location.pathname, "/password-reset/request"))

  setInput(view, "email", email)
  await submitForm(view)
  await waitFor(() => assert.notEqual(statusText(view), ""))

  const requestCalls = fetchCalls.filter((c) => c.url === "/auth/password-reset/request")
  assert.equal(requestCalls.length, 1)
  assert.equal(requestCalls[0].method, "POST")

  assert.equal(statusText(view).includes("보내드렸어요"), false, "응답에 없는 '발송 완료'를 화면이 단정하면 안 된다")

  assert.equal(await fx.db.PasswordResetToken.count({ where: { user_id: user.uuid } }), 1, "실제 DB에 토큰이 발급돼야 한다")
  assert.equal(fx.outbox.length, 1)
  assert.equal(fx.outbox[0].template, "PASSWORD_RESET")
  assert.equal(fx.outbox[0].to, email)

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

  setInput(view, "password", "fresh-secret-1")
  setInput(view, "passwordConfirm", "fresh-secret-1")
  await submitForm(view)
  await waitFor(() => assert.ok(view.container.textContent.includes("비밀번호가 재설정되었어요")))
  assert.equal(view.container.querySelector('input[name="password"]'), null, "성공하면 비밀번호 입력은 사라진다")

  const usedRow = await fx.db.PasswordResetToken.findOne({ where: { user_id: user.uuid } })
  assert.equal(usedRow.used, true, "confirm은 실제 DB에서 토큰을 소비해야 한다")
  const after = await fx.db.User.findByPk(user.uuid)
  assert.notEqual(after.password_hash, before.password_hash)

  await clickText(view, "로그인으로 이동")
  await waitFor(() => assert.equal(router.state.location.pathname, "/login"))

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

  const row = await fx.db.PasswordResetToken.findOne({ where: { user_id: user.uuid } })
  assert.equal(row.used, true)

  afterReceive = null
  await submitForm(view)
  await waitFor(() => assert.ok(view.container.textContent.includes("이미 사용된 링크예요")))

  const newLogin = await postJson("/auth/login", { email, password: "lost-response-1" })
  assert.equal(newLogin.status, 200, "유실된 것은 응답뿐이므로 새 비밀번호는 실제로 적용돼 있어야 한다")
  const oldLogin = await postJson("/auth/login", { email, password: user.password })
  assert.equal(oldLogin.status, 401)
})

test("AC-01: verify 요청이 실제 IP 제한(429)에 걸리면 제한 안내를 보여주고 자동으로 다시 호출하지 않는다", async (t) => {
  if (unavailable(t)) return
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

  await goTo(linkPath)
  await waitFor(() => assert.ok(view.container.querySelector('input[name="password"]')))

  await goTo("/password-reset/request")
  await goTo(linkPath)
  await waitFor(() => assert.ok(alertText(view).includes("확인 요청이 너무 많습니다")))

  const verifyCount = fetchCalls.filter((c) => c.url.startsWith("/auth/password-reset/verify")).length
  assert.equal(verifyCount, 2, "429 이후 자동 재시도가 있으면 안 된다")
  assert.equal(view.container.textContent.includes("유효하지 않은 링크예요"), false, "제한을 링크 무효로 단정하면 안 된다")
})

test("AC-02: 로그인 화면의 아이디 찾기로 들어가 일치/불일치를 실제 DB로 확인하고, 성공 응답에는 마스킹된 이메일만 담긴다", async (t) => {
  if (unavailable(t)) return
  const fx = await fixtureModule.createF29RecoveryFixture(t)
  apiBase = fx.baseURL

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

  const raw = await postJson("/auth/find-id", { nickname: "찾기대상", birthDate: "1995-05-05" })
  const body = await raw.json()
  assert.deepEqual(Object.keys(body).sort(), ["maskedEmail", "ok"])
  assert.equal(body.maskedEmail, "a***c@e***.com")

  await clickText(view, "다시 찾기")
  setInput(view, "nickname", "찾기대상")
  setInput(view, "birthDate", "1995-05-06")
  await submitForm(view)
  await waitFor(() => assert.ok(alertText(view).includes("입력한 정보와 일치하는 계정을 찾을 수 없습니다.")))
  assert.equal(view.container.querySelector('input[name="nickname"]').value, "찾기대상")

  const logged = await fx.db.AccountFindRequest.findAll({ where: { request_type: "FIND_ID" }, raw: true })
  assert.equal(logged.length, 3)
  for (const row of logged) assert.equal(row.email, null)
})

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

  const responses = []
  for (const email of [localEmail, socialEmail, missingEmail]) {
    const res = await postJson("/auth/password-reset/request", { email })
    responses.push({ status: res.status, body: await res.json() })
  }
  assert.deepEqual(responses[0], responses[1])
  assert.deepEqual(responses[1], responses[2])
  assert.deepEqual(responses[0], { status: 200, body: { ok: true } })

  const templatesFor = (email) => fx.outbox.filter((m) => m.to === email).map((m) => m.template)
  assert.deepEqual(new Set(templatesFor(localEmail)), new Set(["PASSWORD_RESET"]))
  assert.deepEqual(new Set(templatesFor(socialEmail)), new Set(["SOCIAL_LOGIN_GUIDE"]))
  assert.equal(templatesFor(missingEmail).length, 0, "없는 계정에는 어떤 메일도 나가지 않는다")

  assert.equal(await fx.db.PasswordResetToken.count({ where: { user_id: social.uuid } }), 0, "소셜 전용 계정에는 토큰을 만들지 않는다")
  assert.ok(await fx.db.PasswordResetToken.count({ where: { user_id: local.uuid } }) > 0)

  fx.mail.failNextWithResult()
  const failedResult = await postJson("/auth/password-reset/request", { email: localEmail })
  assert.deepEqual({ status: failedResult.status, body: await failedResult.json() }, { status: 200, body: { ok: true } })
  fx.mail.failNextWithThrow()
  const thrownResult = await postJson("/auth/password-reset/request", { email: localEmail })
  assert.deepEqual({ status: thrownResult.status, body: await thrownResult.json() }, { status: 200, body: { ok: true } })
})

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

  const forceDisconnects = []
  targetSocket.on("force_disconnect", (payload) => forceDisconnects.push(payload))
  const otherForceDisconnects = []
  otherSocket.on("force_disconnect", (payload) => otherForceDisconnects.push(payload))

  const meBefore = await testFetch("/auth/me", { headers: { cookie: `accessToken=${targetSession.accessToken}` } })
  assert.equal(meBefore.status, 200, "전제: 재설정 이전 세션은 유효하다")

  await postJson("/auth/password-reset/request", { email: targetEmail })
  const token = fixtureModule.tokenOf(fx.outbox.at(-1))

  const planted = await fx.plantUnusedResetToken({ userId: target.uuid })
  const plantedBefore = await fx.db.PasswordResetToken.findByPk(planted.id)
  assert.equal(plantedBefore.used, false, "전제: 심어 둔 토큰은 확정 이전에 미사용이다")
  assert.equal(plantedBefore.revoked_at, null)
  const plantedVerifyBefore = await testFetch(`/auth/password-reset/verify?token=${encodeURIComponent(planted.rawToken)}`)
  assert.deepEqual(await plantedVerifyBefore.json(), { ok: true, status: "VALID" }, "전제: 심어 둔 토큰은 확정 이전에 실제로 쓸 수 있다")

  const confirmRes = await postJson("/auth/password-reset/confirm", { token, newPassword: "revoke-all-pw-1" })
  assert.equal(confirmRes.status, 200)

  cookieJar = new Map()
  const meAfter = await testFetch("/auth/me", { headers: { cookie: `accessToken=${targetSession.accessToken}` } })
  assert.equal(meAfter.status, 401)
  const refreshAfter = await testFetch("/auth/refresh", { method: "POST", headers: { cookie: `refreshToken=${targetSession.refreshToken}` } })
  assert.equal(refreshAfter.status, 401)

  await new Promise((resolve) => setTimeout(resolve, 9000))
  assert.equal(forceDisconnects.length >= 1, true, "유휴 소켓이 주기 재검증으로 끊기지 않았다")
  assert.equal(targetSocket.connected, false)

  assert.deepEqual(otherForceDisconnects, [], "다른 계정의 소켓까지 끊으면 안 된다")
  assert.equal(otherSocket.connected, true)

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

