'use strict';

// 관리자 전 읽기 경로 조회 부담 시험 (AD-302), 라우터에서 읽은 읽기 경로를 다 부르며 SQL을 엿봄
// 확인: 조회마다 시간 제한 글귀·조회 줄 안에서 돎, 커서 목록은 한 번에 50줄 넘게 안 읽고 51줄 요청은 400
// npm run test:with-db -- tests/admin/allRoutes.paging.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');
const { listAdminRoutes, fillPath } = require('./helpers/adminRoutes');
const money = require('./helpers/money');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const db = () => require('../../models');
const queryQueue = require('../../admin/services/core/queryQueue');

const PAGE_MAX = 50;
// 세션 확인 조회는 관리자 요청 앞단(로그인 확인)이라 셈에서 뺌
const isSessionCheck = (sql) => /`?admin_sessions`?/i.test(sql);

// 경로마다 꼭 필요한 주소 칸 (없으면 400이라 SQL까지 못 감)
const KST_TODAY = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const QUERY = {
    'GET /admin-api/members': 'q=au',
    'GET /admin-api/stats': `from=${KST_TODAY}&to=${KST_TODAY}`,
};

// 경로 칸에 넣을 진짜 줄 (상세 경로가 404 앞에서 끝나지 않게)
const seed = async (agent) => {
    const member = await money.createMember('au');
    const order = await money.createGrantedOrder(member.uuid);
    const report = await db().Report.create({
        reporter_id: member.uuid, target_id: (await money.createMember('pt')).uuid, game_id: crypto.randomUUID(), reason_code: 'ABUSE', memo: '욕함',
    });
    const coupon = await agent.post('/admin-api/coupons', { code: `pg-${crypto.randomBytes(3).toString('hex')}`, rewardType: 'GOLD', rewardAmount: 1 });
    const now = new Date();
    const inquiry = await db().Inquiry.create({ user_id: member.uuid, category: 'BUG', title: '제목', body: '본문', status: 'OPEN', created_at: now, updated_at: now });
    return {
        uuid: member.uuid,
        orderId: order.order_id,
        gameId: crypto.randomUUID(),
        '/reports:id': report.id,
        '/coupons:id': coupon.body.coupon.id,
        '/inquiries:id': inquiry.id,
    };
};

// SQL 엿보기: 조회 줄 안에서 돌았는지 깊이로 셈, SELECT만 모음 → { take() }
const spySql = (t) => {
    const sequelize = db().sequelize;
    const realQuery = sequelize.query;
    const realRun = queryQueue.run;
    let depth = 0;
    let seen = [];
    t.mock.method(queryQueue, 'run', (fn) => realRun(async () => {
        depth += 1;
        try { return await fn(); } finally { depth -= 1; }
    }));
    t.mock.method(sequelize, 'query', function spiedQuery(sql, options, ...rest) {
        const text = typeof sql === 'string' ? sql : String(sql?.query ?? '');
        if (/^\s*SELECT\b/i.test(text)) seen.push({ sql: text, replacements: options?.replacements ?? {}, queued: depth > 0 });
        return realQuery.call(sequelize, sql, options, ...rest);
    });
    return { take: () => { const out = seen; seen = []; return out; } };
};

// SQL 속 LIMIT 값 (숫자 또는 :이름 → 넘긴 값), 없으면 null
// 예) 'ORDER BY id DESC LIMIT :limit' + { limit: 51 } → 51
const limitOf = ({ sql, replacements }) => {
    const found = /\bLIMIT\s+(\d+|:(\w+))/i.exec(sql);
    if (!found) return null;
    return Number(found[2] ? replacements[found[2]] : found[1]);
};

const withQuery = (path, query) => (query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path);

// 읽기 경로 하나 → { problems(걸린 까닭, 빈 배열이면 통과), isList(커서 목록인지) }
const checkRoute = async (agent, spy, route, values) => {
    const problems = [];
    const path = withQuery(fillPath(route, values), QUERY[route.key]);
    spy.take();
    const res = await agent.get(path);
    const selects = spy.take().filter((query) => !isSessionCheck(query.sql));
    if (![200, 404].includes(res.status)) return { problems: [`${route.key} → ${res.status} ${res.body?.code}`], isList: false };
    for (const query of selects) {
        const head = query.sql.replace(/\s+/g, ' ').slice(0, 70);
        if (!/MAX_EXECUTION_TIME\(\d+\)/.test(query.sql)) problems.push(`${route.key} 시간 제한 없음: ${head}`);
        if (!query.queued) problems.push(`${route.key} 조회 줄 밖: ${head}`);
    }
    const isList = res.status === 200 && Object.hasOwn(res.body ?? {}, 'nextBefore');
    if (isList) {
        const limits = selects.map(limitOf).filter((value) => value !== null);
        if (limits.length === 0 || limits.some((value) => value > PAGE_MAX + 1)) problems.push(`${route.key} LIMIT ${limits.join(',') || '없음'}`);
        const over = await agent.get(withQuery(path, `limit=${PAGE_MAX + 1}`));
        if (over.status !== 400) problems.push(`${route.key} limit=51 → ${over.status}`);
    }
    return { problems, isList };
};

test('AD-302: 읽기 경로 전부 — 조회마다 시간 제한·조회 줄, 커서 목록은 50줄까지(51 요청 400)', async (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
        return;
    }
    const { agent } = await adminTestApp({ t });
    const values = await seed(agent);
    const spy = spySql(t);
    // 로그인 확인 /auth/me는 세션 조회뿐이라 뺌
    const reads = listAdminRoutes().filter((route) => route.method === 'GET' && !route.isAuth);
    const problems = [];
    let lists = 0;
    for (const route of reads) {
        const result = await checkRoute(agent, spy, route, values);
        problems.push(...result.problems);
        if (result.isList) lists += 1;
    }
    t.diagnostic(`읽기 경로 ${reads.length}개 · 커서 목록 ${lists}개 확인`);
    assert.ok(reads.length >= 20, `읽기 경로 ${reads.length}개`);
    // 커서 목록: 회원·이력·신고·금지어·주문·쿠폰·쿠폰 쓴 사람·지난 판·문의
    assert.ok(lists >= 9, `커서 목록 ${lists}개`);
    assert.deepEqual(problems, []);
});
