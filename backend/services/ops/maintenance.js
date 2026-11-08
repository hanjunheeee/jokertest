'use strict';

// 점검 모드 파일, DB 점검 한 줄을 메모리에 들고 있다가 방 만들기·시작·코드 입장 거절할지 답함
// index.js 시작 때 한 번·내부 API reload 때 다시 읽음, socket/matchmaking.js가 거절 여부 물음 (진행 중 판은 안 건드림)

const MAINTENANCE_CODE = 'MAINTENANCE';
const DEFAULT_MESSAGE = '서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요.';
const ROW_ID = 1;

// 지금 들고 있는 점검 상태 (읽기 전엔 꺼짐)
let state = Object.freeze({ enabled: false, message: null, startsAt: null, endsAt: null, loadedAt: null });

const defaultDb = () => require('../../repositories/common/db');

const toDateOrNull = (value) => {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

// DB 줄 → 메모리 모양 (줄 없으면 꺼짐)
const fromRow = (row, now) => {
    const plain = row && typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return Object.freeze({
        enabled: plain ? plain.is_enabled === true || plain.is_enabled === 1 : false,
        message: plain && typeof plain.message === 'string' && plain.message.trim() ? plain.message.trim() : null,
        startsAt: toDateOrNull(plain?.starts_at),
        endsAt: toDateOrNull(plain?.ends_at),
        loadedAt: now,
    });
};

// DB에서 다시 읽기, 실패하면 있던 상태 그대로 두고 던짐 (읽기 실패로 점검이 풀리거나 걸리지 않게)
const reloadMaintenance = async ({ db = defaultDb(), now = () => new Date() } = {}) => {
    const row = await db.MaintenanceState.findOne({ where: { id: ROW_ID } });
    state = fromRow(row, now());
    return getMaintenanceState();
};

// 점검 중인지: 켜짐 + 시작 시각이 없거나 지남 (끝 예정은 안내용, 자동으로 안 꺼짐)
const isMaintenanceActive = (now = new Date()) => {
    if (!state.enabled) return false;
    if (state.startsAt && state.startsAt.getTime() > now.getTime()) return false;
    return true;
};

// 거절 답 모양 (점검 아니면 null)
const maintenanceRejection = (now = new Date()) => {
    if (!isMaintenanceActive(now)) return null;
    return {
        ok: false,
        code: MAINTENANCE_CODE,
        message: state.message ?? DEFAULT_MESSAGE,
        endsAt: state.endsAt ? state.endsAt.toISOString() : null,
    };
};

// 공개 모양 (내부 API 응답용)
const getMaintenanceState = (now = new Date()) => ({
    enabled: state.enabled,
    active: isMaintenanceActive(now),
    message: state.message,
    startsAt: state.startsAt ? state.startsAt.toISOString() : null,
    endsAt: state.endsAt ? state.endsAt.toISOString() : null,
});

// 시험용: 상태 바로 넣기·비우기
const __setStateForTests = (next = {}) => {
    state = fromRow({
        is_enabled: next.enabled === true,
        message: next.message ?? null,
        starts_at: next.startsAt ?? null,
        ends_at: next.endsAt ?? null,
    }, new Date());
};

module.exports = {
    MAINTENANCE_CODE,
    DEFAULT_MESSAGE,
    reloadMaintenance,
    isMaintenanceActive,
    maintenanceRejection,
    getMaintenanceState,
    __setStateForTests,
};
