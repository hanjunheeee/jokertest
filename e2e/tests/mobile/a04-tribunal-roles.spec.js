'use strict';

// 모바일 직업별 재판 단추 시험: 내가 경비원이어도 피고가 아니면 유죄·무죄 단추가 보이고 눌러짐
// 목록 A04-E-149 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

test('A04-E-149 내가 경비원이어도 재판 단추가 읽히고 눌러짐 (모바일 8명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const log = A.socketLog(page);
    // 8명 판 자동 구성엔 경비원 1 → 나를 경비원으로 정함
    const { t } = await A.startTrial(table, { humans: [user], bots: 7, roles: A.plainRoles({ [user.account.uuid]: 'GUARD' }) });
    expect((await t.player(user.account.uuid)).role).toBe('GUARD');
    await A.expectButtonsReadable(page);
    await A.pressVote(page, 'GUILTY');
    await A.expectVoteAccepted(log, 'GUILTY', 1);
});
