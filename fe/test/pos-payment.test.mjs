import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePayment, readPendingPayment, finishPayment, PAYMENT_STORAGE_KEY } from '../src/lib/pos-payment.ts';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('a lost response and browser restart replay exactly the persisted request', async () => {
  const storage = memoryStorage();
  const original = await preparePayment(storage, 'device-key', '00a1b2c3', 25000);
  assert.deepEqual(readPendingPayment(storage), original);
  const restored = await preparePayment(storage, 'device-key', 'DIFFERENT-CARD', 100000);
  assert.deepEqual(restored, original);
  assert.equal(original.cardUid, '00A1B2C3');
  assert.ok(!storage.getItem(PAYMENT_STORAGE_KEY).includes('device-key'));
});

test('a different merchant key cannot resend a pending payment', async () => {
  const storage = memoryStorage();
  const original = await preparePayment(storage, 'device-key', '00A1B2C3', 25000);
  await assert.rejects(preparePayment(storage, 'another-key', '00A1B2C3', 25000));
  assert.deepEqual(readPendingPayment(storage), original);
});

test('storage failure stops preparation before the request can be sent', async () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw new Error('quota exceeded'); };
  await assert.rejects(preparePayment(storage, 'device-key', '00A1B2C3', 25000), /quota exceeded/);
});

test('corrupt stored data blocks creating a replacement key', async () => {
  const storage = memoryStorage();
  storage.setItem(PAYMENT_STORAGE_KEY, '{broken');
  await assert.rejects(preparePayment(storage, 'device-key', '00A1B2C3', 25000));
  assert.equal(storage.getItem(PAYMENT_STORAGE_KEY), '{broken');
});

test('only the settled request can be cleared; the next payment gets a new UUID', async () => {
  const storage = memoryStorage();
  const original = await preparePayment(storage, 'device-key', '00A1B2C3', 25000);
  assert.throws(() => finishPayment(storage, 'another-key'));
  assert.deepEqual(readPendingPayment(storage), original);
  finishPayment(storage, original.idempotencyKey);
  assert.equal(readPendingPayment(storage), null);
  const next = await preparePayment(storage, 'device-key', '00A1B2C3', 25000);
  assert.notEqual(next.idempotencyKey, original.idempotencyKey);
});

test('fractional or out of range amounts cannot create a debit request', async () => {
  for (const amount of [0, -1, 99, 10000001, 25000.5, NaN]) {
    const storage = memoryStorage();
    await assert.rejects(preparePayment(storage, 'device-key', '00A1B2C3', amount));
    assert.equal(readPendingPayment(storage), null);
  }
});
