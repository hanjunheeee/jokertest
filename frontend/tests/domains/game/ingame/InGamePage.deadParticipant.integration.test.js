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

let confirmAnswer = true
const confirmCalls = []
const recordConfirm = (message) => {
  confirmCalls.push(message)
  return confirmAnswer
}
installDomGlobal("confirm", recordConfirm)
dom.window.confirm = recordConfirm

const scheduledTimeouts = []
const nativeSetTimeout = dom.window.setTimeout.bind(dom.window)
const nativeClearTimeout = dom.window.clearTimeout.bind(dom.window)
installDomGlobal("__fireExitTimeouts", () => {
  const due = scheduledTimeouts.splice(0, scheduledTimeouts.length)
  for (const entry of due) if (!entry.cancelled) entry.fn()
})
dom.window.setTimeout = (fn, delay, ...rest) => {
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

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../src/domains/game/ingame/utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `dummy-portrait-${index}` },
})
mock.module("../../../../src/domains/game/ingame/utils/pickInGamePlayerFrame.js", {
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
    getSfxMix: () => ({ gain: 0, muted: true }),
    subscribeSfxMix: () => () => {},
  },
})
mock.module("../../../../src/shared/env.js", {
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
    subscribedEvents() { return [...listeners.keys()] },
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
const { router } = await import("../../../../src/app/routes/index.jsx")
const { default: ProtectedRoute } = await import("../../../../src/shared/ui/ProtectedRoute.jsx")
const { useInGameStore } = await import("../../../../src/domains/game/ingame/store/ingameStore.js")
const { useMatchingStore } = await import("../../../../src/domains/game/matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")
const { SOCKET_EVENTS } = await import("../../../../src/domains/game/shared/constants/gameSetupSocket.js")
const { ROOM_LIST_SOCKET_EVENTS } = await import("../../../../src/domains/game/mode/constants/roomListSocket.js")
const { KICK_EVENTS } = await import("../../../../src/domains/game/ingame/hooks/useKickPlayerRequest.js")

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
  await dismissParchmentOverlays(view.container)
  return view
}

function findButton(container, label) {
  return [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label) ?? null
}

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

test("F-23(SPLIT-1/AC-02): 실제 라우터에 외부 관전 경로가 없고 정상 참가 경로는 보호 아래 그대로다", () => {
  const collectPaths = (routes, guarded = false) => routes.flatMap((route) => {
    const isGuard = route.element?.type === ProtectedRoute
    const here = route.path ? [{ path: route.path, guarded }] : []
    return [...here, ...collectPaths(route.children ?? [], guarded || isGuard)]
  })

  const declared = collectPaths(router.routes)
  assert.ok(declared.length > 0, "라우터에서 경로를 하나도 읽지 못했다(이 검사가 무력하다)")

  const spectatorRoutes = declared.filter(({ path }) => /spectat|watch-only|observer|관전/i.test(path))
  assert.deepEqual(spectatorRoutes, [], `외부 관전 라우트가 남아 있다: ${JSON.stringify(spectatorRoutes)}`)

  for (const path of ["/game-setup", "/game-matching", "/ingame"]) {
    const found = declared.find((route) => route.path === path)
    assert.ok(found, `${path} 경로가 사라졌다`)
    assert.equal(found.guarded, true, `${path}가 인증 보호 밖으로 나왔다`)
  }
})

const PRODUCTION_SOURCE_ROOTS = ["frontend/src", "backend"]
const SKIPPED_DIRECTORY_NAMES = new Set([
  "node_modules", "__tests__", "tests", "dist", "build", "coverage", ".git",
])
const PRODUCTION_SOURCE_EXTENSION = /\.(?:jsx?|tsx?|mjs|cjs)$/
const TEST_SOURCE_FILENAME = /\.(?:test|spec)\.(?:jsx?|tsx?|mjs|cjs)$/

function isProductionSourceFileName(name) {
  return PRODUCTION_SOURCE_EXTENSION.test(name) && !TEST_SOURCE_FILENAME.test(name)
}
const SPECTATOR_VOCABULARY = /spectat|관전/i

const REGEX_LITERAL_PRECEDING_CHAR = /[([{,;:=!&|?+\-*%~^<>]$/
const REGEX_LITERAL_PRECEDING_WORD =
  /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|do|else|case|yield|await)$/

function splitSourceIntoCodeAndComments(source) {
  const code = []
  const comments = []
  const takeAsCode = (ch) => { code.push(ch); comments.push(ch === "\n" ? "\n" : " ") }
  const takeAsComment = (ch) => { comments.push(ch); code.push(ch === "\n" ? "\n" : " ") }

  let index = 0
  let state = "code"
  let codeTail = ""
  const rememberCodeChar = (ch) => {
    if (/\s/.test(ch)) return
    codeTail = `${codeTail}${ch}`.slice(-24)
  }

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (state === "line-comment") {
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

    if (char === "/"
      && (codeTail === ""
        || REGEX_LITERAL_PRECEDING_CHAR.test(codeTail)
        || REGEX_LITERAL_PRECEDING_WORD.test(codeTail))) {
      takeAsCode(char)
      index += 1
      let insideClass = false
      while (index < source.length) {
        const inner = source[index]
        if (inner === "\n") break
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

function vocabularyLineNumbers(body) {
  const lines = []
  body.split(/\r?\n/).forEach((line, index) => {
    if (SPECTATOR_VOCABULARY.test(line)) lines.push(index + 1)
  })
  return lines
}

const SPECTATOR_SOURCE_ALLOWLIST = [
  "frontend/src/domains/game/ingame/components/deadChoice/InGameDeadParticipantChoice.jsx",
  "frontend/src/domains/game/ingame/pages/InGamePage.jsx",
  "frontend/src/domains/game/ingame/utils/selectInGameDeadParticipantChoice.js",
  "frontend/src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js",
  "frontend/src/domains/game/setup/utils/roomSettingsForm.js",
  "frontend/src/domains/game/setup/hooks/useRoleCompositionState.js",
  "backend/validations/room/updateSettings.js",
  "backend/socket/matchmaking.js",
  "backend/socket/gameSession.js",
  "backend/game-core/gameSession.js",
]

const EXPECTED_CODE_SPECTATOR_LINES = [
  {
    file: "frontend/src/domains/game/ingame/components/deadChoice/InGameDeadParticipantChoice.jsx",
    text: "관전 계속하기",
  },
]

const REPO_ROOT = new URL("../../../../../", import.meta.url)

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

function auditSpectatorSource(source, file) {
  const { code, comments } = splitSourceIntoCodeAndComments(source)
  const codeLines = code.split(/\r?\n/)
  const codeHits = vocabularyLineNumbers(code)
    .map((line) => ({ file, line, text: codeLines[line - 1].trim() }))
  const commentHits = vocabularyLineNumbers(comments).map((line) => ({ file, line }))
  return { code, comments, codeHits, commentHits, rawLines: vocabularyLineNumbers(source) }
}

const SCANNER_PROBE_SOURCE = [
  "/**",
  " * 관전 진입은 제거했다.",
  " * 설명 */ const spectator = true",
  "/* x */ const allowSpectators = false",
  'const url = "https://example.test" // 관전 메모',
  'const label = "관전자 허용"',
  "const re = /spectat|관전/i",
  "          관전 계속하기",
  "const t = `관전 ${count}`",
  "{/* 관전 계속하기는 보존한다 */}",
  "const ready = true /* 관전자 허용은 제거했다 */",
  "/* 여기서 열고",
  "   관전 설명을 적고",
  "*/ const spectatorMode = true",
].join("\n")

test("F-23(SPLIT-1/AC-02): 생산 원문 전체에서 관전 어휘의 출현 파일과 자리가 잠긴다", async () => {
  const probe = auditSpectatorSource(SCANNER_PROBE_SOURCE, "probe.ts")
  assert.deepEqual(
    probe.codeHits.map((hit) => `${hit.line}:${hit.text}`),
    [
      "3:const spectator = true",
      "4:const allowSpectators = false",
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
  assert.deepEqual(
    [...new Set([...probe.codeHits, ...probe.commentHits].map((hit) => hit.line))].sort((a, b) => a - b),
    probe.rawLines,
    "원문에 보이는 출현이 코드·주석 어느 쪽에도 담기지 않았다",
  )
  assert.equal(probe.code.length, SCANNER_PROBE_SOURCE.length)
  assert.equal(probe.comments.length, SCANNER_PROBE_SOURCE.length)

  assert.deepEqual(
    ["a.ts", "b.tsx", "c.mjs", "d.cjs", "e.js", "f.jsx", "g.test.ts", "h.spec.tsx",
      "i.test.js", "j.test.jsx", "k.md", "l.json", "m.d.ts"].filter(isProductionSourceFileName),
    ["a.ts", "b.tsx", "c.mjs", "d.cjs", "e.js", "f.jsx", "m.d.ts"],
    "생산 원문 수집 확장자가 js·jsx로 좁아졌거나 시험 파일을 걸러내지 못했다",
  )

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
  assert.equal(new Set(SPECTATOR_SOURCE_ALLOWLIST).size, 10, "허용 목록의 파일 수가 10개가 아니다")

  const audited = sources.map(({ file, source }) => ({
    source, ...auditSpectatorSource(source, file),
  }))
  const codeHits = audited.flatMap((entry) => entry.codeHits)
  const commentHits = audited.flatMap((entry) => entry.commentHits)

  for (const entry of audited) {
    const covered = [...new Set([...entry.codeHits, ...entry.commentHits].map((hit) => hit.line))]
      .sort((a, b) => a - b)
    assert.deepEqual(covered, entry.rawLines,
      `${entry.codeHits[0]?.file ?? entry.commentHits[0]?.file}의 어휘 출현이 코드·주석 어디에도 담기지 않았다`)
    assert.equal(entry.code.length, entry.source.length, "코드 본문의 길이가 원문과 다르다")
  }

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

  const strayComments = commentHits.filter((hit) => !SPECTATOR_SOURCE_ALLOWLIST.includes(hit.file))
  assert.deepEqual(
    strayComments, [],
    `허용 목록 밖 파일의 주석에 관전 어휘가 있다:\n${
      strayComments.map((h) => `${h.file}:${h.line}`).join("\n")}`,
  )

  assert.deepEqual(
    [...new Set([...codeHits, ...commentHits].map((hit) => hit.file))].sort(),
    [...SPECTATOR_SOURCE_ALLOWLIST].sort(),
    "관전 어휘가 나오는 파일 집합이 허용 목록과 다르다",
  )
})

const BACKEND_SOCKET_ON_EVENTS_LOCK = [
  "connection", "disconnect", "notifications_ready",
  "accept_game_invite", "create_room", "delete_room", "get_current_room",
  "get_game_invite_result", "get_public_rooms", "get_room_settings_update_result",
  "join_matchmaking", "join_public_room", "join_room_by_code", "kick_room_player",
  "leave_matchmaking", "leave_room", "set_ready", "start_game", "update_room_settings",
  "acknowledge_night_action_success", "acknowledge_role_reveal", "cast_day_vote",
  "cast_tribunal_vote", "get_kick_result",
  "get_session_snapshot", "kick_game_player", "leave_game_session", "ready_for_day_vote",
  "resolve_day_vote", "resolve_night", "resolve_tribunal_vote", "send_emoji",
  "submit_game_chat_message",
  "submit_joker_chat_message", "submit_night_action",
]

const SPECTATOR_NAME_VOCABULARY = /spectat|관전|watch|observ|viewer|onlook/i

function makeLineLookup(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1)
  return (index) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= index) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

function normalizeExpr(expr) {
  return expr.replace(/\s+/g, " ").trim()
}

function collectSocketOnEventNames(sources, tables) {
  const resolved = []
  const unresolved = []
  for (const { file, source } of sources) {
    const body = stripComments(source)
    const lineOf = makeLineLookup(body)
    const re = /\.on\(\s*([^,)]+)/g
    let match
    while ((match = re.exec(body)) !== null) {
      const expr = normalizeExpr(match[1])
      const where = `${file}:${lineOf(match.index)}`
      const fromTables = [...expr.matchAll(/\b([A-Z][A-Z0-9_]*)\.([A-Za-z_]\w*)/g)]
        .map(([, table, key]) => tables[table]?.[key])
        .filter((value) => typeof value === "string")
      const literals = [...expr.matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
      const names = fromTables.length > 0 ? fromTables : literals
      if (names.length === 0) unresolved.push({ where, expr })
      else for (const name of names) resolved.push({ where, name })
    }
  }
  return { resolved, unresolved }
}

const SERVER_EMIT_PATTERNS = [
  /\.emit\(\s*([^,)]+)/g,
  /(?<!function\s)\bemitToChannel\(\s*[^,()]+,\s*[^,()]+,\s*([^,)]+)/g,
  /(?<!function\s)\bemitToGameChannel\(\s*[^,()]+,\s*[^,()]+,\s*([^,)]+)/g,
  /(?<!function\s)\bemit(?:NightTurn|DayPhase)Event\(\s*[^,()]+,\s*([^,)]+)/g,
  /(?<!function\s)\bemitToUser\(\s*[^,()]+,\s*([^,)]+)/g,
  /(?<!function\s)\bemitFriendEventSafely\(\s*[^,()]+,\s*([^,)]+)/g,
  /(?<![.\w$])emit\(\s*[^,()]+,\s*([^,)]+)/g,
]

function collectServerEmitEventNames(sources, tables) {
  const resolved = []
  const unresolved = []
  for (const { file, source } of sources) {
    const body = stripComments(source)
    const lineOf = makeLineLookup(body)
    for (const pattern of SERVER_EMIT_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(body)) !== null) {
        const expr = normalizeExpr(match[1])
        const where = `${file}:${lineOf(match.index)}`
        const fromTables = [...expr.matchAll(/\b([A-Z][A-Z0-9_]*)\.([A-Za-z_]\w*)/g)]
          .map(([, table, key]) => tables[table]?.[key])
          .filter((value) => typeof value === "string")
        const literals = [...expr.matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
        const names = fromTables.length > 0 ? fromTables : literals
        if (names.length === 0) unresolved.push({ where, expr })
        else for (const name of names) resolved.push({ where, name })
      }
    }
  }
  return { resolved, unresolved }
}

test("F-23(SPLIT-1/AC-02): 라우트 path 전체와 백엔드 socket.on 사건 전체에 관전 관련 이름이 없다", async () => {
  const { readFile } = await import("node:fs/promises")
  const { createRequire } = await import("node:module")

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
  const redirectTargets = [...routerSource.matchAll(/<Navigate\s+to="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(redirectTargets, ["/lobby"], "리다이렉트 목적지가 바뀌었다")
  assert.deepEqual(
    ["/lobby", "/spectate", "/watch/:roomId"].filter((path) => SPECTATOR_NAME_VOCABULARY.test(path)),
    ["/spectate", "/watch/:roomId"], "관전 계열 경로 이름을 검출하지 못했다")

  const backendRequire = createRequire(new URL("backend/socket/matchmaking.js", REPO_ROOT))
  const tables = {
    KICK_EVENTS: backendRequire("./kickReceiptStore").KICK_EVENTS,
    ROOM_SETTINGS_EVENTS: backendRequire("../validations/room/updateSettings").ROOM_SETTINGS_EVENTS,
  }
  assert.equal(tables.KICK_EVENTS.KICK_ROOM_PLAYER, "kick_room_player", "추방 사건 표를 읽지 못했다")
  assert.equal(tables.ROOM_SETTINGS_EVENTS.UPDATE_ROOM_SETTINGS, "update_room_settings",
    "설정 사건 표를 읽지 못했다")

  const probe = collectSocketOnEventNames([{
    file: "probe.js",
    source: [
      "socket.on('spectator_joined', handler)",
      "socket.on(KICK_EVENTS.KICK_ROOM_PLAYER, handler)",
      "socket.on(eventName, handler)",
      "// socket.on('commented_out', handler)",
      "socket.on(",
      "    'spectator_state_multiline',",
      "    handler,",
      ")",
      "socket.on(",
      "    KICK_EVENTS.KICK_ROOM_PLAYER,",
      "    handler,",
      ")",
      "socket.on(",
      "    lateEventName,",
      "    handler,",
      ")",
    ].join("\n"),
  }], tables)
  assert.deepEqual(probe.resolved.map((entry) => `${entry.where} ${entry.name}`),
    [
      "probe.js:1 spectator_joined",
      "probe.js:2 kick_room_player",
      "probe.js:5 spectator_state_multiline",
      "probe.js:9 kick_room_player",
    ],
    "다른 이름의 수신 등록(여러 줄 호출 포함)을 검출하지 못했다")
  assert.deepEqual(probe.unresolved.map((entry) => `${entry.where} ${entry.expr}`),
    ["probe.js:3 eventName", "probe.js:13 lateEventName"],
    "변수로 받는 수신 등록(여러 줄 호출 포함)을 간접 지점으로 남기지 못했다")

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

const SERVER_EMIT_EVENTS_LOCK = [
  "force_disconnect", "friend_status_change",
  "host_changed", "match_found", "matchmaking_disabled", "matchmaking_queued",
  "player_joined_room", "player_left_room", "player_ready_changed", "public_rooms_updated",
  "room_deleted", "room_join_failed", "room_joined", "room_kicked", "room_settings_updated",
  "game_started",
  "day_phase_changed", "day_vote_resolved",
  "emoji_shown",
  "game_ended", "game_kicked", "game_phase_changed",
  "joker_chat_message", "night_action_result", "night_action_success", "night_actions_resolved",
  "night_presentation_wait", "night_result_applied", "night_turn_ended", "night_turn_started", "player_eliminated",
  "session_participation_changed", "session_self_progress", "tribunal_vote_resolved",
  "account_cache_invalidated", "achievement_granted", "friend_relation_invalidated",
  "friend_request_accepted", "friend_request_declined", "friend_request_received",
  "game_invite_received", "game_invite_updated", "notification_created",
]

const SERVER_INDIRECT_EMIT_SITES_LOCK = [
  "backend/services/friend/notify.js:20 event",
  "backend/socket/channelMembership.js:209 event",
  "backend/socket/channelMembership.js:267 event",
  "backend/socket/channelMembership.js:275 event",
  "backend/socket/gameSession.js:477 event",
  "backend/socket/gameSession.js:1249 event",
  "backend/socket/gameSession.js:2182 event",
  "backend/socket/gameSession.js:3469 eventName",
  "backend/socket/emitter.js:22 event",
]

test("F-23(AC-02 보수): 서버가 송신하는 사건 이름 전체가 잠기고 관전 전용 이름이 없다", async () => {
  const { createRequire } = await import("node:module")
  const backendRequire = createRequire(new URL("backend/socket/matchmaking.js", REPO_ROOT))
  const tables = {
    KICK_EVENTS: backendRequire("./kickReceiptStore").KICK_EVENTS,
    ROOM_SETTINGS_EVENTS: backendRequire("../validations/room/updateSettings").ROOM_SETTINGS_EVENTS,
  }

  const probe = collectServerEmitEventNames([{
    file: "probe.js",
    source: [
      "io.emit('spectator_rooms_updated', payload)",
      "socket.emit('spectator_joined', payload)",
      "io.to(channelId).emit('spectator_state', payload)",
      "socket.to(channelId).emit('spectator_left', payload)",
      "nsp.to(channelId).except(skip).emit('spectator_relay', payload)",
      "targetSocket.emit(KICK_EVENTS.ROOM_KICKED, kickedEvent)",
      "channelMembership.emitToChannel(",
      "    io, room.id, 'spectator_multiline',",
      "    { player }, null,",
      ")",
      "emitToGameChannel(io, session, 'spectator_game_multiline', payload)",
      "emitNightTurnEvent(run, 'night_turn_started', payload)",
      "emitDayPhaseEvent(run, 'day_phase_changed', payload)",
      "emitToUser(receiverId, 'spectator_notice', payload)",
      "// io.emit('commented_out', payload)",
      "recipientSocket.emit(",
      "    eventName,",
      "    outbound,",
      ")",
    ].join("\n"),
  }], tables)
  assert.deepEqual(
    probe.resolved.map((entry) => entry.name).sort(),
    [
      "day_phase_changed", "night_turn_started", "room_kicked",
      "spectator_game_multiline", "spectator_joined", "spectator_left",
      "spectator_multiline", "spectator_notice", "spectator_relay",
      "spectator_rooms_updated", "spectator_state",
    ],
    "서버 송신 지점(직접 전송·방송·래퍼·여러 줄 호출)을 검출하지 못했다",
  )
  assert.deepEqual(probe.unresolved.map((entry) => `${entry.where} ${entry.expr}`),
    ["probe.js:16 eventName"], "변수로 받는 서버 송신을 간접 지점으로 남기지 못했다")
  assert.deepEqual(
    probe.resolved.filter((entry) => SPECTATOR_NAME_VOCABULARY.test(entry.name)).map((e) => e.name).sort(),
    [
      "spectator_game_multiline", "spectator_joined", "spectator_left", "spectator_multiline",
      "spectator_notice", "spectator_relay", "spectator_rooms_updated", "spectator_state",
    ],
    "관전 계열 송신 이름을 검출하지 못했다",
  )

  const backendSources = (await collectProductionSources())
    .filter(({ file }) => file.startsWith("backend/"))
  assert.ok(backendSources.length > 40, `백엔드 원문을 충분히 읽지 못했다(${backendSources.length}개)`)
  const { resolved, unresolved } = collectServerEmitEventNames(backendSources, tables)

  assert.deepEqual([...new Set(resolved.map((entry) => entry.name))].sort(),
    [...SERVER_EMIT_EVENTS_LOCK].sort(),
    "서버가 송신하는 사건 목록이 잠금과 다르다")
  assert.deepEqual(unresolved.map((entry) => `${entry.where} ${entry.expr}`).sort(),
    [...SERVER_INDIRECT_EMIT_SITES_LOCK].sort(),
    "사건 이름을 변수로 받는 서버 송신 지점이 새로 생겼다")

  const spectatorEmits = resolved.filter((entry) => SPECTATOR_NAME_VOCABULARY.test(entry.name))
  assert.deepEqual(spectatorEmits, [],
    `관전 계열 이름의 서버 송신 사건이 있다: ${spectatorEmits.map((e) => `${e.where} ${e.name}`).join(", ")}`)

  const gameSessionSource = backendSources
    .find(({ file }) => file === "backend/socket/gameSession.js").source
  const chatEventMap = /CHAT_EVENT_BY_CHANNEL\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/.exec(gameSessionSource)
  assert.ok(chatEventMap, "서버 채팅 송신 사건 표를 찾지 못했다")
  assert.deepEqual(
    [...chatEventMap[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]).sort(),
    ["day_chat_message_received", "dead_chat_message_received"],
    "서버 채팅 송신 사건이 바뀌었다",
  )

  const whereOf = (name) => resolved.filter((entry) => entry.name === name).map((entry) => entry.where)
  assert.ok(
    whereOf("player_joined_room").some((where) => where.startsWith("backend/socket/matchmaking.js")),
    "채널 방송 래퍼(emitToChannel) 호출 지점의 사건 이름이 더 이상 잡히지 않는다",
  )
  assert.ok(
    whereOf("night_turn_started").some((where) => where.startsWith("backend/socket/gameSession.js")),
    "밤 턴 래퍼(emitNightTurnEvent) 호출 지점의 사건 이름이 더 이상 잡히지 않는다",
  )
  assert.ok(
    whereOf("game_ended").some((where) => where.startsWith("backend/socket/gameSession.js")),
    "게임 방송 래퍼(emitToGameChannel) 호출 지점의 사건 이름이 더 이상 잡히지 않는다",
  )
  assert.ok(
    whereOf("friend_request_accepted")
      .some((where) => where.startsWith("backend/services/friend/notify.js")),
    "개인 전송 래퍼(emitFriendEventSafely) 호출 지점의 사건 이름이 더 이상 잡히지 않는다",
  )
  assert.ok(
    whereOf("notification_created").some((where) => where.startsWith("backend/services/")),
    "개인 전송기 별칭(emit = deps.emitToUser) 호출 지점의 사건 이름이 더 이상 잡히지 않는다",
  )
})

function stripComments(source) {
  return splitSourceIntoCodeAndComments(source).code
}

const EVENT_CONSTANT_TABLES = { SOCKET_EVENTS, ROOM_LIST_SOCKET_EVENTS, KICK_EVENTS }

const EVENT_REF_PATTERNS = [
  { kind: "emit", re: /\.(?:emit|emitWithAck)\(\s*([^,)]+)/g },
  { kind: "emit", re: /(?<![.\w$])(?<!function\s)emitWithAck\(\s*[A-Za-z_$][\w$]*\s*,\s*([^,)]+)/g },
  { kind: "on", re: /\.(?:on|off)\(\s*([^,)]+)/g },
]

function collectSocketEventRefs(sources) {
  const resolved = { emit: new Map(), on: new Map() }
  const unresolved = []
  for (const { file, source } of sources) {
    const body = stripComments(source)
    const lineOf = makeLineLookup(body)
    for (const { kind, re } of EVENT_REF_PATTERNS) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(body)) !== null) {
        const expr = normalizeExpr(match[1])
        const where = `${file}:${lineOf(match.index)}`
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
  }
  return { resolved, unresolved }
}

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

const ROUTE_WIRING_LOCK = {
  "/": { component: "LoginPage", from: "@/domains/auth/pages/LoginPage", guarded: false },
  "/login": { component: "LoginPage", from: "@/domains/auth/pages/LoginPage", guarded: false },
  "/find-id": { component: "FindIdPage", from: "@/domains/auth/pages/FindIdPage", guarded: false },
  "/password-reset/request": { component: "PasswordResetRequestPage", from: "@/domains/auth/pages/PasswordResetPage", guarded: false },
  "/password-reset": { component: "PasswordResetPage", from: "@/domains/auth/pages/PasswordResetPage", guarded: false },
  "/mypage": { component: "MyPage", from: "@/domains/user/pages/MyPage", guarded: true },
  "/mypage/emoticons": { component: "EmoticonPalettePage", from: "@/domains/user/pages/EmoticonPalettePage", guarded: true },
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
  "/podium": { component: "Navigate", from: "react-router-dom", guarded: true },
}

const ROUTER_NON_ELEMENT_IMPORTS = ["createBrowserRouter", "ViewportShell", "ProtectedRoute"]

test("F-23(SPLIT-1/AC-02): 실제 router.routes의 전체 경로·element·인증 경계가 잠긴다(다른 이름의 진입 화면도 없다)", async () => {
  const routerSource = stripComments(
    await (await import("node:fs/promises")).readFile(
      new URL("frontend/src/app/routes/index.jsx", REPO_ROOT), "utf8"),
  )

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
    assert.equal(live.lazy, false, `${path}가 lazy로 다른 화면을 끌어온다`)
    assert.equal(live.loader, false, `${path}에 loader가 붙었다`)
  }

  assert.deepEqual(
    [...importSourceOf.keys()].sort(),
    [...new Set([
      ...Object.values(ROUTE_WIRING_LOCK).map((entry) => entry.component),
      ...ROUTER_NON_ELEMENT_IMPORTS,
    ])].sort(),
    "라우터가 잠금 밖의 화면 모듈을 import한다",
  )

  const layouts = runtime.filter((entry) => entry.layout === true)
  assert.equal(layouts.length, 2, "레이아웃 라우트 수가 바뀌었다(ViewportShell·ProtectedRoute)")
  assert.equal(layouts.filter((entry) => entry.isGuard).length, 1, "인증 보호 레이아웃이 하나가 아니다")
  assert.deepEqual(runtimePaths.filter((entry) => entry.path.includes("*")), [], "catch-all 라우트가 있다")
})

test("F-23(SPLIT-1/AC-02): 비로그인 /ingame 직접 진입은 로그인으로 돌아가고 인게임 화면을 그리지 않는다", async () => {
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

const CLIENT_EMIT_EVENTS_LOCK = [
  "accept_game_invite", "acknowledge_night_action_success", "acknowledge_role_reveal",
  "cast_day_vote", "cast_tribunal_vote",
  "create_room", "delete_room", "get_current_room",
  "get_game_invite_result",
  "get_kick_result", "get_public_rooms",
  "get_room_settings_update_result", "get_session_snapshot", "join_matchmaking",
  "join_public_room", "join_room_by_code", "kick_game_player", "kick_room_player",
  "leave_game_session", "leave_matchmaking", "leave_room", "notifications_ready",
  "ready_for_day_vote", "resolve_day_vote", "resolve_night", "resolve_tribunal_vote",
  "send_emoji",
  "set_ready", "start_game", "submit_game_chat_message", "submit_joker_chat_message",
  "submit_night_action", "update_room_settings",
]

const CLIENT_SUBSCRIBE_EVENTS_LOCK = [
  "account_cache_invalidated", "achievement_granted", "connect", "connect_error",
  "day_phase_changed", "day_vote_resolved", "disconnect",
  "emoji_shown",
  "force_disconnect",
  "friend_relation_invalidated", "friend_request_accepted", "friend_request_declined",
  "friend_request_received", "friend_status_change", "game_ended", "game_invite_received",
  "game_invite_updated", "game_kicked", "game_phase_changed", "game_started", "host_changed",
  "joker_chat_message", "night_action_result", "night_action_success", "night_actions_resolved",
  "night_presentation_wait",
  "night_result_applied",
  "night_turn_ended", "night_turn_started", "notification_created", "player_eliminated",
  "player_joined_room", "player_left_room", "player_ready_changed", "public_rooms_updated",
  "room_deleted", "room_joined", "room_join_failed", "room_kicked", "room_settings_updated",
  "session_participation_changed", "session_self_progress", "tribunal_vote_resolved",
]

const INDIRECT_EVENT_SITES_LOCK = [
  "frontend/src/domains/game/ingame/utils/attachGameChatListener.js:35 on:eventName",
  "frontend/src/domains/game/ingame/utils/attachGameChatListener.js:36 on:eventName",
  "frontend/src/domains/lobby/hooks/useFriendSocketEvents.js:157 emit:event",
]

test("F-23(SPLIT-1/AC-02): 소켓 전송·구독 사건 목록이 잠긴다(다른 이름의 관전 입장·상태 연결도 없다)", async () => {
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
      "socket.emit(",
      '    "join_as_watcher_multiline",',
      "    { roomId },",
      ")",
      "socket.on(",
      '    "viewer_state_multiline",',
      "    handler,",
      ")",
      "socket.emit(",
      "    lateEventName,",
      "    {},",
      ")",
    ].join("\n"),
  }])
  assert.deepEqual([...probe.resolved.emit.keys()].sort(),
    ["join_as_watcher", "join_as_watcher_multiline", "kick_game_player", "kick_room_player"],
    "다른 이름의 전송 액션(여러 줄 호출 포함) 또는 상수 표 참조를 검출하지 못했다")
  assert.deepEqual([...probe.resolved.on.keys()].sort(),
    ["viewer_state_changed", "viewer_state_multiline"],
    "다른 이름의 구독 사건(여러 줄 호출 포함)을 검출하지 못했다")
  assert.deepEqual(probe.unresolved.map((entry) => `${entry.where} ${entry.kind}:${entry.expr}`),
    ["probe.js:3 emit:WATCH_EVENTS.ENTER", "probe.js:17 emit:lateEventName"],
    "모르는 상수 표 참조·여러 줄 간접 전송을 간접 지점으로 남기지 못했다")
  assert.deepEqual(probe.resolved.emit.get("join_as_watcher_multiline"), ["probe.js:9"])
  assert.deepEqual(probe.resolved.on.get("viewer_state_multiline"), ["probe.js:13"])

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

  const chatSessionSource = frontendSources.find(({ file }) =>
    file === "frontend/src/domains/game/ingame/hooks/useInGameGameChatSession.js").source
  const chatEventMap = /RECEIVE_EVENT_BY_CHANNEL\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/.exec(chatSessionSource)
  assert.ok(chatEventMap, "게임 채팅 수신 사건 표를 찾지 못했다")
  assert.deepEqual(
    [...chatEventMap[1].matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]).sort(),
    ["day_chat_message_received", "dead_chat_message_received"],
    "게임 채팅 수신기가 전달하는 사건이 바뀌었다",
  )
  for (const forwarded of ["accept_game_invite", "get_current_room"]) {
    assert.ok(
      resolved.emit.get(forwarded)?.some((where) =>
        where.startsWith("frontend/src/domains/lobby/hooks/useFriendSocketEvents.js")),
      `초대 경로가 ${forwarded}를 더 이상 전달하지 않는다(간접 지점의 근거가 사라졌다)`,
    )
  }

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
  assert.equal(live.countEmits("get_session_snapshot") > 0, true,
    "재접속 스냅샷 조회가 나가지 않았다(이 감사가 죽은 연결을 보고 있다)")
})

const PAGE_MOUNT_LOCK = [
  "InGameActionContext", "InGameActionProvider",
  "InGameBackground", "InGameChatShell", "InGameDeadParticipantChoice",
  "InGameNightPresentationWait",
  "InGameNightPrivateResultOverlay", "InGameNightSuccessPresentation",
  "InGameNightTurnAnnouncementOverlay", "InGamePhaseEntranceOverlay", "InGamePlayerBoard",
  "InGamePlayerSessionProvider", "InGameRoleRevealOverlay", "InGameTimebar",
  "InGameCornerActionPanel",
  "InGameTopControls", "InGameVoteStatusPanel", "PlayerRecordListPanel", "SettingPanel",
  "SettingKickPlayerModalContent",
]

const BOARD_MOUNT_LOCK = [
  "InGamePlayerCard", "InGamePlayerCardMenu", "InGameEmojiPalette", "InGameEmojiBubble",
]

const PLAY_AREA_MOUNT_LOCK = [
  "InGamePlayerSessionProvider", "InGameActionProvider", "InGameTimebar",
  "InGamePlayerBoard", "InGameChatShell",
]

const TIMEBAR_MOUNT_LOCK = [
  "PublicAsset", "TimebarNode", "InGamePhaseActionRow",
]

const INGAME_MOUNT_LOCK = [...new Set([
  ...PAGE_MOUNT_LOCK, ...BOARD_MOUNT_LOCK, ...PLAY_AREA_MOUNT_LOCK, ...TIMEBAR_MOUNT_LOCK,
])]

async function auditInGameActionProviderTree(pageSource) {
  const { default: ts } = await import("typescript")
  const sourceFile = ts.createSourceFile(
    "InGamePage.jsx", pageSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JSX,
  )

  const tagNameOf = (node) => {
    if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(sourceFile)
    if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(sourceFile)
    return null
  }
  const findElement = (root, name) => {
    let found = null
    const visit = (node) => {
      if (found) return
      if (tagNameOf(node) === name) { found = node; return }
      node.forEachChild(visit)
    }
    visit(root)
    return found
  }
  const collectTags = (root) => {
    const names = []
    const visit = (node) => {
      const tag = tagNameOf(node)
      if (tag) names.push(tag)
      node.forEachChild(visit)
    }
    root.forEachChild(visit)
    return names
  }

  let providerDeclaration = null
  sourceFile.forEachChild((node) => {
    if (!ts.isFunctionDeclaration(node)) return
    if (node.name?.text !== "InGameActionProvider") return
    providerDeclaration = node
  })

  const exported = providerDeclaration !== null
    && (ts.getModifiers(providerDeclaration) ?? [])
      .some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)

  const sessionProvider = findElement(sourceFile, "InGamePlayerSessionProvider")
  const actionProvider = sessionProvider ? findElement(sessionProvider, "InGameActionProvider") : null
  const wrapped = actionProvider ? collectTags(actionProvider) : []

  return {
    declared: providerDeclaration !== null,
    exported,
    callsActionHook: providerDeclaration !== null
      && /useInGameActionPanel\(/.test(providerDeclaration.getText(sourceFile)),
    providesContext: providerDeclaration !== null
      && collectTags(providerDeclaration).includes("InGameActionContext.Provider"),
    underSessionProvider: actionProvider !== null,
    wrapsTimebar: wrapped.includes("InGameTimebar"),
    wrapsPlayerBoard: wrapped.includes("InGamePlayerBoard"),
  }
}

const INGAME_STORE_DATA_KEYS = [
  "error", "gameId", "hostUuid",
  "nightPresentationWait",
  "nightPrivateResult", "nightSuccessQueue", "snapshotResultOwner",
  "snapshotSeq", "state",
]
const MATCHING_STORE_DATA_KEYS = [
  "accessType", "bootEpoch", "canStart", "hostUuid", "isInRoom", "isSearching", "players",
  "roomCode", "roomId", "roomInstanceId", "roomRevision", "settings", "settingsVersion",
]

function deepKeyPaths(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((item, index) => deepKeyPaths(item, `${path}[${index}]`))
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) => [`${path}.${key}`, ...deepKeyPaths(child, `${path}.${key}`)])
}

test("F-23(SPLIT-1/AC-02): 인게임 마운트 목록과 두 store 상태 모양이 잠긴다(관전 모달·상태가 다른 이름으로도 없다)", async () => {
  const { readFile } = await import("node:fs/promises")
  const pageSource = await readFile(
    new URL("frontend/src/domains/game/ingame/pages/InGamePage.jsx", REPO_ROOT), "utf8")

  const probe = collectRenderedComponents([
    'import WatchEntryModal from "./WatchEntryModal.jsx"',
    "{/* <HiddenOverlay /> 는 주석이다 */}",
    "export default () => <WatchEntryModal open />",
  ].join("\n"))
  assert.deepEqual(probe.rendered, ["WatchEntryModal"], "다른 이름의 모달 마운트를 검출하지 못했다")
  assert.deepEqual(probe.imported, ["WatchEntryModal"])

  const { rendered, imported } = collectRenderedComponents(pageSource)
  assert.deepEqual(rendered.sort(), [...PAGE_MOUNT_LOCK].sort(),
    "인게임 화면의 마운트 목록이 바뀌었다 — 새 오버레이·모달이 붙었거나 기존 화면이 사라졌다")
  const DECLARED_IN_PAGE = ["InGameActionProvider"]
  for (const name of rendered) {
    if (DECLARED_IN_PAGE.includes(name)) continue
    assert.ok(imported.includes(name), `${name}이 import 없이 마운트된다`)
  }
  assert.ok(rendered.includes("InGameDeadParticipantChoice"),
    "기존 사망 참가자의 계속 보기 선택창이 사라졌다")

  const boardSource = await readFile(
    new URL("frontend/src/domains/game/ingame/components/board/InGamePlayerBoard.jsx", REPO_ROOT), "utf8")
  const board = collectRenderedComponents(boardSource)
  assert.deepEqual(board.rendered.sort(), [...BOARD_MOUNT_LOCK].sort(),
    "플레이어 보드의 마운트 목록이 바뀌었다 — 카드 좌클릭 메뉴가 빠졌거나 다른 것이 붙었다")
  for (const name of board.rendered) {
    assert.ok(board.imported.includes(name), `보드가 ${name}을 import 없이 마운트한다`)
  }

  const playAreaSource = await readFile(
    new URL("frontend/src/domains/game/ingame/components/InGamePlayArea.jsx", REPO_ROOT), "utf8")
  const playArea = collectRenderedComponents(playAreaSource)
  assert.deepEqual(playArea.rendered.sort(), [...PLAY_AREA_MOUNT_LOCK].sort(),
    "진행 UI 묶음의 마운트 목록이 바뀌었다 — 조작 Provider가 빠지면 보드·패널의 컨텍스트가 null이 된다")
  for (const name of playArea.rendered) {
    assert.ok(playArea.imported.includes(name), `진행 UI 묶음이 ${name}을 import 없이 마운트한다`)
  }

  const timebarSource = await readFile(
    new URL("frontend/src/domains/game/ingame/components/timebar/InGameTimebar.jsx", REPO_ROOT), "utf8")
  const timebar = collectRenderedComponents(timebarSource)
  assert.deepEqual(timebar.rendered.sort(), [...TIMEBAR_MOUNT_LOCK].sort(),
    "시간흐름 바의 마운트 목록이 바뀌었다 — 단계 행동 줄이 빠졌거나 다른 것이 붙었다")
  assert.match(timebarSource, /function TimebarNode\b/,
    "TimebarNode 로컬 선언이 사라졌다(import로 바뀌었다면 이 잠금의 근거가 달라진다)")
  for (const name of timebar.rendered) {
    if (name === "TimebarNode") continue
    assert.ok(timebar.imported.includes(name), `시간흐름 바가 ${name}을 import 없이 마운트한다`)
  }

  const combined = [...new Set([
    ...rendered, ...board.rendered, ...playArea.rendered, ...timebar.rendered,
  ])]
  assert.deepEqual(combined.sort(), [...INGAME_MOUNT_LOCK].sort(),
    "인게임 네 소유 파일의 마운트 합집합이 잠금과 다르다")
  assert.ok(combined.includes("InGamePlayerCardMenu"),
    "플레이어 카드 좌클릭 메뉴가 인게임 마운트 목록에서 사라졌다")
  assert.ok(combined.includes("InGamePhaseActionRow"),
    "단계 행동 줄이 인게임 마운트 목록에서 사라졌다 — 제어 패널을 대체하는 유일한 자리다")

  const providerAudit = await auditInGameActionProviderTree(pageSource)
  assert.deepEqual(providerAudit, {
    declared: true,
    exported: true,
    callsActionHook: true,
    providesContext: true,
    underSessionProvider: true,
    wrapsTimebar: true,
    wrapsPlayerBoard: true,
  }, "조작 훅 Provider의 선언·export·컨텍스트 제공·세션 Provider 자손 포함 관계가 깨졌다")

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
  assert.deepEqual(ingameShape.actions, [
    "applyDayPhaseChanged", "applyDayVoteResolvedToPhase", "applyNightResultAppliedPayload",
    "applyNightTurnEnded", "applyNightTurnStarted", "applyParticipationChanged",
    "applyPhaseChanged", "applyPlayerEliminated", "applySelfProgress", "applySessionSnapshot",
    "applyTribunalResolved", "bootstrapSessionSnapshot", "clearGame", "clearNightPrivateResult",
    "completeNightSuccess",
    "invalidateUnconfirmedTerminalResult",
    "receiveNightPresentationWait",
    "receiveNightSuccess",
    "setGameError", "setGamePayload", "setNightPrivateResult",
  ], "인게임 store의 액션 목록이 바뀌었다")
  assert.deepEqual(matchingShape.actions, [
    "addPlayer", "applyRoomSettings", "clearRoom", "removePlayer", "setPlayerReady", "setRoom",
    "startSearch", "stopSearch", "updateHost",
  ], "대기방 store의 액션 목록이 바뀌었다")

  assert.deepEqual(
    deepKeyPaths({ room: { spectators: [{ watchOnly: true }] } })
      .filter((path) => SPECTATOR_NAME_VOCABULARY.test(path)),
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
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "DAY", dayIndex: 1,
      players: [{ uuid: SELF, alive: false }, { uuid: OTHER, alive: true }],
      victimUuid: SELF,
      deathReveals: [],
    })
  })
  await dismissParchmentOverlays(container)

  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === SELF).alive, false,
    "전제: 서버 사건으로 본인이 확정 사망해야 한다",
  )
  assert.ok(choicePanel(container), "확정 사망인데 선택이 뜨지 않았다")
  assert.ok(findButton(container, "관전 계속하기"), "관전 계속하기 버튼이 없다")
  assert.ok(findButton(container, "게임 나가기"), "게임 나가기 버튼이 없다")

  const emitsBefore = socket.emitted.length
  const roleBefore = useInGameStore.getState().state.self.role
  await act(async () => { findButton(container, "관전 계속하기").click() })

  assert.equal(socket.emitted.length, emitsBefore, "계속 보기가 서버 요청을 만들었다")
  assert.equal(choicePanel(container), null, "계속 보기 뒤에도 선택창이 남아 있다")
  const seated = useInGameStore.getState().state.players.find((p) => p.uuid === SELF)
  assert.equal(seated.membershipId, MY_MEMBERSHIP, "계속 보기로 소속이 바뀌었다")
  assert.equal(seated.isParticipating, true, "계속 보기로 참여 자격이 바뀌었다")
  assert.equal(useInGameStore.getState().state.self.role, roleBefore, "계속 보기가 역할을 바꿨다")
  assert.equal(useInGameStore.getState().state.self.uuid, SELF, "계속 보기가 신원을 바꿨다")

  const dayVoteOnlyControl = () =>
    container.querySelector('[data-ingame-phase-action="dayVoteAbstain"]')
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_DISCUSSION")
  assert.ok(findButton(container, "투표 시작 준비"), "전제: 토론 구간 화면이어야 한다")
  assert.equal(dayVoteOnlyControl(), null, "토론 구간인데 투표 구간 전용 컨트롤이 떠 있다")

  await act(async () => {
    socket.deliver("day_phase_changed", {
      gameId: GAME_ID, dayIndex: 1, dayPhase: "DAY_VOTE", round: 1,
    })
  })
  assert.equal(choicePanel(container), null, "공개 사건이 접힌 선택창을 되살렸다")
  assert.equal(
    useInGameStore.getState().state.dayPhase, "DAY_VOTE",
    "공개 진행 사건이 store의 낮 구간을 갱신하지 않았다",
  )
  await waitFor(() => assert.notEqual(
    dayVoteOnlyControl(), null,
    "공개 진행 사건이 화면에 반영되지 않았다",
  ))
  assert.equal(findButton(container, "투표 시작 준비"), null, "이전 구간 화면이 그대로 남아 있다")

  assert.ok(container.querySelector("button[aria-label='게임 나가기']"), "상단 나가기 버튼이 사라졌다")
})

test("F-25b(AC-02/AC-04): 치료가 성공한 밤의 결과를 받으면 사망 선택이 뜨지 않고 화면도 /ingame에 남는다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "DAY", dayIndex: 1,
      players: [{ uuid: SELF, alive: true }, { uuid: OTHER, alive: true }],
      victimUuid: null,
      deathReveals: [],
    })
  })
  await dismissParchmentOverlays(container)

  assert.equal(
    useInGameStore.getState().state.players.find((p) => p.uuid === SELF).alive, true,
    "치료가 성공했는데 canonical 사망으로 반영됐다",
  )
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null, "치료 성공 밤이 승패를 확정했다")
  assert.equal(choicePanel(container), null, "생존자에게 사망 선택이 떴다")
  assert.equal(router.state.location.pathname, "/ingame", "치료 성공 밤인데 화면을 떠났다")
})

test("F-25b(AC-04) 대조군: 같은 마지막 밤이 치료 없이 종결되면 결과 화면으로 넘어간다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 0 })
  await mountInGame()
  const socket = currentSocket
  assert.equal(router.state.location.pathname, "/ingame", "전제: 아직 진행 중이다")

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 0,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "JOKER" },
      deathReveals: [],
    })
  })

  assert.equal(useInGameStore.getState().state.phase, "ENDED")
  assert.deepEqual(useInGameStore.getState().state.winResult, { winner: "JOKER" })
  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "종결된 밤인데 결과 화면으로 넘어가지 못했다",
  ))
})

test("F-23(AC-06): 나가기 성공 ACK는 정확히 한 번 정리하고 로비로 replace 이동한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  assert.ok(choicePanel(container), "전제: 확정 사망 선택이 떠 있어야 한다")

  await act(async () => { findButton(container, "게임 나가기").click() })
  assert.equal(confirmCalls.length, 1, "확인 대화상자가 한 번 떠야 한다")
  assert.equal(socket.countEmits("leave_game_session"), 1)

  await act(async () => { container.querySelector("button[aria-label='게임 나가기']").click() })
  assert.equal(confirmCalls.length, 1, "pending 중에 확인 대화상자가 다시 떴다")
  assert.equal(socket.countEmits("leave_game_session"), 1, "pending 중 중복 전송이 일어났다")

  const pending = socket.takeAck("leave_game_session")
  await act(async () => { pending.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, null, "성공 ACK인데 인게임 store가 정리되지 않았다")
  assert.equal(useMatchingStore.getState().isInRoom, false)
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))

  await act(async () => { pending.ack({ ok: true }) })
  assert.equal(router.state.location.pathname, "/multiplay")
})

test("F-23(AC-06 보수): 언마운트 뒤 도착한 늦은 성공 ACK는 store를 정리하지도 이동하지도 않는다", async () => {
  seedLiveGame({ selfAlive: false })
  const view = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(view.container, "게임 나가기").click() })
  assert.equal(socket.countEmits("leave_game_session"), 1, "전제: 나가기 요청이 실제로 나가야 한다")
  const pending = socket.takeAck("leave_game_session")

  await act(async () => { view.unmount() })
  const pathAfterUnmount = router.state.location.pathname
  const stateBefore = useInGameStore.getState().state

  await act(async () => { pending.ack({ ok: true }) })

  assert.equal(useInGameStore.getState().gameId, GAME_ID, "언마운트 뒤 늦은 성공 ACK가 인게임 store를 정리했다")
  assert.equal(useInGameStore.getState().state, stateBefore, "언마운트 뒤 늦은 성공 ACK가 게임 상태를 바꿨다")
  assert.equal(myMembership(), MY_MEMBERSHIP, "언마운트 뒤 늦은 ACK가 내 소속을 지웠다")
  assert.equal(router.state.location.pathname, pathAfterUnmount,
    "언마운트 뒤 늦은 성공 ACK가 화면을 이동시켰다")

  await act(async () => { pending.ack({ ok: true }) })
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.equal(router.state.location.pathname, pathAfterUnmount)
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
  socket.takeAck("leave_game_session")

  await act(async () => { globalThis.__fireExitTimeouts() })

  assert.equal(router.state.location.pathname, "/ingame", "ACK 없음만으로 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.ok(choicePanel(container).textContent.includes("확인하지 못했습니다"), "미확정 안내가 없다")

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const firstCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { firstCheck.ack({ ok: false, code: "SESSION_NOT_FOUND" }) })
  assert.equal(router.state.location.pathname, "/ingame", "SESSION_NOT_FOUND를 성공으로 바꿨다")

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

  const panel = choicePanel(container)
  assert.ok(panel, "계속 보기 뒤라는 이유로 나가기 실패 안내가 통째로 사라졌다")
  assert.ok(panel.textContent.includes("실패"), "실패 안내 문구가 없다")
  assert.equal(router.state.location.pathname, "/ingame", "실패했는데 로비로 이동했다")
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패했는데 인게임 store가 정리됐다")

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

  assert.ok(socket.countEmits("get_session_snapshot") >= 1,
    "전제: 재접속 동기화가 배경에서 이미 한 번 조회한다")
  socket.takeAck("leave_game_session")

  await act(async () => { globalThis.__fireExitTimeouts() })

  const panel = choicePanel(container)
  assert.ok(panel, "계속 보기 뒤라는 이유로 미확정 안내가 사라졌다")
  assert.ok(panel.textContent.includes("확인하지 못했습니다"), "미확정 안내 문구가 없다")
  assert.equal(router.state.location.pathname, "/ingame", "ACK 없음만으로 로비로 이동했다")

  const resolve = findButton(container, "나가기 결과 확인")
  assert.ok(resolve, "결과 확인 수단이 열리지 않았다")
  assert.equal(resolve.closest("[inert]"), null, "결과 확인 버튼이 inert 영역 안에 있다")

  const emitsBeforeCheck = socket.countEmits("get_session_snapshot")
  await act(async () => { resolve.click() })
  assert.equal(socket.countEmits("get_session_snapshot"), emitsBeforeCheck + 1,
    "결과 확인이 새 조회를 보내지 않았다")
  const firstCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { firstCheck.ack({ ok: false, code: "INTERNAL_ERROR" }) })
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "INTERNAL_ERROR를 성공으로 바꿨다")
  assert.equal(router.state.location.pathname, "/ingame")

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const secondCheck = socket.takeAck("get_session_snapshot")
  await act(async () => { secondCheck.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))

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
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "안내를 접었더니 인게임 store가 정리됐다")
  assert.equal(router.state.location.pathname, "/ingame")
  assert.equal(myMembership(), MY_MEMBERSHIP, "안내를 접는 것이 소속을 바꿨다")

  await act(async () => { topExit.click() })
  assert.equal(socket.countEmits("leave_game_session"), 2, "접은 뒤 상단 나가기가 새 요청을 보내지 못했다")

  const second = socket.takeAck("leave_game_session")
  await act(async () => { second.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  const reopened = choicePanel(container)
  assert.ok(reopened, "새 시도의 실패 안내가 다시 뜨지 않았다(접은 선택이 새 시도까지 덮었다)")
  assert.ok(reopened.textContent.includes("실패"), "새 시도의 실패 문구가 없다")
  assert.ok(findButton(container, "다시 시도"), "새 시도의 복구 버튼이 없다")
})

test("F-23(SPLIT-2): 소속 A→B→A 직후(효과 실행 전) 도착한 옛 성공 ACK는 현재 판을 정리하지 못한다", async () => {
  seedLiveGame({ selfAlive: false })
  const { container } = await mountInGame()
  const socket = currentSocket

  await act(async () => { findButton(container, "게임 나가기").click() })
  assert.equal(socket.countEmits("leave_game_session"), 1, "전제: 요청이 나가야 한다")
  const stale = socket.takeAck("leave_game_session")

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

  await act(async () => { findButton(container, "나가기 결과 확인").click() })
  const check = socket.takeAck("get_session_snapshot")
  await act(async () => { check.ack({ ok: false, code: "FORFEITED_FROM_SESSION" }) })

  assert.equal(useInGameStore.getState().gameId, null, "권위 확인 뒤에도 정리되지 않았다")
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-23(SPLIT-1): 재연결 후 재결속이 끝나기 전에는 결과 화면으로 넘어가지 않는다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  assert.equal(router.state.location.pathname, "/ingame")

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
  assert.equal(
    router.state.location.pathname, "/ingame",
    "재결속이 끝나기 전에 잔존 ENDED로 결과 화면에 들어갔다",
  )

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

test("F-23(SPLIT-1): 재결속 스냅샷이 실패하면 잔존 ENDED로 결과 화면에 넘어가지 않고, 다음 정상 스냅샷에서 이동이 재개된다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "CITIZEN" },
      deathReveals: [],
    })
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  assert.equal(router.state.location.pathname, "/ingame")

  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.equal(router.state.location.pathname, "/ingame", "전제: 재결속 중에는 넘어가지 않는다")

  const failed = socket.takeAck("get_session_snapshot")
  assert.ok(failed, "전제: 재연결이 현재 신원의 스냅샷을 다시 물어야 한다")
  await act(async () => { failed.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.equal(
    router.state.location.pathname, "/ingame",
    "재결속 스냅샷이 실패했는데 잔존 ENDED로 결과 화면에 들어갔다",
  )
  await act(async () => { await Promise.resolve() })
  assert.equal(router.state.location.pathname, "/ingame", "뒤이은 렌더에서 결과 화면으로 넘어갔다")
  assert.equal(
    useInGameStore.getState().state.winResult ?? null, null,
    "이전 연결의 잔존 종료 결과가 확인 없이 이동 근거로 남았다",
  )
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패가 세션 자체를 지웠다")

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

test("F-23(SPLIT-1): 재연결 뒤 현재 연결에서 받은 정상 종료는 재결속 스냅샷이 실패해도 결과 화면으로 이어진다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.id = "sock-2"
    socket.deliver("connect")
  })
  assert.equal(router.state.location.pathname, "/ingame", "전제: 아직 종료가 아니다")
  const pending = socket.takeAck("get_session_snapshot")
  assert.ok(pending, "전제: 재연결이 현재 신원의 스냅샷을 다시 물어야 한다")

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: true }],
      victimUuid: null,
      winResult: { winner: "CITIZEN" },
      deathReveals: [],
    })
  })
  assert.equal(
    useInGameStore.getState().state.phase, "ENDED",
    "전제: 이 연결의 정상 공개 종료가 실제로 반영돼야 한다",
  )
  assert.equal(
    router.state.location.pathname, "/ingame",
    "전제: 재결속이 끝나기 전에는 아직 기다린다",
  )

  await act(async () => { pending.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.ok(
    useInGameStore.getState().state.winResult,
    "현재 연결에서 직접 받은 정상 종료 결과가 스냅샷 실패로 지워졌다",
  )
  await waitFor(() => assert.notEqual(
    router.state.location.pathname, "/ingame",
    "현재 연결이 받은 정상 종료인데도 결과 화면으로 넘어가지 못했다",
  ))
})

test("F-23(SPLIT-1): 인증 A→B→A 왕복 뒤 스냅샷이 실패하면 이전 계정의 종료 결과로 결과 화면에 넘어가지 않는다", async () => {
  seedLiveGame({ selfAlive: true, phase: "NIGHT", dayIndex: 1 })
  await mountInGame()
  const socket = currentSocket

  await act(async () => {
    socket.deliver("night_result_applied", {
      gameId: GAME_ID, phase: "ENDED", dayIndex: 1,
      players: [{ uuid: SELF, isAlive: true }, { uuid: OTHER, isAlive: false }],
      victimUuid: OTHER,
      winResult: { winner: "CITIZEN" },
      deathReveals: [{ victimUuid: OTHER, source: "JOKER" }],
    })
    useAuthStore.setState((s) => ({
      user: { uuid: OTHER }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    useAuthStore.setState((s) => ({
      user: { uuid: SELF, nickname: "나" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
  })
  assert.equal(useInGameStore.getState().state.phase, "ENDED", "전제: 종료가 반영돼야 한다")
  assert.equal(router.state.location.pathname, "/ingame", "전제: 확인 전에는 넘어가지 않는다")

  assert.equal(myMembership(), MY_MEMBERSHIP, "전제: 소속은 그대로다")
  assert.equal(socket.id, "sock-1", "전제: 연결은 교체되지 않는다")
  assert.equal(
    router.state.location.pathname, "/ingame",
    "인증 왕복 직후의 렌더에서 이전 계정의 종료 결과로 결과 화면에 들어갔다",
  )

  const failed = socket.takeAck("get_session_snapshot")
  assert.ok(failed, "전제: 인증 왕복이 현재 신원의 스냅샷을 다시 물어야 한다")
  await act(async () => { failed.ack({ ok: false, code: "INTERNAL_ERROR" }) })

  assert.equal(
    router.state.location.pathname, "/ingame",
    "인증이 왕복하고 스냅샷도 실패했는데 이전 계정의 종료 결과로 결과 화면에 들어갔다",
  )
  await act(async () => { await Promise.resolve() })
  assert.equal(router.state.location.pathname, "/ingame", "뒤이은 렌더에서 결과 화면으로 넘어갔다")
  assert.equal(
    useInGameStore.getState().state.winResult, null,
    "확인하지 못한 이전 계정의 종료 결과가 이동 근거로 그대로 남았다",
  )
  assert.equal(useInGameStore.getState().gameId, GAME_ID, "실패가 세션 자체를 지웠다")

  await act(async () => {
    socket.id = "sock-2"
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
