// 명예의 전당 그림 경로 모음
// 한글 이름 일부 파일은 NFD 모양으로 저장돼 normalize로 맞춤
export const PODIUM_ASSETS = {
  background: "/bg/명예의 전당 뒷배경.png".normalize("NFD"),
  headerPlate: "/frame/탑레벨 프레임_1_.png",
  rankingTableFrame: "/frame/podium/랭킹테이블 프레임.png".normalize("NFD"),
  rankFrames: {
    1: "/frame/podium/랭킹1위 프레임.png".normalize("NFD"),
    2: "/frame/podium/랭킹2위 프레임.png".normalize("NFD"),
    3: "/frame/podium/랭킹3위 프레임.png".normalize("NFD"),
  },
  pageArrow: "/button/이동 화살표2.png".normalize("NFD"),
}
