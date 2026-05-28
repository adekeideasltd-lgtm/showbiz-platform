'use strict';

const rateLimit = require('express-rate-limit');

const handler = (req, res) => res.status(429).json({
  status: 'error',
  message: 'Too many requests. Please wait and try again.',
});

const userKey = (req) => req.user?.id || req.ip;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true, handler,
  validate: false,
});

const strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  handler, validate: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  handler, validate: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  handler, keyGenerator: userKey, validate: false,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  handler, keyGenerator: userKey, validate: false,
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  handler, keyGenerator: userKey, validate: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  handler, validate: false,
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  handler, keyGenerator: userKey, validate: false,
});

module.exports = {
  authLimiter, strictAuthLimiter, apiLimiter,
  uploadLimiter, paymentLimiter, messageLimiter,
  registerLimiter, bookingLimiter,
};
