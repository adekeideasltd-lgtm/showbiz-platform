'use strict';

const { v4: uuidv4 }         = require('uuid');
const db                     = require('../models');
const { uploadModelPhoto, deleteFromCloudinary } = require('../utils/cloudinary');

// ── POST /api/models/me/photos/upload ─────────────────────────────────────────
const uploadPhoto = (req, res) => {
  uploadModelPhoto(req, res, async (err) => {
    if (err) {
      console.error('[uploadPhoto] Multer/Cloudinary error:', err.message);
      return res.status(400).json({ status: 'error', message: err.message || 'Upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
    }

    try {
      const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
      if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

      const { caption, is_primary } = req.body;
      const isPrimary = is_primary === 'true' || is_primary === true;

      // If setting as primary, unset all others
      if (isPrimary) {
        await db.ModelPhoto.update({ is_primary: false }, { where: { model_id: profile.id } });
      }

      // If this is the first photo, make it primary automatically
      const photoCount = await db.ModelPhoto.count({ where: { model_id: profile.id } });
      const autoMakePrimary = photoCount === 0;

      const photo = await db.ModelPhoto.create({
        id:          uuidv4(),
        model_id:    profile.id,
        url:         req.file.path,
        public_id:   req.file.filename,
        caption:     caption || null,
        is_primary:  isPrimary || autoMakePrimary,
        is_approved: false,
      });

      console.log('[Upload] Photo saved:', req.file.filename, 'for model:', req.user.id);

      return res.status(201).json({
        status:  'success',
        message: 'Photo uploaded successfully. Awaiting admin approval.',
        data:    photo,
      });
    } catch (dbErr) {
      console.error('[uploadPhoto] DB error:', dbErr.message);
      // Try to clean up the uploaded file
      if (req.file?.filename) {
        deleteFromCloudinary(req.file.filename).catch(console.error);
      }
      return res.status(500).json({ status: 'error', message: 'Failed to save photo.' });
    }
  });
};

// ── DELETE /api/models/me/photos/:photoId ─────────────────────────────────────
const deletePhoto = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const photo = await db.ModelPhoto.findOne({
      where: { id: req.params.photoId, model_id: profile.id },
    });
    if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found.' });

    // Delete from Cloudinary if we have the public_id
    if (photo.public_id) {
      await deleteFromCloudinary(photo.public_id);
    }

    const wasPrimary = photo.is_primary;
    await photo.destroy();

    // If deleted photo was primary, make the next photo primary
    if (wasPrimary) {
      const nextPhoto = await db.ModelPhoto.findOne({
        where: { model_id: profile.id },
        order: [['created_at', 'ASC']],
      });
      if (nextPhoto) await nextPhoto.update({ is_primary: true });
    }

    return res.json({ status: 'success', message: 'Photo deleted.' });
  } catch (err) {
    console.error('[deletePhoto]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to delete photo.' });
  }
};

// ── PUT /api/models/me/photos/:photoId/primary ────────────────────────────────
const setPrimaryPhoto = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const photo = await db.ModelPhoto.findOne({
      where: { id: req.params.photoId, model_id: profile.id },
    });
    if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found.' });

    // Unset all primary flags
    await db.ModelPhoto.update({ is_primary: false }, { where: { model_id: profile.id } });
    await photo.update({ is_primary: true });

    return res.json({ status: 'success', message: 'Primary photo updated.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update primary photo.' });
  }
};

// ── GET /api/models/me/photos ─────────────────────────────────────────────────
const getMyPhotos = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const photos = await db.ModelPhoto.findAll({
      where:  { model_id: profile.id },
      order:  [['is_primary', 'DESC'], ['created_at', 'ASC']],
    });

    return res.json({ status: 'success', data: photos });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch photos.' });
  }
};

// ── ADMIN: POST /api/admin/photos/:photoId/approve ────────────────────────────
const adminApprovePhoto = async (req, res) => {
  try {
    const photo = await db.ModelPhoto.findByPk(req.params.photoId);
    if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found.' });
    await photo.update({ is_approved: true });
    return res.json({ status: 'success', message: 'Photo approved.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to approve photo.' });
  }
};

// ── ADMIN: DELETE /api/admin/photos/:photoId ──────────────────────────────────
const adminDeletePhoto = async (req, res) => {
  try {
    const photo = await db.ModelPhoto.findByPk(req.params.photoId);
    if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found.' });
    if (photo.public_id) await deleteFromCloudinary(photo.public_id);
    await photo.destroy();
    return res.json({ status: 'success', message: 'Photo deleted by admin.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to delete photo.' });
  }
};

module.exports = { uploadPhoto, deletePhoto, setPrimaryPhoto, getMyPhotos, adminApprovePhoto, adminDeletePhoto };
