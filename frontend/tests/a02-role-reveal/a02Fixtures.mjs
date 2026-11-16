// A02 화면 시험 몫 준비 값: 5~10명 명단·직업 구성·시작 알림·스냅샷 모양 (서버가 보내는 모양 그대로 흉내)
// a02-role-reveal 폴더 시험 파일들이 같이 씀, 공용 도우미 아님 (판 없이 스토어에 넣을 값만 만듦)

// 자리 순서대로 쓸 닉네임 (10명까지)
export const NICKNAMES = ["민수", "지원", "하늘", "도윤", "서연", "예준", "하은", "시우", "지아", "주원"]

// 직업 → 팀 (광대만 광대 팀)
export const TEAM_OF = { JOKER: "JOKER", CITIZEN: "CITIZEN", DOCTOR: "CITIZEN", GUARD: "CITIZEN", WITCH_HUNTER: "CITIZEN" }

// 화면에 나오는 직업 이름 (결정: 마녀사냥꾼은 "마녀사냥꾼", 시민 직업은 "귀족"으로 통일)
export const ROLE_NAME = { JOKER: "광대", CITIZEN: "귀족", DOCTOR: "의사", GUARD: "경비원", WITCH_HUNTER: "마녀사냥꾼" }

// 같은 직업끼리 보이는 직업 (시민 뺌, 결정 "누가 보나")
export const ALLY_ROLES = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]

// 구성 줄임 글자 → 직업
const CODE_ROLE = { J: "JOKER", D: "DOCTOR", G: "GUARD", W: "WITCH_HUNTER", C: "CITIZEN" }

// "J2D2C1" → { JOKER: 2, DOCTOR: 2, CITIZEN: 1 }
export function parseCode(code) {
  const counts = {}
  for (const [, letter, num] of code.matchAll(/([JDGWC])(\d+)/g)) counts[CODE_ROLE[letter]] = Number(num)
  return counts
}

// 자동 구성 (결정 "구성 칸"): 광대 1, 6명부터 의사, 8명부터 경비원, 10명부터 마녀사냥꾼, 나머지 시민
export function autoCounts(n) {
  const counts = { JOKER: 1 }
  if (n >= 6) counts.DOCTOR = 1
  if (n >= 8) counts.GUARD = 1
  if (n >= 10) counts.WITCH_HUNTER = 1
  const used = Object.values(counts).reduce((a, b) => a + b, 0)
  if (n - used > 0) counts.CITIZEN = n - used
  return counts
}

// 정해진 순서로 섞기 (서버도 섞어서 자리 순서 = 섞인 순서, 무작위는 안 씀)
function fixedShuffle(list) {
  const out = [...list]
  let seed = 7
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 31 + 11) % 97
    const j = seed % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// 구성 → 자리마다 사람 [{ uuid, nickname, role }] (직업은 늘 정해 줌)
export function seatPlayers(counts, { gameTag = "g" } = {}) {
  const roles = []
  for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER", "CITIZEN"]) {
    for (let i = 0; i < (counts[role] ?? 0); i += 1) roles.push(role)
  }
  return fixedShuffle(roles).map((role, i) => ({ uuid: `${gameTag}-p${i + 1}`, nickname: NICKNAMES[i], role }))
}

// 구성 줄임 글자로 바로 자리 만들기
export const seatCode = (code, opts) => seatPlayers(parseCode(code), opts)

// 그 직업 사람들 / 그 직업 첫 사람
export const ofRole = (seats, role) => seats.filter((p) => p.role === role)
export const firstOf = (seats, role) => ofRole(seats, role)[0]

// 보는 사람 기준 같은 직업 상대 uuid (시민이면 null = 칸 없음)
export function alliesFor(seats, viewer) {
  if (!ALLY_ROLES.includes(viewer.role)) return null
  return seats.filter((p) => p.role === viewer.role && p.uuid !== viewer.uuid).map((p) => p.uuid)
}

// 서버 self 칸 흉내 (스킨 안 낀 사람에게도 accountSkinId: null, 시민엔 allies 칸 없음)
export function buildSelf(seats, viewer, { accountSkinId = null, allies } = {}) {
  const list = allies === undefined ? alliesFor(seats, viewer) : allies
  return {
    uuid: viewer.uuid,
    nickname: viewer.nickname,
    role: viewer.role,
    team: TEAM_OF[viewer.role],
    accountSkinId,
    ...(list === null ? {} : { allies: list }),
  }
}

// game_started 알림 값 (보는 사람마다 다름, 명단엔 직업 없음)
export function buildGameStarted(seats, viewer, { gameId = "game-1", self } = {}) {
  return {
    gameId,
    state: {
      id: gameId,
      phase: "ROLE_REVEAL",
      dayIndex: 0,
      hostUuid: seats[0].uuid,
      roomId: `room-${gameId}`,
      roomInstanceId: null,
      bootEpoch: null,
      roomCode: null,
      participationRevision: 0,
      players: seats.map((p, i) => ({
        uuid: p.uuid,
        nickname: p.nickname,
        themeIndex: i,
        isAlive: true,
        isParticipating: true,
        membershipId: null,
      })),
      self: self ?? buildSelf(seats, viewer),
    },
  }
}

// get_session_snapshot 답 값 (낮이면 토론 단계, 밤이면 차례 칸은 opts로)
export function buildSnapshot(seats, viewer, { gameId = "game-1", phase = "ROLE_REVEAL", dayIndex = 0, self, alive = {}, extra = {} } = {}) {
  return {
    ok: true,
    gameId,
    phase,
    dayIndex,
    hostUuid: seats[0].uuid,
    roomId: `room-${gameId}`,
    participationRevision: 0,
    selfProgressSeq: 0,
    ...(phase === "DAY" ? { dayPhase: "DAY_DISCUSSION" } : {}),
    players: seats.map((p, i) => ({
      uuid: p.uuid,
      nickname: p.nickname,
      isAlive: alive[p.uuid] ?? true,
      isParticipating: true,
      membershipId: null,
      themeIndex: i,
      isConnected: true,
    })),
    self: { ...(self ?? buildSelf(seats, viewer)), hasActedThisPhase: false },
    ...extra,
  }
}

// 시험마다 다른 판 id (같은 id가 겹쳐 앞 시험 값이 남지 않게)
let seq = 0
export const nextGameId = (tag = "a02") => `${tag}-${++seq}`

// 화면 시험용 가짜 소켓: on/off/emit만, 보낸 것은 sent에 쌓음, 서버 알림은 trigger로 넣음, 답은 ackReply(사건, 값)로 정함
export function createFakeSocket({ onEmit, ackReply } = {}) {
  const handlers = new Map()
  const socket = {
    id: "fake-socket-a02",
    connected: true,
    sent: [],
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(fn)
      return socket
    },
    off(event, fn) {
      if (fn) handlers.get(event)?.delete(fn)
      else handlers.delete(event)
      return socket
    },
    once(event, fn) {
      const wrap = (...args) => { socket.off(event, wrap); fn(...args) }
      return socket.on(event, wrap)
    },
    emit(event, ...args) {
      socket.sent.push({ event, args })
      onEmit?.(event, ...args)
      return socket
    },
    // socket.io 의 시간 제한 보내기 흉내 (답은 안 옴 = 서버 없음)
    timeout() {
      return { emit: (event, ...args) => socket.emit(event, ...args), emitWithAck: (event, ...args) => socket.emitWithAck(event, ...args) }
    },
    // 답을 기다리는 보내기: 적어 두고, ackReply가 답을 주면 그 답, 아니면 답이 영영 안 옴
    emitWithAck(event, ...args) {
      socket.sent.push({ event, args })
      const reply = ackReply?.(event, ...args)
      return reply === undefined ? new Promise(() => {}) : Promise.resolve(reply)
    },
    trigger(event, ...args) {
      for (const fn of [...(handlers.get(event) ?? [])]) fn(...args)
    },
  }
  return socket
}
