// 모바일 방 만들기 설정 패널 시험: 없앤 세 칸이 안 보이고, 정원 경계·직접 지정 합 넘음이 화면에 맞게 막힘
// 목록 A01a 모바일 A01-M-001~003 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-setup-panel.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, pageText } from "./a00-kit.mjs"

const { default: SetupPanel } = await import("@m/domains/game/setup/components/SetupPanel.jsx")

let view = null
afterEach(() => { view?.unmount(); view = null })

// 만들기 모드 패널 그리기
function drawPanel() {
    view = render(React.createElement(SetupPanel, { isCreating: false, onCreateGame: () => {} }))
    return view
}

// 단추를 n번 누름 (꺼지면 멈춤)
function pressTimes(name, n) {
    for (let i = 0; i < n; i += 1) {
        const btn = buttonNamed(name)
        assert.ok(btn, `"${name}" 단추가 없음: ${buttonNames().join(" | ")}`)
        if (btn.disabled) return
        click(btn)
    }
}

test("A01-M-001 모바일 만들기 화면 두 탭 어디에도 '불이 꺼진 무도회'·'영혼의 베팅'·'투표 공개' 칸 없음", () => {
    drawPanel()
    const seen = []
    for (const tab of ["일반", "회의&투표"]) {
        click(buttonNamed(tab))
        seen.push(pageText())
    }
    for (const text of seen) {
        for (const gone of ["불이 꺼진 무도회", "영혼의 베팅", "투표 공개"]) {
            assert.ok(!text.includes(gone), `"${gone}" 글이 보임`)
        }
    }
})

test("A01-M-002 모바일 정원 경계: 10에서 + 꺼짐, 5까지 내리면 − 꺼짐", () => {
    drawPanel()
    assert.equal(buttonNamed("최대 플레이어 수 증가").disabled, true, "정원 10인데 + 가 켜짐")
    assert.equal(buttonNamed("최대 플레이어 수 감소").disabled, false)
    pressTimes("최대 플레이어 수 감소", 5)
    const group = buttonNamed("최대 플레이어 수 감소").parentElement
    assert.match(group.textContent, /\b5\b/, "정원이 5가 아님")
    assert.equal(buttonNamed("최대 플레이어 수 감소").disabled, true, "정원 5인데 − 가 켜짐")
})

test("A01-M-003 모바일 직접 지정 합 넘음: 정원 5 + 광대2·의사2·경비원1·마녀사냥꾼1 → 오류 글, '게임 만들기' 꺼짐", () => {
    drawPanel()
    pressTimes("최대 플레이어 수 감소", 5)
    // 역할 구성: 자동 → 직접 지정
    click(buttonNamed("역할 구성 증가"))
    assert.ok(pageText().includes("직접 지정"), "직접 지정으로 안 바뀜")
    pressTimes("광대 인원 증가", 1)
    pressTimes("의사 인원 증가", 2)
    pressTimes("경비원 인원 증가", 1)
    pressTimes("마녀사냥꾼 인원 증가", 1)
    const alert = document.querySelector("[data-setup-role-composition-summary] [role=alert]")
    assert.ok(alert, "오류 글이 없음")
    assert.ok(alert.textContent.trim().length > 0, "오류 글이 빔")
    assert.equal(buttonNamed("게임 만들기").disabled, true, "'게임 만들기'가 켜짐")
})
