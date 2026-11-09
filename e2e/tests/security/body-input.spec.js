// 보안(입력): 본문 앞단(100kb·깨진 JSON·__proto__·깊이 32·폼 겹친 키)과 숫자·글자 범위 검사가 실제 서버에서 막히는지
// 근거: docs/보안_점검_2026-11-09.md '입력 큰 본문·깨진 JSON·프로토타입 오염', '숫자 범위·재화·수량', 'SQL 주입'
const { test, expect } = require('../../helpers/fixtures');
const { api, login, rand } = require('./_sec');

const json = (raw) => ({ raw, headers: { 'content-type': 'application/json' } });

test.describe('본문 크기·모양', () => {
    test('100kb 넘는 JSON 본문을 보내면 → 413 PAYLOAD_TOO_LARGE 코드만 (라이브러리 문구 없음)', async () => {
        const r = await api('POST', '/auth/login', json(JSON.stringify({ email: 'a@b.cd', password: 'x'.repeat(110 * 1024) })));
        expect(r.status).toBe(413);
        expect(r.json).toEqual({ ok: false, code: 'PAYLOAD_TOO_LARGE' });
        expect(r.body).not.toMatch(/entity|limit|raw-body/i);
    });

    test('로그인한 경로(닉네임 바꾸기)에도 → 100kb 넘으면 413', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('PATCH', '/user/me/nickname', { cookie, ...json(JSON.stringify({ nickname: 'a'.repeat(120 * 1024) })) });
        expect(r.status).toBe(413);
    });

    test('100kb 넘는 폼(urlencoded) 본문도 → 413', async () => {
        const r = await api('POST', '/auth/login', { raw: `email=a%40b.cd&password=${'x'.repeat(110 * 1024)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
        expect(r.status).toBe(413);
    });

    test('100kb 안(90kb) 본문은 → 크기로는 안 막히고 보통 검사(로그인 실패 401)로 감', async () => {
        const r = await api('POST', '/auth/login', json(JSON.stringify({ email: `nobody-${rand()}@example.test`, password: 'x'.repeat(90 * 1024) })));
        expect(r.status).not.toBe(413);
        expect([400, 401]).toContain(r.status);
    });

    test('모르는 글자셋(charset=koi8-r)으로 보내면 → 400·415 INVALID_INPUT 코드만 (라이브러리 문구 없음)', async () => {
        const r = await api('POST', '/auth/login', { raw: '{"email":"a"}', headers: { 'content-type': 'application/json; charset=koi8-r' } });
        expect([400, 415]).toContain(r.status);
        expect(r.body).not.toMatch(/charset|unsupported/i);
        expect(r.json).toEqual({ ok: false, code: 'INVALID_INPUT' });
    });

    test('JSON 앞에 다른 글자를 붙이면 → 400 INVALID_INPUT, 받은 글자를 되비추지 않음', async () => {
        const r = await api('POST', '/auth/login', json('ZXCV-echo-check{"email":"a"}'));
        expect(r.status).toBe(400);
        expect(r.body).not.toContain('ZXCV-echo-check');
    });
});

test.describe('프로토타입 오염 키·깊은 본문', () => {
    test('본문 맨 위에 __proto__ 키 → 400 INVALID_INPUT (서비스까지 안 감)', async () => {
        const r = await api('POST', '/auth/login', json('{"email":"a@b.cd","password":"x","__proto__":{"isAdmin":true}}'));
        expect(r.status).toBe(400);
        expect(r.json).toEqual({ ok: false, code: 'INVALID_INPUT' });
    });

    test('겹친 객체 안쪽 __proto__ 키 → 400', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('PUT', '/user/me/emoji-palette', { cookie, ...json('{"slots":[],"meta":{"a":{"__proto__":{"polluted":1}}}}') });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('INVALID_INPUT');
    });

    test('constructor·prototype 키 (배열 안 객체) → 400', async () => {
        for (const raw of ['{"list":[{"constructor":{"prototype":{"x":1}}}]}', '{"prototype":{"x":1}}']) {
            const r = await api('POST', '/auth/login', json(raw));
            expect(r.status, raw).toBe(400);
        }
    });

    test('쿼리에 __proto__ 키(?__proto__[x]=1·?constructor=1) → 400', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const q of ['__proto__=1', 'constructor=1']) {
            const r = await api('GET', `/friends/search?q=ab&${q}`, { cookie });
            expect(r.status, q).toBe(400);
        }
    });

    test('__proto__ 본문을 보낸 뒤에도 → 서버 전역 모양이 안 바뀜 (다른 계정 보통 요청이 그대로 됨)', async ({ accounts }) => {
        await api('POST', '/auth/login', json('{"__proto__":{"role":"ADMIN","uuid":"x"}}'));
        const { cookie } = await login(await accounts.create());
        const me = await api('GET', '/auth/me', { cookie });
        expect(me.status).toBe(200);
        expect(me.json.data.role).toBe('USER');
    });

    test('33단 넘게 겹친 본문 → 400 INVALID_INPUT', async () => {
        let raw = '1';
        for (let i = 0; i < 40; i += 1) raw = `{"a":${raw}}`;
        const r = await api('POST', '/auth/login', json(raw));
        expect(r.status).toBe(400);
        expect(r.json).toEqual({ ok: false, code: 'INVALID_INPUT' });
    });

    test('40단 겹친 배열 본문도 → 400', async () => {
        const raw = `${'['.repeat(40)}1${']'.repeat(40)}`;
        const r = await api('POST', '/auth/login', json(`{"email":${raw}}`));
        expect(r.status).toBe(400);
    });

    test('10단 정도로 겹친 보통 본문은 → 깊이로는 안 막힘 (로그인 검사로 400·401)', async () => {
        let raw = '"x"';
        for (let i = 0; i < 10; i += 1) raw = `{"a":${raw}}`;
        const r = await api('POST', '/auth/login', json(`{"email":"a@b.cd","password":"x","extra":${raw}}`));
        expect(r.json?.code).not.toBe('INVALID_INPUT');
    });

    test('폼 본문 겹친 키(email[$ne]=x) → 객체로 안 풀려서 로그인 400 (연산자 끼워 넣기 안 됨)', async () => {
        const r = await api('POST', '/auth/login', { raw: 'email[$ne]=x&password[$ne]=y', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
        expect(r.status).toBe(400);
    });

    test('JSON으로 이메일·비번을 객체({"$ne":null})로 보내면 → 400 (DB 조회 안 하고 거절)', async () => {
        const r = await api('POST', '/auth/login', { body: { email: { $ne: null }, password: { $gt: '' } } });
        expect(r.status).toBe(400);
    });

    test('이메일·비번을 배열로 보내면 → 400', async () => {
        const r = await api('POST', '/auth/login', { body: { email: ['a@b.cd'], password: ['x'] } });
        expect(r.status).toBe(400);
    });
});

test.describe('SQL 모양 글자', () => {
    test("로그인 이메일에 ' OR 1=1 -- 를 넣으면 → 다른 계정으로 로그인 안 되고 같은 실패 문구", async ({ accounts }) => {
        await accounts.create();
        const r = await api('POST', '/auth/login', { body: { email: "' OR 1=1 -- ", password: "' OR '1'='1" } });
        expect(r.status).toBe(401);
        expect(r.json.message).toBe('이메일 또는 비밀번호가 일치하지 않습니다.');
        expect(r.setCookies.some((l) => /^accessToken=[^;]+/.test(l))).toBe(false);
    });

    test("친구 검색에 ' OR '1'='1 → 오류 없이 빈 목록 (모든 사람이 안 나옴)", async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/friends/search?q=${encodeURIComponent("' OR '1'='1")}`, { cookie });
        expect(r.status).toBeLessThan(500);
        expect(r.json?.data ?? []).toEqual([]);
    });

    test('친구 검색에 % · _ 같은 LIKE 글자 → 모든 사람이 걸리지 않음 (이스케이프됨)', async ({ accounts }) => {
        await accounts.createMany(2);
        const { cookie } = await login(await accounts.create());
        for (const q of ['%', '%%', '_', '__']) {
            const r = await api('GET', `/friends/search?q=${encodeURIComponent(q)}`, { cookie });
            expect(r.status, q).toBeLessThan(500);
            expect(r.json?.data ?? [], q).toEqual([]);
        }
    });

    test('판 결과 id에 SQL 모양 글자 → 500 아니고 404', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/game/${encodeURIComponent("1' OR '1'='1")}`, { cookie });
        expect(r.status).toBe(404);
    });
});

test.describe('숫자·글자 범위 (재화·수량·메모)', () => {
    test('골드 구매 version에 음수·0·소수·글자·아주 큰 수 → 전부 400 INVALID_GOLD_PURCHASE_REQUEST, 잔액 그대로', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        for (const version of [-1, 0, 1.5, '1', 2 ** 60, null]) {
            const r = await api('POST', '/economy/gold-purchases', { cookie, body: { productId: 'test-gold-50', version, referenceEventId: `r-${rand()}` } });
            expect(r.status, String(version)).toBe(400);
            expect(r.json?.code).toBe('INVALID_GOLD_PURCHASE_REQUEST');
        }
        const w = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(w.json).toEqual({ balanceGold: 0, balanceDiamond: 0 });
    });

    test('다이아 없이 골드 구매 → 400 INSUFFICIENT_DIAMOND, 다이아가 음수로 안 감', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/economy/gold-purchases', { cookie, body: { productId: 'test-gold-50', version: 1, referenceEventId: `r-${rand()}` } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('INSUFFICIENT_DIAMOND');
        const w = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(w.json.balanceDiamond).toBe(0);
    });

    test('골드 구매 본문에 금액·받을 양 칸(payAmount·grantAmount)을 끼워 넣으면 → 무시하고 서버 상품 값으로만 계산 (다이아 0이면 거절, 골드 안 들어옴)', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/economy/gold-purchases', { cookie, body: { productId: 'test-gold-50', version: 1, referenceEventId: `r-${rand()}`, payAmount: 0, grantAmount: 999999 } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('INSUFFICIENT_DIAMOND');
        const w = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(w.json.balanceGold).toBe(0);
    });

    test('골드 구매 본문에 모르는 칸(userId·currency) → 400 UNKNOWN_GOLD_PURCHASE_FIELD', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const extra of [{ userId: '00000000-0000-0000-0000-000000000000' }, { currency: 'GOLD' }]) {
            const r = await api('POST', '/economy/gold-purchases', { cookie, body: { productId: 'test-gold-50', version: 1, referenceEventId: `r-${rand()}`, ...extra } });
            expect(r.status).toBe(400);
            expect(r.json?.code).toBe('UNKNOWN_GOLD_PURCHASE_FIELD');
        }
    });

    test('충전 주문에 amount·userId 칸을 끼워 넣으면 → 400 UNKNOWN_TOPUP_ORDER_FIELD', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const extra of [{ amount: 1 }, { userId: '00000000-0000-0000-0000-000000000000' }]) {
            const r = await api('POST', '/economy/topup/orders', { cookie, body: { productId: 'test-diamond-10', version: 1, ...extra } });
            expect(r.status).toBe(400);
            expect(r.json?.code).toBe('UNKNOWN_TOPUP_ORDER_FIELD');
        }
    });

    test('충전 주문 version에 음수·0·글자 → 400 INVALID_TOPUP_ORDER_REQUEST', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const version of [-3, 0, 'x']) {
            const r = await api('POST', '/economy/topup/orders', { cookie, body: { productId: 'test-diamond-10', version } });
            expect(r.status).toBe(400);
            expect(r.json?.code).toBe('INVALID_TOPUP_ORDER_REQUEST');
        }
    });

    test('아이템 구매에 금액(price) 칸 끼워 넣기 → 400 UNKNOWN_PURCHASE_FIELD', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/economy/purchase', { cookie, body: { itemId: 'x', referenceEventId: `r-${rand()}`, price: 0 } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('UNKNOWN_PURCHASE_FIELD');
    });

    test('구매 참조 id가 120자 넘거나 빈 글자 → 400 (저장 실패 500 아님)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const ref of ['x'.repeat(121), '', 7]) {
            const r = await api('POST', '/economy/purchase', { cookie, body: { itemId: 'x', referenceEventId: ref } });
            expect(r.status).toBe(400);
        }
    });

    test('묶음 구매 items가 빈 배열·글자 → 400, 항목에 금액 칸 끼우면 400', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const items of [[], 'x', [{ itemId: 'a', price: 0 }]]) {
            const r = await api('POST', '/economy/purchases/bulk', { cookie, body: { items, referenceEventId: `r-${rand()}` } });
            expect(r.status, JSON.stringify(items)).toBe(400);
        }
    });

    test('가진 적 없는 아이템 장착 → 400 (남의 스킨 못 끼움)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/economy/equip', { cookie, body: { slot: 'PROFILE_PHOTO', itemId: 'not-owned-item', expectedRevision: 'x' } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });

    test('이모티콘 칸에 안 가진 이모티콘을 넣어 저장 → 거절되고 칸이 그대로', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const before = await api('GET', '/user/me/emoji-palette', { cookie });
        const slots = [...before.json.slots];
        slots[0] = 'emoji-not-owned-xyz';
        const r = await api('PUT', '/user/me/emoji-palette', { cookie, body: { slots, revision: before.json.revision } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        const after = await api('GET', '/user/me/emoji-palette', { cookie });
        expect(after.json.slots).toEqual(before.json.slots);
    });

    test('쿠폰 코드에 SQL·꺾쇠·너무 긴 글자·숫자 → 400·404 (500 없음), 지급 없음', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        for (const code of ["' OR 1=1--", '<script>', 'A'.repeat(41), 12345, null]) {
            const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
            expect(r.status, String(code)).toBeGreaterThanOrEqual(400);
            expect(r.status).toBeLessThan(500);
        }
        const w = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(w.json).toEqual({ balanceGold: 0, balanceDiamond: 0 });
    });

    test('닉네임에 꺾쇠·따옴표·공백만·9자 이상 → 400, 닉네임 그대로', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        for (const nickname of ['<b>a</b>', "a'b", '   ', 'abcdefghi', { a: 1 }]) {
            const r = await api('PATCH', '/user/me/nickname', { cookie, body: { nickname } });
            expect(r.status, JSON.stringify(nickname)).toBe(400);
        }
        const p = await api('GET', '/user/me/profile', { cookie });
        expect(p.body).toContain(account.nickname);
    });

    test('신고 메모 501자·모르는 칸·없는 사유 → 400 INVALID_REPORT', async ({ accounts }) => {
        const target = await accounts.create();
        const { cookie } = await login(await accounts.create());
        const base = { targetUuid: target.uuid, gameId: '11111111-1111-4111-8111-111111111111', reasonCode: 'ABUSE' };
        for (const body of [{ ...base, memo: 'x'.repeat(501) }, { ...base, extra: 1 }, { ...base, reasonCode: 'HACK' }, { ...base, targetUuid: 'not-uuid' }]) {
            const r = await api('POST', '/reports', { cookie, body });
            expect(r.status, JSON.stringify(Object.keys(body))).toBe(400);
            expect(r.json?.code).toBe('INVALID_REPORT');
        }
    });

    test('나 자신을 신고 → 400 SELF_REPORT', async ({ accounts }) => {
        const me = await accounts.create();
        const { cookie } = await login(me);
        const r = await api('POST', '/reports', { cookie, body: { targetUuid: me.uuid, gameId: '11111111-1111-4111-8111-111111111111', reasonCode: 'ABUSE' } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('SELF_REPORT');
    });

    test('친구 즐겨찾기 값에 글자·숫자 → 400 (참·거짓만)', async ({ accounts }) => {
        const other = await accounts.create();
        const { cookie } = await login(await accounts.create());
        const r = await api('PUT', `/friends/favorites/${other.uuid}`, { cookie, body: { favorite: 'yes' } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });

    test('친구 요청 수락 id에 글자·음수·아주 큰 수 → 400·404 (500 없음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const id of ['abc', '-1', '99999999999999999999']) {
            const r = await api('PUT', `/friends/requests/${id}/accept`, { cookie });
            expect(r.status, id).toBeGreaterThanOrEqual(400);
            expect(r.status).toBeLessThan(500);
        }
    });

    test('알림 읽음 id에 글자·SQL 모양 → 400·404 (500 없음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const id of ['abc', "1' OR '1'='1", '-5']) {
            const r = await api('PATCH', `/notifications/${encodeURIComponent(id)}/read`, { cookie });
            expect(r.status, id).toBeGreaterThanOrEqual(400);
            expect(r.status).toBeLessThan(500);
        }
    });

    test('결과 다시 묻기 id 100개 넘음 → 400', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const ids = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
        const r = await api('GET', `/friends/requests/results?ids=${ids}`, { cookie });
        expect(r.status).toBe(400);
    });
});
