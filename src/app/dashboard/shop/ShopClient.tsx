"use client";

import { useState } from "react";
import { SHOP_ITEMS } from "@/lib/economy/shop-items";
import { purchaseItemAction } from "./actions";

export default function ShopClient({
  initialCoins,
  initialEnergy,
  initialHintCredits,
  initialSkipTokens,
}: {
  initialCoins: number;
  initialEnergy: number;
  initialHintCredits: number;
  initialSkipTokens: number;
}) {
  const [coins, setCoins] = useState(initialCoins);
  const [energy, setEnergy] = useState(initialEnergy);
  const [hintCredits, setHintCredits] = useState(initialHintCredits);
  const [skipTokens, setSkipTokens] = useState(initialSkipTokens);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function buy(itemId: (typeof SHOP_ITEMS)[number]["id"]) {
    setPendingItem(itemId);
    setMessage(null);
    try {
      const result = await purchaseItemAction(itemId);
      if ("error" in result && result.error) {
        setMessage({ text: result.error, isError: true });
      } else if (!("error" in result)) {
        setCoins(result.newCoins);
        if (result.newEnergy !== undefined) setEnergy(result.newEnergy);
        if (result.newHintCredits !== undefined) setHintCredits(result.newHintCredits);
        if (result.newSkipTokens !== undefined) setSkipTokens(result.newSkipTokens);
        setMessage({ text: "ซื้อสำเร็จ!", isError: false });
      }
    } catch (err) {
      console.error("buy failed:", err);
      setMessage({ text: "เกิดข้อผิดพลาด กรุณาลองใหม่", isError: true });
    } finally {
      setPendingItem(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="เหรียญ" value={coins} />
        <StatCard label="พลังงาน" value={energy} />
        <StatCard label="คำใบ้" value={hintCredits} />
        <StatCard label="Skip Token" value={skipTokens} />
      </div>

      {message && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            message.isError
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SHOP_ITEMS.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{item.name}</h2>
            <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
            <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
              {item.cost} เหรียญ
            </p>
            <button
              type="button"
              onClick={() => buy(item.id)}
              disabled={pendingItem === item.id || coins < item.cost}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pendingItem === item.id ? "กำลังซื้อ..." : "ซื้อ"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}
