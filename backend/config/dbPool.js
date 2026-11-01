'use strict';

// DB 연결 풀 설정 파일, 기본 풀 크기 + config.json·환경 변수(DB_POOL_*)로 덮어쓰기
// models/index.js가 Sequelize 만들 때 부름

// 아무 설정 없을 때 풀 (최대 10개, 놀면 10초 뒤 닫음, 30초 안에 못 얻으면 오류)
const DEFAULT_POOL = Object.freeze({
    max: 10,
    min: 0,
    idle: 10000,
    acquire: 30000,
});

// 풀 칸마다 덮어쓸 환경 변수 이름
const ENV_KEYS = Object.freeze({
    max: 'DB_POOL_MAX',
    min: 'DB_POOL_MIN',
    idle: 'DB_POOL_IDLE',
    acquire: 'DB_POOL_ACQUIRE',
});

// 문자·숫자로 온 값을 정수로, 비었거나 정수 아니거나 너무 작으면 undefined (min만 0 허용)
const parsePoolInteger = (raw, { allowZero = false } = {}) => {
    if ((typeof raw !== 'string' && typeof raw !== 'number') || String(raw).trim() === '') {
        return undefined;
    }

    const value = Number(raw);
    const minimum = allowZero ? 0 : 1;
    return Number.isInteger(value) && value >= minimum ? value : undefined;
};

// 칸마다 기본값 → config 값 → 환경 변수 순으로 덮음 (틀린 값은 건너뜀)
const buildPoolConfig = (configPool = {}, env = process.env) => {
    const pool = {};

    for (const key of Object.keys(DEFAULT_POOL)) {
        const options = { allowZero: key === 'min' };
        pool[key] = parsePoolInteger(configPool[key], options) ?? DEFAULT_POOL[key];

        const override = parsePoolInteger(env[ENV_KEYS[key]], options);
        if (override !== undefined) pool[key] = override;
    }

    // 최소가 최대보다 크면 최소만 기본값으로 (풀 만들기가 안 터지게)
    if (pool.min > pool.max) pool.min = DEFAULT_POOL.min;

    return pool;
};

module.exports = { DEFAULT_POOL, buildPoolConfig };
