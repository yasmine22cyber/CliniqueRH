import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function WorkloadByServiceChart({ data = [], height = 300 }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-muted small">Aucune donnée de charge de travail.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
        <XAxis dataKey="service" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={(v) => `${v}h`} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} formatter={(value) => `${value}h`} />
        <Legend />
        <Bar dataKey="normalHours" name="Heures Normales" stackId="a" fill="#1e3a8a" radius={[0, 0, 0, 0]} barSize={30} />
        <Bar dataKey="gardeHours" name="Heures de Garde / Nuit" stackId="a" fill="#FF8042" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}