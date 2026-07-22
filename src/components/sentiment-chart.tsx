"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { FullReport } from "@/lib/schema";

export function SentimentDonut({ sentiment }: { sentiment: FullReport["sentiment"] }) {
  const data = [
    { name: "Positive", value: sentiment.positive, color: "var(--chart-2)" },
    { name: "Neutral", value: sentiment.neutral, color: "var(--muted-foreground)" },
    { name: "Negative", value: sentiment.negative, color: "var(--chart-3)" },
  ].filter((d) => d.value > 0);

  const hasData = data.length > 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[120px] w-[120px] shrink-0">
        {hasData && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={58}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold">
            {Math.round(sentiment.positivePct)}%
          </span>
          <span className="text-[11px] text-muted-foreground">positive</span>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        <LegendRow color="var(--chart-2)" label="Positive" pct={sentiment.positivePct} count={sentiment.positive} />
        <LegendRow color="var(--muted-foreground)" label="Neutral" pct={sentiment.neutralPct} count={sentiment.neutral} />
        <LegendRow color="var(--chart-3)" label="Negative" pct={sentiment.negativePct} count={sentiment.negative} />
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  pct,
  count,
}: {
  color: string;
  label: string;
  pct: number;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="w-16 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-10 text-right tabular-nums text-muted-foreground">
        {Math.round(pct)}%
      </span>
      <span className="w-12 text-right tabular-nums text-xs text-muted-foreground/70">
        {count.toLocaleString()}
      </span>
    </div>
  );
}
