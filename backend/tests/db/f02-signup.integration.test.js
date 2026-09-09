'use strict';

// F-02 AC-05/AC-06 격리 DB 검증 — 실제 MySQL 격리 DB에서만 의미 있는 두 가지를 확인한다:
//   1) AC-05: 같은 이메일로 동시에 가입을 시도하면 DB 유일 제약에 의해 하나만 성공하고
//      나머지는 409를 받는다(서비스 계층의 사전 findByEmail만으로는 경합을 못 막는다).
//   2) AC-06: 관리 필드(role/status/email_verified)를 얹어 가입해도 저장되지 않고,
//      가입 후 같은 자격증명으로 재로그인이 성공한다.
//
// backend/tests/db/f01-migrations.integration.test.js와 같은 원칙을 따른다: 전용 격리
// DB(F01_TEST_DATABASE_URL)가 없거나 연결에 실패하면 실패로 표시하지 않고 t.skip으로
// "미검증"임을 남긴다 — .env.test의 더미 DATABASE_URL은 이 용도로 재사용하지 않는다.

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// F01_TEST_DATABASE_URL이 없을 때도 아래 backend/models require가 살아있는 문법의 URL을
// 필요로 한다(Sequelize 생성자가 문자열을 파싱하기 때문 — 실제 연결은 시도하지 않는다).
// .env.test가 로드되지 않는 방식(예: node --test 직접 실행)으로 이 파일이 돌아가면
// process.env.DATABASE_URL이 아예 비어 있어 require 시점에 예외로 죽어, 아래
// unavailable(t)의 "미검증" skip에 도달하기도 전에 파일 전체가 실패로 보였다.
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');

const MIGRATIONS = [baseline, expandNicknameSnapshot];
const MANAGED_TABLES = [...baseline.TABLE_ORDER, migrationRunner.META_TABLE];
const DROP_ORDER = [...baseline.TABLE_ORDER].reverse().concat([migrationRunner.META_TABLE]);

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB(${TEST_DB_URL.replace(/:[^:@]*@/, ':***@')})에 연결할 수 없습니다 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const resetSchema = async () => {
    const queryInterface = sequelize.getQueryInterface();
    const existing = new Set(await queryInterface.showAllTables());
    const unknown = [...existing].filter((t) => !MANAGED_TABLES.includes(t));
    if (unknown.length > 0) {
        throw new Error(
            `격리 DB에 F-01이 모르는 테이블이 있습니다: [${unknown.join(', ')}]. ` +
            `전용 테스트 DB가 맞는지 확인하세요 — 안전을 위해 진행을 거부합니다.`,
        );
    }
    for (const table of DROP_ORDER) {
        if (existing.has(table)) await queryInterface.dropTable(table);
    }
};

const VALID_SIGNUP_BASE = {
    password: 'pw12345678',
    passwordConfirm: 'pw12345678',
    birthDate: '2000-01-01',
};

// backend/models와 auth.service.js/user.repositories.js는 require 캐시 싱글턴이라, 파일
// 맨 위에서 이미 맞춰둔 process.env.DATABASE_URL(F01_TEST_DATABASE_URL)로 처음 require되는
// 이 시점에 격리 DB에 연결된다 — 실제 저장 경로(auth.service → user.repositories → Sequelize)를
// 그대로 태운다.
const db = require('../../models');
const authService = require('../../service/auth.service');
const userRepository = require('../../repositories/user.repositories');
const gameResultRepository = require('../../repositories/gameResult.repositories');

// db(backend/models)는 require 캐시 싱글턴이라 db.sequelize는 이 파일의 네 테스트가
// 전부 공유한다. 이전 회차는 테스트마다 개별적으로 t.after(() => db.sequelize.close())를
// 등록했는데, node:test는 한 파일의 테스트를 순차 실행하므로 첫 테스트가 끝나며 연결을
// 닫아버리면 이후 테스트는 전부 "연결 종료" 오류로 실패했다(재검토 지적). 파일 전체에서
// 정확히 한 번만, 모든 테스트가 끝난 뒤에 닫는다.
test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// ── AC-05 ───────────────────────────────────────────────────────────────────

test('AC-05: 사전 조회가 둘 다 "중복 없음"을 본 뒤에도 DB 유일 제약이 하나만 남긴다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    // signup()의 findByEmail 사전 조회가 우연히 순차적으로 끝나면(하나가 커밋된 뒤 다른
    // 하나가 조회) 두 번째는 애플리케이션 계층의 사전 검사("이미 사용 중인 이메일입니다.",
    // auth.service.js)에서 걸러질 수 있다 — 이러면 409가 DB 유일 제약이 아니라 이 사전
    // 검사 때문일 수 있어, "DB 유일 제약에 의해 409"라는 AC-05를 입증하지 못한다.
    //
    // 이전 회차는 "두 호출 모두 findByEmail을 시작했다"는 시점(arrival)에만 장벽을 뒀는데,
    // 이는 두 실제 쿼리가 *시작*되는 것만 보장할 뿐 *완료*를 보장하지 않는다 — JS 이벤트
    // 루프 스케줄링에 우연히 기대는 것이지 구조적 보장이 아니라는 재검토 지적을 받았다.
    // 그래서 두 번째 장벽(settled)을 추가해, 두 원본 조회가 모두 "중복 없음"으로 응답을
    // 받은 뒤에야 각 호출이 결과를 반환하도록 강제한다 — 어느 한쪽도 상대의 조회가 끝나기
    // 전에는 findByEmail 이후 단계(비밀번호 해싱·INSERT)로 넘어갈 수 없다.
    const originalFindByEmail = userRepository.findByEmail;
    let arrivedCount = 0;
    let releaseArrival;
    const bothArrived = new Promise((resolve) => { releaseArrival = resolve; });
    let settledCount = 0;
    let releaseSettled;
    const bothSettled = new Promise((resolve) => { releaseSettled = resolve; });
    userRepository.findByEmail = async (queriedEmail) => {
        arrivedCount += 1;
        if (arrivedCount >= 2) releaseArrival();
        await bothArrived;

        const result = await originalFindByEmail(queriedEmail);
        settledCount += 1;
        if (settledCount >= 2) releaseSettled();
        await bothSettled;

        return result;
    };
    t.after(() => { userRepository.findByEmail = originalFindByEmail; });

    const email = 'concurrent-signup@example.com';
    const attempts = await Promise.allSettled([
        authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: '동시가입1' }),
        authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: '동시가입2' }),
    ]);

    assert.equal(arrivedCount, 2, '두 요청 모두 findByEmail 사전 조회에 도달해야 경합 조건이 성립한다');
    assert.equal(settledCount, 2, '두 요청 모두 실제 조회 응답("중복 없음")을 받은 뒤에야 다음 단계로 넘어가야 한다');

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');

    assert.equal(fulfilled.length, 1, '정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1, '나머지 하나는 실패해야 한다');
    assert.equal(rejected[0].reason.status, 409, '실패 원인은 409 유일 제약 충돌이어야 한다');

    const [rows] = await sequelize.query('SELECT COUNT(*) AS cnt FROM users WHERE email = :email', {
        replacements: { email },
    });
    assert.equal(Number(rows[0].cnt), 1, 'users 테이블에는 정확히 한 행만 남아야 한다');
});

// ── AC-06 ───────────────────────────────────────────────────────────────────

test('AC-06: role/status/email_verified를 실어 보내도 저장되지 않고, 가입 후 재로그인이 성공한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const email = 'ac06-signup@example.com';
    const created = await authService.signup({
        ...VALID_SIGNUP_BASE,
        email,
        nickname: 'AC06유저',
        role: 'ADMIN',
        status: 'BANNED',
        email_verified: true,
    });

    const [rows] = await sequelize.query(
        'SELECT role, status, email_verified FROM users WHERE uuid = :uuid',
        { replacements: { uuid: created.uuid } },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'USER', '관리 필드로 보낸 role이 아니라 기본값이어야 한다');
    assert.equal(rows[0].status, 'ACTIVE', '관리 필드로 보낸 status가 아니라 기본값이어야 한다');
    assert.equal(Number(rows[0].email_verified), 0, '관리 필드로 보낸 email_verified가 아니라 기본값(false)이어야 한다');

    const { user, token } = await authService.login(
        { email, password: VALID_SIGNUP_BASE.password },
        { ip: '127.0.0.1', userAgent: 'test-agent', deviceType: 'desktop' },
    );
    assert.equal(user.uuid, created.uuid);
    assert.ok(token, '재로그인은 토큰을 발급해야 한다');
});

// F-02는 신규 가입 닉네임을 2~8자로 제한하지만, 이 제한 이전에 만들어진 계정의 경기 기록은
// 30자를 넘는 nickname_snapshot(F-01이 0002-expand-nickname-snapshot.js로 50자까지 확장)을
// 그대로 담고 있을 수 있다. F-02가 손댄 저장 경로(가입) 위에서 이 확장이 여전히 유효한지,
// 즉 긴 nickname_snapshot이 실제 경기 기록 저장 경로에서 잘리지 않는지 이 슬라이스 자신의
// 증거로도 남긴다(F-01의 별도 스위트를 인용하는 것과 별개로).
test('AC-06: 30자를 넘는 nickname_snapshot도 경기 기록 저장 경로에서 잘리지 않는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const email = 'ac06-longsnapshot@example.com';
    const created = await authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: 'AC06스냅샷' });

    const longNicknameSnapshot = '가'.repeat(45); // 30자 초과, F-01이 확장한 50자 이내
    const gameId = '55555555-5555-5555-5555-555555555555';

    // 이전 회차는 db.GameResult.create/db.GameResultPlayer.create를 직접 호출해 실제 경기
    // 기록이 저장되는 경로(gameResult.repositories.persistGameResult, 소켓 계층이 경기 종료
    // 시 실제로 부르는 함수)를 우회했다 — f01-migrations.integration.test.js의 AC-04와 같은
    // 원칙으로, 여기서도 실제 저장소 함수를 그대로 태운다(재검토 지적).
    const session = {
        id: gameId,
        roomId: null,
        startedAt: 1_000,
        endedAt: 2_000,
        dayIndex: 1,
        players: new Map([[created.uuid, {
            uuid: created.uuid, nickname: longNicknameSnapshot, role: 'CITIZEN', team: 'CITIZEN', alive: true, deathReason: null,
        }]]),
        winResult: { winner: 'CITIZEN' },
    };

    const outcome = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.deepEqual(outcome, { persisted: true, gameId });

    const [rows] = await sequelize.query(
        'SELECT nickname_snapshot FROM game_result_players WHERE game_id = :gameId AND user_id = :userId',
        { replacements: { gameId, userId: created.uuid } },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nickname_snapshot, longNicknameSnapshot, '45자 nickname_snapshot이 잘리지 않고 그대로 저장·복원되어야 한다');
});

// ── AC-03 ───────────────────────────────────────────────────────────────────

// validateBirthDate/parseIsoDateUtc의 단위 테스트는 파싱 로직 자체가 시간대에 무관함을
// 증명하지만, 실제 저장소 왕복(가입 → DB 저장 → 조회 복원)까지 같은 결론이 나오는지는
// 별도로 확인해야 한다. mysql2 드라이버는 DATETIME 컬럼을 읽을 때 Node 프로세스의 로컬
// 시간대(process.env.TZ)를 사용해 Date 객체를 만들므로, 서버가 UTC가 아닌 시간대에서
// 돌아가도 하루가 밀리지 않는지를 실제로 TZ를 바꿔가며 확인한다.
test('AC-03: birth_date는 서버 시간대와 무관하게 저장·복원된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const originalTz = process.env.TZ;
    t.after(() => {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
    });

    const email = 'ac03-birthdate@example.com';
    const created = await authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: 'AC03생일', birthDate: '2000-06-15' });

    // UTC 기준으로 자정을 넘어 날짜가 바뀌는 방향(양쪽)의 시간대에서 모두 확인한다.
    const timezones = ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles'];
    for (const tz of timezones) {
        process.env.TZ = tz;
        const restored = await userRepository.findByUuid(created.uuid);
        assert.ok(restored.birth_date instanceof Date, `TZ=${tz}에서도 birth_date는 Date 인스턴스여야 한다`);
        assert.equal(
            restored.birth_date.toISOString().slice(0, 10),
            '2000-06-15',
            `TZ=${tz}에서 저장한 생년월일이 하루 밀려 복원되면 안 된다`,
        );
    }
});
