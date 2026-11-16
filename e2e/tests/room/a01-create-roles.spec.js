'use strict';

// PC 방 만들기 역할 직접 지정 브라우저 시험 — 남는 자리 귀족(시민 직업) 글, 합이 정원 넘으면 오류 글·만들기 꺼짐, 광대 0 못 고름, 시민 0명 방, 직접 지정 저장
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-020~024, 돌리지 않고 모임만: npx playwright test --list tests/room/a01-create-roles.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('./_a01a-kit');

const summary = (page) => page.locator('[data-setup-role-composition-summary]');

test('A01-E-020 정원 10 직접 지정 광대 1 → "귀족: 9명 (자동 계산)" 읽힘 @smoke', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.fill(page, { maxPlayers: 10, custom: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } });
    const line = summary(page).getByText('귀족: 9명 (자동 계산)');
    await expect(line).toBeVisible();
    await expectReadable(line);
});

test('A01-E-021 정원 7 + 광대2·의사2·경비원2·마녀사냥꾼2 → 합 넘음 오류 글 읽힘, "게임 만들기" 꺼짐', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.fill(page, { maxPlayers: 7, custom: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    const error = summary(page).getByText(K.MSG.SUM_OVER);
    await expect(error).toBeVisible();
    await expectReadable(error);
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeDisabled();
});

test('A01-E-022 직접 지정 광대 1에서 − 꺼짐 (광대 0 못 고름)', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.fill(page, { custom: { JOKER: 1 } });
    await expect(K.arrow(page, '광대 인원', '감소')).toBeDisabled();
    expect(await K.numberOf(page, '광대 인원')).toBe(1);
});

test('A01-E-023 정원 5 광대2·의사1·경비원1·마녀사냥꾼1(시민 0명) → 방 생김, 서버 역할 수 그대로', async ({ user }) => {
    const room = await K.createRoomOn(user, { maxPlayers: 5, custom: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } });
    expect(room.settings.roleCompositionMode).toBe('custom');
    expect(room.settings.roleCounts).toEqual({ JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 });
});

test('A01-E-024 정원 8 광대1·의사2·경비원1 → 서버 구성 방식 custom·역할 수 그 값', async ({ user }) => {
    const room = await K.createRoomOn(user, { maxPlayers: 8, custom: { JOKER: 1, DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 0 } });
    expect(room.settings.roleCompositionMode).toBe('custom');
    expect(room.settings.roleCounts).toMatchObject({ JOKER: 1, DOCTOR: 2, GUARD: 1 });
    expect(room.settings.roleCounts.WITCH_HUNTER ?? 0).toBe(0);
});
