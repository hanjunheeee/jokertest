// 시험용 브라우저 흉내(jsdom) + 훅·화면 그리기 도우미
// 훅·화면 시험이 mobileLoader 다음에 불러 씀, jsdom은 데스크톱 node_modules 것을 빌림 (설치 안 함)
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const MOBILE_ROOT = fileURLToPath(new URL("../../", import.meta.url))
const desktopRequire = createRequire(path.join(MOBILE_ROOT, "..", "frontend", "package.json"))
const { JSDOM } = desktopRequire("jsdom")

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true })
const win = dom.window
for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
    if (key === "navigator") Object.defineProperty(globalThis, key, { value: win.navigator, configurable: true })
    else globalThis[key] = key === "window" ? win : win[key]
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import("react")
const { createRoot } = await import("react-dom/client")
export { React }
export const act = React.act

// 훅 하나 그려 보기: result.current에 마지막 값, rerender(props)로 다시 그림
export function renderHook(useHook, initialProps) {
    const result = { current: undefined, renders: 0 }
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    function Probe({ hookProps }) {
        result.current = useHook(hookProps)
        result.renders += 1
        return null
    }
    act(() => root.render(React.createElement(Probe, { hookProps: initialProps })))
    return {
        result,
        rerender(nextProps) {
            act(() => root.render(React.createElement(Probe, { hookProps: nextProps })))
        },
        unmount() {
            act(() => root.unmount())
            container.remove()
        },
    }
}

// 화면 하나 그려 보기
export function render(element) {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(element))
    return {
        container,
        rerender(next) {
            act(() => root.render(next))
        },
        unmount() {
            act(() => root.unmount())
            container.remove()
        },
    }
}
