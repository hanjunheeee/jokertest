const crypto = require('crypto')

// 오인 방지 문자(I, O, 0, 1)를 제외한 집합
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomCode() {
    let code = ''
    const bytes = crypto.randomBytes(6)
    for (const byte of bytes) {
        code += CHARS[byte % CHARS.length]
    }
    return code
}

/**
 * 현재 활성 중인 방들과 충돌하지 않는 방 코드를 생성합니다.
 * @param {Map<string, {code:string}>} existingRoomsMap - roomId → room 형태의 Map(gameRooms)
 * @param {{retry?: number, generator?: () => string}} [options]
 * @returns {string|null} 충돌 없는 코드. retry 횟수 내에 찾지 못하면 null
 */
function generateUniqueRoomCode(existingRoomsMap, { retry = 5, generator = generateRoomCode } = {}) {
    for (let attempt = 0; attempt < retry; attempt += 1) {
        const code = generator()
        // 6자리 코드 공간은 유한해 이미 활성 중인 방과 우연히 같은 코드가 나올 수 있다.
        // 매 시도마다 최신 gameRooms를 기준으로 다시 비교해야 그 사이 새로 생긴 방과도 겹치지 않는다.
        const taken = [...existingRoomsMap.values()].some((room) => room.code === code)
        if (!taken) return code
    }
    // 재시도 상한이 없으면 코드 생성기 자체에 문제가 생겼을 때 무한 루프에 빠질 수 있어 상한을 둔다.
    return null
}

module.exports = { generateRoomCode, generateUniqueRoomCode }
