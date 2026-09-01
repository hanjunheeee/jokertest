import { INVITED_GUESTS_ASSETS } from "@/domains/library/constants/invitedGuests/assets.js"
import {
  INVITED_GUESTS_STANDING_IMAGE_LG_CLASS,
  INVITED_GUESTS_STANDING_IMAGE_WRAP_RAISED_CLASS,
} from "@/domains/library/constants/invitedGuests/layoutStyle.js"

/** 직업별 정적 소개 (설명·전신샷) */
export const INVITED_GUESTS_JOB_CATALOG = {
  noble: {
    jobName: "귀족",
    description:
      "그들은 이 무도회의 주인공이었다. 이름도, 얼굴도, 서로 알 필요가 없었다. 가면이 있었고, 음악이 있었고, 밤이 이어졌으니까. 웃음은 가벼웠고, 술잔은 쉽게 비워졌다. 위험은 언제나 다른 사람의 이야기였다. 그날 밤 전까지는.\n\n한 자리가 비어 있고, 누군가는 돌아오지 않았다. 귀족들은 깨달았다. 이 무도회에서 아무것도 하지 않는다는 선택 역시 하나의 선택이라는 것을.\n\n그들은 결정해야 한다. 믿을 것인지, 의심할 것인지. 그리고 누구를 이 밤에서 내보낼 것인지.",
    standingImage: INVITED_GUESTS_ASSETS.nobleStanding,
  },
  clown: {
    jobName: "광대",
    description:
      "그날 밤, 폭풍우가 저택을 뒤덮었지만 귀족들은 웃음을 원했다. 날씨가 어떻든 그들의 흥은 멈추지 않아야 했으니까. 광대는 비에 젖은 채 그들을 즐겁게 하기 위해 불려왔다. 가면 뒤의 귀족들에게 그는 사람이 아닌 놀이에 불과했다. \n\n 그 순간 광대는 깨달았다. 자신만이 가면을 쓰지 않았다는 것을. 그는 무도회에 놓인 가면을 집어 들었다. 웃음을 지우고 역할을 뒤엎기 위해. 그 밤, 광대는 웃음을 멈췄고 무도회는 침묵을 배웠다. 살인은 복수가 아니라 공연이 되었다. 이제 무도회는 광대를 즐기지 않는다. 광대가 무도회를 연다.",
    standingImage: INVITED_GUESTS_ASSETS.clownStanding,
    standingImageClass: INVITED_GUESTS_STANDING_IMAGE_LG_CLASS,
  },
  doctor: {
    jobName: "주치의",
    description:
      "그는 이 밤이 위험해질 것을 알고 있었다. 웃음이 많을수록, 술잔을 비워갈수록 사고는 늘어나기 마련이니까.\n\n주치의는 무도회에 초대받은 유일한 이방인이었다. 즐기러 온 것이 아니라, 대비하기 위해 불려온 사람. 그는 누구의 편도 아니었다. 귀족의 편도, 광대의 편도 아니었다.\n\n그저, 아직 끝나지 않은 숨을 하나라도 더 붙잡고 싶었을 뿐이다. 그러나 그의 선의는 누구도 증명할 수 없다. 그가 살린 숨결이 과연 누구의 것이었는지조차.",
    standingImage: INVITED_GUESTS_ASSETS.doctorStanding,
    standingImageWrapClass: INVITED_GUESTS_STANDING_IMAGE_WRAP_RAISED_CLASS,
  },
  guard: {
    jobName: "경비원",
    description:
      "오랜 시간 저택에 머물며, 귀족들의 안위를 지켜온 경비원. 얼굴을 가린 귀족들, 이름 없는 웃음들, 정체를 알 수 없는 가면들 사이에서 그는 진짜와 거짓을 구분하고자 한다.\n\n폭풍우 탓에, 광대의 발자국은 지워졌고, 어떠한 증거도 남지 않았다. 하지만 경비원은 알아챘다. 이 밤, 누군가는 수상한 움직임을 보였다는 것을.\n\n그리고 그 확신이 항상 옳지는 않다는 것도.",
    standingImage: INVITED_GUESTS_ASSETS.guardStanding,
  },
  witchHunter: {
    jobName: "마녀사냥꾼",
    description:
      "그녀는 죽은 자의 이야기를 듣는다. 익숙한 목소리. 이미 사라진 뒤, 이미 돌이킬 수 없게 된 후에야 그들은 어둠 속에서 자신의 이름을 남긴다.\n\n누군가는 억울함을 호소하고, 누군가는 마지막 순간 보았던 얼굴을 속삭인다. 하지만 죽은 자의 기억조차 완전하지 않다. 마녀사냥꾼이 전하는 것은 진실일 수도, 또 하나의 저주일 수도 있다.\n\n그녀는 그 목소리를 쫓아 가면 뒤의 정체를 밝혀내지만, 그 사실을 믿을 것인지는 살아남은 자들의 몫이다. 그렇게 또 하나의 의심을 남길 뿐이다.",
    standingImage: INVITED_GUESTS_ASSETS.witchHunterStanding,
  },
}
