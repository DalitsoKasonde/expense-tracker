import { describe, expect, it } from "vitest";
import { latestReportedBalance, parseAirtelMessage, parseMomoText, rowFromMomoMessage } from "./momo-sms";

// Real Airtel Money messages, pasted as they come off the phone.
const billPayment = "Txn. ID : LP260922.2113.J24228. Payment to AMMOBILE Account NA of ZMW 15.00 is successful. Your Airtel Money balance is ZMW 25.76";
const tillPayment = "Payment of ZMW 10.00 Till Number SOCHESCARE AIRTEL NETWORKS SELF CARE SOCHE. Airtel Money bal is ZMW 15.76. TID : MP260923.2136.G64740.";
const received = "You have received ZMW 100.00 from .Dial *115# to check your new Bal. TID: PP260924.0647.A19777.";
const tillPaymentLater = "Payment of ZMW 15.00 Till Number SOCHESCARE AIRTEL NETWORKS SELF CARE SOCHE. Airtel Money bal is ZMW 100.76. TID : MP260924.0759.F96338.";
const receivedWholeKwacha = "You have received ZMW 60.Dial *115# to check your new Bal. TID: PP260924.1216.C54235.";

describe("reading Airtel Money SMS", () => {
  it("reads a payment to an account, with the ID at the start", () => {
    expect(parseAirtelMessage(billPayment)).toEqual({
      network: "airtel",
      reference: "LP260922.2113.J24228",
      direction: "out",
      amountMinor: 1500,
      currency: "ZMW",
      counterparty: "AMMOBILE Account NA",
      date: "2026-09-22",
      time: "21:13",
      balanceMinor: 2576,
    });
  });

  it("reads a till payment, with the ID at the end", () => {
    expect(parseAirtelMessage(tillPayment)).toMatchObject({
      direction: "out",
      amountMinor: 1000,
      counterparty: "SOCHESCARE AIRTEL NETWORKS SELF CARE SOCHE",
      date: "2026-09-23",
      time: "21:36",
      balanceMinor: 1576,
    });
  });

  it("reads money received when the sender is left blank", () => {
    expect(parseAirtelMessage(received)).toMatchObject({ direction: "in", amountMinor: 10000, counterparty: "", date: "2026-09-24", balanceMinor: null });
  });

  it("reads a whole-kwacha amount that runs straight into the next sentence", () => {
    // "ZMW 60.Dial" — the full stop ends the sentence, it is not a decimal point.
    expect(parseAirtelMessage(receivedWholeKwacha)).toMatchObject({ direction: "in", amountMinor: 6000 });
  });

  it("dates the entry from the transaction ID, since a paste loses the SMS timestamp", () => {
    expect(parseAirtelMessage(tillPaymentLater)).toMatchObject({ date: "2026-09-24", time: "07:59" });
  });

  it("refuses a message without a transaction ID rather than guessing", () => {
    expect(parseAirtelMessage("Payment of ZMW 10.00 Till Number SHOP. Airtel Money bal is ZMW 5.00.")).toBeNull();
  });

  it("refuses an ID whose date does not exist", () => {
    expect(parseAirtelMessage(tillPayment.replace("MP260923", "MP261340"))).toBeNull();
  });
});

describe("reading a paste of many messages", () => {
  it("orders them oldest first and lists what it could not read", () => {
    const pasted = [tillPaymentLater, "", "Get 5GB for K50! Dial *117#", received, billPayment].join("\n");
    const result = parseMomoText(pasted);

    expect(result.messages.map((message) => message.reference)).toEqual([
      "LP260922.2113.J24228",
      "PP260924.0647.A19777",
      "MP260924.0759.F96338",
    ]);
    expect(result.unread).toEqual(["Get 5GB for K50! Dial *117#"]);
  });

  it("keeps a message pasted twice only once", () => {
    expect(parseMomoText(`${tillPayment}\n${tillPayment}`).messages).toHaveLength(1);
  });

  it("reports the latest balance the wallet actually held", () => {
    // The balances chain exactly: 15.76 + 100 received − 15 paid = 100.76.
    const { messages } = parseMomoText([billPayment, tillPayment, received, tillPaymentLater, receivedWholeKwacha].join("\n"));
    expect(latestReportedBalance(messages)).toEqual({ balanceMinor: 10076, currency: "ZMW", date: "2026-09-24", time: "07:59" });
  });
});

describe("turning a message into a sheet row", () => {
  it("fills amount, date, direction and a note carrying the reference", () => {
    const message = parseAirtelMessage(tillPayment);
    expect(message && rowFromMomoMessage(message, "airtel")).toEqual({
      id: "sms-MP260923.2136.G64740",
      kind: "expense_living",
      transactionDate: "2026-09-23",
      amount: "10.00",
      accountId: "airtel",
      categoryId: "",
      transactionFee: "",
      note: "SOCHESCARE AIRTEL NETWORKS SELF CARE SOCHE · Ref MP260923.2136.G64740",
    });
  });

  it("names a blank sender instead of leaving the note empty", () => {
    const message = parseAirtelMessage(received);
    expect(message && rowFromMomoMessage(message, "airtel")).toMatchObject({ kind: "income_earned", amount: "100.00", note: "Airtel Money received · Ref PP260924.0647.A19777" });
  });

  it("gives the same SMS the same row id every time, which is what stops a double save", () => {
    const first = parseAirtelMessage(billPayment);
    const again = parseAirtelMessage(`  ${billPayment}  `);
    expect(first && rowFromMomoMessage(first, "a").id).toBe(again && rowFromMomoMessage(again, "b").id);
  });
});
