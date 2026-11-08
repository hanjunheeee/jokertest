// 시스템 알림 줄 만들기 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import { diffPlayerNotices, toNoticePlayers } from "../../src/domains/game/ingame/utils/talk/playerNotices.js"

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

test("끊긴 사람이 그사이 죽으면 사망 알림 (MO-005)", () => {
    const prev = [{ id: "a", nickname: "철수", alive: true, connected: false }]
    const next = [{ id: "a", nickname: "철수", alive: false, connected: false }]
    assert.deepEqual(diffPlayerNotices(prev, next, 5).map((notice) => notice.text), ["철수님이 죽었습니다"])
})

test("죽은 사람이 끊기면 알림 없음, 판 참가자 모양 바꾸기", () => {
    const prev = toNoticePlayers([{ uuid: "a", nickname: "철수", alive: false, isConnected: true }])
    const next = toNoticePlayers([{ uuid: "a", nickname: "철수", alive: false, isConnected: false }])
    assert.deepEqual(prev, [{ id: "a", nickname: "철수", alive: false, connected: true }])
    assert.deepEqual(diffPlayerNotices(prev, next, 5), [])
})

test("칸 이름에 상태 붙이기 (MO-012)", async () => {
    const { slotLabel } = await import("../../src/domains/game/ingame/utils/talk/slotLabel.js")
    assert.equal(slotLabel("철수", "alive"), "철수")
    assert.equal(slotLabel("철수", "dead", true), "철수, 나, 사망")
    assert.equal(slotLabel("영희", "disconnected"), "영희, 연결 끊김")
})
