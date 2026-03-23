/* Zero-dependency SVG chart components for the panel reports */

const PALETTE = ['#2C5447', '#5B8A7D', '#8AB5A8', '#B8D4CA', '#D9C59C', '#E4D6C1', '#C59292', '#A07070'];

/* ── Horizontal Bar Chart (funnel) ── */

export function HorizontalBarChart({
  items,
  maxValue,
  height = 32,
  gap = 8,
}: {
  items: Array<{ label: string; value: number; color?: string }>;
  maxValue?: number;
  height?: number;
  gap?: number;
}) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1);
  const totalH = items.length * (height + gap) - gap;
  const labelW = 160;
  const valueW = 80;
  const chartW = 400;
  const svgW = labelW + chartW + valueW + 20;

  return (
    <svg viewBox={`0 0 ${svgW} ${totalH}`} className="w-full" style={{ maxHeight: totalH }} role="img" aria-label="Yatay çubuk grafik">
      {items.map((item, i) => {
        const y = i * (height + gap);
        const barW = max > 0 ? (item.value / max) * chartW : 0;
        const color = item.color || PALETTE[i % PALETTE.length];
        return (
          <g key={item.label}>
            <title>{item.label}: {new Intl.NumberFormat('tr-TR').format(item.value)}</title>
            <text x={labelW - 8} y={y + height / 2 + 4} textAnchor="end" fill="#5E665E" fontSize="12" fontFamily="'Neutraface 2 Text', sans-serif">
              {item.label}
            </text>
            <rect x={labelW} y={y + 2} width={barW} height={height - 4} rx={6} fill={color} opacity={0.85} />
            <text x={labelW + chartW + 8} y={y + height / 2 + 4} textAnchor="start" fill="#1B2B24" fontSize="13" fontWeight="600" fontFamily="'Neutraface 2 Text', sans-serif">
              {new Intl.NumberFormat('tr-TR').format(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Donut / Pie Chart ── */

export function DonutChart({
  items,
  size = 180,
  thickness = 28,
}: {
  items: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  thickness?: number;
}) {
  const total = items.reduce((acc, i) => acc + i.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let cumulativeOffset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Halka grafik">
        {items.map((item, i) => {
          const fraction = item.value / total;
          const dashLength = fraction * circumference;
          const dashOffset = -cumulativeOffset;
          cumulativeOffset += dashLength;
          const color = item.color || PALETTE[i % PALETTE.length];
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <circle
              key={item.label}
              aria-label={`${item.label}: %${pct}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={0.85}
            />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#1B2B24" fontSize="20" fontWeight="700" fontFamily="'Neutraface 2 Text', sans-serif">
          {new Intl.NumberFormat('tr-TR').format(total)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#7A7063" fontSize="11" fontFamily="'Neutraface 2 Text', sans-serif">
          Toplam
        </text>
      </svg>
      <div className="space-y-1.5">
        {items.map((item, i) => {
          const color = item.color || PALETTE[i % PALETTE.length];
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={item.label} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#5E665E]">{item.label}</span>
              <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] text-[#1B2B24]">%{pct}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Simple Line Chart ── */

export function SimpleLineChart({
  points,
  width = 500,
  height = 180,
  color = '#2C5447',
}: {
  points: Array<{ label: string; value: number }>;
  width?: number;
  height?: number;
  color?: string;
}) {
  if (points.length === 0) return null;
  const maxV = Math.max(...points.map((p) => p.value), 1);
  const padX = 50;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const stepX = points.length > 1 ? chartW / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + chartH - (p.value / maxV) * chartH,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${padY + chartH} L${coords[0].x},${padY + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Çizgi grafik">
      <defs>
        <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padY + chartH - frac * chartH;
        return <line key={frac} x1={padX} y1={y} x2={width - padX} y2={y} stroke="#E4DBCF" strokeWidth="0.5" />;
      })}
      <path d={areaPath} fill="url(#lineAreaGrad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g key={points[i].label}>
          <circle cx={c.x} cy={c.y} r={3} fill={color}>
            <title>{points[i].label}: {new Intl.NumberFormat('tr-TR').format(points[i].value)}</title>
          </circle>
          <text x={c.x} y={padY + chartH + 16} textAnchor="middle" fill="#7A7063" fontSize="10" fontFamily="'Neutraface 2 Text', sans-serif">
            {points[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
}
