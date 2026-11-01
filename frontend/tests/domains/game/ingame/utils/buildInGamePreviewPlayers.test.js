import test, { mock } from "node:test"
import assert from "node:assert/strict"

mock.module("../../../../../src/domains/game/ingame/utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `portrait-${index}` },
})
mock.module("../../../../../src/domains/game/ingame/utils/pickInGamePlayerFrame.js", {
  namedExports: { pickInGamePlayerFrame: (index) => `frame-${index}` },
})

const { buildInGamePreviewPlayers } = await import("../../../../../src/domains/game/ingame/utils/buildInGamePreviewPlayers.js")
const { INGAME_PLAYER_THEME_PALETTE_SIZE } = await import("../../../../../src/shared/constants/ingamePlayerTheme.js")

test("같은 count로 두 번 호출하면 themeIndex 배열이 완전히 동일하다(무작위 셔플 없음)", () => {
  const first = buildInGamePreviewPlayers(10).map((p) => p.themeIndex)
  const second = buildInGamePreviewPlayers(10).map((p) => p.themeIndex)
  assert.deepEqual(first, second)
})

test("themeIndex는 슬롯 index를 팔레트 크기로 순환한 값이다", () => {
  const players = buildInGamePreviewPlayers(10)
  assert.deepEqual(
    players.map((p) => p.themeIndex),
    Array.from({ length: 10 }, (_, index) => index % INGAME_PLAYER_THEME_PALETTE_SIZE),
  )
})

test("각 항목의 theme은 자신의 themeIndex로 해석된 팔레트 항목이다", () => {
  for (const player of buildInGamePreviewPlayers(10)) {
    assert.equal(player.theme.paletteIndex, player.themeIndex)
  }
})

test("count가 팔레트 크기보다 커도 색이 순환 재사용되며 길이는 count와 같다", () => {
  const players = buildInGamePreviewPlayers(INGAME_PLAYER_THEME_PALETTE_SIZE + 2)
  assert.equal(players.length, INGAME_PLAYER_THEME_PALETTE_SIZE + 2)
  assert.equal(players[INGAME_PLAYER_THEME_PALETTE_SIZE].themeIndex, players[0].themeIndex)
})
