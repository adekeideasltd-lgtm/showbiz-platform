'use strict';
const axios = require('axios');

/**
 * Verifies a Google reCAPTCHA v2 token sent from the frontend.
 * Expects req.body.captchaToken to contain the token.
 */
const verifyCaptcha = async (req, res, next) => {
  try {
    const token = req.body.captchaToken;
    if (!token) {
      return res.status(400).json({ status: 'error', code: 'CAPTCHA_MISSING', message: 'Please complete the CAPTCHA verification.' });
    }

    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
      // Fail open in case the key isn't configured, but log loudly
      console.error('[captcha] RECAPTCHA_SECRET_KEY not set — skipping verification');
      return next();
    }

    const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
      params: { secret, response: token },
      timeout: 8000,
    });

    if (!response.data.success) {
      return res.status(400).json({ status: 'error', code: 'CAPTCHA_FAILED', message: 'CAPTCHA verification failed. Please try again.' });
    }

    next();
  } catch (err) {
    console.error('[captcha] verification error:', err.message);
    return res.status(400).json({ status: 'error', code: 'CAPTCHA_ERROR', message: 'CAPTCHA verification could not be completed. Please try again.' });
  }
};

module.exports = { verifyCaptcha };
