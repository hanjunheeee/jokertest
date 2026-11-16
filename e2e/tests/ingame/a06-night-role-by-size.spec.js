'use strict';

// 인원별 밤 시민 채팅 브라우저 시험 (PC) — 자동 구성 5~10명 판마다 판에 있는 직업 봇이 다 밤 채팅을 해도 시민 사람 칸은 0줄이고 까닭 글이 보임
// 목록 A06-판중-채팅.md 번호 A06-E-037~042
const { test, expect } = require('../../helpers/fixtures');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const k = require('./_a06-simple-kit');

// 자동 구성에서 인원마다 있는 직업 (목록 머리말: 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼, 광대는 늘 1)
function specialRolesFor(size) {
    const roles = ['JOKER'];
    if (size >= 6) roles.push('DOCTOR');
    if (size >= 8) roles.push('GUARD');
    if (size >= 10) roles.push('WITCH_HUNTER');
    return roles;
}

[5, 6, 7, 8, 9, 10].forEach((size, i) => {
    const id = `A06-E-${String(37 + i).padStart(3, '0')}`;
    const smoke = size === 5 ? ' @smoke' : '';
    const specials = specialRolesFor(size);

    test(`${id} 자동 구성 ${size}명 판: 직업 봇(${specials.length}개 직업)이 다 밤 채팅 → 시민 칸 0줄 + 까닭 글 보임 @game${smoke}`, async ({ user, table }) => {
        if (size >= 8) test.setTimeout(240_000);
        // 판 차리기 전에 걸어야 화면 소켓이 받은 알림이 다 적힘
        const frames = c.watchSocket(user.page);
        // 사람 시민, 봇 앞에서부터 그 인원에 있는 직업 하나씩 (자동 구성에 그 직업이 없으면 여기서 걸림)
        const t = await k.deal(table, user, { bots: size - 1, me: 'CITIZEN', botRoles: specials });
        const page = user.page;
        // 자동 구성이 목록대로인지: 시민 아닌 직업이 딱 이만큼
        const s = await t.state();
        expect(s.players.filter((p) => p.role !== 'CITIZEN').map((p) => p.role).sort(), '시민 아닌 직업').toEqual([...specials].sort());

        await a.toDay(t);
        await c.phaseTo(t, 'NIGHT');
        await k.readableOnceClear(page, k.closedNote(page));
        await expect(k.closedNote(page)).toHaveText(k.CLOSED_TEXT);
        await expect(c.chatBox(page)).toHaveCount(0);

        // 판에 있는 직업 봇이 하나씩 밤 채팅 (혼자인 직업이라 자기만 받음 = 글이 진짜 나감)
        const texts = [];
        for (let b = 0; b < specials.length; b += 1) {
            const text = c.uniq(`${specials[b]}밤말`);
            texts.push(text);
            expect((await c.botNightSay(t, b, text))?.ok, `${specials[b]} 봇 밤 채팅`).toBe(true);
            await expect.poll(() => k.heard(t.bots[b], k.ROLE_EVT, text), { message: `${specials[b]} 봇이 자기 글을 받음` }).toBe(true);
        }

        // 시민 칸 0줄
        await expect(c.chatLog(page).getByRole('listitem')).toHaveCount(0);
        // 그 뒤에 보낸 단계 알림이 화면에 올 때까지 → 그 앞에 보낸 채팅이 있었다면 이미 와 있음
        await k.fencePage(t, frames);
        expect(frames.filter((f) => f.event === k.ROLE_EVT).length, '시민 화면 소켓이 받은 직업 채팅 수').toBe(0);
        for (const text of texts) await expect(c.chatLog(page)).not.toContainText(text);
    });
});
