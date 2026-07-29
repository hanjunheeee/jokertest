import assert from "node:assert/strict"
import test from "node:test"
import { useMatchingStore } from "../matchingStore.js"

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
