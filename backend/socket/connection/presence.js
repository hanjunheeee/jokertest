// 소켓 접속 상태 파일, 접속·끊김 때 접속 목록 고치기 + 친구에게 접속 상태 알리기
// socket.js 연결·끊김 처리기가 부름
// presence 서비스·matchmaking은 모듈 객체로 불러 시험 갈아끼우기 먹게 함
const presenceService = require("../../services/presence/status");
const matchmaking     = require("../matchmaking");
// 접속 목록은 emitter의 Map 하나만 씀 (socket.js·서비스와 같은 객체)
const { onlineUsers, userChannelOf } = require("../emitter");

// 계정마다 접속 상태 저장 줄 (빠른 재접속 때 ONLINE·OFFLINE 저장 순서 뒤바뀜 막기)
const presenceLines = new Map();

// 이 계정 저장 줄 맨 뒤에 일 하나 붙임 (앞 일이 실패해도 뒤 일은 돎)
function enqueuePresence(uuid, task) {
    const previous = presenceLines.get(uuid) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    presenceLines.set(uuid, next);
    // 줄 맨 뒤가 끝나면 칸 지움 (계정마다 쌓이지 않게)
    next.catch(() => {}).then(() => {
        if (presenceLines.get(uuid) === next) presenceLines.delete(uuid);
    });
    return next;
}

// 옛 소켓을 밀어낸 까닭: 같은 로그인 세션(같은 브라우저 다른 탭)인지 다른 로그인인지 (known 1-15)
// 화면이 같은 세션이면 로그아웃 대신 "다른 탭에서 열림"으로 다룰 수 있게 code만 더함
function describeReplacement(existingSocket, socket) {
    const sameSession = typeof socket?.data?.user?.sessionId === "string"
        && existingSocket?.data?.user?.sessionId === socket.data.user.sessionId;
    return sameSession
        ? {
            message: "같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.",
            code: "REPLACED_BY_SAME_SESSION",
        }
        : {
            message: "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.",
            code: "REPLACED_BY_OTHER_LOGIN",
        };
}

// 한 계정 한 소켓 지키려고 옛 소켓은 표시 남기고 끊음
// 목록엔 새 소켓 먼저 넣음 (옛 소켓 끊김 처리가 새 접속 안 지우게)
async function handleConnection(io, socket, uuid) {
    const existingSocketId = onlineUsers.get(uuid);

    onlineUsers.set(uuid, socket.id);
    // 옛 소켓에 표시 남김 → 그 끊김 처리가 오프라인으로 안 바꿈
    if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);

        if (existingSocket) {
            existingSocket.data.forcedLogout = true;
            existingSocket.emit("force_disconnect", describeReplacement(existingSocket, socket));
            existingSocket.disconnect(true);
        }
    }

    // 접속 상태 저장(줄 서서)·친구 알림·대기방 채널 다시 넣기는 같이 돌림
    // 저장 차례가 왔을 때 이미 다른 소켓으로 바뀌었거나 끊겼으면 안 씀 (늦은 ONLINE이 덮지 않게)
    await Promise.all([
        enqueuePresence(uuid, async () => {
            if (onlineUsers.get(uuid) !== socket.id) return;
            await presenceService.setPresence(uuid, "ONLINE");
        }),
        broadcastFriendStatus(io, uuid, "ONLINE"),
        matchmaking.resyncRoomChannelOnReconnect(socket, uuid),
    ]);
}

// 밀려난 옛 소켓·이미 새 소켓으로 바뀐 계정은 그냥 끝냄 (새 접속을 오프라인으로 덮지 않기)
async function handleDisconnect(io, socket, uuid) {
    if (socket.data.forcedLogout) return;
    if (onlineUsers.get(uuid) !== socket.id) return;

    // 여기부터 진짜 바뀜: 목록에서 빼고 오프라인 저장(줄 서서)·친구 알림
    // 저장 차례가 왔을 때 그사이 다시 접속했으면 OFFLINE 안 씀 (빠른 재접속 때 오프라인이 마지막에 남는 것 막기)
    onlineUsers.delete(uuid);
    await Promise.all([
        enqueuePresence(uuid, async () => {
            if (onlineUsers.has(uuid)) return;
            await presenceService.setPresence(uuid, "OFFLINE");
        }),
        broadcastFriendStatus(io, uuid, "OFFLINE"),
    ]);
}

// 수락한 친구 중 접속 중인 사람에게만 보냄 (친구 계정 채널로, 접속 안 한 친구 채널은 비어 아무도 안 받음)
async function broadcastFriendStatus(io, uuid, status) {
    const friendUuids = await presenceService.getAcceptedFriendUuids(uuid);

    friendUuids.forEach((friendUuid) => {
        const channel = userChannelOf(friendUuid);
        if (channel) {
            io.to(channel).emit("friend_status_change", { uuid, status });
        }
    });
}

module.exports = {
    handleConnection,
    handleDisconnect,
};
