'use strict';

const DEFAULT_POOL = Object.freeze({
    max: 10,
    min: 0,
    idle: 10000,
    acquire: 30000,
});

const ENV_KEYS = Object.freeze({
    max: 'DB_POOL_MAX',
    min: 'DB_POOL_MIN',
    idle: 'DB_POOL_IDLE',
    acquire: 'DB_POOL_ACQUIRE',
});

const parsePoolInteger = (raw, { allowZero = false } = {}) => {
    if ((typeof raw !== 'string' && typeof raw !== 'number') || String(raw).trim() === '') {
        return undefined;
    }

    const value = Number(raw);
    const minimum = allowZero ? 0 : 1;
    return Number.isInteger(value) && value >= minimum ? value : undefined;
};

const buildPoolConfig = (configPool = {}, env = process.env) => {
    const pool = {};

    for (const key of Object.keys(DEFAULT_POOL)) {
        const options = { allowZero: key === 'min' };
        pool[key] = parsePoolInteger(configPool[key], options) ?? DEFAULT_POOL[key];

        const override = parsePoolInteger(env[ENV_KEYS[key]], options);
        if (override !== undefined) pool[key] = override;
    }

    // Sequelize requires min <= max. When conflicting inputs are supplied, keep the
    // requested max and fall back to the safe default min rather than creating an
    // invalid pool that fails later and obscures the configuration error.
    if (pool.min > pool.max) pool.min = DEFAULT_POOL.min;

    return pool;
};

module.exports = { DEFAULT_POOL, buildPoolConfig };
