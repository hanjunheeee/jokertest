import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

// 2026-09-22: 게임 열은 container-type: inline-size(최대 1192px)라 창 폭(vw)으로 잰 크기는 넓은
// 모니터에서 열보다 커지고 작은 창에서 잘린다. 아래 상수 파일은 cqw/cqi만 쓴다(한 번 고친 것이
// 되돌아오지 않게 잠근다).
const FILES = [
  "../board/ingamePlayerBoard.js",
  "../controls/ingameSidePanelLayout.js",
  "../parchment/ingameParchmentLayout.js",
  "../../../mode/constants/modeCardLayout.js",
  "../../../../user/constants/myPageLayoutStyle.js",
]

for (const rel of FILES) {
  test(`${rel.split("/").pop()}: 크기 상수에 vw 단위가 없다(cqw/cqi만)`, async () => {
    const source = await readFile(new URL(rel, import.meta.url), "utf8")
    const code = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n")
    assert.doesNotMatch(code, /\d(?:\.\d+)?vw\b/, "vw 단위가 남아 있다")
  })
}

test("viewport shell: 게임 열보다 좁은 창에서는 배너·간격을 접어 가로 스크롤이 생기지 않는다", async () => {
  const css = await readFile(new URL("../../../../../app/index.css", import.meta.url), "utf8")
  assert.match(css, /@media \(max-width: 1191px\)[\s\S]*?\.viewport-shell__banner[\s\S]*?display: none/)
})
