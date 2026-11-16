// 결과 화면 미리보기(?outcome=) 문 시험: 운영 빌드면 막힘, 개발·시험 빌드면 열림 (결정 2026-11-16 아침 16번)
// 목록 A07-승패-결과-골드.md A07-F-101~103, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a07-result/g-preview-gate.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./resultKit.mjs"

const { isResultPreviewAllowed } = await import("../../src/domains/game/result/utils/previewGate.js")
const { default: GameResultPage } = await import("../../src/domains/game/result/page/GameResultPage.jsx")

test.afterEach(K.resetAll)

const introOf = () => document.querySelector("[data-game-result-intro]")?.getAttribute("data-game-result-intro") ?? null

test("A07-F-101 미리보기 문: 운영 빌드 → 막힘, 운영 아님 → 열림, 시험(node)에서 기본값 → 열림", () => {
  assert.deepEqual(
    { prod: isResultPreviewAllowed(true), dev: isResultPreviewAllowed(false), node: isResultPreviewAllowed() },
    { prod: false, dev: true, node: true },
  )
})

test("A07-F-102 운영 아닌 빌드: 판 없이 /gameresult?outcome=lose → 미리보기 결과 영상(lose)이 뜸", async () => {
  K.installFakeSocket()
  const view = await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.RTL.act(async () => { await view.router.navigate("/gameresult?outcome=lose") })
  await K.flush()
  assert.equal(introOf(), "lose")
})
