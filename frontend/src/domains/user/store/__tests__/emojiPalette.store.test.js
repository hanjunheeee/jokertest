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
