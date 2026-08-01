"use client";

import { useState } from "react";
import {
  buildVariableAddress,
  isValidVariableNumber,
  MAX_ANALOG_VARIABLE_NUMBER,
  MAX_VARIABLE_NUMBER,
  type DeclaredVariable,
  type SwitchType,
  type VariableKind,
} from "./types";

export type AddVariableResult = { error: string | null };

/**
 * Manages the Phase 10 dynamic X/Y/M variable pool and per-input switch
 * type (momentary vs toggle). Kept separate from useLadderProgram: this is
 * session-local editing configuration, not part of the LadderProgram/
 * SimMemory shapes that get persisted or graded.
 */
export function useVariablePool() {
  const [customVariables, setCustomVariables] = useState<DeclaredVariable[]>([]);
  const [switchTypes, setSwitchTypes] = useState<Record<string, SwitchType>>({});

  function addVariable(kind: VariableKind, num: number, label?: string): AddVariableResult {
    if (!isValidVariableNumber(kind, num)) {
      const max = kind === "analog_input" ? MAX_ANALOG_VARIABLE_NUMBER : MAX_VARIABLE_NUMBER;
      return { error: `Number must be a whole number between 0 and ${max}.` };
    }
    const address = buildVariableAddress(kind, num);
    if (customVariables.some((v) => v.address === address)) {
      return { error: `${address} has already been added.` };
    }
    const trimmedLabel = label?.trim();
    setCustomVariables((prev) => [...prev, { address, kind, label: trimmedLabel || undefined }]);
    return { error: null };
  }

  function removeVariable(address: string) {
    setCustomVariables((prev) => prev.filter((v) => v.address !== address));
    setSwitchTypes((prev) => {
      if (!(address in prev)) return prev;
      const next = { ...prev };
      delete next[address];
      return next;
    });
  }

  /** UX/UI refinement Task 3: renames a declared variable's descriptive subtitle (the "editing" half of create/edit/delete) - the address/kind themselves are immutable once declared, matching how a real PLC's symbol table works. */
  function updateVariableLabel(address: string, label: string) {
    const trimmedLabel = label.trim();
    setCustomVariables((prev) => prev.map((v) => (v.address === address ? { ...v, label: trimmedLabel || undefined } : v)));
  }

  function setSwitchType(address: string, type: SwitchType) {
    setSwitchTypes((prev) => ({ ...prev, [address]: type }));
  }

  function getSwitchType(address: string): SwitchType {
    return switchTypes[address] ?? "toggle";
  }

  return { customVariables, addVariable, removeVariable, updateVariableLabel, getSwitchType, setSwitchType };
}

export type VariablePoolApi = ReturnType<typeof useVariablePool>;
