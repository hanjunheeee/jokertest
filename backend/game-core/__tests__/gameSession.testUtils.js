// gameSession 계약 테스트 6개 파일이 공유하는 픽스처·조립기·비밀 데이터 검사기 모음(테스트 없음).

const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const { buildSessionCandidate } = gameSession.__testables
const {
    commitGameSession,
    acknowledgeRoleReveal,
    acknowledgeDayVoteReady,
    submitNightAction,
    prepareNightResolution,
    commitNightResolution,
    submitDayVote,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    submitTribunalVote,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    commitGameChatMessage,
    GAME_ROLES,
} = gameSession

function makePlayer(uuid, nickname = `nick-${uuid}`, extra = {}) {
    return { uuid, nickname, isReady: true, ...extra }
}

/** buildSessionCandidate/prepareGameSession이 받는 room 형태를 흉내낸다. */
function makeRoom({ id = 'room-1', players, jokerCount = 1 } = {}) {
    const playerList = players ?? [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')]
    return {
        id,
        players: new Map(playerList.map((p) => [p.uuid, p])),
        settings: { jokerCount },
    }
}

function sequenceRandom(sequence) {
    let i = 0
    return () => sequence[Math.min(i++, sequence.length - 1)]
}

/** DAY→TRIBUNAL 전이가 이미 끝난 3인 세션을 직접 구성한다(dayVoteResolution·session.tribunal을
 * commitDayVoteResolution과 동일한 shape로 채운다). */
function setupTribunalReadySession({
    uuids = ['t1', 't2', 't3'],
    defendantUuid = 't3',
    roomId = `tribunal-${uuids.join('-')}`,
    randomFn = Math.random,
} = {}) {
    const room = makeRoom({
        id: roomId,
        players: uuids.map((uuid) => makePlayer(uuid)),
    })
    const prepared = gameSession.prepareGameSession(room, { randomFn })
    gameSession.commitGameSession(prepared.session)
    const session = prepared.session
    session.phase = 'TRIBUNAL'
    session.dayVoteResolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: defendantUuid,
        publicVoteCount: uuids.length,
        publicAbstainCount: 0,
    }
    session.tribunal = { candidateId: defendantUuid, dayIndex: session.dayIndex, defendantUuid, votes: new Map() }
    return { session, defendantUuid }
}

/** N인 세션을 커밋하고 uuid 목록과 함께 돌려준다(역할 배정은 결정적 randomFn으로 고정). */
function commitRoleRevealSession({ id, uuids, jokerCount = 1 }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    return candidate.session
}

function validSession(overrides = {}) {
    return {
        id: 'game-1',
        roomId: 'room-1',
        channelId: 'room-1',
        phase: 'ROLE_REVEAL',
        dayIndex: 0,
        jokerCount: 1,
        players: new Map([
            ['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.JOKER, alive: true }],
            ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN, alive: true }],
            ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN, alive: true }],
        ]),
        roleRevealAcks: new Set(),
        nightActions: new Map(),
        jokerChatRateLimit: new Map(),
        dayChatRateLimit: new Map(),
        deadChatRateLimit: new Map(),
        nightResolution: null,
        dayVotes: new Map(),
        dayVoteRound: 1,
        dayVoteExcludedUuids: new Set(),
        ...overrides,
    }
}

/**
 * 테스트 전용 NIGHT 픽스처: 참가자 전원의 canonical 역할 확인으로 초기 DAY(dayIndex 1)까지
 * 전이시킨 뒤, NIGHT 규칙을 격리해 검증하기 위해 세션을 "그 밤"(기본값은 첫 밤 — NIGHT,
 * dayIndex 0) 상태로 직접 되돌린다.
 *
 * 초기 DAY 전이 자체는 위 슬라이스1 테스트들이 별도로 검증한다 — 이 헬퍼는 밤 행동·밤 판정·
 * JOKER 비밀 채팅처럼 NIGHT 위에서만 성립하는 규칙들을 dayIndex 경계(0 = 마녀사냥꾼 비활성)까지
 * 포함해 그대로 재현하기 위한 픽스처 조립이며, production 진입 순서를 흉내내지 않는다.
 *
 * 되돌릴 때는 phase/dayIndex만이 아니라 밤 제출·판정 상태(nightActions/nightResolution)와 지난
 * 낮/재판 기록(dayVotes/dayVoteResolution/tribunal)까지 전부 신선한 값으로 함께 맞춘다 —
 * production이 매 NIGHT 진입에서 보장하는 상태와 같은 모양이어야, 이 픽스처 위의 테스트가 초기
 * DAY가 남긴 잔여 상태에 의존하거나 그것 때문에 조용히 어긋나지 않는다.
 */
function ackAllAndRewindToFirstNight(session, { dayIndex = 0 } = {}) {
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.dayIndex = dayIndex
    session.nightActions = new Map()
    session.nightResolution = null
    session.dayVotes = new Map()
    session.dayVoteResolution = null
    session.tribunal = null
}

/** playerCount=10·jokerCount=1 세션을 커밋하고 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다. 5개 역할 전부가 정확히 1명씩(CITIZEN은 6명) 배정된다. */
function commitFullRoleSessionAtNight({ id = 'room-full', gameIdFn } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`fp-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 1 })
    const opts = { randomFn: () => 0.999, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
    const byRole = (role) => [...session.players.values()].find((p) => p.role === role).uuid
    return {
        session,
        jokerUuid: byRole('JOKER'),
        doctorUuid: byRole('DOCTOR'),
        guardUuid: byRole('GUARD'),
        witchHunterUuid: byRole('WITCH_HUNTER'),
        citizenUuid: byRole('CITIZEN'),
    }
}

/** playerCount=3·jokerCount=2 세션을 커밋하고 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다 — JOKER 2명 + CITIZEN 1명. */
function commitJokerTrioSessionAtNight({ id = 'room-joker', gameIdFn } = {}) {
    const players = [makePlayer(`ja-${id}`), makePlayer(`jb-${id}`), makePlayer(`jc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 2 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const citizenUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    return { session, jokerUuids, citizenUuid }
}

// 3인·jokerCount 1 세션을 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다 — commitNightResolution은
// NIGHT 위에서만 의미가 있는 mutation이므로, 전원 확인이 도달시키는 초기 DAY가 아니라
// ackAllAndRewindToFirstNight이 세우는 canonical NIGHT 상태에서 검증한다.
function nightSessionOf3({ id = 'room-cnr' } = {}) {
    const room = makeRoom({ id, players: [makePlayer('cnr-a'), makePlayer('cnr-b'), makePlayer('cnr-c')], jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    ackAllAndRewindToFirstNight(candidate.session)
    return candidate.session
}

// playerCount=4·jokerCount=1 세션을 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다(randomFn:()=>0
// 고정 셔플에서 JOKER는 두 번째 참가자로 배정된다). commitNightResolution이 승리 판정을 추가한
// 뒤에도 CITIZEN 희생자 한 명을 죽이는 것만으로는 어느 진영도 승리하지 않도록(생존 JOKER 1명 <
// 생존 CITIZEN 2명) 골라, 여전히 비종결(NIGHT→DAY) 케이스를 검증하기 위한 fixture다 —
// nightSessionOf3(3인·1조커)은 어떤 희생자를 죽여도 항상 한쪽이 승리해버려 이 목적에 쓸 수 없다.
function nightSessionOf4NoWin({ id = 'room-cnr4' } = {}) {
    const room = makeRoom({
        id,
        players: [makePlayer('cnr4-a'), makePlayer('cnr4-b'), makePlayer('cnr4-c'), makePlayer('cnr4-d')],
        jokerCount: 1,
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    ackAllAndRewindToFirstNight(candidate.session)
    return candidate.session
}

/**
 * 이번 밤에 실제로 죽는 JOKER 암살(보호 없음) 판정을 만들어 커밋한다(4인·비종결 NIGHT fixture).
 *
 * prepare가 실패하면 prepared.session은 undefined라 commitNightResolution이 "의도한 세션"이
 * 아니라 undefined를 받고 엉뚱한 TypeError로 터진다 — 그러면 이 헬퍼를 쓰는 reveal 테스트들이
 * 실제 검증 대상 대신 픽스처 조립 실패를 보고하게 된다. 그래서 (a) prepare 성공을 픽스처 자체의
 * 불변조건으로 명시하고, (b) commit에는 언제나 이 픽스처가 만든 canonical session을 그대로
 * 넘긴다(성공 시 prepared.session과 동일한 참조다).
 */
function commitAssassinationNight({ id = 'room-reveal' } = {}) {
    const session = nightSessionOf4NoWin({ id })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const victimUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    submitNightAction(jokerUuid, session.id, victimUuid)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    assert.equal(prepared.ok, true, `commitAssassinationNight: 밤 판정 준비 실패(${prepared.code})`)
    assert.equal(prepared.session, session)
    const applied = commitNightResolution(session, prepared.resolution)
    return { session, jokerUuid, victimUuid, prepared, applied }
}

/**
 * JOKER·DOCTOR가 함께 존재하는 CUSTOM 세션을 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다 — 보호
 * 대조와 실패 통지는 그 둘이 같은 세션에 있어야만 성립하는데, AUTO 구성은 인원이 적으면
 * DOCTOR를 배정하지 않기 때문이다(getSpecialRoleBudget).
 *
 * @param {object} options - 픽스처 옵션
 * @param {string} options.id - room/세션 식별자
 * @param {number} options.jokerCount - 배정할 JOKER 수(1 또는 2 — 상한 2)
 * @param {number} options.playerCount - 총 참가 인원
 * @flow room을 조립해 커밋한 뒤 첫 밤으로 되돌리고, 역할별 uuid를 배정 결과에서 직접 찾아 준다.
 */
function nightSessionWithDoctor({ id, jokerCount = 1, playerCount = 5 } = {}) {
    const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`nd-${id}-${i}`))
    const room = makeCustomRoom({
        id,
        players,
        roleCounts: { JOKER: jokerCount, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
    const byRole = (role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    const [doctorUuid] = byRole('DOCTOR')
    const jokerUuids = byRole('JOKER')
    const citizenUuids = byRole('CITIZEN')
    return { session, doctorUuid, jokerUuids, jokerUuid: jokerUuids[0], citizenUuids }
}

/**
 * 같은 역할을 여러 명(기본 2명 — 특수직업 공통 상한)이 나눠 가진 CUSTOM 세션을 그 밤의 픽스처로
 * 만든다. 공용 밤 행동 리졸버의 "같은 역할 안에서 제출이 갈릴 때"의 규칙은 그 역할 보유자가
 * 둘 이상이어야만 관찰되는데, AUTO 구성도 기존 픽스처(commitFullRoleSessionAtNight ·
 * nightSessionWithDoctor)도 역할당 1명만 배정하기 때문이다.
 *
 * role === 'JOKER'면 roleCounts.JOKER가 count로 덮이고 makeCustomRoom이 settings.jokerCount를
 * 거기에 맞춰 주므로, JOKER_COUNT_MISMATCH 없이 조립된다.
 *
 * @param {object} options - 픽스처 옵션
 * @param {string} options.id - room/세션 식별자
 * @param {string} options.role - 중복 배정할 역할 키
 * @param {number} options.count - 그 역할에 배정할 인원(1~2)
 * @param {number} options.jokerCount - JOKER 수(role이 JOKER면 count가 우선한다)
 * @param {number} options.playerCount - 총 참가 인원
 * @param {number} options.dayIndex - 되돌릴 밤의 dayIndex(WITCH_HUNTER는 2 이상이어야 활동한다)
 * @flow room을 조립해 커밋한 뒤 그 밤으로 되돌리고, 역할별 uuid를 배정 결과에서 직접 찾아 준다.
 */
function nightSessionWithDuplicateRole({
    id = 'room-dup',
    role,
    count = 2,
    jokerCount = 1,
    playerCount = 6,
    dayIndex = 0,
} = {}) {
    const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`dup-${id}-${i}`))
    const room = makeCustomRoom({
        id,
        players,
        roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, [role]: count },
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    assert.equal(candidate.ok, true, `nightSessionWithDuplicateRole: 세션 조립 실패(${candidate.reason})`)
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session, { dayIndex })
    const byRole = (r) => [...session.players.values()].filter((p) => p.role === r).map((p) => p.uuid)
    return {
        session,
        roleUuids: byRole(role),
        jokerUuids: byRole('JOKER'),
        citizenUuids: byRole('CITIZEN'),
    }
}

/**
 * 생존자 전원의 "투표 시작 준비"로 그 낮을 DAY_DISCUSSION → DAY_VOTE까지 전진시킨다
 * (production과 동일한 경로 — 이 슬라이스에는 타이머 자동 전환이 없다). 이미 DAY_VOTE면
 * 아무것도 하지 않는다(재투표 라운드에서 다시 준비를 요구하지 않는 계약과 짝을 이룬다).
 * @param {object} session - canonical GameSession
 * @flow 이미 투표 구간이면 즉시 반환하고, 아니면 생존자 전원의 준비를 순서대로 넣는다.
 */
function advanceDayToVotePhase(session) {
    if (session.dayPhase === 'DAY_VOTE') return
    for (const player of session.players.values()) {
        if (player.alive) acknowledgeDayVoteReady(player.uuid, session.id)
    }
    assert.equal(session.dayPhase, 'DAY_VOTE')
}

/**
 * playerCount=3 세션을 참가자 전원의 역할 확인만으로 초기 DAY(dayIndex 1, 전원 alive)까지
 * 전이한다 — 게임의 첫 진행 단계는 밤이 아니라 낮이므로, DAY 규칙을 검증하는 이 픽스처는
 * production과 동일하게 acknowledgeRoleReveal 하나로 그 낮에 도달한다(별도의 밤 판정을
 * 끼워넣지 않는다). NIGHT→DAY 전이 자체는 그 전이를 검증 대상으로 삼는 테스트가 직접 만든다.
 *
 * 낮은 토론(DAY_DISCUSSION)부터 시작하므로 투표 규칙을 보는 대다수 테스트를 위해 기본적으로
 * 생존자 전원의 준비까지 돌려 DAY_VOTE로 전진시킨다. 토론 단계 자체를 검증하는 테스트는
 * advanceToVote:false로 그 앞에서 멈춘다.
 * @param {object} [options] - id(방 id)·advanceToVote(DAY_VOTE까지 전진할지)
 */
function commitTrioSessionAtDay({ id = 'room-day', advanceToVote = true } = {}) {
    const players = [makePlayer(`da-${id}`), makePlayer(`db-${id}`), makePlayer(`dc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
    if (advanceToVote) advanceDayToVotePhase(session)
    const [uuidA, uuidB, uuidC] = [...session.players.keys()]
    return { session, uuidA, uuidB, uuidC }
}

/**
 * playerCount=4·jokerCount=1 세션을 커밋하고 production과 동일하게 초기 DAY(dayIndex 1, 전원
 * alive)까지 전이한다. commitTrioSessionAtDay와 같은 이유로 기본적으로 DAY_VOTE까지 전진한다.
 * @param {object} [options] - id(방 id)·advanceToVote(DAY_VOTE까지 전진할지)
 */
function commitQuadSessionAtDay({ id = 'room-revote', advanceToVote = true } = {}) {
    const players = [makePlayer(`ra-${id}`), makePlayer(`rb-${id}`), makePlayer(`rc-${id}`), makePlayer(`rd-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
    if (advanceToVote) advanceDayToVotePhase(session)
    const [uuidA, uuidB, uuidC, uuidD] = [...session.players.keys()]
    return { session, uuidA, uuidB, uuidC, uuidD }
}

/**
 * 4인 픽스처를 A·C 동점으로 1라운드를 마치고 2라운드(후보 B·D)가 열린 상태까지 진행한다.
 * @param {string} id - 세션 방 id
 * @flow 1라운드 표(A→C, B→C, C→A, D→A)를 넣고 prepare/commit으로 REVOTE를 커밋한다.
 */
function advanceQuadToRevote(id) {
    const fixture = commitQuadSessionAtDay({ id })
    const { session, uuidA, uuidB, uuidC, uuidD } = fixture
    // C는 A·B에게서, A는 C·D에게서 각각 2표 — 공동 최다이므로 동점자는 {A, C}다.
    submitDayVote(uuidA, session.id, uuidC)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)
    submitDayVote(uuidD, session.id, uuidA)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'REVOTE')
    assert.deepEqual(prepared.resolution.revoteExcludedUuids, [uuidA, uuidC].sort())
    commitDayVoteResolution(prepared.session, prepared.resolution)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayVoteRound, 2)

    return { ...fixture, firstResolution: prepared.resolution }
}

function castAllVotes(session, votesByUuid) {
    for (const [voterUuid, vote] of Object.entries(votesByUuid)) {
        submitTribunalVote(voterUuid, session.id, session.dayIndex, vote)
    }
}

/** evaluateWinCondition은 session.players Map의 role/alive만 읽는다 — 전체 session 조립 없이
 * 최소 입력만으로 직접 검증한다. */
function makeWinConditionSession(playerSpecs) {
    return { players: new Map(playerSpecs.map((p) => [p.uuid, p])) }
}

/** JOKER 1명 + CITIZEN 3명(jokerCount=1) 4인 세션을 커밋한다(NIGHT/DAY/TRIBUNAL 진행은 호출자
 * 책임). randomFn:()=>0 고정 셔플에서 JOKER는 uuids[1]로 배정된다(nightSessionOf4NoWin과
 * 동일한 관례 — 어떤 첫 밤 희생자를 죽여도 승리 조건이 성립하지 않도록(생존 JOKER 1명 < 생존
 * CITIZEN 2명) 4인·jokerCount=1을 쓴다). */
function buildSnapQuadSession({ id, uuids }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    return candidate.session
}

/** ackAllAndRewindToFirstNight(위)의 스냅샷 섹션 전용 별칭 — 전원 확인 후 첫 밤 픽스처로 되돌린다. */
function ackAll(session) {
    ackAllAndRewindToFirstNight(session)
}

/** JOKER 전용 밤 행동(target 없으면 SKIP)을 제출하고 판정을 커밋한다 — jokerCount=1 세션
 * 전용(다른 역할은 이 스냅샷 시나리오들에 없다). */
function resolveJokerOnlyNight(session, jokerUuid, targetUuid) {
    submitNightAction(jokerUuid, session.id, targetUuid)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    return commitNightResolution(prepared.session, prepared.resolution)
}

/** votesByUuid(uuid→targetUuid|null) 전원 제출 후 DAY 투표 판정을 커밋한다(필요하면 먼저 투표 구간을 연다). */
function resolveDayVotes(session, votesByUuid) {
    advanceDayToVotePhase(session)
    for (const [voterUuid, targetUuid] of Object.entries(votesByUuid)) {
        submitDayVote(voterUuid, session.id, targetUuid)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = prepareDayVoteResolution(anyVoter, session.id, session.dayIndex)
    return commitDayVoteResolution(prepared.session, prepared.resolution)
}

/** votesByUuid(uuid→'GUILTY'|'NOT_GUILTY') 전원 제출 후 TRIBUNAL 판정을 커밋한다. */
function resolveTribunalVotes(session, votesByUuid) {
    for (const [voterUuid, vote] of Object.entries(votesByUuid)) {
        submitTribunalVote(voterUuid, session.id, session.dayIndex, vote)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = prepareTribunalVoteResolution(anyVoter, session.id, session.dayIndex)
    return commitTribunalVoteResolution(prepared.session, prepared.resolution)
}

// -- 경로 인식(path-aware) 재귀 비밀 데이터 검사기 ---------------------------
// 키 이름만으로 전역 예외 처리하지 않는다(Codex P1 지적) — otherPlayerResult:{uuid:secretTarget}
// 같은 변칙적 위치의 leak도 잡아내야 하므로, "이 정확한 경로는 공개 집계값과 겹쳐도 안전하다"고
// 명시적으로 승인된 스키마 경로에서만 값 비교를 건너뛴다. self 서브트리는 위치 자체로 예외다
// (본인의 role/team/uuid는 다른 참가자의 role/team/target과 우연히 같을 수 있다).

const FORBIDDEN_PRIVATE_KEYS = new Set([
    'role', 'team', 'allies',
    'votes', 'nightActions', 'dayVotes', 'roleRevealAcks',
    'nightTargetUuid', 'dayVoteTargetUuid', 'tribunalVoteUuid', 'tribunalVote',
])

// winResult.winner는 buildSessionSnapshot/buildTerminalFields가 항상 의도적으로 공개하는
// 승패 결과다 — role/team 값('JOKER'/'CITIZEN')과 문자열이 겹칠 수 있으므로 명시적으로
// 승인한다.
// nightResult.deathReveals.*.source도 같은 이유로 명시 승인한다 — 공개 사망 출처 열거값
// ('JOKER'/'WITCH_HUNTER'/'UNKNOWN_NIGHT')은 "어느 진영/사건이 이 죽음을 만들었는가"만 뜻하고
// 특정 참가자의 role 배정을 뜻하지 않는데, 문자열로는 다른 참가자의 role 값과 겹칠 수 있다.
// victimUuid는 이미 공개된 사망자 식별자다(players.*.uuid / nightResult.victimUuid와 동일).
const APPROVED_PUBLIC_VALUE_PATHS = new Set([
    'players.*.uuid',
    'nightResult.victimUuid',
    'nightResult.deathReveals.*.victimUuid',
    'nightResult.deathReveals.*.source',
    'dayVoteResolution.tribunalTargetUuid',
    'tribunal.defendantUuid',
    'tribunal.executedUuid',
    'tribunal.outcome',
    'winResult.winner',
])

function normalizeSnapshotPath(path) {
    return path.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.')
}

function assertNoForbiddenPrivateData(value, secretValues, path = [], insideSelf = false) {
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertNoForbiddenPrivateData(item, secretValues, [...path, i], insideSelf))
        return
    }
    if (value !== null && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
            // 판이 끝난 뒤의 전원 정체 공개(winResult.reveals, 2026-09-22)는 self와 같이 role/team이 허용된다.
            const nextInsideSelf = insideSelf || (path.length === 0 && key === 'self')
                || (path.length === 1 && path[0] === 'winResult' && key === 'reveals')
            assert.ok(
                nextInsideSelf || !FORBIDDEN_PRIVATE_KEYS.has(key),
                `forbidden key "${key}" found at ${[...path, key].join('.') || '(root)'}`,
            )
            assertNoForbiddenPrivateData(val, secretValues, [...path, key], nextInsideSelf)
        }
        return
    }
    if (typeof value === 'string' && !insideSelf && !APPROVED_PUBLIC_VALUE_PATHS.has(normalizeSnapshotPath(path))) {
        for (const secret of secretValues) {
            assert.notStrictEqual(value, secret.value, `leaked ${secret.label} at ${path.join('.') || '(root)'}`)
        }
    }
}

/** viewer를 제외한 나머지 참가자의 role을 secret으로 모은다. */
function collectOtherPlayerRoleSecrets(session, viewerUuid) {
    const secrets = []
    for (const player of session.players.values()) {
        if (player.uuid === viewerUuid) continue
        secrets.push({ value: player.role, label: `role(${player.uuid})=${player.role}` })
    }
    return secrets
}

/** roleCompositionMode: 'custom' settings를 가진 room을 만든다(makeRoom의 CUSTOM 버전). */
function makeCustomRoom({ id = 'custom-room', players, roleCounts, maxPlayers = 10 } = {}) {
    const playerList = players ?? ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid))
    const counts = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, ...roleCounts }
    return {
        id,
        players: new Map(playerList.map((p) => [p.uuid, p])),
        settings: {
            maxPlayers,
            // CUSTOM에서도 기존 소비자를 위해 jokerCount를 유지하되 roleCounts.JOKER와 항상 같다.
            jokerCount: counts.JOKER,
            roleCompositionMode: 'custom',
            roleCounts: counts,
        },
    }
}

function countRoles(session) {
    const counts = { JOKER: 0, CITIZEN: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
    for (const player of session.players.values()) counts[player.role] += 1
    return counts
}

/**
 * 4인 세션(JOKER 1)을 커밋하고 원하는 phase로 맞춘다. jokerCount 1 + randomFn ()=>0이면
 * 배정이 결정적이라 JOKER/비-JOKER를 안정적으로 골라낼 수 있다.
 */
function setupGameChatSession({ id = 'room-gc', phase = 'DAY', uuids = ['gc1', 'gc2', 'gc3', 'gc4'], gameIdFn } = {}) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    session.phase = phase
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const citizenUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    return { session, jokerUuid, citizenUuids }
}

/** 두 채널 rate limit Map의 현재 내용을 비교 가능한 평범한 값으로 떠낸다(원자성 검증용). */
function chatRateLimitSnapshot(session) {
    return {
        DAY: [...session.dayChatRateLimit.entries()],
        DEAD: [...session.deadChatRateLimit.entries()],
        JOKER: [...session.jokerChatRateLimit.entries()],
    }
}

/**
 * prepare가 돌려준 능력(capability)을 그대로 commit한다 — "prepare 직후 곧바로 commit한" 정상
 * 경로다. commit은 자신의 canonical 시계로 sentAt을 검증하므로(미래 금지·최대 age·간격 재검사),
 * 고정 시계로 prepare한 테스트는 같은 시계를 넘겨야 production과 동일한 조건이 된다.
 */
function commitPrepared(prepared, options = {}) {
    // now를 명시적으로 넘긴 경우 그 값이 undefined여도 그대로 시계가 돌려주는 값이어야 한다 —
    // 기본값 문법으로 받으면 { now: undefined }가 조용히 정상 시계로 바뀌어, "시계가 undefined를
    // 돌려주는" 이상값 경로를 검증하지 못한다.
    const now = Object.hasOwn(options, 'now') ? options.now : prepared.sentAt
    return commitGameChatMessage(prepared, { now: () => now })
}

/**
 * 발급된 이후의 prepared 번들을 호출자가 손댄 상황을 그대로 재현한다 — 노출된 최상위 필드와
 * 공개 메시지 필드를 각각 바꿔치기한다. commit이 실제로 쓰는 값은 모듈 사설 능력 기록이므로,
 * 여기서 무엇을 어떻게 바꾸든 반영돼서는 안 된다.
 */
function tamperPrepared(prepared, patch = {}) {
    const { message, ...top } = patch
    Object.assign(prepared, top)
    if (Object.hasOwn(patch, 'message')) {
        // message 자리에 객체가 아닌 값을 심는 변조(null 등)도 그대로 재현한다.
        if (message === null || typeof message !== 'object') prepared.message = message
        else Object.assign(prepared.message, message)
    }
    return prepared
}

/** prepare를 거치지 않고 손으로 조립한, 모양만 같은 가짜 prepared 번들. */
function handBuiltPrepared({ session, channel, actorUuid, nickname, text, sentAt, dayIndex, messageId = 'forged-id' }) {
    return {
        ok: true,
        session,
        channel,
        actorUuid,
        nickname,
        sanitizedText: text,
        sentAt,
        dayIndex,
        message: { gameId: session.id, messageId, senderUuid: actorUuid, nickname, text, sentAt, dayIndex },
    }
}

/**
 * F-25b(A-03): 손으로 조립한 밤 판정 resolution에 **출처 등록**을 붙여 돌려준다.
 *
 * commitNightResolution은 내부 준비 대장에 등재된 객체만 받아들이므로(출처 없는 준비는
 * UNKNOWN_RESOLUTION_SOURCE), 실제 제출 경로로는 만들 수 없는 밤(광대가 동료를 지목해야
 * 성립하는 CITIZEN 승리 분기 등)을 재현하는 기존 테스트들은 이 헬퍼로 fixture를 만든다.
 *
 * production 우회가 아니다 — 등록되는 값도 실제 준비와 똑같이 **등록 시점의** 세션 상태
 * (gameId·dayIndex·participationRevision·진행 revision)로 고정되므로, 오염된 fixture는 여전히
 * victim 검증과 신선도 검증에서 그대로 걸린다.
 *
 * @param {object} session - canonical GameSession
 * @param {object} fields - resolution에 담을 필드(pendingEliminationTargetId 등)
 */
function sourcedNightResolution(session, fields = {}) {
    const resolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        pendingEliminationTargetId: null,
        privateResults: new Map(),
        resolved: true,
        ...fields,
    }
    return gameSession.__registerNightPreparationForTests(session, resolution)
}

module.exports = {
    makePlayer,
    makeRoom,
    sequenceRandom,
    sourcedNightResolution,
    setupTribunalReadySession,
    commitRoleRevealSession,
    validSession,
    ackAllAndRewindToFirstNight,
    commitFullRoleSessionAtNight,
    commitJokerTrioSessionAtNight,
    nightSessionOf3,
    nightSessionOf4NoWin,
    commitAssassinationNight,
    nightSessionWithDoctor,
    nightSessionWithDuplicateRole,
    advanceDayToVotePhase,
    commitTrioSessionAtDay,
    commitQuadSessionAtDay,
    advanceQuadToRevote,
    castAllVotes,
    makeWinConditionSession,
    buildSnapQuadSession,
    ackAll,
    resolveJokerOnlyNight,
    resolveDayVotes,
    resolveTribunalVotes,
    FORBIDDEN_PRIVATE_KEYS,
    APPROVED_PUBLIC_VALUE_PATHS,
    normalizeSnapshotPath,
    assertNoForbiddenPrivateData,
    collectOtherPlayerRoleSecrets,
    makeCustomRoom,
    countRoles,
    setupGameChatSession,
    chatRateLimitSnapshot,
    commitPrepared,
    tamperPrepared,
    handBuiltPrepared,
}
