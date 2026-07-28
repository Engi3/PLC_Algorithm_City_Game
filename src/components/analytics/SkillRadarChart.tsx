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
import { SKILL_LABELS } from "@/lib/ladder/level-spec";
import { ALL_SKILLS, type SkillScores } from "@/lib/analytics/skill-radar";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export type RadarDataset = { label: string; scores: SkillScores; color: string };

export default function SkillRadarChart({ datasets }: { datasets: RadarDataset[] }) {
  const data = {
    labels: ALL_SKILLS.map((s) => SKILL_LABELS[s]),
    datasets: datasets.map((d) => ({
      label: d.label,
      data: ALL_SKILLS.map((s) => d.scores[s]),
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
          plugins: { legend: { display: datasets.length > 1 } },
        }}
      />
    </div>
  );
}
