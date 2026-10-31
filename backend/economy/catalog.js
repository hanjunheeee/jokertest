'use strict';

const ITEM_TYPES = Object.freeze({
    PROFILE_PHOTO: 'PROFILE_PHOTO',
    PROFILE_BORDER: 'PROFILE_BORDER',
    SKIN: 'SKIN',
    PLAYER_CARD_FRAME: 'PLAYER_CARD_FRAME',
    EMOTICON: 'EMOTICON',
});

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

const PURCHASABLE_BORDER_PRICES = {
    남작: 200,
    자작: 300,
    백작: 400,
    후작: 500,
    공작: 700,
    황제: 1000,
};

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

const PLAYER_CARD_VARIANTS = ['가고일', '가면', '그레이', '모래시계', '보석', '사슬', '악마', '왕관'];

const playerCardFrameItems = PLAYER_CARD_VARIANTS.map((variant) => ({
    id: `player-card-${variant}`,
    type: ITEM_TYPES.PLAYER_CARD_FRAME,
    priceGold: 500,
    defaultGrant: false,
    purchasable: true,
}));

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

const getCatalogItem = (itemId) => CATALOG_BY_ID.get(itemId);

const listDefaultGrantItems = () => ALL_ITEMS.filter((item) => item.defaultGrant === true);

const REWARD_CATALOG = Object.freeze({
    QA_TEST_GRANT_GOLD: { currency: 'GOLD', amount: 100000 },
    QA_TEST_GRANT_DIAMOND: { currency: 'DIAMOND', amount: 1000 },
    EVENT_COMPENSATION_GOLD: { currency: 'GOLD', amount: 1000 },
});

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
