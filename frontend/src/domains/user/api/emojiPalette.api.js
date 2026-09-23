// F-33 E-2(설계도 §2-2): 이모티콘 팔레트 8칸 조회·저장 API. user.api.js와 같은 방식으로
// 공통 API 클라이언트(shared/api/client.js)만 쓴다 — 쿠키 포함 요청, 401 갱신, 오류 변환은
// 그 안에서 처리된다. 실패는 여기서 삼키지 않고 그대로 전파한다: 409 REVISION_MISMATCH의
// revision·slots는 shared/api/response.js의 toApiError가 Error 객체에 실어 준다.
import { api } from "../../../shared/api/client.js";

/** @returns {Promise<{ ok: boolean, slots: (string|null)[], revision: string, owned: string[] }>} */
export const getEmojiPaletteApi = async () => {
    return await api.get("/user/me/emoji-palette");
};

/** @param {{ slots: (string|null)[], expectedRevision: string }} params
 *  @returns {Promise<{ ok: boolean, slots: (string|null)[], revision: string }>} */
export const saveEmojiPaletteApi = async ({ slots, expectedRevision }) => {
    // 서버가 허용하는 필드는 이 둘뿐이다(모르는 필드는 400) — 객체를 그대로 넘기지 않고
    // 두 값만 다시 싣는다.
    return await api.put("/user/me/emoji-palette", { slots, expectedRevision });
};
