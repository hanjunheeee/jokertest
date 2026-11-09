'use strict';

// 금지어 파일, DB 켜진 금지어를 메모리에 들고 채팅 가리기·닉네임 검사에 씀
// index.js 시작 때·내부 API reload 때 다시 읽음, 판 채팅·가입·닉네임 변경이 부름 (목록 비면 아무것도 안 막음)

// 단어 하나 최대 길이·목록 최대 수 (메모리·검사 시간 상한)
const MAX_WORD_LENGTH = 100;
const MAX_WORDS = 5000;

const defaultDb = () => require('../../repositories/common/db');

// 지금 들고 있는 단어 (소문자, 긴 것부터 → 긴 단어가 먼저 가려짐)
let words = Object.freeze([]);

// 비교용으로 다듬기: 소문자 + 앞뒤 공백 빼기
const normalizeWord = (value) => String(value ?? '').trim().toLowerCase();

// 단어 배열 → 저장 모양 (빈 것·긴 것·겹친 것 빼고 긴 순서)
const prepareWords = (list) => {
    const unique = new Set();
    for (const raw of list) {
        const word = normalizeWord(raw);
        if (!word || word.length > MAX_WORD_LENGTH) continue;
        unique.add(word);
        if (unique.size >= MAX_WORDS) break;
    }
    return Object.freeze([...unique].sort((a, b) => b.length - a.length));
};

// DB에서 다시 읽기 (실패하면 있던 목록 그대로 두고 던짐)
const reloadBannedWords = async ({ db = defaultDb() } = {}) => {
    const rows = await db.BannedWord.findAll({ where: { is_active: true }, attributes: ['word'], limit: MAX_WORDS });
    words = prepareWords(rows.map((row) => (typeof row.get === 'function' ? row.get('word') : row.word)));
    return { count: words.length };
};

const getBannedWordCount = () => words.length;

// 금지어 하나가 나오는 자리마다 *로 바꿈, 하나라도 바꿨으면 true
const maskWord = (chars, lower, word) => {
    let changed = false;
    let from = lower.indexOf(word);
    while (from !== -1) {
        for (let i = from; i < from + word.length; i += 1) chars[i] = '*';
        changed = true;
        from = lower.indexOf(word, from + word.length);
    }
    return changed;
};

// 채팅 가리기: 금지어 자리를 같은 길이 *로 (대소문자 안 가림), 목록 비면 그대로
const maskBannedWords = (text) => {
    if (typeof text !== 'string' || text.length === 0 || words.length === 0) return text;
    const lower = text.toLowerCase();
    // 소문자 바꿔 길이가 달라지는 글자가 섞이면 소문자 글 위에서 가림 (자리 어긋남 막기)
    const base = lower.length === text.length ? text : lower;
    const chars = base.split('');
    let changed = false;
    for (const word of words) {
        if (maskWord(chars, lower, word)) changed = true;
    }
    return changed ? chars.join('') : text;
};

// 닉네임 검사: 공백 빼고 소문자로 금지어가 들어 있는지 (목록 비면 늘 false)
const containsBannedWord = (text) => {
    if (typeof text !== 'string' || text.length === 0 || words.length === 0) return false;
    const compact = text.replace(/\s+/g, '').toLowerCase();
    return words.some((word) => compact.includes(word.replace(/\s+/g, '')));
};

// 시험용: 목록 바로 넣기
const __setWordsForTests = (list = []) => { words = prepareWords(list); };

// 다른 Node가 다시 읽었다는 방송·60초 안전망·Redis 살아남 때 다시 읽음 (reloadSync.js, 내보낸 함수로 불러 시험 갈아끼우기 먹게)
require('./reloadSync').registerReloadable('bannedWords', () => module.exports.reloadBannedWords());

module.exports = {
    MAX_WORD_LENGTH,
    MAX_WORDS,
    reloadBannedWords,
    getBannedWordCount,
    maskBannedWords,
    containsBannedWord,
    __setWordsForTests,
};
