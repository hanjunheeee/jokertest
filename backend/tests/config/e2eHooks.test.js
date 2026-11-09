'use strict';

// 브라우저 시험 손잡이 시험 파일, 운영에선 늘 꺼지고 시작 거부되는지 + 파일 메일·역할 미리 정하기·타이머 바로 돌리기
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isE2eHooksEnabled, getMailTestOutboxDir, assertNoE2eInProduction } = require('../../config/e2eHooks');
const mail = require('../../utils/adapters/mail');
const { createFileOutboxMailAdapter, outboxFileOf } = require('../../utils/adapters/mailSenders/fileOutbox');
const e2eTimers = require('../../socket/e2e/timers');

test('운영이면 E2E_HOOKS=1이어도 꺼짐, 개발·시험이면 1일 때만 켜짐', () => {
    assert.equal(isE2eHooksEnabled({ NODE_ENV: 'production', E2E_HOOKS: '1' }), false);
    assert.equal(isE2eHooksEnabled({ NODE_ENV: 'development', E2E_HOOKS: '1' }), true);
    assert.equal(isE2eHooksEnabled({ NODE_ENV: 'test', E2E_HOOKS: '1' }), true);
    assert.equal(isE2eHooksEnabled({ NODE_ENV: 'development', E2E_HOOKS: 'true' }), false);
    assert.equal(isE2eHooksEnabled({ NODE_ENV: 'development' }), false);
});

test('운영에 시험 전용 값이 있으면 시작 거부 오류, 개발이면 그냥 지나감', () => {
    assert.throws(() => assertNoE2eInProduction({ NODE_ENV: 'production', E2E_HOOKS: '1' }), { code: 'E2E_IN_PRODUCTION' });
    assert.throws(() => assertNoE2eInProduction({ NODE_ENV: 'production', MAIL_TEST_OUTBOX_DIR: 'x' }), { code: 'E2E_IN_PRODUCTION' });
    assert.doesNotThrow(() => assertNoE2eInProduction({ NODE_ENV: 'production' }));
    assert.doesNotThrow(() => assertNoE2eInProduction({ NODE_ENV: 'development', E2E_HOOKS: '1', MAIL_TEST_OUTBOX_DIR: 'x' }));
});

test('메일 파일 받는 곳은 운영이면 늘 없음 → 운영은 파일 발송기를 못 고름', () => {
    assert.equal(getMailTestOutboxDir({ NODE_ENV: 'production', MAIL_TEST_OUTBOX_DIR: '/tmp/x' }), null);
    assert.equal(mail.pickSender({ NODE_ENV: 'production', MAIL_TEST_OUTBOX_DIR: '/tmp/x', MAIL_SMTP_HOST: 'smtp.example.test' }), 'smtp');
    assert.equal(mail.pickSender({ NODE_ENV: 'development', MAIL_TEST_OUTBOX_DIR: '/tmp/x', MAIL_SMTP_HOST: 'smtp.example.test' }), 'file');
    assert.equal(mail.pickSender({ NODE_ENV: 'development' }), 'gateway');
});

test('파일 발송기: 받는 사람 파일에 한 줄씩, 틀린 주소는 ok false, 모르는 목적은 던짐', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-outbox-'));
    try {
        const adapter = createFileOutboxMailAdapter({ dir });
        const sent = await adapter.sendMail({ to: 'a+1@example.test', template: 'SIGNUP_CODE', params: { code: '123456', expiresInSec: 600 } });
        assert.equal(sent.ok, true);
        const lines = fs.readFileSync(outboxFileOf(dir, 'a+1@example.test'), 'utf8').trim().split('\n');
        assert.equal(lines.length, 1);
        const row = JSON.parse(lines[0]);
        assert.equal(row.params.code, '123456');
        assert.match(row.text, /123456/);
        assert.deepEqual(await adapter.sendMail({ to: 'a@x.test, b@x.test', template: 'SIGNUP_CODE', params: { code: '1' } }), { ok: false });
        await assert.rejects(() => adapter.sendMail({ to: 'a@example.test', template: 'NOPE' }));
        // 경로 넘어가기 글자는 _로
        assert.equal(path.dirname(outboxFileOf(dir, '../../evil@x.test')), dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('타이머 장부: 바로 돌리면 한 번만 돌고 원래 타이머는 꺼짐', async () => {
    let calls = 0;
    const handle = e2eTimers.trackedSetTimeout(() => { calls += 1; }, 50);
    assert.equal(e2eTimers.isPending(handle), true);
    assert.equal(e2eTimers.fireNow(handle), true);
    assert.equal(calls, 1);
    assert.equal(e2eTimers.isPending(handle), false);
    assert.equal(e2eTimers.fireNow(handle), false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(calls, 1);
});

test('역할 미리 정하기: 켜졌을 때만, 역할별 인원은 그대로 두고 바꿔 끼움', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, E2E_HOOKS: process.env.E2E_HOOKS };
    const gameHooks = require('../../socket/e2e/gameHooks');
    const makeSession = () => ({
        id: 'g1',
        players: new Map([
            ['u1', { uuid: 'u1', role: 'CITIZEN' }],
            ['u2', { uuid: 'u2', role: 'JOKER' }],
            ['u3', { uuid: 'u3', role: 'DOCTOR' }],
            ['u4', { uuid: 'u4', role: 'CITIZEN' }],
        ]),
    });
    const rolesOf = (session) => [...session.players.values()].map((p) => p.role).sort();
    try {
        process.env.NODE_ENV = 'test';
        process.env.E2E_HOOKS = '1';
        gameHooks.clearRolePresets();
        gameHooks.setRolePresets({ u1: 'JOKER', u4: 'DOCTOR' });
        const session = makeSession();
        const before = rolesOf(session);
        assert.deepEqual(gameHooks.applyRolePresets(session), []);
        assert.equal(session.players.get('u1').role, 'JOKER');
        assert.equal(session.players.get('u4').role, 'DOCTOR');
        assert.deepEqual(rolesOf(session), before);

        // 자리가 모자라면 못 맞춘 uuid 돌려줌, 쓴 건 지워짐
        gameHooks.setRolePresets({ u1: 'GUARD' });
        assert.deepEqual(gameHooks.applyRolePresets(makeSession()), ['u1']);
        assert.throws(() => gameHooks.setRolePresets({ u1: 'KING' }));

        // 운영이면 아무것도 안 바꿈
        process.env.NODE_ENV = 'production';
        gameHooks.setRolePresets({ u1: 'JOKER' });
        const prod = makeSession();
        gameHooks.applyRolePresets(prod);
        assert.equal(prod.players.get('u1').role, 'CITIZEN');
        gameHooks.clearRolePresets();
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});
