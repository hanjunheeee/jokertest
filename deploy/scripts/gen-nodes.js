#!/usr/bin/env node
// Node 여러 개 배포 파일 만들기, NODE_COUNT(없으면 코어 수)로 nginx upstream 조각·compose 추가 서비스를 씀
// remote.sh·사람이 부름, e2e 앞단(e2e/scripts/lb-nginx.js)·pm2 설정 시험도 같은 규칙을 씀 (docs/배포_설정.md 7장)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_UPSTREAMS = path.join(ROOT, "nginx", "snippets", "mmc-upstreams.conf");
const DEFAULT_COMPOSE = path.join(ROOT, "docker-compose.nodes.yml");
// 한 기계에 이보다 많이 띄울 일 없음 (오타로 수백 개 만드는 것 막기)
const MAX_NODES = 64;
const TARGETS = ["docker", "pm2", "e2e"];

// NODE_COUNT: 1~64 정수면 그 값, 아니면 코어 수 (서버 코드는 이 값을 안 읽음)
function resolveNodeCount(raw, cpuCount = os.cpus().length) {
    const n = Number(String(raw ?? "").trim());
    if (String(raw ?? "").trim() !== "" && Number.isInteger(n) && n >= 1 && n <= MAX_NODES) return n;
    return Math.min(MAX_NODES, Math.max(1, cpuCount));
}

// Node 목록 [{ id, host, port }] — 이름·포트 규칙은 여기 한 곳 (ecosystem.config.cjs도 같은 규칙, 시험이 맞춰 봄)
// docker: n1 = base의 backend 서비스(compose exec backend 스크립트 그대로), n2.. = backend-n2..
// pm2: 127.0.0.1:4001.. / e2e: e2e-n1.. 127.0.0.1(또는 host):4101..
function planNodes({ count, target = "docker", host, basePort } = {}) {
    if (!TARGETS.includes(target)) throw new Error(`target은 ${TARGETS.join("|")} 중 하나`);
    const list = [];
    for (let i = 1; i <= count; i += 1) {
        if (target === "docker") list.push({ id: `n${i}`, host: i === 1 ? "backend" : `backend-n${i}`, port: 4000 });
        if (target === "pm2") list.push({ id: `n${i}`, host: host ?? "127.0.0.1", port: (basePort ?? 4001) + i - 1 });
        if (target === "e2e") list.push({ id: `e2e-n${i}`, host: host ?? "127.0.0.1", port: (basePort ?? 4101) + i - 1 });
    }
    return list;
}

// upstream 한 줄 (docker는 resolve: 컨테이너가 꺼져 있어도 nginx가 켜지고, 다시 만들어 IP가 바뀌어도 따라감)
const serverLine = (node, { resolve, backup }) =>
    `  server ${node.host}:${node.port}${backup ? " backup" : " max_fails=1 fail_timeout=5s"}${resolve ? " resolve" : ""};`;

// upstream 묶음 하나 (zone은 resolve에 필요, docker 망 DNS는 127.0.0.11)
function upstreamBlock(name, lines, { resolve, balance }) {
    return [
        `upstream ${name} {`,
        ...(balance ? [`  ${balance};`] : []),
        `  zone ${name} 64k;`,
        ...(resolve ? ["  resolver 127.0.0.11 valid=10s ipv6=off;"] : []),
        ...lines,
        "}",
    ].join("\n");
}

/**
 * nginx 조각 글: mmc_any(아무 Node) + Node마다 mmc_node_<번호>(그 Node 먼저, 죽으면 나머지 backup) + ?node= map
 * 모르는 ?node= 값은 mmc_any (MN-137)
 * @param {{id:string,host:string,port:number}[]} nodes
 * @param {{ resolve?:boolean, lb?:'least'|'rr', target?:string }} [o]
 */
function renderUpstreams(nodes, { resolve = false, lb = "least", target = "docker" } = {}) {
    const balance = lb === "least" ? "least_conn" : null;
    const blocks = [upstreamBlock("mmc_any", nodes.map((n) => serverLine(n, { resolve })), { resolve, balance })];
    nodes.forEach((node, i) => {
        const others = nodes.filter((n) => n !== node).map((n) => serverLine(n, { resolve, backup: true }));
        blocks.push(upstreamBlock(`mmc_node_${i + 1}`, [serverLine(node, { resolve }), ...others], { resolve }));
    });
    const map = ["map $arg_node $mmc_upstream {", "  default mmc_any;", ...nodes.map((n, i) => `  "${n.id}" mmc_node_${i + 1};`), "}"];
    return [
        "# 생성 파일, 손으로 고치지 말고 다시 만들기: node deploy/scripts/gen-nodes.js (docs/배포_설정.md 7장)",
        `# Node ${nodes.length}개 (${target}): ${nodes.map((n) => `${n.id}=${n.host}:${n.port}`).join(" ")}`,
        "# default.conf API 사이트가 proxy_pass http://$mmc_upstream; 으로 씀 → 화면이 ?node=<SERVER_ID>를 붙이면 그 Node, 없거나 모르는 값이면 아무 Node",
        "",
        ...blocks.flatMap((b) => [b, ""]),
        ...map,
        "",
    ].join("\n");
}

/**
 * compose 추가 서비스 글: n2..를 base backend에서 물려받고 SERVER_ID만 바꿈 (n1은 base backend 그대로)
 * extends는 파일마다 따로 읽어서 file: 을 꼭 적음 → 레지스트리 이미지 이름은 registry=true일 때 여기에도 씀
 */
function renderComposeNodes(nodes, { registry = false } = {}) {
    const head = [
        "# 생성 파일, 손으로 고치지 말고 다시 만들기: node deploy/scripts/gen-nodes.js (docs/배포_설정.md 7장)",
        `# Node ${nodes.length}개: n1 = docker-compose.yml의 backend, 나머지는 아래 (같은 이미지·환경값, SERVER_ID만 다름)`,
        "# 쓰는 법: docker compose -f docker-compose.yml [-f docker-compose.prod.yml] -f docker-compose.nodes.yml up -d",
    ];
    const extra = nodes.filter((n) => n.host !== "backend");
    if (extra.length === 0) return [...head, "services: {}", ""].join("\n");
    const services = extra.flatMap((n) => [
        `  ${n.host}:`,
        "    extends:",
        "      file: docker-compose.yml",
        "      service: backend",
        ...(registry ? ["    image: ${IMAGE_REGISTRY:?IMAGE_REGISTRY 필요}/mmc-backend:${IMAGE_TAG:?IMAGE_TAG 필요}"] : []),
        "    environment:",
        `      - SERVER_ID=${n.id}`,
    ]);
    return [...head, "services:", ...services, ""].join("\n");
}

// 명령줄 읽기: --count N --target docker|pm2|e2e --registry --upstreams 파일 --compose 파일 --host H --base-port P --lb least|rr --print
function parseArgs(argv) {
    const o = { target: "docker", registry: false, print: false, lb: "least" };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === "--count") o.count = next();
        else if (a === "--target") o.target = next();
        else if (a === "--registry") o.registry = true;
        else if (a === "--upstreams") o.upstreams = next();
        else if (a === "--compose") o.compose = next();
        else if (a === "--host") o.host = next();
        else if (a === "--base-port") o.basePort = Number(next());
        else if (a === "--lb") o.lb = next();
        else if (a === "--print") o.print = true;
        else throw new Error(`모르는 값: ${a}`);
    }
    return o;
}

// 파일 쓰기: 제자리에 덮어씀 (nginx 컨테이너가 폴더를 붙여 읽음 → reload만 하면 새 글)
function main(argv = process.argv.slice(2), env = process.env) {
    const o = parseArgs(argv);
    const count = resolveNodeCount(o.count ?? env.NODE_COUNT);
    const nodes = planNodes({ count, target: o.target, host: o.host, basePort: o.basePort });
    const upstreams = renderUpstreams(nodes, { resolve: o.target === "docker", lb: o.lb, target: o.target });
    const compose = o.target === "docker" ? renderComposeNodes(nodes, { registry: o.registry }) : null;
    if (o.print) {
        process.stdout.write(upstreams);
        if (compose) process.stdout.write(`\n# ---- compose ----\n${compose}`);
        return { count, nodes };
    }
    fs.writeFileSync(o.upstreams ?? DEFAULT_UPSTREAMS, upstreams);
    if (compose) fs.writeFileSync(o.compose ?? DEFAULT_COMPOSE, compose);
    console.log(`[gen-nodes] Node ${count}개 (${o.target}): ${nodes.map((n) => n.id).join(", ")}`);
    return { count, nodes };
}

module.exports = { resolveNodeCount, planNodes, renderUpstreams, renderComposeNodes, parseArgs, main, MAX_NODES };

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`[gen-nodes] 실패 — ${error.message}`);
        process.exit(1);
    }
}
