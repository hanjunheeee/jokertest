import assert from "node:assert/strict"
import test from "node:test"
import { resolveDiscordSupportUrl } from "../discordSupport.js"

// F-07 AC-05: 고객센터 Discord 초대 URL은 백엔드 OAuth 앱 자격(DISCORD_CLIENT_ID/
// DISCORD_CLIENT_SECRET/DISCORD_REDIRECT_URI)과 분리된 별도 공개 설정이어야 한다. 이
// 테스트는 그 값의 검증 규칙(미설정=사용 불가, 안전하지 않은 스킴/도메인 거부)을 고정한다.

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
