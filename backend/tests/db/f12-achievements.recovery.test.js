'use strict';

// F-12 명시적 백필·복구(A-07) — 실제 격리 MySQL DB에서 achievementRecoveryService.
// evaluateAllUsers(backfill-achievements.js가 호출하는 것과 같은 함수)가 새 게임/투표/
// 페이지 방문 없이 과거 지급 누락을 재처리하고, 재실행해도 중복 지급하지 않는지 검증한다.
// achievementService.test.js/achievementRecoveryService.test.js는 fake db로 로직만
// 검증하므로, 이 파일이 실제 achievement_grants 유일 제약 위에서의 동작 근거를 보완한다.
//
// backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인 원칙을 따른다.
// F01_TEST_DATABASE_URL이 없으면 각 테스트는 실패로 표시하지 않고 명시적으로 skip한다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, migrationRunner,
});

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
    if (connectionError) throw connectionError;
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

const db = require('../../models');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const achievementRecoveryService = require('../../services/achievementRecoveryService');
const economyService = require('../../service/economy.service');
const achievementDefinitions = require('../../services/achievementDefinitions');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    // CODEX-3 재검토(AC-05): 기존 `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8)는
    // label.length가 8 이상이면(예: "filler119") `8 - label.length`가 음수가 되고,
    // String.prototype.slice(0, 음수)는 "끝에서부터 자르기"로 동작한다 — 그 결과가 다시
    // slice(0, 8)로 잘리면서 사실상 label의 앞 8자만 남아 uuid가 전혀 반영되지 않았다.
    // 그래서 filler11(8자)과 filler119(9자, 앞 8자가 "filler11"로 같음)가 같은 닉네임으로
    // 충돌해 실제 MySQL UNIQUE 위반으로 재현됐다. label 길이와 무관하게 uuid에서 뽑은 6자로
    // 유일성을 보장하고, label은 앞 2자만 가독성용으로 남긴다(승인된 닉네임 상한 2~8자 안,
    // 항상 8자 고정이라 길이별 분기가 필요 없다).
    const nickname = `${label.slice(0, 2)}${uuid.replace(/-/g, "").slice(0, 6)}`;
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    return uuid;
};

const makePlayer = (uuid, role, alive) => [uuid, {
    uuid, nickname: `nick-${uuid.slice(0, 6)}`, role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
    alive, deathReason: null,
}];

const makeEndedSession = (id, playersMap, { winner = 'CITIZEN' } = {}) => ({
    id,
    roomId: crypto.randomUUID(),
    phase: 'ENDED',
    dayIndex: 2,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: Math.max(playersMap.size - 1, 0) },
    timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    winResult: { winner },
    gameSource: 'production',
    players: playersMap,
});

const persistWins = async (userId, role, count) => {
    for (let i = 0; i < count; i += 1) {
        const gameId = crypto.randomUUID();
        const session = makeEndedSession(gameId, new Map([makePlayer(userId, role, true)]), { winner: role === 'JOKER' ? 'JOKER' : 'CITIZEN' });
        const result = await gameResultRepository.persistGameResult(session, { completed: true });
        assert.equal(result.persisted, true);
    }
};

const getWalletRow = (userId) => db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId }, raw: true });

test('A-07: 새 게임/페이지 방문 없이도 백필이 과거에 쌓인 확정 경기를 소급 지급한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('backfill1');
    // achievementService를 한 번도 거치지 않고(트리거 없이) 과거 경기 3판만 저장한다 —
    // "배포 전부터 이미 쌓여 있던 기록"을 흉내낸다.
    await persistWins(userId, 'CITIZEN', 3);

    const before = await db.AchievementGrant.count({ where: { user_id: userId } });
    assert.equal(before, 0, '백필 전에는 어떤 업적도 지급돼 있지 않아야 한다');

    const summary = await achievementRecoveryService.evaluateAllUsers();

    const grantedForUser = summary.grants.find((g) => g.userId === userId);
    assert.ok(grantedForUser?.achievementIds.includes('record-1-masquerade'), '게임 3회 완료 기록이 백필로 지급돼야 한다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 50);
    assert.equal(wallet.balance_diamond, 50);
});

test('A-07: 백필을 여러 번 재실행해도 이미 지급된 업적은 다시 지급되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('backfill2');
    await persistWins(userId, 'CITIZEN', 3);

    await achievementRecoveryService.evaluateAllUsers();
    const afterFirst = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } });
    assert.equal(afterFirst, 1);

    await achievementRecoveryService.evaluateAllUsers();
    await achievementRecoveryService.evaluateAllUsers();

    const afterRepeat = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } });
    assert.equal(afterRepeat, 1, '재실행이 같은 업적을 중복 지급하면 안 된다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 50, '재실행이 재화를 중복 지급하면 안 된다');
});

test('A-07: 여러 계정을 한 번에 백필해도 각 계정은 자신의 진행률만큼만 지급받는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const veteran = await createLocalUser('veteran');
    const rookie = await createLocalUser('rookie');
    await persistWins(veteran, 'CITIZEN', 30);
    await persistWins(rookie, 'CITIZEN', 1);

    const summary = await achievementRecoveryService.evaluateAllUsers();

    const veteranGrants = summary.grants.find((g) => g.userId === veteran)?.achievementIds ?? [];
    assert.ok(veteranGrants.includes('noble-win-30'), '30승 계정은 noble-win-30까지 지급받아야 한다');
    assert.ok(veteranGrants.includes('record-7-erased-night'), '30승 계정은 기록 7도 함께 지급받아야 한다');

    const rookieGrantCount = await db.AchievementGrant.count({ where: { user_id: rookie } });
    assert.equal(rookieGrantCount, 0, '1승뿐인 계정은 아무 업적도 지급받으면 안 된다');
});

const getLedgerEntry = async (userId, referenceEventId) =>
    db.EconomyLedgerEntry.findOne({ where: { user_id: userId, reference_event_id: referenceEventId }, raw: true });

// ── CODEX-2 재검토(AC-03/AC-05): 실제 "부분 지급 후" 롤백 ──────────────────────────────
//
// CODEX-1 회차의 시험은 economyService.grantAchievementCurrency 전체를 항상 던지도록
// 바꿔치기했다 — record-1-masquerade의 보상은 [GOLD 50, DIAMOND 50] 순서라, 이 방식은
// 첫 번째(GOLD) 호출에서부터 실패해 실제로는 "아직 아무 재화도 쓰지 않은" 상태에서의 실패만
// 증명했다(트랜잭션 롤백 자체는 항상 성립하는 자명한 경우). 실제 지적은 "이미 성공적으로
// 쓰인 재화 변경분까지 함께 롤백되는지"였다 — 이번에는 GOLD 호출은 실제 구현(원래 함수)
// 그대로 통과시켜 지갑에 실제로 반영되게 하고, 바로 다음 DIAMOND 호출에서만 실패시킨다.
// 그래야 "이미 커밋되지 않았을 뿐 이미 적용된" 지갑 변경(같은 트랜잭션 안의 GOLD 갱신)이
// DIAMOND 실패로 인한 트랜잭션 롤백과 함께 실제로 되돌아가는지를 증명할 수 있다.
test('AC-03/AC-05: 이미 성공한 재화 지급(GOLD) 이후 실패(DIAMOND)해도 achievement_grants·이미 쓰인 원장·잔액이 함께 롤백되고, 원인이 사라진 뒤 재실행하면 정상 복구된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('interrupt2');
    // record-1-masquerade(게임 3회 완료)만 달성 가능하게 한다 — survivals(5)·wins(10) 문턱은
    // 넘지 않으므로 이 계정에는 그 업적 하나만 걸린다.
    await persistWins(userId, 'CITIZEN', 3);

    const originalGrantAchievementCurrency = economyService.grantAchievementCurrency;
    let goldCallCount = 0;
    economyService.grantAchievementCurrency = async (params, ...rest) => {
        if (params.currency === 'DIAMOND') {
            throw new Error('simulated interruption during grant (after GOLD already written)');
        }
        goldCallCount += 1;
        // GOLD는 실제 함수를 그대로 호출한다 — 실제로 지갑·원장에 반영된 뒤 DIAMOND에서
        // 실패해야, 그 반영분이 함께 롤백되는지를 검증할 수 있다.
        return originalGrantAchievementCurrency(params, ...rest);
    };

    let interrupted;
    try {
        interrupted = await achievementRecoveryService.evaluateAllUsers();
    } finally {
        economyService.grantAchievementCurrency = originalGrantAchievementCurrency;
    }

    assert.equal(goldCallCount, 1, 'GOLD 호출 자체는 실제로 한 번 일어나야 한다(그래야 롤백 대상이 실제로 생긴다)');
    assert.equal(interrupted.errors.length, 1, '지급 실패는 evaluateAllUsers 요약의 errors로 드러나야 한다');
    assert.equal(interrupted.errors[0].userId, userId);

    const grantCountAfterFailure = await db.AchievementGrant.count({ where: { user_id: userId } });
    assert.equal(grantCountAfterFailure, 0, '보상 지급이 실패하면 achievement_grants도 함께 롤백되어야 한다(부분 지급 금지)');

    // 핵심 검증: GOLD 호출이 실제로 지갑을 갱신했더라도(같은 트랜잭션 안), DIAMOND 실패로
    // 트랜잭션 전체가 롤백되면 그 GOLD 변경분도 커밋되지 않은 채 사라져야 한다 — 원장에도
    // 남아있으면 안 된다.
    const goldLedgerAfterFailure = await getLedgerEntry(userId, 'achievement:record-1-masquerade:GOLD');
    assert.equal(goldLedgerAfterFailure, null, '실패 전에 실제로 쓰인 GOLD 원장 항목도 함께 롤백되어야 한다(부분 지급 흔적 금지)');
    const walletAfterFailure = await getWalletRow(userId);
    assert.equal(walletAfterFailure?.balance_gold ?? 0, 0, '이미 적용됐던 GOLD 잔액 변경도 롤백되어 0으로 남아야 한다');
    assert.equal(walletAfterFailure?.balance_diamond ?? 0, 0);

    // 복구: 원인(고장 낸 함수)이 사라진 뒤 다시 실행하면 처음부터 다시 시도해 정상 지급된다.
    const recovered = await achievementRecoveryService.evaluateAllUsers();
    assert.deepEqual(recovered.errors, []);
    const grantedForUser = recovered.grants.find((g) => g.userId === userId)?.achievementIds ?? [];
    assert.ok(grantedForUser.includes('record-1-masquerade'), '복구 실행에서 정상 지급되어야 한다');

    const grantCountAfterRecovery = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } });
    assert.equal(grantCountAfterRecovery, 1, '실패했던 시도의 흔적이 남아 중복 지급되면 안 된다');

    const walletAfterRecovery = await getWalletRow(userId);
    assert.equal(walletAfterRecovery.balance_gold, 50);
    assert.equal(walletAfterRecovery.balance_diamond, 50);
});

// ── CODEX-2 재검토(AC-05): 실제 CLI 프로세스 중단 ───────────────────────────────────────
//
// 위 시험들은 achievementRecoveryService.evaluateAllUsers()를 이 테스트 프로세스 안에서
// 직접 호출하고, 함수를 몽키패치해 예외를 주입한다 — "실제 CLI(backend/scripts/
// backfill-achievements.js)를 별도 프로세스로 실행하고 중간에 강제 종료(SIGKILL)해도
// 안전한지"는 검증하지 않는다는 지적이 정확했다. 이번 시험은 실제 스크립트를 자식
// 프로세스로 fork()해 실행한 뒤 SIGKILL로 강제 종료하고, DB에 남은 상태가 "부분 지급"이
// 아닌지(각 achievement_grants 행은 항상 그 업적의 보상 전부를 실제로 갖고 있는지)를
// 확인한다 — 이 불변식은 SIGKILL이 정확히 언제 도달했든 항상 성립해야 한다(각 업적의
// 지급은 achievementService.grantAchievement 안에서 독립된 트랜잭션이므로, 프로세스가
// 죽으면 그 순간 열려 있던 트랜잭션은 커밋되지 못한 채 MySQL이 자동으로 되돌린다). 그
// 뒤 같은 스크립트를 다시(중단 없이) 실행해 완전히 복구되는지 확인한다.

const getEntitlement = async (userId, itemId) =>
    db.sequelize.models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId }, raw: true });

const BACKFILL_SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'backfill-achievements.js');

/** backfill-achievements.js를 자식 프로세스로 실행한다. { exitCode, signal }을
 *  반환한다 — signal이 'SIGKILL'이면 실제로 강제 종료됐다는 뜻이고, null이면 스스로
 *  끝났다는 뜻이다. */
const runBackfillProcess = () => new Promise((resolve, reject) => {
    const child = fork(BACKFILL_SCRIPT_PATH, [], {
        env: { ...process.env, DATABASE_URL: TEST_DB_URL },
        stdio: 'ignore',
    });
    child.on('error', (error) => reject(error));
    child.on('exit', (code, signal) => resolve({ exitCode: code, signal }));
});

/** backfill-achievements.js를 자식 프로세스로 실행하고, userId에 대한 achievement_grants
 *  행이 처음 커밋되는 순간을 폴링으로 관찰해 그 즉시 SIGKILL한다.
 *
 *  CODEX-3 재검토(AC-05): 이전 버전은 고정 150ms 뒤에 무조건 SIGKILL을 보냈다 — 그 150ms
 *  동안 실제로 userId의 지급 트랜잭션에 도달했는지 전혀 확인하지 않아서, 만약 전체 처리가
 *  150ms 안에 이미 다 끝났다면(또는 반대로 그 계정에 전혀 도달하지 못했다면) "중단 복구"
 *  시나리오를 실제로는 한 번도 실행하지 않고도 통과했을 것이다. db.User.findAll()은
 *  정렬 없이 반환되고 uuid(랜덤)를 기본키로 쓰는 InnoDB는 클러스터 인덱스 순서가 생성
 *  순서와 무관하므로, userId가 전체 순회 중 몇 번째에 처리될지는 미리 알 수 없다 — 그래서
 *  타이밍을 추측하는 대신 실제 DB 상태 변화(첫 grant 커밋)에 반응한다. maxWaitMs 안에도
 *  전혀 진행이 없으면 안전장치로 그냥 종료시킨다(그 경우 호출부가 이후 단언에서 실패로
 *  드러낸다 — 조용히 통과시키지 않는다). */
const runBackfillProcessKillOnFirstGrant = (userId, { pollIntervalMs = 5, maxWaitMs = 20000 } = {}) => new Promise((resolve, reject) => {
    const child = fork(BACKFILL_SCRIPT_PATH, [], {
        env: { ...process.env, DATABASE_URL: TEST_DB_URL },
        stdio: 'ignore',
    });
    const startedAt = Date.now();
    let settled = false;
    const poller = setInterval(() => {
        if (settled) return;
        db.AchievementGrant.count({ where: { user_id: userId } })
            .then((count) => {
                if (settled) return;
                if (count >= 1 || Date.now() - startedAt > maxWaitMs) {
                    settled = true;
                    clearInterval(poller);
                    child.kill('SIGKILL');
                }
            })
            .catch(() => {}); // 폴링 쿼리 하나가 실패해도 다음 tick에서 다시 시도한다.
    }, pollIntervalMs);
    child.on('error', (error) => {
        settled = true;
        clearInterval(poller);
        reject(error);
    });
    child.on('exit', (code, signal) => {
        settled = true;
        clearInterval(poller);
        resolve({ exitCode: code, signal });
    });
});

/** achievement_grants에 남아있는 각 행이 자신의 업적 정의가 요구하는 보상 전부(원장
 *  항목·아이템 소유권)를 실제로 갖고 있는지 확인한다. 하나라도 빠졌으면 그 achievement_id를
 *  담아 돌려준다 — 빈 배열이면 "부분 지급된 업적이 없다"는 뜻이다. */
const findPartiallyGrantedAchievements = async (userId) => {
    const grants = await db.AchievementGrant.findAll({ where: { user_id: userId }, attributes: ['achievement_id'], raw: true });
    const partial = [];
    for (const { achievement_id: achievementId } of grants) {
        const definition = achievementDefinitions.getAchievementDefinition(achievementId);
        for (const reward of definition.rewards) {
            if (reward.type === 'CURRENCY') {
                // eslint-disable-next-line no-await-in-loop
                const entry = await getLedgerEntry(userId, `achievement:${achievementId}:${reward.currency}`);
                if (!entry || entry.amount !== reward.amount) partial.push(achievementId);
            } else if (reward.type === 'ITEM') {
                // eslint-disable-next-line no-await-in-loop
                const entitlement = await getEntitlement(userId, reward.itemId);
                if (!entitlement) partial.push(achievementId);
            }
        }
    }
    return [...new Set(partial)];
};

test('AC-05: 실제 CLI(backfill-achievements.js) 프로세스를 지급 도중 SIGKILL로 강제 종료해도 부분 지급된 업적이 남지 않고, 다시 실행하면 완전히 복구된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    // CLI가 전체 계정을 순회하는 데 실제로 시간이 걸리게(=SIGKILL이 heavyUserId의 9개
    // 지급이 전부 끝나기 전에 도착할 여지를 늘리게) 여분 계정을 여러 개 만든다. uuid(랜덤)를
    // 기본키로 쓰는 InnoDB의 클러스터 인덱스 순서는 생성 순서와 무관하므로, heavyUserId가
    // 전체 순회 중 몇 번째에 처리될지는 이 순서로 제어할 수 없다 — 그래서 아래
    // runBackfillProcessKillOnFirstGrant가 순서를 추측하지 않고 실제 진행을 관찰한다.
    const fillerCount = 120;
    for (let i = 0; i < fillerCount; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await createLocalUser(`filler${i}`);
    }
    const heavyUserId = await createLocalUser('heavy1');
    // 30승: record-1/3/4/5/6/7 + noble-win-10/20/30, 총 9개 업적이 한 번에 걸린다 —
    // 각각 독립된 트랜잭션으로 순서대로 지급되므로 중단 시점에 "일부만 커밋된" 상태가
    // 생길 여지가 가장 큰 계정이다.
    await persistWins(heavyUserId, 'CITIZEN', 30);

    // CODEX-3 재검토(AC-05): 고정 시간을 기다리는 대신, heavyUserId의 achievement_grants
    // 행이 처음 커밋되는 순간을 폴링으로 관찰해 그 즉시 SIGKILL한다 — 지급 트랜잭션 진행
    // 도중에 실제로 도달했는지를 시간 추측이 아니라 관찰로 보장한다.
    const { signal } = await runBackfillProcessKillOnFirstGrant(heavyUserId);
    t.diagnostic(`backfill 자식 프로세스 종료 신호: ${signal ?? '(정상 종료 — 아래 grants 개수 단언이 실제 중단 여부를 확인한다)'}`);

    // 실제로 지급 도중에 죽었는지 관찰값으로 직접 증명한다: 9개 중 최소 1개는 커밋됐지만
    // 9개 전부가 끝나기 전에 죽어야 한다. 0이면 첫 grant 전에(=아무 진행도 없이) 죽은
    // 것이고, 9면 이미 다 끝난 뒤에 죽은 것이다 — 둘 다 "중단 복구" 시나리오를 실제로
    // 검증하지 못했다는 뜻이므로 테스트가 그대로 드러내야 한다(조용히 통과시키지 않는다).
    const grantCountAfterKill = await db.AchievementGrant.count({ where: { user_id: heavyUserId } });
    assert.ok(
        grantCountAfterKill >= 1 && grantCountAfterKill < 9,
        `SIGKILL이 실제로 지급 도중에 도달해야 한다 — 관찰된 grants=${grantCountAfterKill}(기대 범위 1~8)`,
    );

    // 불변식(SIGKILL이 정확히 몇 번째 지급 도중 도달했든 항상 성립해야 한다): 이 시점까지
    // 커밋된 achievement_grants 행은 전부 완전한 보상을 실제로 갖고 있어야 한다 — "행은
    // 있는데 원장/소유권 일부가 없는" 상태가 있으면 안 된다.
    const partialAfterKill = await findPartiallyGrantedAchievements(heavyUserId);
    assert.deepEqual(partialAfterKill, [], '중단 시점과 무관하게 부분 지급된 업적이 있으면 안 된다');

    // 복구: 중단 없이 다시 실행해 끝까지 완료한다.
    const recovery = await runBackfillProcess();
    assert.equal(recovery.signal, null, '복구 실행은 중단 없이 정상 종료되어야 한다');

    const grantRows = await db.AchievementGrant.findAll({ where: { user_id: heavyUserId }, attributes: ['achievement_id'], raw: true });
    const grantIds = grantRows.map((g) => g.achievement_id);
    assert.equal(new Set(grantIds).size, grantIds.length, '중복 지급된 업적이 없어야 한다');
    assert.deepEqual(
        [...grantIds].sort(),
        ['noble-win-10', 'noble-win-20', 'noble-win-30', 'record-1-masquerade', 'record-3-first-morning', 'record-4-testimonies', 'record-5-clown-story', 'record-6-dead-mans-leaving', 'record-7-erased-night'].sort(),
        '중단·복구를 거쳐도 30승 계정이 받아야 할 9개 업적이 정확히 전부 지급되어야 한다',
    );

    const wallet = await getWalletRow(heavyUserId);
    assert.equal(wallet.balance_gold, 330, '기록 6개(50G×6=300)+noble-10(10)+noble-20(20)=330');
    assert.equal(wallet.balance_diamond, 340, '기록 6개(50D×6=300)+noble-10(10)+noble-20(30)=340');

    const borderEntitlement = await getEntitlement(heavyUserId, 'profile-border-귀족');
    assert.ok(borderEntitlement, '30승 테두리 소유권이 복구 후 실제로 있어야 한다');

    const partialAfterRecovery = await findPartiallyGrantedAchievements(heavyUserId);
    assert.deepEqual(partialAfterRecovery, [], '복구 후에도 부분 지급된 업적이 없어야 한다');
});
