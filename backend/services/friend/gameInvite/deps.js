'use strict';

// 게임 초대 주입 파일, db·전송·id·시각 묶음 + socket/matchmaking.js가 넣는 방 접근자
// 초대 안 파일들이 getDeps()·getRoomAccess()로 매번 읽음 (둘 다 다시 대입되기 때문)
const crypto = require('node:crypto');
const { NO_ROOM_ACCESS } = require('./constants');

// 시험 주입 먼저, 없으면 진짜 db·emitter (늦은 require라 불러오기 순환 없음)
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../../../repositories/common/db'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
        // emitter 못 불러오면 null (전송 쪽이 함수인지 보고 건너뜀)
        try {
            return require('../../../socket/emitter').emitToUser;
        } catch {
            return null;
        }
    },
    get newId() { return overrides.newId ?? (() => crypto.randomUUID()); },
    get now() { return overrides.now ?? (() => new Date()); },
});

// 지금 쓰는 주입 묶음
let deps = buildDeps();

// 지금 방 접근자 (matchmaking이 넣기 전엔 방 없음)
let roomAccess = NO_ROOM_ACCESS;

// socket/matchmaking.js가 불러올 때 방 읽는 함수 묶음 넣음 (null이면 기본값)
function __setRoomAccessForRuntime(access) {
    roomAccess = access ?? NO_ROOM_ACCESS;
}

// 시험용: 주입 묶음 바꾸기 · 방 접근자 보기
const __internal = {
    __setDepsForTests(overrides) { deps = buildDeps(overrides ?? {}); },
    __getRoomAccess() { return roomAccess; },
};

// 지금 주입 묶음 꺼내기 (시험이 바꿔 끼운 뒤에도 새 묶음 보이게)
const getDeps = () => deps;

// 지금 방 접근자 꺼내기 (matchmaking이 불러올 때 넣은 것)
const getRoomAccess = () => roomAccess;

module.exports = {
    __setRoomAccessForRuntime,
    __internal,
    getDeps,
    getRoomAccess,
};
