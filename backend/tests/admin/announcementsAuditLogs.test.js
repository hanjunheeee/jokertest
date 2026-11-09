'use strict';

// 관리자 공지 보내기·처리 이력 거르기 단위 시험 (AD-090·091·103 DB 없는 부분), 가짜 의존으로
// npm test (DB 없이 돎)
const test = require('node:test');
const assert = require('node:assert/strict');

const { sendAdminAnnouncement } = require('../../admin/services/announcements/send');
const { readBody } = require('../../admin/controllers/announcements.controller');
const { readFilters } = require('../../admin/controllers/auditLogs.controller');
const { listAuditLogs } = require('../../admin/services/auditLogs/list');

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

test('AD-090: 요청 번호를 공지 id로 넘기고, 결과 수를 ANNOUNCE 기록 after에 실음', async () => {
    const calls = { send: [], audit: [] };
    const deps = {
        sendAnnouncement: async (input) => {
            calls.send.push(input);
            return { announcementId: input.announcementId, target: 'users', recipientCount: 2, created: 1, duplicated: 0, failed: 1 };
        },
        audit: { record: async (entry) => { calls.audit.push(entry); return { id: 77 }; } },
    };
    const req = { admin: { id: 'admin-1' } };
    const out = await sendAdminAnnouncement({
        req, requestId: UUID_A, title: '제목', body: '본문', target: 'users', userUuids: [UUID_A, UUID_B, UUID_A],
    }, deps);

    assert.deepEqual(out, { result: { recipientCount: 2, created: 1, duplicated: 0, failed: 1 }, auditId: 77 });
    assert.equal(calls.send[0].announcementId, UUID_A);
    const [entry] = calls.audit;
    assert.equal(entry.req, req);
    assert.equal(entry.action, 'ANNOUNCE');
    assert.equal(entry.requestId, UUID_A);
    assert.deepEqual(entry.after, {
        title: '제목', body: '본문', target: 'users', selectedCount: 2, recipientCount: 2, created: 1, duplicated: 0, failed: 1,
    });
});

test('AD-090: 몸 검사 — 앞뒤 빈칸 뺌, online에 userUuids 오면 거절', () => {
    const ok = readBody({ requestId: UUID_A, title: '  제목 ', body: ' 본문 ', target: 'online' });
    assert.equal(ok.title, '제목');
    assert.equal(ok.body, '본문');
    assert.throws(() => readBody({ requestId: UUID_A, title: 't', body: 'b', target: 'online', userUuids: [UUID_A] }), (e) => e.details.field === 'userUuids');
    assert.throws(() => readBody({ requestId: UUID_A, title: '   ', body: 'b', target: 'online' }), (e) => e.details.field === 'title');
    assert.throws(() => readBody(null), (e) => e.code === 'INVALID_INPUT');
});

test('AD-103: 거르기 기본값 — kind all, limit 50, 빈 값은 안 준 것', () => {
    assert.deepEqual(readFilters({}), { kind: 'all', memberUuid: null, adminId: null, from: null, to: null, before: null, limit: 50 });
    assert.deepEqual(readFilters({ kind: '', memberUuid: '' }).kind, 'all');
    assert.throws(() => readFilters({ from: '2026-11-10T00:00:00Z', to: '2026-11-09T00:00:00Z' }), (e) => e.details.field === 'to');
    assert.throws(() => readFilters({ kind: ['all', 'announce'] }), (e) => e.details.field === 'kind');
});

test('AD-103: 목록 SQL — 칸 묶음·회원·시간 제한·한 줄 더 읽어 다음 쪽 판단', async () => {
    const seen = [];
    const rows = [3, 2, 1].map((id) => ({
        id, admin_id: 'a1', action: 'BAN', target_type: 'user', target_id: UUID_A, before_value: null,
        after_value: '{"kind":"PERMANENT"}', reason: 'r', ip: null, access_email: null, created_at: new Date('2026-11-10T00:00:00Z'),
    }));
    const db = {
        sequelize: {
            query: async (sql, options) => {
                seen.push({ sql, options });
                if (sql.includes('FROM admin_audit_logs')) return rows;
                if (sql.includes('FROM admin_users')) return [{ id: 'a1', name: 'ceo' }];
                return [{ id: UUID_A, name: '가면1' }];
            },
        },
    };
    const queue = { run: (fn) => fn() };
    const page = await listAuditLogs({ ...readFilters({ kind: 'sanction', memberUuid: UUID_A, limit: '2' }) }, { db, queue });

    assert.match(seen[0].sql, /^SELECT \/\*\+ MAX_EXECUTION_TIME\(3000\) \*\//);
    assert.match(seen[0].sql, /action IN \(:actions\)/);
    assert.deepEqual(seen[0].options.replacements.actions, ['FORCE_DISCONNECT', 'BAN', 'BAN_UPDATE', 'UNBAN', 'REPORT_RESOLVE']);
    assert.equal(seen[0].options.replacements.memberUuid, UUID_A);
    assert.equal(seen[0].options.replacements.take, 3);
    assert.deepEqual(page.items.map((item) => item.id), [3, 2]);
    assert.equal(page.nextBefore, 2);
    assert.deepEqual(page.items[0].admin, { id: 'a1', loginId: 'ceo' });
    assert.deepEqual(page.items[0].target, { uuid: UUID_A, nickname: '가면1' });
    assert.deepEqual(seen[0].options.replacements.memberTargets, ['member', 'user']);
    assert.deepEqual(page.items[0].after, { kind: 'PERMANENT' });
    assert.equal(page.items[0].createdAt, '2026-11-10T00:00:00.000Z');
});
