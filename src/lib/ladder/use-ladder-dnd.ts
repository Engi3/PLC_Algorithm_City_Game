"use client";

import { useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { PaletteDragData } from "@/components/ladder/LadderPalette";
import type { LadderProgramApi } from "./use-ladder-program";

/** Wires dnd-kit drag events to a useLadderProgram instance's placement handlers. */
export function useLadderDnd(programApi: Pick<LadderProgramApi, "placeContact" | "placeOutput">) {
  const [activeDrag, setActiveDrag] = useState<PaletteDragData | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag((event.active.data.current as PaletteDragData) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current as PaletteDragData | undefined;
    const dropData = over.data.current as
      | { accepts: "contact" | "output"; rungId: string; rowIndex?: number; colIndex?: number }
      | undefined;
    if (!dragData || !dropData) return;

    if (
      dragData.kind === "contact" &&
      dropData.accepts === "contact" &&
      dropData.rowIndex !== undefined &&
      dropData.colIndex !== undefined
    ) {
      programApi.placeContact(dropData.rungId, dropData.rowIndex, dropData.colIndex, dragData.contactType);
    } else if (dragData.kind === "output" && dropData.accepts === "output") {
      programApi.placeOutput(dropData.rungId, dragData.outputKind);
    }
  }

  return { activeDrag, handleDragStart, handleDragEnd };
}
