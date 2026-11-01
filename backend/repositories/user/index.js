// 사용자 저장소 입구 파일, 계정·로그인·세션·refresh·프로필·소셜 쿼리 이름을 한 객체로 내보냄
// 인증 서비스들·사용자 서비스(services/user.js)가 이 객체로 부름 (시험이 이 객체 함수를 바꿔 끼움)
const { withTransaction } = require('./transaction');
const { findByEmail, findByNickname, findByUuid, createUser, updateUser, createUserStats } = require('./account');
const { createLoginHistory, checkActiveBan } = require('./loginGuard');
const { createUserSession, findActiveSession, markOnlineSessionsOffline, recordLogout } = require('./session');
const { findSessionForRefresh, applyRefreshRotation } = require('./refresh');
const { getMyProfile } = require('./profile');
const { findExternalIdentity, createExternalIdentity, createOAuthState, findOAuthStateByHash, markOAuthStateConsumed } = require('./oauth');
const { createSocialSignupIntent, findIntentByHash, markIntentConsumed } = require('./signupIntent');

// 계정 조회 4개도 같이 내보냄 (지금 부르는 쪽은 전부 lookup.js를 바로 부름)
const { lockAccount, findNickname, listAllUuids, findForFindId } = require('./lookup');

module.exports = {
    withTransaction,
    findByEmail,
    findByNickname,
    findByUuid,
    createUser,
    updateUser,
    createUserStats,
    createLoginHistory,
    checkActiveBan,
    createUserSession,
    findActiveSession,
    markOnlineSessionsOffline,
    findSessionForRefresh,
    applyRefreshRotation,
    getMyProfile,
    recordLogout,
    findExternalIdentity,
    createExternalIdentity,
    createOAuthState,
    findOAuthStateByHash,
    markOAuthStateConsumed,
    createSocialSignupIntent,
    findIntentByHash,
    markIntentConsumed,
    lockAccount,
    findNickname,
    listAllUuids,
    findForFindId,
};
