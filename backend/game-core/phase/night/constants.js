// 밤 상수 파일
// 밤 역할 순서·시간·판정 방식·회복 상태·사망 출처 이름, 밤 코드랑 판 만들기가 사용

// 밤 차례: 광대 → 의사 → 경비원 → 마녀사냥꾼 (지도 05)
const NIGHT_TURN_ORDER = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// 역할 차례 하나 30초
const NIGHT_TURN_DURATION_MS = 30_000

// 같은 역할 여럿일 때 정하는 법: 광대는 최다표, 나머지는 만장일치
const NIGHT_ACTION_RESOLUTION_POLICY = Object.freeze({
    JOKER: 'PLURALITY',
    DOCTOR: 'UNANIMOUS',
    GUARD: 'UNANIMOUS',
    WITCH_HUNTER: 'UNANIMOUS',
})

// 의사 치료 기다리는 상태 이름
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