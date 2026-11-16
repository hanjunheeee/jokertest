'use strict';

// 서버 2대 판 골드·금지어 다시 읽기 브라우저 시험 (어려움) — 한 서버가 받은 값 바꾸기가 다른 서버 판에 듦: 돌던 판은 시작 때 값·다음 판은 새 값, 0이면 표시 없음, 금지어를 지우면 다시 보임
// 목록 A17-서버-여러대.md 번호 A17-H-032~034 (032·033은 서버 전체 판 골드 값을 바꿔 @serial, 끝에 1로 되돌림, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-gold.spec.js
const K = require('./_a17-kit');
const { expectReadable } = require('../../helpers/visible');
const db = require('../../helpers/db');
const N = require('../ingame/b-night/_night');
const C = require('../ingame/c-chat/_lib');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, internal, mn, N1, N2, U, nick } = K;

const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

test('A17-H-032 서버 ㄴ 8명 판 중 관리자 값 2(서버 ㄱ이 받음) → 그 판 결과판 "+1골드" → 같은 방 둘째 판 끝 "+2골드" @game @hard @serial @smoke', async ({ browser, crowd, bots }) => {
    test.setTimeout(600_000);
    const admin = await K.openAdmin(browser);
    try {
        await K.setGold(admin.page, 1, { node: N1 });
        const a = await crowd.on(N2);
        const b = await crowd.on(N2);
        const people = [a, b];
        const [hostBot, ...otherBots] = await mn.botsOn(bots, 6, N2);
        // 첫 판: 값 1일 때 시작 (역할 확인 창은 판 끝내기 도우미가 닫음)
        const { t, joker } = await K.startGame({ hostBot, otherBots, people, reveal: false });
        expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N2);

        // 판 도중 값 2 저장은 서버 ㄱ이 받음
        const saved = await K.setGold(admin.page, 2, { node: N1 });
        expect(saved.settings?.goldReward, '저장된 값').toBe(2);

        // 아무도 안 나가게 봇 표로 광대 봇을 처형해 끝냄 → 돌던 판은 시작 때 값
        await K8.voteOutJoker(t, joker);
        await K8.allAtResult(people);
        for (const p of people) await expect(K.goldChip(p.page, nick(p))).toHaveText('+1골드');

        // 같은 방 둘째 판: 여덟 명 모두 "대기방으로" → 방장 봇이 시작
        for (const p of people) await K8.pressReturn(p.page);
        for (const bot of t.bots) await K8.botReturn(bot, t.gameId);
        for (const p of people) await K8.expectParty(p.page, 8);
        expect((await e2e.roomOf(U(a)))?.roomCode, '같은 방 코드').toBe(t.roomCode);
        const next = await K8.startByBot(hostBot, people, t.bots, K8.rolesFor(people, [t.bots.at(-1)]));
        expect(await mn.gameNodeOf(U(a)), '둘째 판도 같은 서버').toBe(N2);
        const nextJoker = await K8.findJokerBot(next, t.bots, { not: hostBot });

        await K8.voteOutJoker(next, nextJoker);
        await K8.allAtResult(people);
        for (const p of people) {
            await expect(K.goldChip(p.page, nick(p))).toHaveText('+2골드');
            await expectReadable(K.goldChip(p.page, nick(p)));
        }
    } finally {
        await K.setGold(admin.page, 1);
        await admin.close();
    }
});

test('A17-H-033 관리자 값 0(서버 ㄱ이 받음) → 서버 ㄴ 5명 판(사람 2 + 봇 3) 끝 → 결과판에 골드 표시 없음 @game @hard @serial', async ({ browser, crowd, bots }) => {
    test.setTimeout(300_000);
    const admin = await K.openAdmin(browser);
    try {
        const saved = await K.setGold(admin.page, 0, { node: N1 });
        expect(saved.settings?.goldReward, '저장된 값').toBe(0);

        const a = await crowd.on(N2);
        const b = await crowd.on(N2);
        const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N2);
        const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
        expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N2);

        await K.endByJoker(t, joker);
        await K8.allAtResult([a, b]);
        for (const p of [a, b]) {
            // 결과판은 읽히는데 골드 글은 어디에도 없음
            await expectReadable(resultBoard(p.page).getByText(nick(p), { exact: true }).first());
            await expect(resultBoard(p.page).getByTestId('game-result-gold-reward')).toHaveCount(0);
            await expect(resultBoard(p.page)).not.toContainText('골드');
        }
        // 지급도 없음: 그 판 판 골드 장부 줄 0
        expect(await K.rewardedUuids(t.gameId), '판 골드 장부 줄').toEqual([]);
    } finally {
        await K.setGold(admin.page, 1);
        await admin.close();
    }
});

test('A17-H-034 금지어 넣기 → 서버 ㄴ 6명 판(사람 2 + 봇 4) 채팅에서 가려짐 → 지우고 서버 ㄱ만 다시 읽음 → 같은 낱말이 그대로 보임 @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(300_000);
    const word = `금칙${Math.floor(Math.random() * 1e8)}`;
    const stars = '*'.repeat(word.length);
    await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [word]);
    try {
        const added = await K.internalOn(N1, 'POST', '/internal/banned-words/reload');
        expect(added.ok, `서버 ㄱ 금지어 다시 읽기 (${added.status})`).toBe(true);

        const a = await crowd.on(N2);
        const b = await crowd.on(N2);
        const [hostBot, ...otherBots] = await mn.botsOn(bots, 4, N2);
        const { t } = await K.startGame({ hostBot, otherBots, people: [a, b] });
        expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N2);
        await N.toDay(t, { dayIndex: 1 });
        await C.readyToChat(b.page);

        // 넣은 뒤: ㄱ이 친 낱말이 ㄴ 화면에서 가려짐
        const head = C.uniq('처음');
        await C.say(a.page, `${head} ${word}`);
        await C.expectLine(b.page, nick(a), `${head} ${stars}`, { timeout: 15_000 });
        await expect(C.chatLog(b.page)).not.toContainText(word);

        // 지우기는 서버 ㄱ만 다시 읽음 → 서버 ㄴ 판에도 닿으면 같은 낱말이 그대로 보임 (닿을 때까지 새 글로 다시 침)
        await db.query('DELETE FROM banned_words WHERE word = ?', [word]);
        const removed = await K.internalOn(N1, 'POST', '/internal/banned-words/reload');
        expect(removed.ok, `서버 ㄱ 금지어 다시 읽기 (${removed.status})`).toBe(true);
        await expect(async () => {
            const again = C.uniq('다시');
            await C.say(a.page, `${again} ${word}`);
            await C.expectLine(b.page, nick(a), `${again} ${word}`, { timeout: 3000 });
        }).toPass({ timeout: 30_000 });
        await expectReadable(C.chatLog(b.page).getByText(word).last());
    } finally {
        await db.query('DELETE FROM banned_words WHERE word = ?', [word]);
        await internal.reloadBannedWords();
    }
});
