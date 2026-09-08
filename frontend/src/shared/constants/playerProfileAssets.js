// 플레이어 프로필 사진·테두리 public 경로 (shopItem)
//
// dummyPhotos는 원격이 참조하던 '더미친구 프로필1~5.png'가 shopItem/player-profile에
// 없어, 슬롯 수(5)는 그대로 두고 실존 프로필 PNG로 채웠습니다.
export const PLAYER_PROFILE_ASSETS = {
  defaultBorder: "/shopItem/player- profileborder/프로필프레임-평민.png".normalize("NFD"),
  defaultPhoto: "/shopItem/player-profile/프로필-금빛가면.png".normalize("NFD"),
  dummyPhotos: [
    "/shopItem/player-profile/프로필-귀부인.png".normalize("NFD"),
    "/shopItem/player-profile/프로필-기사.png".normalize("NFD"),
    "/shopItem/player-profile/프로필-수녀.png".normalize("NFD"),
    "/shopItem/player-profile/프로필-음유시인.png".normalize("NFD"),
    "/shopItem/player-profile/프로필-역병의사.png".normalize("NFD"),
  ],
}
