'use strict';

// 금지어 넣고 빼기 파일, 시험 DB banned_words 표에 넣거나 지운 뒤 서버에 다시 읽게 함
// tests/ingame 채팅 시험 도우미(a-day·c-chat _lib.js)가 씀 — 낱말은 시험마다 무작위로 (다른 시험 채팅에 안 걸리게)
const db = require('./db');
const { internal } = require('./internal');

async function addBannedWords(words) {
    for (const w of words) {
        await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [w]);
    }
    await internal.reloadBannedWords();
}

async function removeBannedWords(words) {
    for (const w of words) await db.query('DELETE FROM banned_words WHERE word = ?', [w]);
    await internal.reloadBannedWords();
}

module.exports = { addBannedWords, removeBannedWords };
