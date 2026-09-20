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
    prepareNightResolutionForSession,
    completeNightRole,
    isNightRoleCompleted,
    markNightSequenced,
    commitNightResolution,
    commitParticipantDeparture,
    commitDisconnectElimination,
    NIGHT_TURN_ORDER,
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
    sourcedNightResolution,
    commitAssassinationNight,
    nightSessionWithDoctor,
    nightSessionWithDuplicateRole,
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
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: victim.uuid })

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: victim.uuid, terminal: null })
    assert.equal(session.players.get(victim.uuid).alive, false)
    assert.equal(session.players.get(victim.uuid).deathReason, 'ASSASSINATION')
    assert.equal(session.players.get(other.uuid).alive, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, resolution)
})

test('commitNightResolution: pendingEliminationTargetId가 null이면 전원 alive 유지, phase/dayIndex는 그대로 전이한다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-null' })
    const uuids = [...session.players.keys()]
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: null })

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
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: jokerUuid })

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
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: citizenUuid })

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: citizenUuid, terminal: { winner: 'JOKER' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(session.dayIndex, 0)
    assert.equal(session.players.get(citizenUuid).alive, false)
})

test('commitNightResolution: victim이 세션 밖 uuid를 가리키면 throw하고 nightResolution/phase/dayIndex/alive가 전부 호출 전과 동일하다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-oob' })
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: 'not-a-participant' })

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
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: victimUuid })

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
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: victimUuid })
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
    const resolution = sourcedNightResolution(session, {
        assassinationTargetId: victimUuid,
        pendingEliminationTargetId: victimUuid,
    })

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
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: jokerUuid })

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

// ---------------------------------------------------------------------------
// F-25a: 밤 역할별 순차 판정 core — 킬·치료 사건 보존(events) · 회복 대기/회복/사망 후보
// (recoveryStates) · 네 역할 순차 진행(roleSteps).
// ---------------------------------------------------------------------------

// --- AC-01: 킬 후 같은 대상 치료 → 킬·치료 사건 모두 보존 + 최종 생존 ---

test('AC-01(F-25a): 광대 킬 후 같은 대상을 의사가 치료하면 KILL·HEAL 사건이 모두 보존되고 대상은 최종 생존한다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'room-f25a-kill-heal' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, targetUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(prepared.resolution.events, [
        { type: 'KILL', targetId: targetUuid },
        { type: 'HEAL', targetId: targetUuid },
    ])
    assert.equal(prepared.resolution.recoveryStates.get(targetUuid), 'RECOVERED')
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
    // GUARD/WITCH_HUNTER는 이 세션 구성(roleCounts GUARD:0/WITCH_HUNTER:0)에 아예 없다 — 그래도
    // 두 단계 모두 roleSteps에 기록되고 판정을 막지 않는다(AC-04와 겹치는 회귀 확인).
    assert.deepEqual(prepared.resolution.roleSteps, [
        { role: 'JOKER', targetId: targetUuid, status: 'RESOLVED' },
        { role: 'DOCTOR', targetId: targetUuid, status: 'RESOLVED' },
        { role: 'GUARD', targetId: null, status: 'NO_ROLE' },
        { role: 'WITCH_HUNTER', targetId: null, status: 'NO_ROLE' },
    ])

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: null, terminal: null })
    assert.equal(session.players.get(targetUuid).alive, true)
})

// --- AC-02: 킬 후 미치료 → 회복 대기를 거쳐 사망 후보로 판정 ---

test('AC-02(F-25a): 치료 없는 광대 킬은 회복 대기를 거쳐 사망 후보(DEATH_CANDIDATE)로 판정되고 실제로 사망한다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'room-f25a-kill-only' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, null)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(prepared.resolution.events, [{ type: 'KILL', targetId: targetUuid }])
    assert.equal(prepared.resolution.recoveryStates.get(targetUuid), 'DEATH_CANDIDATE')
    assert.equal(prepared.resolution.pendingEliminationTargetId, targetUuid)

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: targetUuid, terminal: null })
    assert.equal(session.players.get(targetUuid).alive, false)
})

test('AC-02(F-25a): 의사가 다른 대상을 치료해도(공격받지 않음) HEAL 사건은 생기지 않고 공격 대상은 그대로 사망 후보다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({
        id: 'room-f25a-heal-wrong-target',
    })
    const [attackedUuid, healedUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, attackedUuid)
    submitNightAction(doctorUuid, session.id, healedUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    // 실제로 공격받지 않은 대상을 보호해도 "치료 성공" 사건은 만들어지지 않는다(A-03).
    assert.deepEqual(prepared.resolution.events, [{ type: 'KILL', targetId: attackedUuid }])
    assert.equal(prepared.resolution.recoveryStates.get(attackedUuid), 'DEATH_CANDIDATE')
    assert.equal(prepared.resolution.recoveryStates.has(healedUuid), false)
    assert.equal(prepared.resolution.pendingEliminationTargetId, attackedUuid)
})

// --- AC-03: 의사 자기 치료 + 회복된 참가자의 같은 밤 후속 행동 ---

test('AC-03(F-25a): 의사가 자기 자신을 치료 대상으로 지정해도 정상 처리되고 자기 치료로 회복되어 생존한다', () => {
    const { session, doctorUuid, jokerUuid } = nightSessionWithDoctor({ id: 'room-f25a-self-heal' })
    submitNightAction(jokerUuid, session.id, doctorUuid)
    submitNightAction(doctorUuid, session.id, doctorUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(prepared.resolution.events, [
        { type: 'KILL', targetId: doctorUuid },
        { type: 'HEAL', targetId: doctorUuid },
    ])
    assert.equal(prepared.resolution.recoveryStates.get(doctorUuid), 'RECOVERED')
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)

    const applied = commitNightResolution(prepared.session, prepared.resolution)
    assert.equal(session.players.get(doctorUuid).alive, true)
})

test('AC-03(F-25a): 공격받은 경비원이 치료로 회복되면 같은 밤 자신의 조사 차례를 정상 수행한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-guard-recover',
    })
    submitNightAction(jokerUuid, session.id, guardUuid)
    submitNightAction(doctorUuid, session.id, guardUuid)
    submitNightAction(guardUuid, session.id, citizenUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.recoveryStates.get(guardUuid), 'RECOVERED')
    assert.deepEqual(prepared.resolution.privateResults.get(guardUuid), {
        actionType: 'INVESTIGATE',
        targetId: citizenUuid,
        role: 'CITIZEN',
    })
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
})

test('AC-03(F-25a) 대조: 공격받고 치료받지 못한 경비원의 조사는 성공한 결과를 만들지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-guard-unrecovered',
    })
    submitNightAction(jokerUuid, session.id, guardUuid)
    submitNightAction(doctorUuid, session.id, null) // 치료하지 않는다
    submitNightAction(guardUuid, session.id, citizenUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.recoveryStates.get(guardUuid), 'DEATH_CANDIDATE')
    assert.equal(prepared.resolution.privateResults.has(guardUuid), false, '회복하지 못한 경비원은 조사 결과를 받지 못한다')
    assert.deepEqual(
        prepared.resolution.roleSteps.find((step) => step.role === 'GUARD'),
        { role: 'GUARD', targetId: null, status: 'RECOVERY_BLOCKED' },
    )
    assert.equal(prepared.resolution.pendingEliminationTargetId, guardUuid)
})

test('AC-03(F-25a): 공격받은 마녀사냥꾼이 치료로 회복되면 같은 밤 기존 사망자를 정상적으로 확인한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-wh-recover',
    })
    session.dayIndex = 2
    const citizenUuids = [...session.players.values()].filter((p) => p.role === 'CITIZEN').map((p) => p.uuid)
    const [deadCitizen, aliveCitizen] = citizenUuids
    session.players.get(deadCitizen).alive = false // 이전에 이미 사망한(재판/이전 밤) 확인 대상

    submitNightAction(jokerUuid, session.id, witchHunterUuid)
    submitNightAction(doctorUuid, session.id, witchHunterUuid)
    submitNightAction(guardUuid, session.id, aliveCitizen)
    submitNightAction(witchHunterUuid, session.id, deadCitizen)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.recoveryStates.get(witchHunterUuid), 'RECOVERED')
    assert.deepEqual(prepared.resolution.privateResults.get(witchHunterUuid), {
        actionType: 'CONFIRM',
        targetId: deadCitizen,
        role: 'CITIZEN',
    })
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
})

test('AC-03(F-25a) 대조: 공격받고 치료받지 못한 마녀사냥꾼의 확인은 성공한 결과를 만들지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-wh-unrecovered',
    })
    session.dayIndex = 2
    const citizenUuids = [...session.players.values()].filter((p) => p.role === 'CITIZEN').map((p) => p.uuid)
    const [deadCitizen, aliveCitizen] = citizenUuids
    session.players.get(deadCitizen).alive = false

    submitNightAction(jokerUuid, session.id, witchHunterUuid)
    submitNightAction(doctorUuid, session.id, null) // 치료하지 않는다
    submitNightAction(guardUuid, session.id, aliveCitizen)
    submitNightAction(witchHunterUuid, session.id, deadCitizen)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.recoveryStates.get(witchHunterUuid), 'DEATH_CANDIDATE')
    assert.equal(prepared.resolution.privateResults.has(witchHunterUuid), false)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((step) => step.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: null, status: 'RECOVERY_BLOCKED' },
    )
})

// --- AC-04: 실패·기권·대상 없음·합의 실패·역할 부재가 각각 다음 역할로 정상 진행 ---

test('AC-04(F-25a): 광대·의사 모두 SKIP해도 부재한 GUARD/WITCH_HUNTER까지 포함해 네 단계 전부가 기록되고 판정은 정상 완료된다', () => {
    const { session, doctorUuid, jokerUuid } = nightSessionWithDoctor({ id: 'room-f25a-roleSteps-abstain' })
    submitNightAction(jokerUuid, session.id, null)
    submitNightAction(doctorUuid, session.id, null)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(prepared.resolution.roleSteps, [
        { role: 'JOKER', targetId: null, status: 'NO_RESULT' },
        { role: 'DOCTOR', targetId: null, status: 'NO_RESULT' },
        { role: 'GUARD', targetId: null, status: 'NO_ROLE' },
        { role: 'WITCH_HUNTER', targetId: null, status: 'NO_ROLE' },
    ])
    assert.deepEqual(prepared.resolution.events, [])
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
})

test('AC-04(F-25a): 광대 두 명이 다른 대상을 지목하면 동률로 NO_RESULT이고 부재 역할까지 정상 진행된다', () => {
    const { session, roleUuids: jokerUuids, citizenUuids } = nightSessionWithDuplicateRole({
        id: 'room-f25a-joker-tie',
        role: 'JOKER',
    })
    submitNightAction(jokerUuids[0], session.id, citizenUuids[0])
    submitNightAction(jokerUuids[1], session.id, citizenUuids[1])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'JOKER'),
        { role: 'JOKER', targetId: null, status: 'NO_RESULT' },
    )
    assert.equal(prepared.resolution.assassinationTargetId, null)
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
    for (const role of ['DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.equal(prepared.resolution.roleSteps.find((s) => s.role === role).status, 'NO_ROLE')
    }
})

test('AC-04(F-25a): GUARD 두 명이 상충하는 대상을 지목하면 만장일치 실패로 NO_RESULT이고 WITCH_HUNTER 단계까지 정상 기록된다', () => {
    const { session, roleUuids: guardUuids, jokerUuids, citizenUuids } = nightSessionWithDuplicateRole({
        id: 'room-f25a-guard-split',
        role: 'GUARD',
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, citizenUuids[0])
    submitNightAction(guardUuids[1], session.id, citizenUuids[1])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: null, status: 'NO_RESULT' },
    )
    assert.equal(prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER').status, 'NO_ROLE')
    assert.equal(prepared.resolution.privateResults.has(guardUuids[0]), false)
    assert.equal(prepared.resolution.privateResults.has(guardUuids[1]), false)
})

test('AC-04(F-25a): WITCH_HUNTER가 존재해도 dayIndex 활성화 전이면 NO_ACTOR로 기록되고 판정은 막히지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-wh-inactive',
    })
    submitNightAction(jokerUuid, session.id, null)
    submitNightAction(doctorUuid, session.id, null)
    submitNightAction(guardUuid, session.id, citizenUuid)
    // WITCH_HUNTER는 dayIndex 0에서 애초에 eligible actor가 아니므로 제출하지 않는다.

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: null, status: 'NO_ACTOR' },
    )
})

test('AC-04(F-25a): 그 역할 보유자가 전멸하면 NO_ACTOR로 기록되고 판정은 막히지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-doctor-dead',
    })
    session.players.get(doctorUuid).alive = false
    submitNightAction(jokerUuid, session.id, null)
    submitNightAction(guardUuid, session.id, citizenUuid)

    const prepared = prepareNightResolution(jokerUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'DOCTOR'),
        { role: 'DOCTOR', targetId: null, status: 'NO_ACTOR' },
    )
})

// --- AC-04 보강(2026-09-20 심사 반영): 역할 × 실패 유형 매트릭스 ---
//
// 위 5개 시험은 "그 역할 단계가 실패/건너뜀으로 기록된다"만 확인했다. 이 절은 각 조합마다
// (1) 그 역할 단계의 상태와 (2) **바로 다음 역할이 실제로 유효한 행동을 제출해 그 결과가
// 생성됨**과 (3) 밤 판정이 resolved:true로 끝남을 함께 단언한다. 마지막 역할(WITCH_HUNTER)은
// "다음 역할"이 없으므로 대신 그 앞(GUARD)의 이미 만들어진 성공 결과가 훼손되지 않음을 확인한다.

/**
 * 임의의 roleCounts로 CUSTOM 세션을 만들어 그 밤(dayIndex)으로 되돌린다. 대상으로 쓸 여분
 * 시민 3명을 항상 더한다. CUSTOM 구성 규칙상 JOKER는 항상 1명 이상이어야 한다
 * (validateCustomRoleCounts) — "JOKER가 아예 없는 판"은 별도로 AUTO 경로(jokerCount:0)를 쓴다.
 */
function buildMatrixNightSession(id, roleCounts, { dayIndex = 0 } = {}) {
    const total = Object.values(roleCounts).reduce((sum, n) => sum + n, 0)
    const players = Array.from({ length: total + 3 }, (_, i) => makePlayer(`mx-${id}-${i}`))
    const room = makeCustomRoom({ id, players, roleCounts })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    const session = candidate.session
    commitGameSession(session)
    ackAllAndRewindToFirstNight(session, { dayIndex })
    const byRole = (role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    return {
        session,
        jokerUuids: byRole('JOKER'),
        doctorUuids: byRole('DOCTOR'),
        guardUuids: byRole('GUARD'),
        witchHunterUuids: byRole('WITCH_HUNTER'),
        citizenUuids: byRole('CITIZEN'),
    }
}

/** WITCH_HUNTER가 확인할 "이미 죽어 있던"(이전 밤/재판) 대상을 하나 마련한 dayIndex 2 픽스처. */
function witchHunterReadyFixture(id, roleCounts) {
    const fixture = buildMatrixNightSession(id, roleCounts, { dayIndex: 2 })
    const deadCitizen = fixture.citizenUuids[0]
    fixture.session.players.get(deadCitizen).alive = false
    return { ...fixture, deadCitizen }
}

// - JOKER 실패 → DOCTOR가 다음 역할로 정상 진행 -----------------------------

test('AC-04 매트릭스: JOKER 기권(SKIP) → DOCTOR가 다음 역할로 유효한 보호를 확정하고 resolved:true다', () => {
    const { session, jokerUuids, doctorUuids, guardUuids, citizenUuids } = buildMatrixNightSession('joker-abstain', {
        JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0,
    })
    const targetUuid = citizenUuids[0]
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(doctorUuids[0], session.id, targetUuid)
    submitNightAction(guardUuids[0], session.id, citizenUuids[1])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'JOKER'),
        { role: 'JOKER', targetId: null, status: 'NO_RESULT' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'DOCTOR'),
        { role: 'DOCTOR', targetId: targetUuid, status: 'RESOLVED' },
    )
    assert.deepEqual([...prepared.resolution.protectedTargetIds], [targetUuid])
})

test('AC-04 매트릭스: JOKER 두 명 합의 실패(상충) → DOCTOR가 다음 역할로 유효한 보호를 확정하고 resolved:true다', () => {
    const { session, jokerUuids, doctorUuids, citizenUuids } = buildMatrixNightSession('joker-conflict', {
        JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0,
    })
    submitNightAction(jokerUuids[0], session.id, citizenUuids[0])
    submitNightAction(jokerUuids[1], session.id, citizenUuids[1])
    submitNightAction(doctorUuids[0], session.id, citizenUuids[2])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'JOKER'),
        { role: 'JOKER', targetId: null, status: 'NO_RESULT' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'DOCTOR'),
        { role: 'DOCTOR', targetId: citizenUuids[2], status: 'RESOLVED' },
    )
})

test('AC-04 매트릭스: JOKER가 그 판에 없는 직업(AUTO 구성, jokerCount 0) → DOCTOR가 다음 역할로 정상 진행되고 resolved:true다', () => {
    // CUSTOM 구성은 JOKER=0을 거부한다(validateCustomRoleCounts) — "JOKER가 아예 없는 판"은
    // AUTO 경로(jokerCount:0)로만 만들 수 있다. 인원 10명이면 getSpecialRoleBudget이
    // jokerCount와 무관하게 DOCTOR/GUARD/WITCH_HUNTER를 1명씩 배정한다(computeRoleComposition).
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`mx-joker-absent-${i}`))
    const room = makeRoom({ id: 'room-f25a-matrix-joker-absent', players, jokerCount: 0 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0.999 })
    const session = candidate.session
    commitGameSession(session)
    ackAllAndRewindToFirstNight(session)
    const byRole = (role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    assert.deepEqual(byRole('JOKER'), [], 'JOKER가 실제로 이 판에 없어야 한다')
    const [doctorUuid] = byRole('DOCTOR')
    const [guardUuid] = byRole('GUARD')
    const citizenUuids = byRole('CITIZEN')

    submitNightAction(doctorUuid, session.id, citizenUuids[0])
    submitNightAction(guardUuid, session.id, citizenUuids[1])

    const prepared = prepareNightResolution(doctorUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'JOKER'),
        { role: 'JOKER', targetId: null, status: 'NO_ROLE' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'DOCTOR'),
        { role: 'DOCTOR', targetId: citizenUuids[0], status: 'RESOLVED' },
    )
})
// JOKER는 순서상 첫 단계라 recoveryStates가 비어 있는 상태에서 처리된다 — "공격받고 치료받지
// 못해 막힘(RECOVERY_BLOCKED)"은 이전에 공격받았다는 전제 자체가 성립하지 않아 JOKER에는
// 규칙상 적용될 수 없다(건너뜀).

// - DOCTOR 실패 → GUARD가 다음 역할로 정상 진행 -----------------------------

test('AC-04 매트릭스: DOCTOR 기권(SKIP) → GUARD가 다음 역할로 유효한 조사를 확정하고 resolved:true다', () => {
    const { session, jokerUuids, doctorUuids, guardUuids, citizenUuids } = buildMatrixNightSession('doctor-abstain', {
        JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0,
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(doctorUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, citizenUuids[0])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'DOCTOR'),
        { role: 'DOCTOR', targetId: null, status: 'NO_RESULT' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuids[0], status: 'RESOLVED' },
    )
    assert.deepEqual(prepared.resolution.privateResults.get(guardUuids[0]), {
        actionType: 'INVESTIGATE',
        targetId: citizenUuids[0],
        role: 'CITIZEN',
    })
})

test('AC-04 매트릭스: DOCTOR 두 명 합의 실패(상충) → GUARD가 다음 역할로 유효한 조사를 확정하고 resolved:true다', () => {
    const { session, jokerUuids, doctorUuids, guardUuids, citizenUuids } = buildMatrixNightSession('doctor-conflict', {
        JOKER: 1, DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 0,
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(doctorUuids[0], session.id, citizenUuids[0])
    submitNightAction(doctorUuids[1], session.id, citizenUuids[1])
    submitNightAction(guardUuids[0], session.id, citizenUuids[2])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'DOCTOR'),
        { role: 'DOCTOR', targetId: null, status: 'NO_RESULT' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuids[2], status: 'RESOLVED' },
    )
})

test('AC-04 매트릭스: DOCTOR가 그 판에 없는 직업 → GUARD가 다음 역할로 정상 진행되고 resolved:true다', () => {
    const { session, jokerUuids, guardUuids, citizenUuids } = buildMatrixNightSession('doctor-absent', {
        JOKER: 1, DOCTOR: 0, GUARD: 1, WITCH_HUNTER: 0,
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, citizenUuids[0])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'DOCTOR'),
        { role: 'DOCTOR', targetId: null, status: 'NO_ROLE' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuids[0], status: 'RESOLVED' },
    )
})
// DOCTOR 단계는 설계상 회복 대기 배제를 적용받지 않는다(A-03 — 공격받은 의사 본인의 자기
// 치료를 막지 않기 위한 예외, gameSession.js::prepareNightResolution 참고). 따라서 "공격받고
// 치료받지 못해 막힘(RECOVERY_BLOCKED)"은 DOCTOR 단계 자신에는 규칙상 성립하지 않는다(건너뜀).

// - GUARD 실패 → WITCH_HUNTER가 다음 역할로 정상 진행 -----------------------

test('AC-04 매트릭스: GUARD 기권(SKIP) → WITCH_HUNTER가 다음 역할로 유효한 확인을 확정하고 resolved:true다', () => {
    const { session, jokerUuids, guardUuids, witchHunterUuids, deadCitizen } = witchHunterReadyFixture('guard-abstain', {
        JOKER: 1, DOCTOR: 0, GUARD: 1, WITCH_HUNTER: 1,
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, null)
    submitNightAction(witchHunterUuids[0], session.id, deadCitizen)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: null, status: 'NO_RESULT' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: deadCitizen, status: 'RESOLVED' },
    )
    assert.deepEqual(prepared.resolution.privateResults.get(witchHunterUuids[0]), {
        actionType: 'CONFIRM',
        targetId: deadCitizen,
        role: 'CITIZEN',
    })
})

test('AC-04 매트릭스: GUARD 두 명 합의 실패(상충) → WITCH_HUNTER가 다음 역할로 유효한 확인을 확정하고 resolved:true다', () => {
    const { session, jokerUuids, guardUuids, witchHunterUuids, citizenUuids, deadCitizen } = witchHunterReadyFixture(
        'guard-conflict',
        { JOKER: 1, DOCTOR: 0, GUARD: 2, WITCH_HUNTER: 1 },
    )
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, citizenUuids[1])
    submitNightAction(guardUuids[1], session.id, citizenUuids[2])
    submitNightAction(witchHunterUuids[0], session.id, deadCitizen)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: null, status: 'NO_RESULT' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: deadCitizen, status: 'RESOLVED' },
    )
})

test('AC-04 매트릭스: GUARD가 그 판에 없는 직업 → WITCH_HUNTER가 다음 역할로 정상 진행되고 resolved:true다', () => {
    const { session, jokerUuids, witchHunterUuids, deadCitizen } = witchHunterReadyFixture('guard-absent', {
        JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 1,
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(witchHunterUuids[0], session.id, deadCitizen)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: null, status: 'NO_ROLE' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: deadCitizen, status: 'RESOLVED' },
    )
})

test('AC-04 매트릭스: GUARD 행동 실패(공격받고 치료받지 못함, RECOVERY_BLOCKED) → WITCH_HUNTER가 다음 역할로 유효한 확인을 확정하고 resolved:true다', () => {
    const { session, jokerUuids, doctorUuids, guardUuids, witchHunterUuids, citizenUuids, deadCitizen } =
        witchHunterReadyFixture('guard-recovery-blocked', { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
    submitNightAction(jokerUuids[0], session.id, guardUuids[0]) // 광대가 경비원을 공격
    submitNightAction(doctorUuids[0], session.id, citizenUuids[1]) // 의사는 다른 대상을 치료(경비원은 치료받지 못한다)
    submitNightAction(guardUuids[0], session.id, citizenUuids[2])
    submitNightAction(witchHunterUuids[0], session.id, deadCitizen)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: null, status: 'RECOVERY_BLOCKED' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: deadCitizen, status: 'RESOLVED' },
    )
    assert.deepEqual(prepared.resolution.privateResults.get(witchHunterUuids[0]), {
        actionType: 'CONFIRM',
        targetId: deadCitizen,
        role: 'CITIZEN',
    })
    assert.equal(prepared.resolution.pendingEliminationTargetId, guardUuids[0])
})

// - WITCH_HUNTER 실패(마지막 역할 — "다음 역할"이 없으므로 대신 앞선 GUARD의 이미 만들어진
//   성공 결과가 뒤이은 실패로 훼손되지 않음을 확인한다) -----------------------

test('AC-04 매트릭스: WITCH_HUNTER 기권(SKIP) → 앞선 GUARD의 성공 결과는 그대로 유지되고 resolved:true다', () => {
    const { session, jokerUuids, guardUuids, witchHunterUuids, citizenUuids } = witchHunterReadyFixture('wh-abstain', {
        JOKER: 1, DOCTOR: 0, GUARD: 1, WITCH_HUNTER: 1,
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, citizenUuids[1])
    submitNightAction(witchHunterUuids[0], session.id, null)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuids[1], status: 'RESOLVED' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: null, status: 'NO_RESULT' },
    )
    assert.deepEqual(prepared.resolution.privateResults.get(guardUuids[0]), {
        actionType: 'INVESTIGATE',
        targetId: citizenUuids[1],
        role: 'CITIZEN',
    })
})

test('AC-04 매트릭스: WITCH_HUNTER 두 명 합의 실패(상충) → 앞선 GUARD의 성공 결과는 그대로 유지되고 resolved:true다', () => {
    const { session, jokerUuids, guardUuids, witchHunterUuids, citizenUuids } = buildMatrixNightSession(
        'wh-conflict',
        { JOKER: 1, DOCTOR: 0, GUARD: 1, WITCH_HUNTER: 2 },
        { dayIndex: 2 },
    )
    const [deadA, deadB] = citizenUuids
    session.players.get(deadA).alive = false
    session.players.get(deadB).alive = false
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, citizenUuids[2])
    submitNightAction(witchHunterUuids[0], session.id, deadA)
    submitNightAction(witchHunterUuids[1], session.id, deadB)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuids[2], status: 'RESOLVED' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: null, status: 'NO_RESULT' },
    )
})

test('AC-04 매트릭스: WITCH_HUNTER가 그 판에 없는 직업 → 앞선 GUARD의 성공 결과는 그대로 유지되고 resolved:true다', () => {
    const { session, jokerUuids, guardUuids, citizenUuids } = buildMatrixNightSession('wh-absent', {
        JOKER: 1, DOCTOR: 0, GUARD: 1, WITCH_HUNTER: 0,
    })
    submitNightAction(jokerUuids[0], session.id, null)
    submitNightAction(guardUuids[0], session.id, citizenUuids[0])

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuids[0], status: 'RESOLVED' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: null, status: 'NO_ROLE' },
    )
})

test('AC-04 매트릭스: WITCH_HUNTER 행동 실패(공격받고 치료받지 못함, RECOVERY_BLOCKED) → 앞선 GUARD의 성공 결과는 그대로 유지되고 resolved:true다', () => {
    const { session, jokerUuids, doctorUuids, guardUuids, witchHunterUuids, citizenUuids, deadCitizen } =
        witchHunterReadyFixture('wh-recovery-blocked', { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
    submitNightAction(jokerUuids[0], session.id, witchHunterUuids[0]) // 광대가 마녀사냥꾼을 공격
    submitNightAction(doctorUuids[0], session.id, citizenUuids[1]) // 의사는 다른 대상을 치료(마녀사냥꾼은 치료받지 못한다)
    submitNightAction(guardUuids[0], session.id, citizenUuids[2])
    submitNightAction(witchHunterUuids[0], session.id, deadCitizen)

    const prepared = prepareNightResolution(jokerUuids[0], session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.resolved, true)
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuids[2], status: 'RESOLVED' },
    )
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'WITCH_HUNTER'),
        { role: 'WITCH_HUNTER', targetId: null, status: 'RECOVERY_BLOCKED' },
    )
    assert.equal(prepared.resolution.pendingEliminationTargetId, witchHunterUuids[0])
})

// --- AC-05: 경비원(생존 대상 조사)·마녀사냥꾼(사망자 직업 확인) 회귀 ---

test('AC-05(F-25a) 회귀: 같은 밤 미치료 사망 후보를 조사해도(canonical alive 기준) GUARD 결과는 그대로 생성된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-guard-investigates-death-candidate',
    })
    submitNightAction(guardUuid, session.id, citizenUuid)
    submitNightAction(jokerUuid, session.id, citizenUuid)
    submitNightAction(doctorUuid, session.id, null)

    const prepared = prepareNightResolution(guardUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.recoveryStates.get(citizenUuid), 'DEATH_CANDIDATE')
    assert.deepEqual(prepared.resolution.privateResults.get(guardUuid), {
        actionType: 'INVESTIGATE',
        targetId: citizenUuid,
        role: 'CITIZEN',
    })
    assert.deepEqual(
        prepared.resolution.roleSteps.find((s) => s.role === 'GUARD'),
        { role: 'GUARD', targetId: citizenUuid, status: 'RESOLVED' },
    )
})

test('AC-05(F-25a) 회귀: 같은 밤 광대에게 공격받은 대상은(치료 여부와 무관하게) canonical alive:true라 마녀사냥꾼이 지목하면 TARGET_NOT_DEAD다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-f25a-wh-cannot-target-same-night',
    })
    session.dayIndex = 2
    submitNightAction(jokerUuid, session.id, citizenUuid)
    submitNightAction(doctorUuid, session.id, null)
    submitNightAction(guardUuid, session.id, citizenUuid)

    const before = new Map(session.nightActions)
    const result = submitNightAction(witchHunterUuid, session.id, citizenUuid)

    assert.deepEqual(result, { ok: false, code: 'TARGET_NOT_DEAD' })
    assert.deepEqual(session.nightActions, before)
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

    const result = commitNightResolution(session, sourcedNightResolution(session, {
        pendingEliminationTargetId: victim.uuid,
    }))

    assert.equal(result.ok, true)
    assert.notEqual(session.phase, 'NIGHT')
    assert.equal(session.phase, 'DAY')
})

test('불변조건: 희생자가 없는 밤을 판정해도 phase는 NIGHT로 남지 않는다(→DAY)', () => {
    const session = nightSessionOf3({ id: 'room-inv-none' })

    const result = commitNightResolution(session, sourcedNightResolution(session, {
        pendingEliminationTargetId: null,
    }))

    assert.equal(result.ok, true)
    assert.notEqual(session.phase, 'NIGHT')
    assert.equal(session.phase, 'DAY')
})

test('불변조건: 종결되는 밤을 판정해도 phase는 NIGHT로 남지 않는다(→ENDED)', () => {
    const session = nightSessionOf3({ id: 'room-inv-terminal' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid

    const result = commitNightResolution(session, sourcedNightResolution(session, {
        pendingEliminationTargetId: jokerUuid,
    }))

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

// ---------------------------------------------------------------------------
// F-25b — 역할별 순차 확정과 밤 최종화의 경계
//
// 이 절의 모든 시험은 **실제 순차 경로**(completeNightRole → … →
// prepareNightResolutionForSession → commitNightResolution)를 그대로 구동한다. 소켓 계층의
// endNightTurn이 production에서 이 순서를 만드는데(각 턴 종료마다 completeNightRole 하나),
// 그 배선 자체는 backend/socket/__tests__/gameSession.nightTurns.test.js가 검증한다.
// ---------------------------------------------------------------------------

/**
 * 사망 확정·승패 평가·종료 확정이 **실제로 일어난 횟수**를 센다. 이 모듈 안의 lexical 호출은
 * export를 갈아끼워도 잡히지 않으므로, 실제 호출 지점의 관찰 통로로만 셀 수 있다.
 * DB 0행 같은 간접 증거로 "호출되지 않았다"를 대신하지 않는다는 것이 이 헬퍼의 존재 이유다.
 */
function captureCommitEvents() {
    const events = []
    gameSession.__setNightCommitObserverForTests((event, detail) => events.push({ event, ...detail }))
    return {
        events,
        countOf: (event) => events.filter((e) => e.event === event).length,
        winEvaluations: (source) => events.filter((e) => e.event === 'WIN_EVALUATED' && e.source === source).length,
    }
}

/** JOKER 1 · DOCTOR 1 · CITIZEN n 구성의 밤 픽스처(GUARD/WITCH_HUNTER 없음)를 만든다. */
function sequencedNight({ id, playerCount = 5 }) {
    const fixture = nightSessionWithDoctor({ id, playerCount })
    assert.equal(markNightSequenced(fixture.session), true)
    return fixture
}

/** 남은 역할을 순서대로 확정해 그 밤의 네 역할 완료 상태를 만든다. */
function completeRemainingRoles(session, roles) {
    for (const role of roles) {
        const done = completeNightRole(session, role)
        assert.equal(done.ok, true, `${role} 확정 실패(${done.code})`)
    }
}

// --- AC-01: 킬 직후·치료 판정 전에는 승패 판정도 종료도 시작되지 않는다 ---

test('AC-01(F-25b): 광대 턴만 끝난 시점에는 KILL·PENDING_RECOVERY만 남고 대상은 canonical alive이며 승패 평가·종료 확정이 한 번도 실행되지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac01' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    const observed = captureCommitEvents()

    const completed = completeNightRole(session, 'JOKER')

    assert.equal(completed.ok, true)
    assert.deepEqual(completed.step, { role: 'JOKER', targetId: targetUuid, status: 'RESOLVED' })
    assert.equal(completed.healingClosed, false, '광대 턴은 치료 가능성을 닫지 않는다')

    const progress = gameSession.__testables.getNightProgress(session)
    assert.deepEqual(progress.events, [{ type: 'KILL', targetId: targetUuid }])
    assert.equal(progress.recoveryStates.get(targetUuid), 'PENDING_RECOVERY')
    assert.deepEqual([...progress.completedRoles], ['JOKER'])

    // canonical 상태는 그대로다 — 임시 사망은 alive를 바꾸지 않는다.
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)
    assert.equal(session.nightResolution, null)
    assert.equal(Object.hasOwn(session, 'winResult'), false)

    // 승패 판정·사망 확정·종료 확정 중 어느 것도 시작되지 않았다(0회).
    assert.deepEqual(observed.events, [])

    // 의사는 아직 자기 턴을 쓸 수 있다 — 치료 가능성이 열려 있다는 것의 관측 가능한 형태다.
    assert.deepEqual(submitNightAction(doctorUuid, session.id, targetUuid), { ok: true, gameId: session.id })
})

test('AC-01(F-25b): 네 역할이 다 끝나기 전의 밤 최종 준비는 ACTIONS_PENDING이고 canonical 상태를 전혀 바꾸지 않는다', () => {
    const { session, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-pending' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    const observed = captureCommitEvents()

    assert.deepEqual(prepareNightResolutionForSession(session), { ok: false, code: 'ACTIONS_PENDING' })
    // 수동 resolve_night가 들어와도 같은 코드다 — 미완료 역할을 건너뛰고 확정하지 않는다.
    assert.deepEqual(prepareNightResolution(jokerUuid, session.id), { ok: false, code: 'ACTIONS_PENDING' })

    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightResolution, null)
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.deepEqual(observed.events, [])
})

// --- AC-02: 치료가 성공한 밤은 최종 사망 0이고 승패 상태가 변하지 않는다 ---

test('AC-02(F-25b): 순차 경로에서 치료가 성공하면 그 밤의 최종 사망은 0이고 victimUuid/deathReveals가 비며 승패 상태가 변하지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac02' })
    const [targetUuid] = citizenUuids
    const aliveBefore = [...session.players.values()].filter((p) => p.alive).length
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, targetUuid)
    const observed = captureCommitEvents()

    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])

    const progress = gameSession.__testables.getNightProgress(session)
    assert.deepEqual(progress.events, [
        { type: 'KILL', targetId: targetUuid },
        { type: 'HEAL', targetId: targetUuid },
    ])
    assert.equal(progress.recoveryStates.get(targetUuid), 'RECOVERED')

    const prepared = prepareNightResolutionForSession(session)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: null, terminal: null })
    assert.deepEqual(session.nightResolution.publicDeathReveals, [])
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.equal([...session.players.values()].filter((p) => p.alive).length, aliveBefore)
    assert.equal(session.phase, 'DAY')
    assert.equal(Object.hasOwn(session, 'winResult'), false)

    // 사망 확정은 0회, 승패 평가는 밤 최종화의 1회뿐이고 종료 확정은 없다.
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    assert.equal(observed.countOf('GAME_FINALIZED'), 0)

    const payload = buildNightResultAppliedPayload(session, applied.victimUuid, session.nightResolution.publicDeathReveals)
    assert.equal(payload.victimUuid, null)
    assert.deepEqual(payload.deathReveals, [])
})

// --- AC-03: 미치료 밤은 의사 턴 이후 전체 밤 종료에서 정확히 1회 확정된다 ---

test('AC-03(F-25b): 의사 턴이 기권으로 끝나면 치료 가능성만 닫히고(DEATH_CANDIDATE) 사망·승패 평가는 그 시점에 한 번도 실행되지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac03-doctor' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    const observed = captureCommitEvents()

    const completed = completeNightRole(session, 'DOCTOR')

    assert.equal(completed.ok, true)
    assert.equal(completed.healingClosed, true)
    const progress = gameSession.__testables.getNightProgress(session)
    assert.equal(progress.recoveryStates.get(targetUuid), 'DEATH_CANDIDATE')
    // A-06: 의사 종료는 치료 가능성만 닫는다 — canonical alive는 그대로다.
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightResolution, null)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('NIGHT'), 0)
})

test('AC-03(F-25b): 미치료 밤은 마지막 역할까지 끝난 뒤에만 사망 1회·승패 평가 1회로 확정되고 DAY로 넘어간다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac03-final' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    const observed = captureCommitEvents()

    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    // 네 역할이 다 끝나도 최종화 전까지는 아무 것도 확정되지 않는다.
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.deepEqual(observed.events, [])

    const prepared = prepareNightResolutionForSession(session)
    assert.equal(prepared.ok, true)
    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: targetUuid, terminal: null })
    assert.equal(session.players.get(targetUuid).alive, false)
    assert.equal(session.players.get(targetUuid).deathReason, 'ASSASSINATION')
    assert.equal(session.phase, 'DAY')
    assert.deepEqual(session.nightResolution.publicDeathReveals, [{ victimUuid: targetUuid, source: 'JOKER' }])

    // 정확히 한 번씩이다 — 사망 확정 1, 밤 승패 평가 1, 종료 확정 0(비종결 밤).
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    assert.equal(observed.winEvaluations('DISCONNECT'), 0)
    assert.equal(observed.countOf('GAME_FINALIZED'), 0)
})

test('AC-03(F-25b): 같은 밤을 두 번 최종화하려 해도 두 번째는 거부되고 사망·승패 평가가 다시 실행되지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-once' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    const observed = captureCommitEvents()
    commitNightResolution(prepared.session, prepared.resolution)
    const dayIndexAfterFirst = session.dayIndex

    // (a) 같은 준비 객체로 다시 커밋 — 준비는 이미 소진됐다.
    assert.deepEqual(
        commitNightResolution(session, prepared.resolution),
        { ok: false, code: 'NIGHT_ALREADY_RESOLVED' },
    )
    // (b) 이미 확정된 밤에 대해 새 준비를 만들려는 시도 자체가 막힌다.
    assert.deepEqual(prepareNightResolutionForSession(session), { ok: false, code: 'NIGHT_ALREADY_RESOLVED' })

    assert.equal(session.dayIndex, dayIndexAfterFirst)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

test('AC-03(F-25b): 같은 밤의 두 번째 커밋은 NIGHT_ALREADY_RESOLVED로 거부되고 상태가 불변이다(밤이 아직 NIGHT로 남는 손상 상태 재현)', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-dup-commit' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    // 두 경로가 같은 밤에 대해 각각 준비를 들고 최종화를 시도하는 경쟁 상황이다.
    const first = prepareNightResolutionForSession(session)
    const second = prepareNightResolutionForSession(session)
    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.notEqual(first.resolution, second.resolution)

    const nightDayIndex = session.dayIndex
    const observed = captureCommitEvents()
    assert.deepEqual(
        commitNightResolution(session, first.resolution),
        { ok: true, victimUuid: targetUuid, terminal: null },
    )
    // 늦은 두 번째 진입이 phase/dayIndex 가드만으로 걸리지 않도록 그 밤의 좌표로 되돌린다 —
    // 그래야 "이미 확정된 밤"이라는 사실 자체가 유일한 거부 근거임을 확인할 수 있다.
    session.phase = 'NIGHT'
    session.dayIndex = nightDayIndex

    assert.deepEqual(
        commitNightResolution(session, second.resolution),
        { ok: false, code: 'NIGHT_ALREADY_RESOLVED' },
    )
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

// --- AC-04: 마지막 밤의 킬+치료 ---

test('AC-04(F-25b): 마지막 밤에 킬과 치료가 함께 일어나도 치료가 성공하면 게임이 끝나지 않는다', () => {
    // 킬 전: 생존 JOKER 1 · 생존 비-JOKER 2 → 어느 진영도 승리하지 않는다.
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac04-heal', playerCount: 3 })
    const [targetUuid] = citizenUuids
    assert.equal(gameSession.__testables.evaluateWinCondition(session), null, '킬 전에는 승자가 없어야 한다')

    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, targetUuid)
    const observed = captureCommitEvents()
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])

    const prepared = prepareNightResolutionForSession(session)
    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: null, terminal: null })
    assert.equal([...session.players.values()].filter((p) => p.alive).length, 3)
    assert.equal(session.phase, 'DAY')
    assert.equal(Object.hasOwn(session, 'winResult'), false)
    assert.equal(observed.countOf('GAME_FINALIZED'), 0)
})

test('AC-04(F-25b) 대조군: 같은 마지막 밤에서 치료가 없으면 광대 동수로 게임이 종료된다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac04-kill', playerCount: 3 })
    const [targetUuid] = citizenUuids
    assert.equal(gameSession.__testables.evaluateWinCondition(session), null)

    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    const observed = captureCommitEvents()
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])

    const prepared = prepareNightResolutionForSession(session)
    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: targetUuid, terminal: { winner: 'JOKER' } })
    assert.equal([...session.players.values()].filter((p) => p.alive).length, 2)
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(observed.countOf('GAME_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

// --- A-07: 완료된 역할의 사건은 이후 어떤 정리로도 재계산·삭제되지 않는다 ---

test('AC-03/A-07(F-25b): 이미 확정된 역할의 재완료는 ROLE_ALREADY_COMPLETED로 거부되고 사건·roleSteps·revision이 전부 불변이다', () => {
    const { session, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-idempotent' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    const first = completeNightRole(session, 'JOKER')
    assert.equal(first.ok, true)
    const progress = gameSession.__testables.getNightProgress(session)
    const eventsBefore = [...progress.events]
    const stepsBefore = [...progress.roleSteps]

    const again = completeNightRole(session, 'JOKER')

    assert.deepEqual(again, { ok: false, code: 'ROLE_ALREADY_COMPLETED' })
    assert.deepEqual(progress.events, eventsBefore)
    assert.deepEqual(progress.roleSteps, stepsBefore)
    assert.deepEqual(progress.events, [{ type: 'KILL', targetId: targetUuid }])
    assert.equal(progress.roleSteps.length, 1)
    assert.equal(progress.revision, first.revision, 'revision이 오르지 않는다')
    assert.equal(progress.recoveryStates.get(targetUuid), 'PENDING_RECOVERY')
    assert.equal(session.players.get(targetUuid).alive, true)
})

// --- AC-03: 순차 완료 경계(지금 차례인 역할만, 선행 역할 완료 후, 제출이 끝난 뒤) ---

test('AC-03(F-25b): 순서를 건너뛴 역할 확정(의사 먼저·경비원 먼저)은 거부되고 진행 자료조차 만들어지지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-order-skip' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, targetUuid)
    const observed = captureCommitEvents()

    // 광대 턴이 아직 끝나지 않았는데 의사·경비원을 먼저 확정할 수 없다.
    assert.deepEqual(completeNightRole(session, 'DOCTOR'), { ok: false, code: 'ROLE_OUT_OF_ORDER' })
    assert.deepEqual(completeNightRole(session, 'GUARD'), { ok: false, code: 'ROLE_OUT_OF_ORDER' })
    assert.deepEqual(completeNightRole(session, 'WITCH_HUNTER'), { ok: false, code: 'ROLE_OUT_OF_ORDER' })

    const progress = gameSession.__testables.getNightProgress(session)
    assert.deepEqual([...progress.completedRoles], [], '완료된 역할이 하나도 생기지 않았다')
    assert.deepEqual(progress.events, [], '거부된 확정은 사건을 만들지 않는다')
    assert.deepEqual(progress.roleSteps, [])
    assert.equal(progress.revision, 0)
    assert.equal(progress.healingClosed, false, '의사 확정 거부가 치료 가능성을 닫지 않는다')
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.equal(session.nightResolution, null)
    assert.deepEqual(observed.events, [])

    // 광대가 먼저 끝난 뒤에는 의사가 지금 차례가 되어 정상 확정된다(거부가 밤을 막지 않는다).
    assert.equal(completeNightRole(session, 'JOKER').ok, true)
    assert.deepEqual(completeNightRole(session, 'GUARD'), { ok: false, code: 'ROLE_OUT_OF_ORDER' })
    const doctorDone = completeNightRole(session, 'DOCTOR')
    assert.equal(doctorDone.ok, true)
    assert.equal(doctorDone.healingClosed, true)
})

test('AC-03(F-25b): 그 역할의 생존 행위자 제출이 끝나지 않은 상태의 확정은 ACTIONS_PENDING으로 거부되고 상태가 불변이다', () => {
    const { session, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-order-pending' })
    const [targetUuid] = citizenUuids
    const observed = captureCommitEvents()

    // 광대가 아직 제출하지 않았다 — 그 턴을 확정하면 "제출하지 않은 밤"이 조용히 집계된다.
    assert.deepEqual(completeNightRole(session, 'JOKER'), { ok: false, code: 'ACTIONS_PENDING' })

    const progress = gameSession.__testables.getNightProgress(session)
    assert.deepEqual([...progress.completedRoles], [])
    assert.deepEqual(progress.events, [])
    assert.equal(progress.revision, 0)
    assert.deepEqual(observed.events, [])

    // 제출이 끝나면(기권도 제출이다) 같은 호출이 그대로 성립한다.
    submitNightAction(jokerUuid, session.id, targetUuid)
    assert.equal(completeNightRole(session, 'JOKER').ok, true)
    assert.deepEqual(gameSession.__testables.getNightProgress(session).events, [{ type: 'KILL', targetId: targetUuid }])
})

test('AC-03(F-25b): 같은 역할의 생존 행위자가 여럿이면 한 명이라도 미제출인 동안에는 그 턴을 확정할 수 없다', () => {
    const { session, roleUuids, citizenUuids } = nightSessionWithDuplicateRole({ id: 'room-f25b-order-partial', role: 'JOKER' })
    const [targetUuid] = citizenUuids
    assert.equal(markNightSequenced(session), true)
    assert.ok(roleUuids.length >= 2, '같은 역할 보유자가 둘 이상인 픽스처여야 한다')

    submitNightAction(roleUuids[0], session.id, targetUuid)
    assert.deepEqual(completeNightRole(session, 'JOKER'), { ok: false, code: 'ACTIONS_PENDING' })
    assert.deepEqual(gameSession.__testables.getNightProgress(session).completedRoles.size, 0)

    for (const actorUuid of roleUuids.slice(1)) submitNightAction(actorUuid, session.id, targetUuid)
    assert.equal(completeNightRole(session, 'JOKER').ok, true)
})

test('A-07(F-25b): 확정된 역할의 늦은 제출은 거부되고 이미 기록된 사건을 다시 쓰지 못한다', () => {
    const { session, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-late-submit' })
    const [targetUuid, otherUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    // 마지막 턴 종료 방송 중 nightTurnRole이 잠시 null인 틈을 재현한다.
    assert.equal(session.nightTurnRole ?? null, null)
    assert.equal(isNightRoleCompleted(session, 'JOKER'), true)

    assert.deepEqual(submitNightAction(jokerUuid, session.id, otherUuid), { ok: false, code: 'NOT_YOUR_TURN' })

    assert.equal(session.nightActions.get(jokerUuid), targetUuid)
    assert.deepEqual(
        gameSession.__testables.getNightProgress(session).events,
        [{ type: 'KILL', targetId: targetUuid }],
    )
})

test('A-08(F-25b): KILL 뒤 광대가 이탈해 경기가 끝나면 미확정 밤은 커밋되지 않고, 이미 기록된 KILL 사건도 확정 nightResolution으로 승격되지 않는다', () => {
    const { session, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-joker-left', playerCount: 6 })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    const observed = captureCommitEvents()

    const departure = commitParticipantDeparture(session, jokerUuid)

    // 유일한 광대의 이탈은 기존 F-21대로 그 자리에서 DISCONNECT 사망과 승패 평가를 수행한다.
    assert.equal(departure.ok, true)
    assert.deepEqual(departure.terminal, { winner: 'CITIZEN' })
    assert.equal(session.phase, 'ENDED')
    assert.equal(observed.countOf('DISCONNECT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('DISCONNECT'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 0)

    // 이미 확정된 사건은 진행 자료에 그대로 남고, 확정 결과로 승격되지 않는다.
    const progress = gameSession.__testables.getNightProgress(session)
    assert.deepEqual(progress.events, [{ type: 'KILL', targetId: targetUuid }])
    assert.equal(session.nightResolution, null)
    assert.equal(session.players.get(targetUuid).alive, true, '임시 사망 후보는 이탈 종결에도 최종 사망하지 않는다')

    // 늦은 밤 최종화는 추가 커밋을 만들지 않는다.
    assert.deepEqual(prepareNightResolutionForSession(session), { ok: false, code: 'GAME_ALREADY_ENDED' })
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
})

test('A-07(F-25b): 의사가 자기 턴 확정 전에 이탈하면 그 턴은 행위자 없음으로 닫히고 이미 확정된 KILL은 그대로 사망 후보로 남는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-doctor-left-early', playerCount: 6 })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, targetUuid)

    const departure = commitParticipantDeparture(session, doctorUuid)
    assert.equal(departure.ok, true)
    assert.equal(departure.terminal ?? null, null, '의사 이탈만으로는 끝나지 않는 구성이다')

    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])

    const progress = gameSession.__testables.getNightProgress(session)
    // 아직 확정되지 않았던 의사 턴은 현재 상태(생존 의사 없음)로 계산돼 치료가 성립하지 않는다.
    assert.deepEqual(progress.events, [{ type: 'KILL', targetId: targetUuid }])
    assert.equal(progress.healingClosed, true)
    assert.equal(progress.recoveryStates.get(targetUuid), 'DEATH_CANDIDATE')
    // 이미 확정된 KILL 사건 자체는 이탈로 사라지지 않는다.
    assert.deepEqual(
        progress.roleSteps.find((s) => s.role === 'JOKER'),
        { role: 'JOKER', targetId: targetUuid, status: 'RESOLVED' },
    )
})

test('A-08(F-25b): KILL→HEAL 뒤 대상이 이탈하면 그 사망은 이탈 경로가 소유하고 HEAL이 되살리지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-healed-left', playerCount: 6 })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, targetUuid)
    completeNightRole(session, 'DOCTOR')
    assert.equal(gameSession.__testables.getNightProgress(session).recoveryStates.get(targetUuid), 'RECOVERED')

    assert.equal(commitParticipantDeparture(session, targetUuid).ok, true)
    completeRemainingRoles(session, ['GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: null, terminal: null })
    assert.equal(session.players.get(targetUuid).alive, false, '이탈 사망이 HEAL로 되살아나지 않는다')
    assert.equal(session.players.get(targetUuid).deathReason, 'DISCONNECT')
    assert.deepEqual(session.nightResolution.publicDeathReveals, [])
})

test('A-07(F-25b): 의사 턴이 끝난 뒤 의사가 이탈해도 이미 만들어진 HEAL 사건과 RECOVERED 상태는 유지된다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-doctor-left', playerCount: 6 })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, targetUuid)
    completeNightRole(session, 'DOCTOR')

    assert.equal(commitParticipantDeparture(session, doctorUuid).ok, true)

    const progress = gameSession.__testables.getNightProgress(session)
    assert.deepEqual(progress.events, [
        { type: 'KILL', targetId: targetUuid },
        { type: 'HEAL', targetId: targetUuid },
    ])
    assert.equal(progress.recoveryStates.get(targetUuid), 'RECOVERED')
    assert.equal(progress.healingClosed, true)
})

// --- A-08: 이탈이 먼저 확정한 사망은 밤이 다시 처리하지 않는다 ---

test('A-08(F-25b): 공격 대상이 밤 최종화 전에 끊김 사망하면 그 밤의 최종 후보는 null로 정규화되고 새 ASSASSINATION·reveal이 생기지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-target-left', playerCount: 6 })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    assert.equal(prepared.resolution.pendingEliminationTargetId, targetUuid)

    const observed = captureCommitEvents()
    // 준비 이후에 이탈이 먼저 그 사망을 확정한다.
    assert.equal(commitDisconnectElimination(session, targetUuid).ok, true)
    assert.equal(session.players.get(targetUuid).deathReason, 'DISCONNECT')

    // 준비 시점의 최종 후보가 그 사이 빠졌으므로 커밋이 그 자리에서 null로 정규화한다 —
    // 준비를 다시 만들 필요 없이, 이미 확정된 사망을 밤이 다시 처리하지 않는다.
    const applied = commitNightResolution(session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: null, terminal: null })
    assert.equal(session.nightResolution.pendingEliminationTargetId, null, '확정 결과에도 null이 반영된다')
    assert.equal(session.players.get(targetUuid).deathReason, 'DISCONNECT', '사망 원인이 ASSASSINATION으로 덮이지 않는다')
    assert.deepEqual(session.nightResolution.publicDeathReveals, [])
    // 사망은 이탈 경로가 1회 확정했고 밤은 새 사망을 만들지 않았다.
    assert.equal(observed.countOf('DISCONNECT_DEATH_FINALIZED'), 1)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('DISCONNECT'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

// --- A-03: 준비 출처·신선도 ---

test('A-03(F-25b): 출처 없는 준비·다른 경기의 준비·이전 밤의 준비는 전부 거부되고 세션 상태가 불변이다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-source-a' })
    const other = sequencedNight({ id: 'room-f25b-source-b' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    const observed = captureCommitEvents()

    // (a) 출처가 전혀 없는 손조립 객체
    assert.deepEqual(
        commitNightResolution(session, { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: targetUuid }),
        { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' },
    )
    // (b) 다른 경기에서 만든 준비
    submitNightAction(other.jokerUuid, other.session.id, other.citizenUuids[0])
    completeNightRole(other.session, 'JOKER')
    submitNightAction(other.doctorUuid, other.session.id, null)
    completeRemainingRoles(other.session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    const otherPrepared = prepareNightResolutionForSession(other.session)
    assert.deepEqual(
        commitNightResolution(session, otherPrepared.resolution),
        { ok: false, code: 'UNKNOWN_RESOLUTION_SOURCE' },
    )
    // (c) 전달된 준비 객체를 바깥에서 변형해도 확정 내용은 등록된 원본을 따른다
    prepared.resolution.pendingEliminationTargetId = other.citizenUuids[0]
    const applied = commitNightResolution(session, prepared.resolution)

    assert.deepEqual(applied, { ok: true, victimUuid: targetUuid, terminal: null })
    assert.equal(session.players.get(targetUuid).alive, false)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
})

test('A-03(F-25b): 준비 이후 역할이 하나 더 확정되면 그 준비는 오래된 것으로 거부된다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-stale-rev' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    // 준비 이후에 진행 자료가 한 번 더 움직였다고 가정한다(진행 revision만 올린다).
    gameSession.__testables.getNightProgress(session).revision += 1
    const observed = captureCommitEvents()

    assert.deepEqual(
        commitNightResolution(session, prepared.resolution),
        { ok: false, code: 'STALE_RESOLUTION' },
    )
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightResolution, null)
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.deepEqual(observed.events, [])
})

test('AC-05(F-25b): 직접 준비 뒤 제출이 바뀌면 그 준비의 커밋은 거부되고(다시 준비해야 한다) 상태가 불변이다', () => {
    // 시퀀서 없는 기존 직접 판정 경로다(markNightSequenced를 부르지 않는다).
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'room-f25b-fresh-submit' })
    const [targetUuid, otherUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, null)
    const prepared = prepareNightResolutionForSession(session)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.pendingEliminationTargetId, targetUuid)
    const observed = captureCommitEvents()

    // 준비 이후에 광대가 대상을 바꾼다 — 그 준비는 더 이상 현재 밤을 설명하지 못한다.
    assert.deepEqual(submitNightAction(jokerUuid, session.id, otherUuid), { ok: true, gameId: session.id })

    assert.deepEqual(commitNightResolution(session, prepared.resolution), { ok: false, code: 'STALE_RESOLUTION' })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightResolution, null)
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.equal(session.players.get(otherUuid).alive, true)
    assert.deepEqual(observed.events, [], '거부된 커밋은 사망·승패 평가를 시작하지 않는다')

    // 다시 준비하면 바뀐 제출을 반영해 정상 확정된다.
    const reprepared = prepareNightResolutionForSession(session)
    assert.equal(reprepared.ok, true)
    assert.deepEqual(
        commitNightResolution(session, reprepared.resolution),
        { ok: true, victimUuid: otherUuid, terminal: null },
    )
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
})

test('AC-05(F-25b): 직접 준비 뒤 순차 진행이 새로 시작되면 그 준비의 커밋은 거부된다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'room-f25b-fresh-seq' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, null)
    const prepared = prepareNightResolutionForSession(session)
    assert.equal(prepared.ok, true)
    const observed = captureCommitEvents()

    // 그 사이 이 밤이 순차 진행으로 넘어갔다 — 직접 판정용 준비로 네 역할을 건너뛸 수 없다.
    assert.equal(markNightSequenced(session), true)

    assert.deepEqual(commitNightResolution(session, prepared.resolution), { ok: false, code: 'STALE_RESOLUTION' })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightResolution, null)
    assert.equal(session.players.get(targetUuid).alive, true)
    assert.deepEqual(observed.events, [])
    // 순차 밤이 된 이상 새 준비도 네 역할이 끝나기 전에는 성립하지 않는다.
    assert.deepEqual(prepareNightResolutionForSession(session), { ok: false, code: 'ACTIONS_PENDING' })
})

test('AC-05(F-25b): 변조된 resolution(대상·공개 출처·개인 결과·덧붙인 필드)으로 커밋해도 확정은 세션이 보관한 준비 결과만 따른다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-tampered' })
    const [targetUuid, otherUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    assert.equal(prepared.ok, true)
    const observed = captureCommitEvents()

    // 준비를 손에 넣은 쪽이 대상·공개 출처 귀속·개인 결과·내부 사건을 전부 바꿔 본다.
    prepared.resolution.pendingEliminationTargetId = otherUuid
    prepared.resolution.assassinationTargetId = otherUuid
    prepared.resolution.witchHunterExecutionTargetId = targetUuid
    prepared.resolution.privateResults.set(otherUuid, { actionType: 'INVESTIGATE', targetId: jokerUuid, role: 'JOKER' })
    prepared.resolution.events.push({ type: 'HEAL', targetId: targetUuid })
    prepared.resolution.recoveryStates.set(targetUuid, 'RECOVERED')

    const applied = commitNightResolution(session, prepared.resolution)

    // 확정은 준비 시점의 값 그대로다 — 변조된 대상은 살아 있고, 원래 대상만 사망한다.
    assert.deepEqual(applied, { ok: true, victimUuid: targetUuid, terminal: null })
    assert.equal(session.players.get(targetUuid).alive, false)
    assert.equal(session.players.get(targetUuid).deathReason, 'ASSASSINATION')
    assert.equal(session.players.get(otherUuid).alive, true)
    // 공개 출처도 준비 시점의 귀속(JOKER)만 따른다 — 덧붙인 필드는 확정 내용에 남지 않는다.
    assert.deepEqual(session.nightResolution.publicDeathReveals, [{ victimUuid: targetUuid, source: 'JOKER' }])
    assert.equal(Object.hasOwn(session.nightResolution, 'witchHunterExecutionTargetId'), false)
    assert.equal(session.nightResolution.assassinationTargetId, targetUuid)
    // 위조된 개인 결과·사건·회복 상태도 전부 원본으로 되돌아온다.
    assert.equal(session.nightResolution.privateResults.has(otherUuid), false)
    assert.deepEqual(session.nightResolution.events, [{ type: 'KILL', targetId: targetUuid }])
    assert.equal(session.nightResolution.recoveryStates.get(targetUuid), 'DEATH_CANDIDATE')
    // 사망·승패 평가는 각각 정확히 한 번이다.
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

test('AC-01(F-25b): 경기 기록 조립 관찰 통로는 실제 buildGameResultRecord 호출에서만 1회 울린다(0회 단언의 근거)', () => {
    // "그 시점에는 기록 저장이 시작되지 않았다"는 0회 단언이 의미를 가지려면, 같은 통로가
    // 실제 조립에서는 반드시 울려야 한다 — 이 시험이 그 양성 대조다.
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-record-probe', playerCount: 3 })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    const observed = captureCommitEvents()
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])

    const prepared = prepareNightResolutionForSession(session)
    const applied = commitNightResolution(prepared.session, prepared.resolution)

    // 밤 확정 자체는 기록을 조립하지 않는다(저장은 소켓 계층의 종결 저장 경계가 소유한다).
    assert.deepEqual(applied.terminal, { winner: 'JOKER' })
    assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 0)

    const record = gameSession.buildGameResultRecord(session, { completed: true })

    assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 1)
    assert.deepEqual(
        observed.events.filter((e) => e.event === 'RESULT_RECORD_BUILD_STARTED')[0],
        { event: 'RESULT_RECORD_BUILD_STARTED', gameId: session.id, completed: true },
    )
    assert.equal(record.result.id, session.id)
})

// --- A-02/AC-06: 공개 스냅샷은 임시 사망을 최종 사망으로 내보내지 않는다 ---

test('AC-06(F-25b): 킬 직후·의사 종료 직후의 스냅샷은 대상을 isAlive:true로 내보내고 그 밤의 확정 nightResult를 담지 않는다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac06' })
    const [targetUuid] = citizenUuids
    const viewerUuid = citizenUuids[1]
    submitNightAction(jokerUuid, session.id, targetUuid)

    completeNightRole(session, 'JOKER')
    const afterKill = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.equal(afterKill.ok, true)
    assert.equal(afterKill.snapshot.players.find((p) => p.uuid === targetUuid).isAlive, true)
    assert.equal(afterKill.snapshot.nightResult ?? null, null)
    // 진행 자료(회복 상태·비공개 대상)는 어떤 경로로도 직렬화되지 않는다.
    const serializedAfterKill = JSON.stringify(afterKill.snapshot)
    for (const forbidden of ['nightProgress', 'recoveryStates', 'PENDING_RECOVERY', 'DEATH_CANDIDATE', 'roleSteps']) {
        assert.equal(serializedAfterKill.includes(forbidden), false, `${forbidden}가 공개 스냅샷에 노출됨`)
    }

    submitNightAction(doctorUuid, session.id, null)
    completeNightRole(session, 'DOCTOR')
    const afterDoctor = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.equal(afterDoctor.snapshot.players.find((p) => p.uuid === targetUuid).isAlive, true)
    assert.equal(afterDoctor.snapshot.nightResult ?? null, null)

    completeRemainingRoles(session, ['GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    commitNightResolution(prepared.session, prepared.resolution)

    const afterCommit = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.equal(afterCommit.snapshot.players.find((p) => p.uuid === targetUuid).isAlive, false)
    assert.equal(afterCommit.snapshot.nightResult.victimUuid, targetUuid)
})

test('AC-06(F-25b): 치료가 성공한 밤의 최종 스냅샷은 대상을 생존으로, nightResult.victimUuid를 null로 내보낸다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-ac06-heal' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, targetUuid)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    const prepared = prepareNightResolutionForSession(session)
    commitNightResolution(prepared.session, prepared.resolution)

    const snapshot = getSessionSnapshotForPlayer(targetUuid, session.id)

    assert.equal(snapshot.ok, true)
    assert.equal(snapshot.snapshot.players.find((p) => p.uuid === targetUuid).isAlive, true)
    assert.equal(snapshot.snapshot.nightResult.victimUuid, null)
})

// --- A-10: 자동 최종화의 실행 전제 ---

test('A-10(F-25b): 순차 준비는 요청자 uuid 없이 canonical session만으로 성립하고, registry에서 빠진 세션·종료된 세션은 거부된다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-a10' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])

    // 종료된 세션은 그 자리에서 거부된다(늦은 타이머가 끝난 판을 다시 진행시키지 않는다).
    const endedFixture = sequencedNight({ id: 'room-f25b-a10-ended' })
    endedFixture.session.phase = 'ENDED'
    endedFixture.session.winResult = { winner: 'CITIZEN' }
    assert.deepEqual(prepareNightResolutionForSession(endedFixture.session), { ok: false, code: 'GAME_ALREADY_ENDED' })
    assert.deepEqual(completeNightRole(endedFixture.session, 'GUARD'), { ok: false, code: 'GAME_ALREADY_ENDED' })

    // registry에서 제거된 세션 객체는 같은 id를 가졌어도 거부된다(대표 UUID를 만들지 않는다).
    gameSession.__testables.__deleteGameSessionOnlyForTests(session.id)
    assert.deepEqual(prepareNightResolutionForSession(session), { ok: false, code: 'SESSION_NOT_FOUND' })
    assert.deepEqual(completeNightRole(session, 'GUARD'), { ok: false, code: 'SESSION_NOT_FOUND' })
})

test('A-01(F-25b) 회귀: 순차 경로도 NIGHT_TURN_ORDER의 네 역할을 그 순서 그대로 roleSteps에 남긴다', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = sequencedNight({ id: 'room-f25b-order' })
    const [targetUuid] = citizenUuids
    submitNightAction(jokerUuid, session.id, targetUuid)
    completeNightRole(session, 'JOKER')
    submitNightAction(doctorUuid, session.id, null)
    completeRemainingRoles(session, ['DOCTOR', 'GUARD', 'WITCH_HUNTER'])

    const prepared = prepareNightResolutionForSession(session)

    assert.deepEqual(prepared.resolution.roleSteps.map((s) => s.role), [...NIGHT_TURN_ORDER])
})
