const friendService = require("../service/friend.service");
const { createError } = require("../utils/appError");
const { emitToUser } = require("../socket/socket");

/**
 * F-16(AC-01/AC-04): 친구 소켓 사건에 "안정 사건 ID + 대상 계정"을 실어 보낸다.
 *
 * 안정(stable)의 뜻은 "같은 실제 사건을 다시 전달해도 같은 문자열"이다 — 그래야 수신
 * 클라이언트가 중복 전달·재접속·리렌더에서 같은 소리를 두 번 내지 않는다. 그래서 시각이나
 * 난수를 쓰지 않고 DB가 확정한 요청 행 id를 쓴다.
 *
 * accountId를 함께 싣는 이유는 수신 측이 "서버가 이 계정에게 보낸 사건"과 "현재 로그인한
 * 계정"을 대조할 수 있게 하기 위해서다(계정 전환 직후 도착하는 늦은 사건 방어).
 * 실제 전달 대상 제한은 emitToUser(해당 uuid의 소켓에만 전달)가 담당한다.
 *
 * origin='live'는 "지금 막 일어난 사건"이라는 뜻이다. 목록 재조회(fetchIncomingRequests 등)
 * 결과로는 이 봉투를 만들지 않는다(A-05).
 */
function buildFriendSfxEvent(kind, stage, accountId, requestId) {
    // 요청 행 id를 확정하지 못했으면 봉투를 지어내지 않는다 — 안정 ID가 없는 사건에
    // 임시 ID를 붙이면 중복 전달마다 새 소리가 나게 된다. 이때는 sfxEvent 없이 보내고
    // 수신 측은 기존대로 목록만 다시 가져온다(무음).
    if (!Number.isInteger(requestId)) return null;
    if (typeof accountId !== 'string' || accountId.length === 0) return null;
    return {
        kind,
        eventId: `friend-request:${requestId}:${stage}`,
        accountId,
        origin: 'live',
    };
}

exports.getFriends = async (req, res, next) => {
    try {
        const friends = await friendService.getFriendList(req.user.uuid);
        res.status(200).json({ success: true, data: friends });
    } catch (error) {
        next(error);
    }
};

exports.getIncomingRequests = async (req, res, next) => {
    try {
        const requests = await friendService.getIncomingRequests(req.user.uuid);
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
};

exports.searchUsers = async (req, res, next) => {
    try {
        const users = await friendService.searchUsers(req.query.q, req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
};

exports.sendFriendRequest = async (req, res, next) => {
    try {
        const { receiverId } = req.body;

        if (!receiverId) {
            return next(createError('receiverId가 필요합니다.', 400));
        }

        // 서비스는 생성된 요청 행을 돌려준다(friend.service.js::sendFriendRequest →
        // friendRepository.createFriendRequest). 기존 구현은 이 반환값을 버려서 수신자가
        // "어떤 요청이 왔는지" 구분할 방법이 없었다 — 실제 저장된 id를 안정 사건 ID로 쓴다.
        const created = await friendService.sendFriendRequest(req.user.uuid, receiverId);
        const sfxEvent = buildFriendSfxEvent('friend-request-received', 'received', receiverId, created?.id);
        // F-17(A-02): 이 시점에서 원본 요청과 알림 행은 이미 커밋됐다. 소켓 전달이 던져도
        // 커밋을 되돌릴 수 없고 되돌려서도 안 되므로, 예외가 응답을 실패로 바꾸지 않게
        // 여기서 격리한다(notificationService.emitNotificationCreated의 격리와 별개다 —
        // 두 전달은 서로의 실패를 전파하지 않는다). 놓친 전달은 GET /notifications와
        // fetchIncomingRequests가 무음으로 복원한다.
        try {
            emitToUser(receiverId, 'friend_request_received', sfxEvent ? { sfxEvent } : {});
        } catch (emitError) {
            console.error('[친구 요청 통지 실패]', { code: 'FRIEND_REQUEST_NOTIFY_ERROR', receiverId });
        }

        res.status(200).json({ success: true, message: '친구 신청을 보냈습니다.' });
    } catch (error) {
        next(error);
    }
};

exports.acceptRequest = async (req, res, next) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        if (Number.isNaN(requestId)) {
            return next(createError('유효하지 않은 요청 id입니다.', 400));
        }

        // 트랜잭션이 실제로 커밋된 뒤에만 사건을 만든다. requestId는 이미 검증한 요청 행 id라
        // 같은 수락을 다시 전달해도 같은 ID가 나온다(중복 재생 방지의 근거).
        const { requesterId } = await friendService.acceptRequest(req.user.uuid, requestId);
        const sfxEvent = buildFriendSfxEvent('friend-request-accepted', 'accepted', requesterId, requestId);
        emitToUser(requesterId, 'friend_request_accepted', { byUuid: req.user.uuid, ...(sfxEvent ? { sfxEvent } : {}) });

        res.status(200).json({ success: true, message: '친구 요청을 수락했습니다.' });
    } catch (error) {
        next(error);
    }
};

exports.declineRequest = async (req, res, next) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        if (Number.isNaN(requestId)) {
            return next(createError('유효하지 않은 요청 id입니다.', 400));
        }

        const { requesterId } = await friendService.declineRequest(req.user.uuid, requestId);
        const sfxEvent = buildFriendSfxEvent('friend-request-declined', 'declined', requesterId, requestId);
        emitToUser(requesterId, 'friend_request_declined', { byUuid: req.user.uuid, ...(sfxEvent ? { sfxEvent } : {}) });

        res.status(200).json({ success: true, message: '친구 요청을 거절했습니다.' });
    } catch (error) {
        next(error);
    }
};
