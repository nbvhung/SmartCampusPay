'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  TrendingUp, Users, Store, Receipt, ArrowUpRight, ArrowDownRight,
  RefreshCw, Activity,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { PageLoading } from '@/components/ui/loading-spinner';
import { transactionApi } from '@/lib/transaction-api';

// ── Types ──────────────────────────────────────────────────────────────────
interface Stats {
  totalTransactions: number;
  totalRevenue: number;
  todayTransactions: number;
  todayRevenue: number;
  totalStudents: number;
  totalMerchants: number;
}

interface ChartDay {
  date: string;
  revenue: number;
  transactions: number;
  topups: number;
}

// ── Formatter ──────────────────────────────────────────────────────────────
const formatVND = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}tr`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
};

const formatVNDFull = (v: number) =>
  new Intl.NumberFormat('vi-VN').format(v) + 'đ';

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({
  title,
  value,
  sub,
  icon,
  trend,
  accent = 'red',
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | null;
  accent?: 'red' | 'green' | 'blue' | 'purple';
}) {
  const accentMap: Record<string, string> = {
    red:    'from-red-500 to-rose-600',
    green:  'from-emerald-500 to-green-600',
    blue:   'from-blue-500 to-indigo-600',
    purple: 'from-purple-500 to-violet-600',
  };
  const bgMap: Record<string, string> = {
    red:    'bg-red-50 border-red-100',
    green:  'bg-emerald-50 border-emerald-100',
    blue:   'bg-blue-50 border-blue-100',
    purple: 'bg-purple-50 border-purple-100',
  };
  return (
    <div className={`relative rounded-2xl border p-5 overflow-hidden shadow-sm ${bgMap[accent]}`}>
      {/* Icon */}
      <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${accentMap[accent]} text-white shadow mb-4`}>
        {icon}
      </div>
      {/* Value */}
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{title}</p>
      {/* Trend */}
      {sub && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
          {trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5" />}
          {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5" />}
          <span>{sub}</span>
        </div>
      )}
      {/* Decorative blob */}
      <div className={`absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${accentMap[accent]} opacity-10`} />
    </div>
  );
}

// ── Tooltip tuỳ chỉnh ─────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium text-gray-900">
            {p.dataKey === 'revenue' ? formatVNDFull(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── PIE colors ─────────────────────────────────────────────────────────────
const PIE_COLORS = ['#ef4444', '#10b981', '#6366f1', '#f59e0b'];

// ── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [chart, setChart]         = useState<ChartDay[]>([]);
  const [days, setDays]           = useState(7);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [statsRes, chartRes] = await Promise.all([
        transactionApi.stats(),
        transactionApi.chartData(days),
      ]);
      setStats(statsRes.data.data);
      setChart(chartRes.data.data ?? []);
    } catch {
      // Giữ data cũ nếu lỗi
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { loadData(); }, [loadData]);

  // Tổng từ chart để tính pie
  const totalTx     = chart.reduce((s, d) => s + d.transactions, 0);
  const totalTopups = chart.reduce((s, d) => s + d.topups, 0);
  const pieData = [
    { name: 'Thanh toán', value: totalTx },
    { name: 'Nạp tiền',   value: totalTopups },
  ];

  if (loading) return <AdminLayout><PageLoading /></AdminLayout>;

  return (
    <AdminLayout title="Tổng quan">
      {/* ── Header actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bảng điều khiển</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cập nhật lúc {new Date().toLocaleTimeString('vi-VN')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Days selector */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  days === d
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {d}N
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Tổng giao dịch"
          value={stats?.totalTransactions.toLocaleString() ?? '0'}
          sub={`${stats?.todayTransactions ?? 0} hôm nay`}
          icon={<Receipt className="w-5 h-5" />}
          trend="up"
          accent="red"
        />
        <KpiCard
          title="Tổng doanh thu"
          value={formatVND(stats?.totalRevenue ?? 0)}
          sub={`${formatVNDFull(stats?.todayRevenue ?? 0)} hôm nay`}
          icon={<TrendingUp className="w-5 h-5" />}
          trend="up"
          accent="green"
        />
        <KpiCard
          title="Sinh viên"
          value={stats?.totalStudents.toLocaleString() ?? '0'}
          icon={<Users className="w-5 h-5" />}
          accent="blue"
        />
        <KpiCard
          title="Điểm thanh toán"
          value={stats?.totalMerchants.toLocaleString() ?? '0'}
          icon={<Store className="w-5 h-5" />}
          accent="purple"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">

        {/* Bar chart — doanh thu theo ngày */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Doanh thu & giao dịch</h2>
              <p className="text-xs text-gray-400">{days} ngày gần nhất</p>
            </div>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chart} barGap={2} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="rev"
                orientation="left"
                tickFormatter={formatVND}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <YAxis
                yAxisId="cnt"
                orientation="right"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: '#6b7280', paddingTop: 8 }}
              />
              <Bar yAxisId="rev" dataKey="revenue"      name="Doanh thu (đ)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="cnt" dataKey="transactions"  name="Thanh toán"   fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.8} />
              <Bar yAxisId="cnt" dataKey="topups"        name="Nạp tiền"     fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart — tỉ lệ loại giao dịch */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Phân loại GD</h2>
          <p className="text-xs text-gray-400 mb-4">{days} ngày gần nhất</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [v, 'Giao dịch']} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="space-y-2 mt-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
                <span className="font-semibold text-gray-900">{d.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats summary row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'GD hôm nay',      value: stats?.todayTransactions ?? 0, suffix: 'GD'  },
          { label: 'Doanh thu hôm nay',value: stats?.todayRevenue ?? 0,      suffix: 'đ', money: true },
          { label: 'Tổng GD',          value: stats?.totalTransactions ?? 0, suffix: 'GD' },
          { label: 'Tổng doanh thu',   value: stats?.totalRevenue ?? 0,      suffix: 'đ', money: true },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{item.label}</p>
            <p className="text-lg font-bold text-gray-900">
              {item.money ? formatVNDFull(item.value as number) : (item.value as number).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
