'use strict';

// 게임 초대 공개 모양 파일, 초대 행 → 화면 모양 · 순번 비교
// 만들기·조회·취소·전송이 같이 씀

// 행 없으면 null, 보낸 사람 닉네임 붙임
const toPublicInvite = (row, senderNickname = null) => {
    if (row === null || row === undefined) return null;
    const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        inviteId: plain.id,
        senderId: plain.sender_id,
        senderName: senderNickname ?? plain.InviteSender?.nickname ?? null,
        receiverId: plain.receiver_id,
        status: plain.status,
        revision: plain.revision,
        creationSeq: String(plain.creation_seq),
        createdAt: plain.created_at,
        expiresAt: plain.expires_at,
        decidedAt: plain.decided_at ?? null,
        endReason: plain.end_reason ?? null,
        entryOutcome: plain.entry_outcome ?? null,
    };
};

// BIGINT 순번 문자열을 길이 먼저 비교 (숫자 범위 넘어도 맞게)
const compareSeq = (left, right) => {
    const a = String(left ?? '0').replace(/^0+(?=\d)/, '');
    const b = String(right ?? '0').replace(/^0+(?=\d)/, '');
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
};

module.exports = {
    toPublicInvite,
    compareSeq,
};
