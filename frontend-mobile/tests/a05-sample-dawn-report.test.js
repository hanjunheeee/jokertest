// 견본(도우미 쓰는 법 본보기) — 모바일 화면 부품 시험(jsdom): 낮 시작 연출 글 창이 의사가 살렸을 때 글을 보이고 "확인"으로 닫힘
// 시험 쓰는 에이전트가 베껴 쓰는 틀, 돌리기(frontend-mobile 폴더): node --test tests/a05-sample-dawn-report.test.js
// 길 풀기(@/·@m/·.jsx) 먼저, 그다음 가짜 브라우저 화면 — 시험 대상은 그 뒤 await import()로
import "./helpers/mobileLoader.mjs"
import { React, render, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

const { default: DawnReportOverlay } = await import("@m/domains/game/ingame/components/overlays/DawnReportOverlay.jsx")
const { buildDawnReport } = await import("@/domains/game/ingame/utils/dawnReport.js")

// 5명 판 명단 (닉네임만, 직업은 화면에 안 감)
const PLAYERS = ["가", "나", "다", "라", "마"].map((nickname, i) => ({ uuid: `u${i}`, nickname }))
let view = null
afterEach(() => { view?.unmount(); view = null })

test("견본-1 의사가 살린 밤: 모바일 낮 시작 글 창에 '살려냈습니다' 글, 확인 한 번에 닫힘", () => {
    const report = buildDawnReport({ gameId: "g1", nightDayIndex: 1, deathReveals: [], doctorSaved: true, players: PLAYERS })
    let finished = 0
    view = render(React.createElement(DawnReportOverlay, { report, open: true, onFinish: () => { finished += 1 } }))

    const dialog = document.querySelector('[role="dialog"][aria-label="단계 전환 안내"]')
    assert.ok(dialog, "단계 전환 안내 창이 없음")
    assert.match(dialog.textContent, /지난밤 의사가 공격받은 사람을 살려냈습니다/)
    assert.equal(finished, 0)

    const confirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent.trim() === "확인")
    act(() => confirm.click())
    assert.equal(finished, 1)
})
