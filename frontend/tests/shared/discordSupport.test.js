import assert from "node:assert/strict"
import test from "node:test"
import { resolveDiscordSupportUrl } from "../../src/shared/discordSupport.js"

test("설정되지 않았으면(undefined) 사용 불가로 취급한다 — 추측한 URL을 대신 쓰지 않는다", () => {
  assert.equal(resolveDiscordSupportUrl(undefined), null)
  assert.equal(resolveDiscordSupportUrl(""), null)
  assert.equal(resolveDiscordSupportUrl("   "), null)
})

test("유효한 Discord 초대 URL(discord.gg)은 그대로 통과한다", () => {
  assert.equal(resolveDiscordSupportUrl("https://discord.gg/example"), "https://discord.gg/example")
})

test("유효한 Discord 초대 URL(discord.com/invite)은 그대로 통과한다", () => {
  assert.equal(resolveDiscordSupportUrl("https://discord.com/invite/example"), "https://discord.com/invite/example")
})

test("http(안전하지 않은 스킴)는 거부된다", () => {
  assert.equal(resolveDiscordSupportUrl("http://discord.gg/example"), null)
})

test("javascript: 스킴은 거부된다(악성 목적지 차단)", () => {
  assert.equal(resolveDiscordSupportUrl("javascript:alert(1)"), null)
})

test("Discord 초대 도메인이 아닌 목적지는 거부된다(피싱 목적지 차단)", () => {
  assert.equal(resolveDiscordSupportUrl("https://evil.example.com/discord.gg"), null)
})

test("파싱할 수 없는 문자열은 거부된다", () => {
  assert.equal(resolveDiscordSupportUrl("not a url"), null)
})

test("서버 지원 채널 URL(discord.com/channels/<serverId>/<channelId>)은 그대로 통과한다", () => {
  assert.equal(
    resolveDiscordSupportUrl("https://discord.com/channels/123456789012345678/987654321098765432"),
    "https://discord.com/channels/123456789012345678/987654321098765432",
  )
})

test("www.discord.com의 초대 URL도 통과한다", () => {
  assert.equal(
    resolveDiscordSupportUrl("https://www.discord.com/invite/example"),
    "https://www.discord.com/invite/example",
  )
})

test("OAuth 인가 경로는 거부된다 — 지원 채널이 아니라 권한 승인 화면이다", () => {
  assert.equal(
    resolveDiscordSupportUrl("https://discord.com/oauth2/authorize?client_id=123&scope=identify"),
    null,
  )
})

test("초대 코드가 없는 불완전한 경로는 거부된다", () => {
  assert.equal(resolveDiscordSupportUrl("https://discord.gg/"), null)
  assert.equal(resolveDiscordSupportUrl("https://discord.gg"), null)
  assert.equal(resolveDiscordSupportUrl("https://discord.com/invite"), null)
  assert.equal(resolveDiscordSupportUrl("https://discord.com/invite/"), null)
  assert.equal(resolveDiscordSupportUrl("https://discord.com/channels/123456789012345678"), null)
  assert.equal(resolveDiscordSupportUrl("https://discord.com/"), null)
})

test("채널 id가 숫자(snowflake)가 아니면 거부된다", () => {
  assert.equal(resolveDiscordSupportUrl("https://discord.com/channels/@me/12345"), null)
  assert.equal(resolveDiscordSupportUrl("https://discord.com/channels/abc/987654321098765432"), null)
})

test("비표준 포트를 명시한 URL은 거부된다", () => {
  assert.equal(resolveDiscordSupportUrl("https://discord.gg:8443/example"), null)
})

test("사용자정보(user:pass@)로 실제 목적지를 가린 URL은 거부된다", () => {
  assert.equal(resolveDiscordSupportUrl("https://evil.example.com@discord.gg/example"), null)
})

test("Discord 초대 도메인을 흉내낸 하위 도메인은 거부된다", () => {
  assert.equal(resolveDiscordSupportUrl("https://discord.gg.evil.example.com/example"), null)
  assert.equal(resolveDiscordSupportUrl("https://fake-discord.com/invite/example"), null)
})
