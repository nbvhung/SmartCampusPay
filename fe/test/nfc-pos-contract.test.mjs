import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const firmwarePath = new URL("../../docs/esp32-reference.ino", import.meta.url);
const hardwareApiPath = new URL("../../docs/hardware-api.md", import.meta.url);

test("firmware selects payment amount before entering WAITING_FOR_CARD", async () => {
  const firmware = await readFile(firmwarePath, "utf8");
  const selectState = firmware.indexOf("case STATE_SELECT_AMOUNT:");
  const waitingTransition = firmware.indexOf(
    "enterState(STATE_WAITING_FOR_PAYMENT_CARD)",
    selectState,
  );
  const waitingState = firmware.indexOf(
    "case STATE_WAITING_FOR_PAYMENT_CARD:",
    waitingTransition,
  );
  const cardRead = firmware.indexOf("readCardUid()", waitingState);
  const payment = firmware.indexOf(
    "doPayment(currentCardUid, currentPaymentAmount)",
    cardRead,
  );

  assert.ok(selectState >= 0);
  assert.ok(waitingTransition > selectState);
  assert.ok(waitingState > waitingTransition);
  assert.ok(cardRead > waitingState);
  assert.ok(payment > cardRead);
  assert.match(
    firmware,
    /showWaitingForCard\("THANH TOAN", currentPaymentAmount\)/,
  );
});

test("firmware persists and recovers one immutable request before accepting another", async () => {
  const firmware = await readFile(firmwarePath, "utf8");
  const persist = firmware.indexOf('prefs.putString("pending_pay", payload)');
  const send = firmware.indexOf(
    'apiRequest("POST", "/transactions/pay/card", pendingPaymentPayload',
  );
  const lookup = firmware.indexOf('"/transactions/payments/" + key');

  assert.ok(persist >= 0 && send > persist);
  assert.ok(lookup > persist && lookup < send);
  assert.match(firmware, /pendingPaymentPayload\.length\(\) > 0/);
  assert.match(firmware, /url != BASE_URL \|\| key != API_KEY/);
  assert.match(
    firmware,
    /lastHttpCode == 404 && lookupCode == "PAYMENT_NOT_FOUND"/,
  );
});

test("hardware API documents direct-device production security and recovery", async () => {
  const docs = await readFile(hardwareApiPath, "utf8");
  assert.match(docs, /raw API key được provision vào NVS/);
  assert.match(docs, /WAITING_FOR_CARD/);
  assert.match(docs, /lookup UUID rồi replay cùng payload\/key/);
});
