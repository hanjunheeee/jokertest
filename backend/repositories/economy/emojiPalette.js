'use strict';

// 이모티콘 팔레트 저장소 파일, 팔레트 행 보장 · 여러 명 읽기·넣기 · revision 맞을 때만 저장 · 잠가 읽기
// 팔레트 서비스(economy/emojiPalette.js)가 economyModels(db) 묶음을 넘겨 부름

// 팔레트 행 없으면 기본값으로 만듦 (트랜잭션 주면 그 안에서)
const ensurePalette = (models, { userId, defaults }, transaction = null) => models.EconomyEmojiPalette.findOrCreate({
    where: { user_id: userId },
    defaults,
    ...(transaction ? { transaction } : {}),
});

// 여러 사람 팔레트 행 한 번에 (없는 사람은 빠짐, 판 시작 때 사람마다 거래 열던 것 줄이기)
const listPalettes = (models, userIds) => models.EconomyEmojiPalette.findAll({ where: { user_id: userIds } });

// 여러 사람 기본 팔레트 행 한 문장으로 넣기, 이미 있는 사람은 건너뜀 (INSERT IGNORE, 넣은 뒤 다시 읽어 씀)
const insertMissingPalettes = (models, rows) => models.EconomyEmojiPalette.bulkCreate(rows, { ignoreDuplicates: true });

// revision이 화면이 본 값 그대로일 때만 바꿈 → [바뀐 줄 수] (0이면 그사이 다른 곳에서 바꿈)
const updatePaletteIfRevision = (models, { userId, expectedRevision, patch }, transaction) => models.EconomyEmojiPalette.update(patch, {
    where: { user_id: userId, revision: expectedRevision },
    transaction,
});

// 트랜잭션 안에서 팔레트 잠가 읽기 (충돌 때 지금 값 알려 주기)
const lockPalette = (models, userId, transaction) => models.EconomyEmojiPalette.findOne({
    where: { user_id: userId },
    transaction,
    lock: transaction.LOCK.UPDATE,
});

module.exports = {
    ensurePalette,
    listPalettes,
    insertMissingPalettes,
    updatePaletteIfRevision,
    lockPalette,
};
