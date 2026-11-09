'use strict';

// 밤·직업·승패 시험(인게임 B) 공용 도구 모음 파일, 판 차리기(table.js)·카드와 안내 창(cards.js)·화면 글자와 기록(screen.js)을 한 이름으로
// b-night 폴더 시험들이 require('./_night')로 씀 — 어느 함수가 어느 파일인지 아래 목록에 적음
const { sleep } = require('../../../../helpers/wait');
const {
    custom, roles, setup, advanceUntilSettled, toTurn, toNight, toDay, toEnd, advanceToEnd,
    turnOrder, eventsOf, waitDead, rowOf, aliveCount, botNight, publicWinResult,
} = require('./table');
const {
    cardButton, cardStatus, expectCard, closeNotices, closeFinalStatus, closeRoleReveal, keepWatching,
    openCardMenu, expectNoCardMenu, nightActUi, skipButton, nightSkipUi,
} = require('./cards');
const { ACTION_LABELS, TURN_MESSAGES, TURN_TAGS, ROLE_NAMES, josa, recordUi, readUi, reachResult, mvpPanel } = require('./screen');

module.exports = {
    ACTION_LABELS, TURN_MESSAGES, TURN_TAGS, ROLE_NAMES, josa, sleep, custom, roles, setup, advanceUntilSettled, toTurn, toNight, toDay, toEnd, turnOrder, eventsOf,
    cardButton, cardStatus, expectCard, closeNotices, closeFinalStatus, closeRoleReveal, keepWatching, openCardMenu, expectNoCardMenu,
    nightActUi, skipButton, nightSkipUi, recordUi, readUi, waitDead, rowOf, aliveCount, reachResult, mvpPanel, botNight,
    advanceToEnd, publicWinResult,
};
