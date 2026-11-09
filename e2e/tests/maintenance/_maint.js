'use strict';

// 점검 큰 안내 브라우저 시험 공통 파일, DB 점검 줄 고치고 Node마다 다시 읽기·화면 큰 안내/띠 고르개
// tests/maintenance·mobile·multinode의 점검 시험(AD-156~160)이 씀 (이름이 .spec이 아니라 시험으로 안 돎)
const db = require('../../helpers/db');

/**
 * 점검 예약·끄기 → 모든 Node 다시 읽기 (서버가 maintenance_notice 보냄)
 * @param {object} internal fixtures의 internal
 * @param {{ enabled: boolean, startsInMs?: number, message?: string }} o
 */
async function setMaintenance(internal, { enabled, startsInMs = 0, message = '시험 점검이에요' }) {
    const startsAt = enabled ? db.sqlTime(Date.now() + startsInMs) : null;
    const endsAt = enabled ? db.sqlTime(Date.now() + startsInMs + 3600e3) : null;
    await db.query(
        'UPDATE maintenance_state SET is_enabled = ?, message = ?, starts_at = ?, ends_at = ?, updated_at = NOW() WHERE id = 1',
        [enabled ? 1 : 0, enabled ? message : null, startsAt, endsAt],
    );
    await internal.reloadMaintenance();
}

/** 점검 끄기 (finally에서 꼭 부름 — 안 끄면 다른 시험 방 만들기가 막힘) */
const clearMaintenance = (internal) => setMaintenance(internal, { enabled: false });

// 화면 고르개
const notice = (page) => page.getByRole('alertdialog');
const band = (page) => page.locator('[data-maintenance-band]');

/** 큰 안내 "확인했어요"·"로비로 가기" (휴대폰은 그림 버튼이라 aria-label) */
const noticeButton = (page, name) => notice(page).getByRole('button', { name });

module.exports = { setMaintenance, clearMaintenance, notice, band, noticeButton };
