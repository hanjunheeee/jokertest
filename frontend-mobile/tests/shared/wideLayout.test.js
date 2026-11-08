// 폰 가로·태블릿 판정(useWideChat·useTwoColumn) 시험: matchMedia 흉내로 화면 돌리기
import "../helpers/mobileLoader.mjs"
import { renderHook, act } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

// 화면 크기 흉내: 너비·높이·방향으로 미디어 조건 계산, 바뀌면 change 알림
const screen = { width: 390, height: 844, listeners: new Set() }
function evaluate(query) {
    const landscape = screen.width > screen.height
    return query.split(",").some((part) =>
        [...part.matchAll(/\(([^)]+)\)/g)].every(([, cond]) => {
            const [key, raw] = cond.split(":").map((s) => s.trim())
            if (key === "orientation") return raw === "landscape" ? landscape : !landscape
            const px = raw.endsWith("rem") ? parseFloat(raw) * 16 : parseFloat(raw)
            if (key === "min-width") return screen.width >= px
            if (key === "max-height") return screen.height <= px
            return false
        }),
    )
}
window.matchMedia = (query) => ({
    get matches() { return evaluate(query) },
    addEventListener: (_, fn) => screen.listeners.add(fn),
    removeEventListener: (_, fn) => screen.listeners.delete(fn),
})
function resize(width, height) {
    screen.width = width
    screen.height = height
    act(() => screen.listeners.forEach((fn) => fn()))
}

const { useWideChat } = await import("@m/domains/game/ingame/hooks/chat/useWideChat.js")
const { useTwoColumn } = await import("@m/domains/library/hooks/useTwoColumn.js")

for (const [name, useHook] of [["채팅 넓은 배치", useWideChat], ["서고 두 쪽", useTwoColumn]]) {
    test(`${name}: 폰 세로(390x844)는 좁음`, () => {
        resize(390, 844)
        const hook = renderHook(() => useHook())
        assert.equal(hook.result.current, false)
        hook.unmount()
    })

    test(`${name}: 폰 가로(844x390)는 넓음, 다시 세우면 좁음`, () => {
        resize(390, 844)
        const hook = renderHook(() => useHook())
        resize(844, 390)
        assert.equal(hook.result.current, true)
        resize(390, 844)
        assert.equal(hook.result.current, false)
        hook.unmount()
    })

    test(`${name}: 작은 폰 가로(540x360)는 너비 560 안 돼서 좁음`, () => {
        resize(540, 360)
        const hook = renderHook(() => useHook())
        assert.equal(hook.result.current, false)
        hook.unmount()
    })

    test(`${name}: 태블릿 세로(768x1024)는 넓음`, () => {
        resize(768, 1024)
        const hook = renderHook(() => useHook())
        assert.equal(hook.result.current, true)
        hook.unmount()
    })

    test(`${name}: 화면 빠지면 알림 구독 풀림`, () => {
        resize(390, 844)
        const before = screen.listeners.size
        const hook = renderHook(() => useHook())
        assert.equal(screen.listeners.size, before + 1)
        hook.unmount()
        assert.equal(screen.listeners.size, before)
    })
}
