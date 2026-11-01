import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const FILES = [
  "../../../../../src/domains/game/ingame/constants/board/ingamePlayerBoard.js",
  "../../../../../src/domains/game/ingame/constants/controls/ingameSidePanelLayout.js",
  "../../../../../src/domains/game/ingame/constants/parchment/ingameParchmentLayout.js",
  "../../../../../src/domains/game/mode/constants/modeCardLayout.js",
  "../../../../../src/domains/user/constants/myPageLayoutStyle.js",
]

for (const rel of FILES) {
  test(`${rel.split("/").pop()}: 크기 상수에 vw 단위가 없다(cqw/cqi만)`, async () => {
    const source = await readFile(new URL(rel, import.meta.url), "utf8")
    const code = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n")
    assert.doesNotMatch(code, /\d(?:\.\d+)?vw\b/, "vw 단위가 남아 있다")
  })
}

test("viewport shell: 게임 열보다 좁은 창에서는 배너·간격을 접어 가로 스크롤이 생기지 않는다", async () => {
  const css = await readFile(new URL("../../../../../src/app/index.css", import.meta.url), "utf8")
  assert.match(css, /@media \(max-width: 1191px\)[\s\S]*?\.viewport-shell__banner[\s\S]*?display: none/)
})
