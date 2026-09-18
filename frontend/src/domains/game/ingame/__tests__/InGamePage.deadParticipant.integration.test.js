/**
 * F-23(AC-06): 확정 사망한 참가자의 "관전 계속하기 / 게임 나가기"를 **실제 화면 경로**로 검증한다.
 *
 * 실제로 쓰는 것: app/routes의 실제 router(→ ProtectedRoute → InGamePage), 실제 useInGameExit,
 * 실제 ingameStore/matchingStore/auth store, 실제 useGameSessionSocketEvents 수신 경로.
 * 대역으로 바꾸는 것은 **바깥 경계뿐**이다 — 소켓 전송, HTTP, 효과음, 자산 선택. 페이지나
 * 훅 자체를 성공 대역으로 바꾸지 않는다(그러면 "화면이 동작한다"가 대역의 사실이 된다).
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
// 공용 Scrollbar(useScrollbarThumb)가 요구한다 — 이 시험이 보는 것은 치수가 아니다.
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
installDomGlobal("IntersectionObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const alerts = []
const recordAlert = (message) => alerts.push(message)
installDomGlobal("alert", recordAlert)
dom.window.alert = recordAlert

// ── 나가기 확인 대화상자 ─────────────────────────────────────────────────────
//
// useInGameExit은 호출 시점에 **window.confirm**을 읽는다(bare confirm이 아니다) — jsdom의
// 기본 구현은 "not implemented"라 undefined를 돌려주고, 그러면 모든 나가기가 조용히
// 취소된다. 그래서 globalThis와 dom.window 양쪽에 같은 함수를 심는다.
let confirmAnswer = true
const confirmCalls = []
const recordConfirm = (message) => {
  confirmCalls.push(message)
  return confirmAnswer
}
installDomGlobal("confirm", recordConfirm)
dom.window.confirm = recordConfirm

// ── 나가기 ACK timeout ───────────────────────────────────────────────────────
// 실제 8초를 기다리지 않고 timeout 경로를 결정적으로 돌기 위해 window.setTimeout만 가로챈다.
// 판정 로직은 프로덕션 그대로다(시간만 시험이 흘려 준다).
const scheduledTimeouts = []
const nativeSetTimeout = dom.window.setTimeout.bind(dom.window)
const nativeClearTimeout = dom.window.clearTimeout.bind(dom.window)
installDomGlobal("__fireExitTimeouts", () => {
  const due = scheduledTimeouts.splice(0, scheduledTimeouts.length)
  for (const entry of due) if (!entry.cancelled) entry.fn()
})
dom.window.setTimeout = (fn, delay, ...rest) => {
  // 나가기 상한(8초)만 시험이 소유한다 — 애니메이션 등 짧은 지연은 실제 타이머로 둔다.
  if (delay >= 1000) {
    const entry = { fn, cancelled: false, id: Symbol("exit-timeout") }
    scheduledTimeouts.push(entry)
    return entry.id
  }
  return nativeSetTimeout(fn, delay, ...rest)
}
dom.window.clearTimeout = (id) => {
  const entry = scheduledTimeouts.find((candidate) => candidate.id === id)
  if (entry) {
    entry.cancelled = true
    return undefined
  }
  return nativeClearTimeout(id)
}

register(new URL("./testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// ── 바깥 경계 대역 ───────────────────────────────────────────────────────────
mock.module("../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `dummy-portrait-${index}` },
})
mock.module("../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `dummy-portrait-${index}`,
    pickInGamePlayerFrame: (index) => `dummy-frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc, status) => (status === "dead" ? `${frameSrc}-dead` : frameSrc),
    resolveAccountCardFrameSrc: () => null,
  },
})
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: {
    dispatchSfxEvent: () => {},
    dispatchUiSfx: () => {},
    useSfxRuntime: () => {},
  },
})
// import.meta.env는 Vite 빌드타임 치환이라 plain Node에서 해석되지 않는다 — 경계 모듈
// 하나만 갈아끼우고 나머지 라우터·페이지·가드는 전부 실제 코드로 돌린다(f18PodiumRoute와 같은 관례).
mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
mock.module("@/shared/api/client.js", {
  namedExports: {
    api: {
      get: async () => { throw new Error("network disabled in test") },
      post: async () => { throw new Error("network disabled in test") },
      put: async () => { throw new Error("network disabled in test") },
      patch: async () => { throw new Error("network disabled in test") },
      delete: async () => { throw new Error("network disabled in test") },
    },
    apiClient: async () => { throw new Error("network disabled in test") },
    refreshAccessToken: async () => { throw new Error("network disabled in test") },
  },
})

/**
 * 소켓 전송만 흉내낸다. emit 기록과 ack 응답 시점을 시험이 통제하고, 서버가 보낸 사건은
 * 실제 프런트 리스너(useGameSessionSocketEvents 등)로 그대로 흘려보낸다.
 */
function createFakeSocket(id = "sock-1") {
  const listeners = new Map()
  const emitted = []
  const pendingAcks = []
  return {
    id,
    connected: true,
    emitted,
    pendingAcks,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    emit(event, payload, ack) {
      emitted.push({ event, payload })
      if (typeof ack === "function") pendingAcks.push({ event, payload, ack })
    },
    timeout() { return this },
    emitWithAck(event, payload) {
      emitted.push({ event, payload })
      return new Promise((resolve) => { pendingAcks.push({ event, payload, ack: resolve }) })
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    countEmits(event) { return emitted.filter((e) => e.event === event).length },
    /** 이 연결에 실제로 등록된 구독 사건 이름들(소켓 소비 목록 감사용). */
    subscribedEvents() { return [...listeners.keys()] },
    /**
     * 가장 **최근에** 나간 그 이벤트의 ack를 꺼낸다.
     *
     * 뒤에서부터 찾는 것이 중요하다 — /ingame에는 재접속 동기화
     * (useInGameSessionSnapshotSync)가 마운트 시점에 이미 get_session_snapshot 하나를
     * 띄워 둔다. 앞에서부터 찾으면 시험이 방금 누른 버튼의 요청이 아니라 그 배경 요청에
     * 응답하게 되어, 실제로는 아무 답도 받지 못한 화면을 검사하게 된다.
     */
    takeAck(event) {
      for (let i = pendingAcks.length - 1; i >= 0; i -= 1) {
        if (pendingAcks[i].event === event) return pendingAcks.splice(i, 1)[0]
      }
      return null
    },
  }
}

let currentSocket = null
const socketSubscribers = new Set()
mock.module("@/shared/socket/socketClient.js", {
  namedExports: {
    getSocket: () => currentSocket,
    subscribeSocket: (cb) => { socketSubscribers.add(cb); return () => socketSubscribers.delete(cb) },
    setSocket: (next) => {
      currentSocket = next
      for (const cb of [...socketSubscribers]) cb()
    },
  },
})

const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../../../app/routes/index.jsx")
// SPLIT-1(AC-02): 라우트 선언에서 "인증 보호 구간"을 식별하려면 그 가드 컴포넌트 자체가
// 필요하다 — 문자열이 아니라 실제 element 타입으로 대조한다.
const { default: ProtectedRoute } = await import("../../../../shared/ui/ProtectedRoute.jsx")
const { useInGameStore } = await import("../store/ingameStore.js")
const { useMatchingStore } = await import("../../matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
// SPLIT-1(AC-02): 소켓 사건 이름을 상수 표로 쓰는 전송·구독 지점을 **실제 값으로** 풀기 위해
// 그 표들을 그대로 가져온다(시험 안에 값을 다시 적으면 두 목록이 갈릴 수 있다).
const { SOCKET_EVENTS } = await import("../../setup/constants/gameSetupSocket.js")
const { ROOM_LIST_SOCKET_EVENTS } = await import("../../mode/constants/roomListSocket.js")
const { KICK_EVENTS } = await import("../hooks/useKickPlayerRequest.js")

const GAME_ID = "game-dead-choice"
const SELF = "uuid-self"
const OTHER = "uuid-other"
const MY_MEMBERSHIP = "mem-self-1"

const CHOICE_LABEL = "사망 후 선택"

function rosterPlayers({ selfAlive }) {
  return [
    {
      uuid: SELF, nickname: "나", alive: selfAlive, isConnected: true,
      isParticipating: true, membershipId: MY_MEMBERSHIP, themeIndex: 0,
    },
    {
      uuid: OTHER, nickname: "상대", alive: true, isConnected: true,
      isParticipating: true, membershipId: "mem-other-1", themeIndex: 1,
    },
  ]
}

function seedLiveGame({ selfAlive = true, phase = "DAY", dayIndex = 1 } = {}) {
  useAuthStore.setState({
    isLoggedIn: true, user: { uuid: SELF, nickname: "나" },
    loggedOutIntentionally: false, identityGeneration: 1,
  })
  useInGameStore.setState({
    gameId: GAME_ID,
    hostUuid: OTHER,
    error: null,
    snapshotSeq: 0,
    nightPrivateResult: null,
    state: {
      id: GAME_ID,
      phase,
      dayIndex,
      dayPhase: phase === "DAY" ? "DAY_DISCUSSION" : null,
      players: rosterPlayers({ selfAlive }),
      self: {
        uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN",
        hasActedThisPhase: false, hasAcknowledgedRoleReveal: true,
      },
      tribunal: null,
      winResult: null,
      nightResult: null,
      dayVoteResolution: null,
      participationRevision: 0,
    },
  })
}

async function mountInGame() {
  alerts.length = 0
  confirmCalls.length = 0
  confirmAnswer = true
  scheduledTimeouts.length = 0
  currentSocket = createFakeSocket()
  for (const cb of [...socketSubscribers]) cb()

  let view
  await act(async () => {
    view = render(React.createElement(RouterProvider, { router }))
  })
  await act(async () => { await router.navigate("/ingame") })
  // 실제 진입 흐름과 같다: 자기 역할 공개(및 뒤이은 DAY/NIGHT 진입 연출)를 사용자가 확인해
  // 닫는다. 이 연출들이 떠 있는 동안에는 사망 선택이 뜨지 않는 것이 설계이므로, 시험도
  // 그 순서를 건너뛰지 않고 실제로 닫는다.
  await dismissParchmentOverlays(view.container)
  return view
}

function findButton(container, label) {
  return [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label) ?? null
}

/** 화면에 떠 있는 양피지 모달(역할 공개·진입 연출)의 "확인"을 차례로 눌러 닫는다. */
async function dismissParchmentOverlays(container) {
  for (let i = 0; i < 5; i += 1) {
    const confirmButton = findButton(container, "확인")
    if (!confirmButton) return
    await act(async () => { confirmButton.click() })
  }
}

function choicePanel(container) {
  return container.querySelector(`[aria-label='${CHOICE_LABEL}']`)
}

test.afterEach(async () => {
  cleanup()
  await act(async () => { await router.navigate("/lobby") })
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
})

/**
 * F-23(SPLIT-1/AC-02): **외부 관전 진입 라우트가 없다**는 사실을 실제 라우터 선언에서 본다.
 *
 * 화면 문자열만 검사하면 "그 버튼이 지금 렌더되지 않는다"까지만 알 수 있고, 주소를 직접 쳐서
 * 들어가는 경로가 남아 있어도 통과한다. 여기서는 실제 router 객체의 선언된 경로를 전부 펼쳐
 * 관전 전용 경로가 없음을 고정하고, 동시에 정상 참가 화면 세 개는 보호 라우트 **아래에**
 * 그대로 남아 있는지 함께 본다(제거가 정상 진입까지 지우지 않았다).
 */
test("F-23(SPLIT-1/AC-02): 실제 라우터에 외부 관전 경로가 없고 정상 참가 경로는 보호 아래 그대로다", () => {
  const collectPaths = (routes, guarded = false) => routes.flatMap((route) => {
    // ProtectedRoute를 element로 갖는 레이아웃 라우트 아래가 곧 "인증 보호 구간"이다.
    const isGuard = route.element?.type === ProtectedRoute
    const here = route.path ? [{ path: route.path, guarded }] : []
    return [...here, ...collectPaths(route.children ?? [], guarded || isGuard)]
  })

  const declared = collectPaths(router.routes)
  assert.ok(declared.length > 0, "라우터에서 경로를 하나도 읽지 못했다(이 검사가 무력하다)")

  // 관전 전용 진입 경로가 하나도 없다.
  const spectatorRoutes = declared.filter(({ path }) => /spectat|watch-only|observer|관전/i.test(path))
  assert.deepEqual(spectatorRoutes, [], `외부 관전 라우트가 남아 있다: ${JSON.stringify(spectatorRoutes)}`)

  // 정상 참가 화면은 보호 라우트 아래에 그대로 선언돼 있다.
  for (const path of ["/game-setup", "/game-matching", "/ingame"]) {
    const found = declared.find((route) => route.path === path)
    assert.ok(found, `${path} 경로가 사라졌다`)
    assert.equal(found.guarded, true, `${path}가 인증 보호 밖으로 나왔다`)
  }
})

// ── F-23(SPLIT-1/AC-02): 생산 원문 감사 ─────────────────────────────────────
//
// 라우트 이름만 보면 "다른 이름의 관전 버튼·모달·상태"가 남아 있어도 통과한다. 그래서 실제
// 생산 원문(frontend/src·backend의 .js/.jsx, 시험 제외)을 전부 훑어 관전 어휘가 **실행되는
// 코드**에 남아 있지 않은지 본다. 주석은 제거 이유·정제 정책을 설명하는 기록이므로 대상이
// 아니고, 확정 사망한 **기존 참가자**의 선택(A-01이 보존을 명시)은 아래 허용 목록으로 남긴다.
//
// 어휘에서 observer 계열은 제외한다 — 이 저장소의 `observer`는 전부 DOM ResizeObserver의 지역
// 변수이고(스크롤바·채팅 입력), 관전 기능과 무관하다. 그래서 관전 어휘와 폐기 식별자만 본다.
const PRODUCTION_SOURCE_ROOTS = ["frontend/src", "backend"]
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "__tests__", "dist", "build", "coverage", ".git"])
const SPECTATOR_VOCABULARY = /spectat|관전|watch-?only|allowSpectators/i

/** 이 줄은 주석인가(제거 이유·정책 기록은 감사 대상이 아니다). */
function isCommentLine(line) {
  const trimmed = line.trim()
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")
    || trimmed.startsWith("{/*") || trimmed.startsWith("*/")
}

/** 그 원문에서 **주석이 아닌** 관전 어휘 줄만 골라낸다. */
function spectatorCodeHits(source, file) {
  return source.split(/\r?\n/).flatMap((line, index) =>
    (!isCommentLine(line) && SPECTATOR_VOCABULARY.test(line)
      ? [{ file, line: index + 1, text: line.trim() }]
      : []))
}

/**
 * 보존 대상 — 확정 사망한 **기존 참가자**의 선택 문구다(외부 관전자 기능이 아니다).
 * 이 목록이 비면 그 선택이 사라졌다는 뜻이므로, 아래 시험은 존재 자체도 함께 고정한다.
 */
const PRESERVED_SPECTATOR_TEXT_LINES = [
  {
    file: "frontend/src/domains/game/ingame/components/deadChoice/InGameDeadParticipantChoice.jsx",
    text: "관전 계속하기",
  },
]

const REPO_ROOT = new URL("../../../../../../", import.meta.url)

async function collectProductionSources() {
  const { readdir, readFile } = await import("node:fs/promises")
  const files = []
  const walk = async (relativeDir) => {
    const entries = await readdir(new URL(`${relativeDir}/`, REPO_ROOT), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue
        await walk(`${relativeDir}/${entry.name}`)
        continue
      }
      if (!/\.(jsx|js)$/.test(entry.name)) continue
      const file = `${relativeDir}/${entry.name}`
      files.push({ file, source: await readFile(new URL(file, REPO_ROOT), "utf8") })
    }
  }
  for (const root of PRODUCTION_SOURCE_ROOTS) await walk(root)
  return files
}

test("F-23(SPLIT-1/AC-02): 생산 원문 어디에도 외부 관전 UI·모달·상태가 없고 사망 참가자 선택만 남는다", async () => {
  // 검출기 자신의 양성·음성 대조부터. 주석만 걸러 내는 구현으로 퇴화하면 아래 0건 단언이
  // 조용히 통과하므로, 실제 코드 줄을 반드시 잡는지 먼저 고정한다.
  assert.deepEqual(
    spectatorCodeHits("const allowSpectators = true", "x.js").map((hit) => hit.line), [1],
    "실행되는 코드의 관전 식별자를 검출하지 못했다",
  )
  assert.deepEqual(
    spectatorCodeHits('  <button aria-label="관전 입장">관전</button>', "x.jsx").map((hit) => hit.line), [1],
    "실행되는 코드의 관전 문구를 검출하지 못했다",
  )
  assert.deepEqual(spectatorCodeHits("// 관전자 허용 체크박스는 제거했다", "x.js"), [])
  assert.deepEqual(spectatorCodeHits(" * spectatorMode는 허용 목록에 없다", "x.js"), [])

  const sources = await collectProductionSources()
  assert.ok(sources.length > 300, `생산 원문을 충분히 읽지 못했다(${sources.length}개 — 이 감사가 무력하다)`)
  for (const root of PRODUCTION_SOURCE_ROOTS) {
    assert.ok(sources.some((entry) => entry.file.startsWith(`${root}/`)), `${root}를 훑지 못했다`)
  }
  // 실제 라우터·보호 라우트·대기방 페이지가 이 감사 범위 안에 있다(감사가 비켜 가지 않았다).
  for (const covered of [
    "frontend/src/app/routes/index.jsx",
    "frontend/src/shared/ui/ProtectedRoute.jsx",
    "frontend/src/domains/game/matching/pages/GameMatchingPage.jsx",
    "frontend/src/domains/game/ingame/pages/InGamePage.jsx",
    "backend/socket/matchmaking.js",
  ]) {
    assert.ok(sources.some((entry) => entry.file === covered), `${covered}가 감사 범위 밖이다`)
  }

  const hits = sources.flatMap(({ file, source }) => spectatorCodeHits(source, file))
  const allowed = (hit) => PRESERVED_SPECTATOR_TEXT_LINES.some(
    (entry) => entry.file === hit.file && hit.text.includes(entry.text))
  const leftovers = hits.filter((hit) => !allowed(hit))
  assert.deepEqual(
    leftovers, [],
    `생산 코드에 외부 관전 흔적이 남아 있다:\n${leftovers.map((h) => `${h.file}:${h.line} ${h.text}`).join("\n")}`,
  )

  // 보존 대상은 실제로 남아 있어야 한다 — 관전 문자열을 일괄 삭제해 통과시키는 길을 막는다.
  for (const entry of PRESERVED_SPECTATOR_TEXT_LINES) {
    assert.ok(
      hits.some((hit) => hit.file === entry.file && hit.text.includes(entry.text)),
      `보존해야 할 사망 참가자 선택 문구(${entry.text})가 사라졌다`,
    )
  }
})

// ── F-23(SPLIT-1/AC-02): 구조적 목록 감사 ───────────────────────────────────
//
// 위 어휘 감사는 "관전/spectator"라는 **낱말**이 실행 코드에 남았는지만 본다. 다른 이름
// (watch·live·observe·viewer 또는 아무 이름)으로 만든 외부 관전 진입은 그 검사를 그대로
// 통과하므로, 그것만으로는 "다른 이름의 UI·라우트·모달·상태 연결이 없다"를 증명하지 못한다
// (CODEX-3 AC-02/SPLIT-1 지적). 아래 세 시험은 낱말이 아니라 **연결의 목록 자체**를 잠근다:
//
//   (1) 실제 router.routes의 전체 경로·인증 경계·element 배선 → 주소로 열 수 있는 화면 전부
//   (2) 생산 원문의 client→server 전송 / server→client 구독 사건 → 입장 액션과 상태 연결 전부
//   (3) InGamePage가 실제로 마운트하는 컴포넌트와 두 store의 상태 모양 → 오버레이·모달·상태
//
// 어느 목록에든 항목이 하나라도 늘면(그 이름이 무엇이든) 이 시험들이 깨진다. 반대로 정상
// 참가 경로·사망 참가자 선택이 사라지면 같은 목록이 줄어 역시 깨진다.

/**
 * 주석(정책 기록·예시 코드)을 지운 원문. 감사 대상은 실행되는 코드뿐이다.
 * 블록 주석은 **줄 수를 유지한 채** 비운다 — 아래 감사가 근거로 남기는 file:line이 어긋나면
 * 추적이 불가능해진다.
 */
function stripComments(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n")
}

/** 사건 이름을 상수로 쓰는 전송·구독 지점을 실제 값으로 풀기 위한 표들. */
const EVENT_CONSTANT_TABLES = { SOCKET_EVENTS, ROOM_LIST_SOCKET_EVENTS, KICK_EVENTS }

// 소켓에 닿는 길은 결국 `<socket>.emit/emitWithAck`과 `<socket>.on/off` 뿐이다. 지역 래퍼
// (useFriendSocketEvents.js:151 `function emitWithAck(socket, event, payload, timeoutMs)`)를
// 거치는 호출도 그 래퍼 호출 지점에서 한 번 더 읽어 실제 사건 이름을 확보한다.
const EVENT_REF_PATTERNS = [
  { kind: "emit", re: /\.(?:emit|emitWithAck)\(\s*([^,)]+)/g },
  // 래퍼 **호출**만 본다 — `function emitWithAck(socket, event, …)` 선언 자체는 전송 지점이
  // 아니므로 제외한다(그 선언이 무엇을 전달하는지는 아래 간접 지점 감사가 따라간다).
  { kind: "emit", re: /(?<![.\w$])(?<!function\s)emitWithAck\(\s*[A-Za-z_$][\w$]*\s*,\s*([^,)]+)/g },
  { kind: "on", re: /\.(?:on|off)\(\s*([^,)]+)/g },
]

/**
 * 생산 원문에서 소켓 사건 참조를 모은다.
 *
 * 문자열 리터럴과 상수 표 참조(`SOCKET_EVENTS.CREATE_ROOM`, 삼항의 양쪽 모두)는 실제 값으로
 * 풀고, 변수로 전달되는 간접 지점은 `unresolved`로 남긴다 — 그 지점들은 아래 시험이 목록으로
 * 고정하고 전달되는 값의 출처까지 함께 검사한다(조용히 넘기지 않는다).
 */
function collectSocketEventRefs(sources) {
  const resolved = { emit: new Map(), on: new Map() }
  const unresolved = []
  for (const { file, source } of sources) {
    stripComments(source).split(/\r?\n/).forEach((line, index) => {
      for (const { kind, re } of EVENT_REF_PATTERNS) {
        re.lastIndex = 0
        let match
        while ((match = re.exec(line)) !== null) {
          const expr = match[1].trim()
          const where = `${file}:${index + 1}`
          // 표 참조가 있으면 그것만 쓴다 — 삼항 조건의 비교 문자열("GAME")을 사건 이름으로
          // 오인하지 않기 위함이다(useKickPlayerRequest.js:354가 실제로 그 모양이다).
          const fromTables = [...expr.matchAll(/\b([A-Z][A-Z0-9_]*)\.([A-Za-z_]\w*)/g)]
            .map(([, table, key]) => EVENT_CONSTANT_TABLES[table]?.[key])
            .filter((value) => typeof value === "string")
          const names = fromTables.length > 0
            ? fromTables
            : [...expr.matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
          if (names.length === 0) {
            unresolved.push({ where, kind, expr })
            continue
          }
          for (const name of names) {
            if (!resolved[kind].has(name)) resolved[kind].set(name, [])
            resolved[kind].get(name).push(where)
          }
        }
      }
    })
  }
  return { resolved, unresolved }
}

/** 그 원문이 실제로 렌더하는 컴포넌트 이름들(대문자로 시작하는 JSX 태그). */
function collectRenderedComponents(source) {
  const body = stripComments(source)
  return {
    rendered: [...new Set([...body.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]))],
    imported: [...new Set([
      ...[...body.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from/gm)].map((m) => m[1]),
      ...[...body.matchAll(/^import\s+\{([^}]+)\}\s+from/gm)]
        .flatMap((m) => m[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop())),
    ])],
  }
}

/**
 * 선언된 라우트 전부. 실제 router 객체에서 읽고, ProtectedRoute를 element로 가진 레이아웃
 * 라우트 아래를 "인증 보호 구간"으로 표시한다.
 */
function flattenRoutes(routes, ProtectedRouteType, guarded = false) {
  return routes.flatMap((route) => {
    const isGuard = route.element?.type === ProtectedRouteType
    const here = route.path === undefined
      ? [{ layout: true, guarded, isGuard, hasElement: Boolean(route.element) }]
      : [{
          path: route.path, guarded, hasElement: Boolean(route.element),
          lazy: Boolean(route.lazy), loader: Boolean(route.loader),
        }]
    return [...here, ...flattenRoutes(route.children ?? [], ProtectedRouteType, guarded || isGuard)]
  })
}

/**
 * app/routes/index.jsx의 **전체** 라우트 배선 잠금.
 *
 * path → (JSX element 식별자, 그 식별자의 import 출처, 인증 보호 여부). 근거는 실제 원문이다
 * (frontend/src/app/routes/index.jsx:24 `export const router = createBrowserRouter([`,
 *  같은 파일 33행 `element: <ProtectedRoute />`의 children이 35~50행).
 */
const ROUTE_WIRING_LOCK = {
  "/": { component: "LoginPage", from: "@/domains/auth/pages/LoginPage", guarded: false },
  "/login": { component: "LoginPage", from: "@/domains/auth/pages/LoginPage", guarded: false },
  "/mypage": { component: "MyPage", from: "@/domains/user/pages/MyPage", guarded: true },
  "/account": { component: "AccountPage", from: "@/domains/user/pages/AccountPage", guarded: true },
  "/lobby": { component: "LobbyPage", from: "@/domains/lobby/pages/LobbyPage", guarded: true },
  "/gameMode": { component: "GameModePage", from: "@/domains/game/mode/pages/GameModePage", guarded: true },
  "/multiplay": { component: "MultiplayEntryPage", from: "@/domains/game/mode/pages/MultiplayEntryPage", guarded: true },
  "/roomInvite": { component: "RoomInvitePage", from: "@/domains/game/mode/pages/RoomInvitePage", guarded: true },
  "/game-setup": { component: "GameSetupPage", from: "@/domains/game/setup/pages/GameSetupPage", guarded: true },
  "/game-matching": { component: "GameMatchingPage", from: "@/domains/game/matching/pages/GameMatchingPage", guarded: true },
  "/ingame": { component: "InGamePage", from: "@/domains/game/ingame/pages/InGamePage.jsx", guarded: true },
  "/gameresult": { component: "GameResultPage", from: "@/domains/game/result/page/GameResultPage", guarded: true },
  "/setting": { component: "SettingPage", from: "@/domains/settings/pages/SettingPage.jsx", guarded: true },
  "/store": { component: "StorePage", from: "@/domains/store/pages/StorePage.jsx", guarded: true },
  "/library": { component: "LibraryPage", from: "@/domains/library/pages/LibraryPage.jsx", guarded: true },
  // F-18에서 명예의 전당 진입만 막은 리다이렉트다(관전 진입이 아니다 — 대상은 /lobby).
  "/podium": { component: "Navigate", from: "react-router-dom", guarded: true },
}

/** 라우트 element가 아닌, 라우터 파일이 쓰는 나머지 import 식별자. */
const ROUTER_NON_ELEMENT_IMPORTS = ["createBrowserRouter", "ViewportShell", "ProtectedRoute"]

test("F-23(SPLIT-1/AC-02): 실제 router.routes의 전체 경로·element·인증 경계가 잠긴다(다른 이름의 진입 화면도 없다)", async () => {
  const routerSource = stripComments(
    await (await import("node:fs/promises")).readFile(
      new URL("frontend/src/app/routes/index.jsx", REPO_ROOT), "utf8"),
  )

  // (1) 원문 선언과 실행 중 라우터가 같은 경로 집합을 갖는다. 어느 한쪽에만 있는 경로는
  //     "원문에는 없는데 열리는 화면" 또는 "죽은 선언"이라 둘 다 감사를 무력화한다.
  const declaredInSource = [...routerSource.matchAll(/\{\s*path:\s*"([^"]+)",\s*element:\s*<([A-Za-z_$][\w$]*)/g)]
    .map(([, path, component]) => ({ path, component }))
  const runtime = flattenRoutes(router.routes, ProtectedRoute)
  const runtimePaths = runtime.filter((entry) => entry.path !== undefined)
  assert.ok(runtimePaths.length > 0, "라우터에서 경로를 하나도 읽지 못했다(이 감사가 무력하다)")
  assert.deepEqual(
    runtimePaths.map((entry) => entry.path).sort(),
    declaredInSource.map((entry) => entry.path).sort(),
    "실행 중 라우터와 routes/index.jsx 원문의 경로 집합이 다르다",
  )
  assert.deepEqual(
    runtimePaths.map((entry) => entry.path).sort(),
    Object.keys(ROUTE_WIRING_LOCK).sort(),
    "선언된 라우트 목록이 잠금과 다르다 — 새 진입 경로가 생겼거나 정상 경로가 사라졌다",
  )

  // (2) 경로별 element 식별자와 그 import 출처, 인증 보호 여부가 전부 잠금과 같다.
  const importSourceOf = new Map([
    ...[...routerSource.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+"([^"]+)"/gm)]
      .map(([, name, from]) => [name, from]),
    ...[...routerSource.matchAll(/^import\s+\{([^}]+)\}\s+from\s+"([^"]+)"/gm)]
      .flatMap(([, names, from]) => names.split(",").map((name) => [name.trim(), from])),
  ])
  for (const [path, expected] of Object.entries(ROUTE_WIRING_LOCK)) {
    const source = declaredInSource.find((entry) => entry.path === path)
    assert.equal(source.component, expected.component, `${path}의 element 컴포넌트가 바뀌었다`)
    assert.equal(importSourceOf.get(source.component), expected.from, `${path}의 화면 모듈 출처가 바뀌었다`)
    const live = runtimePaths.find((entry) => entry.path === path)
    assert.equal(live.guarded, expected.guarded, `${path}의 인증 보호 여부가 바뀌었다`)
    assert.equal(live.hasElement, true, `${path}에 element가 없다`)
    // 지연 로딩·loader로 다른 화면을 끌어오는 우회 경로도 없다.
    assert.equal(live.lazy, false, `${path}가 lazy로 다른 화면을 끌어온다`)
    assert.equal(live.loader, false, `${path}에 loader가 붙었다`)
  }

  // (3) 라우터 파일이 import하는 식별자는 위 화면들과 레이아웃·보호 라우트뿐이다. 다른 이름의
  //     화면 모듈이 하나라도 배선되면(라우트로든 조건 분기로든) 이 단언이 먼저 깨진다.
  assert.deepEqual(
    [...importSourceOf.keys()].sort(),
    [...new Set([
      ...Object.values(ROUTE_WIRING_LOCK).map((entry) => entry.component),
      ...ROUTER_NON_ELEMENT_IMPORTS,
    ])].sort(),
    "라우터가 잠금 밖의 화면 모듈을 import한다",
  )

  // (4) 경로 없는 라우트(레이아웃)는 ViewportShell과 ProtectedRoute 둘뿐이고, catch-all이 없다.
  //     no-match 경로가 없으므로 선언되지 않은 주소는 어떤 화면에도 닿지 않는다.
  const layouts = runtime.filter((entry) => entry.layout === true)
  assert.equal(layouts.length, 2, "레이아웃 라우트 수가 바뀌었다(ViewportShell·ProtectedRoute)")
  assert.equal(layouts.filter((entry) => entry.isGuard).length, 1, "인증 보호 레이아웃이 하나가 아니다")
  assert.deepEqual(runtimePaths.filter((entry) => entry.path.includes("*")), [], "catch-all 라우트가 있다")
})

test("F-23(SPLIT-1/AC-02): 비로그인 /ingame 직접 진입은 로그인으로 돌아가고 인게임 화면을 그리지 않는다", async () => {
  // 인증 경계가 선언만 되어 있고 실제로는 통과시키는 경우를 배제한다 — 주소를 직접 쳤을 때의
  // 실제 결과를 본다(ProtectedRoute.jsx:62 `return <Navigate to="/login" replace />`).
  useAuthStore.setState({
    isLoggedIn: false, user: null, loggedOutIntentionally: false, identityGeneration: 1,
  })
  alerts.length = 0
  currentSocket = createFakeSocket()
  for (const cb of [...socketSubscribers]) cb()

  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })
  await act(async () => { await router.navigate("/ingame") })

  await waitFor(() => assert.equal(router.state.location.pathname, "/login"))
  assert.equal(view.container.querySelector("button[aria-label='게임 나가기']"), null,
    "비로그인인데 인게임 화면이 그려졌다")
  assert.equal(choicePanel(view.container), null)
  assert.ok(alerts.includes("로그인이 필요한 페이지입니다!"), "보호 라우트의 안내가 없다")
})

/**
 * client→server 전송 사건 전체(= 사용자가 서버에 요청할 수 있는 모든 액션).
 *
 * 로비 방 목록·입장 액션(`get_public_rooms`/`join_public_room`/`join_room_by_code`/
 * `join_matchmaking`/`accept_game_invite`), 설정(`update_room_settings` 등), 인게임 진입·
 * 재접속(`get_session_snapshot`)이 모두 이 목록 안에 있고, **관전 입장에 해당하는 액션은
 * 어떤 이름으로도 없다**. 항목이 늘면 이 단언이 깨진다.
 */
const CLIENT_EMIT_EVENTS_LOCK = [
  "accept_game_invite", "acknowledge_role_reveal", "cast_day_vote", "cast_tribunal_vote",
  "create_room", "delete_room", "get_current_room", "get_kick_result", "get_public_rooms",
  "get_room_settings_update_result", "get_session_snapshot", "join_matchmaking",
  "join_public_room", "join_room_by_code", "kick_game_player", "kick_room_player",
  "leave_game_session", "leave_matchmaking", "leave_room", "notifications_ready",
  "ready_for_day_vote", "resolve_day_vote", "resolve_night", "resolve_tribunal_vote",
  "set_ready", "start_game", "submit_game_chat_message", "submit_joker_chat_message",
  "submit_night_action", "update_room_settings",
]

/** server→client 구독 사건 전체(= 화면 상태로 들어오는 모든 서버 사실). */
const CLIENT_SUBSCRIBE_EVENTS_LOCK = [
  "account_cache_invalidated", "achievement_granted", "connect", "connect_error",
  "day_phase_changed", "day_vote_resolved", "disconnect", "force_disconnect",
  "friend_relation_invalidated", "friend_request_accepted", "friend_request_declined",
  "friend_request_received", "friend_status_change", "game_ended", "game_invite_received",
  "game_invite_updated", "game_kicked", "game_phase_changed", "game_started", "host_changed",
  "joker_chat_message", "night_action_result", "night_actions_resolved", "night_result_applied",
  "night_turn_ended", "night_turn_started", "notification_created", "player_eliminated",
  "player_joined_room", "player_left_room", "player_ready_changed", "public_rooms_updated",
  "room_deleted", "room_joined", "room_join_failed", "room_kicked", "room_settings_updated",
  "session_participation_changed", "session_self_progress", "tribunal_vote_resolved",
]

/**
 * 사건 이름을 변수로 받아 전달하는 간접 지점 전체. 각 지점이 무엇을 전달하는지는 아래 시험이
 * 출처까지 따라가 확인한다 — 새 간접 지점이 생기면(관전 사건을 몰래 실어 보내는 통로가 되므로)
 * 이 목록이 먼저 깨진다.
 */
const INDIRECT_EVENT_SITES_LOCK = [
  "frontend/src/domains/game/ingame/utils/attachGameChatListener.js:35 on:eventName",
  "frontend/src/domains/game/ingame/utils/attachGameChatListener.js:36 on:eventName",
  "frontend/src/domains/lobby/hooks/useFriendSocketEvents.js:157 emit:event",
]

test("F-23(SPLIT-1/AC-02): 소켓 전송·구독 사건 목록이 잠긴다(다른 이름의 관전 입장·상태 연결도 없다)", async () => {
  // 검출기 자신의 대조부터. 관전을 다른 이름으로 만든 전송·구독·상수 표를 실제로 잡아내는지,
  // 그리고 주석 속 예시 코드를 사건으로 오인하지 않는지 함께 고정한다(후자는 실재하는 경우다:
  // parsePlayerEliminatedPayload.js:5의 `io.to(channel).emit('player_eliminated', ...)`).
  const probe = collectSocketEventRefs([{
    file: "probe.js",
    source: [
      'socket.emit("join_as_watcher", { roomId })',
      'socket.on("viewer_state_changed", handler)',
      'socket.emit(WATCH_EVENTS.ENTER, {})',
      'socket.emit(scope === "GAME" ? KICK_EVENTS.GAME : KICK_EVENTS.ROOM, request, cb)',
      "/**",
      " * io.to(channel).emit('player_eliminated', payload)",
      " */",
      '// socket.on("commented_out_event", handler)',
    ].join("\n"),
  }])
  assert.deepEqual([...probe.resolved.emit.keys()].sort(),
    ["join_as_watcher", "kick_game_player", "kick_room_player"],
    "다른 이름의 전송 액션 또는 상수 표 참조를 검출하지 못했다")
  assert.deepEqual([...probe.resolved.on.keys()], ["viewer_state_changed"],
    "다른 이름의 구독 사건을 검출하지 못했다")
  assert.deepEqual(probe.unresolved.map((entry) => `${entry.kind}:${entry.expr}`),
    ["emit:WATCH_EVENTS.ENTER"], "모르는 상수 표 참조를 간접 지점으로 남기지 못했다")

  // 실제 생산 원문 전체(frontend/src, 시험 제외).
  const frontendSources = (await collectProductionSources())
    .filter(({ file }) => file.startsWith("frontend/src/"))
  assert.ok(frontendSources.length > 200, `프런트 원문을 충분히 읽지 못했다(${frontendSources.length}개)`)
  const { resolved, unresolved } = collectSocketEventRefs(frontendSources)

  assert.deepEqual([...resolved.emit.keys()].sort(), [...CLIENT_EMIT_EVENTS_LOCK].sort(),
    "client→server 전송 액션 목록이 잠금과 다르다")
  assert.deepEqual([...resolved.on.keys()].sort(), [...CLIENT_SUBSCRIBE_EVENTS_LOCK].sort(),
    "server→client 구독 사건 목록이 잠금과 다르다")
  assert.deepEqual(
    unresolved.map((entry) => `${entry.where} ${entry.kind}:${entry.expr}`).sort(),
    [...INDIRECT_EVENT_SITES_LOCK].sort(),
    "사건 이름을 변수로 받는 간접 전송·구독 지점이 새로 생겼다",
  )

  // 간접 지점이 실제로 무엇을 전달하는지 출처에서 확인한다.
  // (a) 게임 채팅 수신기는 useInGameGameChatSession.js:17-20의 표만 전달한다 — 낮·사망 채널
  //     둘뿐이고, 사망 채널은 기존 사망 참가자용이다(외부 관전자 채널이 아니다).
  const chatSessionSource = frontendSources.find(({ file }) =>
    file === "frontend/src/domains/game/ingame/hooks/useInGameGameChatSession.js").source
  const chatEventMap = /RECEIVE_EVENT_BY_CHANNEL\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/.exec(chatSessionSource)
  assert.ok(chatEventMap, "게임 채팅 수신 사건 표를 찾지 못했다")
  assert.deepEqual(
    [...chatEventMap[1].matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]).sort(),
    ["day_chat_message_received", "dead_chat_message_received"],
    "게임 채팅 수신기가 전달하는 사건이 바뀌었다",
  )
  // (b) 친구/초대 래퍼는 자기 호출 지점의 리터럴만 전달한다 — 그 값들은 위 전송 목록 안에 있다.
  for (const forwarded of ["accept_game_invite", "get_current_room"]) {
    assert.ok(
      resolved.emit.get(forwarded)?.some((where) =>
        where.startsWith("frontend/src/domains/lobby/hooks/useFriendSocketEvents.js")),
      `초대 경로가 ${forwarded}를 더 이상 전달하지 않는다(간접 지점의 근거가 사라졌다)`,
    )
  }

  // 그리고 실제 /ingame 마운트에서 이 연결에 등록된 구독·전송이 위 목록 안에만 있다.
  seedLiveGame({ selfAlive: true })
  await mountInGame()
  const live = currentSocket
  const unexpectedSubscriptions = live.subscribedEvents()
    .filter((event) => !CLIENT_SUBSCRIBE_EVENTS_LOCK.includes(event)
      && !["day_chat_message_received", "dead_chat_message_received"].includes(event))
  assert.deepEqual(unexpectedSubscriptions, [], "인게임 진입이 목록 밖의 사건을 구독했다")
  const unexpectedEmits = [...new Set(live.emitted.map((entry) => entry.event))]
    .filter((event) => !CLIENT_EMIT_EVENTS_LOCK.includes(event))
  assert.deepEqual(unexpectedEmits, [], "인게임 진입이 목록 밖의 요청을 보냈다")
  // 이 감사가 실제로 살아 있는 연결을 본다는 대조: 재접속 동기화 요청이 실제로 나갔다.
  assert.equal(live.countEmits("get_session_snapshot") > 0, true,
    "재접속 스냅샷 조회가 나가지 않았다(이 감사가 죽은 연결을 보고 있다)")
})

/** InGamePage가 실제로 마운트하는 컴포넌트 전부(오버레이·모달·패널 포함). */
const INGAME_MOUNT_LOCK = [
  "InGameActionPanel", "InGameBackground", "InGameChatShell", "InGameDeadParticipantChoice",
  "InGameKillRevealOverlay", "InGameNightPrivateResultOverlay",
  "InGameNightTurnAnnouncementOverlay", "InGamePhaseEntranceOverlay", "InGamePlayerBoard",
  "InGamePlayerSessionProvider", "InGameRoleRevealOverlay", "InGameTimebar",
  "InGameTopControls", "InGameVoteStatusPanel", "PlayerRecordListPanel", "SettingPanel",
]

/** 두 store의 상태 모양(데이터 키·액션 이름) — 관전 상태가 다른 이름으로도 없어야 한다. */
const INGAME_STORE_DATA_KEYS = [
  "error", "gameId", "hostUuid", "nightPrivateResult", "snapshotSeq", "state",
]
const MATCHING_STORE_DATA_KEYS = [
  "accessType", "bootEpoch", "canStart", "hostUuid", "isInRoom", "isSearching", "players",
  "roomCode", "roomId", "roomInstanceId", "roomRevision", "settings", "settingsVersion",
]

test("F-23(SPLIT-1/AC-02): 인게임 마운트 목록과 두 store 상태 모양이 잠긴다(관전 모달·상태가 다른 이름으로도 없다)", async () => {
  const { readFile } = await import("node:fs/promises")
  const pageSource = await readFile(
    new URL("frontend/src/domains/game/ingame/pages/InGamePage.jsx", REPO_ROOT), "utf8")

  // 수집기 대조: 주석이 아닌 실제 마운트를 잡고, 주석 속 예시는 잡지 않는다.
  const probe = collectRenderedComponents([
    'import WatchEntryModal from "./WatchEntryModal.jsx"',
    "{/* <HiddenOverlay /> 는 주석이다 */}",
    "export default () => <WatchEntryModal open />",
  ].join("\n"))
  assert.deepEqual(probe.rendered, ["WatchEntryModal"], "다른 이름의 모달 마운트를 검출하지 못했다")
  assert.deepEqual(probe.imported, ["WatchEntryModal"])

  const { rendered, imported } = collectRenderedComponents(pageSource)
  assert.deepEqual(rendered.sort(), [...INGAME_MOUNT_LOCK].sort(),
    "인게임 화면의 마운트 목록이 바뀌었다 — 새 오버레이·모달이 붙었거나 기존 화면이 사라졌다")
  // 마운트되는 이름은 모두 이 파일이 실제로 import한 것이다(전역·동적 주입이 없다).
  for (const name of rendered) {
    assert.ok(imported.includes(name), `${name}이 import 없이 마운트된다`)
  }
  // 사망 참가자 선택은 보존 대상이다(A-01) — 목록에서 빠지면 위 단언이 먼저 깨진다.
  assert.ok(rendered.includes("InGameDeadParticipantChoice"),
    "기존 사망 참가자의 계속 보기 선택창이 사라졌다")

  const shapeOf = (state) => ({
    data: Object.entries(state).filter(([, value]) => typeof value !== "function")
      .map(([key]) => key).sort(),
    actions: Object.entries(state).filter(([, value]) => typeof value === "function")
      .map(([key]) => key).sort(),
  })
  const ingameShape = shapeOf(useInGameStore.getState())
  const matchingShape = shapeOf(useMatchingStore.getState())
  assert.deepEqual(ingameShape.data, [...INGAME_STORE_DATA_KEYS].sort(),
    "인게임 store의 상태 키가 바뀌었다")
  assert.deepEqual(matchingShape.data, [...MATCHING_STORE_DATA_KEYS].sort(),
    "대기방 store의 상태 키가 바뀌었다")
  // 액션 이름에도 관전 진입·전환에 해당하는 것이 없다(있으면 아래 개수·목록이 달라진다).
  assert.deepEqual(ingameShape.actions, [
    "applyDayPhaseChanged", "applyDayVoteResolvedToPhase", "applyNightResultAppliedPayload",
    "applyNightTurnEnded", "applyNightTurnStarted", "applyParticipationChanged",
    "applyPhaseChanged", "applyPlayerEliminated", "applySelfProgress", "applySessionSnapshot",
    "applyTribunalResolved", "bootstrapSessionSnapshot", "clearGame", "clearNightPrivateResult",
    "setGameError", "setGamePayload", "setNightPrivateResult",
  ], "인게임 store의 액션 목록이 바뀌었다")
  assert.deepEqual(matchingShape.actions, [
    "addPlayer", "applyRoomSettings", "clearRoom", "removePlayer", "setPlayerReady", "setRoom",
    "startSearch", "stopSearch", "updateHost",
  ], "대기방 store의 액션 목록이 바뀌었다")
})

test("F-23(AC-06): 생존 중인 참가자에게는 사망 선택이 보이지 않는다", async () => {
  seedLiveGame({ selfAlive: true })
  const { container } = await mountInGame()

  assert.equal(choicePanel(container), null, "생존자에게 사망 선택이 떴다")
  assert.equal(container.textContent.includes("관전 계속하기"), false)
})

test("F-23(AC-06): 실제 밤 판정 사건으로 확정 사망하면 두 선택이 뜨고, 계속 보기는 서버 요청 0회다", async () => {
  // 밤에서 시작해 실제 밤 판정 방송으로 낮에 들어가며 사망이 확정되는 정상 순서를 쓴다.
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  const { container } = await mountInGame()
  const socket = currentSocket

  // 실제 수신 경로(useGameSessionSocketEvents → parseNightResultAppliedPayload → store)로
  // canonical 사망을 확정한다. deathReveals는 비운다 — 이 시험의 대상은 연출이 아니라 선택창이다.
  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "DAY", dayIndex: 1,
      players: [{ uuid: SELF, alive: false }, { uuid: OTHER, alive: true }],
      victimUuid: SELF,
      deathReveals: [],
    })
  })
  // 낮 진입 연출이 새로 뜬다 — 실제 사용자가 그러듯 확인해 닫은 뒤에 선택을 받는다.
  await dismissParchmentOverlays(container)

  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === SELF).alive, false,
    "전제: 서버 사건으로 본인이 확정 사망해야 한다",
  )
  assert.ok(choicePanel(container), "확정 사망인데 선택이 뜨지 않았다")
  assert.ok(findButton(container, "관전 계속하기"), "관전 계속하기 버튼이 없다")
  assert.ok(findButton(container, "게임 나가기"), "게임 나가기 버튼이 없다")

  // 계속 보기: 네트워크 요청 0, 소속·참여 자격·역할 그대로, 선택창만 접힌다.
  const emitsBefore = socket.emitted.length
  const roleBefore = useInGameStore.getState().state.self.role
  await act(async () => { findButton(container, "관전 계속하기").click() })

  assert.equal(socket.emitted.length, emitsBefore, "계속 보기가 서버 요청을 만들었다")
  assert.equal(choicePanel(container), null, "계속 보기 뒤에도 선택창이 남아 있다")
  const seated = useInGameStore.getState().state.players.find((p) => p.uuid === SELF)
  assert.equal(seated.membershipId, MY_MEMBERSHIP, "계속 보기로 소속이 바뀌었다")
  assert.equal(seated.isParticipating, true, "계속 보기로 참여 자격이 바뀌었다")
  // 계속 보기는 **로컬 선택**이다 — 역할이 관전자 같은 다른 값으로 바뀌면 안 된다.
  assert.equal(useInGameStore.getState().state.self.role, roleBefore, "계속 보기가 역할을 바꿨다")
  assert.equal(useInGameStore.getState().state.self.uuid, SELF, "계속 보기가 신원을 바꿨다")

  // 전제: 지금은 토론 구간이고, 그 구간의 화면만 떠 있다.
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_DISCUSSION")
  assert.ok(findButton(container, "투표 시작 준비"), "전제: 토론 구간 화면이어야 한다")
  assert.equal(container.textContent.includes("투표 대상 선택"), false)

  // 계속 보기 뒤에도 공개 진행은 계속 들어오고 화면이 실제로 갱신된다.
  //
  // "선택창이 다시 뜨지 않는다"만으로는 갱신을 증명하지 못한다 — 사건을 통째로 무시해도 그
  // 단언은 통과한다. 그래서 store의 낮 하위 구간과 **그 구간에서만 그려지는 DOM**을 함께 본다.
  await act(async () => {
    // 실제 서버가 보내는 그대로다(game-core/gameSession.js::buildDayPhaseChangedPayload):
    // gameId·dayIndex·dayPhase·round 네 필드뿐이고, round는 파서가 요구하는 필수 값이다
    // (빠지면 parseDayPhaseChangedPayload가 null을 돌려줘 이 사건이 통째로 무시된다).
    socket.deliver("day_phase_changed", {
      gameId: GAME_ID, dayIndex: 1, dayPhase: "DAY_VOTE", round: 1,
    })
  })
  assert.equal(choicePanel(container), null, "공개 사건이 접힌 선택창을 되살렸다")
  assert.equal(
    useInGameStore.getState().state.dayPhase, "DAY_VOTE",
    "공개 진행 사건이 store의 낮 구간을 갱신하지 않았다",
  )
  await waitFor(() => assert.equal(
    container.textContent.includes("투표 대상 선택"), true,
    "공개 진행 사건이 화면에 반영되지 않았다",
  ))
  assert.equal(findButton(container, "투표 시작 준비"), null, "이전 구간 화면이 그대로 남아 있다")

  // 그리고 상단 나가기 수단은 그대로 남아 있다.
  assert.ok(container.querySelector("button[aria-label='게임 나가기']"), "상단 나가기 버튼이 사라졌다")
})

test("F-23(AC-06): 나가기 성공 ACK는 정확히 한 번 정리하고 로비로 replace 이동한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  assert.ok(choicePanel(container), "전제: 확정 사망 선택이 떠 있어야 한다")

  await act(async () => { findButton(container, "게임 나가기").click() })
  assert.equal(confirmCalls.length, 1, "확인 대화상자가 한 번 떠야 한다")
  assert.equal(socket.countEmits("leave_game_session"), 1)

  // pending 동안의 추가 클릭은 확인조차 다시 묻지 않고 전송도 0이다.
  await act(async () => { container.querySelector("button[aria-label='게임 나가기']").click() })
  assert.equal(confirmCalls.length, 1, "pending 중에 확인 대화상자가 다시 떴다")
  assert.equal(socket.countEmits("leave_game_session"), 1, "pending 중 중복 전송이 일어났다")

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, null, "성공 ACK인데 인게임 store가 정리되지 않았다")
  assert.equal(useMatchingStore.getState().isInRoom, false)
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))

  // 뒤늦은 중복 ACK는 아무 일도 하지 않는다(정리·이동은 이미 한 번 끝났다).
  await act(async () => { pending.ack({ ok: true }) })
  assert.equal(router.state.location.pathname, "/multiplay")
})

test("F-23(AC-06): 나가기 취소는 아무것도 보내지 않고 화면에 남는다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket
  confirmAnswer = false

  await act(async () => { findButton(container, "게임 나가기").click() })

  assert.equal(confirmCalls.length, 1)
  assert.equal(socket.countEmits("leave_game_session"), 0, "취소했는데 요청이 나갔다")
  assert.equal(router.state.location.pathname, "/ingame")
  assert.ok(choicePanel(container), "취소 뒤 선택창이 사라졌다")
})

test("F-23(AC-06): 실패 ACK는 이동 0이고 재시도를 열어 둔다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.equal(router.state.location.pathname, "/ingame", "실패했는데 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패했는데 인게임 store가 정리됐다")
  assert.ok(choicePanel(container).textContent.includes("실패"), "실패 안내가 없다")

  // 명시적 재시도는 확인을 다시 묻지 않고 같은 요청을 한 번 더 보낸다.
  await act(async () => { findButton(container, "다시 시도").click() })
  assert.equal(confirmCalls.length, 1, "재시도가 확인 대화상자를 다시 띄웠다")
  assert.equal(socket.countEmits("leave_game_session"), 2)

  const retryAck = socket.takeAck("leave_game_session")
  await act(async () => { retryAck.ack({ ok: true }) })
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(AC-06): ACK 유실은 성공이 아니며, 권위 있는 확인 뒤에만 정확히 한 번 정리한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  socket.takeAck("leave_game_session") // 영영 응답하지 않는다.

  // 유한 상한이 지난다 — 성공으로도 실패로도 단정하지 않는다.
  await act(async () => { globalThis.__fireExitTimeouts() })

  assert.equal(router.state.location.pathname, "/ingame", "ACK 없음만으로 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.ok(choicePanel(container).textContent.includes("확인하지 못했습니다"), "미확정 안내가 없다")

  // 권위 확인 1: 전송 오류·SESSION_NOT_FOUND는 성공 근거가 아니다.
  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const firstCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { firstCheck.ack({ ok: false, code: "SESSION_NOT_FOUND" }) })
  assert.equal(router.state.location.pathname, "/ingame", "SESSION_NOT_FOUND를 성공으로 바꿨다")

  // 권위 확인 2: 이 판에서 이미 빠졌다는 서버의 답만이 정리 근거다.
  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const secondCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { secondCheck.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(AC-06): 권위 확인이 '아직 참여 중'이면 정리하지 않고 재시도를 연다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  socket.takeAck("leave_game_session")
  await act(async () => { globalThis.__fireExitTimeouts() })

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const check = socket.takeAck("get_session_snapshot")
  await act(async () => {
    check.ack({
      ok: true, gameId: GAME_ID, phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION",
      players: rosterPlayers({ selfAlive: false }).map((p) => ({
        uuid: p.uuid, nickname: p.nickname, isAlive: p.alive, isConnected: true,
      })),
      self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    })
  })

  assert.equal(router.state.location.pathname, "/ingame", "아직 참여 중인데 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.ok(findButton(container, "다시 시도"), "재시도 수단이 열리지 않았다")
})

test("F-23(AC-06): 계정이 바뀐 뒤 도착한 옛 ACK는 새 화면을 바꾸지 않는다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  const stale = socket.takeAck("leave_game_session")

  // A→B→A. 계정 값은 원래대로 돌아오지만 전이 세대는 두 번 올랐다.
  await act(async () => {
    useAuthStore.setState((s) => ({
      user: { uuid: OTHER }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    useAuthStore.setState((s) => ({
      user: { uuid: SELF, nickname: "나" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
  })

  await act(async () => { stale.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, GAME_ID, "A→B→A를 지나온 옛 ACK가 현재 판을 정리했다")
  assert.equal(router.state.location.pathname, "/ingame")
})
