const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../../../game-core/gameSession')
const {
    assignRoles,
    getSpecialRoleBudget,
    computeRoleComposition,
    requiresAliveTarget,
} = gameSession.__testables
const {
    prepareGameSession,
    commitGameSession,
    buildGameStartedPayload,
    GAME_ROLES,
    ROLE_DEFINITIONS,
    ROLE_TEAMS,
} = gameSession
const { buildSessionCandidate } = gameSession.__testables
const {
    makePlayer,
    makeRoom,
    sequenceRandom,
    makeCustomRoom,
    countRoles,
} = require('../../helpers/gameSession.testUtils')

test.beforeEach(() => {
    gameSession.__resetStateForTests()
})
test.afterEach(() => {
    gameSession.__resetStateForTests()
})

test('assignRoles: 고정 randomFn을 주입하면 예측 가능한 순서로 섞이고 jokerCount만큼 JOKER가 배정된다', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c'), makePlayer('d')]
    const assigned = assignRoles(players, 2, () => 0)

    assert.equal(assigned.length, 4)
    const jokerCount = assigned.filter((p) => p.role === GAME_ROLES.JOKER).length
    const citizenCount = assigned.filter((p) => p.role === GAME_ROLES.CITIZEN).length
    assert.equal(jokerCount, 2)
    assert.equal(citizenCount, 2)
})

test('assignRoles: 중복 배정이 없고 원본 players 배열/원소를 변형하지 않는다', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')]
    const before = JSON.parse(JSON.stringify(players))

    const assigned = assignRoles(players, 1, Math.random)

    const uuids = assigned.map((p) => p.uuid)
    assert.equal(new Set(uuids).size, uuids.length)
    assert.deepEqual(players, before)
})

function countByRole(assigned) {
    const counts = { JOKER: 0, CITIZEN: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
    for (const player of assigned) counts[player.role] += 1
    return counts
}

test('assignRoles: 6명·jokerCount 1이면 DOCTOR 1명이 배정된다(개수는 computeRoleComposition과 동일한 결정적 randomFn으로 확인)', () => {
    const players = Array.from({ length: 6 }, (_, i) => makePlayer(`p${i}`))
    const assigned = assignRoles(players, 1, () => 0.999)

    assert.equal(assigned.length, 6)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(6, 1))
})

test('assignRoles: 8명·jokerCount 1이면 DOCTOR 1명·GUARD 1명이 배정된다', () => {
    const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i}`))
    const assigned = assignRoles(players, 1, () => 0.999)

    assert.equal(assigned.length, 8)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(8, 1))
})

test('assignRoles: 10명·jokerCount 1이면 DOCTOR/GUARD/WITCH_HUNTER가 각 1명씩 배정된다', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`p${i}`))
    const assigned = assignRoles(players, 1, () => 0.999)

    assert.equal(assigned.length, 10)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(10, 1))
})

test('getSpecialRoleBudget: 인원 구간별 특수 시민 역할 상한이 확정된 구성표와 일치한다', () => {
    for (const playerCount of [2, 3, 4, 5]) {
        assert.deepEqual(getSpecialRoleBudget(playerCount), { DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 })
    }
    for (const playerCount of [6, 7]) {
        assert.deepEqual(getSpecialRoleBudget(playerCount), { DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
    }
    for (const playerCount of [8, 9]) {
        assert.deepEqual(getSpecialRoleBudget(playerCount), { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 })
    }
    assert.deepEqual(getSpecialRoleBudget(10), { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
})

function expectedComposition(playerCount, jokerCount) {
    const budget = getSpecialRoleBudget(playerCount)
    let remaining = playerCount - jokerCount
    const doctor = Math.min(budget.DOCTOR, remaining)
    remaining -= doctor
    const guard = Math.min(budget.GUARD, remaining)
    remaining -= guard
    const witchHunter = Math.min(budget.WITCH_HUNTER, remaining)
    remaining -= witchHunter
    return { JOKER: jokerCount, DOCTOR: doctor, GUARD: guard, WITCH_HUNTER: witchHunter, CITIZEN: remaining }
}

test('computeRoleComposition: 2~10명 × 모든 유효 jokerCount(0..playerCount-1) 전 조합(54개)에서 불변조건을 만족한다', () => {
    let combinationsChecked = 0
    for (let playerCount = 2; playerCount <= 10; playerCount += 1) {
        for (let jokerCount = 0; jokerCount < playerCount; jokerCount += 1) {
            const result = computeRoleComposition(playerCount, jokerCount)
            const expected = expectedComposition(playerCount, jokerCount)

            assert.deepEqual(result, expected, `playerCount=${playerCount}, jokerCount=${jokerCount}`)

            const sum = result.JOKER + result.DOCTOR + result.GUARD + result.WITCH_HUNTER + result.CITIZEN
            assert.equal(sum, playerCount, `합계 불일치: playerCount=${playerCount}, jokerCount=${jokerCount}`)
            assert.equal(result.JOKER, jokerCount)
            for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']) {
                assert.ok(result[role] >= 0, `${role} 수가 음수: playerCount=${playerCount}, jokerCount=${jokerCount}`)
            }
            const budget = getSpecialRoleBudget(playerCount)
            assert.ok(result.DOCTOR <= budget.DOCTOR)
            assert.ok(result.GUARD <= budget.GUARD)
            assert.ok(result.WITCH_HUNTER <= budget.WITCH_HUNTER)

            const nonJokerCount = playerCount - jokerCount
            const citizenTeamCount = result.CITIZEN + result.DOCTOR + result.GUARD + result.WITCH_HUNTER
            if (nonJokerCount >= 1) assert.ok(citizenTeamCount >= 1)

            combinationsChecked += 1
        }
    }
    assert.equal(combinationsChecked, 54)
})

test('computeRoleComposition: 8명·jokerCount 7(socket 계층 상한 밖) — DOCTOR만 1명 배정되고 GUARD/WITCH_HUNTER는 0, 세션은 거부되지 않는다', () => {
    const result = computeRoleComposition(8, 7)
    assert.deepEqual(result, { JOKER: 7, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 })
})

test('GAME_ROLES: 정확히 5개 역할이 자기 자신 값으로 매핑되고, 기존 JOKER/CITIZEN 값은 유지된다', () => {
    assert.deepEqual(Object.keys(GAME_ROLES).sort(), ['CITIZEN', 'DOCTOR', 'GUARD', 'JOKER', 'WITCH_HUNTER'])
    assert.equal(GAME_ROLES.JOKER, 'JOKER')
    assert.equal(GAME_ROLES.CITIZEN, 'CITIZEN')
    assert.equal(GAME_ROLES.DOCTOR, 'DOCTOR')
    assert.equal(GAME_ROLES.GUARD, 'GUARD')
    assert.equal(GAME_ROLES.WITCH_HUNTER, 'WITCH_HUNTER')
})

test('ROLE_TEAMS: JOKER만 JOKER팀이고 나머지 4개 역할은 모두 CITIZEN팀이다', () => {
    assert.deepEqual(ROLE_TEAMS, {
        JOKER: 'JOKER',
        CITIZEN: 'CITIZEN',
        DOCTOR: 'CITIZEN',
        GUARD: 'CITIZEN',
        WITCH_HUNTER: 'CITIZEN',
    })
})

test('ROLE_DEFINITIONS: nightActionMinDayIndex가 WITCH_HUNTER 첫날밤 비활성 정책과 정확히 일치한다', () => {
    assert.equal(ROLE_DEFINITIONS.JOKER.nightActionMinDayIndex, 0)
    assert.equal(ROLE_DEFINITIONS.CITIZEN.nightActionMinDayIndex, null)
    assert.equal(ROLE_DEFINITIONS.DOCTOR.nightActionMinDayIndex, 0)
    assert.equal(ROLE_DEFINITIONS.GUARD.nightActionMinDayIndex, 0)
    assert.equal(ROLE_DEFINITIONS.WITCH_HUNTER.nightActionMinDayIndex, 2)
})

test('ROLE_DEFINITIONS: targetMustBeAlive는 WITCH_HUNTER만 false다', () => {
    assert.equal(ROLE_DEFINITIONS.JOKER.targetMustBeAlive, true)
    assert.equal(ROLE_DEFINITIONS.CITIZEN.targetMustBeAlive, true)
    assert.equal(ROLE_DEFINITIONS.DOCTOR.targetMustBeAlive, true)
    assert.equal(ROLE_DEFINITIONS.GUARD.targetMustBeAlive, true)
    assert.equal(ROLE_DEFINITIONS.WITCH_HUNTER.targetMustBeAlive, false)
})

test('requiresAliveTarget: WITCH_HUNTER만 false이고 알 수 없는 역할은 fail-closed로 true다', () => {
    assert.equal(requiresAliveTarget('JOKER'), true)
    assert.equal(requiresAliveTarget('CITIZEN'), true)
    assert.equal(requiresAliveTarget('DOCTOR'), true)
    assert.equal(requiresAliveTarget('GUARD'), true)
    assert.equal(requiresAliveTarget('WITCH_HUNTER'), false)
    for (const unknown of ['MAYOR', '', undefined, null]) {
        assert.equal(requiresAliveTarget(unknown), true, `${String(unknown)}은 생존 대상을 요구해야 함`)
    }
})

test('ROLE_DEFINITIONS: 바깥 객체와 각 역할 정의 모두 개별적으로 동결되어 외부에서 변형할 수 없다', () => {
    assert.equal(Object.isFrozen(ROLE_DEFINITIONS), true)
    for (const role of Object.keys(GAME_ROLES)) {
        assert.equal(Object.isFrozen(ROLE_DEFINITIONS[role]), true, `${role} 정의가 동결되지 않음`)
    }

    const before = { ...ROLE_DEFINITIONS.WITCH_HUNTER }
    ROLE_DEFINITIONS.WITCH_HUNTER.nightActionMinDayIndex = 0
    ROLE_DEFINITIONS.WITCH_HUNTER.targetMustBeAlive = true
    ROLE_DEFINITIONS.JOKER.team = 'CITIZEN'
    assert.deepEqual(ROLE_DEFINITIONS.WITCH_HUNTER, before)
    assert.equal(ROLE_DEFINITIONS.WITCH_HUNTER.targetMustBeAlive, false)
    assert.equal(ROLE_DEFINITIONS.JOKER.team, 'JOKER')
})

test('export 호환성: __testables.assignRoles가 여전히 존재하고, ROLE_DEFINITIONS/ROLE_TEAMS/composition helper가 새로 노출된다', () => {
    assert.equal(typeof gameSession.__testables.assignRoles, 'function')
    assert.equal(typeof gameSession.ROLE_DEFINITIONS, 'object')
    assert.equal(typeof gameSession.ROLE_TEAMS, 'object')
    assert.equal(typeof gameSession.__testables.computeRoleComposition, 'function')
    assert.equal(typeof gameSession.__testables.getSpecialRoleBudget, 'function')
})

test('공개 payload 화이트리스트: game-started 타인 player 키 무변경', () => {
    const room = makeRoom()
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    const payload = buildGameStartedPayload(candidate.session, 'u1')
    for (const player of payload.state.players) {
        assert.deepEqual(
            Object.keys(player).sort(),
            ['isAlive', 'isParticipating', 'membershipId', 'nickname', 'themeIndex', 'uuid'],
        )
    }
})

test('game_started themeIndex: 뷰어가 달라도 uuid→themeIndex 매핑이 완전히 동일하다', () => {
    const room = makeRoom()
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })

    const mappingFor = (viewerUuid) =>
        buildGameStartedPayload(candidate.session, viewerUuid).state.players.map((p) => [p.uuid, p.themeIndex])

    assert.deepEqual(mappingFor('u1'), mappingFor('u2'))
    assert.deepEqual(mappingFor('u1'), mappingFor('u3'))
})

test('game_started themeIndex: 10인 세션의 배정은 0..9의 순열이다(중복 없음)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`p${i + 1}`))
    const room = makeRoom({ players, jokerCount: 2 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })

    const indices = buildGameStartedPayload(candidate.session, 'p1').state.players.map((p) => p.themeIndex)
    assert.deepEqual([...indices].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('game_started themeIndex: 모든 값이 팔레트 범위(0 <= i < 10) 안의 정수다', () => {
    const room = makeRoom()
    const candidate = buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => 'game-theme-range' })

    for (const player of buildGameStartedPayload(candidate.session, 'u1').state.players) {
        assert.equal(Number.isInteger(player.themeIndex), true)
        assert.equal(player.themeIndex >= 0 && player.themeIndex < 10, true)
    }
})

test('game_started themeIndex: session.id가 다르면 배정 순서도 달라진다', () => {
    const buildFor = (gameId) => {
        const candidate = buildSessionCandidate(makeRoom(), { randomFn: () => 0, gameIdFn: () => gameId })
        return buildGameStartedPayload(candidate.session, 'u1').state.players.map((p) => p.themeIndex)
    }

    assert.notDeepEqual(buildFor('game-theme-a'), buildFor('game-theme-b'))
})

test('CUSTOM: 지정한 고정 역할 수가 정확히 그대로 배정되고 나머지 인원이 CITIZEN이 된다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.ok, true)
    assert.deepEqual(countRoles(prepared.session), { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 2 })
    assert.equal(computeRoleComposition(7, 2).WITCH_HUNTER, 0)
    assert.equal(prepared.session.players.size, 7)
})

test('CUSTOM: 고정 역할 합이 정확히 인원과 같으면 CITIZEN은 0명이 된다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.ok, true)
    assert.deepEqual(countRoles(prepared.session), { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 0 })
})

test('CUSTOM: session.jokerCount와 resolvedComposition.JOKER는 같은 값에서 파생된다', () => {
    const room = makeCustomRoom({ roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } })
    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.session.jokerCount, 2)
    assert.equal(prepared.session.roleComposition.JOKER, prepared.session.jokerCount)
    assert.deepEqual(prepared.session.roleComposition, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 2 })
    room.settings.roleCounts.JOKER = 9
    assert.equal(prepared.session.roleComposition.JOKER, 2)
})

test('CUSTOM: 고정 역할 합이 실제 참가 인원을 넘으면 준비 단계에서 거부되고 registry는 그대로다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = prepareGameSession(room)

    assert.equal(prepared.ok, false)
    assert.equal(prepared.code, 'INVALID_SESSION_INPUT')
    assert.match(prepared.reason, /INVALID_ROLE_COMPOSITION/)
    const snapshot = gameSession.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 0)
    assert.equal(snapshot.playerSession.length, 0)
    assert.equal(snapshot.roomGameSession.length, 0)
})

test('CUSTOM: JOKER 수가 실제 참가 인원 이상이면 준비 단계에서 거부된다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 3, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
    })
    const prepared = prepareGameSession(room)

    assert.equal(prepared.ok, false)
    assert.equal(prepared.code, 'INVALID_SESSION_INPUT')
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
    test(`CUSTOM: ${role} 3명은 상한(2명)을 넘어 시작 단계에서 ROLE_COUNT_ABOVE_LIMIT으로 거부된다`, () => {
        const room = makeCustomRoom({
            players: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].map((uuid) => makePlayer(uuid)),
            roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, [role]: 3 },
        })

        const prepared = prepareGameSession(room)

        assert.equal(prepared.ok, false)
        assert.equal(prepared.code, 'INVALID_SESSION_INPUT')
        assert.match(prepared.reason, /INVALID_ROLE_COMPOSITION:ROLE_COUNT_ABOVE_LIMIT/)
        assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
    })

    test(`CUSTOM: ${role} 2명은 상한 안이므로 그대로 시작된다`, () => {
        const room = makeCustomRoom({
            players: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'].map((uuid) => makePlayer(uuid)),
            roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, [role]: 2 },
        })

        const prepared = prepareGameSession(room)

        assert.equal(prepared.ok, true)
        assert.equal(prepared.session.roleComposition[role], 2)
    })
}

test('AUTO: 저장된 jokerCount가 상한(2명)을 넘으면 시작 단계에서 ROLE_COUNT_ABOVE_LIMIT으로 거부된다', () => {
    const room = makeRoom({
        id: 'room-auto-cap',
        players: Array.from({ length: 8 }, (_, i) => makePlayer(`ac${i}`)),
        jokerCount: 3,
    })

    const prepared = prepareGameSession(room)

    assert.equal(prepared.ok, false)
    assert.equal(prepared.code, 'INVALID_SESSION_INPUT')
    assert.match(prepared.reason, /INVALID_ROLE_COMPOSITION:ROLE_COUNT_ABOVE_LIMIT/)
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: 저장된 jokerCount와 roleCounts.JOKER가 어긋난 방은 시작할 수 없다', () => {
    const room = makeCustomRoom({ roleCounts: { JOKER: 2, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } })
    room.settings.jokerCount = 1

    const prepared = prepareGameSession(room)
    assert.equal(prepared.ok, false)
    assert.match(prepared.reason, /JOKER_COUNT_MISMATCH/)
})

test('CUSTOM: 결정적 randomFn을 주면 배정 결과가 완전히 재현된다', () => {
    const players = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((uuid) => makePlayer(uuid))
    const roleCounts = { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }
    const build = () =>
        buildSessionCandidate(makeCustomRoom({ players, roleCounts }), {
            randomFn: sequenceRandom([0.1, 0.9, 0.3, 0.7, 0.5]),
            gameIdFn: () => 'fixed-game-id',
        })

    const first = build()
    const second = build()

    const roleOf = (candidate) => [...candidate.session.players.values()].map((p) => `${p.uuid}:${p.role}`)
    assert.deepEqual(roleOf(first), roleOf(second))
    assert.deepEqual(countRoles(first.session), { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 2 })
})

test('CUSTOM: 원본 players/settings 객체를 변형하지 않는다', () => {
    const players = ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid))
    const room = makeCustomRoom({ players, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } })
    const settingsBefore = JSON.parse(JSON.stringify(room.settings))

    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.ok, true)
    assert.deepEqual(room.settings, settingsBefore)
    for (const player of players) {
        assert.equal(Object.hasOwn(player, 'role'), false)
        assert.equal(Object.hasOwn(player, 'alive'), false)
    }
    for (const player of room.players.values()) {
        assert.equal(Object.hasOwn(player, 'role'), false)
    }
})

test('CUSTOM: commit 검증은 조작된 역할 분포를 거부한다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)
    const doctor = [...prepared.session.players.values()].find((p) => p.role === 'DOCTOR')
    doctor.role = 'CITIZEN'

    assert.throws(() => commitGameSession(prepared.session), /실제 DOCTOR 수/)
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: commit 검증은 역할 교체로 어긋난 두 역할을 모두 메시지에 적는다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)
    const doctor = [...prepared.session.players.values()].find((p) => p.role === 'DOCTOR')
    doctor.role = 'CITIZEN'

    assert.throws(() => commitGameSession(prepared.session), (error) => {
        assert.match(error.message, /실제 DOCTOR 수\(0\)가 기대값\(1\)과 불일치/)
        assert.match(error.message, /실제 CITIZEN 수\(2\)가 기대값\(1\)과 불일치/)
        return true
    })
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: commit 검증은 조작된 session.roleComposition을 거부한다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })

    const totalMismatch = buildSessionCandidate(room)
    totalMismatch.session.roleComposition = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 5 }
    assert.throws(() => commitGameSession(totalMismatch.session), /session\.roleComposition\(TOTAL_MISMATCH\)/)

    const jokerMismatch = buildSessionCandidate(room)
    jokerMismatch.session.roleComposition = { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 0 }
    assert.throws(() => commitGameSession(jokerMismatch.session), /session\.roleComposition\(JOKER_COUNT_MISMATCH\)/)

    const missingKey = buildSessionCandidate(room)
    missingKey.session.roleComposition = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }
    assert.throws(() => commitGameSession(missingKey.session), /session\.roleComposition\(UNEXPECTED_KEYS\)/)

    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: 커밋된 세션의 공개 payload에는 역할 구성이 노출되지 않는다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = prepareGameSession(room)
    commitGameSession(prepared.session)

    const payload = buildGameStartedPayload(prepared.session, 'c1')
    assert.equal(Object.hasOwn(payload.state, 'roleComposition'), false)
    assert.equal(Object.hasOwn(payload.state, 'roleCounts'), false)

    assert.deepEqual(payload.state.roomSettingsSource.settings.roleCounts, room.settings.roleCounts)
    assert.notDeepEqual(
        payload.state.roomSettingsSource.settings.roleCounts,
        prepared.session.roleComposition,
        'CITIZEN까지 포함된 배정 결과가 복원 원본으로 새어 나갔다',
    )
    assert.equal(Object.hasOwn(payload.state.roomSettingsSource.settings.roleCounts, 'CITIZEN'), false)

    const withoutRestoreSource = JSON.stringify({
        ...payload,
        state: { ...payload.state, roomSettingsSource: undefined },
    })
    assert.equal(withoutRestoreSource.includes('roleComposition'), false)
    assert.equal(withoutRestoreSource.includes('roleCounts'), false)
    for (const player of payload.state.players) {
        assert.deepEqual(
            Object.keys(player).sort(),
            ['isAlive', 'isParticipating', 'membershipId', 'nickname', 'themeIndex', 'uuid'],
        )
    }
})

test('AUTO: roleComposition이 없는(수동 조립) 세션은 기존 computeRoleComposition 계약으로 검증된다', () => {
    const room = makeRoom({ players: ['a1', 'a2', 'a3', 'a4'].map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const prepared = buildSessionCandidate(room)
    delete prepared.session.roleComposition

    commitGameSession(prepared.session)
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 1)
})
