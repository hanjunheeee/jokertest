'use strict';

// 모바일 재판 판정 결과 시험: 아무도 안 내면 무죄, 유죄면 추방 글, 무죄면 밤 안내, 피고 카드 사망 표시, 처형 직업·표 수가 화면에 안 나옴
// 목록 A04-E-039·044·046·049·051·053 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const { talk, expectPlayerStatus } = require('./_talk');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 화면에 보이는 글 전부에서 명패+시간패널 줄만 뺌 (밤 차례 이름 "밤-광대"·남은 시간은 처형 정보가 아님)
function screenText(page) {
    return page.evaluate(() => {
        let text = document.body.innerText;
        for (const el of document.querySelectorAll('[data-ingame-phase-timer-mobile]')) text = text.replace(el.innerText, ' ');
        return text;
    });
}

test('A04-E-039 아무도 안 내면 15초 뒤 무죄: 추방 글 없이 밤, 피고는 산 채 (모바일 6명) @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 5, settings: { tribunalTime: 15 } });
    const deadline = await A.tribunalDeadline(t);
    // 손잡이 없이 재판 15초를 그대로 기다림
    const closed = await A.closedAt(page, { timeout: 20000 });
    A.expectNear(closed, deadline, '재판 15초 마감에 창이 닫힘');
    await expect(trial.phaseLine(page)).toContainText('밤', { timeout: 10000 });
    await expect(trial.expulsion(page)).toHaveCount(0);
    await expect(page.getByText(trial.expelText(d.nickname))).toHaveCount(0);
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
});

test('A04-E-044 유죄면 "[닉네임]님이 가면무도회에서 추방당하셨습니다."가 읽힘 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 5 });
    // 내 유죄 1표뿐 (봇은 기권) → 처형
    await A.pressVote(page, 'GUILTY');
    await A.endTribunal(t);
    await A.expectExpelReadable(page, d.nickname);
});

test('A04-E-046 무죄면 추방 글 없이 밤 안내가 뜸 (모바일 5명) @game', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 4 });
    await A.pressVote(page, 'NOT_GUILTY');
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
    await A.readable(trial.nightNotice(page).getByText(A.TEXT.night), { timeout: 15000 });
    await expect(trial.expulsion(page)).toHaveCount(0);
    await expect(page.getByText(trial.expelText(d.nickname))).toHaveCount(0);
});

// 세로 카톡형엔 카드 판이 없음 → 플레이어 목록 그 줄의 상태 글로 봄
test('A04-E-049 유죄면 피고 목록 줄이 사망 표시로 바뀜 (모바일 7명) @game', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 6 });
    await A.pressVote(page, 'GUILTY');
    await A.endTribunal(t);
    await expectPlayerStatus(page, d.nickname, '사망', { timeout: 20000 });
});

test('A04-E-051 처형된 사람이 광대여도 화면 글에 "광대"가 안 나옴 (모바일 6명, 광대 2) @game', async ({ user, table }) => {
    const page = user.page;
    // 광대 둘 중 하나를 처형 → 판이 이어져 결과 화면(직업 공개)으로 안 감
    const { t, d } = await A.startTrial(table, {
        humans: [user],
        bots: 5,
        settings: { jokerCount: 2 },
        roles: A.plainRoles(({ bots }) => ({ [A.uuidOf(bots[1])]: 'JOKER' })),
        pick: (tt) => tt.bots[0],
    });
    await A.pressVote(page, 'GUILTY');
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(false);
    expect(s.phase).toBe('NIGHT');
    // 추방 글 단계 (밤 안내·밤 차례 안내는 이 연출이 끝난 뒤에 뜸)
    await A.waitExpelText(page, d.nickname);
    expect(await screenText(page)).not.toContain('광대');
    // 연출이 끝난 뒤 채팅방 죽음 알림 줄에도 직업 없음
    const line = talk.system(page).filter({ hasText: `${d.nickname}님이 죽었습니다` });
    await expect(line).toHaveText(`${d.nickname}님이 죽었습니다`, { timeout: 20000 });
});

test('A04-E-053 유죄·무죄 표 수가 화면에 안 나옴 (모바일 5명, 유죄 3 : 무죄 1) @game', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 4 });
    // 5명 판은 투표할 사람이 4명 → 봇 유죄 2·무죄 1 + 내 유죄 1
    const [b0, b1, b2] = await A.votersOf(t, d);
    await A.botsTribunal(t, [[b0, 'GUILTY'], [b1, 'GUILTY'], [b2, 'NOT_GUILTY']]);
    await A.pressVote(page, 'GUILTY');
    await A.endTribunal(t);
    // 추방 연출 글은 닉네임 글 한 줄뿐
    await A.waitExpelText(page, d.nickname);
    await expect(trial.expulsion(page)).toHaveText(trial.expelText(d.nickname));
    // 연출이 끝난 뒤 채팅방 죽음 알림 줄·화면 어디에도 표 수 글 없음
    const line = talk.system(page).filter({ hasText: `${d.nickname}님이 죽었습니다` });
    await expect(line).toHaveText(`${d.nickname}님이 죽었습니다`, { timeout: 20000 });
    await expect(trial.expulsion(page)).toHaveCount(0, { timeout: 20000 });
    expect(await screenText(page)).not.toMatch(/유죄|무죄|\d\s*표/);
});
