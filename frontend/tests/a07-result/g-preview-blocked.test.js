// 결과 화면 미리보기(?outcome=) 막힘 시험: 운영 빌드에서는 주소에 ?outcome= 을 붙여도 가짜 결과가 안 뜸 (결정 2026-11-16 아침 16번)
// 목록 A07-승패-결과-골드.md A07-F-103, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a07-result/g-preview-blocked.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"

// 운영 빌드 흉내: 미리보기 문을 "막힘"으로 바꿔 끼움 (결과 화면을 불러오기 전에)
mock.module(new URL("../../src/domains/game/result/utils/previewGate.js", import.meta.url).href, {
  namedExports: { isResultPreviewAllowed: () => false },
})

const K = await import("./resultKit.mjs")
const { default: GameResultPage } = await import("../../src/domains/game/result/page/GameResultPage.jsx")

test.afterEach(K.resetAll)

test("A07-F-103 운영 빌드: 판 없이 /gameresult?outcome=win → 미리보기 안 뜨고 \"게임 결과를 확인할 수 없습니다\"", async () => {
  K.startFakeClock()
  K.installFakeSocket()
  const view = await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.RTL.act(async () => { await view.router.navigate("/gameresult?outcome=win") })
  // 판 상태를 기다리는 시간(6초)을 넘김
  await K.tick(7_000)
  assert.equal(document.querySelector("[data-game-result-intro]") === null, true, "미리보기 결과 영상이 뜸")
  assert.match(document.body.textContent, /게임 결과를 확인할 수 없습니다/)
})
