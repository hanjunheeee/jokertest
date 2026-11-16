'use strict';

// 마지막 자리 다툼 브라우저 시험 (어려움, 사람 2) — 두 사람 동시 코드 입장이면 한 명만, 초대 수락 중이면 초대받은 사람 자리를 지킴
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-H-505·506
const { test, expect, ui } = require('../../helpers/fixtures');
const K = require('./_a01b-join-kit');

const { MSG, U } = K;

/**
 * "참여하기"를 누른 뒤 결과 지켜보기 → { kind:'joined' } 대기방으로 감 / { kind:'alert', message } 알림 창
 * 누르기 전에 걸어 둠 (두 사람이 같이 누를 때 알림을 놓치지 않게)
 */
function watchJoin(page, { timeoutMs = 20_000 } = {}) {
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            page.off('dialog', onDialog);
            clearTimeout(timer);
            resolve(value);
        };
        const onDialog = (dialog) => {
            const message = dialog.message();
            dialog.accept().catch(() => {});
            finish({ kind: 'alert', message });
        };
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            page.off('dialog', onDialog);
            reject(new Error('입장 결과가 안 옴 (대기방도 알림도 아님)'));
        }, timeoutMs);
        page.on('dialog', onDialog);
        page.waitForURL(/\/game-matching/, { timeout: timeoutMs }).then(() => finish({ kind: 'joined' })).catch(() => {});
    });
}

test('A01-H-505 마지막 자리 두 사람 동시 코드 입장 (정원 5 · 봇 4 + 사람 2) → 한 명만 대기방, 다른 한 명 "방 정원이 가득 찼습니다." @hard @smoke', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    const { code, host } = await K.botRoom(bots, { max: 5, count: 4 });
    // 두 사람 다 코드를 쳐 두고 같은 때 누름
    await K.typeCode(a.page, code);
    await K.typeCode(b.page, code);
    const results = Promise.all([watchJoin(a.page), watchJoin(b.page)]);
    await Promise.all([K.joinButton(a.page).click(), K.joinButton(b.page).click()]);
    const [ra, rb] = await results;
    const kinds = [ra.kind, rb.kind].sort();
    expect(kinds, '한 명만 들어감').toEqual(['alert', 'joined']);
    const refused = ra.kind === 'alert' ? ra : rb;
    expect(refused.message).toBe(MSG.CODE_FULL);
    expect(await K.roomSize(host.uuid)).toBe(5);
    // 들어간 사람 화면 인원 5
    const joined = ra.kind === 'joined' ? a : b;
    await K.expectParty(joined.page, 5);
});

test('A01-H-506 초대 수락 중 코드 입장이 마지막 자리 노림 (정원 6 · 봇 5 + 사람 2) → A 대기방, B "방 정원이 가득 찼습니다." @hard', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    // 마지막 한 자리: 정원 6에 봇 5 (목록 "봇 4"면 두 사람 다 들어가 다툼이 안 생김 — 보고에 적음)
    const { code, host } = await K.botRoom(bots, { max: 6, count: 5 });
    await K.befriendBot(a, host);
    await K.botInvite(host, U(a));
    // A는 받은 초대 줄을 띄워 두고, B는 코드를 쳐 둠
    await ui.gotoLobby(a.page);
    await K.openInvites(a.page);
    const row = K.inviteRow(a.page, host.nickname);
    await expect(K.acceptButton(row)).toBeVisible({ timeout: 15_000 });
    await K.typeCode(b.page, code);
    const bResult = watchJoin(b.page);
    // A 수락이 서버로 나간 직후 B가 누름 (수락 누르기가 끝나면 요청은 이미 보내짐)
    await K.acceptButton(row).click();
    await K.joinButton(b.page).click();
    await expect(a.page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    const rb = await bResult;
    expect(rb).toEqual({ kind: 'alert', message: MSG.CODE_FULL });
    expect(await K.roomSize(host.uuid)).toBe(6);
});
