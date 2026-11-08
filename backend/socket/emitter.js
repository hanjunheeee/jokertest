// 사용자 한 명에게 보내는 창구 파일, 접속 목록 Map·io 들고 있음 + 계정 전용 채널(user:<uuid>) 보내기·찾기
// socket.js·서비스·컨트롤러가 이 파일만 불러 보냄 (socket.js 통째로 안 불러 순환 막기)
const onlineUsers = new Map();

// initSocket 전엔 비어 있음, 비어 있으면 아무것도 안 보냄
let _io = null;

// 계정 전용 채널 이름 앞머리 (연결 때 socket.js가 넣음, 서버 여러 대면 어댑터가 다른 서버 소켓까지 이어 줌)
const USER_CHANNEL_PREFIX = "user:";

// initSocket이 만든 io 넣기
function setIo(io) {
    _io = io;
}

// 지금 io 꺼내기
function getIo() {
    return _io;
}

// 계정 전용 채널 이름 (uuid 비었으면 null → 보내지 않음)
function userChannelOf(uuid) {
    return typeof uuid === "string" && uuid.length > 0 ? `${USER_CHANNEL_PREFIX}${uuid}` : null;
}

// 연결 하나를 그 계정 채널에 넣기 (연결 처리기 맨 앞, 기본 어댑터는 바로 끝남)
// 어댑터가 Promise를 돌려주면 실패만 로그 (연결은 그대로, 한 사람 보내기만 빠짐)
function joinUserChannel(socket, uuid) {
    const channel = userChannelOf(uuid);
    if (!channel) return;
    const pending = socket.join(channel);
    if (pending && typeof pending.then === "function") {
        pending.then(undefined, () => console.error("[계정 채널 넣기 실패]", { code: "USER_CHANNEL_JOIN_ERROR" }));
    }
}

// 접속 중인 사용자에게만 보냄 = 계정 채널로 보냄 (계정당 연결 하나라 받는 소켓도 하나), io 없으면 그냥 넘어감
function emitToUser(uuid, event, payload) {
    const channel = userChannelOf(uuid);
    if (channel && _io) {
        _io.to(channel).emit(event, payload);
    }
}

// 그 계정 채널 소켓 전부 (같은 서버는 진짜 소켓, 서버 여러 대면 다른 서버 것도 옴), io·채널 없으면 빈 목록
async function fetchUserSockets(uuid, io = _io) {
    const channel = userChannelOf(uuid);
    if (!channel || typeof io?.in !== "function") return [];
    return await io.in(channel).fetchSockets();
}

module.exports = {
    onlineUsers, setIo, getIo, emitToUser,
    USER_CHANNEL_PREFIX, userChannelOf, joinUserChannel, fetchUserSockets,
};
