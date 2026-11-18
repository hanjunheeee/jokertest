'use strict';

// 다 묶음 장면 (관리자 혼자: 공지 받을 사람 찾기·판 설정 골드·회원 탈주 기록·기간 정지 끝 시각) 4줄
// run.js가 읽음 — 관리자 창은 _da-kit openAdmin, 화면 고르개는 e2e 관리자 시험 도우미(tests/admin/_a14-kit) 그대로
const { fromE2e, e2eRequire } = require('../lib/paths');
const { seat, start } = require('../lib/table');
const { openAdmin, k } = require('./_da-kit');

const { expect } = e2eRequire('@playwright/test');
const accounts = fromE2e('helpers/accounts');
const K09 = fromE2e('tests/ingame/_a09-simple-kit');

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = [
    {
        id: '다-01',
        needs: ['admin'],
        async prepare(s) {
            const w = await openAdmin(s);
            // 찾을 회원: 겹치지 않는 닉네임 (앞 두 글자로 찾으면 이 회원만 나옴)
            const member = await accounts.createAccount({ nickname: k.uniqueNickname() });
            await k.goMenu(w.page, '공지');
            await expect(k.heading(w.page, '공지')).toBeVisible();
            await w.page.getByLabel('제목', { exact: true }).fill('눈 확인 공지 제목');
            await w.page.getByLabel('본문', { exact: true }).fill('쓰던 공지 본문 — 찾기 뒤에도 그대로 있어야 함');
            await w.page.getByRole('radio', { name: '고른 사람' }).check();
            const box = w.page.getByLabel('받을 사람 찾기', { exact: true });
            await box.fill(member.nickname);
            await box.focus();
            s.note(`제목·본문을 써 두고 "받을 사람 찾기"에 ${member.nickname}을 넣어 둠 → Enter 또는 "찾기"를 누름 (보내기는 안 누름)`);
        },
    },
    {
        id: '다-02',
        needs: ['admin'],
        async prepare(s) {
            const w = await openAdmin(s);
            // 서버 전체 값 → 1에서 시작, 장면이 닫힐 때 1로 되돌림 (e2e 판 설정 시험과 같은 법)
            await k.adminApi(w.page, 'PUT', '/game-settings', { goldReward: 1 });
            s.keep(() => k.adminApi(w.page, 'PUT', '/game-settings', { goldReward: 1 }).catch(() => {}));
            await k.goMenu(w.page, '판 설정');
            await expect(k.heading(w.page, '판 설정')).toBeVisible();
            await expect(w.page.getByTestId('game-settings-gold')).toHaveText('1골드');
            s.note('"판마다 주는 골드" 칸에 0~100 숫자(예 2)를 넣고 "바꾸기" → 확인 창 → 바꾸기 → 메뉴 "처리 이력"에 "판 골드 바꿈" 줄 (장면이 닫히면 1골드로 되돌림)');
        },
    },
    {
        id: '다-03',
        needs: ['admin'],
        async prepare(s) {
            // 봇만 앉은 5명 판 (첫 봇 광대) → 낮까지 → 시민 봇 하나가 산 채로 나감 = 진짜 탈주 (e2e A09-E-091과 같은 법)
            const seated = await seat(s, { humans: [], bots: 5, roles: ({ bots }) => ({ [bots[0].account.uuid]: 'JOKER' }) });
            const t = await start(seated);
            s.keep(() => t.stopBots().catch(() => {}));
            await K09.toDay(t);
            const citizen = seated.bots[1];
            const reply = await citizen.request('leave_game_session', { gameId: t.gameId });
            if (!reply?.ok) throw new Error(`봇 나가기를 서버가 안 받음 (${JSON.stringify(reply)})`);

            const w = await openAdmin(s);
            // 탈주 저장이 조금 늦을 수 있어 상세를 다시 열며 기다림
            const row = w.page.getByRole('table', { name: '탈주 기록' }).getByRole('row').filter({ hasText: '산 채로 나감' });
            await expect(async () => {
                await k.openMember(w.page, citizen);
                await expect(row).toHaveCount(1, { timeout: 2000 });
            }).toPass({ timeout: 20_000 });
            await row.scrollIntoViewIfNeeded();
            s.note(`봇 판에서 ${citizen.nickname}이 낮에 산 채로 나가게 해 둔 회원 상세 → "탈주 기록" 표에 시각·"산 채로 나감"·판 번호`);
        },
    },
    {
        id: '다-04',
        needs: ['admin'],
        async prepare(s) {
            const w = await openAdmin(s);
            const member = await accounts.createAccount();
            // 회원 상세 → 제재 칸 "기간 정지" → 7일·사유까지 채워 둠 (누르기 직전)
            await k.banUi(w.page, member, { days: 7, reason: '눈 확인 기간 정지' });
            const guess = k.kstText(Date.now() + 7 * DAY_MS);
            s.note(`7일·사유를 채운 정지 창 → "정지하기" → 제재 칸 "정지 중 — …까지"와 정지 기록 표 끝 시각이 지금+7일(준비 때 ${guess} 언저리)인지 봄`);
            s.note('관리자 화면 시각은 분까지만 씀(초 없음, frontend SanctionPanel formatKst) → 초 차이는 화면에 안 보임');
        },
    },
];
