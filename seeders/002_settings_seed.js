'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('settings', [
      {
        id: uuidv4(), key: 'commission_rate', value: '10',
        label: 'Commission Rate (%)', type: 'number',
        description: 'Platform commission percentage deducted from each booking payment',
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: uuidv4(), key: 'min_booking_amount', value: '5000',
        label: 'Minimum Booking Amount (₦)', type: 'number',
        description: 'Minimum amount required to create a booking',
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: uuidv4(), key: 'max_booking_amount', value: '10000000',
        label: 'Maximum Booking Amount (₦)', type: 'number',
        description: 'Maximum amount allowed per booking',
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: uuidv4(), key: 'payout_hold_days', value: '3',
        label: 'Payout Hold Days', type: 'number',
        description: 'Number of days to hold payout after event completion',
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: uuidv4(), key: 'platform_name', value: 'Showbiz Platform',
        label: 'Platform Name', type: 'string',
        description: 'Name of the platform shown in emails and notifications',
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: uuidv4(), key: 'support_email', value: 'adekeideasltd@gmail.com',
        label: 'Support Email', type: 'string',
        description: 'Email address for user support inquiries',
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: uuidv4(), key: 'kyc_required_booking', value: 'true',
        label: 'KYC Required for Booking', type: 'boolean',
        description: 'Whether KYC verification is required before making bookings',
        created_at: new Date(), updated_at: new Date(),
      },
      {
        id: uuidv4(), key: 'maintenance_mode', value: 'false',
        label: 'Maintenance Mode', type: 'boolean',
        description: 'Put platform in maintenance mode (blocks all non-admin access)',
        created_at: new Date(), updated_at: new Date(),
      },
    ], {});
    console.log('Default settings seeded');
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('settings', null, {});
  },
};
