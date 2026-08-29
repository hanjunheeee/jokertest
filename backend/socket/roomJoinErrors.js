/**
 * room_join_failed 페이로드의 `code` 필드에 쓰는 안정적 오류 코드 모음.
 *
 * 실패 사유를 한국어 message 문구로만 내려주면 클라이언트가 문구 비교로 분기해야 하는데,
 * 문구는 언제든 다듬을 수 있어 계약이 될 수 없다. 코드는 여기 정의된 문자열만 쓰고,
 * message는 사람이 읽는 기본 안내로만 남긴다(프론트는 code 우선, 없으면 message로 폴백).
 *
 * message는 기존 수신자를 깨뜨리지 않도록 항상 함께 내려준다 — code는 덧붙이는 필드다.
 */
const ROOM_JOIN_ERROR_CODES = Object.freeze({
    /** payload 형식 자체가 잘못됨(객체 아님 / roomId 누락 등). */
    INVALID_REQUEST: 'INVALID_REQUEST',
    /** 입장 코드를 아예 보내지 않았거나 공백뿐이다. */
    CODE_REQUIRED: 'CODE_REQUIRED',
    /** 지목한 방(roomId)이 없어졌거나, 대기 중 다른 방으로 바뀌었다. */
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    /** 입력한 코드와 일치하는 방이 없다 / 코드가 필요한 방에 코드 없이 들어오려 했다. */
    ROOM_CODE_MISMATCH: 'ROOM_CODE_MISMATCH',
    /** 그 방은 이미 게임을 시작해 대기방이 사라졌다. */
    ROOM_ALREADY_STARTED: 'ROOM_ALREADY_STARTED',
    /** 방 정원이 가득 찼다. */
    ROOM_FULL: 'ROOM_FULL',
    /** 이미 다른 방에 참여 중이다. */
    ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
    /** 같은 사용자의 방 생성/참가 요청이 아직 처리 중이다. */
    REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
    /** 매칭 대기열에 남아 있어 방 참가를 받을 수 없다. */
    IN_MATCHMAKING_QUEUE: 'IN_MATCHMAKING_QUEUE',
    /** 인증된 uuid에 해당하는 사용자 정보를 찾지 못했다. */
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    /** 처리 중 GameSession 종료 정리가 끼어들어 요청이 무효화됐다. */
    SESSION_ENDED: 'SESSION_ENDED',
    /** 처리 중 소켓 연결이 끊겼다. */
    DISCONNECTED: 'DISCONNECTED',
    /** 예상하지 못한 서버 오류. */
    INTERNAL_ERROR: 'INTERNAL_ERROR',
})

module.exports = { ROOM_JOIN_ERROR_CODES }
