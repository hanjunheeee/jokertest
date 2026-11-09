import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_DISCORD_LINK_ERROR_MESSAGE,
  mapDiscordLinkErrorCode,
  resolveDiscordLinkMessage,
  startDiscordLink,
  SESSION_LOST_CODE,
} from "../../../../src/domains/user/hooks/useDiscordAccountLink.js"

test("resolveDiscordLinkMessage: socialLinkSuccess가 있으면 success 메시지를 돌려준다", () => {
  const message = resolveDiscordLinkMessage({ socialLinkSuccess: "discord", socialLinkError: null })
  assert.deepEqual(message, { type: "success", text: "Discord 계정이 연결되었습니다." })
})

test("resolveDiscordLinkMessage: socialLinkError가 있으면 매핑된 오류 문구를 돌려준다", () => {
  const message = resolveDiscordLinkMessage({ socialLinkSuccess: null, socialLinkError: "IDENTITY_ALREADY_LINKED" })
  assert.deepEqual(message, { type: "error", text: mapDiscordLinkErrorCode("IDENTITY_ALREADY_LINKED") })
  assert.equal(message.text, "이미 다른 계정에 연결된 Discord 계정입니다.")
})

test("resolveDiscordLinkMessage: 성공도 실패도 없으면 null이다(평소 화면)", () => {
  assert.equal(resolveDiscordLinkMessage({ socialLinkSuccess: null, socialLinkError: null }), null)
  assert.equal(resolveDiscordLinkMessage(), null)
})

test("resolveDiscordLinkMessage: success가 실려 있으면 error 값과 무관하게 success를 우선한다", () => {
  const message = resolveDiscordLinkMessage({ socialLinkSuccess: "discord", socialLinkError: "OAUTH_CANCELLED" })
  assert.equal(message.type, "success")
})

test("mapDiscordLinkErrorCode: 등록된 코드는 그 문구를, 등록되지 않은 코드는 기본 문구를 돌려준다", () => {
  assert.equal(mapDiscordLinkErrorCode("OAUTH_CANCELLED"), "Discord 계정 연결을 취소했습니다.")
  assert.equal(mapDiscordLinkErrorCode("STATE_USER_MISMATCH"), "연결 요청을 시작한 세션과 일치하지 않습니다. 다시 로그인 후 시도해주세요.")
  assert.equal(mapDiscordLinkErrorCode("SOMETHING_UNKNOWN"), DEFAULT_DISCORD_LINK_ERROR_MESSAGE)
  assert.equal(mapDiscordLinkErrorCode(undefined), DEFAULT_DISCORD_LINK_ERROR_MESSAGE)
})

test("mapDiscordLinkErrorCode: 상속된 프로토타입 키는 값으로 새지 않는다(React #31 방지, F-06/F-07 재검토 지적과 같은 이유)", () => {
  assert.equal(mapDiscordLinkErrorCode("__proto__"), DEFAULT_DISCORD_LINK_ERROR_MESSAGE)
  assert.equal(mapDiscordLinkErrorCode("constructor"), DEFAULT_DISCORD_LINK_ERROR_MESSAGE)
  assert.equal(mapDiscordLinkErrorCode("toString"), DEFAULT_DISCORD_LINK_ERROR_MESSAGE)
})

test("FE-011: 연결 시작 전에 세션부터 확인하고, 확인되면 연결 주소로 감", async () => {
  const went = []
  const lost = []
  const ok = await startDiscordLink("http://api/auth/discord/link", {
    check: async () => true, go: (url) => went.push(url), onSessionLost: (code) => lost.push(code),
  })
  assert.equal(ok, true)
  assert.deepEqual(went, ["http://api/auth/discord/link"])
  assert.deepEqual(lost, [])
})

test("M-1: 세션 확인이 안 되면 로그아웃·로그인 화면 이동 없이 '다시 로그인 후 연결' 안내 코드만 넘김", async () => {
  const went = []
  const lost = []
  const ok = await startDiscordLink("http://api/auth/discord/link", {
    check: async () => false, go: (url) => went.push(url), onSessionLost: (code) => lost.push(code),
  })
  assert.equal(ok, false)
  assert.deepEqual(went, [])
  assert.deepEqual(lost, [SESSION_LOST_CODE])
  assert.equal(mapDiscordLinkErrorCode(SESSION_LOST_CODE), "로그인이 만료되었습니다. 다시 로그인 후 연결해 주세요.")
})

test("M-1: 기본 세션 확인은 /auth/refresh를 먼저 부르지 않음 (access 살아 있으면 /auth/me 한 번만)", async () => {
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  try {
    const went = []
    const ok = await startDiscordLink("http://api/auth/discord/link", { go: (url) => went.push(url) })
    assert.equal(ok, true)
    assert.deepEqual(went, ["http://api/auth/discord/link"])
    assert.equal(calls.length, 1)
    assert.match(calls[0], /\/auth\/me$/)
  } finally {
    globalThis.fetch = realFetch
  }
})
