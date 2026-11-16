// 결과 화면 우측 위 타이머 시험: "180초"·남은 초 값·읽기 이름, 닫힘 시각 모르면 안 그림, 결과 없음 화면엔 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-017~019 (화면 부품, 결과 화면 전체를 그려 봄)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"

const { default: GameResultPage } = await import("../../src/domains/game/result/page/GameResultPage.jsx")

test.afterEach(K.resetAll)

const timer = () => document.querySelector('[data-testid="result-close-timer"]')

// 끝난 판 결과 화면 (영상 넘김), snapshotAnswer: 결과 화면이 판 상태를 물을 때 서버 답
async function openResult({ n, resultClosesAt, snapshotAnswer }) {
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n, me: 1, resultClosesAt })
  sock.answer("get_session_snapshot", snapshotAnswer ?? (() => g.snapshot))
  await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.finishIntro()
  await K.flush()
  return g
}

test("A08-F-017 6명 판: 닫힘 = 지금 + 180초 → 타이머 글 \"180초\", data-seconds-left 180, 읽기 이름", async () => {
  await openResult({ n: 6, resultClosesAt: Date.now() + 180_000 })
  const el = timer()
  assert.ok(el !== null, "타이머가 없음")
  assert.match(el.textContent, /180초/)
  assert.equal(el.getAttribute("data-seconds-left"), "180")
  assert.equal(el.getAttribute("aria-label"), "결과 화면 남은 시간 180초, 끝나면 로비로 이동")
})

test("A08-F-018 7명 판: 닫힘 시각 null → 타이머 없음", async () => {
  // 판 상태에도 없고, 물어도 서버 답에 없음
  const sock = K.installFakeSocket()
  const g = K.endedGame({ n: 7, me: 1, resultClosesAt: null })
  sock.answer("get_session_snapshot", () => g.snapshot)
  await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.finishIntro()
  await K.flush()
  // 결과판은 그려짐 (화면이 빈 게 아님)
  assert.ok(document.querySelector('section[aria-label="가면무도회 참가자 정체"]') !== null, "결과판이 없음")
  assert.ok(timer() === null, "없어야 할 것이 있음: timer()")
})

test("A08-F-019 결과 없음(새로고침 뒤) 화면엔 타이머 없음", async () => {
  const sock = K.installFakeSocket()
  K.signIn("a07a0000-0000-4000-8000-000000888001", "나")
  sock.answer("get_session_snapshot", { ok: false, code: "SESSION_NOT_FOUND" })
  await K.renderAt("/gameresult", K.h(GameResultPage))
  await K.waitUntil(() => document.body.textContent.includes("게임 결과를 확인할 수 없습니다"), { label: "결과 없음 안내" })
  assert.ok(timer() === null, "없어야 할 것이 있음: timer()")
})
