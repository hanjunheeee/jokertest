// 이 빌드의 광고 설정 (Vite 환경값을 한 번만 읽음)
// AdBanner·AdSlot·useInterstitialAd가 씀
import { readAdConfig } from "@m/shared/ads/adConfig.js"

export const AD_CONFIG = readAdConfig(import.meta.env)

// 개발 서버면 설정 없어도 회색 상자로 자리 보여 주기
export const AD_IS_DEV = Boolean(import.meta.env.DEV)
