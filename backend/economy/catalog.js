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

const ALL_ITEMS = [...profilePhotoItems, ...profileBorderItems, ...skinItems, ...playerCardFrameItems];

const CATALOG_BY_ID = new Map(ALL_ITEMS.map((item) => [item.id, item]));

/** @param {string} itemId @returns {{id:string,type:string,priceGold:number,defaultGrant:boolean,purchasable:boolean} | undefined} */
const getCatalogItem = (itemId) => CATALOG_BY_ID.get(itemId);

/** 기본 지급 대상(AC-03: 프로필 16종 + 평민 테두리 1종) 전체. */
const listDefaultGrantItems = () => ALL_ITEMS.filter((item) => item.defaultGrant === true);

module.exports = {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    getCatalogItem,
    listDefaultGrantItems,
    ALL_ITEMS,
};
