"use client";

import { useState } from "react";
import { MAX_ANALOG_VARIABLE_NUMBER, MAX_VARIABLE_NUMBER, type VariableKind } from "@/lib/ladder/types";
import type { VariablePoolApi } from "@/lib/ladder/use-variable-pool";

const KIND_LABEL: Record<VariableKind, string> = {
  input: "Input (X) - button/switch",
  output: "Output (Y)",
  relay: "Internal Relay (M)",
  analog_input: "Analog Input (AI) - sensor/slider",
};

function maxNumberForKind(kind: VariableKind): number {
  return kind === "analog_input" ? MAX_ANALOG_VARIABLE_NUMBER : MAX_VARIABLE_NUMBER;
}

export default function VariablePoolDrawer({ pool }: { pool: VariablePoolApi }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<VariableKind>("input");
  const [num, setNum] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (num === "") {
      setError("Enter a number 0-99.");
      return;
    }
    const result = pool.addVariable(kind, num);
    setError(result.error);
    if (!result.error) setNum("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit rounded-md border border-dashed border-blue-400 px-3 py-1.5 text-sm font-medium text-blue-600 hover:border-blue-500 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
      >
        + Add Variable
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Add Variable (X/Y/M pool)
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                x
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as VariableKind)}
                  className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {(Object.entries(KIND_LABEL) as [VariableKind, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={maxNumberForKind(kind)}
                  value={num}
                  onChange={(e) => setNum(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder={`0-${maxNumberForKind(kind)}`}
                  className="w-20 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Declared variables
              </p>
              {pool.customVariables.length === 0 && (
                <p className="text-xs text-zinc-400">None yet - add one above.</p>
              )}
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                {pool.customVariables.map((v) => (
                  <li
                    key={v.address}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-800"
                  >
                    <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">
                      {v.address}
                    </span>
                    {v.kind === "input" && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => pool.setSwitchType(v.address, "toggle")}
                          className={`rounded px-1.5 py-0.5 ${
                            pool.getSwitchType(v.address) === "toggle"
                              ? "bg-blue-600 text-white"
                              : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                          }`}
                        >
                          Toggle
                        </button>
                        <button
                          type="button"
                          onClick={() => pool.setSwitchType(v.address, "momentary")}
                          className={`rounded px-1.5 py-0.5 ${
                            pool.getSwitchType(v.address) === "momentary"
                              ? "bg-blue-600 text-white"
                              : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                          }`}
                        >
                          Momentary
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => pool.removeVariable(v.address)}
                      className="text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
