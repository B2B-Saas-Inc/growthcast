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
  if (projection.length < 4) return null;
  const currentIndex = projection.length - 1;
  const quarterStartIndex = currentIndex - 2;
  const priorQuarterEndIndex = currentIndex - 3;
  const quarterSpend = monthlyPaidSpend.slice(quarterStartIndex, currentIndex + 1)
    .reduce((sum, spend) => sum + (spend || 0) + monthlyOverhead, 0);
  if (!quarterSpend) return null;
  return (projection[currentIndex].arr - projection[priorQuarterEndIndex].arr) / quarterSpend;
}

export function calculateBlendedCac(paidSpend: number, monthlyOverhead: number, partnerCommissionCost: number, acquiredCustomers: number) {
  return acquiredCustomers ? (paidSpend + monthlyOverhead + partnerCommissionCost) / acquiredCustomers : 0;
}
