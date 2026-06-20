'use strict';
/**
 * cancellationCalc.js
 * Pure calculation functions for the booking cancellation policy engine.
 * No database or framework dependencies — fully unit-testable.
 */

/**
 * Calculates hours remaining between now and a given event date.
 * @param {Date|string} eventDate
 * @param {Date} [now] - injectable for testing
 * @returns {number} hours (can be negative if event already passed)
 */
function hoursUntilEvent(eventDate, now = new Date()) {
  const event = new Date(eventDate);
  return (event - now) / (1000 * 60 * 60);
}

/**
 * Determines the owner-initiated cancellation tier and refund percentage
 * based on hours remaining until the event.
 * @param {number} hours
 * @returns {{ tier: 'full'|'partial'|'none', refundPercent: number }}
 */
function getCancellationTier(hours) {
  if (hours >= 48) return { tier: 'full', refundPercent: 0.90 };
  if (hours >= 24) return { tier: 'partial', refundPercent: 0.50 };
  return { tier: 'none', refundPercent: 0 };
}

/**
 * Calculates the owner refund amount for a given total and tier.
 * Returns 0 if the booking was never paid (pre-payment cancellations are immediate, no refund needed).
 * @param {number} totalAmount
 * @param {number} refundPercent
 * @param {boolean} isPaid
 * @returns {number} refund amount, rounded to 2 decimals
 */
function calculateRefundAmount(totalAmount, refundPercent, isPaid) {
  if (!isPaid) return 0;
  return round2(totalAmount * refundPercent);
}

/**
 * Calculates the standard commission and resulting kill fee for the
 * "none" tier (entertainer is paid out everything minus standard commission).
 * @param {number} totalAmount
 * @param {number} commissionRatePercent - e.g. 10 for 10%
 * @returns {{ commission: number, killFee: number }}
 */
function calculateKillFee(totalAmount, commissionRatePercent) {
  const commission = round2(totalAmount * commissionRatePercent / 100);
  const killFee = round2(totalAmount - commission);
  return { commission, killFee };
}

/**
 * Calculates the platform's cancellation-collection amount for the
 * "partial" tier: whatever remains after the owner refund and standard
 * commission have been accounted for.
 * @param {number} totalAmount
 * @param {number} refundAmount
 * @param {number} commissionRatePercent
 * @returns {number} collection amount, rounded to 2 decimals (can be 0 or negative-clamped by caller)
 */
function calculateCancellationCollection(totalAmount, refundAmount, commissionRatePercent) {
  const commission = round2(totalAmount * commissionRatePercent / 100);
  return round2(totalAmount - refundAmount - commission);
}

/**
 * Calculates the entertainer-initiated late-cancellation penalty (20% flat).
 * @param {number} totalAmount
 * @returns {number} penalty amount, rounded to 2 decimals
 */
function calculateLateCancellationPenalty(totalAmount) {
  return round2(totalAmount * 0.20);
}

/**
 * Determines whether an entertainer cancellation counts as "late"
 * (within 24 hours of the event).
 * @param {number} hours
 * @returns {boolean}
 */
function isLateCancellation(hours) {
  return hours < 24;
}

function round2(n) {
  return parseFloat(n.toFixed(2));
}

module.exports = {
  hoursUntilEvent,
  getCancellationTier,
  calculateRefundAmount,
  calculateKillFee,
  calculateCancellationCollection,
  calculateLateCancellationPenalty,
  isLateCancellation,
  round2,
};
