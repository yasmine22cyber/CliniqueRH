import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d0ed57', '#8dd1e1', '#83a6ed'];
export default function PersonnelByGradeChart({ data = [], height = 300 }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-muted small">Aucune donnée à afficher.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          dataKey="count"
          nameKey="grade"
          labelLine={false}
          label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
            const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
            const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
            const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
            if (percent < 0.04) return null; //ma yektbesh label
            return (
              <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
                {`${(percent * 100).toFixed(0)}%`}
              </text>
            );
          }}   
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [value, "Personnel"]} />
        <Legend 
          layout="vertical" 
          verticalAlign="middle" 
          align="left" 
        />
      </PieChart>
    </ResponsiveContainer>
  );
}