// 채팅방 기록 저장소(판 단위 알림·이모티콘 보관) 시험
import "../helpers/mobileLoader.mjs"
import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"

const { useTalkHistoryStore } = await import("@m/domains/game/ingame/hooks/talk/talkHistory.store.js")
const store = () => useTalkHistoryStore.getState()

beforeEach(() => {
    useTalkHistoryStore.setState({ gameId: null, notices: [], emojis: [], prevPlayers: null })
})

const notice = (n) => ({ id: `알림${n}`, at: n, text: `알림 ${n}` })
const emoji = (id) => ({ id, at: 1, playerId: "영희", itemId: "emo-1" })

test("새 판이면 기록 비움, 같은 판이면 그대로", () => {
    store().ensureGame("판1")
    store().addNotices([notice(1)])
    store().ensureGame("판1")
    assert.equal(store().notices.length, 1)
    store().ensureGame("판2")
    assert.equal(store().gameId, "판2")
    assert.deepEqual(store().notices, [])
    assert.equal(store().prevPlayers, null)
})

test("명단 바꾸기: 이전 명단 돌려주고 새 명단 기억", () => {
    const first = [{ id: "a" }]
    const second = [{ id: "b" }]
    assert.equal(store().swapPlayers(first), null)
    assert.equal(store().swapPlayers(second), first)
    assert.equal(store().prevPlayers, second)
})

test("빈 알림 묶음은 안 바뀜(같은 상태 객체)", () => {
    const before = useTalkHistoryStore.getState()
    store().addNotices([])
    assert.equal(useTalkHistoryStore.getState(), before)
})

test("알림은 최근 40줄만 남김", () => {
    store().addNotices(Array.from({ length: 30 }, (_, i) => notice(i)))
    store().addNotices(Array.from({ length: 30 }, (_, i) => notice(i + 30)))
    const notices = store().notices
    assert.equal(notices.length, 40)
    assert.equal(notices[0].id, "알림20")
    assert.equal(notices.at(-1).id, "알림59")
})

test("같은 번호 이모티콘은 한 번만 쌓임", () => {
    store().addEmojis([emoji("e1"), emoji("e2")])
    store().addEmojis([emoji("e2"), emoji("e3")])
    assert.deepEqual(store().emojis.map((e) => e.id), ["e1", "e2", "e3"])
})

test("다 아는 이모티콘만 오면 상태 그대로", () => {
    store().addEmojis([emoji("e1")])
    const before = useTalkHistoryStore.getState()
    store().addEmojis([emoji("e1")])
    assert.equal(useTalkHistoryStore.getState(), before)
})

test("이모티콘도 최근 40개만", () => {
    store().addEmojis(Array.from({ length: 45 }, (_, i) => emoji(`e${i}`)))
    assert.equal(store().emojis.length, 40)
    assert.equal(store().emojis[0].id, "e5")
})
