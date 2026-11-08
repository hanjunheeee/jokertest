// 한 판 끝 광고 "판마다 한 번" 기억 시험
import { test } from "node:test"
import assert from "node:assert/strict"
import {
    SEEN_GAMES_KEY,
    hasSeenGame,
    loadSeenGames,
    rememberGame,
    saveSeenGames,
} from "../../src/shared/ads/seenGames.js"

// 가짜 저장소 (localStorage 흉내)
const fakeStorage = (initial = {}) => {
    const data = { ...initial }
    return {
        data,
        getItem: (key) => (key in data ? data[key] : null),
        setItem: (key, value) => {
            data[key] = String(value)
        },
    }
}

test("기억한 판만 이미 봤다고 함", () => {
    assert.equal(hasSeenGame(["g1", "g2"], "g1"), true)
    assert.equal(hasSeenGame(["g1"], "g3"), false)
    assert.equal(hasSeenGame(null, "g1"), false)
})

test("같은 판은 한 번만 남고 맨 뒤로, 최근 max개만", () => {
    assert.deepEqual(rememberGame(["a", "b"], "a"), ["b", "a"])
    assert.deepEqual(rememberGame(["a", "b", "c"], "d", 3), ["b", "c", "d"])
    assert.deepEqual(rememberGame(undefined, "x"), ["x"])
})

test("저장소에 쓰고 다시 읽으면 같은 목록", () => {
    const storage = fakeStorage()
    saveSeenGames(storage, ["g1", "g2"])
    assert.equal(storage.data[SEEN_GAMES_KEY], '["g1","g2"]')
    assert.deepEqual(loadSeenGames(storage), ["g1", "g2"])
})

test("깨진 값·문자열 아닌 값·막힌 저장소는 빈 목록으로 버팀", () => {
    assert.deepEqual(loadSeenGames(fakeStorage({ [SEEN_GAMES_KEY]: "{깨짐" })), [])
    assert.deepEqual(loadSeenGames(fakeStorage({ [SEEN_GAMES_KEY]: '["a",3,null]' })), ["a"])
    assert.deepEqual(loadSeenGames(null), [])
    const blocked = { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } }
    assert.deepEqual(loadSeenGames(blocked), [])
    assert.doesNotThrow(() => saveSeenGames(blocked, ["a"]))
})
