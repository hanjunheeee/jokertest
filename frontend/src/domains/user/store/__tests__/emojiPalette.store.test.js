import assert from "node:assert/strict"
import test, { mock } from "node:test"

// F-33 E-2(설계도 §2-2) — emojiPalette.store.js의 경계 세 가지를 본다.
//   (1) 신원 전이(identityGeneration) 중에 도착한 지연 응답을 버린다.
//   (2) load()의 거부를 스스로 잡아 처리되지 않은 rejection을 만들지 않는다.
//   (3) 409 REVISION_MISMATCH가 오면 서버의 현재 값으로 편집 상태까지 재조정한다.
//
// 대역으로 바꾸는 것은 **바깥 경계뿐**이다 — 전역 fetch와 API 주소(env.js), 그리고
// 신원(auth store). emojiPalette.api.js·shared/api/client.js·shared/api/response.js는
// 실제 구현을 그대로 태운다: 409의 revision·slots는 response.js의 toApiError가 Error에
// 실어야만 store까지 도달하므로, api 모듈을 대역으로 바꾸면 그 연결이 시험에서 사라진다.
//
// 신원만 대역인 이유: auth.store.js는 persist(localStorage)를 쓰는 진짜 브라우저 store라
// 이 시험이 보려는 것(전이 횟수 비교)보다 훨씬 많은 것을 끌고 온다. 대신 실제 zustand
// store처럼 subscribe(listener)가 (state, prevState)로 불리는 계약은 그대로 흉내 낸다 —
// store가 모듈 로드 시점에 거는 구독이 실제로 동작해야 계정 격리 결함이 드러난다.

let authState = { user: { uuid: "user-1" }, identityGeneration: 1 }
const authListeners = new Set()

const patchAuthState = (patch) => {
  const previous = authState
  authState = { ...authState, ...patch }
  for (const listener of authListeners) listener(authState, previous)
}

mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "", DISCORD_SUPPORT_URL: undefined },
})

mock.module("../../../auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => authState,
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

// ── 서버(fetch) 경계 ────────────────────────────────────────────────────────────
const json = (status, body) => {
  const response = { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } }
  response.clone = () => response
  return response
}

let handleRequest = async () => { throw new Error("fetch handler stub not set") }
let calls = []
Object.defineProperty(globalThis, "fetch", {
  value: async (url, options = {}) => {
    const method = options.method ?? "GET"
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ method, url, body })
    return await handleRequest({ method, url, body })
  },
  configurable: true,
  writable: true,
})

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// 처리되지 않은 rejection은 node:test가 스위트 전체를 실패시키지만, "어느 케이스에서"
// 생겼는지는 남지 않는다 — 케이스 단위로 직접 확인할 수 있게 모아 둔다.
const unhandled = []
process.on("unhandledRejection", (reason) => { unhandled.push(reason) })
const flushMicrotasks = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve() }

const { useEmojiPaletteStore } = await import("../emojiPalette.store.js")

const DEFAULT_SLOTS = [
  "emoji-basic-reject", "emoji-basic-tears", "emoji-basic-anger", "emoji-basic-love",
  "emoji-basic-grin", "emoji-basic-hello", "emoji-basic-surrender", "emoji-basic-dizzy",
]
const EMPTY_SLOTS = [null, null, null, null, null, null, null, null]

const resetWorld = () => {
  calls = []
  unhandled.length = 0
  handleRequest = async () => { throw new Error("fetch handler stub not set") }
  authState = { user: { uuid: "user-1" }, identityGeneration: 1 }
  useEmojiPaletteStore.getState().reset()
}

/** 정상 GET 하나로 store를 ready 상태까지 올린다. */
const loadReady = async ({ slots = DEFAULT_SLOTS, revision = "r1", owned = DEFAULT_SLOTS } = {}) => {
  handleRequest = async ({ method }) => {
    if (method === "GET") return json(200, { ok: true, slots, revision, owned })
    throw new Error(`unexpected ${method}`)
  }
  const result = await useEmojiPaletteStore.getState().load()
  assert.equal(result.ok, true)
}

// ---------------------------------------------------------------------------

test("load: 성공하면 서버 값이 slots·revision·owned와 편집 상태(selectedSlots)에 함께 채워진다", async () => {
  resetWorld()
  await loadReady()

  const state = useEmojiPaletteStore.getState()
  assert.equal(state.status, "ready")
  assert.deepEqual(state.slots, DEFAULT_SLOTS)
  assert.deepEqual(state.selectedSlots, DEFAULT_SLOTS)
  assert.equal(state.revision, "r1")
  assert.deepEqual(state.owned, DEFAULT_SLOTS)
  assert.equal(state.conflict, null)
})

test("계정 전환(uuid는 그대로, identityGeneration만 증가)이 일어나면 reset되고 requestGeneration이 오른다", async () => {
  resetWorld()
  const before = useEmojiPaletteStore.getState().requestGeneration

  // uuid를 바꾸지 않는다 — economy.store처럼 uuid만 비교하면 이 전이를 놓친다.
  patchAuthState({ identityGeneration: authState.identityGeneration + 1 })

  const state = useEmojiPaletteStore.getState()
  assert.equal(state.requestGeneration, before + 1, "전이마다 진행 중인 요청을 무효화해야 한다")
  assert.equal(state.user, undefined)
  assert.equal(state.status, "idle")
})

test("신원 전이 도중 뒤늦게 도착한 이전 계정의 GET 응답은 store에 반영되지 않는다", async () => {
  resetWorld()
  const deferred = createDeferred()
  handleRequest = async () => await deferred.promise

  const pending = useEmojiPaletteStore.getState().load()
  assert.equal(useEmojiPaletteStore.getState().status, "loading")

  // 응답이 오기 전에 같은 uuid로 다시 로그인한 것과 같은 전이가 일어난다.
  const generationBefore = useEmojiPaletteStore.getState().requestGeneration
  patchAuthState({ identityGeneration: authState.identityGeneration + 1 })
  assert.equal(useEmojiPaletteStore.getState().requestGeneration, generationBefore + 1)

  // 이제서야 이전 신원의 응답이 도착한다.
  deferred.resolve(json(200, { ok: true, slots: DEFAULT_SLOTS, revision: "r1", owned: DEFAULT_SLOTS }))
  const result = await pending
  assert.deepEqual(result, { ok: false, stale: true })

  const state = useEmojiPaletteStore.getState()
  assert.deepEqual(state.slots, EMPTY_SLOTS, "이전 신원의 팔레트가 새 화면에 채워지면 안 된다")
  assert.deepEqual(state.selectedSlots, EMPTY_SLOTS)
  assert.deepEqual(state.owned, [])
  assert.equal(state.revision, null)
  assert.equal(state.status, "idle", "reset 이후의 초기값이 그대로 남아야 한다")
})

test("load가 거부되면 처리되지 않은 rejection 없이 status='error'가 되고, 다시 부르면 상태가 다시 전이된다", async () => {
  resetWorld()
  handleRequest = async () => { throw new TypeError("network down") }

  const failed = await useEmojiPaletteStore.getState().load()
  assert.equal(failed.ok, false)
  assert.equal(useEmojiPaletteStore.getState().status, "error")
  assert.ok(useEmojiPaletteStore.getState().error instanceof Error)

  await flushMicrotasks()
  assert.deepEqual(unhandled, [], "load()는 거부를 스스로 잡아야 한다")

  // 재시도가 실제로 상태를 다시 전이시킨다(error → loading → ready).
  await loadReady({ revision: "r9" })
  assert.equal(useEmojiPaletteStore.getState().status, "ready")
  assert.equal(useEmojiPaletteStore.getState().revision, "r9")
  assert.equal(useEmojiPaletteStore.getState().error, null)
})

test("save: 성공하면 서버가 돌려준 slots·revision이 서버 값과 편집 값 양쪽에 반영된다", async () => {
  resetWorld()
  await loadReady()

  useEmojiPaletteStore.getState().selectSlot(2)
  useEmojiPaletteStore.getState().assignItem("emoji-basic-dizzy")
  const sent = useEmojiPaletteStore.getState().selectedSlots

  handleRequest = async ({ method, body }) => {
    if (method !== "PUT") throw new Error(`unexpected ${method}`)
    return json(200, { ok: true, slots: body.slots, revision: "r2" })
  }
  const result = await useEmojiPaletteStore.getState().save()

  assert.equal(result.ok, true)
  const put = calls.filter((call) => call.method === "PUT")
  assert.equal(put.length, 1)
  assert.deepEqual(Object.keys(put[0].body).sort(), ["expectedRevision", "slots"], "허용 필드 둘만 보낸다")
  assert.deepEqual(put[0].body.slots, sent)
  assert.equal(put[0].body.expectedRevision, "r1")

  const state = useEmojiPaletteStore.getState()
  assert.deepEqual(state.slots, sent)
  assert.deepEqual(state.selectedSlots, sent)
  assert.equal(state.revision, "r2")
  assert.equal(state.conflict, null)
})

test("assignItem: 이미 다른 칸에 있는 이모티콘을 넣으면 두 칸이 자리를 바꿔 중복이 생기지 않는다", async () => {
  resetWorld()
  await loadReady()

  useEmojiPaletteStore.getState().selectSlot(0)
  useEmojiPaletteStore.getState().assignItem("emoji-basic-anger") // 원래 2번 칸에 있다

  const slots = useEmojiPaletteStore.getState().selectedSlots
  assert.equal(slots[0], "emoji-basic-anger")
  assert.equal(slots[2], "emoji-basic-reject", "덮어쓰기가 아니라 자리 바꿈이라야 중복이 생기지 않는다")
  assert.equal(new Set(slots.filter((value) => value !== null)).size, slots.filter((value) => value !== null).length)
})

test("cancel: 편집을 버리고 서버에서 마지막으로 읽은 값으로 되돌린다", async () => {
  resetWorld()
  await loadReady()

  useEmojiPaletteStore.getState().selectSlot(1)
  useEmojiPaletteStore.getState().assignItem("emoji-startled")
  assert.notDeepEqual(useEmojiPaletteStore.getState().selectedSlots, DEFAULT_SLOTS)

  useEmojiPaletteStore.getState().cancel()
  assert.deepEqual(useEmojiPaletteStore.getState().selectedSlots, DEFAULT_SLOTS)
})

test("save: 실제 apiClient→toApiError 경로로 온 409 REVISION_MISMATCH가 서버의 현재 값으로 편집 상태까지 재조정한다", async () => {
  resetWorld()
  await loadReady()

  useEmojiPaletteStore.getState().selectSlot(0)
  useEmojiPaletteStore.getState().assignItem("emoji-startled")

  const serverSlots = [...DEFAULT_SLOTS].reverse()
  handleRequest = async ({ method }) => {
    if (method !== "PUT") throw new Error(`unexpected ${method}`)
    // shared/api/response.js의 handleErrorResponse → toApiError를 실제로 지난다.
    return json(409, { ok: false, code: "REVISION_MISMATCH", message: "충돌", revision: "r2", slots: serverSlots })
  }

  const result = await useEmojiPaletteStore.getState().save()

  assert.equal(result.ok, false)
  assert.equal(result.code, "REVISION_MISMATCH")
  assert.equal(result.status, 409)
  assert.equal(result.revision, "r2")
  assert.deepEqual(result.slots, serverSlots)

  const state = useEmojiPaletteStore.getState()
  assert.deepEqual(state.slots, serverSlots)
  assert.deepEqual(state.selectedSlots, serverSlots, "충돌 뒤에는 편집 값도 서버의 현재 값이어야 한다")
  assert.equal(state.revision, "r2")
  assert.deepEqual(state.conflict, { revision: "r2", slots: serverSlots })
})

test("save: revision을 동봉하지 않는 실패(NOT_OWNED)는 상태를 전혀 바꾸지 않고 코드만 돌려준다", async () => {
  resetWorld()
  await loadReady()

  handleRequest = async () => json(400, { ok: false, code: "NOT_OWNED", message: "미소유" })
  const result = await useEmojiPaletteStore.getState().save()

  assert.deepEqual(result, { ok: false, code: "NOT_OWNED", status: 400 })
  const state = useEmojiPaletteStore.getState()
  assert.deepEqual(state.slots, DEFAULT_SLOTS)
  assert.deepEqual(state.selectedSlots, DEFAULT_SLOTS)
  assert.equal(state.revision, "r1")
  assert.equal(state.conflict, null)
})

test("save: 아직 불러오지 못한 상태에서는 요청을 보내지 않고 NOT_READY를 돌려준다", async () => {
  resetWorld()

  const result = await useEmojiPaletteStore.getState().save()

  assert.deepEqual(result, { ok: false, code: "NOT_READY" })
  assert.deepEqual(calls, [], "서버에 아무 요청도 보내지 않아야 한다")
})

// ═══════════════════════════════════════════════════════════════════════════
// E-3(F-33 AC-03): 인게임 팔레트 스냅샷(loadForGame)
//
// 이 절이 답하는 것은 **수명**이다. 편집 상태(위 시험들)와 달리 이 사본은 한 판에 고정되어야
// 하고, 그 판이 이어지는 동안에는 어떤 이유로도 다시 읽히거나 마이페이지 저장에 흔들려서는
// 안 된다. 반대로 계정·판·참여가 실제로 달라지면 즉시 버려져야 한다.
//
// 인게임 상태는 useInGameStore.setState로 직접 세운다 — 여기서 검증하는 것은 캐시 키 판정이라,
// roster에 내 행이 없거나 참여가 끝난 것 같은 **경계 모양**을 그대로 만들 수 있어야 한다
// (정상 경로 seed는 InGameEmojiPalette.test.js가 실제 setGamePayload로 덮는다).
// ═══════════════════════════════════════════════════════════════════════════

const { useInGameStore } = await import("../../../game/ingame/store/ingameStore.js")

const GAME_SLOTS = ["emoji-basic-hello", null, null, null, null, null, null, null]
const NEXT_SLOTS = ["emoji-basic-love", null, null, null, null, null, null, null]

const getCallCount = () => calls.filter((call) => call.method === "GET").length

/** authState.user.uuid를 본인으로 갖는 진행 중 판. 필요한 축만 덮어쓴다. */
const inGameState = ({
  gameId = "game-1", phase = "DAY", selfUuid = "user-1",
  players = [{ uuid: "user-1", isParticipating: true, alive: true }],
} = {}) => ({
  id: gameId,
  phase,
  dayIndex: 1,
  players,
  self: { uuid: selfUuid, role: "CITIZEN", team: "CITIZEN" },
})

const seedGame = (options = {}) => {
  useInGameStore.setState({ gameId: options.gameId ?? "game-1", state: inGameState(options) })
}

const resetGameWorld = () => {
  useInGameStore.setState({ gameId: null, state: null })
  resetWorld()
}

const respondGet = (slots) => {
  handleRequest = async ({ method }) => {
    if (method === "GET") return json(200, { ok: true, slots, revision: "r1", owned: slots.filter(Boolean) })
    throw new Error(`unexpected ${method}`)
  }
}

test("loadForGame: 같은 scope를 여러 번 불러도 GET은 1회다(진행 중 Promise와 완료 사본을 공유한다)", async () => {
  resetGameWorld()
  seedGame()
  const deferred = createDeferred()
  handleRequest = async () => await deferred.promise

  const scope = { accountId: "user-1", identityGeneration: 1, gameId: "game-1" }
  // StrictMode의 이중 effect처럼 같은 틱에 두 번 들어온다.
  const first = useEmojiPaletteStore.getState().loadForGame(scope)
  const second = useEmojiPaletteStore.getState().loadForGame(scope)
  assert.equal(getCallCount(), 1, "같은 scope의 두 번째 호출이 GET을 더 냈다")

  deferred.resolve(json(200, { ok: true, slots: GAME_SLOTS, revision: "r1", owned: ["emoji-basic-hello"] }))
  // 두 호출은 **같은 조회 하나**의 결과를 받는다(loadForGame은 async 함수라 반환 Promise 객체
  // 자체는 호출마다 새로 감싸지므로, 공유를 참조 동일성이 아니라 결과와 호출 횟수로 본다).
  assert.deepEqual((await first).slots, GAME_SLOTS)
  assert.deepEqual((await second).slots, GAME_SLOTS)
  assert.equal(getCallCount(), 1, "두 번째 호출이 별도 조회를 만들었다")
  await flushMicrotasks()

  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS)

  // 완료 뒤의 재호출(보드 재마운트)도 사본을 그대로 쓴다.
  const cached = await useEmojiPaletteStore.getState().loadForGame(scope)
  assert.equal(cached.cached, true)
  assert.equal(getCallCount(), 1, "완료된 사본이 있는데 GET을 다시 냈다")
  assert.deepEqual(unhandled, [])
})

test("loadForGame: 다음 판(gameId 변경)에서는 이전 사본을 버리고 한 번 더 읽는다", async () => {
  resetGameWorld()
  seedGame()
  respondGet(GAME_SLOTS)
  await useEmojiPaletteStore.getState().loadForGame()
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS)
  assert.equal(getCallCount(), 1)

  respondGet(NEXT_SLOTS)
  seedGame({ gameId: "game-2" })
  // 판이 바뀐 것만으로 이전 사본은 즉시 버려진다(다음 요청은 보드가 낸다).
  assert.equal(useEmojiPaletteStore.getState().gameScopeKey, null)
  assert.equal(useEmojiPaletteStore.getState().gameSlots, null)

  await useEmojiPaletteStore.getState().loadForGame()
  assert.equal(getCallCount(), 2, "다음 판에서 팔레트를 다시 읽지 않았다")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, NEXT_SLOTS)
})

test("loadForGame: 마이페이지 load/save는 이 판의 사본을 건드리지 않는다(반대도 같다)", async () => {
  resetGameWorld()
  seedGame()
  respondGet(GAME_SLOTS)
  await useEmojiPaletteStore.getState().loadForGame()

  await loadReady() // 마이페이지 진입 — slots/selectedSlots를 서버 기본 8종으로 채운다
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS,
    "마이페이지 조회가 진행 중인 판의 사본을 덮었다")

  useEmojiPaletteStore.getState().selectSlot(0)
  useEmojiPaletteStore.getState().assignItem("emoji-basic-dizzy")
  handleRequest = async ({ method }) => {
    if (method === "PUT") return json(200, { ok: true, slots: NEXT_SLOTS, revision: "r2" })
    throw new Error(`unexpected ${method}`)
  }
  assert.equal((await useEmojiPaletteStore.getState().save()).ok, true)

  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS,
    "마이페이지 저장이 진행 중인 판의 사본을 바꿨다")
  assert.deepEqual(useEmojiPaletteStore.getState().slots, NEXT_SLOTS, "전제: 마이페이지 값은 갱신돼야 한다")
})

test("loadForGame: 신원 전이(identityGeneration)는 사본과 진행 중 요청을 함께 버린다", async () => {
  resetGameWorld()
  seedGame()
  const deferred = createDeferred()
  handleRequest = async () => await deferred.promise

  const pending = useEmojiPaletteStore.getState().loadForGame()
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "loading")

  patchAuthState({ identityGeneration: authState.identityGeneration + 1 })
  assert.equal(useEmojiPaletteStore.getState().gameScopeKey, null, "신원 전이 뒤에도 사본 키가 남았다")

  deferred.resolve(json(200, { ok: true, slots: GAME_SLOTS, revision: "r1", owned: [] }))
  assert.deepEqual(await pending, { ok: false, stale: true })
  await flushMicrotasks()

  assert.equal(useEmojiPaletteStore.getState().gameSlots, null,
    "전이 도중 날아간 응답이 새 신원의 사본으로 들어갔다")
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "idle")
  assert.deepEqual(unhandled, [])
})

test("loadForGame: 판이 끝나거나(ENDED) 내가 빠지면 사본을 버린다", async () => {
  for (const [label, patch] of [
    ["종료", { phase: "ENDED" }],
    ["참여 종료", { players: [{ uuid: "user-1", isParticipating: false, alive: true }] }],
    ["roster에 내 행 없음", { players: [{ uuid: "user-2", isParticipating: true, alive: true }] }],
    ["소유권 불일치", { selfUuid: "user-2", players: [{ uuid: "user-1", isParticipating: true, alive: true }] }],
  ]) {
    resetGameWorld()
    seedGame()
    respondGet(GAME_SLOTS)
    // eslint-disable-next-line no-await-in-loop
    await useEmojiPaletteStore.getState().loadForGame()
    assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready", `전제(${label}): 먼저 사본이 있어야 한다`)

    seedGame(patch)
    assert.equal(useEmojiPaletteStore.getState().gameScopeKey, null, `${label} 뒤에도 사본 키가 남았다`)
    assert.equal(useEmojiPaletteStore.getState().gameSlots, null, `${label} 뒤에도 사본이 남았다`)
  }
})

test("loadForGame: 사망(alive=false)만으로는 사본을 버리지 않는다", async () => {
  resetGameWorld()
  seedGame()
  respondGet(GAME_SLOTS)
  await useEmojiPaletteStore.getState().loadForGame()

  seedGame({ players: [{ uuid: "user-1", isParticipating: true, alive: false }] })

  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready", "사망이 사본을 버렸다")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS)
  assert.equal(getCallCount(), 1, "사망이 재조회를 만들었다")
})

test("loadForGame: 유효한 판이 없으면 아무 요청도 보내지 않는다", async () => {
  resetGameWorld()
  // 판 자체가 없다.
  assert.deepEqual(await useEmojiPaletteStore.getState().loadForGame(), { ok: false, code: "NO_GAME_SCOPE" })
  // 판은 있으나 내 것이 아니다.
  seedGame({ selfUuid: "user-2", players: [{ uuid: "user-1", isParticipating: true, alive: true }] })
  assert.deepEqual(await useEmojiPaletteStore.getState().loadForGame(), { ok: false, code: "NO_GAME_SCOPE" })
  assert.equal(getCallCount(), 0, "유효한 판이 없는데 서버를 읽었다")
  assert.equal(useEmojiPaletteStore.getState().gameSlots, null)
})

test("loadForGame: 호출부가 넘긴 scope가 지금의 판과 다르면 읽지 않는다(늦은 effect)", async () => {
  resetGameWorld()
  seedGame({ gameId: "game-2" })
  respondGet(GAME_SLOTS)

  const staleScope = { accountId: "user-1", identityGeneration: 1, gameId: "game-1" }
  assert.deepEqual(await useEmojiPaletteStore.getState().loadForGame(staleScope), { ok: false, stale: true })
  assert.equal(getCallCount(), 0, "지나간 scope의 요청이 서버까지 나갔다")
})

test("loadForGame: 조회가 거부되면 처리되지 않은 rejection 없이 gameStatus='error'가 된다", async () => {
  resetGameWorld()
  seedGame()
  handleRequest = async () => { throw new TypeError("network down") }

  const result = await useEmojiPaletteStore.getState().loadForGame()
  assert.equal(result.ok, false)
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "error")
  assert.equal(useEmojiPaletteStore.getState().gameSlots, null)

  await flushMicrotasks()
  assert.deepEqual(unhandled, [], "loadForGame()은 거부를 스스로 잡아야 한다")

  // 실패 뒤의 재시도는 실제로 다시 나간다(같은 판에서 영구히 막히지 않는다).
  respondGet(GAME_SLOTS)
  await useEmojiPaletteStore.getState().loadForGame()
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS)
})

// ── 폐기 후 **같은 키로** 재진입 ──────────────────────────────────────────────
//
// 키만 비교하면 폐기된 요청이 자기가 최신인 줄 안다: 무효화 뒤 같은 판으로 다시 들어오면
// 캐시 키도 gameScopeKey도 폐기 전과 **글자 그대로 같기** 때문이다. 그 상태에서 옛 응답이
// 도착하면 (a) 새 요청의 슬롯·상태를 덮고, (b) finally가 키가 같다는 이유로 새 요청의 pending
// 토큰까지 지워 중복 방지가 풀린다. 아래 두 시험은 resolve 경로와 reject 경로를 각각 본다.

/** GET 응답을 호출 순서대로 시험이 쥐고 있게 한다(같은 키의 두 요청을 따로 풀기 위해). */
const queueGets = (...deferreds) => {
  let index = 0
  handleRequest = async ({ method }) => {
    if (method !== "GET") throw new Error(`unexpected ${method}`)
    const deferred = deferreds[index]
    index += 1
    if (!deferred) throw new Error(`예상하지 않은 ${index}번째 GET`)
    return await deferred.promise
  }
}

test("loadForGame: 폐기 뒤 같은 키로 다시 시작하면, 앞 요청의 응답이 새 사본·pending을 바꾸지 못한다", async () => {
  resetGameWorld()
  seedGame()
  const first = createDeferred()
  const second = createDeferred()
  queueGets(first, second)

  const stalePending = useEmojiPaletteStore.getState().loadForGame()
  assert.equal(getCallCount(), 1)

  // 같은 판을 유지한 채 사본만 폐기한다 — 키는 폐기 전과 완전히 같은 값으로 되돌아온다.
  useEmojiPaletteStore.getState().resetGamePalette()
  assert.equal(useEmojiPaletteStore.getState().gameScopeKey, null)

  const livePending = useEmojiPaletteStore.getState().loadForGame()
  assert.equal(getCallCount(), 2, "폐기 뒤 재진입이 새 조회를 내지 않았다")
  const liveKey = useEmojiPaletteStore.getState().gameScopeKey
  assert.ok(liveKey, "재진입한 요청이 캐시 키를 세우지 않았다")

  // 폐기된 앞 요청이 **뒤늦게** 성공한다.
  first.resolve(json(200, { ok: true, slots: NEXT_SLOTS, revision: "r-old", owned: [] }))
  assert.deepEqual(await stalePending, { ok: false, stale: true },
    "폐기된 요청이 자기 응답을 유효한 것으로 보고했다")
  await flushMicrotasks()

  assert.equal(useEmojiPaletteStore.getState().gameSlots, null,
    "폐기된 요청의 응답이 새 요청의 사본 자리에 들어갔다")
  assert.equal(useEmojiPaletteStore.getState().gameStatus, "loading",
    "폐기된 요청이 진행 중인 새 요청의 상태를 끝난 것으로 바꿨다")
  assert.equal(useEmojiPaletteStore.getState().gameScopeKey, liveKey)

  // 앞 요청의 finally가 새 요청의 pending 토큰을 지웠다면 여기서 세 번째 GET이 나간다.
  const rejoin = useEmojiPaletteStore.getState().loadForGame()
  assert.equal(getCallCount(), 2, "폐기된 요청의 정리가 새 요청의 중복 방지를 풀었다")

  second.resolve(json(200, { ok: true, slots: GAME_SLOTS, revision: "r-new", owned: [] }))
  assert.deepEqual((await livePending).slots, GAME_SLOTS)
  assert.deepEqual((await rejoin).slots, GAME_SLOTS, "합쳐진 호출이 새 요청의 결과를 받지 못했다")
  await flushMicrotasks()

  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS,
    "새 요청의 응답이 최종 사본이 되어야 한다")
  assert.equal(getCallCount(), 2)
  assert.deepEqual(unhandled, [])
})

test("loadForGame: 폐기된 앞 요청이 거부돼도 새 요청의 상태·중복 방지는 그대로다", async () => {
  resetGameWorld()
  seedGame()
  const first = createDeferred()
  const second = createDeferred()
  queueGets(first, second)

  const stalePending = useEmojiPaletteStore.getState().loadForGame()
  useEmojiPaletteStore.getState().resetGamePalette()
  const livePending = useEmojiPaletteStore.getState().loadForGame()
  assert.equal(getCallCount(), 2)

  first.reject(new TypeError("network down"))
  assert.deepEqual(await stalePending, { ok: false, stale: true })
  await flushMicrotasks()

  assert.equal(useEmojiPaletteStore.getState().gameStatus, "loading",
    "폐기된 요청의 실패가 진행 중인 새 요청을 error로 끝냈다")
  const rejoin = useEmojiPaletteStore.getState().loadForGame()
  assert.equal(getCallCount(), 2, "폐기된 요청의 실패 정리가 새 요청의 중복 방지를 풀었다")

  second.resolve(json(200, { ok: true, slots: GAME_SLOTS, revision: "r-new", owned: [] }))
  assert.deepEqual((await livePending).slots, GAME_SLOTS)
  await rejoin
  await flushMicrotasks()

  assert.equal(useEmojiPaletteStore.getState().gameStatus, "ready")
  assert.deepEqual(useEmojiPaletteStore.getState().gameSlots, GAME_SLOTS)
  assert.deepEqual(unhandled, [], "폐기된 요청의 거부가 처리되지 않은 rejection으로 샜다")
})
