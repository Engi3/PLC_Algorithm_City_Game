/** Which action a click on the grid currently performs. Owned by the top-level editor as plain UI state (not part of GridProgram). */
export type GridTool =
  | { kind: "PLACE"; nodeKind: "NO" | "NC" | "COMPARE" | "COIL" | "SET" | "RESET" | "TIMER" | "COUNTER" }
  | { kind: "DRAW_LINE" }
  | { kind: "DELETE_LINE" }
  | null;
