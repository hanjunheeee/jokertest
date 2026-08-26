import test, { mock } from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")

// 훅이 최상단에서 import하는 socketClient를 제어 가능한 fake로 바꾼다(소켓 세대 축을 테스트에서
// 직접 움직이기 위해서다). mock.module은 아직 로드되지 않은 specifier에만 적용되므로 훅·store
// 모듈은 이 등록 이후에 동적 import한다.
let currentFakeSocket = null
const fakeSocketSubscribers = new Set()

function fakeGetSocket() {
  return currentFakeSocket
}

function fakeSubscribeSocket(callback) {
  fakeSocketSubscribers.add(callback)
  return () => {
    fakeSocketSubscribers.delete(callback)
  }
}

function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of [...fakeSocketSubscribers]) callback()
}

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: {
    getSocket: fakeGetSocket,
    subscribeSocket: fakeSubscribeSocket,
  },
})

const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useInGameNightTurnAnnouncement } = await import("../useInGameNightTurnAnnouncement.js")
const { getInGameNightActionType } = await import("../../constants/actions/ingameActionPanel.js")
const { INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS } = await import(
  "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
)

const GAME_ID = "game-1"
const SELF_UUID = "uuid-self"
const OTHER_UUID = "uuid-other"
const DEAD_UUID = "uuid-dead"

/**
 * 이 파일의 모든 테스트는 실제 store·실제 인증 store·실제 훅만 쓴다(정상 경로). canonical
 * 상태는 언제나 store의 실제 액션(setGamePayload/applySessionSnapshot)으로만 움직인다 —
 * 훅 내부 상태를 직접 건드리는 경로는 하나도 없다.
 *
 * 안내가 따라가는 릴은 두 축으로 나뉜다. **구성**은 서버가 내려준 역할 구성
 * (state.nightTurnRoles)에서 만들어지고 역할 보유자의 생사를 전혀 보지 않는다. **전진**은
 * canonical 턴(night_turn_changed)을 상한으로 삼아 고정 리듬
 * (INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)으로 한 칸씩만 나아간다 — 그래서 보유자가
 * 살아있는 역할의 칸은 그 역할의 제출 전에 절대 넘어가지 않고, 보유자가 전원 사망한 역할의
 * 칸은 서버가 그 턴을 건너뛴 방송을 보낸 덕에 연출 한 장만 재생되고 지나간다.
 */
function createFakeSocket() {
  const handlers = new Map()
  const emitCalls = []
  const emitWithAckCalls = []

  const socket = {
    connected: true,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(handler)
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },
    emit(...args) {
      emitCalls.push(args)
    },
    timeout() {
      return {
        emitWithAck(...args) {
          emitWithAckCalls.push(args)
          return new Promise(() => {})
        },
      }
    },
    emitWithAck(...args) {
      emitWithAckCalls.push(args)
      return new Promise(() => {})
    },
    fire(event, ...args) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args)
    },
  }

  return { socket, emitCalls, emitWithAckCalls }
}

function buildSelf() {
  return {
    uuid: SELF_UUID,
    nickname: "나",
    role: "JOKER",
    team: "JOKER",
    hasActedThisPhase: false,
    allies: [],
  }
}

const NICKNAMES = { [SELF_UUID]: "나", [OTHER_UUID]: "상대", [DEAD_UUID]: "희생자" }
const ALL_UUIDS = [SELF_UUID, OTHER_UUID, DEAD_UUID]

/** 이 게임에 존재하는 밤 행동 역할 구성(서버 game_started state.nightTurnRoles의 기본 픽스처). */
const DEFAULT_NIGHT_TURN_ROLES = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]

function buildPlayers() {
  return ALL_UUIDS.map((uuid) => ({ uuid, nickname: NICKNAMES[uuid] }))
}

/**
 * canonical state 하나를 만든다. nightTurnRoles는 서버가 내려주는 역할 구성(게임당 상수)이고,
 * nightTurnRole은 서버가 지금 어느 역할 턴인지 명시하는 판정 값이다 — 연출 릴은 앞의 것만 본다.
 */
function buildState({ phase, dayIndex, nightTurnRole, nightTurnRoles = DEFAULT_NIGHT_TURN_ROLES }) {
  return {
    id: GAME_ID,
    phase,
    dayIndex,
    players: buildPlayers(),
    self: buildSelf(),
    ...(nightTurnRoles ? { nightTurnRoles } : {}),
    ...(nightTurnRole ? { nightTurnRole } : {}),
  }
}

function applyCanonicalState({ phase, dayIndex, nightTurnRole, nightTurnRoles, gameId = GAME_ID }) {
  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId,
      state: buildState({ phase, dayIndex, nightTurnRole, nightTurnRoles }),
    })
  })
}

/** 재접속 스냅샷 정상 경로(get_session_snapshot 응답 → applySessionSnapshot). */
function applySnapshot({ phase, dayIndex, deadUuids = [] }) {
  act(() => {
    useInGameStore.getState().applySessionSnapshot({
      ok: true,
      gameId: GAME_ID,
      phase,
      dayIndex,
      players: ALL_UUIDS.map((uuid) => ({
        uuid,
        nickname: NICKNAMES[uuid],
        isAlive: !deadUuids.includes(uuid),
        isConnected: true,
      })),
      self: buildSelf(),
    })
  })
}

/**
 * 정상 경로로 사망자를 만들고 그 다음 밤까지 진행한다: 밤 판정(night_result_applied → DAY) →
 * 낮 투표 무산(TIE → 같은 dayIndex의 NIGHT). store를 직접 건드리지 않는다.
 */
function advanceToNextNightWithDeath({ dayIndex, victimUuid }) {
  act(() => {
    useInGameStore.getState().applyNightResultAppliedPayload({
      gameId: GAME_ID,
      phase: "DAY",
      dayIndex,
      players: ALL_UUIDS.map((uuid) => ({ uuid, alive: uuid !== victimUuid })),
    })
  })
  act(() => {
    useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, dayIndex, { outcome: "TIE" })
  })
}

/**
 * 서버가 그 역할의 턴을 끝내고 다음 역할을 방송한 것을 반영한다(night_turn_changed 정상 경로).
 * 릴 커서의 상한을 움직이는 유일한 입력이며, 훅 내부 상태는 건드리지 않는다.
 * @param {string} role 서버가 새로 지목한 canonical 역할 턴
 * @param {number} [dayIndex] 그 밤의 canonical dayIndex(기본값은 store의 현재 값)
 */
function advanceCanonicalTurn(role, dayIndex = useInGameStore.getState().state?.dayIndex) {
  act(() => {
    useInGameStore.getState().applyNightTurnChanged({
      gameId: GAME_ID,
      phase: "NIGHT",
      dayIndex,
      nightTurnRole: role,
    })
  })
}

/** 릴 한 칸 분량(2600ms)만큼 고정 리듬을 흘려보낸다. */
function tickReel(steps = 1) {
  for (let i = 0; i < steps; i += 1) {
    act(() => {
      mock.timers.tick(INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS)
    })
  }
}

/**
 * 정상 경로의 마운트 상태를 만든다: 게임 시작 직후(ROLE_REVEAL)에 인게임 화면이 이미 떠 있는
 * 상태 — 실제 InGamePage가 마운트되는 시점과 같다. 이 시점에는 릴이 비어 안내도 없다.
 */
function mountAtRoleReveal({ hold = false, nightTurnRoles } = {}) {
  const fake = createFakeSocket()
  setFakeSocket(fake.socket)

  act(() => {
    useAuthStore.setState({ user: { uuid: SELF_UUID } })
  })
  applyCanonicalState({ phase: "ROLE_REVEAL", dayIndex: 0, nightTurnRoles })

  const rendered = renderHook(
    ({ hold: holdProp }) => useInGameNightTurnAnnouncement({ hold: holdProp }),
    { initialProps: { hold } },
  )

  return { ...rendered, fake }
}

function resetStores() {
  act(() => {
    useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
    useAuthStore.setState({ user: null })
  })
  setFakeSocket(null)
}

function messageOf(result) {
  return result.current.announcement?.message ?? null
}

test("밤이 되면 릴의 첫 칸(광대) 안내가 뜬다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  assert.equal(result.current.open, false, "ROLE_REVEAL에는 릴이 비어 있어 안내가 없다")

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, true)
  assert.equal(result.current.role, "JOKER")
  assert.equal(result.current.statusRole, "JOKER", "상태바도 같은 칸을 가리킨다")
  assert.equal(messageOf(result), "광대의 시간입니다")

  unmount()
})

test("안내를 닫아도 릴이 앞당겨지지 않고 광대 밤 행동 UI는 그대로다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(messageOf(result), "광대의 시간입니다")

  act(() => {
    result.current.close()
  })

  assert.equal(result.current.open, false, "닫은 안내는 사라진다")
  assert.equal(result.current.announcement, null)
  assert.equal(result.current.statusRole, "JOKER", "닫기는 릴 커서를 움직이지 않는다")

  // 닫은 뒤 리렌더·상태 재관측이 반복돼도 커서는 그 자리다(다음 칸은 고정 리듬으로만 온다).
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, false)
  assert.equal(result.current.statusRole, "JOKER")

  // 밤 행동 UI 판정(InGameActionPanel이 그대로 쓰는 getInGameNightActionType —
  // ingameActionPanel.js)은 연출과 무관하게 광대 행동을 계속 허용한다.
  const { self, dayIndex } = useInGameStore.getState().state
  assert.equal(getInGameNightActionType(self.role, dayIndex), "ASSASSINATE")

  unmount()
})

test("같은 릴 칸에서 반복되는 canonical 갱신·스냅샷 재적용은 안내를 다시 열지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)

  act(() => {
    result.current.close()
  })
  assert.equal(result.current.open, false)

  // 같은 밤의 roster/연결 상태 갱신과 스냅샷 재적용이 반복돼도 다시 열리지 않는다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  applySnapshot({ phase: "NIGHT", dayIndex: 1 })
  applySnapshot({ phase: "NIGHT", dayIndex: 1 })

  assert.equal(result.current.open, false)

  unmount()
})

test("전원 생존 밤: 각 칸은 그 역할의 제출 전에는 절대 넘어가지 않는다", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const composition = ["JOKER", "DOCTOR", "GUARD"]
    const { result, unmount } = mountAtRoleReveal({ nightTurnRoles: composition })
    applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRoles: composition })

    assert.equal(messageOf(result), "광대의 시간입니다")

    // 광대가 아직 제출하지 않았다 — 서버는 night_turn_changed를 보내지 않았고, 시간이 아무리
    // 흘러도 상태바가 "가드의 시간"으로 새지 않는다(이 slice가 고치는 회귀).
    tickReel(5)
    assert.equal(result.current.statusRole, "JOKER", "제출 전에는 커서가 첫 칸에 머문다")
    assert.equal(
      useInGameStore.getState().state.nightTurnRole ?? null,
      null,
      "night_turn_changed가 한 번도 오지 않았다",
    )

    // 광대가 제출하고 서버가 의사 턴을 방송하면 비로소 다음 칸이 온다.
    advanceCanonicalTurn("DOCTOR")
    tickReel(1)
    assert.equal(result.current.statusRole, "DOCTOR")
    assert.equal(messageOf(result), "의사의 시간입니다")

    // 의사의 제출 전에는 또 멈춘다.
    tickReel(5)
    assert.equal(result.current.statusRole, "DOCTOR", "다음 제출 전에는 경호원으로 넘어가지 않는다")

    unmount()
  } finally {
    mock.timers.reset()
  }
})

test("보유자가 전원 사망한 역할의 칸도 릴에 남아 연출 한 장을 재생한 뒤 자동으로 넘어간다", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const composition = ["JOKER", "DOCTOR", "GUARD"]
    const { result, unmount } = mountAtRoleReveal({ nightTurnRoles: composition })

    applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRoles: composition })

    // 첫 밤에 한 명이 죽는다 — 그가 의사 보유자였다면 서버는 그 뒤로 DOCTOR 턴을 아예
    // 방송하지 않는다(computeCurrentNightTurnRole의 생존 필터). 프런트는 그 사실을 알 수
    // 없어야 하고, 알 필요도 없다.
    advanceToNextNightWithDeath({ dayIndex: 2, victimUuid: DEAD_UUID })

    const seen = []
    const observe = () => {
      if (result.current.open) seen.push([result.current.statusRole, messageOf(result)])
    }

    observe()
    // 광대가 제출하자 서버가 의사를 통째로 건너뛰고 경호원 턴을 방송한다.
    advanceCanonicalTurn("GUARD")
    tickReel(1)
    observe()
    tickReel(1)
    observe()

    assert.deepEqual(
      seen,
      [
        ["JOKER", "광대의 시간입니다"],
        ["DOCTOR", "의사의 시간입니다"],
        ["GUARD", "경호원의 시간입니다"],
      ],
      "죽은 역할의 칸이 사라지지도, 한 프레임 만에 지워지지도 않는다",
    )

    // 경호원 칸에서는 다시 멈춘다 — 그 역할의 제출이 상한을 옮겨야 한다.
    tickReel(5)
    assert.equal(result.current.statusRole, "GUARD")

    unmount()
  } finally {
    mock.timers.reset()
  }
})

test("릴이 끝나면 상태바가 마지막 역할에 고정되고 새 안내는 더 뜨지 않는다", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const composition = ["JOKER", "DOCTOR", "GUARD"]
    const { result, unmount } = mountAtRoleReveal({ nightTurnRoles: composition })
    applyCanonicalState({ phase: "NIGHT", dayIndex: 1, nightTurnRoles: composition })

    // 광대·의사가 차례로 제출해 서버가 마지막 역할까지 턴을 옮겼다.
    advanceCanonicalTurn("GUARD")
    tickReel(2)
    assert.equal(result.current.statusRole, "GUARD")
    assert.equal(messageOf(result), "경호원의 시간입니다")

    // 마지막 칸에서 멈춘다 — 밤이 더 이어져도 커서는 그대로이고 안내는 자동으로 닫힌다.
    tickReel(3)
    assert.equal(result.current.statusRole, "GUARD", "상태바 문구는 마지막 역할에 고정된다")
    assert.equal(result.current.open, false)

    unmount()
  } finally {
    mock.timers.reset()
  }
})

test("hold 동안에는 릴이 시작하지도 전진하지도 않는다", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const { result, rerender, unmount } = mountAtRoleReveal({ hold: true })
    applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

    assert.equal(result.current.open, false, "'밤이 되었습니다'가 떠 있는 동안에는 뜨지 않는다")

    // 대기 중에는 고정 리듬도 흐르지 않는다 — 진입 연출을 닫는 순간 첫 칸부터 시작해야 한다.
    tickReel(3)
    assert.equal(result.current.statusRole, "JOKER", "커서가 앞으로 밀리지 않았다")
    assert.equal(result.current.open, false)

    // rerender는 이미 act로 감싸여 있다(중첩 act를 피한다).
    rerender({ hold: false })

    assert.equal(result.current.open, true, "진입 연출이 닫히면 반드시 첫 칸부터 뜬다")
    assert.equal(messageOf(result), "광대의 시간입니다")

    unmount()
  } finally {
    mock.timers.reset()
  }
})

test("닫기는 릴 커서를 움직이지 않는다 — 다음 칸은 canonical 턴이 먼저 넘어가야 온다", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const { result, unmount } = mountAtRoleReveal()
    applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
    assert.equal(messageOf(result), "광대의 시간입니다")

    act(() => {
      result.current.close()
    })
    assert.equal(result.current.open, false)
    assert.equal(result.current.statusRole, "JOKER", "닫아도 커서는 그 자리다")

    // 닫기를 앞당김 신호로 쓰지 않는다 — 제출이 없으면 시간이 흘러도 그 자리다.
    tickReel(3)
    assert.equal(result.current.statusRole, "JOKER")

    advanceCanonicalTurn("DOCTOR")
    tickReel(1)
    assert.equal(result.current.statusRole, "DOCTOR")
    assert.equal(messageOf(result), "의사의 시간입니다")

    unmount()
  } finally {
    mock.timers.reset()
  }
})

test("밤 행동이 없는 역할만 있는 구성에서는 릴이 비어 안내가 한 번도 뜨지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal({ nightTurnRoles: ["CITIZEN"] })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 0, nightTurnRoles: ["CITIZEN"] })

  assert.equal(result.current.open, false, "건너뛰는 역할은 한 프레임도 깜빡이지 않는다")
  assert.equal(result.current.announcement, null)
  assert.equal(result.current.statusRole, null)

  // 같은 밤에 반복 갱신이 와도 마찬가지다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 0, nightTurnRoles: ["CITIZEN"] })
  assert.equal(result.current.open, false)

  unmount()
})

test("시신이 있는 밤에는 마녀사냥꾼 칸까지 재생된다(보유자 생사와 무관)", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const { result, unmount } = mountAtRoleReveal()
    applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

    // 시신이 없는 첫 밤에는 마녀사냥꾼 칸이 릴에 없다(원래 규칙 유지) — 광대·의사·경호원뿐이다.
    // 서버가 경호원까지 턴을 옮겨도 그 뒤에 재생할 칸이 없다.
    advanceCanonicalTurn("GUARD")
    tickReel(2)
    assert.equal(result.current.statusRole, "GUARD")
    tickReel(1)
    assert.equal(result.current.statusRole, "GUARD", "시신이 없으면 마녀사냥꾼 칸이 없다")

    // 시신이 생긴 다음 밤에는 마녀사냥꾼 칸이 들어온다. canonical이 그 칸까지 와야 비로소
    // 커서가 거기에 닿는다 — 중간 칸(광대·의사·경호원)은 그대로 한 장씩 재생된다.
    advanceToNextNightWithDeath({ dayIndex: 2, victimUuid: DEAD_UUID })
    tickReel(3)
    assert.equal(result.current.statusRole, "JOKER", "canonical이 첫 칸에 있는 동안은 멈춰 있다")

    advanceCanonicalTurn("WITCH_HUNTER")
    tickReel(2)
    assert.equal(result.current.statusRole, "GUARD", "건너뛴 칸도 한 장씩 재생하며 지나간다")
    tickReel(1)

    assert.equal(result.current.statusRole, "WITCH_HUNTER")
    assert.equal(messageOf(result), "마녀사냥꾼의 시간입니다")

    unmount()
  } finally {
    mock.timers.reset()
  }
})

test("앞 순서 오버레이가 떠 있는 동안 반복 관측돼도 대기 중인 안내가 소비되지 않는다", () => {
  resetStores()
  const { result, rerender, unmount } = mountAtRoleReveal({ hold: true })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, false, "'밤이 되었습니다'가 떠 있는 동안에는 뜨지 않는다")

  // 대기 중에 같은 칸이 여러 번 관측돼도 소비되지 않는다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })

  // rerender는 이미 act로 감싸여 있다(중첩 act를 피한다).
  rerender({ hold: false })

  assert.equal(result.current.open, true, "진입 연출이 닫히면 반드시 뜬다")
  assert.equal(messageOf(result), "광대의 시간입니다")

  unmount()
})

test("안내를 닫아도 소켓 emit(밤 행동·역할 확인 등)이 전혀 나가지 않는다", () => {
  resetStores()
  const { result, fake, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)

  const emitsBefore = fake.emitCalls.length
  const acksBefore = fake.emitWithAckCalls.length

  act(() => {
    result.current.close()
  })

  assert.equal(fake.emitCalls.length, emitsBefore, "닫기는 어떤 emit도 하지 않는다")
  assert.equal(fake.emitWithAckCalls.length, acksBefore, "닫기는 역할 확인 ack도 보내지 않는다")
  // 이 훅은 canonical store도 건드리지 않는다.
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().state.dayIndex, 1)

  unmount()
})

test("이전 날짜의 늦은 닫기 콜백은 새 안내를 대신 닫지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  const staleClose = result.current.close

  // 다음 밤으로 넘어가면 새 identity의 안내가 뜬다.
  applyCanonicalState({ phase: "DAY", dayIndex: 2 })
  applyCanonicalState({ phase: "NIGHT", dayIndex: 2 })
  assert.equal(result.current.open, true)

  act(() => {
    staleClose()
  })

  assert.equal(result.current.open, true, "이전 밤의 닫기는 무시된다")
  assert.equal(messageOf(result), "광대의 시간입니다")

  unmount()
})

test("이전 계정·이전 게임의 늦은 닫기 콜백은 아무 일도 하지 않는다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  const staleClose = result.current.close

  // 다른 계정으로 바뀌면 그 세대의 대기·표시 상태는 전부 무효가 된다.
  act(() => {
    useAuthStore.setState({ user: { uuid: "uuid-other-account" } })
  })
  assert.equal(result.current.open, false, "계정이 바뀌면 남아 있던 안내가 사라진다")

  act(() => {
    staleClose()
  })
  assert.equal(result.current.open, false)

  unmount()
})

test("소켓 세대가 바뀌면 남아 있던 안내가 무효가 되고 늦은 콜백도 무시된다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)
  const staleClose = result.current.close

  const replacement = createFakeSocket()
  act(() => {
    setFakeSocket(replacement.socket)
  })

  assert.equal(result.current.open, false, "소켓 교체는 그 세대의 표시 상태를 버린다")

  act(() => {
    staleClose()
  })
  assert.equal(result.current.open, false)

  unmount()
})

test("NIGHT를 벗어나거나 ENDED가 되면 안내가 즉시 사라진다", () => {
  resetStores()
  const { result, unmount } = mountAtRoleReveal()

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)

  applyCanonicalState({ phase: "DAY", dayIndex: 2 })
  assert.equal(result.current.open, false, "NIGHT를 벗어나면 사라진다")

  applyCanonicalState({ phase: "NIGHT", dayIndex: 2 })
  assert.equal(result.current.open, true)

  applyCanonicalState({ phase: "ENDED", dayIndex: 2 })
  assert.equal(result.current.open, false, "ENDED에서는 남아 있지 않는다")
  assert.equal(result.current.announcement, null)

  unmount()
})

test("StrictMode의 이중 실행에도 같은 릴 칸이 다시 열리지 않는다", () => {
  resetStores()
  const fake = createFakeSocket()
  setFakeSocket(fake.socket)

  act(() => {
    useAuthStore.setState({ user: { uuid: SELF_UUID } })
  })
  applyCanonicalState({ phase: "ROLE_REVEAL", dayIndex: 0 })

  const { result, unmount } = renderHook(() => useInGameNightTurnAnnouncement({ hold: false }), {
    wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
  })

  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, true)
  assert.equal(messageOf(result), "광대의 시간입니다")

  act(() => {
    result.current.close()
  })
  assert.equal(result.current.open, false)

  // 닫은 뒤 같은 칸이 다시 관측돼도(중복 방송·리렌더·이중 실행) 재오픈되지 않는다.
  applyCanonicalState({ phase: "NIGHT", dayIndex: 1 })
  assert.equal(result.current.open, false)

  unmount()
})

test("이미 진행 중인 밤으로의 스냅샷 복원은 canonical 상한에서 이어붙이고 지나간 안내를 재생하지 않는다", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const { result, unmount } = mountAtRoleReveal()

    applySnapshot({ phase: "NIGHT", dayIndex: 1 })

    assert.equal(result.current.open, false, "복원은 '방금 연출이 시작된 것'이 아니다")
    assert.equal(result.current.announcement, null)
    // 스냅샷 payload에는 canonical 역할 턴이 실리지 않으므로(applySessionSnapshot) 복원 창의
    // 상한은 그 밤의 시작 역할이고, 커서도 거기서 이어붙는다 — 같은 창의 행동 패널이 쓰는
    // 값과 정확히 같아서 연출과 판정이 어긋나지 않는다.
    assert.equal(result.current.statusRole, "JOKER")

    // 그 밤에 남은 시간 동안 지나간 안내를 몰아서 재생하지 않는다.
    tickReel(3)
    assert.equal(result.current.open, false)
    assert.equal(result.current.statusRole, "JOKER")

    // 다음 밤은 릴의 첫 칸부터 정상 재생된다(복원 예외는 그 밤에만 적용된다).
    applyCanonicalState({ phase: "DAY", dayIndex: 2 })
    applyCanonicalState({ phase: "NIGHT", dayIndex: 2 })
    assert.equal(result.current.open, true)
    assert.equal(messageOf(result), "광대의 시간입니다")

    unmount()
  } finally {
    mock.timers.reset()
  }
})

test("복원 창에서도 다음 night_turn_changed부터는 안내가 정상적으로 뜬다", () => {
  resetStores()
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const { result, unmount } = mountAtRoleReveal()

    applySnapshot({ phase: "NIGHT", dayIndex: 1 })
    assert.equal(result.current.open, false)
    assert.equal(result.current.statusRole, "JOKER")

    // 복원 시점의 칸만 baseline이다. 커서가 전진하면 하이드레이션 표식이 내려가므로 그 뒤의
    // 칸은 정상적으로 안내된다 — 내려가지 않으면 그 밤의 안내가 한 장도 뜨지 않는다.
    advanceCanonicalTurn("DOCTOR")
    tickReel(1)

    assert.equal(result.current.statusRole, "DOCTOR")
    assert.equal(result.current.open, true, "복원 이후의 칸은 baseline이 아니다")
    assert.equal(messageOf(result), "의사의 시간입니다")

    unmount()
  } finally {
    mock.timers.reset()
  }
})
