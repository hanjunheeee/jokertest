'use strict';

// 업적 시험 손잡이 파일, 판정·지급 함수 + 주입 묶음 바꾸기
// 업적 입구(index.js)가 __internal로 내보냄, 시험만 씀
const { meetsThreshold, currentValueOf } = require('./progress');
const { grantAchievement } = require('./grant');
const { setDeps, buildDeps } = require('./deps');

// 시험용 묶음 (주입 바꾸기에 null 주면 진짜 묶음으로 되돌림)
const __internal = {
    meetsThreshold,
    currentValueOf,
    grantAchievement,
    __setDepsForTests(overrides) {
        setDeps(buildDeps(overrides ?? {}));
    },
};

module.exports = {
    __internal,
};
