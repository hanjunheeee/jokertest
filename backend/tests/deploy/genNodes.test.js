// Node 여러 개 배포 생성기 시험 파일, NODE_COUNT 기본값·upstream·compose·pm2 목록이 같은 Node를 가리키는지 (MN-135·137)
// deploy/scripts/gen-nodes.js와 backend/ecosystem.config.cjs를 같이 봄, nginx -t(MN-136)는 docker가 필요해서 deploy/scripts/nginx-nodes-check.sh
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const gen = require(path.join(__dirname, "..", "..", "..", "deploy", "scripts", "gen-nodes.js"));
const { buildConfig } = require(path.join(__dirname, "..", "..", "ecosystem.config.cjs"));

// map 줄에서 "id" → upstream 이름
const mapEntries = (text) => Object.fromEntries([...text.matchAll(/^\s+"([^"]+)" (mmc_node_\d+);$/gm)].map((m) => [m[1], m[2]]));
// upstream 묶음 하나의 server 줄
const serversOf = (text, name) => {
    const block = text.match(new RegExp(`upstream ${name} \\{([\\s\\S]*?)\\n\\}`))[1];
    return [...block.matchAll(/server (\S+)( backup| max_fails)/g)].map((m) => ({ addr: m[1], backup: m[2] === " backup" }));
};

test("MN-135 NODE_COUNT 없거나 틀리면 코어 수, 1~64 정수면 그 값", () => {
    assert.equal(gen.resolveNodeCount(undefined, 6), 6);
    assert.equal(gen.resolveNodeCount("", 3), 3);
    assert.equal(gen.resolveNodeCount("abc", 4), 4);
    assert.equal(gen.resolveNodeCount("0", 4), 4);
    assert.equal(gen.resolveNodeCount("2.5", 4), 4);
    assert.equal(gen.resolveNodeCount("65", 4), 4);
    assert.equal(gen.resolveNodeCount(" 2 ", 8), 2);
    assert.equal(gen.resolveNodeCount(undefined, 0), 1);
    assert.equal(gen.resolveNodeCount(undefined, 200), gen.MAX_NODES);
});

test("MN-135 docker: upstream map·compose 서비스·Node 목록이 같은 Node (n1 = base backend)", () => {
    const nodes = gen.planNodes({ count: 3, target: "docker" });
    assert.deepEqual(nodes.map((n) => n.id), ["n1", "n2", "n3"]);
    assert.deepEqual(nodes.map((n) => n.host), ["backend", "backend-n2", "backend-n3"]);
    const upstreams = gen.renderUpstreams(nodes, { resolve: true });
    assert.deepEqual(Object.keys(mapEntries(upstreams)), ["n1", "n2", "n3"]);
    assert.deepEqual(serversOf(upstreams, "mmc_any").map((s) => s.addr), ["backend:4000", "backend-n2:4000", "backend-n3:4000"]);
    const compose = gen.renderComposeNodes(nodes);
    assert.deepEqual([...compose.matchAll(/^ {2}(backend-n\d+):$/gm)].map((m) => m[1]), ["backend-n2", "backend-n3"]);
    assert.deepEqual([...compose.matchAll(/SERVER_ID=(\S+)/g)].map((m) => m[1]), ["n2", "n3"]);
    assert.match(compose, /file: docker-compose\.yml/);
    assert.doesNotMatch(compose, /image:/);
    assert.match(gen.renderComposeNodes(nodes, { registry: true }), /image: \$\{IMAGE_REGISTRY:\?/);
});

test("MN-137 ?node= 아는 값은 그 Node 먼저·나머지 backup, 모르는 값·없음은 mmc_any", () => {
    const nodes = gen.planNodes({ count: 2, target: "docker" });
    const text = gen.renderUpstreams(nodes, { resolve: true });
    assert.match(text, /map \$arg_node \$mmc_upstream \{\n {2}default mmc_any;/);
    const n2 = serversOf(text, mapEntries(text).n2);
    assert.deepEqual(n2, [{ addr: "backend-n2:4000", backup: false }, { addr: "backend:4000", backup: true }]);
    assert.match(text, /upstream mmc_any \{\n {2}least_conn;/);
    // docker는 resolve + 망 안 DNS (컨테이너를 다시 만들어 IP가 바뀌어도 따라감)
    assert.match(text, /resolver 127\.0\.0\.11/);
    assert.ok(serversOf(text, "mmc_any").length === 2);
    assert.doesNotMatch(gen.renderUpstreams(nodes, { resolve: false }), /resolve/);
    assert.doesNotMatch(gen.renderUpstreams(nodes, { lb: "rr" }), /least_conn/);
});

test("MN-135 Node 1개: backup 없음·compose 추가 서비스 없음 (저장소 기본 파일과 같은 글)", () => {
    const nodes = gen.planNodes({ count: 1, target: "docker" });
    const text = gen.renderUpstreams(nodes, { resolve: true });
    assert.doesNotMatch(text, /backup/);
    assert.match(gen.renderComposeNodes(nodes), /^services: \{\}$/m);
    const fs = require("node:fs");
    const root = path.join(__dirname, "..", "..", "..");
    assert.equal(fs.readFileSync(path.join(root, "nginx", "snippets", "mmc-upstreams.conf"), "utf8"), text);
    assert.equal(fs.readFileSync(path.join(root, "docker-compose.nodes.yml"), "utf8"), gen.renderComposeNodes(nodes));
});

test("MN-135 pm2: ecosystem 앱 목록이 gen-nodes pm2 목록과 같음 (이름·포트·SERVER_ID)", () => {
    for (const count of [2, 4]) {
        const apps = buildConfig({ env: { REDIS_URL: "redis://x", NODE_COUNT: String(count) }, fileEnv: {}, cpuCount: 8 }).apps;
        const plan = gen.planNodes({ count, target: "pm2" });
        assert.deepEqual(apps.map((a) => [a.env.SERVER_ID, Number(a.env.PORT)]), plan.map((n) => [n.id, n.port]));
        assert.ok(apps.every((a) => a.exec_mode === "fork" && a.instances === 1 && a.kill_timeout === 15000));
    }
    // NODE_COUNT 없으면 코어 수
    assert.equal(buildConfig({ env: { REDIS_URL: "redis://x" }, fileEnv: {}, cpuCount: 3 }).apps.length, 3);
    // backend/.env 값도 읽음
    assert.equal(buildConfig({ env: {}, fileEnv: { REDIS_URL: "redis://x", NODE_COUNT: "2" }, cpuCount: 8 }).apps.length, 2);
});

test("pm2: REDIS_URL 없으면 Node 1개, 예전 앱 그대로 (이름 mmc-backend, PORT·SERVER_ID는 .env)", () => {
    const { apps } = buildConfig({ env: { NODE_COUNT: "4" }, fileEnv: {}, cpuCount: 8 });
    assert.equal(apps.length, 1);
    assert.equal(apps[0].name, "mmc-backend");
    assert.deepEqual(apps[0].env, { NODE_ENV: "production" });
    assert.equal(buildConfig({ env: { REDIS_URL: "redis://x", NODE_COUNT: "1" }, fileEnv: {}, cpuCount: 8 }).apps[0].name, "mmc-backend");
});

test("e2e: e2e-n1.. 4101.. (e2e/helpers/env.js·lb-nginx.js가 같은 규칙)", () => {
    assert.deepEqual(gen.planNodes({ count: 2, target: "e2e" }).map((n) => [n.id, n.host, n.port]), [["e2e-n1", "127.0.0.1", 4101], ["e2e-n2", "127.0.0.1", 4102]]);
    assert.throws(() => gen.planNodes({ count: 1, target: "k8s" }), /target/);
});

test("명령줄: 모르는 값은 던짐, --print는 파일 안 씀", () => {
    assert.throws(() => gen.parseArgs(["--what"]), /모르는 값/);
    const o = gen.parseArgs(["--count", "2", "--target", "pm2", "--lb", "rr"]);
    assert.deepEqual([o.count, o.target, o.lb], ["2", "pm2", "rr"]);
    const write = process.stdout.write;
    let out = "";
    process.stdout.write = (s) => { out += s; return true; };
    try { gen.main(["--count", "2", "--print"], {}); } finally { process.stdout.write = write; }
    assert.match(out, /backend-n2:4000/);
    assert.match(out, /---- compose ----/);
});
