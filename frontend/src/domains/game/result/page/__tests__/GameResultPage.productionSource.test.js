import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const pageUrl = new URL("../GameResultPage.jsx", import.meta.url)

/**
 * GameResultPage.jsx는 .jsx라서 이 저장소의 node:test 실행에는 로더가 없어 직접 렌더링할 수 없다
 * (InGamePage.productionSource.test.js와 동일한 제약). 대신 raw source 검증으로 "실데이터가
 * 미리보기보다 우선하고, 미리보기는 ?outcome= 게이트 뒤에만 쓰이며, 그릴 것이 없으면 로비로
 * 돌아간다"는 배선을 증명한다.
 */

test("GameResultPage는 실데이터 훅(useGameResultData)을 쓴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /import \{ useGameResultData \} from "\.\.\/hooks\/useGameResultData\.js"/)
  assert.match(source, /const live = useGameResultData\(\)/)
})

test("개발용 preview는 삭제되지 않고 남아 있되, ?outcome= 게이트를 통과할 때만 쓰인다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /const preview = useGameResultPreview\(\)/)
  assert.match(source, /GAME_RESULT_OUTCOMES\.includes\(searchParams\.get\("outcome"\)\)/)
  assert.match(source, /const view = live \?\? \(previewRequested \? preview : null\)/)
})

test("그릴 결과가 없으면 기존 로비 복귀 경로(/multiplay)로 replace 이동한다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /navigate\("\/multiplay", \{ replace: true \}\)/)
  assert.match(source, /if \(!view\) return null/)
})

test("GameResultShell은 정확히 한 번, 고른 view model 하나만 받아 마운트된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const occurrences = source.match(/<GameResultShell\b/g) ?? []
  assert.equal(occurrences.length, 1)
  assert.match(source, /<GameResultShell \{\.\.\.view\} \/>/)
})

test("결과 페이지 컴포넌트·에셋 계약(outcome/players/mvp)은 이 페이지에서 재가공되지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  // view model 조립은 전부 훅/순수 함수 쪽에 있다 — 페이지가 shape을 다시 손대면 계약이 갈라진다.
  assert.doesNotMatch(source, /players\s*[:=]/)
  assert.doesNotMatch(source, /mvp\s*[:=]/)
})

test("로비 복귀 버튼은 useGameResultLobbyExit이 만든 핸들러에 물려 있다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(
    source,
    /import \{ useGameResultLobbyExit \} from "\.\.\/hooks\/useGameResultLobbyExit\.js"/,
  )
  assert.match(source, /const requestLobbyExit = useGameResultLobbyExit\(\)/)
  assert.match(source, /onClick=\{requestLobbyExit\}/)
})

test("버튼은 새 스타일을 만들지 않고 공통 LabelledActionButton + 기존 빨간 버튼 에셋을 쓴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const occurrences = source.match(/<LabelledActionButton\b/g) ?? []
  assert.equal(occurrences.length, 1)
  assert.match(source, /src=\{GAME_RESULT_ASSETS\.lobbyButton\}/)
  assert.match(source, /label="로비로"/)
})

test("버튼은 실데이터·미리보기 어느 쪽을 그리든 함께 렌더된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  // 그릴 것이 없을 때의 early return 뒤에 있어야 view의 출처와 무관하게 항상 뜬다.
  assert.ok(source.indexOf("<LabelledActionButton") > source.indexOf("if (!view) return null"))
})

test("이탈 요청은 페이지가 아니라 util에 있다 — 페이지는 소켓 이벤트를 직접 다루지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.doesNotMatch(source, /leave_game_session/)
})
