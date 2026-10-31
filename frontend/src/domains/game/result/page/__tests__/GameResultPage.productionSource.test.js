import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const pageUrl = new URL("../GameResultPage.jsx", import.meta.url)

test("GameResultPage는 실데이터 훅(useGameResultData)을 쓴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /import \{ useGameResultData \} from "\.\.\/hooks\/useGameResultData\.js"/)
  assert.match(source, /const live = useGameResultData\(\)/)
})

test("결과 화면은 더미 훅이 아니라 실데이터 view model을 GameResultShell에 넘긴다", async () => {
  const source = await readFile(pageUrl, "utf8")
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

test("그릴 결과가 없으면 확인 불가 안내를 그리고, 로비 복귀(/multiplay replace)는 사용자 클릭에서만 일어난다", async () => {
  const source = await readFile(pageUrl, "utf8")

  assert.match(source, /if \(!view && bootstrapPending\) return null/)
  assert.match(source, /const bootstrapPending = bootstrapStatus === "checking" && !holdExpired/)

  assert.match(source, /RESULT_UNAVAILABLE_TITLE/)
  assert.match(source, /RESULT_UNAVAILABLE_BODY/)
  assert.doesNotMatch(source, /방 코드/)
  assert.doesNotMatch(source, /RoomCodeViewModal/)

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
  assert.doesNotMatch(source, /players\s*[:=]/)
  assert.doesNotMatch(source, /mvp\s*[:=]/)
})

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

test("버튼은 새 스타일을 만들지 않고 공통 LabelledActionButton + 기존 버튼 에셋을 쓴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const occurrences = source.match(/<LabelledActionButton\b/g) ?? []
  assert.equal(occurrences.length, 2)
  assert.match(source, /src=\{GAME_RESULT_ASSETS\.matchingButton\}/)
  assert.match(source, /GAME_RESULT_MATCHING_BUTTON_LABEL/)
  assert.match(source, /src=\{GAME_RESULT_ASSETS\.lobbyButton\}/)
  assert.match(source, /GAME_RESULT_LOBBY_BUTTON_LABEL/)
})

test("매칭 복귀는 전용 훅(useGameResultReturnToMatching)에 묶이고 leave_game_session을 쓰지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(
    source,
    /import \{ useGameResultReturnToMatching \} from "\.\.\/hooks\/useGameResultReturnToMatching\.js"/,
  )
  assert.match(source, /const \{ requestReturnToMatching, isReturning \} = useGameResultReturnToMatching\(\)/)
  assert.match(source, /onClick=\{\(\) => \{ if \(!isReturning\) requestReturnToMatching\(\) \}\}/)
  assert.doesNotMatch(source, /leave_game_session/)
  assert.doesNotMatch(source, /requestExit.*requestReturnToMatching|requestReturnToMatching.*requestExit/)
})

test("로비 버튼은 연출 영상이 끝난 뒤 결과 화면과 함께 렌더된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.ok(source.indexOf("<LabelledActionButton") > source.indexOf("if (!introComplete)"))
})

test("이탈 요청은 페이지가 아니라 기존 util에 있다 — 페이지는 소켓 이벤트를 직접 다루지 않는다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.doesNotMatch(source, /leave_game_session/)
  assert.doesNotMatch(source, /getSocket/)
})
