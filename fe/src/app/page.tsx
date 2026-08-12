import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">SmartCampusPay</h1>
        <p className="text-lg text-gray-600">Hệ thống thanh toán nội bộ cho thẻ sinh viên gắn chip</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/student/dashboard" className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Cổng sinh viên
          </Link>
          <Link href="/admin/dashboard" className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900">
            Quản trị
          </Link>
          <Link href="/pos" className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
            POS (Test)
          </Link>
        </div>
      </div>
    </main>
  );
}
