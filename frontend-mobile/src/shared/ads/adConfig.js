// 광고 환경값 읽기: 공급자·광고 계정·광고 단위 2개를 고르고, 자리마다 진짜 광고/개발 회색 상자/없음 정하기
// currentAdConfig.js·AdBanner·useInterstitialAd가 씀 (import.meta.env는 안 읽음 → node 시험 가능)

// 지금 붙인 공급자는 AdSense 하나
export const AD_PROVIDERS = Object.freeze(["adsense"])

// 자리 이름 → 광고 단위 환경값 이름
export const AD_SLOT_ENV = Object.freeze({
    banner: "VITE_ADSENSE_SLOT_BANNER",
    interstitial: "VITE_ADSENSE_SLOT_INTERSTITIAL",
})

const clean = (value) => (typeof value === "string" ? value.trim() : "")

// 광고 계정 번호 모양 (ca-pub-숫자)
const CLIENT_PATTERN = /^ca-pub-\d+$/

// 환경값 묶음 → 광고 설정, 공급자·계정이 틀리면 provider null (광고 안 씀)
// 예: { VITE_AD_PROVIDER: "adsense", VITE_ADSENSE_CLIENT: "ca-pub-123", VITE_ADSENSE_SLOT_BANNER: "456" }
//   → { provider: "adsense", client: "ca-pub-123", slots: { banner: "456", interstitial: "" } }
export function readAdConfig(env = {}) {
    const provider = clean(env.VITE_AD_PROVIDER).toLowerCase()
    const client = clean(env.VITE_ADSENSE_CLIENT)
    const slots = {
        banner: clean(env[AD_SLOT_ENV.banner]),
        interstitial: clean(env[AD_SLOT_ENV.interstitial]),
    }
    const usable = AD_PROVIDERS.includes(provider) && CLIENT_PATTERN.test(client)
    return Object.freeze({
        provider: usable ? provider : null,
        client: usable ? client : "",
        slots: Object.freeze(slots),
    })
}

// 자리 하나를 어떻게 그릴지: "live"(진짜 광고) / "placeholder"(개발 회색 상자) / "off"(아무것도 없음)
// 공급자·광고 단위가 다 있어야 live, 없으면 개발만 회색 상자
export function slotMode(config, slotName, isDev = false) {
    if (config?.provider && config.slots?.[slotName]) return "live"
    return isDev ? "placeholder" : "off"
}
