'use strict';

// 점검 안내 시험 — 예약 중 새로 접속하면 그 소켓만 maintenance_notice(scheduled), 꺼짐이면 안내 없음, 같은 안내는 두 번 안 감
// 목록 A18-B-114~116 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/flow/a18-maintenance-notice.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 가짜 소켓·진짜 접속 처리기 세상 (A10 시험 도우미, 읽기만), 접속하면 서버처럼 점검 안내를 보냄
const { makeWorld, maintenance } = require('./a10-world');
const maintenanceNotice = require('../../services/ops/maintenanceNotice');
const maintenanceClock = require('../../services/ops/maintenanceClock');

const MINUTE = 60_000;
// 점검 줄을 DB에서 읽은 것처럼 (가짜 저장소)
const fakeDb = (row) => ({ MaintenanceState: { findOne: async () => row } });

test('A18-B-114 예약 중(시작 10분 뒤) 새로 접속 → 그 소켓만 maintenance_notice scheduled + 기본 예정 글', async (t) => {
    const w = makeWorld(t);
    maintenanceNotice.__resetForTests();
    await w.connect('b114-old');
    const startsAt = new Date(Date.now() + 10 * MINUTE);
    const endsAt = new Date(Date.now() + 70 * MINUTE);
    maintenance.__setStateForTests({ enabled: true, startsAt, endsAt });
    await w.connect('b114-new');
    const got = w.received('b114-new', 'maintenance_notice');
    assert.equal(got.length, 1);
    assert.deepEqual(got[0], {
        state: 'scheduled',
        message: '서버 점검이 예정되어 있어요.',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        serverNow: new Date(Date.now()).toISOString(),
        forceEndAtStart: true,
    });
    assert.equal(w.count('b114-old', 'maintenance_notice'), 0, '먼저 붙은 소켓도 받음');
});

test('A18-B-115 점검 꺼짐에 접속 → 안내 없음', async (t) => {
    const w = makeWorld(t);
    maintenanceNotice.__resetForTests();
    await w.connect('b115');
    assert.equal(w.count('b115', 'maintenance_notice'), 0);
});

test('A18-B-116 같은 예약 두 번 다시 읽기 → 접속자마다 1번, 글 바꿔 다시 읽기 → 1번 더, 끄기 → cleared 1번', async (t) => {
    const w = makeWorld(t);
    maintenanceNotice.__resetForTests();
    const people = ['b116-a', 'b116-b', 'b116-c'];
    for (const uuid of people) await w.connect(uuid);
    // 서버 켤 때처럼 점검 시계 켜기: 다시 읽을 때마다 이 Node 접속자에게 안내 (시험 끝에 시계 멈춤)
    maintenanceClock.startMaintenanceClock();
    t.after(() => maintenanceClock.clock.stop());
    const startsAt = new Date(Date.now() + 10 * MINUTE);
    const scheduled = (message) => ({ id: 1, is_enabled: true, message, starts_at: startsAt, ends_at: null });
    const notices = (uuid) => w.received(uuid, 'maintenance_notice');

    await maintenance.reloadMaintenance({ db: fakeDb(scheduled(null)) });
    await maintenance.reloadMaintenance({ db: fakeDb(scheduled(null)) });
    for (const uuid of people) {
        assert.equal(notices(uuid).length, 1, `${uuid} 같은 안내 수`);
        assert.equal(notices(uuid)[0].state, 'scheduled');
    }

    await maintenance.reloadMaintenance({ db: fakeDb(scheduled('오후 2시 점검')) });
    for (const uuid of people) {
        assert.equal(notices(uuid).length, 2, `${uuid} 글 바꾼 뒤 안내 수`);
        assert.equal(notices(uuid)[1].message, '오후 2시 점검');
    }

    await maintenance.reloadMaintenance({ db: fakeDb({ id: 1, is_enabled: false, message: null, starts_at: null, ends_at: null }) });
    for (const uuid of people) {
        assert.equal(notices(uuid).length, 3, `${uuid} 끈 뒤 안내 수`);
        assert.equal(notices(uuid)[2].state, 'cleared');
    }
});
