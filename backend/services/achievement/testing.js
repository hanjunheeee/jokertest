'use strict';

// 업적 시험 손잡이 파일
// 시험이 판정 함수 바로 부르고 주입 묶음 바꿈
const { meetsThreshold, currentValueOf } = require('./progress');
const { grantAchievement } = require('./grant');
const { setDeps, buildDeps } = require('./deps');

// 시험용: 판정 함수 + 주입 묶음 바꾸기
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
