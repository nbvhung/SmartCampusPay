// Read-only browser fixtures. No requests reach a real backend or database.
const now = new Date().toISOString();
const student = { id: 'student-preview', studentCode: 'B23DCCN001', fullName: 'Nguyễn Minh Anh', email: 'minhanh@stu.ptit.edu.vn', faculty: 'Công nghệ thông tin', phone: '0901234567', isActive: true, mustChangePassword: false, createdAt: now, updatedAt: now };
const account = { id: 'wallet-preview', studentId: student.id, balance: 450000, dailyLimit: 200000, dailySpent: 35000, status: 'active', student, createdAt: now };
const card = { id: 'card-preview', uid: 'A1B2C3D4', studentId: student.id, chipType: 'MIFARE', status: 'active', student, createdAt: now, updatedAt: now };
const merchant = { id: 'merchant-preview', name: 'Căng tin A', location: 'Tòa A2 · PTIT', type: 'canteen', isActive: true, createdAt: now, updatedAt: now };
const transactions = Array.from({ length: 5 }, (_, index) => ({ id: `tx-${index}`, amount: index === 0 ? 100000 : 35000, type: index === 0 ? 'credit' : 'debit', status: 'success', studentId: student.id, studentCode: student.studentCode, accountId: account.id, merchant, merchantId: merchant.id, createdAt: now, description: index === 0 ? 'Nạp tiền vào ví' : 'Thanh toán tại Căng tin A' }));
const admin = { id: 'admin-preview', username: 'admin', fullName: 'Quản trị PTIT', role: 'super_admin', isActive: true, createdAt: now };
export function fixture(path, role) {
  if (path.endsWith('/auth/me')) return role === 'student' ? { ...student, role, accounts: [account], cards: [card] } : admin;
  if (path.endsWith('/transactions/stats')) return { totalTransactions: 1284, totalRevenue: 45280000, todayTransactions: 86, todayRevenue: 3240000, totalStudents: 1200, totalMerchants: 8 };
  if (path.endsWith('/transactions/chart')) return Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10), revenue: 900000 + i * 280000, transactions: 25 + i * 7, topups: 12 + i * 3 }));
  if (path.includes('/transactions')) return transactions;
  if (path.includes('/accounts/student')) return account;
  if (path.includes('/accounts')) return [account];
  if (path.includes('/cards')) return [card];
  if (path.includes('/students/')) return student;
  if (path.endsWith('/students')) return [student];
  if (path.includes('/merchants')) return [merchant];
  if (path.includes('/admins')) return [admin];
  if (path.includes('/topup-pending')) return [{ id: 'pending-preview', transferId: 'BANK-001', amount: 100000, content: 'NAP TIEN SINH VIEN', sender: 'NGUYEN MINH ANH', bankRef: 'FT001', bankName: 'MB', status: 'pending', createdAt: now }];
  throw new Error(`Unexpected preview API: ${path}`);
}
