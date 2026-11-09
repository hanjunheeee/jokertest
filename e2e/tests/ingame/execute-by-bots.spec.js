// 본보기(ingame·봇 행동 지정): 5인 판, 봇 넷이 낮 투표·재판에서 나를 찍게 해서 처형되게 → 서버 기준 사망 + 죽은 사람 채팅 확인
const { test, expect, ui } = require('../../helpers/fixtures');

test('봇들이 낮 투표와 재판에서 나를 찍으면 → 나는 처형되어 죽은 사람이 됨 @game', async ({ user, table }) => {
    const me = user.account.uuid;
    const t = await table.setup({
        humans: [user],
        bots: 4,
        // 나는 시민, 봇 하나가 광대 (역할별 인원은 방 설정 자동 구성 그대로)
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }),
    });
    await ui.readRoleReveal(user.page);

    // 봇 행동: 낮 투표는 나, 재판은 유죄, 밤엔 아무도 안 찍음(광대가 나를 먼저 죽이지 않게), 죽으면 한마디
    t.playBots({ dayVote: me, tribunal: 'GUILTY', night: 'skip', dayChat: '봇 낮 인사', deadChat: '죽은 봇 말함' });

    const s = await t.advanceUntil((g) => g.players.find((p) => p.uuid === me)?.alive === false, { stepDelayMs: 1500 });
    expect(s.players.find((p) => p.uuid === me).alive).toBe(false);
    expect(s.phase).not.toBe('ROLE_REVEAL');
});
