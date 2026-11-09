#!/usr/bin/env node
'use strict';

// CI 시험 DB에 root로 SQL 보내기 파일, 표준 입력의 SQL을 그대로 실행 (mysql 명령 줄 도구 대신, 러너에 mysql이 없어도 됨)
// docker-shim/docker가 부름 · --ping이면 접속될 때까지 기다리기만, 성공하면 아무것도 안 찍음(앱 스크립트가 출력 있으면 실패로 봄)
// 값: CI_DB_HOST(기본 127.0.0.1)·CI_DB_PORT(기본 3306)·MYSQL_ROOT_PASSWORD — 비번은 안 찍음
const path = require('node:path');
const { createRequire } = require('node:module');

// mysql2는 backend 의존성 것을 빌려 씀 (CI 스크립트용 패키지를 따로 안 둠)
const backendRequire = createRequire(path.join(__dirname, '..', '..', '..', '..', 'backend', 'package.json'));
const mysql = backendRequire('mysql2/promise');

const config = {
    host: process.env.CI_DB_HOST || '127.0.0.1',
    port: Number(process.env.CI_DB_PORT || 3306),
    user: 'root',
    password: process.env.MYSQL_ROOT_PASSWORD || '',
    multipleStatements: true,
    connectTimeout: 5000,
};

const readStdin = () => new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
});

// 서비스 컨테이너가 막 켜졌을 때 몇 초 못 붙음 → 기다림 (기본 120초)
const ping = async () => {
    const until = Date.now() + Number(process.env.CI_DB_WAIT_SECONDS || 120) * 1000;
    let last = null;
    while (Date.now() < until) {
        try {
            const conn = await mysql.createConnection(config);
            await conn.query('SELECT 1');
            await conn.end();
            return;
        } catch (error) {
            last = error;
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    throw new Error(`시험 DB에 못 붙음 (${config.host}:${config.port}): ${last?.code ?? last?.message}`);
};

const run = async () => {
    const sql = await readStdin();
    if (!sql.trim()) return;
    const conn = await mysql.createConnection(config);
    try {
        await conn.query(sql);
    } finally {
        await conn.end();
    }
};

(process.argv.includes('--ping') ? ping() : run()).catch((error) => {
    console.error(`[ci-mysql] ${error.message}`);
    process.exit(1);
});
