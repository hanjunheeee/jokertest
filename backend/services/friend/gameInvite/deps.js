'use strict';

// 게임 초대 주입 파일, db·전송·id·시각 묶음 + matchmaking이 넣는 방 접근자
// 둘 다 다시 대입되므로 다른 파일은 getDeps()·getRoomAccess()로 매번 읽음
const crypto = require('node:crypto');
const { NO_ROOM_ACCESS } = require('./constants');

// 시험 주입 먼저, 없으면 진짜 db·emitter (늦은 require라 load 순환 없음)
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../../../models'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
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

// matchmaking이 방 상태 읽는 함수 묶음 넣기 (없으면 기본값)
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

// 지금 방 접근자 꺼내기 (matchmaking이 load 때 넣은 것)
const getRoomAccess = () => roomAccess;

module.exports = {
    __setRoomAccessForRuntime,
    __internal,
    getDeps,
    getRoomAccess,
};
