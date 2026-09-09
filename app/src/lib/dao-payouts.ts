import { quoteSettlementFee, type SettlementFeeMode } from "@privara/sdk";
import { parseUnits } from "../config/assets";

export interface DaoPayoutInput {
  id: string;
  name: string;
  recipient: string;
  amount: string;
}

export interface QuotedDaoPayout extends DaoPayoutInput {
  enteredAmount: bigint;
  recipientAmount: bigint;
  settlementFee: bigint;
  totalAmount: bigint;
}

export interface DaoPayoutBatchQuote {
  payouts: QuotedDaoPayout[];
  recipientTotal: bigint;
  feeTotal: bigint;
  totalAmount: bigint;
}

/** Quote every payout independently because each becomes its own signed on-chain intent. */
export function quoteDaoPayoutBatch(options: {
  payouts: DaoPayoutInput[];
  decimals: number;
  feeBps: bigint;
  feeMode: SettlementFeeMode;
  maxIntentAmount?: bigint;
}): DaoPayoutBatchQuote {
  if (options.payouts.length === 0) throw new Error("Add at least one contributor");
  const seen = new Set<string>();
  const payouts = options.payouts.map((payout, index): QuotedDaoPayout => {
    const name = payout.name.trim();
    const recipient = payout.recipient.trim();
    if (!name) throw new Error(`Contributor ${index + 1} needs a name`);
    if (!recipient) throw new Error(`${name} needs a Stacks address`);
    if (seen.has(recipient)) throw new Error(`${name} repeats a recipient already in this batch`);
    seen.add(recipient);
    const enteredAmount = parseUnits(payout.amount, options.decimals);
    const quote = quoteSettlementFee({
      amount: enteredAmount,
      feeBps: options.feeBps,
      mode: options.feeMode,
    });
    if (options.maxIntentAmount !== undefined && quote.totalAmount > options.maxIntentAmount) {
      throw new Error(`${name}'s payout exceeds the relayer maximum`);
    }
    return { ...payout, name, recipient, ...quote };
  });
  return {
    payouts,
    recipientTotal: payouts.reduce((total, payout) => total + payout.recipientAmount, 0n),
    feeTotal: payouts.reduce((total, payout) => total + payout.settlementFee, 0n),
    totalAmount: payouts.reduce((total, payout) => total + payout.totalAmount, 0n),
  };
}

/** Parse a small RFC-4180-style CSV with name,address,amount columns. */
export function parseDaoPayoutCsv(csv: string): DaoPayoutInput[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      record.push(field.trim()); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index++;
      record.push(field.trim()); field = "";
      if (record.some(Boolean)) records.push(record);
      record = [];
    } else field += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  if (records.length === 0) throw new Error("CSV is empty");

  const normalizedHeader = records[0].map((value) => value.replace(/^\uFEFF/, "").toLowerCase().replace(/[\s_-]/g, ""));
  const nameIndex = normalizedHeader.findIndex((value) => value === "name" || value === "contributor");
  const addressIndex = normalizedHeader.findIndex((value) => value === "address" || value === "recipient");
  const amountIndex = normalizedHeader.indexOf("amount");
  if (nameIndex < 0 || addressIndex < 0 || amountIndex < 0) {
    throw new Error("CSV header must contain name, address, and amount");
  }
  const payouts = records.slice(1).map((values, index) => ({
    id: `csv-${index + 1}`,
    name: values[nameIndex]?.trim() ?? "",
    recipient: values[addressIndex]?.trim() ?? "",
    amount: values[amountIndex]?.trim() ?? "",
  }));
  if (payouts.length === 0) throw new Error("CSV does not contain any contributor rows");
  return payouts;
}
