import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';

interface ApiResponse {
  success: boolean;
  data?: any;
  message?: string;
  statusCode?: number;
}

const args = process.argv.slice(2);
function argValue(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const DEFAULT_URL = 'http://localhost:4000/api/v1';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

function vnd(n: number): string {
  return `${Number(n).toLocaleString('vi-VN')}đ`;
}

async function callApi(
  baseUrl: string,
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: ApiResponse }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      `Không kết nối được server tại ${baseUrl}. Kiểm tra backend đã chạy chưa (cd be && npm run start:dev).`,
    );
  }
  const json = (await res.json().catch(() => ({}))) as ApiResponse;
  return { status: res.status, json };
}

function randomUid(): string {
  const byte = () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `MOCK-UID-${byte()}${byte()}${byte()}${byte()}`;
}

async function main(): Promise<void> {
  console.log('==========================================');
  console.log('   SmartCampusPay - Mock POS Terminal');
  console.log('==========================================');

  const url =
    argValue('url') ??
    process.env.POS_API_URL ??
    (await ask(`API URL [${DEFAULT_URL}]: `).then((v) => v.trim()) ||
      DEFAULT_URL);
  let apiKey = argValue('key') ?? process.env.POS_API_KEY ?? '';
  if (!apiKey) apiKey = (await ask('API Key (mcp_...): ')).trim();
  if (!apiKey) {
    console.error(
      '✗ Chưa có API key. Tạo merchant qua POST /api/v1/merchants để lấy key.',
    );
    rl.close();
    process.exit(1);
  }

  let amount = Number(argValue('amount')) || 25000;

  while (true) {
    console.log('------------------------------------------');
    const amountInput = (
      await ask(`Số tiền (VND) [${amount}] (q = thoát): `)
    ).trim();
    if (amountInput.toLowerCase() === 'q') break;
    if (amountInput) {
      const n = Number(amountInput.replace(/[^0-9]/g, ''));
      if (!n || n <= 0) {
        console.log('  ✗ Số tiền không hợp lệ');
        continue;
      }
      amount = n;
    }

    const uidInput = (
      await ask('Chạm thẻ (UID, Enter = thẻ ngẫu nhiên): ')
    ).trim();
    if (uidInput.toLowerCase() === 'q') break;
    const uid = uidInput || randomUid();

    const lookup = await callApi(
      url,
      apiKey,
      'GET',
      `/hardware/students/by-uid/${encodeURIComponent(uid)}`,
    );
    if (!lookup.json.success || !lookup.json.data) {
      console.log(
        `  ✗ Thẻ từ chối: ${lookup.json.message ?? `HTTP ${lookup.status}`}`,
      );
      continue;
    }
    const student = lookup.json.data;
    console.log(`  ✓ Thẻ hợp lệ: ${student.fullName} (${student.studentCode})`);

    const idempotencyKey = randomUUID();
    const pay = await callApi(url, apiKey, 'POST', '/transactions/pay/card', {
      cardUid: uid,
      amount,
      idempotencyKey,
    });
    if (!pay.json.success || !pay.json.data) {
      console.log(
        `  ✗ Thanh toán thất bại: ${pay.json.message ?? `HTTP ${pay.status}`}`,
      );
      continue;
    }
    const tx = pay.json.data;
    console.log(`  ✓ Thanh toán thành công: -${vnd(amount)} (tx: ${tx.id})`);

    const bal = await callApi(
      url,
      apiKey,
      'GET',
      `/hardware/balance/${encodeURIComponent(uid)}`,
    );
    if (bal.json.success && bal.json.data) {
      console.log(`  Số dư còn lại: ${vnd(bal.json.data.balance)}`);
    }
  }

  console.log('Tạm biệt!');
  rl.close();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
