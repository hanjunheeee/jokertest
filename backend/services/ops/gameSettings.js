'use strict';

// 판 설정 값 파일, game_settings 값(판마다 주는 골드)을 메모리에 들고 판 시작이 읽음 (판마다·사람마다 DB 안 부름)
// 판 시작(socket/matchmaking/room/startLaunch.js)이 읽고, 관리자 저장 뒤·다른 Node 방송·60초 안전망 때 다시 읽음 (reloadSync.js)
const gameSettingsRepository = require('../../repositories/gameSettings');
const { SETTING_KEYS, SEED_ROWS } = require('../../db/migrations/0034-add-game-settings');

// 판 골드 범위 (관리자 입력 검사도 같은 값)
const GOLD_REWARD_MIN = 0;
const GOLD_REWARD_MAX = 100;

// 처음 값 = 마이그레이션이 넣는 값 (읽기 전·줄 없을 때)
const DEFAULT_GOLD_REWARD = SEED_ROWS.find((row) => row.key === SETTING_KEYS.GAME_GOLD_REWARD)?.valueInt ?? 1;

// 처음 읽기 실패하면 이만큼 뒤에 다시 (판 시작마다 DB 두드리지 않게)
const RETRY_AFTER_FAIL_MS = 60_000;

const RELOAD_NAME = 'gameSettings';

const defaultDb = () => require('../../repositories/common/db');

// 지금 들고 있는 값 + 읽은 시각 (읽기 전엔 처음 값)
let goldReward = DEFAULT_GOLD_REWARD;
let loadedAt = null;
let loading = null;
let lastFailedAt = 0;

// 0~100 정수인지
const isValidGoldReward = (value) => Number.isInteger(value) && value >= GOLD_REWARD_MIN && value <= GOLD_REWARD_MAX;

// DB에서 다시 읽기 (실패하면 있던 값 그대로 두고 던짐), 범위 밖 값이 들어 있으면 있던 값 유지
const reloadGameSettings = async ({ db = defaultDb(), now = () => new Date() } = {}) => {
    const rows = await gameSettingsRepository.findAllSettings(db);
    const get = (row, key) => (typeof row.get === 'function' ? row.get(key) : row[key]);
    const goldRow = rows.find((row) => get(row, 'key') === SETTING_KEYS.GAME_GOLD_REWARD);
    const value = goldRow ? Number(get(goldRow, 'value_int')) : DEFAULT_GOLD_REWARD;
    if (isValidGoldReward(value)) goldReward = value;
    else console.warn('[판 설정 값] 판 골드 값이 범위 밖이라 있던 값 유지', { value });
    loadedAt = now();
    lastFailedAt = 0;
    return { goldReward };
};

// 아직 못 읽었으면 뒤에서 한 번 읽기 시작 (서버 켤 때 안 읽은 경우 대비, 기다리지 않음)
const kickFirstLoad = () => {
    if (loadedAt || loading) return;
    if (lastFailedAt && Date.now() - lastFailedAt < RETRY_AFTER_FAIL_MS) return;
    loading = Promise.resolve()
        .then(() => module.exports.reloadGameSettings())
        .catch((error) => {
            lastFailedAt = Date.now();
            console.warn('[판 설정 값] 못 읽음, 처음 값으로 씀 —', error?.name ?? 'Error');
        })
        .finally(() => { loading = null; });
};

// 판 하나 끝날 때 한 사람에게 줄 골드 (메모리 값만, 0이면 안 줌)
const getGameGoldReward = () => {
    kickFirstLoad();
    return goldReward;
};

// 관리자 화면에 보일 이 Node 값
const getGameSettingsState = () => ({ goldReward, loadedAt: loadedAt ? loadedAt.toISOString() : null });

// 시험용: 값 바로 넣기 (읽은 것으로 쳐서 DB 안 부름)
const __setGoldRewardForTests = (value = DEFAULT_GOLD_REWARD) => {
    goldReward = value;
    loadedAt = new Date();
    loading = null;
    lastFailedAt = 0;
};

// 다른 Node가 다시 읽었다는 방송·60초 안전망·Redis 살아남 때 다시 읽음 (내보낸 함수로 불러 시험 갈아끼우기 먹게)
require('./reloadSync').registerReloadable(RELOAD_NAME, () => module.exports.reloadGameSettings());

module.exports = {
    GOLD_REWARD_MIN,
    GOLD_REWARD_MAX,
    DEFAULT_GOLD_REWARD,
    RELOAD_NAME,
    isValidGoldReward,
    reloadGameSettings,
    getGameGoldReward,
    getGameSettingsState,
    __setGoldRewardForTests,
};
