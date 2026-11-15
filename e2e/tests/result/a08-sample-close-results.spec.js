'use strict';

// 견본(도우미 쓰는 법 본보기) — 브라우저 시험: 5명 판을 끝내고 결과 화면 단추가 "사람 눈에 읽히는지"(visible.js) + 180초 손잡이로 결과 화면 닫기
// 쓰는 동안엔 안 돌림, 모여지는지만: npx playwright test --list tests/result/a08-sample-close-results.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { playToResult } = require('../room/roomHelpers');

test('견본-1 5명 판 끝 → 결과 화면 단추 둘이 읽힘 → 180초 손잡이로 닫으면 로비로 @game @smoke', async ({ user, table }) => {
    // 사람 1 + 봇 4 = 5명 판, 직업은 고정 (봇 광대 1을 봇 표로 처형 → 시민 승)
    const { t } = await playToResult({ user, table, kind: 'citizenWin' });
    const page = user.page;

    // "있다"가 아니라 "보인다": 크기·화면 안·안 가려짐·글자색과 바탕 대비 4.5 이상
    await expectReadable(page.getByRole('button', { name: '대기방으로' }));
    await expectReadable(page.getByRole('button', { name: '로비로' }));

    // 180초 규칙 자체를 보는 시험이 아니라서 손잡이로 바로 닫음 (규칙을 보는 시험은 견본-2처럼 진짜로 기다림)
    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
});

test('견본-2 결과 화면은 손잡이 없이 180초 뒤 로비로 @game @realtime', async ({ user, table }) => {
    // 시험 하나 제한(2분)보다 길어서 이 시험 안에서만 늘림 (설정 전체는 안 바꿈)
    test.setTimeout(300_000);
    await playToResult({ user, table, kind: 'citizenWin' });
    const page = user.page;
    const shownAt = Date.now();
    // 판 끝 시각부터 180초 (결과 화면이 뜨기까지 걸린 몇 초는 이미 지남) → 허용 폭 ±1.5초 바깥은 안 늘림
    await expect(page).toHaveURL(/\/lobby/, { timeout: 185_000 });
    expect(Date.now() - shownAt).toBeLessThanOrEqual(181_500);
});
