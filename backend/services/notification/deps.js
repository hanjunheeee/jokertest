'use strict';

// 알림 주입 파일, db·전송·id·시각 꺼내는 묶음 + 시험용 바꾸기
// 묶음은 다시 대입되므로 다른 파일은 getDeps()로 매번 읽음
const crypto = require('node:crypto');

// 시험 주입 먼저, 없으면 진짜 db·emitter (늦은 require라 load 순환 없음)
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../../repositories/common/db'); },
    get emitToUser() {
        if (overrides.emitToUser) return overrides.emitToUser;
        try {
            return require('../../socket/emitter').emitToUser;
        } catch {
            return null;
        }
    },
    get newId() { return overrides.newId ?? (() => crypto.randomUUID()); },
    get now() { return overrides.now ?? (() => new Date()); },
});

// 지금 쓰는 주입 묶음
let deps = buildDeps();

// 시험용: 주입 묶음 통째로 바꾸기
const __internal = {
    __setDepsForTests(overrides) {
        deps = buildDeps(overrides ?? {});
    },
};

// 지금 주입 묶음 꺼내기 (시험이 바꿔 끼운 뒤에도 새 묶음 보이게)
const getDeps = () => deps;

module.exports = {
    __internal,
    getDeps,
};
