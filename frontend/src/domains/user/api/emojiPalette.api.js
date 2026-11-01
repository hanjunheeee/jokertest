// 이모티콘 팔레트 HTTP 요청 (내 팔레트 받기·저장)
// 이모티콘 팔레트 스토어 액션(emojiPalette/editActions·gameActions)·시험이 씀
import { api } from "../../../shared/api/client.js";

// 내 팔레트 8칸·버전·보유 이모티콘 받기
export const getEmojiPaletteApi = async () => {
    return await api.get("/user/me/emoji-palette");
};

// 팔레트 저장 (받았던 버전을 같이 보내 다른 곳 저장과 겹치면 서버가 거절)
export const saveEmojiPaletteApi = async ({ slots, expectedRevision }) => {
    return await api.put("/user/me/emoji-palette", { slots, expectedRevision });
};
