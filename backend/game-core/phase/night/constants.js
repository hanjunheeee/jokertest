// 밤 상수 파일
// 밤 순서·시간·판정 방식 등 고정 값, 밤 코드·판 만들기·socket 쪽이 사용

// 밤 차례: 광대 → 의사 → 경비원 → 마녀사냥꾼 (지도 05)
const NIGHT_TURN_ORDER = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// 역할 차례 하나 기본 30초 (방 설정에 없을 때)
const NIGHT_TURN_DURATION_MS = 30_000

// 같은 역할 여럿일 때 정하는 법: 광대는 최다표, 나머지는 만장일치
const NIGHT_ACTION_RESOLUTION_POLICY = Object.freeze({
    JOKER: 'PLURALITY',
    DOCTOR: 'UNANIMOUS',
    GUARD: 'UNANIMOUS',
    WITCH_HUNTER: 'UNANIMOUS',
})

// 광대한테 찍힌 사람 상태: 치료 대기 · 회복 · 죽을 예정
const NIGHT_RECOVERY_STATES = Object.freeze({
    PENDING_RECOVERY: 'PENDING_RECOVERY',
    RECOVERED: 'RECOVERED',
    DEATH_CANDIDATE: 'DEATH_CANDIDATE',
})

// 끝난 역할 없음 (빈 목록 하나 같이 사용)
const EMPTY_COMPLETED_ROLES = Object.freeze(new Set())

// 자기 자신 고를 수 있는 역할: 의사만
const SELF_TARGET_ROLES = new Set(['DOCTOR'])

// 밤에 죽은 이유 공개 이름: 광대 · 마녀사냥꾼 · 모름
const PUBLIC_NIGHT_DEATH_SOURCES = Object.freeze({
    JOKER: 'JOKER',
    WITCH_HUNTER: 'WITCH_HUNTER',
    UNKNOWN_NIGHT: 'UNKNOWN_NIGHT',
})

module.exports = {
    NIGHT_TURN_ORDER,
    NIGHT_TURN_DURATION_MS,
    NIGHT_ACTION_RESOLUTION_POLICY,
    NIGHT_RECOVERY_STATES,
    EMPTY_COMPLETED_ROLES,
    SELF_TARGET_ROLES,
    PUBLIC_NIGHT_DEATH_SOURCES,
}