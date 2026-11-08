// 시스템 알림 줄 만들기 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import { diffPlayerNotices } from "../../src/domains/game/ingame/utils/talk/playerNotices.js"

const before = [
    { id: "a", nickname: "철수", status: "alive" },
    { id: "b", nickname: "영희", status: "alive" },
    { id: "c", nickname: "민수", status: "dead" },
]

test("살아 있다가 죽거나 끊긴 사람마다 알림 한 줄", () => {
    const after = [
        { id: "a", nickname: "철수", status: "dead" },
        { id: "b", nickname: "영희", status: "disconnected" },
        { id: "c", nickname: "민수", status: "dead" },
    ]
    const notices = diffPlayerNotices(before, after, 100)
    assert.deepEqual(notices.map((notice) => notice.text), ["철수님이 죽었습니다", "영희님의 연결이 끊겼습니다"])
    assert.ok(notices.every((notice) => notice.at === 100))
})

test("이미 죽어 있던 사람·다시 들어온 사람은 알림 없음", () => {
    const after = [
        { id: "a", nickname: "철수", status: "alive" },
        { id: "b", nickname: "영희", status: "alive" },
        { id: "c", nickname: "민수", status: "alive" },
    ]
    assert.deepEqual(diffPlayerNotices(before, after, 1), [])
})

test("처음 들어올 때(이전 명단 없음)는 알림 없음", () => {
    assert.deepEqual(diffPlayerNotices(null, before, 1), [])
})

test("같은 사람·상태·시각이면 번호가 같아 겹쳐 쌓이지 않음", () => {
    const after = [{ id: "a", nickname: "철수", status: "dead" }]
    const first = diffPlayerNotices(before, after, 7)
    const second = diffPlayerNotices(before, after, 7)
    assert.equal(first[0].id, second[0].id)
})
