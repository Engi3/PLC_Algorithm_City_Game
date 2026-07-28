export type ShopItemId = "energy_refill" | "hint_unlocker" | "skip_token";

export type ShopItem = {
  id: ShopItemId;
  name: string;
  description: string;
  cost: number;
};

export const ENERGY_REFILL_AMOUNT = 20;
export const HINT_UNLOCKER_CREDITS = 3;

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "energy_refill",
    name: "เติมพลังงาน (Energy Refill)",
    description: `เพิ่มพลังงานทันที ${ENERGY_REFILL_AMOUNT} หน่วย (สูงสุด 100)`,
    cost: 15,
  },
  {
    id: "hint_unlocker",
    name: "ปลดล็อกคำใบ้ (Hint Unlocker)",
    description: `รับสิทธิ์ขอคำใบ้จาก AI เพิ่ม ${HINT_UNLOCKER_CREDITS} ครั้ง`,
    cost: 10,
  },
  {
    id: "skip_token",
    name: "บัตรข้ามด่าน (Skip Level Token)",
    description: "ข้ามด่านที่ติดอยู่ได้ 1 ด่าน (ใช้ในหน้าเล่นด่านนั้นๆ)",
    cost: 30,
  },
];
