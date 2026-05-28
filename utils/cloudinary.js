'use strict';

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Model profile photos storage ──────────────────────────────────────────────
const modelPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:         'showbiz/models/' + req.user.id,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1200, height: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
    ],
    public_id: 'photo_' + Date.now(),
  }),
});

// ── File filter ───────────────────────────────────────────────────────────────
const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG and WebP images are allowed.'), false);
  }
};

// ── Multer upload instances ───────────────────────────────────────────────────
const uploadModelPhoto = multer({
  storage: modelPhotoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
}).single('photo');

// ── Delete from Cloudinary ────────────────────────────────────────────────────
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (err) {
    console.error('[Cloudinary] Delete failed:', err.message);
    return null;
  }
};

// ── Generate optimized URL ────────────────────────────────────────────────────
const getOptimizedUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    fetch_format: 'auto',
    quality:      'auto',
    ...options,
  });
};

module.exports = { cloudinary, uploadModelPhoto, deleteFromCloudinary, getOptimizedUrl };
