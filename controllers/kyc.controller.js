'use strict';

const db      = require('../models');
const notify  = require('../utils/email/notifications');
const { cloudinary } = require('../utils/cloudinary');
const multer  = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder:        'showbiz/kyc/' + req.user.id,
    public_id:     file.fieldname + '_' + Date.now(),
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
  }),
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).fields([
  { name: 'nin_doc',          maxCount: 1 },
  { name: 'gov_id',           maxCount: 1 },
  { name: 'proof_of_address', maxCount: 1 },
  { name: 'selfie',           maxCount: 1 },
  { name: 'cac_doc',          maxCount: 1 },
]);

const getMyKYC = async (req, res) => {
  try {
    const kyc = await db.KYCVerification.findOne({ where: { user_id: req.user.id } });
    return res.json({ status: 'success', data: kyc || null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch KYC.' });
  }
};

const submitKYC = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ status: 'error', message: err.message });
    try {
      const user  = req.user;
      const body  = req.body;
      const files = req.files || {};
      const getFile = (field) => files[field]?.[0];

      let kyc = await db.KYCVerification.findOne({ where: { user_id: user.id } });
      if (kyc && kyc.status === 'approved') {
        return res.status(400).json({ status: 'error', message: 'KYC already approved.' });
      }

      const data = {
        user_id: user.id,
        role: body.role || 'model',
        full_legal_name: body.full_legal_name,
        date_of_birth:   body.date_of_birth,
        phone_number:    body.phone_number,
        address:         body.address,
        state:           body.state,
        nin_number:      body.nin_number,
        gov_id_type:     body.gov_id_type,
        business_name:   body.business_name,
        cac_number:      body.cac_number,
        status:          'pending',
        submitted_at:    new Date(),
      };

      if (getFile('nin_doc'))          { data.nin_doc_url = getFile('nin_doc').path; data.nin_doc_public_id = getFile('nin_doc').filename; }
      if (getFile('gov_id'))           { data.gov_id_url = getFile('gov_id').path; data.gov_id_public_id = getFile('gov_id').filename; }
      if (getFile('proof_of_address')) { data.proof_of_address_url = getFile('proof_of_address').path; data.proof_of_address_public_id = getFile('proof_of_address').filename; }
      if (getFile('selfie'))           { data.selfie_url = getFile('selfie').path; data.selfie_public_id = getFile('selfie').filename; }
      if (getFile('cac_doc'))          { data.cac_doc_url = getFile('cac_doc').path; data.cac_doc_public_id = getFile('cac_doc').filename; }

      if (kyc) { await kyc.update(data); } else { kyc = await db.KYCVerification.create(data); }

      console.log('[KYC] Submitted by', user.email);
      notify.onKYCSubmitted(user).catch(console.error);
    notify.onNewKYCSubmission(user).catch(console.error);
      return res.json({ status: 'success', message: 'KYC submitted! Our team will review within 24-48 hours.', data: kyc });
    } catch (err) {
      console.error('[submitKYC]', err.message);
      return res.status(500).json({ status: 'error', message: 'KYC submission failed.' });
    }
  });
};

const adminListKYC = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.status = status;
    const { count, rows } = await db.KYCVerification.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: { submissions: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch KYC list.' });
  }
};

const adminGetKYC = async (req, res) => {
  try {
    const kyc = await db.KYCVerification.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
    });
    if (!kyc) return res.status(404).json({ status: 'error', message: 'KYC not found.' });
    return res.json({ status: 'success', data: kyc });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch KYC.' });
  }
};

const adminApproveKYC = async (req, res) => {
  try {
    const kyc = await db.KYCVerification.findByPk(req.params.id);
    if (!kyc) return res.status(404).json({ status: 'error', message: 'KYC not found.' });
    await kyc.update({ status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date(), admin_notes: req.body.notes || null });
    await db.User.update({ kyc_verified: true }, { where: { id: kyc.user_id } });
    const approvedUser = await db.User.findByPk(kyc.user_id);
    if (approvedUser) notify.onKYCApproved(approvedUser).catch(console.error);
    console.log('[KYC] Approved for user', kyc.user_id);
    appNotify.onKYCReviewed(kyc.user_id, true).catch(console.error);
    return res.json({ status: 'success', message: 'KYC approved.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to approve KYC.' });
  }
};

const adminRejectKYC = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ status: 'error', message: 'Rejection reason required.' });
    const kyc = await db.KYCVerification.findByPk(req.params.id);
    if (!kyc) return res.status(404).json({ status: 'error', message: 'KYC not found.' });
    await kyc.update({ status: 'rejected', rejection_reason: reason, reviewed_by: req.user.id, reviewed_at: new Date() });
    await db.User.update({ kyc_verified: false }, { where: { id: kyc.user_id } });
    const rejectedUser = await db.User.findByPk(kyc.user_id);
    if (rejectedUser) notify.onKYCRejected(rejectedUser, reason).catch(console.error);
    appNotify.onKYCReviewed(kyc.user_id, false).catch(console.error);
    return res.json({ status: 'success', message: 'KYC rejected.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to reject KYC.' });
  }
};

// ── POST /api/admin/kyc/:id/revoke — revoke approved KYC ─────────────────────
const revokeKYC = async (req, res) => {
  try {
    const kyc = await db.KYCVerification.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user' }]
    });
    if (!kyc) return res.status(404).json({ status: 'error', message: 'KYC not found.' });

    const { reason } = req.body;
    await kyc.update({ status: 'revoked', rejection_reason: reason || 'KYC revoked by admin.' });
    await db.User.update({ kyc_verified: false }, { where: { id: kyc.user_id } });

    // Notify user
    try {
      const notify = require('../utils/email/notifications');
      await notify.onKYCRejected(kyc.user, reason || 'Your KYC has been revoked. Please resubmit.');
    } catch {}

    return res.json({ status: 'success', message: 'KYC revoked.' });
  } catch (err) {
    console.error('[revokeKYC]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to revoke KYC.' });
  }
};

// ── POST /api/admin/kyc/:id/request-resubmission — ask user to resubmit ───────
const requestResubmission = async (req, res) => {
  try {
    const kyc = await db.KYCVerification.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user' }]
    });
    if (!kyc) return res.status(404).json({ status: 'error', message: 'KYC not found.' });

    const { reason, documents } = req.body;
    const note = reason || 'Please resubmit your KYC documents.';
    const docNote = documents ? ` Documents required: ${documents}` : '';

    await kyc.update({ status: 'resubmission_required', rejection_reason: note + docNote });
    await db.User.update({ kyc_verified: false }, { where: { id: kyc.user_id } });

    // Notify user
    try {
      const notify = require('../utils/email/notifications');
      await notify.onKYCRejected(kyc.user, note + docNote);
    } catch {}

    return res.json({ status: 'success', message: 'Resubmission request sent to user.' });
  } catch (err) {
    console.error('[requestResubmission]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

module.exports = { getMyKYC, submitKYC, adminListKYC, adminGetKYC, adminApproveKYC, adminRejectKYC };
