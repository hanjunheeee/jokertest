'use strict';

// 판 중 채팅 칸 표 브라우저 시험 (PC) — 단계 4(역할 확인·낮·재판·밤) × 나 5(산 시민·산 광대·산 의사·죽은 시민·죽은 광대), 칸마다 사람이 글 하나 보내고 받은 봇을 봄
// 목록 A06-판중-채팅.md 번호 A06-E-001~018 (역할 확인 × 죽은 사람 2칸은 목록대로 뺌)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const a = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const k = require('./_a06-simple-kit');

const PHASES = [
    { key: '역할 확인', id: 'REVEAL' },
    { key: '낮', id: 'DAY' },
    { key: '재판', id: 'TRIBUNAL' },
    { key: '밤', id: 'NIGHT' },
];
const SELVES = [
    { key: '산 시민', role: 'CITIZEN', dead: false },
    { key: '산 광대', role: 'JOKER', dead: false },
    { key: '산 의사', role: 'DOCTOR', dead: false },
    { key: '죽은 시민', role: 'CITIZEN', dead: true },
    { key: '죽은 광대', role: 'JOKER', dead: true },
];

// 칸마다 기대 (목록 기대값 그대로) → 시험 이름에 붙일 글
function expectedLabel(phase, self) {
    if (phase.id === 'REVEAL') return '입력칸 꺼짐 + 까닭 글 보임 + 받은 봇 0';
    if (self.dead) return '죽은 봇만 받음 + "죽은 사람끼리" 보임';
    if (phase.id !== 'NIGHT') return '봇 전원 받음';
    if (self.role === 'CITIZEN') return '입력칸 없음 + 까닭 글 보임 + 받은 봇 0';
    return '같은 직업 봇만 받음';
}

// 산 사람 칸: 7명 판 직접 구성 광대 2·의사 2·시민 3 / 죽은 사람 칸: 8명 판 직접 구성 광대 2 (목록 인원 그대로)
// botRoles = 봇 앞에서부터 직업, 나머지 봇은 시민 → 뒤쪽 봇은 늘 시민 (피고·밤에 죽을 봇으로 씀)
function seating(self) {
    if (self.dead) {
        return {
            bots: 7,
            settings: customRoleSettings({ JOKER: 2 }),
            botRoles: self.role === 'JOKER' ? ['JOKER'] : ['JOKER', 'JOKER'],
        };
    }
    const byRole = {
        CITIZEN: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR'],
        JOKER: ['JOKER', 'DOCTOR', 'DOCTOR'],
        DOCTOR: ['JOKER', 'JOKER', 'DOCTOR'],
    };
    return { bots: 6, settings: customRoleSettings({ JOKER: 2, DOCTOR: 2 }), botRoles: byRole[self.role] };
}

// 역할 확인 동안 입력칸 자리에 뜨는 까닭 글 (frontend utils/inGameChatChannel.js ROLE_REVEAL_CHAT_LOCKED_TEXT)
const REVEAL_LOCKED_TEXT = '역할 확인이 끝나면 채팅할 수 있습니다';

// 역할 확인 10초 안: 역할 창을 닫아도 입력칸·보내기가 꺼져 있고 까닭 글이 읽힘 → 아무 봇도 못 받고 내 칸에도 줄이 없음
async function checkRoleReveal({ t, page, me }) {
    await ui.readRoleReveal(page);
    const text = c.uniq('확인중');
    const box = c.chatBox(page);
    // 꺼진 칸이라 칠 수 없음 (칸은 그대로 있고 꺼져 있기만 함), 까닭 글은 입력칸 자리에 보임
    await expect(box, '역할 확인 중 입력칸').toBeDisabled({ timeout: 3000 });
    await expect(c.sendButton(page), '역할 확인 중 보내기 단추').toBeDisabled({ timeout: 3000 });
    await expect(box).toHaveAttribute('title', REVEAL_LOCKED_TEXT);
    await expectReadable(k.boardChat(page).getByText(REVEAL_LOCKED_TEXT, { exact: true }), { ...k.STATUS_READABLE, timeout: 3000 });
    // 그래도 눌러 봄: 꺼진 칸은 글도 Enter도 안 받음
    await box.fill(text, { force: true, timeout: 1000 }).catch(() => {});
    await box.press('Enter', { timeout: 1000 }).catch(() => {});
    // 10초가 지나 낮이 돼 버렸으면 이 칸을 본 게 아님
    expect((await t.state()).phase, '아직 역할 확인 단계').toBe('ROLE_REVEAL');
    await k.settleBots(t);
    expect(k.whoSaw(t.bots, text), '글을 받은 봇').toEqual([]);
    expect(t.bots.filter((b) => k.chatFrom(b, me.uuid)).length, '사람 채팅을 받은 봇 수').toBe(0);
    await expect(c.chatLog(page)).not.toContainText(text);
}

// 산 사람 낮·재판: 보낸 글을 봇 전원이 낮 채팅으로 받음
async function checkAllBotsHear({ t, page }) {
    const text = c.uniq('모두에게');
    await c.say(page, text);
    await expect.poll(() => t.bots.filter((b) => k.heard(b, k.DAY_EVT, text)).length, { message: '낮 채팅을 받은 봇 수' }).toBe(t.bots.length);
}

// 밤 산 시민: 입력칸 없음, 까닭 글이 사람 눈에 읽힘, 봇은 아무것도 못 받음
async function checkNightCitizen({ t, page, me }) {
    await k.readableOnceClear(page, k.closedNote(page));
    await expect(k.closedNote(page)).toHaveText(k.CLOSED_TEXT);
    await expect(c.chatBox(page)).toHaveCount(0);
    await expect(c.sendButton(page)).toHaveCount(0);
    await k.settleBots(t);
    expect(t.bots.filter((b) => k.chatFrom(b, me.uuid)).length, '사람 채팅을 받은 봇 수').toBe(0);
}

// 밤 산 광대·의사: 같은 직업 봇만 밤 채팅으로 받고 나머지 봇은 못 받음
async function checkNightRole({ t, page, mates, others }) {
    await k.confirmNotice(page, '밤이 되었습니다');
    const text = c.uniq('동료에게');
    await c.say(page, text);
    await expect.poll(() => mates.filter((b) => k.heard(b, k.ROLE_EVT, text)).length, { message: '같은 직업 봇이 받음' }).toBe(mates.length);
    await k.settleBots(t);
    expect(k.whoSaw(others, text), '다른 직업 봇이 받음').toEqual([]);
}

// 죽은 사람: "죽은 사람끼리"가 읽히고, 보낸 글은 죽은 봇만 받음 (산 봇은 못 받음)
async function checkDead({ t, page, deadBot }) {
    await c.readyToChat(page, { timeoutMs: 60_000 });
    await expectReadable(c.deadBadge(page), k.BADGE_READABLE);
    const text = c.uniq('저승에서');
    await c.say(page, text);
    await expect.poll(() => k.heard(deadBot, k.DEAD_EVT, text), { message: '죽은 봇이 받음' }).toBe(true);
    await k.settleBots(t);
    expect(k.whoSaw(await k.aliveBots(t), text), '산 봇이 받음').toEqual([]);
}

let number = 1;
for (const phase of PHASES) {
    for (const self of SELVES) {
        // 역할 확인 중엔 아직 아무도 안 죽음 → 죽은 사람 2칸은 없음
        if (phase.id === 'REVEAL' && self.dead) continue;
        const id = `A06-E-${String(number).padStart(3, '0')}`;
        number += 1;
        const smoke = id === 'A06-E-004' ? ' @smoke' : '';

        test(`${id} 채팅 칸 표: ${phase.key} × ${self.key} → ${expectedLabel(phase, self)} @game${smoke}`, async ({ user, table }) => {
            // 죽은 사람 칸은 처형·밤 살해·둘째 날까지 가서 김
            if (self.dead) test.setTimeout(300_000);
            const seat = seating(self);
            const t = await k.deal(table, user, { ...seat, me: self.role });
            const page = user.page;
            const me = user.account;
            const mates = t.bots.filter((_, i) => seat.botRoles[i] === self.role);
            const others = t.bots.filter((b) => !mates.includes(b));

            if (phase.id === 'REVEAL') {
                await checkRoleReveal({ t, page, me });
                return;
            }
            await a.toDay(t);

            // 죽은 사람 칸: 1일 재판으로 사람 처형 → 그 밤 광대 봇이 시민 봇 하나를 죽임 (죽은 사람 글을 받을 죽은 봇) → 2일 낮
            const deadBot = t.bots[t.bots.length - 1];
            if (self.dead) {
                await k.execute(t, me.uuid);
                await k.nightKill(t, k.uid(deadBot));
            }

            if (phase.id === 'TRIBUNAL') {
                // 피고는 뒤쪽 시민 봇 (죽은 봇과 다른 봇)
                await k.openTribunal(t, k.uid(t.bots[t.bots.length - 2]));
                await expect(k.tribunalDialog(page)).toBeVisible({ timeout: 30_000 });
            }
            if (phase.id === 'NIGHT') await c.phaseTo(t, 'NIGHT');

            if (self.dead) await checkDead({ t, page, deadBot });
            else if (phase.id !== 'NIGHT') await checkAllBotsHear({ t, page });
            else if (self.role === 'CITIZEN') await checkNightCitizen({ t, page, me });
            else await checkNightRole({ t, page, mates, others });

            // 글을 보낸 때가 그 단계였는지 (확인하는 사이 단계가 넘어가 버렸으면 다른 칸을 본 것)
            const s = await t.state();
            expect(s.phase, '확인한 단계').toBe(phase.id);
        });
    }
}
