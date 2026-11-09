'use strict';

// 관리자 신고 시험 준비 파일, 게임 신고 접수와 같은 모양으로 신고 줄 + 채팅 증거 줄을 시험 DB에 넣음
// tests/admin/reports.spec.js·phone/reports.spec.js가 씀 (계정은 실행 끝에 지워지고 신고 줄도 같이 지움)
const crypto = require('node:crypto');
const { query } = require('../../helpers/db');

/** 신고 하나 넣기 → 신고 id (text 있으면 대상이 쓴 낮 채팅 한 줄을 증거로) */
async function makeReport({ reporter, target, text }) {
    const gameId = crypto.randomUUID();
    await query(
        "INSERT INTO reports (reporter_id, target_id, game_id, reason_code, memo, status, created_at) VALUES (?, ?, ?, 'ABUSE', '욕함', 'OPEN', NOW())",
        [reporter.uuid, target.uuid, gameId],
    );
    const [{ id }] = await query('SELECT id FROM reports WHERE reporter_id = ? AND game_id = ?', [reporter.uuid, gameId]);
    if (text) {
        const messages = [{ at: new Date().toISOString(), channel: 'DAY', senderUuid: target.uuid, nickname: target.nickname, text }];
        await query('INSERT INTO report_chat_evidence (report_id, game_id, messages, saved_at) VALUES (?, ?, ?, NOW())', [id, gameId, JSON.stringify(messages)]);
    }
    return Number(id);
}

module.exports = { makeReport };
