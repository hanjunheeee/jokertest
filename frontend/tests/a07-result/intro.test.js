// 결과 영상 시험: 영상 끝 신호 뒤 결과판, 영상이 20초 넘으면 "건너뛰기", 재생 거절이면 바로 "건너뛰기"
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-F-071~073 (화면 부품, 결과 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./resultKit.mjs"

const { default: GameResultPage } = await import("../../src/domains/game/result/page/GameResultPage.jsx")

// 영상 재생 흉내를 시험마다 원래대로 (거절 시험이 바꿈)
const originalPlay = window.HTMLMediaElement.prototype.play
test.afterEach(() => {
  window.HTMLMediaElement.prototype.play = originalPlay
  K.resetAll()
})

const board = () => document.querySelector('section[aria-label="가면무도회 참가자 정체"]')
const introVideo = () => document.querySelector("[data-game-result-intro] video")

// 끝난 판 결과 화면 (영상부터 보임)
async function openResult(n) {
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n, me: 1 })
  sock.answer("get_session_snapshot", () => g.snapshot)
  await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.flush()
}

test("A07-F-071 6명 판: 결과 영상 끝 신호 → 결과판 보임", async () => {
  await openResult(6)
  assert.ok(introVideo() !== null, "결과 영상이 없음")
  assert.ok(board() === null, "없어야 할 것이 있음: board()")
  await K.finishIntro()
  await K.flush()
  assert.ok(board() !== null, "영상 끝 뒤 결과판이 없음")
  assert.ok(introVideo() === null, "없어야 할 것이 있음: introVideo()")
})

test("A07-F-072 7명 판: 영상이 안 끝나면 19.9초엔 건너뛰기 없음, 20초에 \"건너뛰기\"", async () => {
  K.startFakeClock()
  await openResult(7)
  assert.ok(introVideo() !== null, "결과 영상이 없음")
  await K.tick(19_900)
  assert.ok(K.button("건너뛰기") === null, "없어야 할 것이 있음: K.button('건너뛰기')")
  await K.tick(100)
  assert.ok(K.button("건너뛰기") !== null, "20초에 건너뛰기 단추가 없음")
  // 누르면 결과판
  await K.click(K.button("건너뛰기"))
  assert.ok(board() !== null, "건너뛰기 뒤 결과판 없음")
})

test("A07-F-073 8명 판: 영상 재생이 거절되면 바로 \"건너뛰기\"", async () => {
  window.HTMLMediaElement.prototype.play = function play() { return Promise.reject(new Error("NotAllowedError")) }
  await openResult(8)
  await K.flush()
  assert.ok(K.button("건너뛰기") !== null, "재생 거절 뒤 건너뛰기 단추가 없음")
  assert.ok(board() === null, "없어야 할 것이 있음: board()")
})
