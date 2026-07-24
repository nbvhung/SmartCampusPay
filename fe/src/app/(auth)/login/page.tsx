'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {isAdmin ? 'Admin Login' : 'Student Login'}
        </h1>
        <form className="space-y-4">
          <input
            type="text"
            placeholder={isAdmin ? 'Username' : 'Mã sinh viên'}
            className="w-full px-4 py-2 border rounded-lg"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 border rounded-lg"
          />
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Đăng nhập
          </button>
        </form>
        <button onClick={() => setIsAdmin(!isAdmin)} className="mt-4 text-sm text-blue-600 hover:underline w-full text-center">
          {isAdmin ? 'Student login' : 'Admin login'}
        </button>
      </div>
    </div>
  );
}
