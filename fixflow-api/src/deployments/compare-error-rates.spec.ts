import { describe, expect, it } from 'vitest';
import { compareErrorRates } from './compare-error-rates.js';

describe('compareErrorRates', () => {
  it('compares rates rather than raw totals for partial windows', () => {
    expect(compareErrorRates(60, 30, 60, 30)).toMatchObject({
      beforeRatePerMinute: 1,
      afterRatePerMinute: 1,
      countChange: -30,
      percentageChange: 0,
      possibleRegression: false,
    });
  });

  it('reports an increase as a possible correlation and handles zero baseline', () => {
    expect(compareErrorRates(2, 4, 60, 60)).toMatchObject({
      countChange: 2,
      percentageChange: 100,
      possibleRegression: true,
    });
    expect(compareErrorRates(0, 1, 60, 60)).toMatchObject({
      percentageChange: null,
      possibleRegression: true,
    });
  });

  it('does not claim a percentage before any post-deployment observations exist', () => {
    expect(compareErrorRates(2, 0, 60, 0)).toMatchObject({
      afterRatePerMinute: null,
      percentageChange: null,
      possibleRegression: false,
    });
  });
});
