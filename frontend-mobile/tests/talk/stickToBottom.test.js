// 채팅방 맨 아래 붙기 판단(새 줄 따라 내림·위로 올려 읽는 중이면 새 메시지 단추) 시험
import "../helpers/mobileLoader.mjs"
import { renderHook, act } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

const { useStickToBottom } = await import("@m/domains/game/ingame/hooks/talk/useStickToBottom.js")

// 높이 1000, 보이는 칸 300인 채팅 칸 (jsdom은 높이를 안 재서 직접 줌)
function makeScroller() {
    const el = document.createElement("div")
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => el._height ?? 1000 })
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 300 })
    el.scrollTop = 0
    return el
}

const line = (id) => ({ id })

function setup(lines) {
    const el = makeScroller()
    const ref = { current: el }
    const hook = renderHook((p) => useStickToBottom(ref, p), lines)
    return { el, ...hook }
}

function scrollTo(el, top) {
    el.scrollTop = top
    act(() => el.dispatchEvent(new window.Event("scroll")))
}

test("처음 줄이 있으면 맨 아래로 내림", () => {
    const { el, result } = setup([line(1)])
    assert.equal(el.scrollTop, 1000)
    assert.equal(result.current.unseen, false)
})

test("맨 아래 보던 중 새 줄 오면 따라 내림·단추 없음", () => {
    const { el, result, rerender } = setup([line(1)])
    el._height = 1200
    rerender([line(1), line(2)])
    assert.equal(el.scrollTop, 1200)
    assert.equal(result.current.unseen, false)
})

test("위로 올려 읽는 중 새 줄 오면 그대로 두고 unseen 참", () => {
    const { el, result, rerender } = setup([line(1)])
    scrollTo(el, 100)
    rerender([line(1), line(2)])
    assert.equal(el.scrollTop, 100)
    assert.equal(result.current.unseen, true)
})

test("맨 아래 48px 안이면 맨 아래로 봄, 49px면 아님", () => {
    const near = setup([line(1)])
    scrollTo(near.el, 1000 - 300 - 48)
    near.rerender([line(1), line(2)])
    assert.equal(near.result.current.unseen, false)
    const far = setup([line(1)])
    scrollTo(far.el, 1000 - 300 - 49)
    far.rerender([line(1), line(2)])
    assert.equal(far.result.current.unseen, true)
})

test("같은 줄 수·같은 마지막 줄이면 새 배열이어도 새 줄로 안 봄", () => {
    const { el, result, rerender } = setup([line(1)])
    scrollTo(el, 0)
    rerender([line(1)])
    assert.equal(result.current.unseen, false)
})

test("새 메시지 단추(scrollToBottom) 누르면 내리고 unseen 풀림", () => {
    const { el, result, rerender } = setup([line(1)])
    scrollTo(el, 0)
    rerender([line(1), line(2)])
    act(() => result.current.scrollToBottom())
    assert.equal(el.scrollTop, 1000)
    assert.equal(result.current.unseen, false)
})

test("직접 맨 아래까지 내리면 unseen 풀리고 다음 새 줄은 따라감", () => {
    const { el, result, rerender } = setup([line(1)])
    scrollTo(el, 0)
    rerender([line(1), line(2)])
    scrollTo(el, 700)
    assert.equal(result.current.unseen, false)
    el._height = 1500
    rerender([line(1), line(2), line(3)])
    assert.equal(el.scrollTop, 1500)
})

test("줄이 없으면 아무것도 안 함", () => {
    const { el, result } = setup([])
    assert.equal(el.scrollTop, 0)
    assert.equal(result.current.unseen, false)
})
