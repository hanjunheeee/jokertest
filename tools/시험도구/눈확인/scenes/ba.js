'use strict';

// 바 묶음 장면 (판 안, 5명 이상) 바-01~14 — 바-01~03은 바-01 판(5명)을 chain '바-판'으로, 바-04~14는 9명 한 판을 chain '바-판2'로 이어 봄
// run.js가 읽음 — 앉히기는 미리, 판 시작은 보여 줄 때(역할 창이 진짜로 뜨게), 판 굴리기는 e2e Table 그대로 (도우미는 _ba-kit.js)
const { fromE2e, e2eRequire } = require('../lib/paths');
const { seat, start, customRoleSettings } = require('../lib/table');
const { readList } = require('../lib/scenes');
const k = require('./_ba-kit');

const { expect } = e2eRequire('@playwright/test');
const ui = fromE2e('helpers/ui');

const roleDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 역할 창은 10초 뒤 저절로 닫힘(서버도 10초 뒤 첫 낮) → 닫히면 "내 역할 보기" 단추로 다시 열어 둠 (사람이 연 창은 안 닫힘)
// 다음 장면(바-02)으로 넘어가면 그만둠 (바-02가 역할 창을 닫는데 다시 열지 않게)
async function keepRoleOpen(s, page) {
    const scene = s.scene;
    await expect(roleDialog(page)).toBeHidden({ timeout: 30_000 });
    for (let i = 0; i < 5; i += 1) {
        if (s.scene !== scene || s.closed) return;
        await s.act(() => ui.closeOverlays(page, { names: ['단계 전환 안내'], keepWatching: false }));
        if (!(await roleDialog(page).isVisible().catch(() => false))) {
            await s.act(() => page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 3000 }).catch(() => {}));
        }
        await new Promise((r) => setTimeout(r, 700));
    }
}

// 바-03 다른 인원 판 (5명은 바-01 판에서 이어 봄, 이 판들은 따로 새 판) — 들어가는 법·통과 글은 바-03 줄 그대로
const ROW03 = readList().get('바-03') ?? {};
const OTHER_SIZES = [6, 7, 9, 10];

// 9명 판(바-04~14) 1일 토론 채팅 + 귀족 창에 채팅 크게 보기
async function scene04(s) {
    await k.reach(s, 'chat1');
    await k.openCloseup(s.state.cast.noble.page);
}

module.exports = [
    {
        id: '바-01',
        chain: '바-판',
        async prepare(s) {
            const humans = [
                await s.person({ label: '나 (광대)' }),
                await s.person({ label: '광대 동료' }),
                await s.person({ label: '의사' }),
                await s.person({ label: '귀족' }),
            ];
            const uuid = (p) => p.account.uuid;
            // 5명 판: 사람 넷 + 봇 방장 하나, 광대 둘(동료 표시 보려고)·의사 하나·귀족 둘
            s.state.seated = await seat(s, {
                humans,
                bots: 1,
                settings: customRoleSettings({ JOKER: 2, DOCTOR: 1 }),
                roles: ({ bots }) => ({
                    [uuid(humans[0])]: 'JOKER', [uuid(humans[1])]: 'JOKER', [uuid(humans[2])]: 'DOCTOR',
                    [uuid(humans[3])]: 'CITIZEN', [bots[0].account.uuid]: 'CITIZEN',
                }),
            });
            s.note('큰 창 = 나(광대, 동료 있음), 작은 창 = 광대 동료·의사·귀족, 봇 1(귀족·방장)');
            s.note('역할 창은 10초 뒤 저절로 닫힘 → 도구가 "내 역할 보기"로 다시 열어 둠 (같은 창)');
        },
        async show(s) {
            const t = await start(s.state.seated);
            s.state.table = t;
            s.keep(() => t.stopBots().catch(() => {}));
            await expect(roleDialog(s.main)).toBeVisible({ timeout: 20_000 });
            for (const p of s.people) s.background(keepRoleOpen(s, p.page));
        },
        still: (s) => roleDialog(s.main).isVisible(),
    },
    {
        id: '바-02',
        chain: '바-판',
        async prepare(s) {
            await k.table(s, 'small');
            await k.reach(s, 'day1');
            s.note('1일 낮 토론 판 화면 — 내 카드는 "나", 같은 직업(광대) 동료 카드엔 "동료" 표시, 이름판 띠가 읽히는지 봄');
            s.note('바-01에서 이어 왔으면 작은 창(광대 동료·의사·귀족)에서도 같은 판을 다른 눈으로 봄');
        },
        still: k.at(k.isDay(1, 'DAY_DISCUSSION')),
    },
    {
        id: '바-03',
        chain: '바-판',
        async prepare(s) {
            const t = await k.table(s, 'small');
            await k.reach(s, 'day1');
            await k.botSay(t, t.bots[0], '가운데 채팅 창 확인용 한 줄');
            await k.calm(s.main, { quietMs: 800 });
            const g = await t.state();
            s.note(`${g.players.length}명 판 (창 1280×800) — 맨 위 "나" 카드 이름판이 가운데 채팅 창에 안 가려지는지 봄`);
            s.note('6·7·9·10명 판은 다음 장면 바-03-06·07·09·10 (인원마다 새 판)');
        },
        still: k.at(k.isDay(1, 'DAY_DISCUSSION')),
    },
    ...OTHER_SIZES.map((n) => ({
        id: `바-03-${String(n).padStart(2, '0')}`,
        where: ROW03.where ?? 'PC',
        how: `${ROW03.how ?? '1280×800 창에서 5·6·7·9·10명 판'} — 이 장면은 ${n}명 판`,
        look: ROW03.look ?? null,
        async prepare(s) {
            await k.seatSize(s, n);
            s.note(`${n}명 판 (사람 1 + 봇 ${n - 1}, 직업 자동) — 판 시작은 보여 줄 때, 1일 낮 토론까지 감`);
            s.note('맨 위 "나" 카드 이름판이 가운데 채팅 창에 안 가려지는지 봄');
        },
        async show(s) { await k.startSize(s); },
        showTimeoutMs: 90_000,
        still: k.at(k.isDay(1, 'DAY_DISCUSSION')),
    })),
    {
        id: '바-04',
        chain: '바-판2',
        async prepare(s) {
            // 처음 오면 앉히기만 (판 시작은 보여 줄 때 → 미리 준비 동안 토론 시간이 안 흐름)
            if (!s.state.table) await k.seatPlan(s, 'big');
            else { await k.table(s, 'big'); await scene04(s); }
            s.note('9명 판: 큰 창 = 나(광대), 작은 창 = 귀족·경비원, 봇 6(광대 동료·의사·귀족 4) — 바-14까지 이 판을 이어 봄');
            s.note('1일 낮 토론에 사람 셋·봇 셋이 채팅함 → 큰 창은 판 채팅, 귀족 창은 "채팅 크게 보기"');
            s.note('이름만 그 사람 색 + 띠, 말은 짙은 갈색인지 봄. 재판 창 채팅은 바-10에서 봄. 죽은 사람 줄(회색 이름)은 산 사람 화면엔 안 와서 이 판에선 못 봄');
        },
        async show(s) {
            if (s.state.table) return;
            await k.startPlan(s);
            await scene04(s);
        },
        showTimeoutMs: 120_000,
        still: k.at(k.isDay(1, 'DAY_DISCUSSION')),
    },
    {
        id: '바-05',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'night1');
            s.note('1일 재판(봇 피고)에서 사람 셋이 "무죄"를 누른 뒤 무죄로 끝나 1일 밤');
            s.note('작은 창 "귀족" = 채팅 입력칸 자리에 "밤에는 귀족이 채팅을 쓸 수 없습니다" (닫힘), 큰 창(광대) = 광대끼리 밤 채팅이 열려 있고 광대 동료 봇 글이 보임');
        },
        still: k.at(k.isNight(1)),
    },
    {
        id: '바-06',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'day2');
            const { me, citizens } = s.state.cast;
            await k.K5.openMenu(me.page, k.nick(citizens[0]));
            s.note('2일 낮 토론 — 큰 창에서 봇 카드 하나를 눌러 행동 메뉴를 열어 둠: 잠긴 투표 칸에 "토론 중입니다. 투표는 아직 열리지 않았습니다." 글이 보여야 함');
        },
        still: k.at(k.isDay(2, 'DAY_DISCUSSION')),
    },
    {
        id: '바-07',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'vote2');
            await k.openStatus(s.state.cast.me.page);
            s.note('2일 낮 투표 — 큰 창에 "투표 현황" 창을 열어 둠. 투표 중엔 "집계 전"만 보임 (화면 코드가 판정 뒤에만 칸을 그림)');
            s.note('"투표 가능"(값 9 = 산 사람 수)·"기권" 칸은 투표가 끝난 뒤 같은 창에 나옴 → 바-09에서 봄');
        },
        still: k.at(k.isDay(2, 'DAY_VOTE')),
    },
    {
        id: '바-08',
        chain: '바-판2',
        settleMs: 700,
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'settle2');
            if (s.headless) return;
            s.note('2일 낮 투표 — 나 말고 8명이 다 냄 (봇 둘은 같은 봇, 나머지는 기권). 큰 창에서 아무 카드나 눌러 "투표하기"(또는 "기권")를 누름');
            s.note('누르면 5초 동안 "[5초 뒤 마감]" 글과 펼쳐진 시간 바가 보이고, "낮 집계" 같은 단추 없이 판정됨 (기권이 많아 재판 없이 밤 → 바-09)');
            s.note('놓쳤으면 again (처음부터 이 자리까지 다시, 1~2분)');
        },
        // 창 없는 모드는 사진을 찍으려고 도구가 마지막 표를 대신 냄 (나 → 봇 X)
        async show(s) {
            if (!s.headless) return;
            const { me, citizens } = s.state.cast;
            await k.day.voteUi(me.page, k.nick(citizens[0]));
            await k.settleShown(me.page);
            s.note('창 없는 모드: 도구가 나의 마지막 표를 냄 → "[5초 뒤 마감]"이 뜬 순간을 찍음');
        },
        still: k.at(k.isDay(2, 'DAY_VOTE')),
    },
    {
        id: '바-09',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'night2');
            await k.openStatus(s.state.cast.me.page);
            s.note('2일 투표 결과: 봇 X 2~3표 · 기권 6~7 → 재판 창 없이 2일 밤. 큰 창 "투표 현황"에 "기권이 많아 재판 없음", 재판 대상 "없음"');
        },
        still: k.at(k.isNight(2)),
    },
    {
        id: '바-10',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'tribunal3');
            s.note('3일 재판 (1일 재판에서 "무죄"를 누른 사람들, 2일은 기권이 많아 재판 없음) — 유죄·무죄 단추가 보이고 눌림');
            s.note('큰 창에서 "유죄"나 "무죄"를 눌러 봄 → 눌리고 그다음에 "투표가 완료되었습니다."가 뜸 (누르기 전부터 완료 글만 있으면 실패)');
            s.note('재판 창 채팅에 봇 둘의 글이 있음 → 바-04의 "재판 창" 칸(이름만 색 + 띠)도 여기서 봄');
        },
        still: k.at((g) => g.phase === 'TRIBUNAL' && g.dayIndex === 3),
    },
    {
        id: '바-11',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'night3');
            const { victim, cast } = s.state;
            s.note(`3일 밤: 큰 창(광대)이 화면으로 "${k.nick(victim)}" 암살, 의사 봇은 다른 사람 보호 — 지금 경비원 차례`);
            if (s.headless) s.note(`창 없는 모드: 도구가 경비원 창에서 "${k.nick(cast.ally)}" 조사를 누름 → 다 냈으니 "[5초 뒤 마감]"`);
            else s.note(`작은 창 "경비원"에서 "${k.nick(cast.ally)}" 카드를 눌러 "조사" → 5초 뒤 밤이 끝나고 4일 낮 영상이 나옴 (바-12)`);
            s.note('밤엔 영상이 없고 "진행을 기다리는 중입니다." 창이 없어야 함. 조사 결과 글은 낮이 될 때 경비원 창에만 뜸');
        },
        still: k.at(k.isNight(3)),
    },
    {
        id: '바-12',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'dawn4');
            s.note(`4일 낮이 시작됨: 모든 창에 암살 영상과 "지난밤 ${k.nick(s.state.victim)}님이 살해당했습니다" (영상이 안 틀어지면 같은 글 창)`);
            s.note('바-11에서 경비원이 조사했으면 영상 뒤 경비원 창에만 "밤 조사 결과"(광대 동료 = 광대) 창, 귀족 창엔 없음. 의사가 살리는 쪽 글은 이 판에선 안 나옴');
            s.note('영상은 한 번만 나옴 → 놓쳤으면 again');
        },
        still: async (s) => (await s.main.locator(k.DAWN_SHOW).count().catch(() => 0)) > 0,
    },
    {
        id: '바-13',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'day4');
            const { me } = s.state.cast;
            const palette = await k.openPalette(me.page, me.account.nickname);
            await palette.getByRole('button').first().click();
            await k.sleep(600);
            await k.openPalette(me.page, me.account.nickname);
            s.note('4일 낮 토론 — 큰 창 내 카드 우클릭 → 이모티콘 팔레트가 열림 (도구가 한 번 보내 말풍선을 띄우고 팔레트를 다시 열어 둠)');
            s.note('낮엔 나감. 밤(바-05·11 자리)과 역할 확인 10초(바-01 자리)엔 내 카드를 우클릭해도 팔레트가 안 열려야 함');
        },
        still: k.at(k.isDay(4, 'DAY_DISCUSSION')),
    },
    {
        id: '바-14',
        chain: '바-판2',
        async prepare(s) {
            await k.table(s, 'big');
            await k.reach(s, 'day4');
            const { page } = s.state.cast.me;
            if (await k.palette(page).isVisible().catch(() => false)) await page.keyboard.press('Escape');
            await expect(k.palette(page)).toBeHidden({ timeout: 5000 }).catch(() => {});
            await page.getByRole('button', { name: '인게임 설정', exact: true }).click();
            await expect(page.getByRole('dialog', { name: '인게임 설정', exact: true })).toBeVisible();
            s.note('판 중 톱니(인게임 설정) 창을 열어 둠 — 탭이 "채팅"·"사운드"뿐이고 "방관리" 탭이 없어야 함');
        },
        still: k.at(k.isDay(4, 'DAY_DISCUSSION')),
    },
];
