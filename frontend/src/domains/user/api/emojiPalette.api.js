import { api } from "../../../shared/api/client.js";

export const getEmojiPaletteApi = async () => {
    return await api.get("/user/me/emoji-palette");
};

export const saveEmojiPaletteApi = async ({ slots, expectedRevision }) => {
    return await api.put("/user/me/emoji-palette", { slots, expectedRevision });
};
