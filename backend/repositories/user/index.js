// 사용자 저장소 입구, 옛 user.repositories 이름 전부 내보냄
// repositories/user.repositories.js가 이 객체를 그대로 내보냄 (시험이 이 객체 함수를 갈아끼움)
const { withTransaction } = require('./transaction');
const { findByEmail, findByNickname, findByUuid, createUser, updateUser, createUserStats } = require('./account');
const { createLoginHistory, checkActiveBan } = require('./loginGuard');
const { createUserSession, findActiveSession, markOnlineSessionsOffline, recordLogout } = require('./session');
const { findSessionForRefresh, applyRefreshRotation } = require('./refresh');
const { getMyProfile } = require('./profile');
const { findExternalIdentity, createExternalIdentity, createOAuthState, findOAuthStateByHash, markOAuthStateConsumed } = require('./oauth');
const { createSocialSignupIntent, findSocialSignupIntentByHash, markSocialSignupIntentConsumed } = require('./signupIntent');

// 보안 아닌 계정 조회도 같이 (초대·친구 요청·업적·아이디 찾기용)
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
    findSocialSignupIntentByHash,
    markSocialSignupIntentConsumed,
    lockAccount,
    findNickname,
    listAllUuids,
    findForFindId,
};
