// 견본(도우미 쓰는 법 본보기) — 화면 부품 시험(jsdom): 낮 시작 연출 글 창이 아무도 안 죽은 밤 글을 보이고 "확인"을 눌러야 닫힘
// 시험 쓰는 에이전트가 베껴 쓰는 틀, 돌리기(frontend 폴더): node --experimental-test-module-mocks --test tests/a05-night/sample-dawn-report.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react")
const { default: InGameDawnReport } = await import("../../src/domains/game/ingame/components/dawnReport/InGameDawnReport.jsx")
const { buildDawnReport } = await import("../../src/domains/game/ingame/utils/dawnReport.js")

test.afterEach(() => cleanup())

// 5명 판 명단 (닉네임만 씀, 직업은 화면에 안 감)
const PLAYERS = ["가", "나", "다", "라", "마"].map((nickname, i) => ({ uuid: `u${i}`, nickname }))

test("견본-1 아무도 안 죽은 밤(의사가 살렸든 광대가 안 죽였든): 낮 시작 글 창에 '아무 일도 일어나지 않았습니다' 글, 확인 전엔 안 닫히고 확인 한 번에 닫힘", () => {
  // 서버 밤 결과 값 → 화면 연출 값 (죽은 사람 없음, 의사가 살렸는지는 서버가 안 보냄)
  const report = buildDawnReport({ gameId: "g1", nightDayIndex: 1, deathReveals: [], players: PLAYERS })
  let finished = 0
  render(React.createElement(InGameDawnReport, { report, open: true, onFinish: () => { finished += 1 } }))

  const dialog = screen.getByRole("dialog", { name: "단계 전환 안내" })
  assert.match(dialog.textContent, /지난밤 아무 일도 일어나지 않았습니다/)
  // 직업 이름이 글에 없음
  assert.doesNotMatch(dialog.textContent, /광대|의사|경비원|마녀사냥꾼|시민|귀족/)
  assert.equal(finished, 0)

  fireEvent.click(screen.getByRole("button", { name: "확인" }))
  assert.equal(finished, 1)
})

test("견본-2 그 밤 사이 탈락이 보인 밤: 연출 값이 없어 창을 안 그림", () => {
  const report = buildDawnReport({ gameId: "g1", nightDayIndex: 1, deathReveals: [], nightDeparted: true, players: PLAYERS })
  assert.equal(report, null)
  const view = render(React.createElement(InGameDawnReport, { report, open: true, onFinish: () => {} }))
  assert.equal(view.container.innerHTML, "")
})
