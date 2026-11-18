'use strict';

// 자 묶음 장면 (화면 전체 훑기, 안 보이던 글 101곳) 1줄 — 모든 화면을 돌며 사람 눈으로 보는 줄이라 손으로
// run.js가 읽음 — 갈 수 있는 데까지만 준비: PC 상점 "스킨" 분류·상품 하나 고른 화면 (기준 4.5를 아직 못 넘긴 곳 둘이 여기 있음)
const { fromE2e } = require('../lib/paths');

const st = fromE2e('tests/store/store-tools');

module.exports = [
    {
        id: '자-01',
        manual: '가~아 묶음의 모든 화면(PC·폰)을 열 때 같이 보는 줄이라 한 장면으로 데려갈 수 없음',
        async prepare(s) {
            const me = await s.person({ label: '나' });
            // 상점 고른 칸 가격·분류 "스킨" (e2e 상점 시험과 같은 상품 칸)
            await st.gotoStore(me.page);
            await st.pickCategory(me.page, '스킨');
            await st.pickItem(me.page, '귀족 블러드 500');
            s.note('지금 창: PC 상점 "스킨" 분류 + 상품 하나 고름 → 고른 칸 가격·분류 "스킨" 글이 읽히는지');
            s.note('나머지 기준 미달 자리: 서고 보상 "×30"(로비 "기억의 서고") · 진행 막대 "n일차"(바 묶음 판 화면) · 채팅 입력과 어두운 칸 글(바 묶음) · 모바일 설정 줄(나 묶음 폰 화면)');
            s.note('그 밖 화면은 가~아 장면을 볼 때 흐리거나 안 보이는 글이 없는지 같이 봄');
        },
    },
];
