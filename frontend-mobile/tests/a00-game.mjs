// M-1 모바일 인게임 시험 몫 도우미: 가짜 소켓·판 차리기(스토어에 서버 값)·모바일 판 화면 그리기·알림 넣기
// frontend-mobile/tests/a03~a09 인게임 시험(M-1 몫)이 mobileLoader·dom 다음에 부름, 공용 아님
// 판 값 모양은 PC 시험 도우미(frontend/tests/a03-day-vote/dayVoteHarness.mjs)와 같게 (서버가 보내는 모양)
import { mock } from "node:test"
import { React, render, act } from "./helpers/dom.mjs"
import { flush } from "./a00-kit.mjs"

// 창의 시간 함수도 node 시계를 따르게 (가짜 시계를 켜면 같이 넘어감)
window.setTimeout = (...args) => globalThis.setTimeout(...args)
window.clearTimeout = (id) => globalThis.clearTimeout(id)
window.setInterval = (...args) => globalThis.setInterval(...args)
window.clearInterval = (id) => globalThis.clearInterval(id)
// 영상은 jsdom에 없음 → 재생·멈춤은 아무것도 안 함
window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve() }
window.HTMLMediaElement.prototype.pause = function pause() {}
window.HTMLMediaElement.prototype.load = function load() {}
// 그림판(canvas)은 jsdom에 없음 → 그리기 함수는 아무것도 안 함
window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return new Proxy({}, { get: (_, key) => (key === "canvas" ? this : () => ({ data: new Uint8ClampedArray(4) })) })
}
// 판에서 빠질 때 브라우저 알림 → 글만 모음
export const alerts = []
const captureAlert = (msg) => { alerts.push(String(msg)) }
window.alert = captureAlert
// 브라우저에선 globalThis가 곧 window → alert() 맨 이름 부름도 window.alert로 가게 (양피지 안내 창이 window.alert를 바꿈)
globalThis.alert = (msg) => window.alert(msg)
// 브라우저 확인 창(나가기 확인 등) → 글만 모으고 "취소"로 답함 (confirmAnswer로 바꿈)
export const confirms = []
let confirmAnswer = false
export function answerConfirm(value) { confirmAnswer = value }
window.confirm = (msg) => { confirms.push(String(msg)); return confirmAnswer }
globalThis.confirm = (msg) => window.confirm(msg)
// 진짜 요청이 안 나가게 막음 (이모티콘 목록 등) → 빈 답
// 가짜 서버: 길마다 정한 답만 돌려줌 (진짜 요청은 안 나감), 정한 답이 없으면 빈 성공 답
// 예: serve({ "POST /auth/signup/email-code": { status: 200, body: { ok: true } } }), 답이 NETWORK면 끊김
export const NETWORK = Symbol("network")
export const requests = []
let routes = {}
let matchers = []
export function serve(table) { routes = { ...routes, ...table } }
// 길 모양(정규식)으로 답 정하기, 나중에 정한 것이 먼저 걸림 — 예: serveMatch("GET", //wallet$/, { status: 500, body: {} })
export function serveMatch(method, pattern, answer) { matchers.unshift({ method, pattern, answer }) }
export function sentHttp(method, path) { return requests.filter((r) => r.method === method && r.path === path) }
globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input?.url ?? input), "http://localhost")
    const method = (init.method || "GET").toUpperCase()
    let body
    try { body = init.body ? JSON.parse(init.body) : undefined } catch { body = init.body }
    const req = { method, path: url.pathname, query: url.searchParams, body }
    requests.push(req)
    const matched = matchers.find((m) => m.method === method && m.pattern.test(url.pathname))
    let answer = matched ? matched.answer : routes[`${method} ${url.pathname}`]
    if (typeof answer === "function") answer = answer(req, sentHttp(method, url.pathname).length)
    answer = await answer
    if (answer === NETWORK) throw new TypeError("Failed to fetch")
    if (answer && Object.hasOwn(answer, "offline")) throw new TypeError(answer.offline)
    if (answer === undefined) answer = { status: 200, body: { ok: true, success: true, data: [] } }
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200, headers: { "content-type": "application/json" } })
}
window.fetch = globalThis.fetch

const h = React.createElement
const { createMemoryRouter, RouterProvider } = await import("react-router-dom")
export const { useInGameStore } = await import("@/domains/game/ingame/store/ingameStore.js")
export const { useAuthStore } = await import("@/domains/auth/store/auth.store.js")
const { setSocket } = await import("@/shared/socket/socketClient.js")
const { markRoleRevealSeen } = await import("@/domains/game/ingame/utils/ingameSessionMemory.js")
const { useGameSessionSocketEvents } = await import("@/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { default: InGamePage } = await import("@m/domains/game/ingame/pages/InGamePage.jsx")
const { useTalkHistoryStore } = await import("@m/domains/game/ingame/hooks/talk/talkHistory.store.js")
const { ShellBottomSlotContext } = await import("@m/shared/layouts/mobileShellSlots.js")
const parchment = await import("@m/shared/ui/modal/parchment/parchmentAlert.js")
const { default: ParchmentAlertHost } = await import("@m/shared/ui/modal/parchment/ParchmentAlertHost.jsx")

export const GAME = "g-m1"
// 판 사람 이름 (10명까지)
export const NAMES = ["가람", "나래", "다솜", "라온", "마루", "바다", "사랑", "아라", "자람", "차미"]
export const uuidOf = (i) => `p${i}`
export const ROLE_TEAM = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }

// 서버가 주는 모양의 명단 (죽음·끊김·나감은 자리 번호로)
export function roster(n, { dead = [], disconnected = [], left = [] } = {}) {
    return Array.from({ length: n }, (_, i) => ({
        uuid: uuidOf(i),
        nickname: NAMES[i],
        isAlive: !dead.includes(i) && !left.includes(i),
        isConnected: !disconnected.includes(i),
        isParticipating: !left.includes(i),
        themeIndex: i % 10,
    }))
}

// 서버 소켓 흉내: 보낸 사건을 모으고 답은 acks 표대로 (함수면 값 받아 답 만듦, "never"면 답 없음)
export function fakeSocket({ acks = {} } = {}) {
    const handlers = new Map()
    const sent = []
    const answer = (event, payload) => {
        const rule = Object.hasOwn(acks, event) ? acks[event] : (event === "get_session_snapshot" ? "never" : { ok: true })
        if (rule === "never") return new Promise(() => {})
        const value = typeof rule === "function" ? rule(payload) : rule
        return Promise.resolve(value)
    }
    const socket = {
        connected: true,
        id: "sock-m1",
        sent,
        acks,
        on(event, fn) {
            if (!handlers.has(event)) handlers.set(event, new Set())
            handlers.get(event).add(fn)
            return socket
        },
        off(event, fn) {
            handlers.get(event)?.delete(fn)
            return socket
        },
        emit(event, payload, cb) {
            sent.push({ event, payload })
            if (typeof cb === "function") answer(event, payload).then(cb)
            return socket
        },
        emitWithAck(event, payload) {
            sent.push({ event, payload })
            return answer(event, payload)
        },
        // socket.io의 timeout(ms).emitWithAck 흉내: 답 규칙이 "timeout"이면 ms 뒤 시간 초과 (가짜 시계로 경계 보기)
        timeout(ms) {
            return {
                emitWithAck(event, payload) {
                    if (acks[event] === "timeout") {
                        sent.push({ event, payload })
                        return new Promise((_, reject) => setTimeout(() => reject(new Error("operation has timed out")), ms))
                    }
                    return socket.emitWithAck(event, payload)
                },
            }
        },
        fire(event, payload) {
            for (const fn of [...(handlers.get(event) ?? [])]) fn(payload)
        },
        sentOf(event) {
            return sent.filter((entry) => entry.event === event).map((entry) => entry.payload)
        },
    }
    return socket
}

// 판 차리기: 로그인·역할 창 본 것으로·스토어에 판 값 (me = 내 자리 번호)
// 예: seat({ n: 7, role: "JOKER", allies: [3], phase: "DAY", dayPhase: "DAY_VOTE" })
export function seat({
    n = 5, me = 0, role = "CITIZEN", allies, phase = "DAY", dayIndex = 1, dayPhase = "DAY_VOTE",
    deadline = Date.now() + 60_000, dead = [], disconnected = [], left = [], self = {}, state = {},
    seenRoleReveal = true, hostUuid = uuidOf(0), gameId = GAME,
} = {}) {
    const myUuid = uuidOf(me)
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: myUuid, nickname: NAMES[me] } })
    if (seenRoleReveal) markRoleRevealSeen(gameId, myUuid)
    const players = roster(n, { dead, disconnected, left })
    const selfInfo = {
        uuid: myUuid,
        nickname: NAMES[me],
        role,
        team: ROLE_TEAM[role],
        hasActedThisPhase: false,
        ...(role === "JOKER" ? { allies: (allies ?? []).map(uuidOf) } : {}),
        ...(role !== "JOKER" && role !== "CITIZEN" && allies ? { allies: allies.map(uuidOf) } : {}),
        ...self,
    }
    const gameState = {
        id: gameId,
        phase,
        dayIndex,
        ...(phase === "DAY" ? { dayPhase, dayPhaseDeadline: deadline } : {}),
        ...(phase === "TRIBUNAL" ? { tribunalDeadline: deadline } : {}),
        ...(phase === "NIGHT" ? { nightTurnRole: null, nightTurnDeadline: null } : {}),
        players,
        self: selfInfo,
        ...state,
    }
    useInGameStore.getState().setGamePayload({ gameId, state: gameState })
    if (hostUuid) useInGameStore.setState({ hostUuid })
    return { myUuid, players }
}

// 판 진행 알림 받기 붙이기 (로그인 보호 경로가 하는 일과 같음)
function EventsRoot({ children }) {
    useGameSessionSocketEvents()
    return children
}

// 판 화면 밖으로 나가면 어느 주소인지 글로 남김
function Elsewhere() {
    return h("p", { "data-elsewhere": window.location.pathname }, "다른 화면")
}

// 화면 하나를 그 주소에 그리기 (before = 앞 기록, 뒤로 가기 시험용), 나머지 주소는 "다른 화면"
export let router = null
// parchment = 앱처럼 alert를 양피지 안내 창으로 (main.jsx installParchmentAlert + App의 ParchmentAlertHost)
export async function renderRoute(socket, element, { path, before = [], parchment: withParchment = false }) {
    setSocket(socket)
    if (withParchment) parchment.installParchmentAlert()
    // 화면 틀(MobileShell)의 바닥 자리 대신 (입력칸·바닥 단추가 여기에 그려짐)
    const bottom = document.createElement("div")
    bottom.setAttribute("data-shell-bottom", "")
    document.body.appendChild(bottom)
    router = createMemoryRouter(
        [
            { path: path.split("?")[0], element: h(EventsRoot, null, h(ShellBottomSlotContext.Provider, { value: bottom }, element)) },
            { path: "*", element: h(EventsRoot, null, h(Elsewhere)) },
        ],
        { initialEntries: [...before, path], initialIndex: before.length },
    )
    let view
    await act(async () => {
        view = render(h(React.Fragment, null, withParchment ? h(ParchmentAlertHost) : null, h(RouterProvider, { router })))
    })
    await flush()
    return view
}

// 양피지 안내 창 글 (없으면 null)
export const parchmentText = () => document.querySelector('[data-parchment-alert] [role="alertdialog"]')?.textContent.replace(/\s+/g, " ").trim() ?? null

// 모바일 인게임 화면 전체 그리기 (폰 세로 = 카톡형 배치)
export async function renderPage(socket, options = {}) {
    return renderRoute(socket, h(InGamePage), { path: "/ingame", ...options })
}

// 서버 알림 하나 넣기
export async function fire(socket, event, payload) {
    await act(async () => { socket.fire(event, payload) })
    await flush()
}

// 가짜 시계 넘기기 (mock.timers 켠 시험만), 창이 닫힌 뒤엔 더 넘기지 않음
export async function tick(ms) {
    await act(async () => { mock.timers.tick(ms) })
    await act(async () => { await Promise.resolve() })
}

// 시험마다 끝에 판·소켓·로그인·저장소 비움
export function resetGame(view) {
    restoreLocation()
    view?.unmount()
    mock.timers.reset()
    setSocket(null)
    useInGameStore.getState().clearGame()
    useAuthStore.setState({ isLoggedIn: false, user: null })
    try { window.sessionStorage.clear() } catch { /* 저장소 막힘 무시 */ }
    try { window.localStorage.clear() } catch { /* 저장소 막힘 무시 */ }
    alerts.length = 0
    requests.length = 0
    routes = {}
    matchers = []
    while (parchment.getParchmentAlertMessage() !== null) parchment.dismissParchmentAlert()
    window.alert = captureAlert
    confirms.length = 0
    confirmAnswer = false
    useTalkHistoryStore.setState({ gameId: null, notices: [], emojis: [], prevPlayers: null })
    progressSeq = 0
    document.body.innerHTML = ""
}

// 서버 알림 모양: 낮 판정 (예: dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 }))
export function dayResolved({ outcome, alive, abstain, target = null, dayIndex = 1, phase, ...rest }) {
    return {
        gameId: GAME,
        dayIndex,
        phase: phase ?? (outcome === "TRIBUNAL" ? "TRIBUNAL" : "NIGHT"),
        round: 1,
        outcome,
        tribunalTargetUuid: target,
        publicVoteCount: alive,
        publicAbstainCount: abstain,
        revoteExcludedUuids: [],
        ...rest,
    }
}
// 마감 당김(5초) 알림
export const settle = ({ deadline, dayIndex = 1, phase = "DAY", role = null } = {}) =>
    ({ gameId: GAME, phase, dayIndex, role, deadline })
// 밤 결과 → 다음 낮 (아무도 안 죽음, 죽은 자리는 dead)
export const nextDay = ({ n, dayIndex = 2, dead = [], deadline, victim = null, doctorSaved = false } = {}) => ({
    gameId: GAME,
    phase: "DAY",
    dayIndex,
    players: Array.from({ length: n }, (_, i) => ({ uuid: uuidOf(i), alive: !dead.includes(i) })),
    victimUuid: victim === null ? null : uuidOf(victim),
    deathReveals: victim === null ? [] : [{ victimUuid: uuidOf(victim), source: "JOKER" }],
    doctorSaved,
    ...(deadline !== undefined ? { dayPhaseDeadline: deadline } : {}),
})
// 낮 토론 → 투표로
export const dayPhaseChanged = ({ deadline, dayIndex = 1 } = {}) =>
    ({ gameId: GAME, dayIndex, dayPhase: "DAY_VOTE", round: 1, ...(deadline !== undefined ? { dayPhaseDeadline: deadline } : {}) })

// 행동 줄 단추들 → [{ name, enabled }]
export function rowButtons() {
    return [...document.querySelectorAll("[data-ingame-action-row] button")]
        .map((b) => ({ name: (b.getAttribute("aria-label") ?? b.textContent).trim(), enabled: !b.disabled }))
}

// 칸이나 그 위 칸에 숨김(hidden 클래스·inert 아님) 표시가 있는지 → 폰 화면에 안 보임
export function isHiddenByLayout(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (node.classList?.contains("hidden") || node.classList?.contains("invisible")) return true
        if (node.hidden) return true
    }
    return false
}

// 초상 띠 칸 (자리 번호로)
export const stripSlot = (i) => document.querySelector(`[data-strip-slot="${uuidOf(i)}"]`)
// 열린 카드 시트의 항목 → [{ name, enabled, kind }] (안 열렸으면 [])
export function sheetItems() {
    const menu = document.querySelector('[data-ingame-player-card-menu] [role="menu"]')
    if (!menu) return []
    return [...menu.querySelectorAll('[role="menuitem"]')]
        .map((b) => ({ name: b.getAttribute("aria-label"), enabled: !b.disabled, kind: b.getAttribute("data-card-menu-kind") }))
}

// 낮 판정 → 재판 (서버 day_vote_resolved 모양, 피고 = 자리 번호 또는 uuid)
export function tribunalEntry({ n, defendant, dayIndex = 1, seconds = 60 }) {
    return {
        gameId: GAME,
        dayIndex,
        phase: "TRIBUNAL",
        round: 1,
        outcome: "TRIBUNAL",
        tribunalTargetUuid: typeof defendant === "number" ? uuidOf(defendant) : defendant,
        publicVoteCount: n,
        publicAbstainCount: 0,
        revoteExcludedUuids: [],
        tribunalDeadline: Date.now() + seconds * 1000,
    }
}

// 재판 결과 (서버 tribunal_vote_resolved 모양 — 처형된 사람 직업·표 수는 서버가 안 실음, 결정 2026-11-16 아침 1번)
// role·counts: 옛 서버처럼 그 칸이 실려 와도 화면에 안 새는지 볼 때만 넣음 (안 주면 지금 서버처럼 칸 없음)
// DEFENDANT_DIED = 재판 도중 끊긴 피고가 탈락해 죽음(이유 칸 없음)
export function tribunalResolved({ defendant, outcome, dayIndex = 1, role, counts }) {
    const executedUuid = outcome === "GUILTY" ? uuidOf(defendant) : null
    return {
        gameId: GAME,
        dayIndex,
        phase: "NIGHT",
        defendantUuid: uuidOf(defendant),
        outcome,
        executedUuid,
        ...(counts !== undefined ? { counts } : {}),
        ...(role !== undefined ? { executedRole: executedUuid ? role : null } : {}),
    }
}

// 나에게만 오는 내 진행 알림 (서버 session_self_progress 모양)
let progressSeq = 0
export function selfProgress({ phase, dayIndex = 1, self, done = 1, required = 5, kind }) {
    progressSeq += 1
    return {
        gameId: GAME,
        phase,
        dayIndex,
        participationRevision: 0,
        selfProgressSeq: progressSeq,
        progress: { kind: kind ?? phase, doneCount: done, requiredCount: required },
        self,
    }
}

// 재판 창(연출) 안
export const tribunalBox = () => document.querySelector("[data-ingame-tribunal-presentation]")

// 화면 틀 바닥 자리 (입력칸 등)
export const shellBottom = () => document.querySelector("[data-shell-bottom]")

// 밤 차례 시작·끝 (서버 night_turn_started·night_turn_ended 모양)
export const turnStarted = ({ role, dayIndex = 1, seconds = 60 }) => ({ gameId: GAME, dayIndex, role, deadline: Date.now() + seconds * 1000 })
export const turnEnded = ({ role, dayIndex = 1 }) => ({ gameId: GAME, dayIndex, role })
// 낮을 모두 기권으로 넘겨 밤으로 (투표 시작 → 판정)
export async function dayToNight(socket, { n, dayIndex }) {
    await fire(socket, "day_phase_changed", dayPhaseChanged({ dayIndex, deadline: Date.now() + 60_000 }))
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: n, abstain: n, dayIndex }))
}
// 카드 띠의 칸을 눌러 시트 항목 읽고 닫음 → [{ name, enabled, kind }]
export async function readSheet(i) {
    const slot = stripSlot(i)
    if (!slot) throw new Error(`띠 칸 없음: ${i}`)
    act(() => { slot.click() })
    await flush()
    const items = sheetItems()
    if (items.length > 0) {
        act(() => { document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })) })
        await flush()
    }
    return items
}
// 단계 전환 안내 창("낮이 되었습니다"·"밤이 되었습니다" 등)이 떠 있으면 사람처럼 "확인"으로 닫음
export async function confirmEntrances(max = 3) {
    for (let i = 0; i < max; i += 1) {
        const box = document.querySelector('[role="dialog"][aria-label="단계 전환 안내"]')
        if (!box) return
        const ok = [...box.querySelectorAll("button")].find((b) => b.textContent.trim() === "확인")
        if (!ok) return
        act(() => { ok.click() })
        await flush()
    }
}

// 판이 끝난 상태로 (결과 화면용): 지금 판 값에 winResult·닫힘 시각을 붙임, roles = 자리별 직업
export function endGame({ roles, winner = "CITIZEN", gold = [], closesAt = Date.now() + 180_000 }) {
    const state = useInGameStore.getState().state
    const winResult = {
        winner,
        reveals: roles.map((role, i) => ({
            uuid: uuidOf(i), nickname: NAMES[i], role, team: ROLE_TEAM[role], alive: true, deathReason: null, goldReward: gold[i] ?? 0,
        })),
    }
    act(() => {
        useInGameStore.setState({ state: { ...state, phase: "ENDED", winResult, resultClosesAt: closesAt } })
    })
}
// 결과 화면 들어갈 때 연출 영상 끝내기 (영상 끝 사건)
export async function skipIntro() {
    const video = document.querySelector("video")
    if (!video) return
    act(() => { video.dispatchEvent(new window.Event("ended")) })
    await flush()
}

// 페이지째 이동 받아 두기: jsdom은 다른 주소로 못 가서 window.location을 가짜로 바꿔 끼움 (끝나면 resetGame이 되돌림)
// 돌려줌: { assigned: [바꾼 주소들], replaced: [...] }
let realWindow = null
export function fakeLocation(path = "/") {
    if (!realWindow) realWindow = globalThis.window
    const url = new URL(path, "http://localhost")
    const location = {
        pathname: url.pathname, search: url.search, origin: url.origin, hash: "",
        assigned: [], replaced: [],
        assign(next) { location.assigned.push(String(next)) },
        replace(next) { location.replaced.push(String(next)) },
    }
    Object.defineProperty(location, "href", { get: () => url.href, set: (next) => { location.assigned.push(String(next)) } })
    const target = realWindow
    globalThis.window = new Proxy(target, {
        get(t, prop) {
            if (prop === "location") return location
            const value = Reflect.get(t, prop, t)
            return typeof value === "function" && !/^[A-Z]/.test(String(prop)) ? value.bind(t) : value
        },
        set(t, prop, value) { return Reflect.set(t, prop, value, t) },
    })
    return location
}
export function restoreLocation() {
    if (realWindow) globalThis.window = realWindow
    realWindow = null
}

// 지갑·가진 것 요약 답 (서버 /economy/accounts/:uuid/wallet·entitlements 모양, PC 시험 a11Kit와 같음)
export function economyRoutes(uuid, { gold = 0, diamond = 0, entitlements = [] } = {}) {
    return {
        [`GET /economy/accounts/${uuid}/wallet`]: { status: 200, body: { success: true, data: { balanceGold: gold, balanceDiamond: diamond } } },
        [`GET /economy/accounts/${uuid}/entitlements`]: {
            status: 200,
            body: {
                success: true,
                data: {
                    entitlements,
                    loadout: { selectedProfilePhotoId: null, selectedProfileBorderId: null, selectedCardFrameId: null, selectedSkinsByJob: {}, revision: "r1" },
                },
            },
        },
    }
}
