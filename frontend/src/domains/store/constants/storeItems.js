const PROFILE_BORDER_ASSET_DIR = "/shopItem/player- profileborder"
const PLAYER_CARD_ALIVE_ASSET_DIR = "/shopItem/player-card/playerframe-alive"
const PLAYER_CARD_DEAD_ASSET_DIR = "/shopItem/player-card/playerframe-dead"
const INGAME_MONEY_ASSET_DIR = "/shopItem/ingame-money"
const PLAYER_SKIN_STANDING_ASSET_DIR = "/shopItem/player-skin/jobs-standing"
const PLAYER_SKIN_CLOSEUP_ASSET_DIR = "/shopItem/player-skin/jobs-closeup"

export const STORE_PRICE_PENDING = "준비중"

function parseSkinJobBase(jobWithVariant) {
  return jobWithVariant.replace(/\d+$/, "")
}

function createSkinStoreItem(closeupFileStem, price = 500) {
  const standingStem = closeupFileStem.replace(/_클로즈업$/, "")
  const dashIndex = standingStem.indexOf("-")
  const jobWithVariant = standingStem.slice(0, dashIndex)
  const skinName = standingStem.slice(dashIndex + 1)
  const jobBase = parseSkinJobBase(jobWithVariant)
  const displayName = `${jobBase}-${skinName}`

  return {
    id: `player-skin-${standingStem}`,
    category: "스킨",
    name: displayName,
    icon: `${PLAYER_SKIN_CLOSEUP_ASSET_DIR}/${closeupFileStem}.png`.normalize("NFD"),
    iconZoom: `${PLAYER_SKIN_STANDING_ASSET_DIR}/${standingStem}.png`.normalize("NFD"),
    priceAmount: String(price),
    grade: jobBase,
    description: `직업 스킨 「${displayName}」. 인게임 플레이어 초상에 장착할 수 있습니다.`,
    tag: null,
  }
}

function createProfileBorderItem(tier, price) {
  return {
    id: `profile-border-${tier}`,
    category: "프로필 테두리",
    name: `${tier}`,
    icon: `${PROFILE_BORDER_ASSET_DIR}/프로필프레임-${tier}.png`.normalize("NFD"),
    priceAmount: String(price),
    grade: tier,
    description: `${tier} 등급 프로필 테두리. 로비·마이페이지·친구 목록 프로필에 장착할 수 있습니다.`,
    tag: null,
  }
}

function createPlayerCardItem(variant, price = 500) {
  return {
    id: `player-card-${variant}`,
    category: "플레이어 카드",
    name: variant,
    icon: `${PLAYER_CARD_ALIVE_ASSET_DIR}/인게임-플레이어프레임(${variant}).png`.normalize("NFD"),
    iconDead:
      `${PLAYER_CARD_DEAD_ASSET_DIR}/인게임-플레이어프레임(${variant}) 사망상태.png`.normalize("NFD"),
    priceAmount: String(price),
    grade: variant,
    description: `인게임 플레이어 카드 프레임 「${variant}」. 대국 중 내 플레이어 카드에 장착할 수 있습니다.`,
    tag: null,
  }
}

export const PROFILE_BORDER_STORE_ITEMS = [
  createProfileBorderItem("남작", 200),
  createProfileBorderItem("자작", 300),
  createProfileBorderItem("백작", 400),
  createProfileBorderItem("후작", 500),
  createProfileBorderItem("공작", 700),
  createProfileBorderItem("황제", 1000),
]

export const PLAYER_CARD_STORE_ITEMS = [
  "가고일",
  "가면",
  "그레이",
  "모래시계",
  "보석",
  "사슬",
  "악마",
  "왕관",
].map((variant) => createPlayerCardItem(variant))

export const SKIN_STORE_ITEMS = [
  "경비원1-바이올렛_클로즈업",
  "경비원2-푸른서리_클로즈업",
  "광대1-불멸_클로즈업",
  "광대2-카오스_클로즈업",
  "귀족1-블러드_클로즈업",
  "귀족2-로코코_클로즈업",
  "귀족3-빅토리아_클로즈업",
  "마녀사냥꾼-스팀펑크_클로즈업",
  "주치의-미스테리_클로즈업",
].map((closeupFileStem) => createSkinStoreItem(closeupFileStem))

function createIngameMoneyItem(currencyKey, amount) {
  const config =
    currencyKey === "gold"
      ? { folder: "coin", filePrefix: "금화", label: "금화" }
      : { folder: "diamond", filePrefix: "다이아", label: "다이아" }

  return {
    id: `ingame-money-${currencyKey}-${amount}`,
    category: "인게임 재화",
    name: `${config.label} ${amount}개`,
    icon: `${INGAME_MONEY_ASSET_DIR}/${config.folder}/${config.filePrefix}-${amount}.png`.normalize(
      "NFD",
    ),
    priceAmount: STORE_PRICE_PENDING,
    grade: config.label,
    description: `${config.label} ${amount}개 패키지. 판매 준비 중입니다.`,
    tag: null,
  }
}

export const INGAME_MONEY_STORE_ITEMS = [
  ...[50, 100, 200, 500].map((amount) => createIngameMoneyItem("gold", amount)),
  ...[10, 50, 100, 300].map((amount) => createIngameMoneyItem("diamond", amount)),
]

export const EMOTICON_PRICE_GOLD_PLACEHOLDER = 500

const BASIC_EMOTICONS = [
  ["reject", "거절"], ["tears", "눈물"], ["anger", "분노"], ["love", "사랑"],
  ["grin", "씨익"], ["hello", "안녕"], ["surrender", "항복"], ["dizzy", "헤롱"],
]

const SHOP_EMOTICONS = [
  ["thorned-heart", "가시박힌 심장"], ["duel-challenge", "결투를 신청한다"], ["nasty-mock", "기분나쁜 조롱"],
  ["startled", "깜짝"], ["im-crying", "나 울고있어"], ["find-culprit", "범인 색출"],
  ["ready-to-burn", "불 탈 준비됐어"], ["shush", "쉿 조용히"], ["which-potion", "어떤 약이었지"],
  ["puzzled", "어리둥절"], ["elegant-toast", "우아한 건배"], ["meaningful", "의미심장"],
  ["take-aim", "정조준"], ["dead-soul", "죽은자의 영혼"], ["vote-time", "투표할 시간이야"],
]

export const EMOTICON_STORE_ITEMS = [
  ...BASIC_EMOTICONS.map(([slug, name]) => ({
    id: `emoji-basic-${slug}`,
    category: "이모티콘",
    name,
    icon: `/shopItem/basic/emoji/${slug}.png`,
    priceAmount: "0",
    grade: "기본",
    description: `기본 이모티콘 「${name}」. 모든 계정에 기본 지급됩니다.`,
    tag: "기본 지급",
    defaultGrant: true,
  })),
  ...SHOP_EMOTICONS.map(([slug, name]) => ({
    id: `emoji-${slug}`,
    category: "이모티콘",
    name,
    icon: `/shopItem/emoji/${slug}.png`,
    priceAmount: String(EMOTICON_PRICE_GOLD_PLACEHOLDER),
    grade: "상점",
    description: `상점 이모티콘 「${name}」. 골드로 구매해 소유할 수 있습니다.`,
    tag: null,
  })),
]

export const STORE_ITEMS = [
  ...SKIN_STORE_ITEMS,
  ...PROFILE_BORDER_STORE_ITEMS,
  ...PLAYER_CARD_STORE_ITEMS,
  ...INGAME_MONEY_STORE_ITEMS,
  ...EMOTICON_STORE_ITEMS,
]

export const STORE_GRID_ITEMS = STORE_ITEMS

export function getStoreItemDisplayIcon(item, showDeadPreview = false) {
  if (showDeadPreview && item.iconDead) return item.iconDead
  return item.icon
}

export function isPlayerCardStoreItem(item) {
  return item.category === "플레이어 카드" && Boolean(item.iconDead)
}

export function isSkinStoreItem(item) {
  return item.category === "스킨"
}

export function isProfileBorderStoreItem(item) {
  return item.category === "프로필 테두리"
}

export function getStoreProfileBorderZoomItem(item) {
  return {
    icon: item.icon,
    label: `${item.name} 프로필 테두리`,
  }
}

export function getStoreSkinZoomIcon(item) {
  return item.iconZoom ?? item.icon
}

export function isStorePricePending(item) {
  return item.priceAmount === STORE_PRICE_PENDING
}

export const isDefaultGrantStoreItem = (item) => item?.defaultGrant === true

export function getStoreItemsByCategory(category) {
  const byCategory = !category
    ? STORE_ITEMS
    : STORE_ITEMS.filter((item) => item.category === category)
  return byCategory.filter((item) => !isDefaultGrantStoreItem(item))
}

export function getStoreItemById(itemId) {
  return STORE_ITEMS.find((item) => item.id === itemId)
}

export function getStoreDummyItemInfo(itemId) {
  return getStoreItemById(itemId) ?? STORE_ITEMS[0]
}
