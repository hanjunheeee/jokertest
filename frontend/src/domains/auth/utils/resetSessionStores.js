import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useProfileCustomizationStore } from "@/domains/user/store/profileCustomization.store.js"
import { useUserProfileStore } from "@/domains/user/store/user.store.js"

/** 로그아웃·세션 만료 시 계정별 클라이언트 캐시를 비웁니다. */
export function resetSessionStores() {
  useUserProfileStore.getState().reset()
  useFriendStore.getState().reset()
  useProfileCustomizationStore.getState().reset()
}
