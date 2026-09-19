import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const pageUrl = new URL("../GameResultPage.jsx", import.meta.url)

/**
 * GameResultPage.jsx는 .jsx라서 이 저장소의 node:test 실행에는 로더가 없어 직접 렌더링할 수 없다
 * (InGamePage.productionSource.test.js와 동일한 제약). 대신 raw source 검증으로 "실데이터가
 * 미리보기보다 우선하고, 미리보기는 ?outcome= 게이트 + 진행 중 게임 없음 조건 뒤에만 쓰이며,
 * 그릴 것이 없으면 로비로 돌아가고, 로비 복귀는 기존 로컬 종료 경로를 쓴다"는 배선을 증명한다.
 */

test("GameResultPage는 실데이터 훅(useGameResultData)을 쓴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /import \{ useGameResultData \} from "\.\.\/hooks\/useGameResultData\.js"/)
  assert.match(source, /const live = useGameResultData\(\)/)
})

test("결과 화면은 더미 훅이 아니라 실데이터 view model을 GameResultShell에 넘긴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  // live가 없을 때만 preview로 내려가므로, 실데이터가 있으면 항상 실데이터가 그려진다.
  assert.match(source, /const view = live \?\? \(previewRequested \? preview : null\)/)
  assert.match(source, /<GameResultShell \{\.\.\.view\} \/>/)
})

test("개발용 preview는 삭제되지 않고 남아 있되, ?outcome= 게이트를 통과할 때만 쓰인다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /const preview = useGameResultPreview\(\)/)
  assert.match(source, /GAME_RESULT_OUTCOMES\.includes\(searchParams\.get\("outcome"\)\)/)
})

test("진행 중인 게임이 store에 남아 있으면 ?outcome= 미리보기로도 결과 화면을 열지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(
    source,
    /const hasLiveSession = useInGameStore\(\(s\) => Boolean\(s\.state\) && s\.state\.phase !== "ENDED"\)/,
  )
  assert.match(source, /const previewRequested =\s*\n?\s*!hasLiveSession &&/)
})

/**
 * F-24(AC-01, A-14): 이 계약은 "그릴 게 없으면 조용히 로비로 replace"에서 바뀌었다.
 *
 * 예전 동작은 결과·코드를 확인할 수 없는 상황에서 화면에 아무것도 그리지 않고 즉시 로비로
 * 보냈다. 그러면 "코드를 확인할 수 없음"이라는 실패 경로 자체가 사용자 눈에 한 번도 닿지
 * 않는다 — A-14가 명시적으로 금지하는 동작이다. 로비 복귀 경로(/multiplay replace)는 그대로
 * 쓰되, **그 이동이 언제 일어나는가**를 아래에서 더 좁게 잠근다: 확인 중에는 아무것도 단정하지
 * 않고, 확인이 끝나 결과가 없으면 안내를 그리며, 이동은 오직 사용자의 클릭에서만 일어난다.
 */
test("그릴 결과가 없으면 확인 불가 안내를 그리고, 로비 복귀(/multiplay replace)는 사용자 클릭에서만 일어난다", async () => {
  const source = await readFile(pageUrl, "utf8")

  // 1) 확인이 끝나기 전에는 결과도 확인 불가도 아니다(성급히 쫓아내지 않는다).
  assert.match(source, /if \(!view && bootstrapPending\) return null/)
  assert.match(source, /const bootstrapPending = bootstrapStatus === "checking" && !holdExpired/)

  // 2) 확인이 끝났는데 결과가 없으면 **안내와 코드 확인 불가 진입을 그린다**.
  assert.match(source, /RESULT_UNAVAILABLE_TITLE/)
  assert.match(source, /RESULT_UNAVAILABLE_BODY/)
  assert.match(source, /방 코드 확인 불가/)

  // 3) 이동 경로는 하나뿐이고, 그것은 effect의 자동 replace가 아니라 클릭 핸들러다.
  const navigationLines = source.split("\n").filter((line) => line.includes('navigate("/multiplay"'))
  assert.equal(
    navigationLines.length, 1,
    `로비 이동이 여러 곳으로 갈렸다:\n${navigationLines.join("\n")}`,
  )
  assert.match(navigationLines[0], /onClick=/, "로비 이동이 사용자 입력이 아닌 곳에서 일어난다")
  assert.match(navigationLines[0], /navigate\("\/multiplay", \{ replace: true \}\)/)
})

test("진입 연출 영상이 끝난 뒤에만 GameResultShell과 로비 버튼을 그린다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /import GameResultIntroVideo from "\.\.\/components\/GameResultIntroVideo\.jsx"/)
  assert.match(source, /const \[introComplete, setIntroComplete\] = useState\(false\)/)
  assert.match(source, /if \(!introComplete\)/)
  assert.match(source, /<GameResultIntroVideo/)
  assert.match(source, /onComplete=\{\(\) => setIntroComplete\(true\)\}/)
})

test("GameResultShell은 정확히 한 번, 고른 view model 하나만 받아 마운트된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const occurrences = source.match(/<GameResultShell\b/g) ?? []
  assert.equal(occurrences.length, 1)
})

test("결과 페이지 컴포넌트·에셋 계약(outcome/players/mvp)은 이 페이지에서 재가공되지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  // view model 조립은 전부 훅/순수 함수 쪽에 있다 — 페이지가 shape을 다시 손대면 계약이 갈라진다.
  assert.doesNotMatch(source, /players\s*[:=]/)
  assert.doesNotMatch(source, /mvp\s*[:=]/)
})

// --- 로비 복귀: 결과 화면 전용 경로를 새로 만들지 않고 로컬 기존 종료 경로를 쓴다 ---

test("로비 복귀 버튼은 로컬 기존 종료 경로(useInGameExit)의 requestExit에 물려 있다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(
    source,
    /import \{ useInGameExit \} from "@\/domains\/game\/ingame\/hooks\/useInGameExit\.js"/,
  )
  assert.match(source, /const \{ requestExit \} = useInGameExit\(\)/)
  assert.match(source, /onClick=\{requestExit\}/)
})

test("원격 결과 화면 전용 이탈 경로(useGameResultLobbyExit)는 쓰지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.doesNotMatch(source, /useGameResultLobbyExit/)
  assert.doesNotMatch(source, /createGameResultExitRequest/)
})

test("버튼은 새 스타일을 만들지 않고 공통 LabelledActionButton + 기존 빨간 버튼 에셋을 쓴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const occurrences = source.match(/<LabelledActionButton\b/g) ?? []
  assert.equal(occurrences.length, 1)
  assert.match(source, /src=\{GAME_RESULT_ASSETS\.lobbyButton\}/)
  assert.match(source, /label="로비로"/)
})

test("로비 버튼은 연출 영상이 끝난 뒤 결과 화면과 함께 렌더된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  // introComplete가 true일 때만 결과 UI + 로비 버튼이 함께 마운트된다.
  assert.ok(source.indexOf("<LabelledActionButton") > source.indexOf("if (!introComplete)"))
})

test("이탈 요청은 페이지가 아니라 기존 util에 있다 — 페이지는 소켓 이벤트를 직접 다루지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.doesNotMatch(source, /leave_game_session/)
  assert.doesNotMatch(source, /getSocket/)
})
