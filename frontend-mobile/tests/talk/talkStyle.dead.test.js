// 죽은 사람끼리 말풍선 색 (사용자 결정 2026-11-09): 회색 계열로 산 사람·조커 말과 구분
import { test } from "node:test"
import assert from "node:assert/strict"
import { BUBBLE_CLASS, bubbleClass } from "../../src/domains/game/ingame/components/talk/talkStyle.js"

test("죽은 사람 말은 회색 말풍선 (내 말·남 말 따로), 조커 표시보다 먼저", () => {
    assert.equal(bubbleClass({ dead: true, mine: false }), BUBBLE_CLASS.deadOther)
    assert.equal(bubbleClass({ dead: true, mine: true }), BUBBLE_CLASS.deadMine)
    assert.equal(bubbleClass({ dead: true, joker: true, mine: false }), BUBBLE_CLASS.deadOther)
    assert.equal(bubbleClass({ joker: true, mine: false }), BUBBLE_CLASS.jokerOther)
    assert.equal(bubbleClass({ mine: false }), BUBBLE_CLASS.other)
    assert.match(BUBBLE_CLASS.deadOther, /bg-\[#3a3a3a\]/)
})
