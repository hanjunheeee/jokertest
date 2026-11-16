'use strict';

// 점검 켜고 끄기 파일, 시험 DB 점검 줄(maintenance_state id 1)을 고치고 서버가 다시 읽게 함
// 점검은 서버 전체에 걸림 → 이름에 @serial 붙인 시험만 씀, finally에서 꼭 clearMaintenance (안 끄면 다른 시험 방 만들기가 막힘)
const db = require('./db');
const { internal } = require('./internal');

/**
 * 점검 줄만 고침 (다시 읽기 안 함 — 서버를 다시 켜서 켤 때 읽는지 보는 시험용)
 * startsInMs: null = 시작 시각 없음(바로 점검 중, 도는 판·대기방은 안 닫고 새 판만 막음) / 0 이하 = 이미 지난 시각 / 양수 = 그만큼 뒤 예고
 * 시작 시각은 초 단위로 올림 (DB 시각 칸이 소수 초를 버려서 진짜 시간 확인이 어긋나지 않게), 끝 시각은 시작(또는 지금) + endsInMs
 * @param {{ enabled:boolean, startsInMs?:number|null, message?:string|null, endsInMs?:number }} o
 * @returns {Promise<{ startsAtMs:number|null, endsAtMs:number|null }>}
 * @example await writeMaintenance({ enabled: true })                       // 시작 시각 없이 켬
 * @example await writeMaintenance({ enabled: true, startsInMs: 60_000 })   // 1분 뒤 시작 예고
 */
async function writeMaintenance({ enabled, startsInMs = null, message = null, endsInMs = 3600e3 }) {
    const now = Date.now();
    const startsAtMs = enabled && startsInMs !== null ? Math.ceil((now + startsInMs) / 1000) * 1000 : null;
    const endsAtMs = enabled ? Math.max(startsAtMs ?? now, now) + endsInMs : null;
    await db.query(
        'UPDATE maintenance_state SET is_enabled = ?, message = ?, starts_at = ?, ends_at = ?, updated_at = NOW() WHERE id = 1',
        [enabled ? 1 : 0, enabled ? message : null, startsAtMs === null ? null : db.sqlTime(startsAtMs), endsAtMs === null ? null : db.sqlTime(endsAtMs)],
    );
    return { startsAtMs, endsAtMs };
}

/** 점검 줄 고치고 Node마다 다시 읽기 (서버가 접속자에게 maintenance_notice 보냄) → { startsAtMs, endsAtMs } */
async function setMaintenance(o) {
    const written = await writeMaintenance(o);
    await internal.reloadMaintenance();
    return written;
}

/** 점검 끄기 (finally에서 꼭) */
const clearMaintenance = () => setMaintenance({ enabled: false });

module.exports = { writeMaintenance, setMaintenance, clearMaintenance };
