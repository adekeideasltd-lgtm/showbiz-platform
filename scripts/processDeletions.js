/**
 * processDeletions.js
 * Run daily via cron to anonymize accounts scheduled for deletion.
 * Cron: 0 2 * * * * (2am daily)
 */

require('dotenv').config();
const db = require('../models');
const { Op } = require('sequelize');

const processDeletions = async () => {
  try {
    await db.sequelize.authenticate();
    console.log('[processDeletions] DB connected');

    const now = new Date();
    const due = await db.User.findAll({
      where: {
        account_status: 'pending_deletion',
        deletion_scheduled_at: { [Op.lte]: now },
        deleted_at: null,
      },
    });

    console.log(`[processDeletions] Found ${due.length} account(s) due for deletion`);

    for (const user of due) {
      const anonEmail = `deleted_${user.id}@twerkie.deleted`;

      await user.update({
        first_name:     'Deleted',
        last_name:      'User',
        email:          anonEmail,
        phone:          null,
        password_hash:  'DELETED',
        account_status: 'deleted',
        deleted_at:     now,
        is_suspended:   true,
      });

      // Hide entertainer profile if exists
      const profile = await db.ModelProfile.findOne({ where: { user_id: user.id } });
      if (profile) {
        await profile.update({ status: 'rejected', bio: null, specialties: [], intro_video_url: null });
      }

      console.log(`[processDeletions] Anonymized user: ${user.id} (was: ${user.email})`);
    }

    console.log(`[processDeletions] Done. ${due.length} account(s) processed.`);
    process.exit(0);
  } catch (err) {
    console.error('[processDeletions] ERROR:', err.message);
    process.exit(1);
  }
};

processDeletions();
