// 방 목록 쪽 넘기기·방 고르기·입장 버튼 시험 (useRoomListPaging)
import "../helpers/mobileLoader.mjs"
import { renderHook, act } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

const { useRoomListPaging, PAGE_SIZE } = await import("@m/domains/game/mode/hooks/useRoomListPaging.js")

// 방 n개 (번호 1부터, 기다리는 공개 방)
function makeRooms(count, extra = {}) {
    return Array.from({ length: count }, (_, i) => ({ id: `방${i + 1}`, status: "waiting", current: 1, max: 8, accessType: "public", ...extra }))
}

function setup(props) {
    const calls = { enter: [], code: [] }
    const base = { isJoining: false, onEnterRoom: (id) => calls.enter.push(id), onJoinByCode: (id) => calls.code.push(id) }
    const hook = renderHook((p) => useRoomListPaging({ ...base, ...p }), props)
    return { ...hook, calls, base }
}

test("한 쪽 방 수는 12개", () => {
    assert.equal(PAGE_SIZE, 12)
})

test("방이 없으면 쪽 수 1·빈 쪽·입장 꺼짐", () => {
    const { result } = setup({ rooms: [] })
    assert.equal(result.current.pageCount, 1)
    assert.equal(result.current.currentPage, 0)
    assert.deepEqual(result.current.pageRooms, [])
    assert.equal(result.current.enterDisabled, true)
    assert.equal(result.current.enterLabel, "입장하기")
})

test("방 25개면 3쪽, 첫 쪽은 1~12번", () => {
    const { result } = setup({ rooms: makeRooms(25) })
    assert.equal(result.current.pageCount, 3)
    assert.deepEqual(result.current.pageRooms.map((r) => r.id), makeRooms(12).map((r) => r.id))
})

test("방 12개면 딱 1쪽", () => {
    const { result } = setup({ rooms: makeRooms(12) })
    assert.equal(result.current.pageCount, 1)
})

test("다음 쪽으로 넘기고 마지막 쪽에서 더 안 넘어감", () => {
    const { result } = setup({ rooms: makeRooms(25) })
    act(() => result.current.goNext())
    assert.equal(result.current.currentPage, 1)
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    assert.equal(result.current.currentPage, 2)
    assert.deepEqual(result.current.pageRooms.map((r) => r.id), ["방25"])
})

test("첫 쪽에서 앞 쪽 누르면 그대로 0쪽", () => {
    const { result } = setup({ rooms: makeRooms(25) })
    act(() => result.current.goPrev())
    assert.equal(result.current.currentPage, 0)
})

test("쪽 넘기면 고른 방 풀림", () => {
    const { result } = setup({ rooms: makeRooms(25) })
    act(() => result.current.selectRoom("방3"))
    assert.equal(result.current.selectedRoomId, "방3")
    act(() => result.current.goNext())
    assert.equal(result.current.selectedRoomId, null)
})

test("같은 방 다시 누르면 고름 풀림, 다른 방은 바꿔 고름", () => {
    const { result } = setup({ rooms: makeRooms(5) })
    act(() => result.current.selectRoom("방1"))
    act(() => result.current.selectRoom("방2"))
    assert.equal(result.current.selectedRoomId, "방2")
    act(() => result.current.selectRoom("방2"))
    assert.equal(result.current.selectedRoomId, null)
})

test("방이 줄어 쪽 수가 줄면 마지막 쪽으로 당김", () => {
    const { result, rerender } = setup({ rooms: makeRooms(25) })
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    rerender({ rooms: makeRooms(13) })
    assert.equal(result.current.pageCount, 2)
    assert.equal(result.current.currentPage, 1)
    assert.deepEqual(result.current.pageRooms.map((r) => r.id), ["방13"])
})

test("쪽 당긴 뒤 방이 다시 늘어도 옛 쪽으로 안 튐", () => {
    const { result, rerender } = setup({ rooms: makeRooms(25) })
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    rerender({ rooms: makeRooms(5) })
    rerender({ rooms: makeRooms(25) })
    assert.equal(result.current.currentPage, 0)
})

test("고른 방이 목록에서 사라지면 고른 값 지움, 다시 생겨도 안 되살아남", () => {
    const { result, rerender } = setup({ rooms: makeRooms(3) })
    act(() => result.current.selectRoom("방3"))
    rerender({ rooms: makeRooms(2) })
    assert.equal(result.current.selectedRoomId, null)
    rerender({ rooms: makeRooms(3) })
    assert.equal(result.current.selectedRoomId, null)
})

test("표시 상태: 진행 중·꽉 참·기다림", () => {
    const rooms = [
        { id: "가", status: "in_progress", current: 3, max: 8 },
        { id: "나", status: "waiting", current: 8, max: 8 },
        { id: "다", status: "waiting", current: 2, max: 8 },
    ]
    const { result } = setup({ rooms })
    assert.deepEqual(result.current.pageRooms.map((r) => r.displayStatus), ["in_progress", "full", "waiting"])
})

test("공개 방 고르면 입장하기 → 누르면 onEnterRoom(방 번호)", () => {
    const { result, calls } = setup({ rooms: makeRooms(2) })
    act(() => result.current.selectRoom("방2"))
    assert.equal(result.current.enterLabel, "입장하기")
    assert.equal(result.current.enterDisabled, false)
    act(() => result.current.enterRoom())
    assert.deepEqual(calls.enter, ["방2"])
    assert.deepEqual(calls.code, [])
})

test("코드 방 고르면 코드 입력 → 누르면 onJoinByCode", () => {
    const { result, calls } = setup({ rooms: makeRooms(2, { accessType: "code" }) })
    act(() => result.current.selectRoom("방1"))
    assert.equal(result.current.enterLabel, "코드 입력")
    act(() => result.current.enterRoom())
    assert.deepEqual(calls.code, ["방1"])
    assert.deepEqual(calls.enter, [])
})

test("정원 찬 방(status full)은 마감·입장 꺼짐·눌러도 안 부름", () => {
    const { result, calls } = setup({ rooms: makeRooms(1, { status: "full", accessType: "code" }) })
    act(() => result.current.selectRoom("방1"))
    assert.equal(result.current.enterLabel, "마감")
    assert.equal(result.current.enterDisabled, true)
    act(() => result.current.enterRoom())
    assert.deepEqual(calls, { enter: [], code: [] })
})

test("들어가는 중이면 입장 중·입장 꺼짐", () => {
    const { result, calls } = setup({ rooms: makeRooms(1), isJoining: true })
    act(() => result.current.selectRoom("방1"))
    assert.equal(result.current.enterLabel, "입장 중")
    assert.equal(result.current.enterDisabled, true)
    act(() => result.current.enterRoom())
    assert.deepEqual(calls.enter, [])
})

test("방 안 고르고 입장 누르면 아무것도 안 부름", () => {
    const { result, calls } = setup({ rooms: makeRooms(3) })
    act(() => result.current.enterRoom())
    assert.deepEqual(calls, { enter: [], code: [] })
})
