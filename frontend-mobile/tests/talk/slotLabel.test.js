// 초상 띠·카드 칸 이름(닉네임 + 나 + 상태) 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import { slotLabel } from "../../src/domains/game/ingame/utils/talk/slotLabel.js"

test("살아 있으면 닉네임만", () => {
    assert.equal(slotLabel("철수", "alive"), "철수")
})

test("죽은 사람은 사망, 끊긴 사람은 연결 끊김", () => {
    assert.equal(slotLabel("영희", "dead"), "영희, 사망")
    assert.equal(slotLabel("민수", "disconnected"), "민수, 연결 끊김")
})

test("나면 닉네임 뒤에 나, 상태는 그 뒤", () => {
    assert.equal(slotLabel("철수", "alive", true), "철수, 나")
    assert.equal(slotLabel("철수", "dead", true), "철수, 나, 사망")
})

test("닉네임 없으면 빈칸 없이 나머지만", () => {
    assert.equal(slotLabel(null, "dead"), "사망")
    assert.equal(slotLabel(undefined, "alive", true), "나")
    assert.equal(slotLabel("", "모르는상태"), "")
})
