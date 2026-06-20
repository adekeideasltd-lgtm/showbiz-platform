'use strict';
const {
  hoursUntilEvent,
  getCancellationTier,
  calculateRefundAmount,
  calculateKillFee,
  calculateCancellationCollection,
  calculateLateCancellationPenalty,
  isLateCancellation,
  round2,
} = require('../utils/cancellationCalc');

describe('hoursUntilEvent', () => {
  test('returns positive hours for a future event', () => {
    const now = new Date('2026-06-20T00:00:00Z');
    const event = new Date('2026-06-22T00:00:00Z'); // 48 hours later
    expect(hoursUntilEvent(event, now)).toBeCloseTo(48, 5);
  });

  test('returns negative hours for a past event', () => {
    const now = new Date('2026-06-20T00:00:00Z');
    const event = new Date('2026-06-19T00:00:00Z'); // 24 hours earlier
    expect(hoursUntilEvent(event, now)).toBeCloseTo(-24, 5);
  });

  test('returns zero for an event happening right now', () => {
    const now = new Date('2026-06-20T12:00:00Z');
    expect(hoursUntilEvent(now, now)).toBe(0);
  });
});

describe('getCancellationTier', () => {
  test('returns "full" tier with 90% refund at exactly 48 hours', () => {
    expect(getCancellationTier(48)).toEqual({ tier: 'full', refundPercent: 0.90 });
  });

  test('returns "full" tier for well beyond 48 hours', () => {
    expect(getCancellationTier(200)).toEqual({ tier: 'full', refundPercent: 0.90 });
  });

  test('returns "partial" tier with 50% refund at exactly 24 hours', () => {
    expect(getCancellationTier(24)).toEqual({ tier: 'partial', refundPercent: 0.50 });
  });

  test('returns "partial" tier just under 48 hours', () => {
    expect(getCancellationTier(47.99)).toEqual({ tier: 'partial', refundPercent: 0.50 });
  });

  test('returns "none" tier just under 24 hours', () => {
    expect(getCancellationTier(23.99)).toEqual({ tier: 'none', refundPercent: 0 });
  });

  test('returns "none" tier for an event that has already passed (negative hours)', () => {
    expect(getCancellationTier(-5)).toEqual({ tier: 'none', refundPercent: 0 });
  });

  test('returns "none" tier at exactly zero hours', () => {
    expect(getCancellationTier(0)).toEqual({ tier: 'none', refundPercent: 0 });
  });
});

describe('calculateRefundAmount', () => {
  test('calculates 90% refund correctly for full tier', () => {
    expect(calculateRefundAmount(100000, 0.90, true)).toBe(90000);
  });

  test('calculates 50% refund correctly for partial tier', () => {
    expect(calculateRefundAmount(100000, 0.50, true)).toBe(50000);
  });

  test('calculates 0 refund for none tier', () => {
    expect(calculateRefundAmount(100000, 0, true)).toBe(0);
  });

  test('returns 0 if booking was never paid, regardless of tier', () => {
    expect(calculateRefundAmount(100000, 0.90, false)).toBe(0);
  });

  test('rounds to 2 decimal places', () => {
    expect(calculateRefundAmount(33333.33, 0.90, true)).toBe(29999.997 === 29999.997 ? round2(33333.33 * 0.90) : null);
    expect(calculateRefundAmount(10000.555, 0.5, true)).toBe(round2(10000.555 * 0.5));
  });
});

describe('calculateKillFee', () => {
  test('calculates 10% commission and 90% kill fee correctly', () => {
    const result = calculateKillFee(100000, 10);
    expect(result.commission).toBe(10000);
    expect(result.killFee).toBe(90000);
  });

  test('handles 20% commission rate', () => {
    const result = calculateKillFee(50000, 20);
    expect(result.commission).toBe(10000);
    expect(result.killFee).toBe(40000);
  });

  test('handles 0% commission rate (entertainer gets everything)', () => {
    const result = calculateKillFee(75000, 0);
    expect(result.commission).toBe(0);
    expect(result.killFee).toBe(75000);
  });

  test('commission + killFee always sums to totalAmount', () => {
    const result = calculateKillFee(123456.78, 15);
    expect(round2(result.commission + result.killFee)).toBe(round2(123456.78));
  });
});

describe('calculateCancellationCollection', () => {
  test('calculates platform collection for partial tier correctly', () => {
    // total 100000, owner refunded 50000 (50%), 10% commission (10000)
    // collection = 100000 - 50000 - 10000 = 40000
    expect(calculateCancellationCollection(100000, 50000, 10)).toBe(40000);
  });

  test('returns 0 when refund + commission exactly equals total', () => {
    expect(calculateCancellationCollection(100000, 90000, 10)).toBe(0);
  });

  test('can return negative if refund + commission exceeds total (edge case)', () => {
    expect(calculateCancellationCollection(100000, 95000, 10)).toBe(-5000);
  });
});

describe('calculateLateCancellationPenalty', () => {
  test('calculates 20% flat penalty correctly', () => {
    expect(calculateLateCancellationPenalty(100000)).toBe(20000);
  });

  test('handles small amounts correctly', () => {
    expect(calculateLateCancellationPenalty(1000)).toBe(200);
  });

  test('handles zero amount', () => {
    expect(calculateLateCancellationPenalty(0)).toBe(0);
  });
});

describe('isLateCancellation', () => {
  test('returns true when less than 24 hours remain', () => {
    expect(isLateCancellation(23.99)).toBe(true);
  });

  test('returns false at exactly 24 hours', () => {
    expect(isLateCancellation(24)).toBe(false);
  });

  test('returns true for negative hours (event already passed)', () => {
    expect(isLateCancellation(-10)).toBe(true);
  });

  test('returns false for well beyond 24 hours', () => {
    expect(isLateCancellation(100)).toBe(false);
  });
});

describe('round2', () => {
  test('rounds to 2 decimal places', () => {
    expect(round2(10.005)).toBeCloseTo(10.01, 1);
    expect(round2(10.004)).toBe(10);
    expect(round2(10.999)).toBe(11);
  });
});

describe('Integration: full cancellation tier scenarios', () => {
  test('48+ hours: owner gets 90%, no kill fee, standard 10% commission', () => {
    const totalAmount = 100000;
    const hours = 50;
    const { tier, refundPercent } = getCancellationTier(hours);
    const refund = calculateRefundAmount(totalAmount, refundPercent, true);

    expect(tier).toBe('full');
    expect(refund).toBe(90000);
    // Platform keeps the remaining 10000 (10% commission), no kill fee owed
  });

  test('24-48 hours: owner gets 50%, platform collects remainder minus commission', () => {
    const totalAmount = 100000;
    const hours = 30;
    const { tier, refundPercent } = getCancellationTier(hours);
    const refund = calculateRefundAmount(totalAmount, refundPercent, true);
    const collection = calculateCancellationCollection(totalAmount, refund, 10);

    expect(tier).toBe('partial');
    expect(refund).toBe(50000);
    expect(collection).toBe(40000); // 100000 - 50000 - 10000
  });

  test('under 24 hours: owner gets nothing, entertainer gets kill fee (total minus commission)', () => {
    const totalAmount = 100000;
    const hours = 10;
    const { tier, refundPercent } = getCancellationTier(hours);
    const refund = calculateRefundAmount(totalAmount, refundPercent, true);
    const { killFee } = calculateKillFee(totalAmount, 10);

    expect(tier).toBe('none');
    expect(refund).toBe(0);
    expect(killFee).toBe(90000);
  });

  test('entertainer late cancellation: owner always gets 100% refund + entertainer penalized 20%', () => {
    const totalAmount = 100000;
    const hours = 5;
    const late = isLateCancellation(hours);
    const penalty = late ? calculateLateCancellationPenalty(totalAmount) : 0;

    expect(late).toBe(true);
    expect(penalty).toBe(20000);
    // Owner refund is always full amount in this scenario (handled separately in controller)
  });

  test('entertainer on-time cancellation: owner gets 100% refund, no penalty', () => {
    const totalAmount = 100000;
    const hours = 30;
    const late = isLateCancellation(hours);
    const penalty = late ? calculateLateCancellationPenalty(totalAmount) : 0;

    expect(late).toBe(false);
    expect(penalty).toBe(0);
  });
});
