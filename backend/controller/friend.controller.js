const friendService = require("../service/friend.service");
const gameInviteService = require("../service/gameInvite.service");
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

/**
 * F-19 AC-02: 커밋된 DB 결과를 소켓 전달 실패가 뒤집지 못하게 격리한다.
 *
 * 예전 수락·거절 컨트롤러는 emitToUser를 try 밖에서 그냥 불렀다 — emit이 던지면 이미
 * 커밋된 수락이 500 응답이 되어, 화면은 실패로 안내하는데 서버에는 친구가 생긴 상태가
 * 남았다. 전달 실패는 로그로만 남긴다(놓친 전달은 목록 재조회가 무음으로 복원한다).
 */
function emitFriendEventSafely(userId, event, payload, code) {
    try {
        emitToUser(userId, event, payload);
    } catch (emitError) {
        console.error('[친구 사건 통지 실패]', { code, userId });
    }
}

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
        emitFriendEventSafely(
            requesterId, 'friend_request_accepted',
            { byUuid: req.user.uuid, ...(sfxEvent ? { sfxEvent } : {}) },
            'FRIEND_REQUEST_ACCEPT_NOTIFY_ERROR',
        );

        res.status(200).json({ success: true, message: '친구 요청을 수락했습니다.', data: { request_id: requestId, status: 'ACCEPTED' } });
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
        emitFriendEventSafely(
            requesterId, 'friend_request_declined',
            { byUuid: req.user.uuid, ...(sfxEvent ? { sfxEvent } : {}) },
            'FRIEND_REQUEST_DECLINE_NOTIFY_ERROR',
        );

        res.status(200).json({ success: true, message: '친구 요청을 거절했습니다.', data: { request_id: requestId, status: 'DECLINED' } });
    } catch (error) {
        next(error);
    }
};

/**
 * F-19 AC-02: 전체 수락의 응답이 유실됐을 때 화면이 되물을 수 있는 결과 조회.
 * 요청 당사자만 자기 요청의 상태를 본다 — 남의 id를 섞어 보내도 그 행은 결과에 없다.
 */
exports.getRequestResults = async (req, res, next) => {
    try {
        const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
        const requestIds = raw.split(',').map((value) => value.trim()).filter(Boolean);
        const results = await friendService.getRequestResults(req.user.uuid, requestIds);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
};

// ── F-19 AC-03: 즐겨찾기 ─────────────────────────────────────────────────────

exports.getFavorites = async (req, res, next) => {
    try {
        const ids = await friendService.getFavoriteFriendIds(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: ids });
    } catch (error) {
        next(error);
    }
};

exports.setFavorite = async (req, res, next) => {
    try {
        // 원하는 값을 그대로 받는다(toggle 아님). boolean이 아니면 400 — 서버가 임의로
        // 뒤집지 않는다.
        const { favorite } = req.body ?? {};
        const result = await friendService.setFriendFavorite(req.user.uuid, req.params.friendId, favorite);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

// ── F-19 AC-04/AC-05: 차단 ───────────────────────────────────────────────────

exports.getBlocks = async (req, res, next) => {
    try {
        const blocks = await friendService.getBlockedUsers(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: blocks });
    } catch (error) {
        next(error);
    }
};

exports.blockUser = async (req, res, next) => {
    try {
        const { targetId } = req.body ?? {};
        const result = await friendService.blockUser(req.user.uuid, targetId);

        // 커밋 이후에만 통지한다. 양쪽 모두 자기 화면의 친구·요청·초대 목록을 다시 읽어야
        // 하므로 "무효화됐다"는 사실만 보낸다(소리 없음 — 신규 수신 사건이 아니다).
        for (const userId of [req.user.uuid, targetId]) {
            emitFriendEventSafely(userId, 'friend_relation_invalidated', { reason: 'BLOCKED' }, 'FRIEND_BLOCK_NOTIFY_ERROR');
        }

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.unblockUser = async (req, res, next) => {
    try {
        const result = await friendService.unblockUser(req.user.uuid, req.params.targetId);
        emitFriendEventSafely(req.user.uuid, 'friend_relation_invalidated', { reason: 'UNBLOCKED' }, 'FRIEND_UNBLOCK_NOTIFY_ERROR');
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

// ── F-19 AC-06/AC-07: 게임 초대 ──────────────────────────────────────────────

/**
 * 초대 목록 snapshot과 소리 커서를 함께 돌려준다(A-09).
 * 커서는 종료된 초대까지 포함한 수신자 전체 최대 순번이라, 이 값 이하의 사건은 전부 무음이다.
 */
exports.getInviteSnapshot = async (req, res, next) => {
    try {
        const snapshot = await gameInviteService.getReceiverSnapshot(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: snapshot });
    } catch (error) {
        next(error);
    }
};

exports.createInvite = async (req, res, next) => {
    try {
        const { receiverId, creationKey } = req.body ?? {};
        // 발송자·방은 서버가 registry에서 확정한다. 요청 본문의 방 정보는 읽지 않는다(A-05).
        const result = await gameInviteService.createInvite({
            senderId: req.user.uuid, receiverId, creationKey,
        });
        res.status(result.created ? 201 : 200).json({ success: true, data: result.invite });
    } catch (error) {
        next(error);
    }
};

exports.getInvite = async (req, res, next) => {
    try {
        const invite = await gameInviteService.getInviteForUser(req.user.uuid, req.params.inviteId);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        next(error);
    }
};

exports.declineInvite = async (req, res, next) => {
    try {
        const invite = await gameInviteService.declineInvite(req.user.uuid, req.params.inviteId);
        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        next(error);
    }
};
