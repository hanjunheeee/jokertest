// 카톡형 채팅방 목록 섞기 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildTalkFeed, startsGroup } from "../../src/domains/game/ingame/utils/talk/buildTalkFeed.js"

const messages = [
    { id: 1, playerId: "u-me", senderName: "나", text: "안녕", sentAt: 1000 },
    { id: 2, playerId: "u-yh", senderName: "영희", text: "철수 수상해", sentAt: 3000 },
]
const notices = [{ id: "n1", at: 2000, text: "철수님이 죽었습니다" }]
const emojis = [{ id: "e1", at: 4000, playerId: "u-yh", itemId: "emo-1" }]
const nameOf = (id) => (id === "u-yh" ? "영희" : "")

test("말·알림·이모티콘을 시각 순으로 섞음", () => {
    const feed = buildTalkFeed({ messages, notices, emojis, localPlayerId: "u-me", nameOf })
    assert.deepEqual(feed.map((line) => line.kind), ["chat", "system", "chat", "emoji"])
    assert.deepEqual(feed.map((line) => line.at), [1000, 2000, 3000, 4000])
})

test("내 말만 mine, 이모티콘 보낸 사람 이름은 명단에서", () => {
    const feed = buildTalkFeed({ messages, emojis, localPlayerId: "u-me", nameOf })
    assert.equal(feed[0].mine, true)
    assert.equal(feed[1].mine, false)
    assert.equal(feed[2].name, "영희")
})

test("밤 목록이면 채팅 말만 조커 표시", () => {
    const feed = buildTalkFeed({ messages, notices, emojis, joker: true, nameOf })
    const jokerKinds = feed.filter((line) => line.joker).map((line) => line.kind)
    assert.deepEqual(jokerKinds, ["chat", "chat"])
})

test("내 번호가 없으면 아무것도 mine 아님", () => {
    const feed = buildTalkFeed({ messages })
    assert.equal(feed.some((line) => line.mine), false)
})

test("시각이 이상한 줄은 맨 뒤, 같은 시각은 들어온 순서", () => {
    const feed = buildTalkFeed({
        messages: [
            { id: "a", playerId: "x", text: "1", sentAt: Number.NaN },
            { id: "b", playerId: "x", text: "2", sentAt: 5 },
            { id: "c", playerId: "x", text: "3", sentAt: 5 },
        ],
    })
    assert.deepEqual(feed.map((line) => line.text), ["2", "3", "1"])
})

test("같은 사람이 이어 말하면 묶음, 알림 뒤나 사람이 바뀌면 새 묶음", () => {
    const feed = buildTalkFeed({
        messages: [
            { id: 1, playerId: "a", text: "1", sentAt: 1 },
            { id: 2, playerId: "a", text: "2", sentAt: 2 },
            { id: 3, playerId: "b", text: "3", sentAt: 4 },
        ],
        notices: [{ id: "n", at: 3, text: "알림" }],
    })
    const groups = feed.map((line, index) => startsGroup(line, feed[index - 1]))
    assert.deepEqual(groups, [true, false, false, true])
})

// 죽은 사람끼리 채팅 (사용자 결정 2026-11-09): 죽은 뒤엔 낮 말·죽은 사람 말이 섞여 오고 줄마다 채널이 붙음
test("죽은 뒤 목록: 죽은 사람 말은 dead(회색), 낮 말은 보통, 같은 직업 말은 조커색", () => {
    const feed = buildTalkFeed({
        messages: [
            { id: 1, playerId: "a", text: "낮", sentAt: 1, channel: "DAY" },
            { id: 2, playerId: "b", text: "죽은 사람", sentAt: 2, channel: "DEAD" },
            { id: 3, playerId: "c", text: "광대", sentAt: 3, channel: "JOKER" },
        ],
        joker: true,
    })
    assert.deepEqual(feed.map((line) => [line.text, line.dead, line.joker]), [
        ["낮", false, false],
        ["죽은 사람", true, false],
        ["광대", false, true],
    ])
})

test("같은 사람이라도 낮 말 → 죽은 사람 말로 바뀌면 새 묶음", () => {
    const feed = buildTalkFeed({
        messages: [
            { id: 1, playerId: "a", text: "살아서", sentAt: 1, channel: "DAY" },
            { id: 2, playerId: "a", text: "죽어서", sentAt: 2, channel: "DEAD" },
        ],
    })
    assert.deepEqual(feed.map((line, index) => startsGroup(line, feed[index - 1])), [true, true])
})
