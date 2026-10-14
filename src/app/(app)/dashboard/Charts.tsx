"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Slice {
  name: string;
  value: number;
}

interface Trend {
  month: string;
  submitted: number;
  approved: number;
  rejected: number;
}

// Okabe–Ito colour-blind-safe palette.
const PALETTE = [
  "#66864D",
  "#A7B98D",
  "#356B4B",
  "#C68C48",
  "#8C9D78",
  "#B9C8AD",
  "#6F8170",
  "#D6DFD0",
];

function Panel({
  title,
  empty,
  children,
  data,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
  data: Array<Record<string, string | number>>;
}) {
  const cols = data[0] ? Object.keys(data[0]) : [];

  return (
    <section className="card p-4 dashboard-chart-inner">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>

      {empty ? (
        <p className="flex h-56 items-center justify-center text-sm text-slate-500">
          No data for the selected filters.
        </p>
      ) : (
        <>
          <div className="h-56" role="img" aria-label={`${title} chart`}>
            {children}
          </div>

          <details className="mt-2 text-xs text-slate-600">
            <summary className="cursor-pointer">View as table</summary>

            <table className="mt-1 w-full">
              <thead>
                <tr>
                  {cols.map((column) => (
                    <th
                      key={column}
                      className="text-left font-medium capitalize"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {data.map((row, index) => (
                  <tr key={index}>
                    {cols.map((column) => (
                      <td key={column}>{row[column]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

export function DonutPanel({ title, data }: { title: string; data: Slice[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Panel
      title={title}
      empty={total === 0}
      data={data as unknown as Array<Record<string, string | number>>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>

          <Tooltip
            formatter={(value, name) => {
              const numericValue = Number(value ?? 0);
              const percentage =
                total > 0 ? Math.round((numericValue / total) * 100) : 0;

              return [`${numericValue} (${percentage}%)`, String(name ?? "")];
            }}
          />

          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export function BarPanel({ title, data }: { title: string; data: Slice[] }) {
  return (
    <Panel
      title={title}
      empty={data.length === 0}
      data={data as unknown as Array<Record<string, string | number>>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke="#edf0eb" />

          <XAxis type="number" allowDecimals={false} />

          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 11 }}
          />

          <Tooltip />

          <Bar
            dataKey="value"
            name="Staff"
            fill={PALETTE[0]}
            radius={[0, 3, 3, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export function TrendPanel({ title, data }: { title: string; data: Trend[] }) {
  const empty = data.every((item) => item.submitted === 0);

  return (
    <Panel
      title={title}
      empty={empty}
      data={data as unknown as Array<Record<string, string | number>>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 16 }}>
          <CartesianGrid stroke="#edf0eb" strokeDasharray="3 4" />

          <XAxis dataKey="month" tick={{ fontSize: 11 }} />

          <YAxis allowDecimals={false} />

          <Tooltip />

          <Legend />

          <Line
            type="monotone"
            dataKey="submitted"
            name="Submitted"
            stroke={PALETTE[0]}
            strokeWidth={2.4}
            dot={false}
          />

          <Line
            type="monotone"
            dataKey="approved"
            name="Approved"
            stroke={PALETTE[2]}
            strokeWidth={2.4}
            dot={false}
          />

          <Line
            type="monotone"
            dataKey="rejected"
            name="Rejected"
            stroke={PALETTE[3]}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}
