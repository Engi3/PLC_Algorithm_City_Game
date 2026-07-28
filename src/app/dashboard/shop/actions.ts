"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/get-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeLiveEnergy, MAX_ENERGY } from "@/lib/economy/energy";
import { ENERGY_REFILL_AMOUNT, HINT_UNLOCKER_CREDITS, SHOP_ITEMS, type ShopItemId } from "@/lib/economy/shop-items";

export type PurchaseResult =
  | { error: string }
  | {
      error?: undefined;
      itemId: ShopItemId;
      newCoins: number;
      newEnergy?: number;
      newHintCredits?: number;
      newSkipTokens?: number;
    };

export async function purchaseItemAction(itemId: ShopItemId): Promise<PurchaseResult> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { error: "Not signed in." };
    if (profile.role === "teacher") return { error: "Teachers don't need shop items." };

    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return { error: "Unknown item." };
    if (profile.coins < item.cost) {
      return { error: `เหรียญไม่พอ ต้องการ ${item.cost} เหรียญ (คุณมี ${profile.coins})` };
    }

    const admin = createAdminClient();
    const newCoins = profile.coins - item.cost;
    const update: Record<string, unknown> = { coins: newCoins };
    const result: PurchaseResult = { itemId, newCoins };

    if (itemId === "energy_refill") {
      const liveEnergy = computeLiveEnergy(profile.energy, profile.energy_updated_at);
      const newEnergy = Math.min(MAX_ENERGY, liveEnergy + ENERGY_REFILL_AMOUNT);
      update.energy = newEnergy;
      update.energy_updated_at = new Date().toISOString();
      result.newEnergy = newEnergy;
    } else if (itemId === "hint_unlocker") {
      const newHintCredits = profile.hint_credits + HINT_UNLOCKER_CREDITS;
      update.hint_credits = newHintCredits;
      result.newHintCredits = newHintCredits;
    } else if (itemId === "skip_token") {
      const newSkipTokens = profile.skip_tokens + 1;
      update.skip_tokens = newSkipTokens;
      result.newSkipTokens = newSkipTokens;
    }

    const { error } = await admin.from("users").update(update).eq("id", profile.id);
    if (error) {
      console.error("purchaseItemAction: update failed", error);
      return { error: "Could not complete the purchase. Please try again." };
    }

    revalidatePath("/dashboard/shop");
    revalidatePath("/dashboard");
    return result;
  } catch (err) {
    console.error("purchaseItemAction crashed:", err);
    return { error: "Something went wrong. Please try again." };
  }
}
