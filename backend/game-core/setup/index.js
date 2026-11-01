// 판 준비 입구, 상수·역할 나누기·입력 검사·판 만들기·판 열기·시작 방송·역할 확인 묶어서 내보냄
// gameSession.js·snapshot·departure가 여기로 가져다 씀
const {
    ROLE_TO_SKIN_JOB_ID, MIN_SUPPORTED_PLAYERS, MAX_SUPPORTED_PLAYERS, PLAYER_THEME_PALETTE_SIZE,
    INITIAL_GAME_PHASE, INITIAL_DAY_INDEX,
} = require('./constants')
const { fisherYatesShuffle, assignRoles } = require('./assign')
const { validateSessionInput, buildTimerSettings, buildRoomSettingsSource } = require('./input')
const {
    buildSessionCandidate, checkGameSessionPreconditions, prepareGameSession,
} = require('./create')
const { assertValidSessionForCommit, commitGameSession } = require('./commit')
const {
    buildViewerRoleFields, buildPlayerThemeIndices, buildPlayerAccountProfileFields,
    buildRoomSettingsSourceFields, buildGameStartedPayload,
} = require('./startPayload')
const { acknowledgeRoleReveal, isRoleRevealComplete } = require('./roleAck')

module.exports = {
    ROLE_TO_SKIN_JOB_ID, MIN_SUPPORTED_PLAYERS, MAX_SUPPORTED_PLAYERS, PLAYER_THEME_PALETTE_SIZE,
    INITIAL_GAME_PHASE, INITIAL_DAY_INDEX,
    fisherYatesShuffle, assignRoles,
    validateSessionInput, buildTimerSettings, buildRoomSettingsSource,
    buildSessionCandidate, checkGameSessionPreconditions, prepareGameSession,
    assertValidSessionForCommit, commitGameSession,
    buildViewerRoleFields, buildPlayerThemeIndices, buildPlayerAccountProfileFields,
    buildRoomSettingsSourceFields, buildGameStartedPayload,
    acknowledgeRoleReveal, isRoleRevealComplete,
}