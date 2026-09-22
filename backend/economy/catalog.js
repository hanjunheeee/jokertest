'use strict';

// F-08 서버 상품 카탈로그. 프론트 frontend/src/domains/store/constants/storeItems.js와
// frontend/src/domains/user/constants/skinCardWear/skinCardWearCatalog.js가 화면에 그리는
// 실제 파일(shopItem/*)에 대응하는 안정적 id·종류·골드 가격을 서버가 별도로 소유한다.
// 클라이언트가 보내는 가격·보상량은 절대 신뢰하지 않고(F-08 AC-04), 이 파일의 값만 진실로
// 삼는다. id는 프론트 생성 로직(createSkinStoreItem/createProfileBorderItem/
// createPlayerCardItem)과 같은 문자열 규칙을 그대로 옮겨 적은 것이라 프론트 카탈로그가
// 바뀌면 이 파일도 함께 갱신해야 한다 — 프론트(ESM)와 백엔드(CJS)가 같은 모듈을
// require/import로 공유할 수 없어 부득이하게 문자열을 복제했다.
//
// 현금 충전·재화 패키지 판매(frontend INGAME_MONEY_STORE_ITEMS)는 명시적으로 제외한다
// (작업 지시서 계획 메모).

const ITEM_TYPES = Object.freeze({
    PROFILE_PHOTO: 'PROFILE_PHOTO',
    PROFILE_BORDER: 'PROFILE_BORDER',
    SKIN: 'SKIN',
    PLAYER_CARD_FRAME: 'PLAYER_CARD_FRAME',
    EMOTICON: 'EMOTICON',
});

// frontend/public/shopItem/player-profile/*.png 16종 전부 (파일명 "프로필-" 접두 제거).
// A-03: 실제 파일 수가 16개가 아니게 되면 이 목록도 함께 고쳐야 한다.
const PROFILE_PHOTO_NAMES = [
    '귀부인', '그림자', '금빛가면', '기사', '드워프', '마인', '붉은기운', '사냥꾼',
    '수녀', '악당', '암살자', '역병의사', '영애', '영주', '음유시인', '화관쓴소녀',
];

const DEFAULT_PROFILE_PHOTO_ID = 'player-profile-금빛가면';
const DEFAULT_PROFILE_BORDER_ID = 'profile-border-평민';

const profilePhotoItems = PROFILE_PHOTO_NAMES.map((name) => ({
    id: `player-profile-${name}`,
    type: ITEM_TYPES.PROFILE_PHOTO,
    priceGold: 0,
    defaultGrant: true,
    purchasable: false,
}));

// frontend storeItems.js PROFILE_BORDER_STORE_ITEMS와 같은 가격. "평민"은 프론트 상점에
// 없는 기본 지급 전용 테두리(F-08 AC-03)이며 구매 대상이 아니다.
const PURCHASABLE_BORDER_PRICES = {
    남작: 200,
    자작: 300,
    백작: 400,
    후작: 500,
    공작: 700,
    황제: 1000,
};

// F-12: 초대받은 자들(jobChallenges.js) 직업별 30승 보상 테두리. frontend
// INVITED_GUESTS_ASSETS의 {job}ProfileBorder(프로필프레임-귀족.png 등)에 대응하며, 구매
// 상점(storeItems.js PROFILE_BORDER_STORE_ITEMS)의 등급별 테두리(남작~황제)와는 완전히
// 별개의 품목이다 — 구매로는 얻을 수 없고 achievementService.js의 업적 지급으로만 준다.
const JOB_PROFILE_BORDER_NAMES = ['귀족', '광대', '주치의', '경비원', '마녀사냥꾼'];

const profileBorderItems = [
    {
        id: DEFAULT_PROFILE_BORDER_ID,
        type: ITEM_TYPES.PROFILE_BORDER,
        priceGold: 0,
        defaultGrant: true,
        purchasable: false,
    },
    ...Object.entries(PURCHASABLE_BORDER_PRICES).map(([tier, priceGold]) => ({
        id: `profile-border-${tier}`,
        type: ITEM_TYPES.PROFILE_BORDER,
        priceGold,
        defaultGrant: false,
        purchasable: true,
    })),
    ...JOB_PROFILE_BORDER_NAMES.map((name) => ({
        id: `profile-border-${name}`,
        type: ITEM_TYPES.PROFILE_BORDER,
        priceGold: 0,
        defaultGrant: false,
        purchasable: false,
    })),
];

// frontend storeItems.js SKIN_STORE_ITEMS와 같은 id(standingStem 기준)·가격(기본값 500).
const SKIN_STANDING_STEMS = [
    '경비원1-바이올렛', '경비원2-푸른서리', '광대1-불멸', '광대2-카오스',
    '귀족1-블러드', '귀족2-로코코', '귀족3-빅토리아', '마녀사냥꾼-스팀펑크', '주치의-미스테리',
];

const skinItems = SKIN_STANDING_STEMS.map((standingStem) => ({
    id: `player-skin-${standingStem}`,
    type: ITEM_TYPES.SKIN,
    priceGold: 500,
    defaultGrant: false,
    purchasable: true,
}));

// frontend storeItems.js PLAYER_CARD_STORE_ITEMS와 같은 id·가격(500). "베이스"는
// skinCardWearCatalog.js가 별도로 다루는 무료 기본 프레임이라 여기 포함하지 않는다 —
// 구매 대상도, 기본 지급 대상(AC-03)도 아니다.
const PLAYER_CARD_VARIANTS = ['가고일', '가면', '그레이', '모래시계', '보석', '사슬', '악마', '왕관'];

const playerCardFrameItems = PLAYER_CARD_VARIANTS.map((variant) => ({
    id: `player-card-${variant}`,
    type: ITEM_TYPES.PLAYER_CARD_FRAME,
    priceGold: 500,
    defaultGrant: false,
    purchasable: true,
}));

// F-33 E-1: 이모티콘 23종(docs/design/F-33-emoticon.md §0). 기본 8종은 모든 계정에
// 기본 지급(구매 불가), 상점 15종은 골드로 판매한다. 가격은 운영자 확정 전 임시값이라
// 이 상수 하나로 모아 둔다 — 최종 상품표가 아니다. id·이름·경로는 frontend storeItems.js
// EMOTICON_STORE_ITEMS와 같은 값이다.
const EMOTICON_PRICE_GOLD_PLACEHOLDER = 500;

const BASIC_EMOTICONS = [
    ['reject', '거절'], ['tears', '눈물'], ['anger', '분노'], ['love', '사랑'],
    ['grin', '씨익'], ['hello', '안녕'], ['surrender', '항복'], ['dizzy', '헤롱'],
];

const SHOP_EMOTICONS = [
    ['thorned-heart', '가시박힌 심장'], ['duel-challenge', '결투를 신청한다'], ['nasty-mock', '기분나쁜 조롱'],
    ['startled', '깜짝'], ['im-crying', '나 울고있어'], ['find-culprit', '범인 색출'],
    ['ready-to-burn', '불 탈 준비됐어'], ['shush', '쉿 조용히'], ['which-potion', '어떤 약이었지'],
    ['puzzled', '어리둥절'], ['elegant-toast', '우아한 건배'], ['meaningful', '의미심장'],
    ['take-aim', '정조준'], ['dead-soul', '죽은자의 영혼'], ['vote-time', '투표할 시간이야'],
];

const emoticonItems = [
    ...BASIC_EMOTICONS.map(([slug, name]) => ({
        id: `emoji-basic-${slug}`,
        type: ITEM_TYPES.EMOTICON,
        name,
        icon: `/shopItem/basic/emoji/${slug}.png`,
        priceGold: 0,
        defaultGrant: true,
        purchasable: false,
    })),
    ...SHOP_EMOTICONS.map(([slug, name]) => ({
        id: `emoji-${slug}`,
        type: ITEM_TYPES.EMOTICON,
        name,
        icon: `/shopItem/emoji/${slug}.png`,
        priceGold: EMOTICON_PRICE_GOLD_PLACEHOLDER,
        defaultGrant: false,
        purchasable: true,
    })),
];

const ALL_ITEMS = [...profilePhotoItems, ...profileBorderItems, ...skinItems, ...playerCardFrameItems, ...emoticonItems];

const CATALOG_BY_ID = new Map(ALL_ITEMS.map((item) => [item.id, item]));

/** @param {string} itemId @returns {{id:string,type:string,priceGold:number,defaultGrant:boolean,purchasable:boolean} | undefined} */
const getCatalogItem = (itemId) => CATALOG_BY_ID.get(itemId);

/** 기본 지급 대상(프로필 16종 + 평민 테두리 1종 + 기본 이모티콘 8종) 전체. */
const listDefaultGrantItems = () => ALL_ITEMS.filter((item) => item.defaultGrant === true);

// R-IMPL(2026-09-10, AC-04 재검토): /economy/admin/grant는 인증된 QA/ADMIN 계정만 호출할 수
// 있지만, 그 요청도 여전히 "클라이언트가 보낸 값"이라는 점에서는 일반 구매 요청과 다르지
// 않다 — purchaseItem이 클라이언트가 보낸 price를 절대 읽지 않고 항상 카탈로그의
// priceGold만 신뢰하는 것과 같은 이유로, 지급 사유(reason)도 클라이언트가 보낸 amount·
// currency를 그대로 신뢰하지 않고 이 서버 보상 카탈로그의 값만 신뢰해야 한다. reason은
// 이 카탈로그의 키여야 하고, 실제 지급되는 금액·재화는 항상 이 표의 값이다.
const REWARD_CATALOG = Object.freeze({
    QA_TEST_GRANT_GOLD: { currency: 'GOLD', amount: 100000 },
    QA_TEST_GRANT_DIAMOND: { currency: 'DIAMOND', amount: 1000 },
    EVENT_COMPENSATION_GOLD: { currency: 'GOLD', amount: 1000 },
});

// CODEX-2 재검토: REWARD_CATALOG[reason]을 그대로 읽으면 reason="toString"·"constructor"
// 같은 값이 REWARD_CATALOG 자신의 것이 아니라 프로토타입 체인(Object.prototype)에서
// 우연히 발견된 함수를 truthy로 돌려줘, "카탈로그에 없는 reason"이 통과할 뻔한다 —
// hasOwnProperty로 이 표가 실제로 소유한 키인지부터 확인한다(own-property safe lookup).
/** @param {string} reason @returns {{currency:string,amount:number} | undefined} */
const getRewardCatalogEntry = (reason) =>
    Object.prototype.hasOwnProperty.call(REWARD_CATALOG, reason) ? REWARD_CATALOG[reason] : undefined;

module.exports = {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    EMOTICON_PRICE_GOLD_PLACEHOLDER,
    getCatalogItem,
    listDefaultGrantItems,
    getRewardCatalogEntry,
    ALL_ITEMS,
    REWARD_CATALOG,
};
