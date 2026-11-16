'use strict';

// 관리자 화면 "보임" 브라우저 시험 (PC 크기 1280×800) — 신고 "이미 처리됨" 글이 가려지지 않고 대비가 됨, 정지 확인 창 단추 둘이 화면 안·안 가려짐
// 목록 시험목록/A14-관리자.md 번호 A14-E-087~088 — 모임만: npx playwright test --list tests/admin/a14-readable.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a14-kit');

const { E } = k;

test(`${E(87)} 신고 "이미 처리됨" 글이 읽힘 (가려짐·대비) @smoke`, async ({ browser, accounts }) => {
    const [reporter, target] = await accounts.createMany(2);
    const reportId = await k.insertReport({ reporter, target });
    const w = await k.openAdmin(browser);
    try {
        // 화면은 처리 전 상세를 연 채로, 그사이 다른 곳(관리자 API)에서 먼저 기각됨
        await w.page.goto(`/reports/${reportId}`);
        await expect(w.page.getByRole('heading', { level: 1, name: `신고 #${reportId}` })).toBeVisible();
        await k.adminApi(w.page, 'POST', `/reports/${reportId}/dismiss`, {});
        await w.page.getByRole('button', { name: '기각', exact: true }).click();
        const box = k.dialog(w.page, '신고 기각');
        await box.getByRole('button', { name: '기각', exact: true }).click();
        await expect(box).toBeHidden();
        const notice = w.page.getByRole('status').filter({ hasText: '이미 처리했어요.' });
        await expect(notice).toContainText(w.admin.loginId);
        await expectReadable(notice);
    } finally {
        await w.close();
    }
});

test(`${E(88)} 1280×800에서 정지 확인 창 단추 둘(취소·정지하기)이 화면 안·안 가려짐`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        const box = await k.banUi(w.page, member, { days: 7, reason: '보임 확인' });
        await expectReadable(box.getByRole('button', { name: '취소', exact: true }));
        await expectReadable(box.getByRole('button', { name: '정지하기', exact: true }));
        expect(w.page.viewportSize()).toEqual({ width: 1280, height: 800 });
    } finally {
        await w.close();
    }
});
