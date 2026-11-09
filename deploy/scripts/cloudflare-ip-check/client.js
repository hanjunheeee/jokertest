// 클라우드플레어 IP 확인용 부르는 쪽, nginx를 거쳐 가짜 백엔드가 본 IP·응답 머리말을 검사
// 쓰는 법(run.sh가 부름): node client.js direct | cloudflare
//   direct     = 클라우드플레어 아닌 IP가 CF-Connecting-IP를 위조해 바로 들어온 경우 → 무시돼야 함
//   cloudflare = 클라우드플레어 서버에서 온 경우 흉내(이 망을 믿을 범위로 넣은 nginx) → 그 값이 진짜 IP
const http = require("node:http");
const os = require("node:os");
const WebSocket = require("ws");

const mode = process.argv[2];
const REAL = "203.0.113.7";
const OTHER = "198.51.100.9";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile";
const PC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

// 이 컨테이너 IP (nginx가 보는 바로 붙은 주소)
const ownIp = Object.values(os.networkInterfaces()).flat()
    .find((nic) => nic && nic.family === "IPv4" && !nic.internal)?.address;

let failed = 0;
const check = (label, ok, detail) => {
    console.log(`${ok ? "OK  " : "실패"} [${mode}] ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed += 1;
};

const request = (host, path, { method = "GET", headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host, port: 80, path, method, headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
            let json = null;
            try { json = JSON.parse(body); } catch { /* 글자 응답 */ }
            resolve({ status: res.statusCode, headers: res.headers, json });
        });
    });
    req.on("error", reject);
    req.end();
});

// socket.io 손잡기를 ws로 직접: 열림(0) → 이름공간 접속(40) → 서버가 보낸 whoami(42) 받기
const socketIp = (headers) => new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://api.example.com/socket.io/?EIO=4&transport=websocket", { headers });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("소켓 5초 안에 답 없음")); }, 5000);
    ws.on("message", (data) => {
        const text = data.toString();
        if (text.startsWith("0")) ws.send("40");
        if (text.startsWith("42")) {
            clearTimeout(timer);
            ws.close();
            resolve(JSON.parse(text.slice(2))[1]);
        }
    });
    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
});

async function main() {
    console.log(`[${mode}] 이 컨테이너 IP ${ownIp}`);

    if (mode === "direct") {
        // 위조한 CF-Connecting-IP·X-Forwarded-For는 무시, 바로 붙은 주소가 진짜 IP
        const r = await request("api.example.com", "/whoami", {
            headers: { "CF-Connecting-IP": REAL, "X-Forwarded-For": "6.6.6.6" },
        });
        check("API: 위조 CF-Connecting-IP 무시 → 바로 붙은 주소", r.json?.ip === ownIp, `백엔드가 본 IP ${r.json?.ip}`);
        check("API: 사람이 넣은 X-Forwarded-For 버림", r.json?.xff === ownIp, `백엔드가 받은 X-Forwarded-For ${r.json?.xff}`);

        const internal = await request("api.example.com", "/internal/ping", { headers: { "CF-Connecting-IP": REAL } });
        check("/internal: 허용 IP를 위조해도 403", internal.status === 403, `코드 ${internal.status}`);

        const ip = await socketIp({ "CF-Connecting-IP": REAL });
        check("소켓: 위조 CF-Connecting-IP 무시", ip === ownIp, `소켓이 본 IP ${ip}`);

        // 캐시 머리말 (클라우드플레어 있든 없든 같음)
        const phone = await request("example.com", "/lobby?x=1", { headers: { "User-Agent": PHONE_UA } });
        check("폰 302 → m.", phone.status === 302 && phone.headers.location === "http://m.example.com/lobby?x=1", `${phone.status} ${phone.headers.location}`);
        check("폰 302: Cache-Control no-store", phone.headers["cache-control"] === "no-store", phone.headers["cache-control"]);
        check("폰 302: Vary에 User-Agent", /user-agent/i.test(String(phone.headers.vary)), String(phone.headers.vary));
        check("폰 302: 보안 머리말 그대로", phone.headers["x-frame-options"] === "DENY");

        const pc = await request("example.com", "/lobby", { headers: { "User-Agent": PC_UA } });
        check("PC 화면 200", pc.status === 200, `코드 ${pc.status}`);
        check("PC HTML: private, no-cache", pc.headers["cache-control"] === "private, no-cache", pc.headers["cache-control"]);
        check("PC HTML: Vary에 User-Agent", /user-agent/i.test(String(pc.headers.vary)), String(pc.headers.vary));
    }

    if (mode === "cloudflare") {
        // 클라우드플레어는 X-Forwarded-For 뒤에 사용자 IP를 이어 붙여 보냄 (앞은 사람이 넣은 값)
        const r = await request("api.example.com", "/whoami", {
            headers: { "CF-Connecting-IP": REAL, "X-Forwarded-For": `6.6.6.6, ${REAL}` },
        });
        check("API: CF-Connecting-IP가 진짜 IP", r.json?.ip === REAL, `백엔드가 본 IP ${r.json?.ip}`);
        check("API: 백엔드로 가는 X-Forwarded-For는 진짜 IP 하나", r.json?.xff === REAL, `받은 값 ${r.json?.xff}`);

        const v6 = await request("api.example.com", "/whoami", { headers: { "CF-Connecting-IP": "2001:db8::7" } });
        check("API: IPv6 진짜 IP", v6.json?.ip === "2001:db8::7", `백엔드가 본 IP ${v6.json?.ip}`);

        const allowed = await request("api.example.com", "/internal/ping", { headers: { "CF-Connecting-IP": REAL } });
        check("/internal: 허용 IP(클라우드플레어 거침)는 통과", allowed.status === 200, `코드 ${allowed.status}`);
        const denied = await request("api.example.com", "/internal/ping", { headers: { "CF-Connecting-IP": OTHER } });
        check("/internal: 다른 IP는 403", denied.status === 403, `코드 ${denied.status}`);

        const ip = await socketIp({ "CF-Connecting-IP": REAL });
        check("소켓: CF-Connecting-IP가 진짜 IP", ip === REAL, `소켓이 본 IP ${ip}`);

        // 로그인 제한(1분 10번 + 5)은 사람마다: 한 사람이 넘쳐도 다른 사람은 그대로
        const codes = [];
        for (let i = 0; i < 20; i += 1) {
            codes.push((await request("api.example.com", "/auth/login", { method: "POST", headers: { "CF-Connecting-IP": "198.51.100.20" } })).status);
        }
        check("로그인 제한: 한 사람 20번 → 429 나옴", codes.includes(429), codes.join(","));
        const other = await request("api.example.com", "/auth/login", { method: "POST", headers: { "CF-Connecting-IP": "198.51.100.21" } });
        check("로그인 제한: 다른 사람은 안 막힘", other.status === 200, `코드 ${other.status}`);
    }

    if (failed) {
        console.log(`[${mode}] 실패 ${failed}개`);
        process.exit(1);
    }
    console.log(`[${mode}] 전부 통과`);
}

main().catch((err) => { console.error(err); process.exit(1); });
