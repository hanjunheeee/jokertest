// e2e 앞단(e2e/scripts/lb-proxy.js) 시험 파일, 가짜 Node 둘 + 앞단을 잠깐 켜서 nginx 규칙과 같게 고르는지 (MN-109·137 앞단 쪽)
// 번갈아 나누기·?node= 고르기·모르는 값·죽은 Node backup·Set-Cookie 여러 줄·X-Forwarded-For 하나·웹소켓 업그레이드 잇기
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const { createPicker, startNodeProxy } = require(path.join(__dirname, "..", "..", "..", "e2e", "scripts", "lb-proxy.js"));

// 가짜 Node: /who → 이름·받은 X-Forwarded-For, 쿠키 두 줄, 업그레이드는 101 뒤 받은 글자 되돌림
function fakeNode(id) {
    const server = http.createServer((req, res) => {
        res.setHeader("Set-Cookie", [`a=${id}`, "b=2"]);
        res.end(JSON.stringify({ id, xff: req.headers["x-forwarded-for"], url: req.url }));
    });
    server.on("upgrade", (req, socket) => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Node: ${id}\r\n\r\n`);
        socket.on("data", (d) => socket.write(d));
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ id, server, port: server.address().port })));
}

const getJson = (port, p) => new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: p, headers: { "x-forwarded-for": "6.6.6.6" } }, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => resolve({ status: res.statusCode, cookies: res.headers["set-cookie"], body: body ? JSON.parse(body) : null }));
    }).on("error", reject);
});

test("고르기: rr은 번갈아, ?node= 아는 값은 그 Node 먼저, 모르는 값은 아무 Node", () => {
    const picker = createPicker({ nodes: [{ id: "n1", port: 1 }, { id: "n2", port: 2 }], lb: "rr" });
    const first = [1, 2, 3, 4].map(() => picker.candidates("/health")[0].id);
    assert.deepEqual(first, ["n1", "n2", "n1", "n2"]);
    assert.deepEqual(picker.candidates("/socket.io/?EIO=4&node=n2").map((n) => n.id), ["n2", "n1"]);
    assert.equal(picker.candidates("/x?node=nope").length, 2);
    assert.equal(picker.candidates("/x?node=%zz").length, 2);
});

test("고르기: 죽음 표시 Node는 5초 동안 뒤로 (?node=로 골라도 backup 먼저)", () => {
    let now = 1000;
    const picker = createPicker({ nodes: [{ id: "n1", port: 1 }, { id: "n2", port: 2 }], lb: "rr", now: () => now });
    picker.markDown(picker.state[1]);
    assert.deepEqual(picker.candidates("/?node=n2").map((n) => n.id), ["n1", "n2"]);
    now += 5001;
    assert.deepEqual(picker.candidates("/?node=n2").map((n) => n.id), ["n2", "n1"]);
});

test("고르기: least는 연결 적은 Node 먼저", () => {
    const picker = createPicker({ nodes: [{ id: "n1", port: 1 }, { id: "n2", port: 2 }], lb: "least" });
    picker.state[0].active = 3;
    assert.equal(picker.candidates("/")[0].id, "n2");
});

test("앞단 HTTP: 번갈아·?node=·쿠키 두 줄·X-Forwarded-For는 바로 붙은 주소 하나", async (t) => {
    const s = await startTestProxy(t);
    const ids = [];
    for (let i = 0; i < 4; i += 1) ids.push((await getJson(s.port, "/who")).body.id);
    assert.deepEqual(new Set(ids), new Set(["e2e-n1", "e2e-n2"]));
    assert.notEqual(ids[0], ids[1]);
    for (let i = 0; i < 3; i += 1) assert.equal((await getJson(s.port, "/who?node=e2e-n2")).body.id, "e2e-n2");
    const r = await getJson(s.port, "/who?node=e2e-n1");
    assert.deepEqual(r.cookies, ["a=e2e-n1", "b=2"]);
    assert.equal(r.body.xff, "127.0.0.1");
    assert.equal(r.body.url, "/who?node=e2e-n1");
});

test("앞단 HTTP: 고른 Node가 죽었으면 다른 Node가 받음 (MN-109 앞단 쪽)", async (t) => {
    const s = await startTestProxy(t);
    await new Promise((r) => s.b.server.close(r));
    s.b.server.closeAllConnections?.();
    const r = await getJson(s.port, "/who?node=e2e-n2");
    assert.equal(r.status, 200);
    assert.equal(r.body.id, "e2e-n1");
});

test("앞단 웹소켓: ?node= Node로 업그레이드가 이어지고 글자가 오감", async (t) => {
    const s = await startTestProxy(t);
    const reply = await new Promise((resolve, reject) => {
        const sock = net.connect(s.port, "127.0.0.1", () => {
            sock.write("GET /socket.io/?EIO=4&transport=websocket&node=e2e-n2 HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
        });
        let got = "";
        sock.on("data", (d) => {
            got += d.toString();
            if (got.includes("\r\n\r\n") && !got.includes("ping")) sock.write("ping");
            if (got.endsWith("ping")) { sock.destroy(); resolve(got); }
        });
        sock.on("error", reject);
        setTimeout(() => { sock.destroy(); reject(new Error("시간 초과")); }, 3000);
    });
    assert.match(reply, /^HTTP\/1\.1 101/);
    assert.match(reply, /X-Node: e2e-n2/);
});

// 앞단을 남는 포트에 켬 (port 0 → 실제 포트는 돌려받은 port)
async function startTestProxy(t) {
    const a = await fakeNode("e2e-n1");
    const b = await fakeNode("e2e-n2");
    const proxy = await startNodeProxy({ port: 0, nodes: [{ id: a.id, port: a.port }, { id: b.id, port: b.port }], lb: "rr" });
    t.after(async () => { await proxy.close(); a.server.close(); b.server.close(); });
    return { a, b, proxy, port: proxy.port };
}

