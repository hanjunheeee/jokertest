import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const hookUrl = new URL("../useGameResultLobbyExit.js", import.meta.url)

/**
 * 이 훅은 useNavigate에 의존해 React 렌더 컨텍스트 없이는 실행할 수 없다
 * (GameResultPage.productionSource.test.js와 동일한 제약). 동작 자체는 순수 factory인
 * createGameResultExitRequest 테스트가 덮고 있으므로, 여기서는 raw source 검증으로
 * "버튼이 실제 소켓·store·기존 세션 정리 finalizer에 물려 있다"는 배선만 증명한다.
 */

test("이탈 로직은 훅이 아니라 createGameResultExitRequest에 있다", async () => {
  const source = await readFile(hookUrl, "utf8")
  assert.match(
    source,
    /import \{ createGameResultExitRequest \} from "\.\.\/utils\/createGameResultExitRequest\.js"/,
  )
  assert.match(source, /createGameResultExitRequest\(\{/)
})

test("세션 정리 경로를 새로 만들지 않고 createSessionEndFinalizer를 finalize로 쓴다", async () => {
  const source = await readFile(hookUrl, "utf8")
  assert.match(source, /import \{ createSessionEndFinalizer \} from "\.\.\/\.\.\/ingame\/utils\/createSessionEndFinalizer\.js"/)
  assert.match(source, /finalize: createSessionEndFinalizer\(\{/)
})

test("leave 대상 gameId는 store에서 읽는다", async () => {
  const source = await readFile(hookUrl, "utf8")
  assert.match(source, /getCurrentGameId: \(\) => useInGameStore\.getState\(\)\.gameId/)
})

test("정리는 두 store의 기존 액션(clearGame/clearRoom)을 재사용한다", async () => {
  const source = await readFile(hookUrl, "utf8")
  assert.match(source, /clearGame: \(\) => useInGameStore\.getState\(\)\.clearGame\(\)/)
  assert.match(source, /clearRoom: \(\) => useMatchingStore\.getState\(\)\.clearRoom\(\)/)
})

test("socket은 공용 싱글턴 접근자에서 가져온다", async () => {
  const source = await readFile(hookUrl, "utf8")
  assert.match(source, /import \{ getSocket \} from "@\/shared\/socket\/socketClient\.js"/)
})
