'use strict';

// 마 묶음 장면 (대기방, 방장 + 손님) — 지금은 증명용 마-03 하나, 마 묶음 맡은 사람이 이어 씀
// run.js가 읽음 — 방 만들기는 e2e 방 시험 도우미(createRoomUi) 그대로
const { fromE2e, e2eRequire } = require('../lib/paths');

const { expect } = e2eRequire('@playwright/test');
const { createRoomUi } = fromE2e('tests/room/roomHelpers/setupScreen');

module.exports = [
    {
        id: '마-03',
        async prepare(s) {
            const me = await s.person();
            await createRoomUi(me, { maxPlayers: 8 });
            await expect(me.page.getByRole('button', { name: '게임시작' })).toBeDisabled();
            s.note('정원 8로 방을 만들어 혼자 대기방에 있음');
        },
    },
];
