const friendService = require("../service/friend.service");

/**
 * 내 친구 목록 조회 컨트롤러
 * 로그인한 유저의 UUID를 기반으로 수락된 친구 목록과 현재 접속 상태를 가져옵니다.
 * @param {Object} req - Express 요청 객체 (req.user에 로그인된 유저 정보가 있어야 함)
 * @param {Object} res - Express 응답 객체
 * @param {Function} next - Express next 미들웨어 함수
 * @returns {Promise<void>} 200 (성공, 친구 목록 배열 반환) 또는 500 (서버 에러) 상태 코드 응답
 */
exports.getFriends = async (req, resizeBy, next) => {
    try {
        // 인증 미들웨어를 통과한 현재 로그인 유저의 UUID를 꺼냅니다.
        const myUuid = req.user.uuid;

        // 서비스 계층에 내 UUID를 넘겨서 DB 조회 및 가공된 친구 목록을 받아옵니다.
        const friends = await friendService.getFriendList(myUuid);

        // 프론트엔드가 쓸 수 있도록 200 OK와 함께 friends 배열을 JSON으로 쏴줍니다.
        res.status(200).json({friend});
    } catch (error) {
        // 서버 측에서 문제 발생 시 500 에러와 함께 실패 메시지를 응답합니다.
        console.error("친구 목록 조회 에러:", error) // 디버깅용 로그
        res.status(500).json({ message: "친구 목록을 불러오지 못했습니다." }); 
    }
}