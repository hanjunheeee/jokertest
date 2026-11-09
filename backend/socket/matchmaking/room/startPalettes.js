// 판 시작 이모티콘 팔레트 파일, 참가자 팔레트 한 번에 읽기 + 실패하면 한 사람씩
// room/start.js 시작 직전 프로필 잡기가 부름, 실패한 사람은 빈 팔레트로 시작 (이모티콘만 못 씀)
const { deps } = require('../core/deps')

// 판에 넣을 모양: 칸·보유만 복사, 예: { slots: ['e1', null], owned: ['e1'], revision } → { slots: ['e1', null], owned: ['e1'] }
const toPaletteEntry = (palette) => ({
    slots: Array.isArray(palette?.slots) ? [...palette.slots] : [],
    owned: Array.isArray(palette?.owned) ? [...palette.owned] : [],
})

// 한 사람씩 읽기 (묶어 읽기 없거나 실패했을 때), 실패한 사람만 빈 팔레트
function loadOneByOne(uuids) {
    return Promise.all(uuids.map((uuid) => Promise.resolve()
        .then(() => deps.economyService.getEmojiPalette(uuid))
        .then((palette) => [uuid, toPaletteEntry(palette)])
        .catch((error) => {
            console.error('[matchmaking] 이모지 팔레트 조회 실패 — 팔레트 없이 게임을 시작합니다', error)
            return [uuid, { slots: [], owned: [] }]
        })))
}

// 참가자 팔레트 → [uuid, 팔레트] 목록: 전원 한 번에 (사람마다 질의 4개·거래 하나 → 전원 질의 2개)
// 묶어 읽기가 던지면 한 사람씩 다시 (한 사람 문제로 전원 팔레트가 비지 않게)
async function loadStartPalettes(uuids) {
    if (typeof deps.economyService.getEmojiPalettes !== 'function') return loadOneByOne(uuids)
    try {
        const palettes = await deps.economyService.getEmojiPalettes(uuids)
        return uuids.map((uuid) => [uuid, toPaletteEntry(palettes.get(uuid))])
    } catch (error) {
        console.error('[matchmaking] 이모지 팔레트 묶어 읽기 실패 — 한 사람씩 다시 읽습니다', error)
        return loadOneByOne(uuids)
    }
}

module.exports = {
    loadStartPalettes,
}
