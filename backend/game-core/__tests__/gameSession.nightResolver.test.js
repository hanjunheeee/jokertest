// 공용 밤 행동 리졸버 계약: resolveRoleNightAction의 시나리오 × 역할 표 · 역할별 정책(다수결/
// 만장일치) · prepareNightResolution을 통과하는 통합 경로(중복 역할 세션).

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    NIGHT_ACTION_RESOLUTION_POLICY,
    collectRoleNightSubmissions,
    resolveRoleNightAction,
} = gameSession.__testables
const { submitNightAction, prepareNightResolution } = gameSession
const { nightSessionWithDuplicateRole } = require('./gameSession.testUtils')

test.beforeEach(() => {
    gameSession.__resetStateForTests()
})
test.afterEach(() => {
    gameSession.__resetStateForTests()
})

// ---------------------------------------------------------------------------
// 리졸버 단위 테스트 — registry를 건드리지 않는 순수 계산이므로 최소 session 모양만 조립한다.
// (players/nightActions/dayIndex 셋이 이 함수가 읽는 전부다. 커밋된 세션을 쓰면 역할 배정이
// 셔플에 좌우돼 "어떤 제출이 어떤 결과를 만드는가"를 좁게 고정할 수 없다.)
// ---------------------------------------------------------------------------

const T1 = 'target-1'
const T2 = 'target-2'

/**
 * actors: [{ role, alive?, target? }] — target을 생략하면 미제출(nightActions에 entry 없음),
 * null을 주면 SKIP이다. 대상(T1/T2)은 참가자로도 함께 등재한다(리졸버는 읽지 않지만, 세션
 * 모양을 실제와 어긋나게 두지 않기 위함).
 */
function synthNightSession(actors, { dayIndex = 2 } = {}) {
    const players = new Map()
    const nightActions = new Map()
    for (const [index, actor] of actors.entries()) {
        const uuid = `a-${index}`
        players.set(uuid, { uuid, role: actor.role, alive: actor.alive !== false })
        if (Object.hasOwn(actor, 'target')) nightActions.set(uuid, actor.target)
    }
    for (const targetUuid of [T1, T2]) {
        players.set(targetUuid, { uuid: targetUuid, role: 'CITIZEN', alive: true })
    }
    return { players, nightActions, dayIndex }
}

const RESOLVER_ROLES = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']

// AC-02의 5개 시나리오. 네 역할 모두 같은 기대값을 갖는다 — 2명이 갈린 경우는 JOKER의 다수결로도
// 동률이라 null이고, 나머지 셋은 만장일치가 깨져 null이다. 두 정책이 갈리는 지점(3명 2:1)은
// 아래 정책별 테스트에서 따로 고정한다.
const RESOLVER_SCENARIOS = [
    {
        name: '동일 대상 지목 → 그 대상',
        actors: (role) => [{ role, target: T1 }, { role, target: T1 }],
        expected: T1,
    },
    {
        name: '지목 + skip → 지목된 대상(skip은 집계에서 빠진다)',
        actors: (role) => [{ role, target: T1 }, { role, target: null }],
        expected: T1,
    },
    {
        name: '상충하는 지목 → null',
        actors: (role) => [{ role, target: T1 }, { role, target: T2 }],
        expected: null,
    },
    {
        name: '전원 skip → null',
        actors: (role) => [{ role, target: null }, { role, target: null }],
        expected: null,
    },
    {
        name: '단독 생존(사망자의 잔여 제출은 무시) → 생존자의 지목',
        actors: (role) => [{ role, target: T1 }, { role, target: T2, alive: false }],
        expected: T1,
    },
]

for (const role of RESOLVER_ROLES) {
    for (const scenario of RESOLVER_SCENARIOS) {
        test(`resolveRoleNightAction: ${role} — ${scenario.name}`, () => {
            const session = synthNightSession(scenario.actors(role))
            assert.equal(resolveRoleNightAction(session, role), scenario.expected)
        })
    }
}

// --- 정책 표: 역할별 분기가 아니라 이 표 하나가 상충 처리를 가른다 ---

test('NIGHT_ACTION_RESOLUTION_POLICY: JOKER만 PLURALITY이고 나머지 셋은 UNANIMOUS다', () => {
    assert.deepEqual({ ...NIGHT_ACTION_RESOLUTION_POLICY }, {
        JOKER: 'PLURALITY',
        DOCTOR: 'UNANIMOUS',
        GUARD: 'UNANIMOUS',
        WITCH_HUNTER: 'UNANIMOUS',
    })
})

test('resolveRoleNightAction(AC-05): JOKER 3명이 2:1로 갈리면 다수 대상이 당선된다(다수결 보존)', () => {
    const session = synthNightSession([
        { role: 'JOKER', target: T1 },
        { role: 'JOKER', target: T1 },
        { role: 'JOKER', target: T2 },
    ])
    assert.equal(resolveRoleNightAction(session, 'JOKER'), T1)
})

test('resolveRoleNightAction(AC-05): JOKER 3명이 전부 다른 대상이면 동률이라 null이다', () => {
    const session = synthNightSession([
        { role: 'JOKER', target: T1 },
        { role: 'JOKER', target: T2 },
        { role: 'JOKER', target: 'target-3' },
    ])
    assert.equal(resolveRoleNightAction(session, 'JOKER'), null)
})

test('resolveRoleNightAction: DOCTOR 3명이 2:1로 갈리면 다수여도 null이다(UNANIMOUS — JOKER와 대조)', () => {
    const session = synthNightSession([
        { role: 'DOCTOR', target: T1 },
        { role: 'DOCTOR', target: T1 },
        { role: 'DOCTOR', target: T2 },
    ])
    assert.equal(resolveRoleNightAction(session, 'DOCTOR'), null)
})

// --- 경계: 행위자가 없는 역할 / 미제출 / dayIndex 비활성 ---

test('resolveRoleNightAction: 그 역할의 생존 행위자가 하나도 없으면 null이다', () => {
    const session = synthNightSession([{ role: 'DOCTOR', target: T1, alive: false }])
    assert.equal(resolveRoleNightAction(session, 'DOCTOR'), null)
})

test('resolveRoleNightAction: 미제출(entry 없음)은 SKIP과 같게 취급된다', () => {
    const session = synthNightSession([{ role: 'GUARD' }, { role: 'GUARD', target: T1 }])
    assert.equal(resolveRoleNightAction(session, 'GUARD'), T1)
})

test('resolveRoleNightAction: WITCH_HUNTER는 dayIndex 1까지 행위자가 없어 null이고, 2부터 판정된다', () => {
    const actors = [{ role: 'WITCH_HUNTER', target: T1 }, { role: 'WITCH_HUNTER', target: T1 }]
    assert.equal(resolveRoleNightAction(synthNightSession(actors, { dayIndex: 1 }), 'WITCH_HUNTER'), null)
    assert.equal(resolveRoleNightAction(synthNightSession(actors, { dayIndex: 2 }), 'WITCH_HUNTER'), T1)
})

test('resolveRoleNightAction: 밤 행동이 없는 역할(CITIZEN)은 제출이 있어도 null이다', () => {
    const session = synthNightSession([{ role: 'CITIZEN', target: T1 }])
    assert.equal(resolveRoleNightAction(session, 'CITIZEN'), null)
})

test('collectRoleNightSubmissions: 그 역할의 생존 행위자만, 미제출은 null로 접어서 돌려준다', () => {
    const session = synthNightSession([
        { role: 'DOCTOR', target: T1 },
        { role: 'DOCTOR' },
        { role: 'DOCTOR', target: T2, alive: false },
        { role: 'GUARD', target: T1 },
    ])

    assert.deepEqual(collectRoleNightSubmissions(session, 'DOCTOR'), [
        { actorUuid: 'a-0', target: T1 },
        { actorUuid: 'a-1', target: null },
    ])
})

// ---------------------------------------------------------------------------
// 통합 경로 — 실제로 커밋된 중복 역할 세션이 prepareNightResolution을 통과할 때의 계약.
// ---------------------------------------------------------------------------

// --- AC-03: DOCTOR 2명 ---

test('AC-03: DOCTOR 2명이 같은 대상을 보호하면 그 대상만 protectedTargetIds에 담기고 암살이 막힌다', () => {
    const { session, roleUuids, jokerUuids, citizenUuids } = nightSessionWithDuplicateRole({
        id: 'room-dup-doc-same',
        role: 'DOCTOR',
    })
    const targetUuid = citizenUuids[0]

    for (const doctorUuid of roleUuids) submitNightAction(doctorUuid, session.id, targetUuid)
    submitNightAction(jokerUuids[0], session.id, targetUuid)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual([...prepared.resolution.protectedTargetIds], [targetUuid])
    assert.equal(prepared.resolution.assassinationTargetId, targetUuid)
    assert.equal(prepared.resolution.pendingEliminationTargetId, null, '보호로 암살이 막혀야 한다')
})

test('AC-03: DOCTOR 2명이 서로 다른 대상을 보호하면 보호 결과가 없고(빈 Set) 암살이 그대로 통과한다', () => {
    const { session, roleUuids, jokerUuids, citizenUuids } = nightSessionWithDuplicateRole({
        id: 'room-dup-doc-split',
        role: 'DOCTOR',
    })
    const [first, second] = citizenUuids

    submitNightAction(roleUuids[0], session.id, first)
    submitNightAction(roleUuids[1], session.id, second)
    submitNightAction(jokerUuids[0], session.id, first)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.protectedTargetIds instanceof Set, true, 'Set 타입은 유지된다')
    assert.equal(prepared.resolution.protectedTargetIds.size, 0)
    assert.equal(prepared.resolution.pendingEliminationTargetId, first, '보호가 없으니 암살이 성사된다')
})

// --- AC-04: WITCH_HUNTER 2명 (dayIndex 2 · 대상은 사망자여야 한다) ---

/** WH 2명 + JOKER 1명 세션을 둘째 밤으로 세우고, 확인 대상이 될 사망자 둘을 만든다. */
function witchHunterPairNight(id) {
    const fixture = nightSessionWithDuplicateRole({
        id,
        role: 'WITCH_HUNTER',
        playerCount: 7,
        dayIndex: 2,
    })
    const [deadA, deadB, aliveCitizen] = fixture.citizenUuids
    fixture.session.players.get(deadA).alive = false
    fixture.session.players.get(deadB).alive = false
    return { ...fixture, deadA, deadB, aliveCitizen }
}

test('AC-04: WITCH_HUNTER 2명이 같은 대상을 확인하면 canonical 단일 결과가 두 사람에게 동일하게 전달된다', () => {
    const { session, roleUuids, jokerUuids, deadA } = witchHunterPairNight('room-dup-wh-same')

    for (const whUuid of roleUuids) submitNightAction(whUuid, session.id, deadA)
    submitNightAction(jokerUuids[0], session.id, null)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    const expected = { actionType: 'CONFIRM', targetId: deadA, role: session.players.get(deadA).role }
    for (const whUuid of roleUuids) {
        assert.deepEqual(prepared.resolution.privateResults.get(whUuid), expected)
    }
    // 값은 같아도 객체는 수신자마다 따로다 — 한 수신자 경로의 오염이 나머지에 전파되지 않는다.
    assert.notEqual(
        prepared.resolution.privateResults.get(roleUuids[0]),
        prepared.resolution.privateResults.get(roleUuids[1]),
    )
})

test('AC-04: WITCH_HUNTER 2명이 서로 다른 대상을 확인하면 어느 쪽에도 결과가 가지 않는다', () => {
    const { session, roleUuids, jokerUuids, deadA, deadB } = witchHunterPairNight('room-dup-wh-split')

    submitNightAction(roleUuids[0], session.id, deadA)
    submitNightAction(roleUuids[1], session.id, deadB)
    submitNightAction(jokerUuids[0], session.id, null)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    for (const whUuid of roleUuids) {
        assert.equal(prepared.resolution.privateResults.has(whUuid), false)
    }
})

// --- GUARD도 같은 리팩터링을 받는다(AC-01 회귀) ---

test('AC-01: GUARD 2명이 같은 대상을 조사하면 둘 다 같은 결과를 받고, 갈리면 둘 다 받지 못한다', () => {
    const same = nightSessionWithDuplicateRole({ id: 'room-dup-guard-same', role: 'GUARD' })
    for (const guardUuid of same.roleUuids) {
        submitNightAction(guardUuid, same.session.id, same.citizenUuids[0])
    }
    submitNightAction(same.jokerUuids[0], same.session.id, null)
    const samePrepared = prepareNightResolution(same.jokerUuids[0], same.session.id)

    assert.equal(samePrepared.ok, true)
    for (const guardUuid of same.roleUuids) {
        assert.deepEqual(samePrepared.resolution.privateResults.get(guardUuid), {
            actionType: 'INVESTIGATE',
            targetId: same.citizenUuids[0],
            role: same.session.players.get(same.citizenUuids[0]).role,
        })
    }

    const split = nightSessionWithDuplicateRole({ id: 'room-dup-guard-split', role: 'GUARD' })
    submitNightAction(split.roleUuids[0], split.session.id, split.citizenUuids[0])
    submitNightAction(split.roleUuids[1], split.session.id, split.citizenUuids[1])
    submitNightAction(split.jokerUuids[0], split.session.id, null)
    const splitPrepared = prepareNightResolution(split.jokerUuids[0], split.session.id)

    assert.equal(splitPrepared.ok, true)
    for (const guardUuid of split.roleUuids) {
        assert.equal(splitPrepared.resolution.privateResults.has(guardUuid), false)
    }
})

// --- AC-06: 역할 보유자 1명 / 사망으로 eligible actor에서 빠지는 경우 ---

test('AC-06: 역할 보유자가 1명이면 그 제출이 그대로 확정된다', () => {
    const { session, roleUuids, jokerUuids, citizenUuids } = nightSessionWithDuplicateRole({
        id: 'room-dup-solo-doc',
        role: 'DOCTOR',
        count: 1,
    })
    const targetUuid = citizenUuids[0]

    submitNightAction(roleUuids[0], session.id, targetUuid)
    submitNightAction(jokerUuids[0], session.id, targetUuid)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual([...prepared.resolution.protectedTargetIds], [targetUuid])
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
})

test('AC-06: 상충하던 DOCTOR 한 명이 사망하면 남은 생존자의 제출만으로 보호가 확정된다', () => {
    const { session, roleUuids, jokerUuids, citizenUuids } = nightSessionWithDuplicateRole({
        id: 'room-dup-doc-death',
        role: 'DOCTOR',
    })
    const [survivorTarget, otherTarget] = citizenUuids
    const [survivingDoctor, dyingDoctor] = roleUuids

    submitNightAction(survivingDoctor, session.id, survivorTarget)
    submitNightAction(dyingDoctor, session.id, otherTarget)
    submitNightAction(jokerUuids[0], session.id, survivorTarget)

    // 상충 상태에서는 보호가 없다.
    const before = prepareNightResolution(jokerUuids[0], session.id)
    assert.equal(before.resolution.protectedTargetIds.size, 0)

    // 그 의사가 사망하면 잔여 entry는 남아 있어도 판정에서 빠진다.
    session.players.get(dyingDoctor).alive = false
    assert.equal(session.nightActions.get(dyingDoctor), otherTarget, '잔여 엔트리 자체는 지워지지 않는다')

    const after = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(after.ok, true)
    assert.deepEqual([...after.resolution.protectedTargetIds], [survivorTarget])
    assert.equal(after.resolution.pendingEliminationTargetId, null, '남은 의사의 보호가 암살을 막는다')
})

test('AC-06: 상충하던 JOKER 한 명이 사망하면 남은 JOKER의 지목이 암살 대상이 된다', () => {
    const { session, jokerUuids, citizenUuids } = nightSessionWithDuplicateRole({
        id: 'room-dup-joker-death',
        role: 'JOKER',
        jokerCount: 2,
    })
    const [survivor, dying] = jokerUuids
    const [firstTarget, secondTarget] = citizenUuids

    submitNightAction(survivor, session.id, firstTarget)
    submitNightAction(dying, session.id, secondTarget)

    const before = prepareNightResolution(survivor, session.id)
    assert.equal(before.resolution.assassinationTargetId, null, '2명이 갈리면 동률이라 대상이 없다')

    session.players.get(dying).alive = false
    const after = prepareNightResolution(survivor, session.id)

    assert.equal(after.ok, true)
    assert.equal(after.resolution.assassinationTargetId, firstTarget)
    assert.equal(after.resolution.pendingEliminationTargetId, firstTarget)
})
