import { apiClient } from "@/shared/api/client";

export const getFriendsApi =  async () => {
    const data = await apiClient("/friends");
    return data.friends;
}