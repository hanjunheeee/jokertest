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

/**
 * 같은 판·같은 계정에서 **내 소속만** 교체한다(이탈→재입장과 같은 전이다).
 *
 * 실제 store 경로(setState)로 바꾼다 — 값을 몰래 mutate하면 store가 소유한 전이 관측 자체가
 * 일어나지 않아 "왕복을 지나왔다"는 사실이 시험에서 사라진다.
 */
function swapMyMembership(next) {
  useInGameStore.setState((s) => ({
    state: {
      ...s.state,
      players: s.state.players.map((p) => (p.uuid === SELF ? { ...p, membershipId: next } : p)),
    },
  }))
}

function myMembership() {
  return useInGameStore.getState().state?.players?.find((p) => p.uuid === SELF)?.membershipId ?? null
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

// ── F-23(SPLIT-1/AC-02): 생산 원문 전체 잠금 ────────────────────────────────
//
// 라우트 이름만 보면 "다른 이름의 관전 버튼·모달·상태"가 남아 있어도 통과한다. 그래서 실제
// 생산 원문(frontend/src·backend의 .js/.jsx/.ts/.tsx/.mjs/.cjs, 시험 제외)을 **한 줄도
// 빼놓지 않고** 읽어 /spectat|관전/i의 출현 자체를 파일 단위 허용 목록으로 묶는다.
// 확장자를 js·jsx로 좁히면 같은 디렉터리에 .ts/.mjs로 추가된 관전 진입이 감사 밖으로
// 빠져나간다(CODEX-9 AC-02/SPLIT-1 지적) — 수집 확장자는 아래 isProductionSourceFileName이
// 소유하고, 그 판정 자체를 양성·음성 대조로 먼저 고정한다.
//
// 왜 어휘 **출현**까지 묶는가(이전 판의 "주석은 무조건 통과"와 다른 점):
//   - 허용 목록 밖 파일에서는 주석이든 코드든 한 줄이라도 나오면 실패한다. 관전 기능을
//     되살리는 변경은 대개 그 파일에 설명 주석부터 남기므로, 주석을 전부 눈감으면 감사가
//     "새 관전 화면이 생겼다"는 가장 이른 신호를 놓친다.
//   - 허용 목록 안에서도 그 줄은 **주석이거나** 확정 사망한 기존 참가자의 UI 문구
//     ("관전 계속하기", A-01 보존 대상)여야 한다. 식별자·라우트 path·소켓 사건 이름·
//     객체(store) 키에 나타나면 실패한다 — 아래 classifySpectatorLine이 그 네 자리를
//     각각 이름 붙여 구분하고, 양성 대조로 검출력을 먼저 고정한다.
//
// 이 잠금이 아래 두 좁은 검사(collectRenderedComponents의 **InGamePage 직계 JSX** 목록,
// shapeOf의 **두 store 최상위 키** 목록)를 대체하는 근거:
//   (a) 범위 — 두 검사는 파일 하나의 직계 JSX와 store 두 개의 1단계 키만 본다. 하위
//       컴포넌트가 자기 안에서 여는 모달, 로비·대기방 등 다른 화면의 진입 버튼, 중첩 객체
//       안의 상태 키는 구조상 그 범위 밖이다. 이 잠금은 같은 저장소의 **모든** 생산 원문을
//       읽으므로 화면·컴포넌트 깊이와 무관하게 잡는다(파일이 몇 단계 아래에 있든 같다).
//   (b) 보강 — 중첩 상태는 원문 검사만으로는 값까지 보지 못하므로, 아래 시험이 실제 마운트
//       뒤 두 store의 **전체 상태 트리**를 재귀로 훑어 키 이름까지 함께 검사한다.
//   (c) 보존 — 두 좁은 검사는 그대로 남긴다. 그것들은 "관전"이라는 낱말과 무관하게 목록이
//       늘거나 주는 변화를 잡는 구조 잠금이고, 이 어휘 잠금과 서로를 대체하지 않는다.
const PRODUCTION_SOURCE_ROOTS = ["frontend/src", "backend"]
// backend/tests도 시험 전용 디렉터리다(그 안의 helpers/isolatedTestDb.js는 생산 원문이 아니다).
const SKIPPED_DIRECTORY_NAMES = new Set([
  "node_modules", "__tests__", "tests", "dist", "build", "coverage", ".git",
])
/** 생산 원문으로 읽어야 하는 확장자 — js·jsx만 보면 .ts/.tsx/.mjs/.cjs가 감사 밖이 된다. */
const PRODUCTION_SOURCE_EXTENSION = /\.(?:jsx?|tsx?|mjs|cjs)$/
/** __tests__ 밖에 놓인 시험 파일도 생산 원문이 아니다(backend/socket/socket.authSession.test.js). */
const TEST_SOURCE_FILENAME = /\.(?:test|spec)\.(?:jsx?|tsx?|mjs|cjs)$/

function isProductionSourceFileName(name) {
  return PRODUCTION_SOURCE_EXTENSION.test(name) && !TEST_SOURCE_FILENAME.test(name)
}
// 반려가 지정한 그대로다 — 이 두 낱말이 어느 자리에든 나오면 일단 잡고, 자리에 따라 판정한다.
const SPECTATOR_VOCABULARY = /spectat|관전/i

// ── 코드/주석 분리: 파일 전체를 훑는 문자 단위 상태 기계 ────────────────────
//
// 예전 판은 줄 하나를 보고 "이 줄은 주석인가"를 휴리스틱으로 판정했다(classifySpectatorLine
// 계열). 규칙을 아무리 덧붙여도 줄 안에서 주석이 **끝난 뒤에 붙은 코드**가 계속 빠져나갔다 —
// 마지막까지 남은 구멍이 `' * 설명 */ const spectator = true'`였다(블록 주석 본문처럼 생겨
// 통째로 주석으로 통과했다, CODEX-11 지적). 줄 단위 규칙을 더 고치는 대신 **방식을 바꾼다**:
// 파일 전체 문자열을 한 문자씩 읽어 상태를 옮기고, 그 문자가 코드인지 주석인지를 위치
// 하나하나에 대해 정한다. 줄 하나를 통째로 어느 한쪽에 몰아주는 판정 자체가 사라진다.
//
// 산출물은 길이가 원문과 정확히 같은 두 본문이다(줄 번호·열 위치가 보존된다):
//   - code     : 주석 자리를 공백으로 지운 **코드 전용 본문**
//   - comments : 코드 자리를 공백으로 지운 **주석 전용 본문**
//
// 문자열·템플릿 리터럴·JSX 텍스트는 **지우지 않는다** — 화면 문구도 잠금 대상이기 때문이다
// (`aria-label="관전자 허용"`이나 JSX 본문 "관전 계속하기"가 코드 본문에 그대로 남아야 한다).
// 정규식 리터럴도 코드로 남긴다: `/spectat|관전/i` 안의 슬래시를 주석 시작으로 오인하면 그
// 뒤에 오는 코드가 통째로 숨는다.

/** 이 문자 뒤의 `/`는 나눗셈이 아니라 정규식 리터럴의 시작이다. */
const REGEX_LITERAL_PRECEDING_CHAR = /[([{,;:=!&|?+\-*%~^<>]$/
/** 이 낱말 뒤의 `/`도 마찬가지다(`return /re/.test(x)`). */
const REGEX_LITERAL_PRECEDING_WORD =
  /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|do|else|case|yield|await)$/

function splitSourceIntoCodeAndComments(source) {
  const code = []
  const comments = []
  // 두 본문은 같은 길이를 유지한다 — 한쪽이 문자를 가져가면 다른 쪽은 공백을 받는다.
  // 줄바꿈만 양쪽에 그대로 들어가 줄 번호가 어긋나지 않는다.
  const takeAsCode = (ch) => { code.push(ch); comments.push(ch === "\n" ? "\n" : " ") }
  const takeAsComment = (ch) => { comments.push(ch); code.push(ch === "\n" ? "\n" : " ") }

  let index = 0
  let state = "code"
  // 직전까지 읽은 코드 문자들의 꼬리(공백 제외). `/`가 정규식인지 나눗셈인지 가른다.
  let codeTail = ""
  const rememberCodeChar = (ch) => {
    if (/\s/.test(ch)) return
    codeTail = `${codeTail}${ch}`.slice(-24)
  }

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (state === "line-comment") {
      // 줄 주석은 줄바꿈에서 끝난다. 그 줄바꿈 자체는 코드 쪽 구조다.
      if (char === "\n") { state = "code"; takeAsCode(char) } else takeAsComment(char)
      index += 1
      continue
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        takeAsComment("*"); takeAsComment("/")
        index += 2
        state = "code"
        continue
      }
      takeAsComment(char)
      index += 1
      continue
    }

    if (char === "/" && next === "/") {
      state = "line-comment"; takeAsComment("/"); takeAsComment("/"); index += 2; continue
    }
    if (char === "/" && next === "*") {
      state = "block-comment"; takeAsComment("/"); takeAsComment("*"); index += 2; continue
    }

    // 문자열·템플릿 리터럴: 닫는 따옴표까지 통째로 코드다. 안쪽의 `//`나 `/*`는 주석이 아니다
    // ("https://…" 같은 값이 그 줄의 코드를 통째로 지우지 않는다).
    if (char === '"' || char === "'" || char === "`") {
      takeAsCode(char)
      index += 1
      while (index < source.length) {
        const inner = source[index]
        if (inner === "\\") {
          takeAsCode(inner)
          if (index + 1 < source.length) takeAsCode(source[index + 1])
          index += 2
          continue
        }
        takeAsCode(inner)
        index += 1
        if (inner === char) break
      }
      codeTail = char
      continue
    }

    // 정규식 리터럴: 직전 코드 문자가 값이 올 자리를 여는 것이면 `/`는 나눗셈이 아니다.
    if (char === "/"
      && (codeTail === ""
        || REGEX_LITERAL_PRECEDING_CHAR.test(codeTail)
        || REGEX_LITERAL_PRECEDING_WORD.test(codeTail))) {
      takeAsCode(char)
      index += 1
      let insideClass = false
      while (index < source.length) {
        const inner = source[index]
        if (inner === "\n") break // 닫히지 않은 채 줄이 끝났다면 정규식이 아니었다
        if (inner === "\\") {
          takeAsCode(inner)
          if (index + 1 < source.length) takeAsCode(source[index + 1])
          index += 2
          continue
        }
        takeAsCode(inner)
        index += 1
        if (inner === "[") insideClass = true
        else if (inner === "]") insideClass = false
        else if (inner === "/" && !insideClass) break
      }
      codeTail = "/"
      continue
    }

    takeAsCode(char)
    rememberCodeChar(char)
    index += 1
  }
  return { code: code.join(""), comments: comments.join("") }
}

/** 그 본문에서 관전 어휘가 나온 줄 번호들. */
function vocabularyLineNumbers(body) {
  const lines = []
  body.split(/\r?\n/).forEach((line, index) => {
    if (SPECTATOR_VOCABULARY.test(line)) lines.push(index + 1)
  })
  return lines
}

/**
 * 관전 어휘가 나타나도 되는 **파일 전부**(현재 10개)와 그 이유.
 *
 * 이 목록은 "이 파일에는 관전 기능이 있다"가 아니라 "이 파일에는 관전을 **제거했다는 기록**
 * 또는 사망 참가자 선택 문구가 있다"는 뜻이다. 목록 밖 파일에 한 줄이라도 나오면 실패하고,
 * 목록 안 파일에서 출현이 아예 사라져도 실패한다(정책 기록·보존 UI가 조용히 지워지는 것을
 * 막는다 — 특히 사망 참가자 선택은 A-01이 보존을 명시한다).
 */
const SPECTATOR_SOURCE_ALLOWLIST = [
  // 사망 참가자 선택 UI 본문 — 유일하게 코드(JSX 텍스트) 출현이 허용되는 파일이다.
  "frontend/src/domains/game/ingame/components/deadChoice/InGameDeadParticipantChoice.jsx",
  // 그 선택을 띄우는 페이지·판정기(주석으로 "외부 관전이 아니다"를 기록한다).
  "frontend/src/domains/game/ingame/pages/InGamePage.jsx",
  "frontend/src/domains/game/ingame/utils/selectInGameDeadParticipantChoice.js",
  // 인게임 방관리 행 정의 — "관전자 허용" 체크박스를 제거했다는 기록이 주석으로 남는다.
  "frontend/src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js",
  // 폼·역할 구성 정제 — 허용 목록 밖 키(관전자 키 포함)를 만들지 않는다는 정책 주석.
  "frontend/src/domains/game/setup/utils/roomSettingsForm.js",
  "frontend/src/domains/game/setup/hooks/useRoleCompositionState.js",
  // 서버 정제 경계·사망자 수신 정책 주석.
  "backend/utils/updateRoomSettingsValidation.js",
  "backend/socket/matchmaking.js",
  "backend/socket/gameSession.js",
  "backend/game-core/gameSession.js",
]

/**
 * **코드 전용 본문**에 관전 어휘가 남아도 되는 줄 전부. 지금 실제로 남아 있는 허용 출현만
 * 담는다 — 확정 사망한 기존 참가자의 선택 버튼 문구 하나뿐이다(A-01 보존 대상).
 *
 * 이 목록과 실제 수집 결과가 **완전히 같아야** 통과한다. 새 코드 출현이 하나라도 생기면
 * (라우트·사건 이름·식별자·객체 키·화면 문구 어느 자리든) 그 줄이 목록에 없어 실패하고,
 * 반대로 여기 적힌 보존 문구가 사라져도 실패한다.
 */
const EXPECTED_CODE_SPECTATOR_LINES = [
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
      if (!isProductionSourceFileName(entry.name)) continue
      const file = `${relativeDir}/${entry.name}`
      files.push({ file, source: await readFile(new URL(file, REPO_ROOT), "utf8") })
    }
  }
  for (const root of PRODUCTION_SOURCE_ROOTS) await walk(root)
  return files
}

/**
 * 원문 하나를 코드/주석으로 가르고, 양쪽에서 관전 어휘가 나온 자리를 따로 돌려준다.
 *
 * - codeHits    : 코드 전용 본문의 출현. `text`는 **그 줄의 코드 부분만** trim한 값이라
 *                 같은 줄 끝에 붙은 주석 문구가 기대 목록을 흔들지 않는다.
 * - commentHits : 주석 전용 본문의 출현(허용 목록 파일에서만 허용된다).
 * - rawLines    : 원문 줄에서 어휘가 보이는 줄 번호. codeHits ∪ commentHits와 같아야 한다 —
 *                 스캐너가 출현을 어느 쪽에도 넣지 않고 삼키는 일을 막는 불변식이다.
 */
function auditSpectatorSource(source, file) {
  const { code, comments } = splitSourceIntoCodeAndComments(source)
  const codeLines = code.split(/\r?\n/)
  const codeHits = vocabularyLineNumbers(code)
    .map((line) => ({ file, line, text: codeLines[line - 1].trim() }))
  const commentHits = vocabularyLineNumbers(comments).map((line) => ({ file, line }))
  return { code, comments, codeHits, commentHits, rawLines: vocabularyLineNumbers(source) }
}

/**
 * 상태 기계 대조용 표본. 줄 단위 휴리스틱이 놓쳤던 자리들을 한 파일 안에 모아 둔다 —
 * 특히 3·4·14줄이 "주석이 끝난 뒤에 붙은 코드"다.
 */
const SCANNER_PROBE_SOURCE = [
  /*  1 */ "/**",
  /*  2 */ " * 관전 진입은 제거했다.",
  /*  3 */ " * 설명 */ const spectator = true",
  /*  4 */ "/* x */ const allowSpectators = false",
  /*  5 */ 'const url = "https://example.test" // 관전 메모',
  /*  6 */ 'const label = "관전자 허용"',
  /*  7 */ "const re = /spectat|관전/i",
  /*  8 */ "          관전 계속하기",
  /*  9 */ "const t = `관전 ${count}`",
  /* 10 */ "{/* 관전 계속하기는 보존한다 */}",
  /* 11 */ "const ready = true /* 관전자 허용은 제거했다 */",
  /* 12 */ "/* 여기서 열고",
  /* 13 */ "   관전 설명을 적고",
  /* 14 */ "*/ const spectatorMode = true",
].join("\n")

test("F-23(SPLIT-1/AC-02): 생산 원문 전체에서 관전 어휘의 출현 파일과 자리가 잠긴다", async () => {
  // (1) 상태 기계 자신의 대조. "주석이 끝난 뒤에 붙은 코드"를 실제로 코드로 읽는지, 문자열·
  //     템플릿·JSX 텍스트·정규식을 지우지 않는지, 진짜 주석은 주석으로 두는지를 한 번에 본다.
  const probe = auditSpectatorSource(SCANNER_PROBE_SOURCE, "probe.ts")
  assert.deepEqual(
    probe.codeHits.map((hit) => `${hit.line}:${hit.text}`),
    [
      // 여러 줄 블록 주석을 닫은 **바로 뒤**의 코드 — 예전 줄 단위 판정의 마지막 구멍이다.
      "3:const spectator = true",
      "4:const allowSpectators = false",
      // 문자열 리터럴(화면 문구)·정규식·JSX 텍스트·템플릿 리터럴은 코드로 남는다.
      '6:const label = "관전자 허용"',
      "7:const re = /spectat|관전/i",
      "8:관전 계속하기",
      "9:const t = `관전 ${count}`",
      "14:const spectatorMode = true",
    ],
    "코드 전용 본문이 주석 뒤 코드나 화면 문구를 놓쳤다",
  )
  assert.deepEqual(
    probe.commentHits.map((hit) => hit.line),
    [2, 5, 10, 11, 13],
    "주석 전용 본문이 실제 주석 출현과 다르다",
  )
  // 어떤 출현도 양쪽 중 어디에도 들어가지 않고 사라지지 않는다.
  assert.deepEqual(
    [...new Set([...probe.codeHits, ...probe.commentHits].map((hit) => hit.line))].sort((a, b) => a - b),
    probe.rawLines,
    "원문에 보이는 출현이 코드·주석 어느 쪽에도 담기지 않았다",
  )
  // 두 본문은 원문을 문자 단위로 나눠 가진다(줄 번호·열 위치가 보존된다).
  assert.equal(probe.code.length, SCANNER_PROBE_SOURCE.length)
  assert.equal(probe.comments.length, SCANNER_PROBE_SOURCE.length)

  // (1c) 수집 확장자. js·jsx만 모으면 같은 디렉터리의 .ts/.tsx/.mjs/.cjs가 감사 밖이 된다.
  assert.deepEqual(
    ["a.ts", "b.tsx", "c.mjs", "d.cjs", "e.js", "f.jsx", "g.test.ts", "h.spec.tsx",
      "i.test.js", "j.test.jsx", "k.md", "l.json", "m.d.ts"].filter(isProductionSourceFileName),
    ["a.ts", "b.tsx", "c.mjs", "d.cjs", "e.js", "f.jsx", "m.d.ts"],
    "생산 원문 수집 확장자가 js·jsx로 좁아졌거나 시험 파일을 걸러내지 못했다",
  )

  // (2) 감사 범위. 실제로 수백 개 파일을 읽었고, 두 루트와 핵심 파일이 그 안에 있다.
  const sources = await collectProductionSources()
  assert.ok(sources.length > 300, `생산 원문을 충분히 읽지 못했다(${sources.length}개 — 이 감사가 무력하다)`)
  for (const root of PRODUCTION_SOURCE_ROOTS) {
    assert.ok(sources.some((entry) => entry.file.startsWith(`${root}/`)), `${root}를 훑지 못했다`)
  }
  for (const covered of [
    "frontend/src/app/routes/index.jsx",
    "frontend/src/shared/ui/ProtectedRoute.jsx",
    "frontend/src/domains/game/matching/pages/GameMatchingPage.jsx",
    "frontend/src/domains/game/ingame/pages/InGamePage.jsx",
    "frontend/src/domains/game/setup/pages/GameSetupPage.jsx",
    "frontend/src/domains/lobby/pages/LobbyPage.jsx",
    "backend/socket/matchmaking.js",
    "backend/socket/gameSession.js",
    ...SPECTATOR_SOURCE_ALLOWLIST,
  ]) {
    assert.ok(sources.some((entry) => entry.file === covered), `${covered}가 감사 범위 밖이다`)
  }
  // 허용 목록에 적힌 파일이 전부 실재한다(오타로 잠금이 헐거워지지 않는다).
  assert.equal(new Set(SPECTATOR_SOURCE_ALLOWLIST).size, 10, "허용 목록의 파일 수가 10개가 아니다")

  const audited = sources.map(({ file, source }) => ({
    source, ...auditSpectatorSource(source, file),
  }))
  const codeHits = audited.flatMap((entry) => entry.codeHits)
  const commentHits = audited.flatMap((entry) => entry.commentHits)

  // (2a) 스캐너가 출현을 삼키지 않았다 — 원문 줄에서 보이는 어휘는 전부 코드나 주석 중
  //      한쪽에 담겼다. 이 불변식이 깨지면 아래 "0개" 단언들이 조용히 통과할 수 있다.
  for (const entry of audited) {
    const covered = [...new Set([...entry.codeHits, ...entry.commentHits].map((hit) => hit.line))]
      .sort((a, b) => a - b)
    assert.deepEqual(covered, entry.rawLines,
      `${entry.codeHits[0]?.file ?? entry.commentHits[0]?.file}의 어휘 출현이 코드·주석 어디에도 담기지 않았다`)
    assert.equal(entry.code.length, entry.source.length, "코드 본문의 길이가 원문과 다르다")
  }

  // (3) **코드 전용 본문**의 출현이 기대 목록과 정확히 같다. 새 코드 출현이 하나라도 생기면
  //     (자리가 어디든, 어느 파일이든) 목록에 없어 실패하고, 보존 문구가 사라져도 실패한다.
  const codeOccurrences = codeHits
    .map(({ file, text }) => ({ file, text }))
    .sort((a, b) => `${a.file}${a.text}`.localeCompare(`${b.file}${b.text}`))
  assert.deepEqual(
    codeOccurrences,
    [...EXPECTED_CODE_SPECTATOR_LINES]
      .sort((a, b) => `${a.file}${a.text}`.localeCompare(`${b.file}${b.text}`)),
    `생산 코드의 관전 어휘 출현이 기대 목록과 다르다:\n${
      codeHits.map((h) => `${h.file}:${h.line} ${h.text}`).join("\n")}`,
  )

  // (4) 주석 안의 관전 어휘는 **허용 목록 파일에서만** 허용된다. 목록 밖 파일에서는 주석
  //     한 줄이라도 실패한다 — 관전 기능을 되살리는 변경은 대개 설명 주석부터 남긴다.
  const strayComments = commentHits.filter((hit) => !SPECTATOR_SOURCE_ALLOWLIST.includes(hit.file))
  assert.deepEqual(
    strayComments, [],
    `허용 목록 밖 파일의 주석에 관전 어휘가 있다:\n${
      strayComments.map((h) => `${h.file}:${h.line}`).join("\n")}`,
  )

  // (5) 출현 **파일 집합**이 허용 목록과 정확히 같다(정책 기록이 조용히 지워져도 실패한다).
  assert.deepEqual(
    [...new Set([...codeHits, ...commentHits].map((hit) => hit.file))].sort(),
    [...SPECTATOR_SOURCE_ALLOWLIST].sort(),
    "관전 어휘가 나오는 파일 집합이 허용 목록과 다르다",
  )
})

// ── F-23(SPLIT-1/AC-02): 라우트 path·백엔드 수신 사건 전수 열거 ─────────────
//
// 위 어휘 잠금은 "관전"이라는 낱말이 원문 어디에 남았는가만 본다. 진입은 낱말 없이도 만들 수
// 있으므로, 주소로 열리는 **path 전부**와 서버가 받아 주는 **사건 이름 전부**를 각각 열거해
// 그 목록 자체를 고정하고, 그 안에 관전 계열 이름이 하나도 없음을 함께 단언한다.

/** 백엔드가 실제로 수신 등록하는 사건 전부(backend/socket의 socket.on/io.on). */
const BACKEND_SOCKET_ON_EVENTS_LOCK = [
  // 연결 수명(backend/socket/socket.js)
  "connection", "disconnect", "notifications_ready",
  // 대기방·방 설정·초대(backend/socket/matchmaking.js)
  "accept_game_invite", "create_room", "delete_room", "get_current_room",
  "get_game_invite_result", "get_public_rooms", "get_room_settings_update_result",
  "join_matchmaking", "join_public_room", "join_room_by_code", "kick_room_player",
  "leave_matchmaking", "leave_room", "set_ready", "start_game", "update_room_settings",
  // 진행 중 게임(backend/socket/gameSession.js)
  "acknowledge_role_reveal", "cast_day_vote", "cast_tribunal_vote", "get_kick_result",
  "get_session_snapshot", "kick_game_player", "leave_game_session", "ready_for_day_vote",
  "resolve_day_vote", "resolve_night", "resolve_tribunal_vote", "submit_game_chat_message",
  "submit_joker_chat_message", "submit_night_action",
]

/** 이름만 바꾼 관전 진입까지 잡기 위해 넓힌 어휘(경로·사건 이름 검사 전용). */
const SPECTATOR_NAME_VOCABULARY = /spectat|관전|watch|observ|viewer|onlook/i

/** 그 원문의 `.on(` 수신 등록에서 사건 이름을 실제 값으로 푼다(상수 표 참조 포함). */
function collectSocketOnEventNames(sources, tables) {
  const resolved = []
  const unresolved = []
  for (const { file, source } of sources) {
    stripComments(source).split(/\r?\n/).forEach((line, index) => {
      const re = /\.on\(\s*([^,)]+)/g
      let match
      while ((match = re.exec(line)) !== null) {
        const expr = match[1].trim()
        const where = `${file}:${index + 1}`
        const fromTables = [...expr.matchAll(/\b([A-Z][A-Z0-9_]*)\.([A-Za-z_]\w*)/g)]
          .map(([, table, key]) => tables[table]?.[key])
          .filter((value) => typeof value === "string")
        const literals = [...expr.matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
        const names = fromTables.length > 0 ? fromTables : literals
        if (names.length === 0) unresolved.push({ where, expr })
        else for (const name of names) resolved.push({ where, name })
      }
    })
  }
  return { resolved, unresolved }
}

test("F-23(SPLIT-1/AC-02): 라우트 path 전체와 백엔드 socket.on 사건 전체에 관전 관련 이름이 없다", async () => {
  const { readFile } = await import("node:fs/promises")
  const { createRequire } = await import("node:module")

  // (1) app/routes/index.jsx의 **모든** path. 원문 선언과 실행 중 라우터가 같은 집합이어야
  //     한다 — 한쪽에만 있으면 그 열거는 실제로 열리는 화면을 대표하지 못한다.
  const routerSource = stripComments(
    await readFile(new URL("frontend/src/app/routes/index.jsx", REPO_ROOT), "utf8"))
  const declaredPaths = [...routerSource.matchAll(/path\s*:\s*"([^"]*)"/g)].map((m) => m[1])
  assert.ok(declaredPaths.length > 0, "라우터 원문에서 path를 하나도 읽지 못했다")
  const runtimePaths = flattenRoutes(router.routes, ProtectedRoute)
    .filter((entry) => entry.path !== undefined).map((entry) => entry.path)
  assert.deepEqual([...declaredPaths].sort(), [...runtimePaths].sort(),
    "원문 선언과 실행 중 라우터의 path 집합이 다르다")
  const spectatorPaths = declaredPaths.filter((path) => SPECTATOR_NAME_VOCABULARY.test(path))
  assert.deepEqual(spectatorPaths, [],
    `관전 계열 이름의 라우트가 있다: ${spectatorPaths.join(", ")}`)
  // 리다이렉트 목적지도 함께 본다(경로 선언 없이 다른 화면으로 보내는 우회를 막는다).
  const redirectTargets = [...routerSource.matchAll(/<Navigate\s+to="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(redirectTargets, ["/lobby"], "리다이렉트 목적지가 바뀌었다")
  // 검출기 대조: 관전 경로가 실제로 있으면 위 필터가 잡는다.
  assert.deepEqual(
    ["/lobby", "/spectate", "/watch/:roomId"].filter((path) => SPECTATOR_NAME_VOCABULARY.test(path)),
    ["/spectate", "/watch/:roomId"], "관전 계열 경로 이름을 검출하지 못했다")

  // (2) backend/socket의 **모든** 수신 등록. 상수 표 참조는 실제 백엔드 모듈에서 값을 읽어
  //     푼다(시험 안에 값을 다시 적으면 두 목록이 갈릴 수 있다).
  const backendRequire = createRequire(new URL("backend/socket/matchmaking.js", REPO_ROOT))
  const tables = {
    KICK_EVENTS: backendRequire("./kickReceiptStore").KICK_EVENTS,
    ROOM_SETTINGS_EVENTS: backendRequire("../utils/updateRoomSettingsValidation").ROOM_SETTINGS_EVENTS,
  }
  assert.equal(tables.KICK_EVENTS.KICK_ROOM_PLAYER, "kick_room_player", "추방 사건 표를 읽지 못했다")
  assert.equal(tables.ROOM_SETTINGS_EVENTS.UPDATE_ROOM_SETTINGS, "update_room_settings",
    "설정 사건 표를 읽지 못했다")

  // 검출기 대조: 다른 이름의 관전 수신·상수 표 참조를 실제로 잡아내는지 먼저 고정한다.
  const probe = collectSocketOnEventNames([{
    file: "probe.js",
    source: [
      "socket.on('spectator_joined', handler)",
      "socket.on(KICK_EVENTS.KICK_ROOM_PLAYER, handler)",
      "socket.on(eventName, handler)",
      "// socket.on('commented_out', handler)",
    ].join("\n"),
  }], tables)
  assert.deepEqual(probe.resolved.map((entry) => entry.name),
    ["spectator_joined", "kick_room_player"], "다른 이름의 수신 등록을 검출하지 못했다")
  assert.deepEqual(probe.unresolved.map((entry) => entry.expr), ["eventName"],
    "변수로 받는 수신 등록을 간접 지점으로 남기지 못했다")

  const backendSocketSources = (await collectProductionSources())
    .filter(({ file }) => file.startsWith("backend/socket/"))
  assert.deepEqual(
    backendSocketSources.map((entry) => entry.file).sort(),
    [
      "backend/socket/channelMembership.js", "backend/socket/gameSession.js",
      "backend/socket/kickReceiptStore.js", "backend/socket/matchmaking.js",
      "backend/socket/roomJoinErrors.js", "backend/socket/socket.js",
    ],
    "backend/socket의 생산 파일 목록이 바뀌었다",
  )
  const { resolved, unresolved } = collectSocketOnEventNames(backendSocketSources, tables)
  assert.deepEqual(unresolved, [], "사건 이름을 변수로 받는 서버 수신 등록이 생겼다")
  assert.deepEqual([...new Set(resolved.map((entry) => entry.name))].sort(),
    [...BACKEND_SOCKET_ON_EVENTS_LOCK].sort(),
    "서버가 수신하는 사건 목록이 잠금과 다르다")
  const spectatorEvents = resolved.filter((entry) => SPECTATOR_NAME_VOCABULARY.test(entry.name))
  assert.deepEqual(spectatorEvents, [],
    `관전 계열 이름의 서버 수신 사건이 있다: ${spectatorEvents.map((e) => `${e.where} ${e.name}`).join(", ")}`)
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
// 위 어휘 잠금과 **같은 상태 기계**를 쓴다. 정규식으로 주석을 지우는 두 번째 구현을 따로
// 두면 두 감사의 "주석이란 무엇인가"가 서로 달라지고, 한쪽에만 생긴 구멍을 알아채지 못한다.
function stripComments(source) {
  return splitSourceIntoCodeAndComments(source).code
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

/**
 * 두 store의 상태 모양(데이터 키·액션 이름) — 관전 상태가 다른 이름으로도 없어야 한다.
 *
 * F-23(AC-05/SPLIT-1) snapshotResultOwner: 방금 복원된 **공개 밤 결과의 수신 증거**다. 어느
 * 계정·어느 소속·어느 연결에서 검증한 응답으로 그 값이 들어왔는지를 직렬화 가능한 세대와 id
 * 문자열로만 적어 둔다(소켓 객체 참조는 들어가지 않는다 — 아래 deepKeyPaths가 순회할 수 있어야
 * 한다). 공개 사망 연출은 이 증거가 지금 범위와 정확히 같을 때만 만들어지므로, 이전 신분이
 * 남긴 state.nightResult가 새 신분의 연출로 재등록되지 않는다. 진입 경로가 아니라 **수신
 * 기록**이라 관전 자격과는 무관하다.
 */
const INGAME_STORE_DATA_KEYS = [
  "error", "gameId", "hostUuid", "nightPrivateResult", "snapshotResultOwner", "snapshotSeq", "state",
]
const MATCHING_STORE_DATA_KEYS = [
  "accessType", "bootEpoch", "canStart", "hostUuid", "isInRoom", "isSearching", "players",
  "roomCode", "roomId", "roomInstanceId", "roomRevision", "settings", "settingsVersion",
]

/**
 * 객체 트리의 **모든** 키 경로(중첩 객체·배열 포함). 최상위 키만 보는 검사가 놓치는
 * `state.self.*`·`players[i].*` 같은 중첩 자리까지 이름을 훑기 위한 것이다.
 */
function deepKeyPaths(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((item, index) => deepKeyPaths(item, `${path}[${index}]`))
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) => [`${path}.${key}`, ...deepKeyPaths(child, `${path}.${key}`)])
}

/**
 * 아래 두 검사(직계 JSX 마운트 목록 · store 최상위 키 목록)의 범위 한계와 그 보완.
 *
 * collectRenderedComponents는 InGamePage.jsx **한 파일의 직계 JSX**만 보고, shapeOf는 두
 * store의 **1단계 키**만 본다. 하위 컴포넌트가 자기 안에서 여는 모달, 다른 화면의 진입
 * 버튼, 중첩 객체 안의 상태 키는 구조상 그 두 검사의 범위 밖이다(CODEX-5의 AC-02/SPLIT-1
 * 지적이 가리킨 공백이 정확히 이것이다).
 *
 * 그 공백은 이 파일 위쪽의 **생산 원문 전체 잠금**이 덮는다 — frontend/src·backend의 모든
 * 비시험 js/jsx를 한 줄씩 읽어 관전 어휘의 출현 파일과 자리를 고정하므로, 화면·컴포넌트
 * 깊이와 무관하게 잡힌다. 그리고 이름이 아니라 **연결의 목록**은 라우트 path 전수·서버 수신
 * 사건 전수·클라이언트 전송/구독 전수 잠금이 각각 고정한다.
 *
 * 여기서는 그 둘로도 값까지는 보지 못하는 **중첩 상태**를 실제 마운트 뒤 재귀로 훑어 덧댄다.
 * 아래 두 좁은 검사는 그대로 보존한다(관전과 무관한 목록 증감을 잡는 구조 잠금이다).
 */
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
    // F-23(SPLIT-1) invalidateUnconfirmedTerminalResult: 신원·연결이 바뀐 뒤 현재 신원의
    // 스냅샷을 끝내 받지 못했을 때, 이전 신원이 받아 둔 잔존 종료 상태에서 **결과 이동
    // 근거(winResult)만** 걷어낸다. 관전 진입·전환이 아니며 phase·roster·참여는 건드리지
    // 않는다 — 현재 연결의 정상 스냅샷이 ENDED를 다시 실으면 그대로 복원된다.
    "invalidateUnconfirmedTerminalResult",
    "setGameError", "setGamePayload", "setNightPrivateResult",
  ], "인게임 store의 액션 목록이 바뀌었다")
  assert.deepEqual(matchingShape.actions, [
    "addPlayer", "applyRoomSettings", "clearRoom", "removePlayer", "setPlayerReady", "setRoom",
    "startSearch", "stopSearch", "updateHost",
  ], "대기방 store의 액션 목록이 바뀌었다")

  // ── 중첩 상태 보완 ────────────────────────────────────────────────────────
  // 위 shapeOf는 1단계 키만 본다. 실제 /ingame을 마운트한 뒤 두 store의 **전체 상태 트리**를
  // 재귀로 훑어, 중첩된 자리에 관전 계열 키가 없다는 사실까지 같은 시험에서 고정한다.
  // 검출기 대조부터 — 중첩·배열 안의 키를 실제로 잡는다.
  assert.deepEqual(
    deepKeyPaths({ room: { spectators: [{ watchOnly: true }] } })
      .filter((path) => SPECTATOR_NAME_VOCABULARY.test(path)),
    // 배열 원소 자체는 키가 아니므로 경로로 세지 않는다 — 그 **안의 키**가 잡혀야 한다.
    ["$.room.spectators", "$.room.spectators[0].watchOnly"],
    "중첩·배열 안의 관전 계열 키를 검출하지 못했다",
  )

  seedLiveGame({ selfAlive: false })
  await mountInGame()
  const nestedKeys = [
    ...deepKeyPaths(useInGameStore.getState()),
    ...deepKeyPaths(useMatchingStore.getState()),
  ]
  assert.ok(
    nestedKeys.some((path) => path.startsWith("$.state.players[0].")),
    "중첩 상태를 훑지 못했다(이 보완 검사가 무력하다)",
  )
  assert.ok(nestedKeys.includes("$.state.self.role"), "자기 상태의 중첩 키를 훑지 못했다")
  assert.deepEqual(
    nestedKeys.filter((path) => SPECTATOR_NAME_VOCABULARY.test(path)), [],
    "두 store의 중첩 상태에 관전 계열 키가 있다",
  )
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

// ── F-23(SPLIT-2): 계속 보기 뒤의 상단 나가기와 복구 수단 ─────────────────────
//
// 아래 시험들이 고정하는 것은 "계속 보기를 골랐다"와 "나가기 결과를 알 수 없다"가 **다른
// 사실**이라는 점이다. 앞의 선택이 뒤의 안내를 지워버리면, 사용자는 화면이 왜 그대로인지
// 알 수 없고 다시 시도할 수단도 없다.

/** 확정 사망 → 계속 보기 → 상단 나가기까지 진행한 공통 출발점. */
async function arriveAtTopExitAfterKeepWatching() {
  seedLiveGame({ selfAlive: false })
  const view = await mountInGame()
  const { container } = view
  const socket = currentSocket

  assert.ok(choicePanel(container), "전제: 확정 사망 선택이 떠 있어야 한다")
  await act(async () => { findButton(container, "관전 계속하기").click() })
  assert.equal(choicePanel(container), null, "전제: 계속 보기 뒤에는 선택창이 접혀야 한다")

  const topExit = container.querySelector("button[aria-label='게임 나가기']")
  assert.ok(topExit, "전제: 상단 나가기 버튼이 있어야 한다")
  await act(async () => { topExit.click() })
  assert.equal(socket.countEmits("leave_game_session"), 1, "전제: 상단 경로로 요청이 나가야 한다")

  return { container, socket }
}

test("F-23(SPLIT-2): 계속 보기 뒤 상단 나가기가 실패하면 안내와 재시도가 실제로 보이고 눌린다", async () => {
  const { container, socket } = await arriveAtTopExitAfterKeepWatching()

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  // 계속 보기를 골랐어도 실패 안내는 보여야 한다(이것이 이 슬라이스가 고친 결함이다).
  const panel = choicePanel(container)
  assert.ok(panel, "계속 보기 뒤라는 이유로 나가기 실패 안내가 통째로 사라졌다")
  assert.ok(panel.textContent.includes("실패"), "실패 안내 문구가 없다")
  assert.equal(router.state.location.pathname, "/ingame", "실패했는데 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패했는데 인게임 store가 정리됐다")

  // 복구 버튼이 실제로 조작 가능해야 한다 — 다른 오버레이 안이나 inert 본문 아래가 아니다.
  const retry = findButton(container, "다시 시도")
  assert.ok(retry, "재시도 수단이 열리지 않았다")
  assert.equal(retry.disabled, false, "재시도 버튼이 비활성이다")
  assert.equal(retry.closest("[inert]"), null, "재시도 버튼이 inert 영역 안에 있다")

  await act(async () => { retry.click() })
  assert.equal(confirmCalls.length, 1, "재시도가 확인 대화상자를 다시 띄웠다")
  assert.equal(socket.countEmits("leave_game_session"), 2)

  const retryAck = socket.takeAck("leave_game_session")
  await act(async () => { retryAck.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, null, "재시도 성공인데 정리되지 않았다")
  assert.equal(useMatchingStore.getState().isInRoom, false)
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(SPLIT-2): 계속 보기 뒤 상단 나가기의 ACK가 유실되면 미확정 안내와 결과 확인이 보이고, 권위 확인으로만 정리한다", async () => {
  const { container, socket } = await arriveAtTopExitAfterKeepWatching()

  // 배경 스냅샷 동기화와 나가기 확인은 **서로 다른 요청**이다. 이 시험이 답하는 것은
  // 나가기 쪽이므로, 배경 요청이 이미 하나 떠 있다는 사실부터 확인해 둔다.
  assert.ok(socket.countEmits("get_session_snapshot") >= 1,
    "전제: 재접속 동기화가 배경에서 이미 한 번 조회한다")
  socket.takeAck("leave_game_session") // 영영 응답하지 않는다.

  await act(async () => { globalThis.__fireExitTimeouts() })

  const panel = choicePanel(container)
  assert.ok(panel, "계속 보기 뒤라는 이유로 미확정 안내가 사라졌다")
  assert.ok(panel.textContent.includes("확인하지 못했습니다"), "미확정 안내 문구가 없다")
  assert.equal(router.state.location.pathname, "/ingame", "ACK 없음만으로 로비로 이동했다")

  const resolve = findButton(container, "나가기 결과 확인")
  assert.ok(resolve, "결과 확인 수단이 열리지 않았다")
  assert.equal(resolve.closest("[inert]"), null, "결과 확인 버튼이 inert 영역 안에 있다")

  // 확인 1: 서버 오류는 성공 근거가 아니다.
  const emitsBeforeCheck = socket.countEmits("get_session_snapshot")
  await act(async () => { resolve.click() })
  assert.equal(socket.countEmits("get_session_snapshot"), emitsBeforeCheck + 1,
    "결과 확인이 새 조회를 보내지 않았다")
  const firstCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { firstCheck.ack({ ok: false, code: "INTERNAL_ERROR" }) })
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "INTERNAL_ERROR를 성공으로 바꿨다")
  assert.equal(router.state.location.pathname, "/ingame")

  // 확인 2: 이 판에서 이미 빠졌다는 서버의 답만이 정리 근거다.
  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const secondCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { secondCheck.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))

  // 정리가 끝난 뒤 배경 스냅샷의 지연 성공이 게임을 되살리지 않는다.
  const lateBackground = socket.takeAck("get_session_snapshot")
  if (lateBackground) {
    await act(async () => {
      lateBackground.ack({
        ok: true, gameId: GAME_ID, phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION",
        players: rosterPlayers({ selfAlive: false }).map((p) => ({
          uuid: p.uuid, nickname: p.nickname, isAlive: p.alive, isConnected: true,
        })),
        self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      })
    })
  }
  assert.equal(useInGameStore.getState().gameId, null, "정리 뒤 도착한 배경 스냅샷이 게임을 되살렸다")
})

/**
 * F-23(AC-06): **안내에도 닫는 길이 있어야 한다.**
 *
 * 계속 보기를 고른 뒤 상단 나가기가 실패하면 같은 창이 이유와 복구 수단을 띄운다(위 시험).
 * 그런데 그 창의 "관전 계속하기"가 선택 범위만 저장하면, 복구 필요 여부는 그대로 참이라
 * 창도 본문 inert도 풀리지 않는다 — 버튼은 눌리는데 아무 일도 일어나지 않고 화면이 잠긴다.
 * 재시도를 미루고 계속 관전하는 것은 사용자의 정당한 선택이므로, 그 선택이 실제로 화면을
 * 되돌려 주어야 한다. 동시에 재시도 경로는 살아 있어야 한다.
 */
test("F-23(AC-06): 나가기 실패 상태에서도 관전 계속하기가 창을 닫고 관전을 이어가며, 재시도 경로는 남는다", async () => {
  const { container, socket } = await arriveAtTopExitAfterKeepWatching()

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.ok(choicePanel(container), "전제: 실패 안내가 떠 있어야 한다")
  const keepWatching = findButton(container, "관전 계속하기")
  assert.ok(keepWatching, "실패 안내에 관전 계속하기가 없다")
  assert.equal(keepWatching.disabled, false, "실패 상태인데 관전 계속하기가 비활성이다")
  assert.equal(keepWatching.closest("[inert]"), null, "관전 계속하기가 inert 영역 안에 있다")

  await act(async () => { keepWatching.click() })

  assert.equal(choicePanel(container), null, "관전 계속하기를 눌렀는데 창이 닫히지 않았다")
  const topExit = container.querySelector("button[aria-label='게임 나가기']")
  assert.ok(topExit, "상단 나가기 버튼이 사라졌다")
  assert.equal(topExit.closest("[inert]"), null, "창을 닫았는데 게임 표면이 inert로 잠긴 채다")
  // 접은 것은 안내뿐이다 — 이탈은 일어나지 않았고 이 판에 그대로 남아 있다.
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "안내를 접었더니 인게임 store가 정리됐다")
  assert.equal(router.state.location.pathname, "/ingame")
  assert.equal(myMembership(), MY_MEMBERSHIP, "안내를 접는 것이 소속을 바꿨다")

  // 재시도 경로 보존: 상단 나가기가 **새 시도**를 열면 안내와 복구 버튼이 다시 뜬다.
  await act(async () => { topExit.click() })
  assert.equal(socket.countEmits("leave_game_session"), 2, "접은 뒤 상단 나가기가 새 요청을 보내지 못했다")

  const second = socket.takeAck("leave_game_session")
  await act(async () => { second.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  const reopened = choicePanel(container)
  assert.ok(reopened, "새 시도의 실패 안내가 다시 뜨지 않았다(접은 선택이 새 시도까지 덮었다)")
  assert.ok(reopened.textContent.includes("실패"), "새 시도의 실패 문구가 없다")
  assert.ok(findButton(container, "다시 시도"), "새 시도의 복구 버튼이 없다")
})

/**
 * F-23(SPLIT-2): **소속 왕복은 effect보다 먼저 지나간다.**
 *
 * 소속 전이는 store의 set에서 동기적으로 일어나고, 그것을 보는 effect는 그 뒤 커밋에서야
 * 돈다. 그래서 A→B→A 직후 **effect가 돌기 전에** 도착한 옛 성공 ACK는, 계정·게임·소켓·소속
 * **값**이 전부 원래대로라 기존 값 비교를 모두 통과했다 — 지금 참가 중인 판이 이미 지나간
 * 소속의 요청 결과로 정리됐다. 판정 기준은 요청 자체에 묶여야 한다.
 */
test("F-23(SPLIT-2): 소속 A→B→A 직후(효과 실행 전) 도착한 옛 성공 ACK는 현재 판을 정리하지 못한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  assert.equal(socket.countEmits("leave_game_session"), 1, "전제: 요청이 나가야 한다")
  const stale = socket.takeAck("leave_game_session")

  // 한 배치 안에서 전이 두 번과 옛 ACK가 함께 지나간다(effect는 이 act가 끝나야 돈다).
  await act(async () => {
    swapMyMembership("mem-self-2")
    swapMyMembership(MY_MEMBERSHIP)
    stale.ack({ ok: true })
  })

  assert.equal(myMembership(), MY_MEMBERSHIP, "전제: 소속 값은 원래대로 돌아왔다")
  assert.equal(
    useInGameStore.getState().gameId, GAME_ID,
    "소속 왕복을 지나온 옛 성공 ACK가 지금 참가 중인 판을 정리했다",
  )
  assert.equal(router.state.location.pathname, "/ingame", "옛 ACK로 로비로 이동했다")
})

/**
 * F-23(SPLIT-2): **상한을 넘긴 시도는 만료된다.**
 *
 * 미확정으로 끝맺은 뒤에도 그 시도의 토큰이 살아 있으면, 늦게 도착한 ACK가 여전히 "지금
 * 화면이 기다리는 응답"으로 통과해 화면을 성공(정리·이동)이나 실패로 뒤집는다. 미확정은
 * 권위 있는 확인으로만 끝난다.
 */
test("F-23(SPLIT-2): 상한을 넘겨 미확정으로 끝난 시도의 늦은 ACK는 화면을 뒤집지 못한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  const late = socket.takeAck("leave_game_session")

  await act(async () => { globalThis.__fireExitTimeouts() })
  assert.ok(
    choicePanel(container).textContent.includes("확인하지 못했습니다"),
    "전제: 상한을 넘기면 미확정으로 끝맺어야 한다",
  )

  await act(async () => { late.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, GAME_ID, "만료된 시도의 늦은 ACK가 판을 정리했다")
  assert.equal(router.state.location.pathname, "/ingame", "만료된 시도의 늦은 ACK로 로비로 이동했다")
  assert.ok(
    choicePanel(container).textContent.includes("확인하지 못했습니다"),
    "늦은 ACK가 미확정 안내를 덮었다",
  )

  // 그리고 결말은 여전히 권위 확인으로만 난다.
  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const check = socket.takeAck("get_session_snapshot")
  await act(async () => { check.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

/**
 * F-23(SPLIT-1): **재결속 중에는 결과 화면으로 넘어가지 않는다.**
 *
 * 재연결은 연결 축의 전이다. 그 순간 사망 연출 큐는 "이전 연결이 받은 것"이라 통째로
 * 버려지는데, 결과 이동이 큐가 비었다는 사실만 보고 넘어가면 새 연결에서 복구될 연출이 잘린
 * 채 잔존 ENDED로 화면이 떠난다. 보류는 유한해야 한다 — 그 연결의 스냅샷이 도착하면 풀린다.
 */
test("F-23(SPLIT-1): 재연결로 연출 큐가 버려져도 재결속이 끝나기 전에는 결과 화면으로 넘어가지 않는다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  const { container } = await mountInGame()
  const socket = currentSocket

  // 그 밤의 판정이 곧 승패를 확정한다 — 종료와 공개 사망 연출이 같은 사건에서 함께 온다.
  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "CITIZEN" },
      deathReveals: [{ victimUuid: OTHER, source: "JOKER" }],
    })
  })

  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.ok(
    container.querySelector("[data-ingame-kill-reveal]"),
    "전제: 그 판정의 공개 사망 연출이 실제로 떠 있어야 한다",
  )
  assert.equal(
    router.state.location.pathname, "/ingame",
    "전제: 연출이 남아 있는 동안에는 결과 화면으로 넘어가지 않는다",
  )

  // 실제 재연결(같은 객체·새 sid). 연출 큐는 이전 연결의 것이라 여기서 버려진다.
  await act(async () => {
    socket.id = "sock-2"
    socket.deliver("connect")
  })

  assert.equal(container.querySelector("[data-ingame-kill-reveal]"), null,
    "전제: 재연결로 이전 연결의 연출 큐가 버려져야 한다")
  assert.equal(
    router.state.location.pathname, "/ingame",
    "재결속이 끝나기 전에 잔존 ENDED로 결과 화면에 들어갔다",
  )

  // 이 연결의 스냅샷이 도착하면 보류가 풀린다(무한 보류가 아니다).
  const resync = socket.takeAck("get_session_snapshot")
  assert.ok(resync, "재연결이 현재 신원의 스냅샷을 다시 묻지 않았다")
  await act(async () => {
    resync.ack({
      ok: true, gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      winResult: { winner: "CITIZEN" },
      players: rosterPlayers({ selfAlive: true }).map((p) => ({
        uuid: p.uuid, nickname: p.nickname, isAlive: p.uuid === SELF,
        isConnected: true, isParticipating: true, membershipId: p.membershipId,
      })),
      self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    })
  })

  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "재결속이 끝났는데도 결과 이동이 영영 막혔다",
  ))
})

/**
 * F-23(SPLIT-1): **재결속 스냅샷이 실패해도 옛 신원의 종료 상태로 화면이 떠나지 않는다.**
 *
 * 위 시험은 스냅샷이 **도착하는** 경로를 고정한다. 정작 이 보류가 막으려던 결함이 되살아나는
 * 자리는 실패 경로다 — 현재 신원의 스냅샷을 적용하지 못했는데 보류만 풀면, 화면은 이전
 * 연결이 받아 둔 잔존 ENDED·winResult를 그대로 이동 근거로 삼는다.
 *
 * 동시에 사용자를 인게임에 영구히 가두어서도 안 된다. 그래서 실패 뒤 이동 0회와, 그 다음
 * 연결의 정상 스냅샷에서 이동이 **재개**되는 것을 한 시험에 함께 고정한다.
 */
test("F-23(SPLIT-1): 재결속 스냅샷이 실패하면 잔존 ENDED로 결과 화면에 넘어가지 않고, 다음 정상 스냅샷에서 이동이 재개된다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "CITIZEN" },
      deathReveals: [{ victimUuid: OTHER, source: "JOKER" }],
    })
  })

  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.ok(
    container.querySelector("[data-ingame-kill-reveal]"),
    "전제: 그 판정의 공개 사망 연출이 실제로 떠 있어야 한다",
  )
  assert.equal(router.state.location.pathname, "/ingame", "전제: 연출 중에는 넘어가지 않는다")

  // 실제 재연결 — 이전 연결의 연출 큐가 버려지고 재결속이 시작된다.
  await act(async () => {
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  assert.equal(container.querySelector("[data-ingame-kill-reveal]"), null,
    "전제: 재연결로 이전 연결의 연출 큐가 버려져야 한다")

  // 그 연결의 스냅샷이 **실패한다**(서버 오류 응답).
  const failed = socket.takeAck("get_session_snapshot")
  assert.ok(failed, "전제: 재연결이 현재 신원의 스냅샷을 다시 물어야 한다")
  await act(async () => { failed.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.equal(
    router.state.location.pathname, "/ingame",
    "재결속 스냅샷이 실패했는데 잔존 ENDED로 결과 화면에 들어갔다",
  )
  // 실패 직후의 한 틱만 보고 통과시키지 않는다 — 이후 렌더에서도 이동이 없어야 한다.
  await act(async () => { await Promise.resolve() })
  assert.equal(router.state.location.pathname, "/ingame", "뒤이은 렌더에서 결과 화면으로 넘어갔다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패가 세션 자체를 지웠다")

  // 다음 연결의 정상 스냅샷이 종료 결과를 다시 실으면 이동이 재개된다(영구히 갇히지 않는다).
  await act(async () => {
    socket.id = "sock-3"
    socket.deliver("connect")
  })
  const recovered = socket.takeAck("get_session_snapshot")
  assert.ok(recovered, "다음 재연결이 현재 신원의 스냅샷을 다시 묻지 않았다")
  await act(async () => {
    recovered.ack({
      ok: true, gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      winResult: { winner: "CITIZEN" },
      players: rosterPlayers({ selfAlive: true }).map((p) => ({
        uuid: p.uuid, nickname: p.nickname, isAlive: p.uuid === SELF,
        isConnected: true, isParticipating: true, membershipId: p.membershipId,
      })),
      self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    })
  })

  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "정상 스냅샷을 받았는데도 결과 이동이 영영 막혔다",
  ))
})

test("F-23(SPLIT-2): 계정이 왕복한 뒤에는 이전 신원의 계속 보기 선택이 새 신원에 적용되지 않는다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()

  await act(async () => { findButton(container, "관전 계속하기").click() })
  assert.equal(choicePanel(container), null, "전제: 선택이 실제로 접혀야 한다")

  // A→B→A. 계정 값은 원래대로 돌아오지만 전이 세대는 두 번 올랐다.
  await act(async () => {
    useAuthStore.setState((s) => ({
      user: { uuid: OTHER }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    useAuthStore.setState((s) => ({
      user: { uuid: SELF, nickname: "나" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
  })

  assert.ok(
    choicePanel(container),
    "계정이 왕복한 뒤에도 이전 신원의 선택이 그대로 적용돼 새 신원이 선택을 받지 못했다",
  )
  assert.ok(findButton(container, "게임 나가기"), "새 신원의 선택지가 없다")
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
