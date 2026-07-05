/**
 * @file roomCode.js
 * @desc 게임 방 초대 코드 생성 유틸리티
 */

const crypto = require('crypto')

// 오인 방지 문자(I, O, 0, 1)를 제외한 집합
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * 오인 방지 문자를 제외한 6자리 랜덤 방 코드를 생성합니다.
 * @returns {string} 6자리 방 초대 코드 (예: "A3K9PZ")
 */
function generateRoomCode() {
    let code = ''
    const bytes = crypto.randomBytes(6)
    for (const byte of bytes) {
        code += CHARS[byte % CHARS.length]
    }
    return code
}

module.exports = { generateRoomCode }
