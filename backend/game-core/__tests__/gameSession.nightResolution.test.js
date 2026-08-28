// 밤 판정 계약: prepare/commitNightResolution · 공개 사망 reveal · 보호 실패 통지/판정 순서 · 밤을 벗어나는 전이.

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    buildSessionCandidate,
    getEligibleNightActorUuids,
    resolveNightDeathSource,
    buildNightDeathReveals,
    expireDeadPlayerNightEffects,
} = gameSession.__testables
const {
    commitGameSession,
    submitNightAction,
    prepareNightResolution,
    commitNightResolution,
    buildNightResultAppliedPayload,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    getSessionSnapshotForPlayer,
    PUBLIC_NIGHT_DEATH_SOURCES,
} = gameSession
const {
    makePlayer,
    makeRoom,
    makeCustomRoom,
    setupTribunalReadySession,
    ackAllAndRewindToFirstNight,
    commitFullRoleSessionAtNight,
    nightSessionOf3,
    nightSessionOf4NoWin,
    commitAssassinationNight,
    nightSessionWithDoctor,
    castAllVotes,
    buildSnapQuadSession,
    ackAll,
    resolveJokerOnlyNight,
    resolveDayVotes,
    resolveTribunalVotes,
} = require('./gameSession.testUtils')

// 이 파일의 테스트들은 모듈 싱글턴인 gameSessions/playerSession/roomGameSession을 공유하므로,
// 각 테스트가 이전 테스트가 남긴 상태의 영향을 받지 않도록 매번 초기화한다.
test.beforeEach(() => {
    gameSession.__resetStateForTests()
})
// registry 불일치를 의도적으로 재현하는 테스트(예: __deleteGameSessionOnlyForTests)가 이
// 파일의 마지막 테스트로 실행되더라도, beforeEach만으로는 "다음 테스트 시작 전"에만
// 정리된다 — afterEach로 테스트가 끝난 직후에도 즉시 정리해 손상된 singleton 상태가
// 파일 실행 종료 후까지 남지 않게 한다. 테스트 본문에서 예외가 나도 node:test는 afterEach를
// 실행하므로 이 정리는 실패한 테스트 뒤에도 보장된다.
test.afterEach(() => {
    gameSession.__resetStateForTests()
})

// ---------------------------------------------------------------------------
// commitNightResolution / buildNightResultAppliedPayload — NIGHT 결과 적용 + DAY 전이
// ---------------------------------------------------------------------------

test('commitNightResolution: 유효한 victim이 있으면 그 player만 alive:false, phase→DAY, dayIndex+1, nightResolution 설정, 반환값 {ok:true, victimUuid, terminal:null}', () => {
    const session = nightSessionOf4NoWin()
    const players = [...session.players.values()]
    const victim = players.find((p) => p.role !== 'JOKER')
    const other = players.find((p) => p.uuid !== victim.uuid)
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victim.uuid, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: victim.uuid, terminal: null })
    assert.equal(session.players.get(victim.uuid).alive, false)
    assert.equal(session.players.get(other.uuid).alive, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, resolution)
})

test('commitNightResolution: pendingEliminationTargetId가 null이면 전원 alive 유지, phase/dayIndex는 그대로 전이한다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-null' })
    const uuids = [...session.players.keys()]
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: null, terminal: null })
    for (const uuid of uuids) assert.equal(session.players.get(uuid).alive, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, resolution)
})

test('commitNightResolution: 마지막 생존 JOKER를 제거하면 DAY로 전이하지 않고 CITIZEN 승리로 종료된다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-win-citizen' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: jokerUuid, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.dayIndex, 0) // 승리 시 DAY 전이(dayIndex+1)를 실행하지 않는다
    assert.equal(session.players.get(jokerUuid).alive, false)
    for (const player of session.players.values()) {
        if (player.uuid !== jokerUuid) assert.equal(player.alive, true)
    }
})

test('commitNightResolution: 희생자 반영 후 생존 JOKER가 생존 비-JOKER와 동수가 되면 JOKER 승리로 종료된다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-win-joker' })
    const citizenUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: citizenUuid, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: citizenUuid, terminal: { winner: 'JOKER' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(session.dayIndex, 0)
    assert.equal(session.players.get(citizenUuid).alive, false)
})

test('commitNightResolution: victim이 세션 밖 uuid를 가리키면 throw하고 nightResolution/phase/dayIndex/alive가 전부 호출 전과 동일하다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-oob' })
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: 'not-a-participant', privateResults: new Map(), resolved: true }

    assert.throws(() => commitNightResolution(session, resolution))

    assert.equal(session.nightResolution, null)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)
    for (const player of session.players.values()) assert.equal(player.alive, true)
})

test('commitNightResolution: victim이 이미 alive:false면 throw하고 상태가 전부 호출 전과 동일하다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-dead' })
    const [victimUuid] = [...session.players.keys()]
    session.players.get(victimUuid).alive = false
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victimUuid, privateResults: new Map(), resolved: true }

    assert.throws(() => commitNightResolution(session, resolution))

    assert.equal(session.nightResolution, null)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)
})

test('buildNightResultAppliedPayload: top-level 키가 정확히 [dayIndex, deathReveals, gameId, phase, players, victimUuid], players 원소 키는 정확히 [alive, uuid]뿐이다', () => {
    // nightSessionOf4NoWin(비종결 fixture)을 써야 phase가 'DAY'로 남는다 — nightSessionOf3은
    // 어떤 희생자를 죽여도 승리 조건이 성립해 phase가 'ENDED'로 바뀌어 이 payload 화이트리스트
    // 자체가 달라진다(winResult 등 terminal 전용 필드 포함).
    const session = nightSessionOf4NoWin({ id: 'room-bnrap' })
    const victimUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victimUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)

    const payload = buildNightResultAppliedPayload(session, victimUuid, session.nightResolution.publicDeathReveals)

    assert.deepEqual(Object.keys(payload).sort(), ['dayIndex', 'deathReveals', 'gameId', 'phase', 'players', 'victimUuid'])
    assert.equal(payload.gameId, session.id)
    assert.equal(payload.phase, 'DAY')
    assert.equal(payload.dayIndex, 1)
    assert.equal(payload.victimUuid, victimUuid)
    for (const player of payload.players) {
        assert.deepEqual(Object.keys(player).sort(), ['alive', 'uuid'])
    }
    assert.deepEqual(
        payload.players.find((p) => p.uuid === victimUuid),
        { uuid: victimUuid, alive: false },
    )
})

// ---------------------------------------------------------------------------
// 공개 사망 reveal — resolveNightDeathSource / buildNightDeathReveals /
// commitNightResolution의 publicDeathReveals
// ---------------------------------------------------------------------------

test('공개 사망 reveal: 사망자가 없는 밤(전원 SKIP)은 재생할 reveal을 만들지 않는다', () => {
    const session = nightSessionOf4NoWin({ id: 'room-reveal-none' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    submitNightAction(jokerUuid, session.id, null)
    const prepared = prepareNightResolution(jokerUuid, session.id)

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.equal(applied.victimUuid, null)
    assert.deepEqual(session.nightResolution.publicDeathReveals, [])
    for (const player of session.players.values()) assert.equal(player.alive, true)
})

test('공개 사망 reveal: DOCTOR가 막아낸 JOKER 암살은 reveal을 만들지 않는다(선택된 대상이 죽지 않음)', () => {
    // JOKER 1 + DOCTOR 1 + CITIZEN 3이 함께 존재하도록 CUSTOM 구성으로 5인 세션을 만든다.
    const room = makeCustomRoom({
        id: 'room-reveal-blocked',
        players: ['rb-a', 'rb-b', 'rb-c', 'rb-d', 'rb-e'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    // 보호 판정은 NIGHT 위에서만 성립한다 — 전원 확인이 도달시키는 초기 DAY가 아니라 첫 밤
    // 픽스처에서 검증한다(다른 밤 판정 테스트들과 같은 헬퍼를 쓴다).
    ackAllAndRewindToFirstNight(session)

    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const doctorUuid = [...session.players.values()].find((p) => p.role === 'DOCTOR').uuid
    const targetUuid = [...session.players.values()].find((p) => p.role === 'CITIZEN').uuid

    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, targetUuid) // 같은 대상을 보호 → 암살 무효
    const prepared = prepareNightResolution(jokerUuid, session.id)

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.equal(prepared.resolution.assassinationTargetId, targetUuid, '암살 시도 자체는 집계됐다')
    assert.equal(applied.victimUuid, null, '보호된 대상은 죽지 않는다')
    assert.deepEqual(session.nightResolution.publicDeathReveals, [], '죽지 않은 대상에는 reveal이 없다')
    assert.equal(session.players.get(targetUuid).alive, true)
})

test('공개 사망 reveal: 실제 JOKER 암살 사망은 source JOKER인 공개 reveal 정확히 1건을 만든다', () => {
    const { session, victimUuid } = commitAssassinationNight({ id: 'room-reveal-joker' })

    assert.deepEqual(session.nightResolution.publicDeathReveals, [
        { victimUuid, source: 'JOKER' },
    ])
    assert.equal(session.players.get(victimUuid).alive, false)
})

test('공개 사망 reveal: 판정이 처형을 비모호적으로 귀속시킨 경우에만 source가 WITCH_HUNTER다', () => {
    const resolution = { assassinationTargetId: null, witchHunterExecutionTargetId: 'v1' }

    assert.equal(resolveNightDeathSource(resolution, 'v1'), 'WITCH_HUNTER')
    assert.deepEqual(buildNightDeathReveals(resolution, ['v1']), [{ victimUuid: 'v1', source: 'WITCH_HUNTER' }])
})

test('공개 사망 reveal: 귀속이 없거나(모르는 밤 사망) 둘 이상으로 모호하면 UNKNOWN_NIGHT이고 행위자 정보를 지어내지 않는다', () => {
    // 귀속 없음 — 어떤 효과도 이 희생자를 가리키지 않는다.
    assert.equal(resolveNightDeathSource({ assassinationTargetId: 'other' }, 'v1'), 'UNKNOWN_NIGHT')
    // 모호 — 두 효과가 동시에 같은 희생자를 가리킨다.
    assert.equal(
        resolveNightDeathSource({ assassinationTargetId: 'v1', witchHunterExecutionTargetId: 'v1' }, 'v1'),
        'UNKNOWN_NIGHT',
    )
    // resolution이 비어 있어도(필드 자체가 없음) 안전하게 UNKNOWN_NIGHT다.
    assert.equal(resolveNightDeathSource({}, 'v1'), 'UNKNOWN_NIGHT')

    const reveals = buildNightDeathReveals({}, ['v1'])
    assert.deepEqual(reveals, [{ victimUuid: 'v1', source: 'UNKNOWN_NIGHT' }])
    assert.deepEqual(Object.keys(reveals[0]).sort(), ['source', 'victimUuid'])
})

test('공개 사망 reveal: 서로 다른 다수 사망은 canonical 적용 순서를 유지한 결정적 목록이고 victim 기준으로 중복 제거된다', () => {
    const resolution = { assassinationTargetId: 'v2', witchHunterExecutionTargetId: 'v1' }

    const reveals = buildNightDeathReveals(resolution, ['v1', 'v2', 'v1', 'v3', 'v2'])

    assert.deepEqual(reveals, [
        { victimUuid: 'v1', source: 'WITCH_HUNTER' },
        { victimUuid: 'v2', source: 'JOKER' },
        { victimUuid: 'v3', source: 'UNKNOWN_NIGHT' },
    ])
    // 같은 입력은 항상 같은 출력이다(결정적).
    assert.deepEqual(buildNightDeathReveals(resolution, ['v1', 'v2', 'v1', 'v3', 'v2']), reveals)
})

test('공개 사망 reveal: 이미 죽어 있던 대상은 새 reveal을 만들지 않는다(커밋 자체가 거부되고 상태가 불변)', () => {
    const session = nightSessionOf4NoWin({ id: 'room-reveal-already-dead' })
    const [victimUuid] = [...session.players.keys()]
    session.players.get(victimUuid).alive = false
    const resolution = {
        gameId: session.id,
        dayIndex: 0,
        assassinationTargetId: victimUuid,
        pendingEliminationTargetId: victimUuid,
        privateResults: new Map(),
        resolved: true,
    }

    assert.throws(() => commitNightResolution(session, resolution))

    assert.equal(session.nightResolution, null)
    assert.equal(Object.hasOwn(resolution, 'publicDeathReveals'), false, '거부된 판정은 reveal조차 만들지 않는다')
})

test('공개 사망 reveal: 같은 밤을 다시 판정하려 해도 reveal 목록은 늘어나지 않는다(중복 판정 차단)', () => {
    const { session, jokerUuid, victimUuid } = commitAssassinationNight({ id: 'room-reveal-dup' })
    const firstReveals = session.nightResolution.publicDeathReveals

    const duplicate = prepareNightResolution(jokerUuid, session.id)

    assert.deepEqual(duplicate, { ok: false, code: 'NIGHT_ALREADY_RESOLVED' })
    assert.equal(session.nightResolution.publicDeathReveals, firstReveals, 'reveal 배열 참조가 교체되지 않는다')
    assert.deepEqual(session.nightResolution.publicDeathReveals, [{ victimUuid, source: 'JOKER' }])
})

test('공개 사망 reveal: 공개 화이트리스트가 정확히 [source, victimUuid]뿐이고 killer/actor/역할/대상 Map 등 비밀 필드가 없다', () => {
    const { session, jokerUuid, victimUuid } = commitAssassinationNight({ id: 'room-reveal-whitelist' })

    const payload = buildNightResultAppliedPayload(session, victimUuid, session.nightResolution.publicDeathReveals)
    assert.equal(payload.deathReveals.length, 1)
    for (const reveal of payload.deathReveals) {
        assert.deepEqual(Object.keys(reveal).sort(), ['source', 'victimUuid'])
    }

    // reveal 목록 자체에는 killer uuid도, 내부 판정 필드도 절대 등장하지 않는다(roster는
    // 원래 공개 정보라 payload.players에 모든 참가자 uuid가 있는 것과 구분해서 본다).
    const serializedReveals = JSON.stringify(payload.deathReveals)
    assert.equal(serializedReveals.includes(jokerUuid), false, 'killer uuid가 reveal에 노출됨')
    assert.equal(serializedReveals.includes('privateResults'), false)
    assert.equal(serializedReveals.includes('protectedTargetIds'), false)
    assert.equal(serializedReveals.includes('assassinationTargetId'), false)
    assert.equal(serializedReveals.includes('nightActions'), false)
    assert.equal(serializedReveals.includes('role'), false)

    // payload 최상위에도 내부 판정 구조가 새어나오지 않는다.
    const serializedPayload = JSON.stringify(payload)
    assert.equal(serializedPayload.includes('privateResults'), false)
    assert.equal(serializedPayload.includes('protectedTargetIds'), false)
    assert.equal(serializedPayload.includes('assassinationTargetId'), false)
    assert.equal(serializedPayload.includes('nightActions'), false)
    // source는 세 공개 열거값 중 하나뿐이다.
    assert.deepEqual(Object.keys(PUBLIC_NIGHT_DEATH_SOURCES).sort(), ['JOKER', 'UNKNOWN_NIGHT', 'WITCH_HUNTER'])
    assert.ok(Object.hasOwn(PUBLIC_NIGHT_DEATH_SOURCES, payload.deathReveals[0].source))
})

test('공개 사망 reveal: 스냅샷 nightResult는 가장 최근 판정의 목록만 담고, 응답을 변형해도 canonical session이 오염되지 않는다', () => {
    const { session, victimUuid } = commitAssassinationNight({ id: 'room-reveal-snapshot' })
    const viewerUuid = [...session.players.keys()].find((uuid) => uuid !== victimUuid)

    const first = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.deepEqual(first.snapshot.nightResult, {
        dayIndex: 1,
        victimUuid,
        deathReveals: [{ victimUuid, source: 'JOKER' }],
    })

    first.snapshot.nightResult.deathReveals.push({ victimUuid: 'forged', source: 'JOKER' })
    first.snapshot.nightResult.deathReveals[0].source = 'UNKNOWN_NIGHT'

    const second = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.deepEqual(second.snapshot.nightResult.deathReveals, [{ victimUuid, source: 'JOKER' }])
    assert.deepEqual(session.nightResolution.publicDeathReveals, [{ victimUuid, source: 'JOKER' }])
})

// ---------------------------------------------------------------------------
// 밤 해소 규칙 — 보호 실패 통지 / 판정 순서 / 조사 독립 / 승리 재평가
// ---------------------------------------------------------------------------

// --- 요구 1: 보호 성공 시 광대에게 실패 통지 ---

test('밤 해소: 보호로 막힌 암살은 광대에게만 실패 통지를 만들고 대상은 생존하며 사망 reveal이 없다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'room-nb-notice' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, targetUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.assassinationTargetId, targetUuid, '암살 시도 자체는 집계된다')
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
    // 통지 수신자는 정확히 광대 한 명뿐이다 — 의사에게도, 대상에게도, 다른 시민에게도 없다.
    assert.deepEqual([...prepared.resolution.privateResults.keys()], [jokerUuid])
    assert.deepEqual(prepared.resolution.privateResults.get(jokerUuid), { actionType: 'ASSASSINATE', success: false })

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: null, terminal: null })
    assert.equal(session.players.get(targetUuid).alive, true)
    // 다른 참가자에게는 사망 없는 밤으로만 보인다.
    assert.deepEqual(session.nightResolution.publicDeathReveals, [])
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
})

test('밤 해소: 실패 통지의 키는 정확히 [actionType, success]뿐이고 보호자·대상·사유를 담지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'room-nb-whitelist' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, targetUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)
    const notice = prepared.resolution.privateResults.get(jokerUuid)

    assert.deepEqual(Object.keys(notice).sort(), ['actionType', 'success'])
    for (const forbidden of ['protectorUuid', 'doctorUuid', 'targetId', 'reason', 'role', 'team']) {
        assert.equal(Object.hasOwn(notice, forbidden), false, `${forbidden}가 실패 통지에 담겼다`)
    }
    // 직렬화해도 보호자·대상 uuid는 어디에도 등장하지 않는다.
    const serialized = JSON.stringify(notice)
    assert.equal(serialized.includes(doctorUuid), false, '보호자 uuid가 통지에 노출됨')
    assert.equal(serialized.includes(targetUuid), false, '대상 uuid가 통지에 노출됨')
    // 수신자마다 새 객체를 받는다 — 한 수신자의 오염이 다른 경로로 전파되지 않는다.
    const second = prepareNightResolution(jokerUuid, session.id)
    assert.notEqual(second.resolution.privateResults.get(jokerUuid), notice)
    assert.deepEqual(second.resolution.privateResults.get(jokerUuid), notice)
})

test('밤 해소: 광대가 둘이면 생존한 광대 전원이 실패 통지를 받고 사망한 광대는 받지 않는다', () => {
    const { session, doctorUuid, jokerUuids, citizenUuids } = nightSessionWithDoctor({
        id: 'room-nb-two-jokers',
        jokerCount: 2,
        playerCount: 6,
    })
    const [jokerA, jokerB] = jokerUuids
    const [targetUuid] = citizenUuids
    submitNightAction(jokerA, session.id, targetUuid)
    submitNightAction(jokerB, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, targetUuid)

    const prepared = prepareNightResolution(jokerA, session.id)

    assert.deepEqual([...prepared.resolution.privateResults.keys()].sort(), [jokerA, jokerB].sort())

    // prepare는 순수 함수라 상태를 바꾸지 않는다 — 같은 밤을 광대 하나가 죽은 상태로 다시
    // 판정해 "사망자에게는 통지가 없다"를 같은 픽스처 위에서 확인한다.
    session.players.get(jokerA).alive = false
    const second = prepareNightResolution(jokerB, session.id)

    assert.equal(second.ok, true)
    assert.deepEqual([...second.resolution.privateResults.keys()], [jokerB])
})

test('밤 해소: 보호되지 않은 암살과 무득표 밤에는 실패 통지가 없다', () => {
    // (a) 의사가 SKIP — 암살이 성사되므로 "실패"가 아니다.
    const unprotected = nightSessionWithDoctor({ id: 'room-nb-unprotected' })
    const [victimUuid] = unprotected.citizenUuids
    submitNightAction(unprotected.jokerUuid, unprotected.session.id, victimUuid)
    submitNightAction(unprotected.doctorUuid, unprotected.session.id, null)

    const killed = prepareNightResolution(unprotected.jokerUuid, unprotected.session.id)

    assert.equal(killed.resolution.pendingEliminationTargetId, victimUuid)
    assert.equal(killed.resolution.privateResults.has(unprotected.jokerUuid), false)

    // (b) 광대가 SKIP — 암살 대상 자체가 없으므로 보호와 무관하게 통지가 없다.
    const skipped = nightSessionWithDoctor({ id: 'room-nb-skip' })
    const [protectedUuid] = skipped.citizenUuids
    submitNightAction(skipped.jokerUuid, skipped.session.id, null)
    submitNightAction(skipped.doctorUuid, skipped.session.id, protectedUuid)

    const noTarget = prepareNightResolution(skipped.jokerUuid, skipped.session.id)

    assert.equal(noTarget.resolution.assassinationTargetId, null)
    assert.equal(noTarget.resolution.privateResults.size, 0)
})

// --- 요구 2: 판정 순서(보호 대조 → 사망 확정 → 사망자의 잔여 효과 소멸) ---

test('밤 해소 판정 순서: 암살당한 의사는 사망하고, 그가 타인에게 건 보호는 사망 뒤 소멸한다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'room-nb-order' })
    const [protectedUuid] = citizenUuids
    submitNightAction(doctorUuid, session.id, protectedUuid) // 의사는 타인을 보호한다(자기보호 아님)
    submitNightAction(jokerUuid, session.id, doctorUuid) // 광대는 그 의사를 지목한다

    const prepared = prepareNightResolution(jokerUuid, session.id)

    // 1단계(보호 대조)는 아직 아무도 죽지 않은 생존 집합 위에서 끝났다는 기록이다.
    assert.equal(prepared.resolution.protectedTargetIds.has(protectedUuid), true)
    assert.equal(prepared.resolution.pendingEliminationTargetId, doctorUuid, '의사 자신은 보호되지 않았다')

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    // 2단계 — 사망 확정.
    assert.deepEqual(applied, { ok: true, victimUuid: doctorUuid, terminal: null })
    assert.equal(session.players.get(doctorUuid).alive, false)
    assert.equal(session.players.get(protectedUuid).alive, true)
    // 3단계 — 사망자의 잔여 효과 소멸. 생존자의 엔트리는 그대로 남는다.
    assert.equal(session.nightActions.has(doctorUuid), false, '사망한 의사의 보호가 소멸하지 않았다')
    assert.equal(session.nightActions.get(jokerUuid), doctorUuid, '생존자 엔트리는 건드리지 않는다')
})

test('expireDeadPlayerNightEffects: 사망자 엔트리만 지우고 생존자 엔트리·없는 uuid는 건드리지 않는다', () => {
    const session = { nightActions: new Map([['dead', 'x'], ['alive', 'y'], ['dead2', null]]) }

    assert.deepEqual(expireDeadPlayerNightEffects(session, ['dead', 'missing', 'dead2']), ['dead', 'dead2'])
    assert.deepEqual([...session.nightActions.keys()], ['alive'])
    // 빈 입력은 no-op이고, 이미 지워진 uuid를 다시 넘겨도 아무것도 지워지지 않는다.
    assert.deepEqual(expireDeadPlayerNightEffects(session, []), [])
    assert.deepEqual(expireDeadPlayerNightEffects(session, ['dead']), [])
    assert.deepEqual([...session.nightActions.keys()], ['alive'])
})

// --- 요구 3: 경비원 조사와 대상 사망의 독립 ---

test('밤 해소: 경비원이 조사한 대상이 같은 밤 암살돼도 조사 결과(role)는 그대로 통지된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-nb-guard-death',
    })
    submitNightAction(guardUuid, session.id, citizenUuid)
    submitNightAction(jokerUuid, session.id, citizenUuid)
    submitNightAction(doctorUuid, session.id, null)

    const prepared = prepareNightResolution(guardUuid, session.id)
    const expected = { actionType: 'INVESTIGATE', targetId: citizenUuid, role: 'CITIZEN' }
    assert.deepEqual(prepared.resolution.privateResults.get(guardUuid), expected)

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.equal(applied.victimUuid, citizenUuid)
    assert.equal(session.players.get(citizenUuid).alive, false)
    // 조사 결과는 대상의 사망과 독립이다 — 커밋(사망 확정) 이후에도 그대로 남는다.
    assert.deepEqual(session.nightResolution.privateResults.get(guardUuid), expected)
})

// --- 요구 4: 밤 사망 직후 승리 재평가(낮 진입 전) ---

test('밤 해소: production 경로에서 밤 사망으로 시민 수 = 광대 수가 되면 낮 진입 없이 즉시 광대 승리다', () => {
    const session = nightSessionOf3({ id: 'room-nb-win-joker' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const victimUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    submitNightAction(jokerUuid, session.id, victimUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)
    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid, terminal: { winner: 'JOKER' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    // enterDayPhase는 항상 dayIndex를 1 올린다 — 그대로 0이라는 것이 낮에 진입하지 않았다는 증거다.
    assert.equal(session.dayIndex, 0)
    assert.equal(session.players.get(victimUuid).alive, false)
})

test('밤 해소: 밤 사망으로 광대가 전멸하면 낮 진입 없이 즉시 시민 승리다', () => {
    // 오늘의 킬 소스는 광대뿐이라(광대는 동료를 지목할 수 없다) production 제출 경로로는 이
    // 밤을 만들 수 없다 — 승리 재평가가 낮 진입보다 먼저 온다는 순서 자체를 고정하기 위해
    // resolution을 손으로 구성한다(기존 commitNightResolution 테스트들과 같은 방식).
    const session = nightSessionOf3({ id: 'room-nb-win-citizen' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = {
        gameId: session.id,
        dayIndex: 0,
        pendingEliminationTargetId: jokerUuid,
        privateResults: new Map(),
        resolved: true,
    }

    const applied = commitNightResolution(session, resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: jokerUuid, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.dayIndex, 0, '승리 재평가가 낮 진입보다 먼저다')
    assert.equal(session.nightResolution, resolution)
    assert.equal(session.players.get(jokerUuid).alive, false)
})

// 경비원 조사는 진영(team)이 아니라 대상의 실제 role을 돌려준다(판정 4.3.1) — DOCTOR와 CITIZEN은
// 둘 다 CITIZEN 진영이므로, team을 돌려주던 이전 계약에서는 구분되지 않던 두 대상이다.
test('prepareNightResolution: GUARD 조사 결과는 team이 아니라 대상의 실제 role을 담는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-guard-role-result',
    })
    submitNightAction(jokerUuid, session.id, null)
    submitNightAction(doctorUuid, session.id, null)

    for (const [targetUuid, expectedRole] of [[doctorUuid, 'DOCTOR'], [citizenUuid, 'CITIZEN'], [jokerUuid, 'JOKER']]) {
        submitNightAction(guardUuid, session.id, targetUuid)
        const prepared = prepareNightResolution(citizenUuid, session.id)

        assert.equal(prepared.ok, true)
        const guardResult = prepared.resolution.privateResults.get(guardUuid)
        assert.deepEqual(guardResult, { actionType: 'INVESTIGATE', targetId: targetUuid, role: expectedRole })
        // team own-property는 더 이상 존재하지 않는다.
        assert.equal(Object.hasOwn(guardResult, 'team'), false)
    }
})

test('prepareNightResolution: 사망한 GUARD에게는 개인 결과(privateResults)를 만들지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-dead-guard-private',
    })
    submitNightAction(guardUuid, session.id, citizenUuid)
    submitNightAction(jokerUuid, session.id, null)
    submitNightAction(doctorUuid, session.id, null)

    const alivePrepared = prepareNightResolution(citizenUuid, session.id)
    assert.equal(alivePrepared.resolution.privateResults.has(guardUuid), true, '생존 GUARD는 그대로 조사 결과를 받는다')

    session.players.get(guardUuid).alive = false
    const deadPrepared = prepareNightResolution(citizenUuid, session.id)

    assert.equal(deadPrepared.ok, true)
    assert.equal(deadPrepared.resolution.privateResults.has(guardUuid), false)
})

// "밤 도중 사망"이라는 상태가 구조적으로 존재하지 않음을 코드 수준에서 고정한다 — alive를
// false로 바꾸는 두 지점 중 commitNightResolution은 성공 시 반드시 NIGHT를 벗어나고
// (아래 세 케이스가 그 세 갈래 전부다), commitTribunalVoteResolution은 TRIBUNAL에서만
// 실행된다. 따라서 밤은 고정된 생존 집합 위에서 시작해 그 집합 위에서 판정된다.
//
// nightSessionOf3/nightSessionOf4NoWin은 참가자 uuid가 고정이라 한 테스트 안에서 두 번
// 호출하면 playerSession registry가 충돌한다 — 세 갈래를 각각 별도 테스트로 둔다.
test('불변조건: 희생자가 있는 밤을 판정하면 phase는 NIGHT로 남지 않는다(→DAY)', () => {
    const session = nightSessionOf4NoWin({ id: 'room-inv-victim' })
    const victim = [...session.players.values()].find((p) => p.role !== 'JOKER')

    const result = commitNightResolution(session, {
        gameId: session.id,
        dayIndex: 0,
        pendingEliminationTargetId: victim.uuid,
        privateResults: new Map(),
        resolved: true,
    })

    assert.equal(result.ok, true)
    assert.notEqual(session.phase, 'NIGHT')
    assert.equal(session.phase, 'DAY')
})

test('불변조건: 희생자가 없는 밤을 판정해도 phase는 NIGHT로 남지 않는다(→DAY)', () => {
    const session = nightSessionOf3({ id: 'room-inv-none' })

    const result = commitNightResolution(session, {
        gameId: session.id,
        dayIndex: 0,
        pendingEliminationTargetId: null,
        privateResults: new Map(),
        resolved: true,
    })

    assert.equal(result.ok, true)
    assert.notEqual(session.phase, 'NIGHT')
    assert.equal(session.phase, 'DAY')
})

test('불변조건: 종결되는 밤을 판정해도 phase는 NIGHT로 남지 않는다(→ENDED)', () => {
    const session = nightSessionOf3({ id: 'room-inv-terminal' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid

    const result = commitNightResolution(session, {
        gameId: session.id,
        dayIndex: 0,
        pendingEliminationTargetId: jokerUuid,
        privateResults: new Map(),
        resolved: true,
    })

    assert.equal(result.ok, true)
    assert.notEqual(session.phase, 'NIGHT')
    assert.equal(session.phase, 'ENDED')
})

test('행동 보유자가 한 명도 없는 밤(jokerCount 0)은 즉시 판정되고 희생자 없이 CITIZEN 승리로 끝난다', () => {
    const room = makeRoom({
        id: 'room-no-actors',
        players: [makePlayer('na-a'), makePlayer('na-b'), makePlayer('na-c')],
        jokerCount: 0,
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
    assert.deepEqual(
        [...session.players.values()].map((p) => p.role),
        ['CITIZEN', 'CITIZEN', 'CITIZEN'],
    )

    assert.deepEqual(getEligibleNightActorUuids(session), [])

    // 제출을 하나도 받지 않은 채로도 곧바로 통과한다(기존 pending 루프가 공회전하는 동작 —
    // 새 규칙을 도입하지 않고 그대로 따른다).
    const prepared = prepareNightResolution('na-a', session.id)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.assassinationTargetId, null)
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)

    const committed = commitNightResolution(prepared.session, prepared.resolution)
    assert.deepEqual(committed, { ok: true, victimUuid: null, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
})

test('JOKER가 있는 세션에서는 마지막 JOKER 사망이 곧 종료라 "행동 보유자 전원 사망한 밤"에 도달할 수 없다', () => {
    const { session, defendantUuid } = setupTribunalReadySession({
        uuids: ['nr1', 'nr2', 'nr3'],
        defendantUuid: 'nr2',
        randomFn: () => 0,
    })
    assert.equal(session.players.get(defendantUuid).role, 'JOKER')
    castAllVotes(session, { nr1: 'GUILTY', nr3: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('nr1', session.id, session.dayIndex)

    const result = commitTribunalVoteResolution(prepared.session, prepared.resolution)

    // 처형 직후 NIGHT로 전이하는 대신 세션이 끝난다 — 즉 행동 보유자가 0명인 NIGHT는 시작조차
    // 되지 않는다.
    assert.deepEqual(result, { ok: true, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.notEqual(session.phase, 'NIGHT')
})

// ---------------------------------------------------------------------------
// 다중 사이클 회귀: NIGHT→DAY→TRIBUNAL→NIGHT이 반복돼도 dayIndex가 정확히 한 번씩만
// 증가하고, 매 NIGHT이 신선한 nightActions/nightResolution으로 fresh submission을 받는다.
// ---------------------------------------------------------------------------

test('다중 사이클 회귀: 승리 없는 NIGHT→DAY→TRIBUNAL(무죄) 사이클이 3번 반복돼도 dayIndex가 매번 정확히 1씩만 증가하고 각 NIGHT은 신선한 행동을 받는다', () => {
    const uuids = ['lc1', 'lc2', 'lc3', 'lc4']
    const session = buildSnapQuadSession({ id: 'lifecycle-room', uuids })
    // buildSnapQuadSession의 randomFn:()=>0 고정 셔플 관례상 JOKER는 uuids[1](lc2)로 배정된다.
    const jokerUuid = 'lc2'
    const defendantUuid = 'lc3'
    ackAll(session)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)

    for (let cycle = 1; cycle <= 3; cycle += 1) {
        const dayIndexBeforeNight = session.dayIndex
        assert.equal(session.nightActions.size, 0, `cycle ${cycle}: NIGHT 진입 시 nightActions는 비어있어야 함`)
        assert.equal(session.nightResolution, null, `cycle ${cycle}: NIGHT 진입 시 nightResolution은 null이어야 함`)

        // JOKER는 매번 SKIP만 제출한다 — 아무도 죽지 않아(생존 JOKER 1명 < 생존 비-JOKER 3명)
        // 승리 조건이 절대 성립하지 않고, 3번째 사이클까지 단조 증가만 검증할 수 있다.
        const nightOutcome = resolveJokerOnlyNight(session, jokerUuid, null)
        assert.deepEqual(nightOutcome, { ok: true, victimUuid: null, terminal: null })
        assert.equal(session.phase, 'DAY')
        assert.equal(
            session.dayIndex,
            dayIndexBeforeNight + 1,
            `cycle ${cycle}: NIGHT→DAY 전이는 dayIndex를 정확히 1만 증가시켜야 함(중복/누락 증가 없음)`,
        )

        const dayIndex = session.dayIndex
        const dayOutcome = resolveDayVotes(session, {
            lc1: defendantUuid,
            lc2: defendantUuid,
            [defendantUuid]: null,
            lc4: defendantUuid,
        })
        assert.deepEqual(dayOutcome, { ok: true })
        assert.equal(session.phase, 'TRIBUNAL')
        assert.equal(session.dayIndex, dayIndex, `cycle ${cycle}: DAY→TRIBUNAL 전이는 dayIndex를 바꾸지 않아야 함`)
        assert.equal(session.tribunal.defendantUuid, defendantUuid)

        const tribunalOutcome = resolveTribunalVotes(session, { lc1: 'NOT_GUILTY', lc2: 'NOT_GUILTY', lc4: 'NOT_GUILTY' })
        assert.deepEqual(tribunalOutcome, { ok: true, terminal: null })
        assert.equal(session.phase, 'NIGHT')
        assert.equal(session.dayIndex, dayIndex, `cycle ${cycle}: TRIBUNAL→NIGHT 전이는 dayIndex를 바꾸지 않아야 함`)
        assert.equal(session.nightActions.size, 0, `cycle ${cycle}: TRIBUNAL→NIGHT 전이가 nightActions를 새로 되돌려야 함(fresh submission 계약)`)
        assert.equal(session.nightResolution, null, `cycle ${cycle}: TRIBUNAL→NIGHT 전이가 nightResolution을 null로 되돌려야 함`)
        assert.equal(session.players.get(defendantUuid).alive, true)
    }

    // 3사이클 후: NIGHT1→DAY1, NIGHT2→DAY2, NIGHT3→DAY3 — dayIndex는 0에서 시작해 정확히 3이다.
    assert.equal(session.dayIndex, 3)
    assert.equal(session.phase, 'NIGHT')
    for (const uuid of uuids) assert.equal(session.players.get(uuid).alive, true)

    // 세 번째 사이클 이후에도 새 밤 행동이 실제로 받아들여진다 — 과거 사이클의 exact-once
    // 잠금(NIGHT_ALREADY_RESOLVED 등)이 이후 사이클까지 계속 막지 않는다는 회귀 확인이다.
    const freshSubmit = submitNightAction(jokerUuid, session.id, defendantUuid)
    assert.deepEqual(freshSubmit, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(jokerUuid), defendantUuid)
})
