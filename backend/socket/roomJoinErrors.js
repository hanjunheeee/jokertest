// 방 입장 거절 코드 파일, 코드·공개 방 입장·초대 수락·게임 중 거절에 씀
// matchmaking join/guards·join·admission/accept·matchmaking/cluster·시험이 씀
const ROOM_JOIN_ERROR_CODES = Object.freeze({
    INVALID_REQUEST: 'INVALID_REQUEST',
    CODE_REQUIRED: 'CODE_REQUIRED',
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    ROOM_CODE_MISMATCH: 'ROOM_CODE_MISMATCH',
    ROOM_ALREADY_STARTED: 'ROOM_ALREADY_STARTED',
    ROOM_FULL: 'ROOM_FULL',
    ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
    ALREADY_IN_GAME: 'ALREADY_IN_GAME',
    REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
    IN_MATCHMAKING_QUEUE: 'IN_MATCHMAKING_QUEUE',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    SESSION_ENDED: 'SESSION_ENDED',
    DISCONNECTED: 'DISCONNECTED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    // 짧은 시간에 입장 시도가 몰림 (코드 맞히기 막기)
    TOO_MANY_JOIN_ATTEMPTS: 'TOO_MANY_JOIN_ATTEMPTS',
    // 같은 방에서 3번 쫓겨남 (그 방엔 다시 못 들어옴, 방 없어지면 풀림)
    KICKED_TOO_MANY_TIMES: 'KICKED_TOO_MANY_TIMES',
    // Node 여러 개일 때만 (계획 4-5): 방이 다른 Node에 있음 → 답의 node로 옮긴 뒤 같은 요청 한 번 다시
    ROOM_ON_OTHER_NODE: 'ROOM_ON_OTHER_NODE',
    // 방 주인 Node가 죽음 (방 못 찾음과 같은 안내)
    NODE_UNAVAILABLE: 'NODE_UNAVAILABLE',
    // Redis 못 써서 방 위치를 확인 못 함 (잠시 뒤 다시)
    CLUSTER_UNAVAILABLE: 'CLUSTER_UNAVAILABLE',
})

module.exports = { ROOM_JOIN_ERROR_CODES }
