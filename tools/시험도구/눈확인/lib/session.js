'use strict';

// 장면 하나의 창·계정·봇 묶음 파일, 장면 준비 함수가 받는 s (사람 창 열기·봇 띄우기·뒷정리)
// run.js가 장면마다 하나 만들고 장면이 끝나면 닫음 — 한 판으로 엮인 장면(chain)은 같은 s를 이어 씀
const { fromE2e } = require('./paths');

const accountsLib = fromE2e('helpers/accounts');
const ui = fromE2e('helpers/ui');
const { DESKTOP, MOBILE } = fromE2e('helpers/fixtures');
const { spawnBots } = fromE2e('helpers/bots');

class Session {
    /**
     * @param {object} o
     * @param {import('./windows').Windows} o.windows
     * @param {object} o.scene 지금 장면 (엮인 장면이면 이어 받을 때 바뀜)
     * @param {boolean} o.hidden 뒤에서 준비 중이면 true (창을 내려 둠)
     */
    constructor({ windows, scene, hidden, log }) {
        this.windows = windows;
        this.scene = scene;
        this.hidden = hidden;
        this.log = log;
        /** 연 사람 창 [{ account, context, page, kind, label }] — 첫 사람이 사진 찍을 창 */
        this.people = [];
        /** 엮인 장면끼리 넘기는 값 (예: state.table) */
        this.state = {};
        /** 이번 장면이 이어 받은 것인지 (앞 장면과 같은 판) */
        this.chained = false;
        /** 장면이 알려 주는 덧붙임 글 (status.json now.notes) */
        this.notes = [];
        /** 창 없는 모드에서 뜬 알림 글 */
        this.alerts = [];
        this.cleanups = [];
        this.tasks = [];
        this.bots = [];
        this.closed = false;
    }

    get headless() { return this.windows.headless; }
    /** 사진 찍을 창 (첫 사람) */
    get main() { return this.people[0]?.page ?? null; }

    /** status.json에 보일 덧붙임 한 줄 */
    note(text) { this.notes.push(text); }

    /** 장면이 닫힐 때 부를 것 */
    keep(fn) { this.cleanups.push(fn); }

    /** 뒤에서 도는 일 (실패해도 장면은 그대로, 기록만 — 장면을 닫아 끊긴 것은 안 적음) */
    background(promise) {
        this.tasks.push(Promise.resolve(promise).catch((e) => !this.closed && this.log(`[${this.scene.id}] 뒤 작업 실패: ${String(e?.message ?? e).split('\n')[0]}`)));
    }

    /** 창 하나를 이 장면에 넣음 (도우미가 직접 만든 창, 예: 관리자 창) — kind는 그 창을 만든 브라우저 */
    async adopt({ context, page, account = null, kind = 'big', label }) {
        const entry = { account, context, page, kind, label: label ?? `창${this.people.length + 1}` };
        this.people.push(entry);
        this.keep(() => context.close().catch(() => {}));
        this.watchAlerts(page);
        if (this.hidden) await this.windows.hide(entry);
        return entry;
    }

    // 알림창: 창 보이는 모드는 사람이 직접 닫게 둠 (Playwright가 저절로 닫지 않게 빈 처리기), 창 없는 모드는 글만 적고 닫음
    watchAlerts(page) {
        page.on('dialog', (dialog) => {
            if (!this.headless) return;
            this.alerts.push(dialog.message());
            dialog.accept().catch(() => {});
        });
    }

    /**
     * 사람 창 하나 열기 → { account, context, page, kind, label }
     * @param {object} [o]
     * @param {boolean} [o.mobile=false] 폰 크기(375×812, 5274)
     * @param {boolean} [o.big] 실제 크기 창 (폰은 늘 큰 창, 안 정하면 화면 수만큼 앞사람부터 큰 창·나머지는 줄인 창)
     * @param {object} [o.account] 쓸 계정 (없으면 새로 만듦)
     * @param {object} [o.accountOptions] 새로 만들 때 값 (닉네임 등, helpers/accounts createAccount)
     * @param {boolean} [o.login=true] API로 로그인 (false면 로그아웃 상태 빈 창)
     * @param {boolean} [o.lobby=true] 로그인 뒤 로비까지
     * @param {object} [o.contextOptions] 창 값 덮어쓰기 (예: { viewport: { width: 360, height: 800 } })
     */
    async person({ mobile = false, big, account, accountOptions, login = true, lobby = true, contextOptions = {}, label } = {}) {
        // 큰 창은 화면(모니터) 수만큼 앞사람부터, 나머지는 줄인 창 (big으로 정하면 그대로)
        const bigCount = this.people.filter((p) => p.kind === 'big').length;
        const kind = mobile || big || (big === undefined && bigCount < this.windows.screens.length) ? 'big' : 'small';
        const browser = await this.windows.browser(kind);
        const scale = this.windows.scaleOf(kind);
        const options = { ...(mobile ? MOBILE : DESKTOP), ...contextOptions };
        if (scale !== 1) options.deviceScaleFactor = scale;
        const context = await browser.newContext(options);
        this.keep(() => context.close().catch(() => {}));
        const page = await context.newPage();
        const acc = account ?? (login ? await accountsLib.createAccount(accountOptions) : null);
        const entry = { account: acc, context, page, kind, label: label ?? `사람${this.people.length + 1}` };
        this.people.push(entry);
        this.watchAlerts(page);
        if (this.hidden) await this.windows.hide(entry);
        if (login) await ui.loginViaApi(context, acc);
        if (login && lobby) await ui.gotoLobby(page);
        return entry;
    }

    /** 소켓 봇 n개 (로그인·접속됨, 장면이 닫히면 닫힘) */
    async spawnBots(n, accountOptions = {}) {
        const accs = await accountsLib.createAccounts(n, accountOptions);
        const list = await spawnBots(accs, { startIndex: this.bots.length + 1 });
        this.bots.push(...list);
        this.keep(() => Promise.all(list.map((b) => b.close().catch(() => {}))));
        return list;
    }

    /** 이 장면 창들 앞으로 늘어놓기 → 겹친 창 수 */
    async show() {
        this.hidden = false;
        return this.windows.arrange(this.people);
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        for (const fn of this.cleanups.reverse()) await fn();
    }
}

module.exports = { Session };
