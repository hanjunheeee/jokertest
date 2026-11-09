// 가짜 DB 시험 도우미, 소켓 세션 확인 묶음 질의(SQL 하나)를 옛 두 질의(모델 findOne)로 돌려 db.UserSession·db.UserBan 가짜가 그대로 먹히게 함
// socket.authSession·profile.updatePassword.sessionRevocation 시험이 씀 (묶음 질의 자체는 tests/db 진짜 DB 시험이 봄)
const sessionCheckRepository = require('../../repositories/user/sessionCheck')
const userRepository = require('../../repositories/user')

exports.useModelSessionCheck = (t) => t.mock.method(
    sessionCheckRepository,
    'loadSessionCheck',
    (sessionId, uuid) => Promise.all([
        userRepository.findActiveSession(sessionId, uuid),
        userRepository.checkActiveBan(uuid),
    ]),
)
