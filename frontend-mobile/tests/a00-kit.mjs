// M-1 모바일 시험 몫 도우미: 화면 글 읽기·단추 찾기·누르기·글 넣기·기다리기
// frontend-mobile/tests/aNN-*.test.js(M-1 몫)가 helpers/dom.mjs 다음, a00-game보다 먼저 부름 (환경값을 src보다 먼저 정함), 공용 아님
import { act } from "./helpers/dom.mjs"

// 빌드 환경값 흉내: 서버 주소를 시험용 가짜 주소로 (없으면 요청 주소가 "/undefined/..."가 됨), 진짜 요청은 가짜 fetch가 막음
// src 모듈보다 먼저 정해야 해서 이 파일 맨 위에서 (a00-game보다 먼저 import)
globalThis.__TEST_IMPORT_META_ENV ??= { DEV: false, PROD: true, MODE: "test", BASE_URL: "/", VITE_API_BASE_URL: "http://api.test" }

// jsdom(가짜 브라우저)에 없는 것 흉내: 스크롤 옮기기·크기 보기·화면 크기 묻기
window.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {}
window.HTMLElement.prototype.scrollTo ??= function scrollTo() {}
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
window.ResizeObserver ??= globalThis.ResizeObserver
globalThis.MutationObserver ??= window.MutationObserver
// 창 움직임을 바로 끝냄 (닫힌 창이 움직임 동안 남거나 메모리가 불어나는 것 막기)
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true
window.matchMedia ??= (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })

// 칸 안 글을 한 줄로 → "광대 진영 승리 패배"
export function textOf(el) {
    return (el?.textContent ?? "").replace(/\s+/g, " ").trim()
}

// 화면 전체 글 (body 밖으로 띄운 시트까지)
export function pageText() {
    return textOf(document.body)
}

// 단추 이름: 읽기 이름이 있으면 그것, 없으면 보이는 글
export function nameOf(el) {
    return (el.getAttribute("aria-label") ?? textOf(el)).trim()
}

// 이름이 꼭 맞는 단추 전부 (root 기본 body)
export function buttonsNamed(name, root = document.body) {
    return [...root.querySelectorAll("button")].filter((b) => nameOf(b) === name)
}

// 이름이 꼭 맞는 단추 하나 (없으면 null)
export function buttonNamed(name, root = document.body) {
    return buttonsNamed(name, root)[0] ?? null
}

// 모든 단추 이름 → ["일반", "회의&투표", …] (실패 글에 같이 보이려고)
export function buttonNames(root = document.body) {
    return [...root.querySelectorAll("button")].map(nameOf)
}

// 누르기 (리액트가 바뀐 화면을 다 그린 뒤 돌아옴)
export function click(el) {
    act(() => {
        el.click()
    })
}

// 입력칸에 글 넣기 (리액트가 듣는 input 사건까지)
export function typeInto(input, value) {
    const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set
    act(() => {
        setter.call(input, value)
        input.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
}

// 약속(Promise) 답·0ms 예약이 풀리게 한 번 쉼 (진짜 시계에서만)
export async function flush(times = 3) {
    for (let i = 0; i < times; i += 1) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }
}

// 조건이 맞을 때까지 잠깐씩 기다림 (RTL waitFor 대신, 진짜 시계에서만)
export async function waitUntil(check, { tries = 40, label = "조건" } = {}) {
    for (let i = 0; i < tries; i += 1) {
        if (check()) return
        await flush(1)
    }
    throw new Error(`${label}이(가) 끝내 안 맞음`)
}

// 키 누름 사건 (Esc 등)
export function pressKey(key, target = document) {
    act(() => {
        target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }))
    })
}

// 가짜 시계(setTimeout을 가짜로 바꾼 시험)에서 약속만 풀리게 쉼 (setImmediate는 가짜 시계에 안 걸림)
export async function flushNow(times = 5) {
    for (let i = 0; i < times; i += 1) {
        await act(async () => {
            await new Promise((resolve) => globalThis.setImmediate(resolve))
        })
    }
}
