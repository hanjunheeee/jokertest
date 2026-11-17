'use strict';

// "다음" 신호 받기 파일, 터미널 Enter·글과 신호 파일(.run/eyecheck/next)을 같은 명령 줄로 모음
// 명령: next(빈 글·Enter) · prev · goto <번호> · again(지금 장면 새로) · stop — run.js가 하나씩 꺼내 씀
const fs = require('node:fs');
const readline = require('node:readline');
const { SIGNAL_FILE } = require('./paths');

/**
 * 글 한 줄 → 명령
 * @example parse('') // { type: 'next' }  ·  parse('goto 바-07') // { type: 'goto', id: '바-07' }  ·  parse('다음') // { type: 'next' }
 */
function parse(raw) {
    const text = String(raw ?? '').trim();
    if (text === '' || /^(next|n|다음)$/i.test(text)) return { type: 'next' };
    if (/^(prev|p|back|앞|이전)$/i.test(text)) return { type: 'prev' };
    if (/^(again|r|다시)$/i.test(text)) return { type: 'again' };
    if (/^(stop|q|quit|끝|그만)$/i.test(text)) return { type: 'stop' };
    const m = /^(?:goto|g|가기)\s+(\S+)$/i.exec(text);
    if (m) return { type: 'goto', id: m[1] };
    return { type: 'unknown', text };
}

class Signals {
    constructor({ log }) {
        this.log = log;
        this.queue = [];
        this.waiters = [];
        this.timer = null;
        this.rl = null;
    }

    push(cmd, from) {
        cmd.from = from;
        cmd.at = Date.now();
        if (cmd.type === 'unknown') { this.log(`모르는 신호 (${from}): ${cmd.text} → next·prev·goto <번호>·again·stop`); return; }
        const w = this.waiters.shift();
        if (w) w(cmd); else this.queue.push(cmd);
    }

    start() {
        // 신호 파일: 생기면 읽고 지움 (글이 여러 줄이면 줄마다 명령)
        fs.rmSync(SIGNAL_FILE, { force: true });
        this.timer = setInterval(() => {
            let text;
            try { text = fs.readFileSync(SIGNAL_FILE, 'utf8'); } catch { return; }
            fs.rmSync(SIGNAL_FILE, { force: true });
            const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            for (const line of lines.length ? lines : ['']) this.push(parse(line), '파일');
        }, 250);
        // 터미널 줄 (Git Bash 창은 TTY로 안 잡혀서 늘 붙임, 뒤에서 돌려 입력이 없으면 그냥 닫힘 → 파일 신호만)
        if (process.env.EYECHECK_NO_STDIN !== '1') {
            this.rl = readline.createInterface({ input: process.stdin });
            this.rl.on('line', (line) => this.push(parse(line), '터미널'));
        }
    }

    /** 다음 명령 기다림 */
    next() {
        const cmd = this.queue.shift();
        if (cmd) return Promise.resolve(cmd);
        return new Promise((resolve) => this.waiters.push(resolve));
    }

    stop() {
        clearInterval(this.timer);
        this.rl?.close();
    }
}

module.exports = { Signals, parse };
