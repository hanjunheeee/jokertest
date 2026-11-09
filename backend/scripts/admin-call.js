// 관리자 통로 시험 도구, 관리자 서버 없이 내부 API(/internal/*)를 한 줄로 부르기
// 사람이 직접 씀 (npm run admin -- <명령>), 열쇠는 .env의 INTERNAL_API_KEY만 읽고 화면에 안 찍음
const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const BASE_URL = (process.env.ADMIN_CALL_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, "");

const HELP = `쓰는 법 (backend 폴더에서):
  npm run admin -- check                                  통로 점검 한 번에 (열쇠 맞음·틀림·지금 상황)
  npm run admin -- live                                  지금 대기방·판 수 (Node 여러 개면 전 Node 합침)
  npm run admin -- live <node>                           그 Node 것만 (예: live n2)
  npm run admin -- cluster                               Node 목록 (판·방·접속 수·drain)
  npm run admin -- drain <node>                          그 Node 새 접속·방 만들기를 다른 Node로 (판은 계속)
  npm run admin -- undrain <node>                        drain 끄기
  npm run admin -- announce "제목" "본문"                  접속 중인 사람 전체에게 공지
  npm run admin -- announce "제목" "본문" <uuid,uuid>      고른 사람에게만 공지
  npm run admin -- disconnect <uuid>                      그 사람 바로 끊기 (정지·비활성 반영)
  npm run admin -- maintenance-reload                     점검 상태 다시 읽기
  npm run admin -- banned-words-reload                    금지어 다시 읽기
주소 바꾸기: ADMIN_CALL_BASE_URL=https://api.도메인 (기본 http://localhost:4000)`;

// 명령 → 부를 경로·보낼 값
const buildRequest = (args) => {
    const [command, ...rest] = args;
    if (command === "live") {
        return { method: "GET", path: rest[0] ? `/internal/live?node=${encodeURIComponent(rest[0])}` : "/internal/live" };
    }
    if (command === "cluster") return { method: "GET", path: "/internal/cluster" };
    if ((command === "drain" || command === "undrain") && rest[0]) {
        return {
            method: "POST",
            path: `/internal/nodes/${encodeURIComponent(rest[0])}/drain`,
            body: { draining: command === "drain" },
        };
    }
    if (command === "maintenance-reload") return { method: "POST", path: "/internal/maintenance/reload" };
    if (command === "banned-words-reload") return { method: "POST", path: "/internal/banned-words/reload" };
    if (command === "disconnect" && rest[0]) {
        return { method: "POST", path: `/internal/users/${encodeURIComponent(rest[0])}/disconnect` };
    }
    if (command === "announce" && rest[0] && rest[1]) {
        const userUuids = rest[2] ? rest[2].split(",").map((value) => value.trim()).filter(Boolean) : null;
        return {
            method: "POST",
            path: "/internal/announcements",
            body: {
                // 같은 공지를 두 번 보내도 한 번만 쌓이게 관리자 서버가 만드는 번호, 여기선 실행마다 새로
                announcementId: `cli-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
                title: rest[0],
                body: rest[1],
                ...(userUuids ? { target: "users", userUuids } : { target: "online" }),
            },
        };
    }
    return null;
};

// 한 번 부르기 (닿지 않으면 null)
const call = (request, key) => fetch(`${BASE_URL}${request.path}`, {
    method: request.method,
    headers: { "Content-Type": "application/json", "X-Internal-Key": key },
    body: request.body ? JSON.stringify(request.body) : undefined,
}).catch((error) => {
    console.error(`서버에 못 닿음 (${BASE_URL}): ${error.cause?.code ?? error.message}`);
    return null;
});

// 통로 점검: ① 서버 살아 있음 ② 틀린 열쇠는 401 ③ 맞는 열쇠로 지금 상황 200 → 줄마다 OK/실패
const runCheck = async (key) => {
    const results = [];
    const health = await fetch(`${BASE_URL}/health`).catch(() => null);
    results.push(["게임 서버 살아 있음 (/health)", health?.ok === true]);
    const wrong = await call({ method: "GET", path: "/internal/live" }, `${key}x`);
    results.push(["틀린 열쇠는 막힘 (401)", wrong?.status === 401]);
    const right = await call({ method: "GET", path: "/internal/live" }, key);
    const liveBody = right?.ok ? await right.json().catch(() => null) : null;
    results.push(["맞는 열쇠로 지금 상황 읽힘 (200)", liveBody?.ok === true]);
    for (const [label, ok] of results) console.log(`${ok ? "OK  " : "실패"} ${label}`);
    if (liveBody) console.log(`지금 상황: ${JSON.stringify(liveBody)}`);
    if (wrong?.status === 404) console.log("404면 서버가 열쇠를 못 읽은 것 → .env 확인 후 서버 다시 켜기");
    const allOk = results.every(([, ok]) => ok);
    console.log(allOk ? "통로 정상" : "통로 문제 있음");
    if (!allOk) process.exitCode = 1;
};

const main = async () => {
    const args = process.argv.slice(2);
    if (args[0] === "check") {
        const key = process.env.INTERNAL_API_KEY || "";
        if (key.length < 32) {
            console.error("INTERNAL_API_KEY가 없거나 32자보다 짧음 → backend/.env에 넣고 서버를 다시 켜야 함");
            process.exitCode = 1;
            return;
        }
        await runCheck(key);
        return;
    }
    const request = buildRequest(args);
    if (!request) {
        console.log(HELP);
        process.exitCode = 1;
        return;
    }
    const key = process.env.INTERNAL_API_KEY || "";
    if (key.length < 32) {
        console.error("INTERNAL_API_KEY가 없거나 32자보다 짧음 → backend/.env에 넣고 서버를 다시 켜야 함");
        process.exitCode = 1;
        return;
    }
    const response = await call(request, key);
    if (!response) {
        process.exitCode = 1;
        return;
    }
    const text = await response.text();
    console.log(`${response.status} ${request.method} ${request.path}`);
    console.log(text);
    if (response.status === 404) console.log("404면 서버가 열쇠를 못 읽은 것 → .env 확인 후 서버 다시 켜기");
    if (!response.ok) process.exitCode = 1;
};

if (require.main === module) main();

module.exports = { buildRequest };
