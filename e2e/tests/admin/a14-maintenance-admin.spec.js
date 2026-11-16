'use strict';

// 관리자 점검 화면 브라우저 시험 (PC 크기) — 예약하면 순서 단계 "예약됨", 끄면 "예약 전", 저장 뒤 서버별 반영 줄, 켜기 확인 창 시각·안내 글, 남은 판 숫자
// 목록 시험목록/A14-관리자.md 번호 A14-E-044~047 — 점검은 서버 전체에 걸려 전부 @serial, 끝에 꼭 끔 (켜진 뒤 게임 동작은 A18) / 모임만: npx playwright test --list tests/admin/a14-maintenance-admin.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const k = require('./_a14-kit');

const { E } = k;
const HALF_HOUR = 30 * 60 * 1000;
const stage = (page) => page.getByTestId('maintenance-stage');

// 점검 화면 → 시작 시각·안내 글 넣고 "점검 예약하기" → 확인 창
async function scheduleUi(page, { startMs, message }) {
    await k.goMenu(page, '점검');
    await expect(k.heading(page, '점검')).toBeVisible();
    await page.getByLabel('시작 시각 (한국 시각)', { exact: true }).fill(k.kstInput(startMs));
    await page.getByLabel('안내 문구', { exact: true }).fill(message);
    await page.getByRole('button', { name: '점검 예약하기', exact: true }).click();
    const box = k.dialog(page, '점검을 예약할까요?');
    await expect(box).toBeVisible();
    return box;
}

test(`${E(44)} 시작 30분 뒤 예약 → 순서 "예약됨" → 끄기 → "예약 전" @serial @smoke`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        await k.maintenanceOff(w.page);
        const box = await scheduleUi(w.page, { startMs: Date.now() + HALF_HOUR, message: `시험 점검 ${k.rand()}` });
        await box.getByRole('button', { name: '예약하기', exact: true }).click();
        await expect(box).toBeHidden();
        await expect(stage(w.page)).toHaveText('3단계 · 예약됨');
        await expectReadable(stage(w.page));
        await expect(w.page.getByTestId('maintenance-state')).toHaveText('예약됨');
        // 예약 뒤엔 단추 이름이 "점검 바꾸기"
        await expect(w.page.getByRole('button', { name: '점검 바꾸기', exact: true })).toBeVisible();

        await w.page.getByRole('button', { name: '점검 끄기', exact: true }).click();
        const off = k.dialog(w.page, '점검을 끌까요?');
        await off.getByRole('button', { name: '끄기', exact: true }).click();
        await expect(off).toBeHidden();
        await expect(stage(w.page)).toHaveText('1단계 · 예약 전');
        await expect(w.page.getByRole('button', { name: '점검 예약하기', exact: true })).toBeVisible();
    } finally {
        await k.maintenanceOff(w.page).catch(() => {});
        await w.close();
    }
});

test(`${E(45)} 점검 저장 → "서버별 반영" 줄 하나 이상 "반영됨" @serial`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        await k.maintenanceOff(w.page);
        const box = await scheduleUi(w.page, { startMs: Date.now() + HALF_HOUR, message: '서버별 반영 시험' });
        await box.getByRole('button', { name: '예약하기', exact: true }).click();
        await expect(box).toBeHidden();
        const results = w.page.getByRole('region', { name: '서버별 반영', exact: true });
        const ok = results.getByRole('listitem').filter({ hasText: /반영됨$/ });
        await expect(ok.first()).toBeVisible();
        expect(await ok.count()).toBeGreaterThanOrEqual(1);
        await expect(results.getByRole('listitem').filter({ hasText: '반영 안 됨' })).toHaveCount(0);
        await expectReadable(ok.first());
    } finally {
        await k.maintenanceOff(w.page).catch(() => {});
        await w.close();
    }
});

test(`${E(46)} 점검 켜기 확인 창에 시작 시각(한국 시각, 초 없음)·안내 글이 읽힘 @serial`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        await k.maintenanceOff(w.page);
        const startMs = Date.now() + HALF_HOUR;
        const message = `점검 안내 ${k.rand()}`;
        const box = await scheduleUi(w.page, { startMs, message });
        await expectReadable(box.getByText(`시작: ${k.kstText(startMs)}`, { exact: true }));
        await expectReadable(box.getByText(`안내 문구: ${message}`, { exact: true }));
        // 확인 창만 보고 닫음 (저장 안 함)
        await box.getByRole('button', { name: '취소', exact: true }).click();
        await expect(box).toBeHidden();
        await expect(stage(w.page)).toHaveText('1단계 · 예약 전');
    } finally {
        await k.maintenanceOff(w.page).catch(() => {});
        await w.close();
    }
});

test(`${E(47)} 사람 1 + 봇 5 = 6명 판 진행 중 점검 예약 → 점검 화면 남은 판 1개 이상 @serial @game`, async ({ browser, players, table }) => {
    const player = await k.openPlayer(players);
    await A.openTable(table, { humans: [player], bots: 5, roles: A.plainRoles() });
    const w = await k.openAdmin(browser);
    try {
        await k.maintenanceOff(w.page);
        const box = await scheduleUi(w.page, { startMs: Date.now() + HALF_HOUR, message: '판 남은 수 시험' });
        await box.getByRole('button', { name: '예약하기', exact: true }).click();
        await expect(box).toBeHidden();
        const live = w.page.getByTestId('maintenance-live-games');
        await expect(live).toHaveText(/^\d+개$/);
        expect(Number((await live.innerText()).replace('개', ''))).toBeGreaterThanOrEqual(1);
        await expectReadable(live);
    } finally {
        await k.maintenanceOff(w.page).catch(() => {});
        await w.close();
    }
});
