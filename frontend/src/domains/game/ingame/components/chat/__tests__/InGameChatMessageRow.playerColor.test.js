import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const rowUrl = new URL("../InGameChatMessageRow.jsx", import.meta.url)

/**
 * 이 스위트는 "채팅 닉네임 색은 세션 테마(서버 colorIndex)에서만 온다"는 배선을 지킨다.
 * InGameChatMessageRow.jsx는 .jsx이고 InGameChatVariantContext.jsx를 타고 들어가 이 저장소의
 * node:test 실행에서는 렌더할 수 없으므로(다른 InGameActionPanel.*.test.js와 동일한 제약),
 * 여기서도 raw source 검증으로 실제 production 배선을 증명한다. 색 값 자체가 옳은지는
 * useInGamePlayerSession.theme.test.js가 실제 렌더로 잡는다.
 */

test("닉네임 색은 세션의 getThemeStylesByPlayerId(playerId) 결과에서만 온다", async () => {
  const source = await readFile(rowUrl, "utf8")
  assert.match(source, /const \{ getThemeStylesByPlayerId \} = useInGamePlayerSessionContext\(\)/)
  assert.match(
    source,
    /const themeStyles = playerId \? getThemeStylesByPlayerId\(playerId\) : null/,
  )
  assert.match(source, /const themedTextStyle = themeStyles \? \{ color: themeStyles\.color \} : undefined/)
})

test("테마가 없으면(colorIndex 부재·비참가자 메시지) inline color를 붙이지 않는다", async () => {
  const source = await readFile(rowUrl, "utf8")
  // themeStyles가 null이면 themedTextStyle이 undefined가 되어 style로 아무 색도 넘어가지 않는다.
  assert.match(source, /: undefined/)
  assert.match(source, /style=\{themedTextStyle\}/)
  assert.match(source, /const themedTextClass = themeStyles \? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : ""/)
})

test("닉네임 span과 본문 span 모두 같은 themedTextStyle을 쓴다(색 출처가 하나다)", async () => {
  const source = await readFile(rowUrl, "utf8")
  const usages = source.match(/themedTextStyle/g) ?? []
  // 정의 1회 + 닉네임 span 1회 + 본문 span 전개 1회
  assert.equal(usages.length, 3)
})

test("채팅 행에 색을 정하는 자체 로직이 없다 — 팔레트 직접 참조도, 랜덤/해시도 없다", async () => {
  const source = await readFile(rowUrl, "utf8")
  assert.doesNotMatch(source, /INGAME_PLAYER_THEME_PALETTE/)
  assert.doesNotMatch(source, /resolveInGamePlayerTheme/)
  assert.doesNotMatch(source, /Math\.random|hashCode|charCodeAt/)
  assert.doesNotMatch(source, /color:\s*["'`]#/)
})
