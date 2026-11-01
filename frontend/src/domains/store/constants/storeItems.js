// 상점 상품 목록 (스킨·프로필 테두리·플레이어 카드·인게임 재화·이모티콘)과 상품 판정 함수
// 상점 패널·일괄구매 파일, 인게임 이모티콘 찾기, 스킨 카드 장착 목록, 이모티콘 팔레트가 씀

// 상품 그림 폴더 (테두리 폴더 이름의 빈칸은 실제 폴더 이름 그대로)
const PROFILE_BORDER_ASSET_DIR = "/shopItem/player- profileborder"
const PLAYER_CARD_ALIVE_ASSET_DIR = "/shopItem/player-card/playerframe-alive"
const PLAYER_CARD_DEAD_ASSET_DIR = "/shopItem/player-card/playerframe-dead"
const INGAME_MONEY_ASSET_DIR = "/shopItem/ingame-money"
const PLAYER_SKIN_STANDING_ASSET_DIR = "/shopItem/player-skin/jobs-standing"
const PLAYER_SKIN_CLOSEUP_ASSET_DIR = "/shopItem/player-skin/jobs-closeup"

// 가격 미정 상품의 가격 칸 글자, 가격 미정 판정에도 씀
export const STORE_PRICE_PENDING = "준비중"

// 직업 이름 끝 숫자(변형 번호) 떼기
function parseSkinJobBase(jobWithVariant) {
  return jobWithVariant.replace(/\d+$/, "")
}

// 클로즈업 파일 이름으로 스킨 상품 만들기 (전신 그림은 _클로즈업 뺀 이름)
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

// 등급 이름으로 프로필 테두리 상품 만들기
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

// 이름으로 플레이어 카드 상품 만들기 (살아 있음·사망 그림 둘)
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

// 분류별 상품 목록 (테두리는 등급마다 가격 다름, 카드·스킨은 500)
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

// 골드·다이아 묶음 상품 만들기 (아직 안 팔아서 가격 미정)
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

// 골드 4종·다이아 4종
export const INGAME_MONEY_STORE_ITEMS = [
  ...[50, 100, 200, 500].map((amount) => createIngameMoneyItem("gold", amount)),
  ...[10, 50, 100, 300].map((amount) => createIngameMoneyItem("diamond", amount)),
]

// 상점 이모티콘 임시 가격
export const EMOTICON_PRICE_GOLD_PLACEHOLDER = 500

// 기본 지급 이모티콘 [그림 이름, 보이는 이름]
const BASIC_EMOTICONS = [
  ["reject", "거절"], ["tears", "눈물"], ["anger", "분노"], ["love", "사랑"],
  ["grin", "씨익"], ["hello", "안녕"], ["surrender", "항복"], ["dizzy", "헤롱"],
]

// 상점에서 파는 이모티콘 [그림 이름, 보이는 이름]
const SHOP_EMOTICONS = [
  ["thorned-heart", "가시박힌 심장"], ["duel-challenge", "결투를 신청한다"], ["nasty-mock", "기분나쁜 조롱"],
  ["startled", "깜짝"], ["im-crying", "나 울고있어"], ["find-culprit", "범인 색출"],
  ["ready-to-burn", "불 탈 준비됐어"], ["shush", "쉿 조용히"], ["which-potion", "어떤 약이었지"],
  ["puzzled", "어리둥절"], ["elegant-toast", "우아한 건배"], ["meaningful", "의미심장"],
  ["take-aim", "정조준"], ["dead-soul", "죽은자의 영혼"], ["vote-time", "투표할 시간이야"],
]

// 기본 이모티콘은 기본 지급 표시 (상점 목록에선 숨김)
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

// 전체 상품 (분류 순서)
export const STORE_ITEMS = [
  ...SKIN_STORE_ITEMS,
  ...PROFILE_BORDER_STORE_ITEMS,
  ...PLAYER_CARD_STORE_ITEMS,
  ...INGAME_MONEY_STORE_ITEMS,
  ...EMOTICON_STORE_ITEMS,
]

// 전체 상품 다른 이름 (지금 부르는 곳 없음)
export const STORE_GRID_ITEMS = STORE_ITEMS

// 사망 미리보기 중이고 사망 그림이 있으면 그 그림
export function getItemDisplayIcon(item, showDeadPreview = false) {
  if (showDeadPreview && item.iconDead) return item.iconDead
  return item.icon
}

// 사망 그림 있는 플레이어 카드인지 (미리보기 버튼용)
export function isPlayerCardStoreItem(item) {
  return item.category === "플레이어 카드" && Boolean(item.iconDead)
}

// 스킨 상품인지 (전신 보기 버튼용)
export function isSkinStoreItem(item) {
  return item.category === "스킨"
}

// 프로필 테두리 상품인지 (크게 보기 버튼용)
export function isProfileBorderStoreItem(item) {
  return item.category === "프로필 테두리"
}

// 크게 보기 창에 넘길 그림·이름표
export function getProfileBorderZoomItem(item) {
  return {
    icon: item.icon,
    label: `${item.name} 프로필 테두리`,
  }
}

// 전신 그림, 없으면 칸 그림
export function getSkinZoomIcon(item) {
  return item.iconZoom ?? item.icon
}

// 가격 미정 상품인지
export function isStorePricePending(item) {
  return item.priceAmount === STORE_PRICE_PENDING
}

// 모든 계정에 기본 지급되는 상품인지 (사지 못함)
export const isDefaultGrantStoreItem = (item) => item?.defaultGrant === true

// 분류의 상품 목록, 분류 안 골랐으면 전체, 기본 지급은 뺌
export function getStoreItemsByCategory(category) {
  const byCategory = !category
    ? STORE_ITEMS
    : STORE_ITEMS.filter((item) => item.category === category)
  return byCategory.filter((item) => !isDefaultGrantStoreItem(item))
}

// id로 상품 찾기 (인게임 이모티콘 찾기·이모티콘 팔레트가 씀)
export function getStoreItemById(itemId) {
  return STORE_ITEMS.find((item) => item.id === itemId)
}

// id로 찾고 없으면 첫 상품 (지금 부르는 곳 없음)
export function getDummyItemInfo(itemId) {
  return getStoreItemById(itemId) ?? STORE_ITEMS[0]
}
