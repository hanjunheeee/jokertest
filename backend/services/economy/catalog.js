'use strict';

// 상품 목록 파일, 아이템 종류·전체 아이템(사진·테두리·스킨·카드·이모티콘)·관리자 보상 표
// constants·defaults·purchase·loadout·emojiPalette, controllers/economy/purchase.js(보상 표)가 씀

// 아이템 종류 다섯 가지 (보유 행 item_type 값)
const ITEM_TYPES = Object.freeze({
    PROFILE_PHOTO: 'PROFILE_PHOTO',
    PROFILE_BORDER: 'PROFILE_BORDER',
    SKIN: 'SKIN',
    PLAYER_CARD_FRAME: 'PLAYER_CARD_FRAME',
    EMOTICON: 'EMOTICON',
});

// 프로필 사진 이름 (id 뒷말)
const PROFILE_PHOTO_NAMES = [
    '귀부인', '그림자', '금빛가면', '기사', '드워프', '마인', '붉은기운', '사냥꾼',
    '수녀', '악당', '암살자', '역병의사', '영애', '영주', '음유시인', '화관쓴소녀',
];

// 처음 계정이 끼는 기본 사진·테두리
const DEFAULT_PROFILE_PHOTO_ID = 'player-profile-금빛가면';
const DEFAULT_PROFILE_BORDER_ID = 'profile-border-평민';

// 사진은 전부 공짜 기본 지급, 안 팖
const profilePhotoItems = PROFILE_PHOTO_NAMES.map((name) => ({
    id: `player-profile-${name}`,
    type: ITEM_TYPES.PROFILE_PHOTO,
    priceGold: 0,
    defaultGrant: true,
    purchasable: false,
}));

// 파는 테두리 등급마다 골드 값
const BORDER_PRICES = {
    남작: 200,
    자작: 300,
    백작: 400,
    후작: 500,
    공작: 700,
    황제: 1000,
};

// 직업 테두리 (안 팖, 직업 30승 업적 보상으로만 받음)
const JOB_BORDER_NAMES = ['귀족', '광대', '주치의', '경비원', '마녀사냥꾼'];

// 테두리 = 기본 평민(기본 지급) + 파는 등급 + 업적 직업 테두리
const profileBorderItems = [
    {
        id: DEFAULT_PROFILE_BORDER_ID,
        type: ITEM_TYPES.PROFILE_BORDER,
        priceGold: 0,
        defaultGrant: true,
        purchasable: false,
    },
    ...Object.entries(BORDER_PRICES).map(([tier, priceGold]) => ({
        id: `profile-border-${tier}`,
        type: ITEM_TYPES.PROFILE_BORDER,
        priceGold,
        defaultGrant: false,
        purchasable: true,
    })),
    ...JOB_BORDER_NAMES.map((name) => ({
        id: `profile-border-${name}`,
        type: ITEM_TYPES.PROFILE_BORDER,
        priceGold: 0,
        defaultGrant: false,
        purchasable: false,
    })),
];

// 유료 직업 스킨 이름 (직업 이름이 앞에 있어 칸 직업 확인에 씀)
const SKIN_STANDING_STEMS = [
    '경비원1-바이올렛', '경비원2-푸른서리', '광대1-불멸', '광대2-카오스',
    '귀족1-블러드', '귀족2-로코코', '귀족3-빅토리아', '마녀사냥꾼-스팀펑크', '주치의-미스테리',
];

// 스킨은 전부 같은 값에 팖
const skinItems = SKIN_STANDING_STEMS.map((standingStem) => ({
    id: `player-skin-${standingStem}`,
    type: ITEM_TYPES.SKIN,
    priceGold: 500,
    defaultGrant: false,
    purchasable: true,
}));

// 파는 카드 테두리 이름 (공짜 '베이스'는 constants.js에 따로)
const PLAYER_CARD_VARIANTS = ['가고일', '가면', '그레이', '모래시계', '보석', '사슬', '악마', '왕관'];

const playerCardFrameItems = PLAYER_CARD_VARIANTS.map((variant) => ({
    id: `player-card-${variant}`,
    type: ITEM_TYPES.PLAYER_CARD_FRAME,
    priceGold: 500,
    defaultGrant: false,
    purchasable: true,
}));

// 상점 이모티콘 골드 값 (아직 임시값)
const EMOTICON_PRICE_GOLD_PLACEHOLDER = 500;

// 기본 이모티콘 [id 뒷말, 이름] (공짜 지급, 팔레트 처음 값)
const BASIC_EMOTICONS = [
    ['reject', '거절'], ['tears', '눈물'], ['anger', '분노'], ['love', '사랑'],
    ['grin', '씨익'], ['hello', '안녕'], ['surrender', '항복'], ['dizzy', '헤롱'],
];

// 상점 이모티콘 [id 뒷말, 이름]
const SHOP_EMOTICONS = [
    ['thorned-heart', '가시박힌 심장'], ['duel-challenge', '결투를 신청한다'], ['nasty-mock', '기분나쁜 조롱'],
    ['startled', '깜짝'], ['im-crying', '나 울고있어'], ['find-culprit', '범인 색출'],
    ['ready-to-burn', '불 탈 준비됐어'], ['shush', '쉿 조용히'], ['which-potion', '어떤 약이었지'],
    ['puzzled', '어리둥절'], ['elegant-toast', '우아한 건배'], ['meaningful', '의미심장'],
    ['take-aim', '정조준'], ['dead-soul', '죽은자의 영혼'], ['vote-time', '투표할 시간이야'],
];

// 이모티콘은 이름·그림 경로까지 들고 있음, 기본 것은 공짜·상점 것은 임시값
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

// 전체 아이템 한 줄로
const ALL_ITEMS = [...profilePhotoItems, ...profileBorderItems, ...skinItems, ...playerCardFrameItems, ...emoticonItems];

// id로 바로 찾게
const CATALOG_BY_ID = new Map(ALL_ITEMS.map((item) => [item.id, item]));

// id로 아이템 하나 (없으면 undefined)
const getCatalogItem = (itemId) => CATALOG_BY_ID.get(itemId);

// 처음 계정에 줄 기본 지급 아이템만
const listDefaultGrantItems = () => ALL_ITEMS.filter((item) => item.defaultGrant === true);

// 관리자 지급 사유마다 통화·금액 (요청 본문 금액은 안 믿음)
const REWARD_CATALOG = Object.freeze({
    QA_TEST_GRANT_GOLD: { currency: 'GOLD', amount: 100000 },
    QA_TEST_GRANT_DIAMOND: { currency: 'DIAMOND', amount: 1000 },
    EVENT_COMPENSATION_GOLD: { currency: 'GOLD', amount: 1000 },
});

// 표에 직접 있는 사유만 (toString 같은 물려받은 이름 막기)
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
