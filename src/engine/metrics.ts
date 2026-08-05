import type { ForecastMonth } from './forecast';

export type CashFlowSettings = {
  feeRate: number;
  refundRate: number;
  monthlyShare: number;
  annualShare: number;
  oneTimeEnabled: boolean;
  oneTimeShare: number;
};

export const defaultCashFlow: CashFlowSettings = {
  feeRate: 0,
  refundRate: 0,
  monthlyShare: 1,
  annualShare: 0,
  oneTimeEnabled: false,
  oneTimeShare: 0,
};

export function cashFlowFor(month: ForecastMonth, settings: CashFlowSettings) {
  const monthlySubscriptions = month.endingMrr * settings.monthlyShare;
  const yearlySubscriptions = month.newMrr * settings.annualShare * 12;
  const oneTimePayments = settings.oneTimeEnabled ? month.newMrr * settings.oneTimeShare * 12 : 0;
  const grossCash = monthlySubscriptions + yearlySubscriptions + oneTimePayments;
  const fees = -grossCash * settings.feeRate;
  const refunds = -grossCash * settings.refundRate;
  return { monthlySubscriptions, yearlySubscriptions, oneTimePayments, fees, refunds, netCash: grossCash + fees + refunds };
}

export function calculateNrr(expansionRate: number, retractionRate: number, revenueChurnRate: number) {
  return 1 + expansionRate - retractionRate - revenueChurnRate;
}

export function calculateMagicNumber(projection: ForecastMonth[], monthlyPaidSpend: number[], monthlyOverhead: number) {
  const quarters = Object.values(projection.reduce<Record<string, { row: ForecastMonth; index: number }[]>>((groups, row, index) => {
    const [year, month] = row.month.split('-').map(Number);
    const key = `${year}-Q${Math.ceil(month / 3)}`;
    (groups[key] ??= []).push({ row, index });
    return groups;
  }, {})).filter(group => group.length === 3);
  const current = quarters.at(-1);
  const prior = quarters.at(-2);
  if (!current || !prior) return null;
  const priorSpend = prior.reduce((sum, { index }) => sum + (monthlyPaidSpend[index] || 0) + monthlyOverhead, 0);
  if (!priorSpend) return null;
  return ((current.at(-1)!.row.arr - prior.at(-1)!.row.arr) * 4) / priorSpend;
}
