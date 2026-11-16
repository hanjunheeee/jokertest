// 모바일 대기방 설정 바꾸기 화면 시험: 없앤 세 칸이 두 탭 어디에도 안 보임
// 목록 A01a 모바일 A01-M-005 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-settings-edit.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, pageText } from "./a00-kit.mjs"

const { default: SettingsEditSheet } = await import("@m/domains/game/matching/components/settingsEdit/SettingsEditSheet.jsx")

let view = null
afterEach(() => { view?.unmount(); view = null })

test("A01-M-005 모바일 설정 바꾸기 목록 두 탭에 '불이 꺼진 무도회'·'영혼의 베팅'·'투표 공개' 없음", () => {
    view = render(React.createElement(SettingsEditSheet, {
        settingsForm: null, formResetKey: "r1", isSaving: false,
        onSubmit: () => {}, onCancel: () => {}, settingsError: null, hasPendingSettingsResult: false,
    }))
    assert.ok(buttonNamed("설정 저장"), "설정 바꾸기 화면이 안 그려짐")
    const seen = []
    for (const tab of ["일반", "회의&투표"]) {
        click(buttonNamed(tab))
        seen.push(pageText())
    }
    // 회의 탭이 정말 그려졌는지 (낮 토론 줄)
    assert.match(seen[1], /낮 토론 시간/)
    for (const text of seen) {
        for (const gone of ["불이 꺼진 무도회", "영혼의 베팅", "투표 공개"]) {
            assert.ok(!text.includes(gone), `"${gone}" 글이 보임`)
        }
    }
})
