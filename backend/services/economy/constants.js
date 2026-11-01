'use strict';

// 경제 상수 파일, 통화·최대 잔액·슬롯/컬럼 짝·무료 스킨·골드 구매·이모티콘 칸
// 경제 안 파일들과 상품 서비스가 같이 씀
const catalog = require('../../economy/catalog');
const {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;

// 누구나 가진 기본 카드 테두리
const FREE_CARD_FRAME_ID = 'player-card-베이스';

// 유료 직업 스킨 아이템 id 앞말
const SKIN_ITEM_ID_PREFIX = 'player-skin-';

// 직업 스킨 칸마다 스킨 id에 들어가는 직업 이름
const JOB_SKIN_ID_PREFIX_BY_SLOT = Object.freeze({
    JOB_SKIN_NOBLE: '귀족',
    JOB_SKIN_CLOWN: '광대',
    JOB_SKIN_GUARD: '경비원',
    JOB_SKIN_DOCTOR: '주치의',
    JOB_SKIN_WITCH_HUNTER: '마녀사냥꾼',
});

// 직업마다 안 사도 쓰는 기본 스킨
const FREE_JOB_SKIN_IDS_BY_SLOT = Object.freeze({
    JOB_SKIN_NOBLE: Object.freeze(['basic-skin-귀족1', 'basic-skin-귀족2', 'basic-skin-귀족3']),
    JOB_SKIN_CLOWN: Object.freeze(['basic-skin-광대1', 'basic-skin-광대2']),
    JOB_SKIN_GUARD: Object.freeze(['basic-skin-경비원1', 'basic-skin-경비원2']),
    JOB_SKIN_DOCTOR: Object.freeze(['basic-skin-주치의']),
    JOB_SKIN_WITCH_HUNTER: Object.freeze(['basic-skin-마녀사냥꾼']),
});

// 통화 두 가지
const CURRENCIES = Object.freeze({ GOLD: 'GOLD', DIAMOND: 'DIAMOND' });

// 통화마다 지갑 잔액 컬럼
const CURRENCY_TO_WALLET_COLUMN = Object.freeze({
    GOLD: 'balance_gold',
    DIAMOND: 'balance_diamond',
});

// 잔액·금액 최대 (넘치면 거절)
const MAX_BALANCE = 1_000_000_000;

// 장착 칸마다 끼울 수 있는 아이템 종류
const SLOT_TO_ITEM_TYPE = {
    PROFILE_PHOTO: ITEM_TYPES.PROFILE_PHOTO,
    PROFILE_BORDER: ITEM_TYPES.PROFILE_BORDER,
    PLAYER_CARD_FRAME: ITEM_TYPES.PLAYER_CARD_FRAME,
    JOB_SKIN_NOBLE: ITEM_TYPES.SKIN,
    JOB_SKIN_CLOWN: ITEM_TYPES.SKIN,
    JOB_SKIN_GUARD: ITEM_TYPES.SKIN,
    JOB_SKIN_DOCTOR: ITEM_TYPES.SKIN,
    JOB_SKIN_WITCH_HUNTER: ITEM_TYPES.SKIN,
};

// 장착 칸마다 장착 행 컬럼
const SLOT_TO_LOADOUT_COLUMN = {
    PROFILE_PHOTO: 'selected_profile_photo_id',
    PROFILE_BORDER: 'selected_profile_border_id',
    PLAYER_CARD_FRAME: 'selected_card_frame_id',
    JOB_SKIN_NOBLE: 'selected_skin_noble',
    JOB_SKIN_CLOWN: 'selected_skin_clown',
    JOB_SKIN_GUARD: 'selected_skin_guard',
    JOB_SKIN_DOCTOR: 'selected_skin_doctor',
    JOB_SKIN_WITCH_HUNTER: 'selected_skin_witch_hunter',
};

// 직업 id마다 스킨 컬럼 (게임 시작 로드아웃용)
const JOB_SKIN_COLUMN_BY_JOB_ID = Object.freeze({
    noble: 'selected_skin_noble',
    clown: 'selected_skin_clown',
    guard: 'selected_skin_guard',
    doctor: 'selected_skin_doctor',
    witchHunter: 'selected_skin_witch_hunter',
});

// 골드 구매 요청 종류
const GOLD_PURCHASE_KIND = 'GOLD';

// 골드 구매 장부 사유
const GOLD_PURCHASE_REASON = 'GOLD_PURCHASE';

// 데드락이면 이만큼까지 다시
const GOLD_PURCHASE_MAX_ATTEMPTS = 3;

// 이모티콘 칸 4개 컬럼
const EMOJI_PALETTE_SLOT_COLUMNS = Object.freeze([
    'slot_1', 'slot_2', 'slot_3', 'slot_4', 'slot_5', 'slot_6', 'slot_7', 'slot_8',
]);

// 팔레트 처음 값 (빈 칸 4개)
const DEFAULT_EMOJI_PALETTE_SLOTS = Object.freeze([
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
]);

module.exports = {
    FREE_CARD_FRAME_ID,
    SKIN_ITEM_ID_PREFIX,
    JOB_SKIN_ID_PREFIX_BY_SLOT,
    FREE_JOB_SKIN_IDS_BY_SLOT,
    CURRENCIES,
    CURRENCY_TO_WALLET_COLUMN,
    MAX_BALANCE,
    SLOT_TO_ITEM_TYPE,
    SLOT_TO_LOADOUT_COLUMN,
    JOB_SKIN_COLUMN_BY_JOB_ID,
    GOLD_PURCHASE_KIND,
    GOLD_PURCHASE_REASON,
    GOLD_PURCHASE_MAX_ATTEMPTS,
    EMOJI_PALETTE_SLOT_COLUMNS,
    DEFAULT_EMOJI_PALETTE_SLOTS,
};
