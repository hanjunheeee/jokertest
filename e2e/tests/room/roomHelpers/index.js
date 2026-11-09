'use strict';

// 방·결과 시험 공용 도구 모음 파일, 설정 화면(setupScreen.js)·대기방과 방 목록(waitingRoom.js)·판 끝내기와 결과(result.js)를 한 이름으로
// tests/room·tests/result 시험이 require('./roomHelpers')로 씀, 친구 맺기는 helpers/friends.js 것 그대로
const { sleep } = require('../../../helpers/wait');
const { makeFriends } = require('../../../helpers/friends');
const {
    openSetup, stepperRow, stepperValue, setStepper, setChoice, setCheck, selectTab, fillSettings, waitRoom, createRoomUi, ROLE_LABEL,
} = require('./setupScreen');
const {
    expectPartyCount, readySilhouettes, blockedDialog, botsJoinAndReady, hostGame, botUpdateSettings, findRoomRow, openRoomList,
} = require('./waitingRoom');
const { finishGame, waitResult, closeReveals, playToResult, resultRow } = require('./result');

module.exports = {
    sleep, openSetup, stepperRow, stepperValue, setStepper, setChoice, setCheck, selectTab, fillSettings, waitRoom, createRoomUi,
    expectPartyCount, readySilhouettes, blockedDialog, botsJoinAndReady, hostGame, finishGame, waitResult, closeReveals,
    playToResult, resultRow, findRoomRow, openRoomList, makeFriends, ROLE_LABEL, botUpdateSettings,
};
