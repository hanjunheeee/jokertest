'use strict';

// 판 설정 값 관리 서비스 파일, 보기 · 판 골드 바꾸기(기록 같은 트랜잭션) + 바꾼 뒤 Node 전부 다시 읽기
// gameSettings.controller.js가 부름, 바꾸기 결과에 Node별 반영 결과(nodes·partial)를 같이 돌려줌
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const queryQueue = require('../core/queryQueue');
const { reloadEverywhere } = require('../../../services/ops/reloadSync');
const gameSettingsRepository = require('../../../repositories/gameSettings');
const { SETTING_KEYS } = require('../../../db/migrations/0034-add-game-settings');
// 게임 서버 판 설정 값을 다시 읽기 대상으로 등록해 둠 (불러오기만 해도 등록됨)
const gameSettingsService = require('../../../services/ops/gameSettings');

const defaultDb = () => require('../../../repositories/common/db');
const defaultReload = () => reloadEverywhere(gameSettingsService.RELOAD_NAME);

const isoOf = (value) => (value ? new Date(value).toISOString() : null);

const LIMITS = Object.freeze({
    goldReward: Object.freeze({ min: gameSettingsService.GOLD_REWARD_MIN, max: gameSettingsService.GOLD_REWARD_MAX }),
});

// 표 줄 → 화면 모양 (줄 없으면 처음 값)
// 예: { key:'GAME_GOLD_REWARD', value_int:2, updated_at:…, updated_by:'a1' } → { goldReward:2, updatedAt:'…', updatedBy:'a1' }
const toSettings = (row) => {
    const get = (key) => (row && typeof row.get === 'function' ? row.get(key) : row?.[key]);
    return {
        goldReward: row ? Number(get('value_int')) : gameSettingsService.DEFAULT_GOLD_REWARD,
        updatedAt: isoOf(get('updated_at')),
        updatedBy: get('updated_by') ?? null,
    };
};

const findGoldRow = (rows) => rows.find((row) => (typeof row.get === 'function' ? row.get('key') : row.key) === SETTING_KEYS.GAME_GOLD_REWARD);

const isValidGoldReward = (value) => gameSettingsService.isValidGoldReward(value);

// 보기: DB 값 + 이 Node가 들고 있는 값 (관리자가 볼 때만 DB 읽음)
const getGameSettings = async ({ db = defaultDb() } = {}) => {
    const rows = await queryQueue.run(() => gameSettingsRepository.findAllSettings(db));
    return { settings: toSettings(findGoldRow(rows)), limits: LIMITS, node: gameSettingsService.getGameSettingsState() };
};

// 판 골드 바꾸기 → { settings, limits, nodes, partial } (기록은 같은 트랜잭션, 다시 읽기는 저장이 끝난 뒤 → 다른 Node가 새 값을 봄)
// 이미 시작한 판은 시작 때 값 그대로, 바꾼 뒤 시작하는 판부터 새 값
const updateGameSettings = async ({ req, goldReward }, { db = defaultDb(), reload = defaultReload, now = new Date() } = {}) => {
    const saved = await db.sequelize.transaction(async (transaction) => {
        const key = SETTING_KEYS.GAME_GOLD_REWARD;
        const row = await gameSettingsRepository.lockSetting(db, key, transaction);
        const before = row ? toSettings(row) : null;
        const changes = { value_int: goldReward, updated_at: now, updated_by: req.admin.id };
        if (row) await gameSettingsRepository.saveSetting(row, changes, transaction);
        else await gameSettingsRepository.createSetting(db, { key, ...changes }, transaction);
        const after = toSettings({ key, ...changes });
        await audit.record({
            req, action: AUDIT_ACTIONS.GAME_SETTING_UPDATE, targetType: 'game_setting', targetId: key,
            before: before ? { goldReward: before.goldReward } : null, after: { goldReward: after.goldReward },
        }, { transaction, db });
        return after;
    });
    const { nodes, partial } = await reload();
    return { settings: saved, limits: LIMITS, nodes, partial };
};

module.exports = { getGameSettings, updateGameSettings, isValidGoldReward, LIMITS };
