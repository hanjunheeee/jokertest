'use strict';

// 점검 예약 큰 안내·띠 브라우저 시험 (모바일) — 예약 큰 안내 → 닫으면 띠, 띠가 바닥 단추·광고 줄을 안 가림
// 목록 A18-설정-배포-광고.md 번호 A18-E-012 — 점검은 서버 전체에 걸려 @serial(serial 프로젝트는 PC 창이라 휴대폰 사람을 따로 엶), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/mobile/a18-maintenance-notice.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../maintenance/_a18-kit');

test.afterEach(async () => {
    // 실패해도 예약이 남지 않게
    await K.clearMaint();
});

test('A18-E-012 모바일 로비, 30분 뒤 예약 → 큰 안내 → 닫음 → 띠 보임, 띠가 바닥 단추·광고 줄을 안 가림 @serial @smoke', async ({ players }) => {
    const phone = await K.openPhone(players);
    const page = phone.page;
    await K.setMaint({ enabled: true, startsInMs: 30 * 60 * 1000 });

    await expect(K.noticeTitle(page)).toHaveText(K.TEXT.SCHEDULED_TITLE, { timeout: 15_000 });
    await expectReadable(K.noticeTitle(page), { large: true });
    await expectReadable(K.noticeButton(page, '확인했어요'), { contrast: false });
    await K.closeNotice(page);

    await expect(K.band(page)).toBeVisible();
    await expectReadable(K.bandText(page));
    const bandBox = await K.band(page).boundingBox();

    // 바닥 단추마다: 띠와 안 겹치고 가운데 점에서 맨 위가 그 단추
    const bottomButtons = page.locator('#mobile-shell-bottom').getByRole('button');
    const count = await bottomButtons.count();
    expect(count, '로비 바닥 단추').toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
        const button = bottomButtons.nth(i);
        expect(K.overlaps(bandBox, await button.boundingBox()), `띠가 바닥 단추 ${i}와 겹침`).toBe(false);
        expect(await K.centerIsOwn(button), `바닥 단추 ${i} 가운데가 가려짐`).toBe(true);
    }

    // 로비 광고 줄(시험 빌드는 가짜 광고 또는 개발 회색 상자)도 안 가림
    const banner = K.adBanner(page);
    await expect(banner).toBeVisible();
    expect(K.overlaps(bandBox, await banner.boundingBox()), '띠가 광고 줄과 겹침').toBe(false);
    expect(await K.centerIsOwn(K.adSlot(banner).first()), '광고 칸 가운데가 가려짐').toBe(true);
});
