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

export default function AbsenteeismByServiceChart({ data = [], height = 300 }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-muted small">Aucune donnée d'absentéisme disponible.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 8" opacity={0.25} horizontal={false} />
        <XAxis type="number" domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="service" width={100} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => `${value}%`} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
        <Legend />
        <Bar 
          dataKey="rate" 
          name="Taux d'absentéisme (%)" 
          fill="#ef4444" 
          radius={[0, 4, 4, 0]}
          barSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}