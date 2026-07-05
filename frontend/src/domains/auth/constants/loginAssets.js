/**
 * 로그인 화면 public 에셋 경로 (frontend/public 기준)
 *
 * React 훅과는 무관한 순수 상수 파일입니다. 로그인/회원가입 화면(AuthScene,
 * LoginForm, SignupForm, AuthInputSlot 등)에서 이미지·영상 경로를 하드코딩하지
 * 않고 이 객체를 통해 가져다 씁니다. 값은 각각 아래 용도의 파일 경로입니다.
 */
export const LOGIN_ASSETS = {
  bgVideo: "/bg/로그인_뒷배경_무한루프.mp4", // 배경 반복 재생 영상
  frame: "/frame/로그인 프레임.png", // 폼을 감싸는 중앙 프레임 이미지
  ageRating: "/logo/전체이용가 표시.png", // 좌상단 연령 등급 마크
  input: "/button/입력창1.png", // 입력 필드 배경 이미지 (AuthInputSlot)
  checkbox: "/button/체크박스.png", // 로그인 상태 유지 체크박스 이미지
  loginButton: "/button/로그인 버튼.png", // 로그인 제출 버튼 이미지
  signupButton: "/button/회원가입 버튼.png", // 회원가입 제출 버튼 이미지
  google: "/button/구글로로그인.png", // 구글 소셜 로그인 버튼 이미지
  apple: "/button/애플로로그인.png", // 애플 소셜 로그인 버튼 이미지
  discord: "/button/디스코드로로그인.png", // 디스코드 소셜 로그인 버튼 이미지
}
