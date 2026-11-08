// 방 코드 입력칸 하나짜리 동작(붙여넣기 정리·대문자·6자리·Enter·자동 초점) 시험 (가짜 시계)
import "../helpers/mobileLoader.mjs"
import { renderHook, act } from "../helpers/dom.mjs"
import { test, mock } from "node:test"
import assert from "node:assert/strict"

const { useCodeField } = await import("@m/domains/game/mode/hooks/useCodeField.js")

function setup(extra = {}) {
    const values = []
    const submits = []
    const hook = renderHook(() => useCodeField({ onChange: (v) => values.push(v), onSubmit: () => submits.push(1), ...extra }))
    return { ...hook, values, submits }
}

const change = (hook, value) => act(() => hook.result.current.handleChange({ target: { value } }))

test("붙여넣은 글에서 빈칸·기호·한글 지우고 대문자 6자리", () => {
    const hook = setup()
    change(hook, " ab-c 12d9xyz")
    change(hook, "방코드: q1w2e3")
    change(hook, "a1")
    assert.deepEqual(hook.values, ["ABC12D", "Q1W2E3", "A1"])
})

test("기호만 있거나 빈 글이면 빈 문자열", () => {
    const hook = setup()
    change(hook, "!!!")
    change(hook, "")
    assert.deepEqual(hook.values, ["", ""])
})

test("Enter면 기본 동작 막고 onSubmit, 다른 키는 그냥 둠", () => {
    const hook = setup()
    let prevented = 0
    act(() => hook.result.current.handleKeyDown({ key: "Enter", preventDefault: () => { prevented += 1 } }))
    act(() => hook.result.current.handleKeyDown({ key: "a", preventDefault: () => { prevented += 1 } }))
    assert.equal(hook.submits.length, 1)
    assert.equal(prevented, 1)
})

test("onSubmit 없어도 Enter에 안 터짐", () => {
    const hook = renderHook(() => useCodeField({ onChange: () => {} }))
    act(() => hook.result.current.handleKeyDown({ key: "Enter", preventDefault() {} }))
    assert.ok(true)
})

test("초점 받으면 focused 참·커서 끝으로, 잃으면 거짓", () => {
    const hook = setup()
    const ranges = []
    act(() => hook.result.current.handleFocus({ target: { value: "ABC", setSelectionRange: (a, b) => ranges.push([a, b]) } }))
    assert.equal(hook.result.current.focused, true)
    assert.deepEqual(ranges, [[3, 3]])
    act(() => hook.result.current.handleBlur())
    assert.equal(hook.result.current.focused, false)
})

test("자동 초점: 0.28초 뒤 입력칸 focus, 그 전엔 안 함", () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    try {
        let focusCount = 0
        const hook = renderHook(() => {
            const field = useCodeField({ onChange: () => {}, autoFocus: true })
            field.inputRef.current = { focus: () => { focusCount += 1 } }
            return field
        })
        act(() => mock.timers.tick(279))
        assert.equal(focusCount, 0)
        act(() => mock.timers.tick(1))
        assert.equal(focusCount, 1)
        hook.unmount()
    } finally {
        mock.timers.reset()
    }
})

test("자동 초점 꺼짐이면 초점 안 줌, 화면 빠지면 시계 풀림", () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    try {
        let focusCount = 0
        const off = renderHook(() => {
            const field = useCodeField({ onChange: () => {} })
            field.inputRef.current = { focus: () => { focusCount += 1 } }
            return field
        })
        const on = renderHook(() => {
            const field = useCodeField({ onChange: () => {}, autoFocus: true })
            field.inputRef.current = { focus: () => { focusCount += 1 } }
            return field
        })
        on.unmount()
        act(() => mock.timers.tick(1000))
        assert.equal(focusCount, 0)
        off.unmount()
    } finally {
        mock.timers.reset()
    }
})
