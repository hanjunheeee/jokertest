// 서버 이름 파일, 서버 여러 대일 때 "이 접속 줄은 어느 서버 것인지" 적는 이름 (SERVER_ID)
// presence/status가 접속 상태 저장·서버 켤 때 되돌리기에 씀, 서버 한 대면 안 넣어도 기본값 하나로 같음

// 안 넣었거나 모양이 틀리면 이 이름 (서버 한 대 = 전부 같은 이름 → 예전 동작 그대로)
const DEFAULT_SERVER_ID = "main";

// 영문·숫자·_·-·. 1~64자 (online_presence.server_id 칸 크기와 같음)
const SERVER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

// 지금 서버 이름 (부를 때 읽음, 시험이 env 바꿔 넣음)
const getServerId = (env = process.env) => {
    const raw = typeof env.SERVER_ID === "string" ? env.SERVER_ID.trim() : "";
    return SERVER_ID_PATTERN.test(raw) ? raw : DEFAULT_SERVER_ID;
};

module.exports = { DEFAULT_SERVER_ID, SERVER_ID_PATTERN, getServerId };
