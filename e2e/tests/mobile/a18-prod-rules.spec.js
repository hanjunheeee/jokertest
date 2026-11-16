'use strict';

// 어디서나 5~10명 운영 규칙 브라우저 시험 (모바일) — 방 만들기 최대 인원 화살표가 5와 10에서 멈춤
// 목록 A18-설정-배포-광고.md 번호 A18-E-005 (단위 18), 광고 요청은 가짜로 가로챔, 돌리지 않고 모임만: npx playwright test --list --no-deps tests/mobile/a18-prod-rules.spec.js
const { test, expect } = require('../../helpers/fixtures');
const K = require('../maintenance/_a18-kit');

const MAX = '최대 플레이어 수';

test('A18-E-005 모바일 방 만들기 최대 인원: 줄이기를 끝까지 → 5에서 멈춤, 늘리기를 끝까지 → 10에서 멈춤 @smoke', async ({ players }) => {
    // 광고 가로채기를 먼저 건 휴대폰 사람 (진짜 광고 요청이 안 나가게)
    const phone = await K.openPhone(players);
    const page = phone.page;
    await page.goto('/game-setup');
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();
    await page.getByRole('navigation', { name: '인게임 설정 탭' }).getByRole('button', { name: '일반', exact: true }).click();

    expect(await K.pushToEnd(page, MAX, '감소')).toBe(5);
    await expect(K.arrow(page, MAX, '감소')).toBeDisabled();
    expect(await K.pushToEnd(page, MAX, '증가')).toBe(10);
    await expect(K.arrow(page, MAX, '증가')).toBeDisabled();
});
