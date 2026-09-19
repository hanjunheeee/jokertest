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
 *
 * F-24(AC-02): 대기방 Map만으로는 부족하다 — 게임이 시작되면 그 방은 gameRooms에서 사라지지만
 * 코드 자체는 아직 살아 있다(진행 중 화면이 그 코드를 보여주고, 그 코드로 들어오려는 요청에
 * "이미 시작됨"을 답해야 한다). 그래서 대기방 밖의 예약을 판정하는 콜백을 받는다 —
 * 진행/종료 세션 registry와 유효한 시작 표식이 호출부에서 그 콜백으로 합쳐진다(A-09).
 *
 * isReserved는 **기존 동작을 바꾸지 않는 선택 인자**다. 주지 않으면 예전처럼 대기방 Map만
 * 비교한다(기존 호출부·시험의 계약 그대로).
 *
 * @param {Map<string, {code:string}>} existingRoomsMap - roomId → room 형태의 Map(gameRooms)
 * @param {{retry?: number, generator?: () => string, isReserved?: (code:string) => boolean}} [options]
 * @returns {string|null} 충돌 없는 코드. retry 횟수 내에 찾지 못하면 null
 */
function generateUniqueRoomCode(existingRoomsMap, { retry = 5, generator = generateRoomCode, isReserved } = {}) {
    for (let attempt = 0; attempt < retry; attempt += 1) {
        const code = generator()
        // 6자리 코드 공간은 유한해 이미 활성 중인 방과 우연히 같은 코드가 나올 수 있다.
        // 매 시도마다 최신 gameRooms를 기준으로 다시 비교해야 그 사이 새로 생긴 방과도 겹치지 않는다.
        const taken = [...existingRoomsMap.values()].some((room) => room.code === code)
        if (taken) continue
        // 예약 판정이 던지더라도 같은 코드를 내주지는 않는다 — 판정할 수 없으면 "예약됐다"로
        // 본다(fail-closed). 두 방이 같은 코드를 갖는 쪽보다 한 번 더 뽑는 쪽이 안전하다.
        if (typeof isReserved === 'function') {
            let reserved = true
            try {
                reserved = isReserved(code) === true
            } catch (err) {
                console.error('[방 코드 예약 판정 실패]', err)
            }
            if (reserved) continue
        }
        return code
    }
    // 재시도 상한이 없으면 코드 생성기 자체에 문제가 생겼을 때 무한 루프에 빠질 수 있어 상한을 둔다.
    return null
}

module.exports = { generateRoomCode, generateUniqueRoomCode }
