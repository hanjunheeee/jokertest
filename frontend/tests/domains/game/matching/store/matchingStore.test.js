import assert from "node:assert/strict"
import test from "node:test"
import { useMatchingStore } from "../../../../../src/domains/game/matching/store/matchingStore.js"

test("clearRoom은 방과 매칭 검색 상태를 함께 초기화한다", () => {
    const initialState = useMatchingStore.getState()

    try {
        useMatchingStore.setState({
            isSearching: true,
            isInRoom: true,
            roomId: "room-1",
            roomCode: "ABCD",
            players: [{ uuid: "player-1" }],
            hostUuid: "player-1",
            canStart: true,
        })

        useMatchingStore.getState().clearRoom()

        const state = useMatchingStore.getState()

        assert.equal(state.isSearching, false)
        assert.equal(state.isInRoom, false)
        assert.equal(state.roomId, null)
        assert.equal(state.roomCode, null)
        assert.deepEqual(state.players, [])
        assert.equal(state.hostUuid, null)
        assert.equal(state.canStart, false)
    } finally {
        useMatchingStore.setState(initialState, true)
    }
})

test("known 3장: 같은 사람 입장 방송이 두 번 와도 자리는 하나 (새 값으로 바뀜)", () => {
    useMatchingStore.setState({ players: [{ uuid: "p1", isReady: false }] })
    useMatchingStore.getState().addPlayer({ uuid: "p1", isReady: true })
    useMatchingStore.getState().addPlayer({ uuid: "p2", isReady: false })
    assert.deepEqual(useMatchingStore.getState().players, [
        { uuid: "p1", isReady: true },
        { uuid: "p2", isReady: false },
    ])
    useMatchingStore.getState().clearRoom()
})
