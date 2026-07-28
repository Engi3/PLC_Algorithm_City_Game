import type { Branch, LadderProgram, Output } from "./types";

function branchExpr(branch: Branch): string | null {
  const terms = branch.cells
    .filter((c) => c !== null)
    .map((c) => (c.type === "NC" ? `NOT ${c.address ?? "???"}` : c.address ?? "???"));
  if (terms.length === 0) return null;
  return terms.length === 1 ? terms[0] : terms.join(" AND ");
}

/** Boolean expression for a rung: branches are parallel (OR), contacts in a branch are series (AND). */
export function rungExpr(branches: Branch[]): string {
  const exprs = branches.map(branchExpr).filter((e): e is string => e !== null);
  if (exprs.length === 0) return "FALSE";
  if (exprs.length === 1) return exprs[0];
  return exprs.map((e) => (e.includes(" AND ") ? `(${e})` : e)).join(" OR ");
}

function outputStatement(output: Output, condition: string): string {
  const addr = output.address ?? "???";
  switch (output.kind) {
    case "COIL":
      return `${addr} := ${condition};`;
    case "SET":
      return `IF ${condition} THEN ${addr} := TRUE; END_IF;`;
    case "RESET":
      return `IF ${condition} THEN ${addr} := FALSE; END_IF; (* also clears timer/counter accumulator if addr is T*/C* *)`;
    case "TIMER":
      return `${addr}(IN := ${condition}, PT := ${output.preset}); (* ${output.variant} *)`;
    case "COUNTER":
      return `${addr}(${output.variant === "CTU" ? "CU" : "CD"} := ${condition}, PV := ${output.preset}); (* ${output.variant} *)`;
  }
}

/** Renders the program as approximate IEC 61131-3 Structured Text, for the read-only ST view. */
export function programToStructuredText(program: LadderProgram): string {
  if (program.rungs.length === 0) return "(* empty program *)";

  const lines = program.rungs.map((rung, i) => {
    const condition = rungExpr(rung.branches);
    const stmt = rung.output ? outputStatement(rung.output, condition) : `(* rung ${i + 1}: no output *)`;
    return `// Rung ${i + 1}\n${stmt}`;
  });

  return lines.join("\n\n");
}
