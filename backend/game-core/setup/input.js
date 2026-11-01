// 판 입력 검사 파일
// 방 정보 검사 + 시간·설정 값 정리, 판 만들 때 사용
const { MIN_SUPPORTED_PLAYERS, MAX_SUPPORTED_PLAYERS } = require('./constants')
const { NIGHT_TURN_ORDER } = require('../phase/night')
const { buildRoomSettingsView } = require('../../validations/room/updateSettings')

// 방 정보가 판 만들 수 있는 모양인지 (인원·광대 수)
function validateSessionInput(players, jokerCount) {
    // 사람 목록이 비었거나 2~10명 밖이면 거절
    if (!Array.isArray(players) || players.length === 0) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'EMPTY_PLAYERS' }
    }
    if (players.length < MIN_SUPPORTED_PLAYERS || players.length > MAX_SUPPORTED_PLAYERS) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'PLAYER_COUNT_OUT_OF_RANGE' }
    }
    // 사람마다 uuid·닉네임 있는지, 같은 사람 두 번 없는지
    const seenUuids = new Set()
    for (const player of players) {
        if (!player || typeof player.uuid !== 'string' || player.uuid.length === 0) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_UUID' }
        }
        if (typeof player.nickname !== 'string' || player.nickname.trim().length === 0) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_NICKNAME' }
        }
        if (seenUuids.has(player.uuid)) {
            return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'DUPLICATE_UUID' }
        }
        seenUuids.add(player.uuid)
    }
    // 광대 수는 0 이상, 전체 인원보다 적어야 함
    if (!Number.isInteger(jokerCount) || jokerCount < 0) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'INVALID_JOKER_COUNT' }
    }
    if (jokerCount >= players.length) {
        return { ok: false, code: 'INVALID_SESSION_INPUT', reason: 'JOKER_COUNT_TOO_HIGH' }
    }
    return { ok: true }
}

// 방 설정에서 시간 값만 뽑아 새로
function buildTimerSettings(settings) {
    // 1 이상 정수만 쓰고 나머지는 null (이상한 값 막기)
    const positiveInt = (value) => (Number.isInteger(value) && value > 0 ? value : null)

    // 역할별 밤 시간: 밤 차례에 있는 역할 것만 골라 담음
    const rawRoleTimes = settings?.roleNightActionTimes
    const roleNightActionTimes = {}
    if (rawRoleTimes && typeof rawRoleTimes === 'object' && !Array.isArray(rawRoleTimes)) {
        for (const role of NIGHT_TURN_ORDER) {
            const seconds = positiveInt(rawRoleTimes[role])
            if (seconds !== null) roleNightActionTimes[role] = seconds
        }
    }

    return {
        dayDiscussionTime: positiveInt(settings?.dayDiscussionTime),
        dayVoteTime: positiveInt(settings?.dayVoteTime),
        nightActionTime: positiveInt(settings?.nightActionTime),
        roleNightActionTimes,
    }
}

// 방 설정 원본 보관용 (판에서 보여줄 설정)
function buildRoomSettingsSource(room) {
    // 공개방·코드방 말고는 null, 설정 버전은 정수만
    const accessType = room?.accessType === 'open' || room?.accessType === 'code' ? room.accessType : null
    const settingsVersion = Number.isInteger(room?.settingsVersion) ? room.settingsVersion : null
    return { accessType, settingsVersion, settings: buildRoomSettingsView(room?.settings) }
}

module.exports = {
    validateSessionInput,
    buildTimerSettings,
    buildRoomSettingsSource,
}