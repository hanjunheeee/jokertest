// 친구·게임 초대 소켓 사건 구독 (on·off만 모음)
// useFriendSocketEvents 훅이 연결마다 한 번 붙이고 정리 때 떼어 냄

// 8개 사건을 정해진 순서로 붙이고, 같은 순서로 떼는 함수를 돌려줌
export function subscribeFriendEvents(socket, h) {
    socket.on("friend_status_change", h.statusChange);
    socket.on("friend_request_received", h.requestReceived);
    socket.on("friend_request_accepted", h.requestAccepted);
    socket.on("friend_request_declined", h.requestDeclined);
    socket.on("friend_relation_invalidated", h.relationInvalidated);
    socket.on("game_invite_received", h.inviteReceived);
    socket.on("game_invite_updated", h.inviteUpdated);
    socket.on("connect", h.connect);

    return () => {
        socket.off("friend_status_change", h.statusChange);
        socket.off("friend_request_received", h.requestReceived);
        socket.off("friend_request_accepted", h.requestAccepted);
        socket.off("friend_request_declined", h.requestDeclined);
        socket.off("friend_relation_invalidated", h.relationInvalidated);
        socket.off("game_invite_received", h.inviteReceived);
        socket.off("game_invite_updated", h.inviteUpdated);
        socket.off("connect", h.connect);
    };
}
