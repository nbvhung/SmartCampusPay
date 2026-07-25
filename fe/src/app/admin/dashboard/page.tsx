'use client';
import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/admin-layout';
import { StatCard } from '@/components/ui/stat-card';
import { PageLoading } from '@/components/ui/loading-spinner';
import { transactionApi } from '@/lib/transaction-api';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    transactionApi.stats().then((r) => setStats(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminLayout><PageLoading /></AdminLayout>;

  return (
    <AdminLayout title="Tổng quan">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tổng giao dịch" value={stats?.totalTransactions ?? 0} />
        <StatCard title="Doanh thu" value={`${(stats?.totalRevenue ?? 0).toLocaleString()}đ`} />
        <StatCard title="Sinh viên" value={stats?.totalStudents ?? 0} />
        <StatCard title="Điểm thanh toán" value={stats?.totalMerchants ?? 0} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <StatCard title="Giao dịch hôm nay" value={stats?.todayTransactions ?? 0} />
        <StatCard title="Doanh thu hôm nay" value={`${(stats?.todayRevenue ?? 0).toLocaleString()}đ`} />
      </div>
    </AdminLayout>
  );
}
