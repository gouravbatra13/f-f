export interface ErrorRateComparison {
  beforeRatePerMinute: number;
  afterRatePerMinute: number | null;
  countChange: number;
  percentageChange: number | null;
  possibleRegression: boolean;
}

export function compareErrorRates(
  beforeCount: number,
  afterCount: number,
  beforeDurationMinutes: number,
  afterDurationMinutes: number,
): ErrorRateComparison {
  const beforeRate =
    beforeDurationMinutes > 0 ? beforeCount / beforeDurationMinutes : 0;
  const afterRate =
    afterDurationMinutes > 0 ? afterCount / afterDurationMinutes : null;
  const percentageChange =
    afterRate === null
      ? null
      : beforeRate === 0
        ? afterRate === 0
          ? 0
          : null
        : Number((((afterRate - beforeRate) / beforeRate) * 100).toFixed(1));

  return {
    beforeRatePerMinute: Number(beforeRate.toFixed(4)),
    afterRatePerMinute:
      afterRate === null ? null : Number(afterRate.toFixed(4)),
    countChange: afterCount - beforeCount,
    percentageChange,
    possibleRegression: afterRate !== null && afterRate > beforeRate,
  };
}
