import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const cardUrl = new URL("../InGamePlayerCard.jsx", import.meta.url)
const boardUrl = new URL("../InGamePlayerBoard.jsx", import.meta.url)
const nameplateUrl = new URL("../InGamePlayerNameplate.jsx", import.meta.url)

/**
 * 이 스위트는 "카드 테두리·명패 색은 세션 테마(서버 colorIndex)에서만 온다"는 배선을 지킨다.
 * InGamePlayerCard.jsx는 .jsx이고 @/shared/ui/PublicAsset 같은 vite alias를 타고 들어가
 * 이 저장소의 node:test 실행에서는 렌더는커녕 resolve조차 되지 않으므로(다른
 * InGameActionPanel.*.test.js와 동일한 제약), 여기서도 raw source 검증으로 실제 production
 * 배선을 증명한다. 색 값 자체가 옳은지는 useInGamePlayerSession.theme.test.js가 실제 렌더로 잡는다.
 */

test("보드는 세션 플레이어의 theme을 카드에 그대로 넘긴다", async () => {
  const source = await readFile(boardUrl, "utf8")
  assert.match(source, /theme=\{player\.theme\}/)
  assert.doesNotMatch(source, /detachNameplate/)
  assert.doesNotMatch(source, /useInGamePlayerNameplateOverlayLayout/)
})

test("프레임 stroke 색은 theme styles.color에서만 온다", async () => {
  const source = await readFile(cardUrl, "utf8")
  assert.match(source, /<InGamePlayerFrameStroke[\s\S]*?color=\{styles\.color\}/)
  assert.match(source, /<InGamePlayerFrameStroke[\s\S]*?scale=\{styles\.frameStrokeScale\}/)
})

test("theme(styles)이 없으면 컬러 stroke 노드를 아예 그리지 않는다(기본색 fallback)", async () => {
  const source = await readFile(cardUrl, "utf8")
  assert.match(source, /\{styles \? \(\s*<InGamePlayerFrameStroke[\s\S]*?\/>\s*\) : null\}/)
})

test("명패 색도 styles.color에서만 오고, styles이 없으면 색 없이 기존 inset만 남는다", async () => {
  const source = await readFile(nameplateUrl, "utf8")
  assert.match(source, /buildInGamePlayerNameplateStyle\(themeStyles\)/)
})

test("카드에 색을 정하는 자체 로직이 없다 — 팔레트 직접 참조도, 랜덤/해시도 없다", async () => {
  const source = await readFile(cardUrl, "utf8")
  assert.doesNotMatch(source, /INGAME_PLAYER_THEME_PALETTE/)
  assert.doesNotMatch(source, /Math\.random|hashCode|charCodeAt/)
  assert.doesNotMatch(source, /color:\s*["'`]#/)
})

test("styles는 theme에서만 파생된다(voteHighlight는 같은 색의 stroke 강화일 뿐)", async () => {
  const source = await readFile(cardUrl, "utf8")
  assert.match(source, /resolveInGamePlayerCardThemeStyles\(theme, voteHighlight\)/)
})
