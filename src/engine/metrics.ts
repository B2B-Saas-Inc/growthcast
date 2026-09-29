import type { ForecastMonth } from "./forecast";

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
  const oneTimePayments = settings.oneTimeEnabled
    ? month.newMrr * settings.oneTimeShare * 12
    : 0;
  const grossCash =
    monthlySubscriptions + yearlySubscriptions + oneTimePayments;
  const fees = -grossCash * settings.feeRate;
  const refunds = -grossCash * settings.refundRate;
  return {
    monthlySubscriptions,
    yearlySubscriptions,
    oneTimePayments,
    fees,
    refunds,
    netCash: grossCash + fees + refunds,
  };
}

export function calculateNrr(
  expansionRate: number,
  retractionRate: number,
  revenueChurnRate: number,
) {
  return 1 + expansionRate - retractionRate - revenueChurnRate;
}

export function calculatePredictedLtv(
  businessModel: "b2c" | "b2b",
  acquisitionArpu: number | null,
  acv: number,
  churnRate: number,
  grossMargin: number,
) {
  if (!churnRate) return null;
  if (businessModel === "b2b") return (acv * grossMargin) / churnRate;
  return acquisitionArpu === null
    ? null
    : (acquisitionArpu * grossMargin) / churnRate;
}

export function calculatePaybackPeriod(
  businessModel: "b2c" | "b2b",
  blendedCac: number,
  acquisitionArpu: number | null,
  acv: number,
  grossMargin: number,
) {
  const monthlyRevenue =
    businessModel === "b2b"
      ? (acv / 12) * grossMargin
      : (acquisitionArpu ?? 0) * grossMargin;
  return monthlyRevenue ? blendedCac / monthlyRevenue : 0;
}

export function calculateMagicNumber(
  projection: ForecastMonth[],
  monthlyPaidSpend: number[],
  monthlyOverhead: number,
) {
  if (projection.length < 4) return null;
  const currentIndex = projection.length - 1;
  const quarterStartIndex = currentIndex - 2;
  const priorQuarterEndIndex = currentIndex - 3;
  const quarterSpend = monthlyPaidSpend
    .slice(quarterStartIndex, currentIndex + 1)
    .reduce((sum, spend) => sum + (spend || 0) + monthlyOverhead, 0);
  if (!quarterSpend) return null;
  return (
    (projection[currentIndex].arr - projection[priorQuarterEndIndex].arr) /
    quarterSpend
  );
}

export function calculateBlendedCac(
  paidSpend: number,
  monthlyOverhead: number,
  partnerCommissionCost: number,
  acquiredCustomers: number,
) {
  return acquiredCustomers
    ? (paidSpend + monthlyOverhead + partnerCommissionCost) / acquiredCustomers
    : 0;
}

/** Margin is before fulfillment, payment fees, refunds and marketing. COGS is not recovered on refunds. */
export function ecommerceMetrics(
  month: import("./forecast").EcommerceMonth,
  a: import("../ecommerce").EcommerceModel,
) {
  const refunds = month.revenue * a.refundRate;
  const netRevenue = month.revenue - refunds;
  const cogs = month.revenue * (1 - a.grossMargin);
  const fees = month.revenue * a.feeRate;
  const fulfillment = month.orders * a.fulfillmentCost;
  const contribution = netRevenue - cogs - fees - fulfillment;
  const marketing = month.spend + month.commissions + a.overhead;
  const paidRows = month.segments.filter(
    (s) => s.category === "Direct Response" || s.category === "Demand Gen",
  );
  const paidSpend = paidRows.reduce((sum, s) => sum + s.spend, 0);
  const paidRevenue = paidRows.reduce(
    (sum, s) => sum + s.newRevenue * (1 - a.refundRate),
    0,
  );
  return {
    refunds,
    netRevenue,
    cogs,
    fees,
    fulfillment,
    contribution,
    marketing,
    paidSpend,
    contributionAfterMarketing: contribution - marketing,
    cashReceipts: netRevenue - fees,
    cac: month.newCustomers ? marketing / month.newCustomers : null,
    roas: paidSpend ? paidRevenue / paidSpend : null,
    mer: marketing ? netRevenue / marketing : null,
    aov: month.orders ? month.revenue / month.orders : null,
    repeatOrderShare: month.orders ? month.repeatOrders / month.orders : null,
  };
}

/** Finite 12-month value, not a churn-derived perpetual lifetime value. */
export function ecommerceUnitEconomics(
  a: import("../ecommerce").EcommerceModel,
  acquisitionAov = a.aov,
) {
  const contributionPerOrder = (value: number) =>
    value * (a.grossMargin - a.refundRate - a.feeRate) - a.fulfillmentCost;
  const firstOrderContribution = contributionPerOrder(acquisitionAov);
  const twelveMonthValue =
    firstOrderContribution +
    11 * a.repeatRate * a.repeatOrders * contributionPerOrder(a.repeatAov);
  return {
    firstOrderContribution,
    twelveMonthValue,
    maxCac: Math.max(0, twelveMonthValue / a.targetLtvCac),
  };
}

export function ecommerceProjectionEconomics(
  projection: import("./forecast").EcommerceMonth[],
  assumptions: import("../ecommerce").EcommerceModel,
) {
  const newCustomers = projection.reduce(
    (sum, month) => sum + month.newCustomers,
    0,
  );
  const firstPurchaseRevenue = projection.reduce(
    (sum, month) => sum + month.newRevenue,
    0,
  );
  return ecommerceUnitEconomics(
    assumptions,
    newCustomers ? firstPurchaseRevenue / newCustomers : assumptions.aov,
  );
}

/** Shared rows for commerce charts, tables and exports. The first growth comparison is unavailable. */
export function ecommerceAnalysis(
  projection: import("./forecast").EcommerceMonth[],
  a: import("../ecommerce").EcommerceModel,
) {
  let prior: number | null = null;
  return projection.map((month) => {
    const metrics = ecommerceMetrics(month, a);
    const salesChange = prior === null ? null : metrics.netRevenue - prior;
    const salesGrowth =
      prior === null || prior === 0
        ? null
        : (metrics.netRevenue - prior) / prior;
    prior = metrics.netRevenue;
    return {
      ...month,
      ...metrics,
      salesChange,
      salesGrowth,
      refundMovement: -metrics.refunds,
      feeMovement: -metrics.fees,
    };
  });
}
