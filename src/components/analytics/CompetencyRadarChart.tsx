"use client";

import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Radar } from "react-chartjs-2";
import { ALL_COMPETENCY_AXES, COMPETENCY_LABELS_TH, type CompetencyScores } from "@/lib/analytics/competency";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export type CompetencyRadarDataset = { label: string; scores: CompetencyScores; color: string };

/** The 6-Axis Engineering Competency radar (Phase 12) - a broader pedagogical model than SkillRadarChart's per-instruction-type breakdown. */
export default function CompetencyRadarChart({ datasets }: { datasets: CompetencyRadarDataset[] }) {
  const data = {
    labels: ALL_COMPETENCY_AXES.map((a) => COMPETENCY_LABELS_TH[a]),
    datasets: datasets.map((d) => ({
      label: d.label,
      data: ALL_COMPETENCY_AXES.map((a) => d.scores[a]),
      backgroundColor: `${d.color}33`,
      borderColor: d.color,
      pointBackgroundColor: d.color,
    })),
  };

  return (
    <div className="mx-auto aspect-square w-full max-w-sm">
      <Radar
        data={data}
        options={{
          maintainAspectRatio: false,
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { stepSize: 20, showLabelBackdrop: false },
            },
          },
          plugins: {
            legend: { display: datasets.length > 1 },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}/100`,
              },
            },
          },
        }}
      />
    </div>
  );
}
