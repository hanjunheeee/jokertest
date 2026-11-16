'use strict';

// 입력 검사 브라우저 시험 (PC) — 닉네임에 숨은 글자·금지어 거절 글, 결과판 신고 메모 501자는 안 들어감
// 목록 A15-보안.md 번호 A15-E-071·072·074 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-input.spec.js)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { addBannedWords, removeBannedWords } = require('../../helpers/bannedWords');
const { db } = require('./_sec');
const account = require('../mypage/account-tools');
const { waitResult } = require('../room/roomHelpers');
const k = require('./_a15-kit');

const { n } = k;
const BANNED_NICKNAME = '사용할 수 없는 단어가 들어간 닉네임입니다.';

// 계정 관리에서 닉네임 칸에 넣고 "변경" → 닉네임 칸
async function tryNickname(page, nickname) {
    await account.gotoAccount(page);
    const box = account.section(page, '닉네임 변경');
    await box.getByPlaceholder('새 닉네임', { exact: true }).fill(nickname);
    await box.getByRole('button', { name: '변경', exact: true }).click();
    return box;
}

const nicknameNow = async (uuid) => (await db.query('SELECT nickname FROM users WHERE uuid = ?', [uuid]))[0]?.nickname;

test('A15-E-071 PC 닉네임 칸에 폭 0 빈칸 낀 이름 → 거절 글 보임, 닉네임 그대로 @smoke', async ({ user }) => {
    // "a15" 뒤에 눈에 안 보이는 폭 0 빈칸(U+200B)
    const box = await tryNickname(user.page, 'a15​닉');
    const notice = box.getByText(/한글, 영문, 숫자만/);
    await expectReadable(notice);
    expect(await nicknameNow(user.account.uuid)).toBe(user.account.nickname);
});

test(`A15-E-072 PC 금지어 든 닉네임 → "${BANNED_NICKNAME}" 읽힘, 닉네임 그대로`, async ({ user }) => {
    // 목록의 "바보" 자리에 시험마다 무작위 낱말 (같이 도는 다른 시험 채팅·닉네임에 안 걸리게)
    const word = `bw${crypto.randomBytes(2).toString('hex')}`;
    await addBannedWords([word]);
    try {
        const box = await tryNickname(user.page, word);
        await expectReadable(box.getByText(BANNED_NICKNAME, { exact: true }));
        expect(await nicknameNow(user.account.uuid)).toBe(user.account.nickname);
    } finally {
        await removeBannedWords([word]);
    }
});

test('A15-E-074 8명 판 끝 결과판 신고 창 메모 501자 → 500자에서 더 안 들어가거나 보내기 거절, 신고 줄 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const { t } = await k.setupGame(table, {
        humans: [user], bots: 7, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    // 봇 표로 광대 봇 처형 → 시민 승 → 결과판
    const joker = t.bots[0].account.uuid;
    await t.assertBotsCanExecute(joker);
    t.playBots((bot) => ({ dayVote: bot.account.uuid === joker ? 'abstain' : joker, tribunal: 'GUILTY', night: 'skip' }));
    await n.toEnd(t);
    const page = user.page;
    await waitResult(page);
    const target = t.bots[1];
    await page.getByRole('button', { name: `${target.nickname} 신고`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '플레이어 신고' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: '기타' }).click();
    const memo = dialog.getByRole('textbox', { name: '메모' });
    await memo.fill('가'.repeat(501));
    const length = (await memo.inputValue()).length;
    if (length > 500) {
        // 칸이 501자를 받았으면 보내기가 거절돼야 함 (글이 보임)
        await dialog.getByTestId('report-submit').click();
        await expectReadable(dialog.getByTestId('report-message'));
        await expect(dialog.getByTestId('report-message')).toHaveAttribute('role', 'alert');
    } else {
        expect(length, '500자에서 더 안 들어감').toBe(500);
    }
    const rows = await db.query('SELECT id FROM reports WHERE reporter_id = ? AND game_id = ?', [user.account.uuid, t.gameId]);
    expect(rows, '신고 줄 없음').toEqual([]);
});
