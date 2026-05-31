'use strict';

const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host:    process.env.DB_HOST,
    port:    process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
  }
);

const Role = sequelize.define('Role', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:         { type: DataTypes.STRING(100), allowNull: false, unique: true },
  display_name: { type: DataTypes.STRING(150), allowNull: false },
  description:  { type: DataTypes.TEXT },
  guard_name:   { type: DataTypes.STRING(50), defaultValue: 'api' },
  is_system:    { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active:    { type: DataTypes.BOOLEAN, defaultValue: true },
  created_by:   { type: DataTypes.UUID },
}, { tableName: 'roles', underscored: true });

const Permission = sequelize.define('Permission', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:         { type: DataTypes.STRING(150), allowNull: false, unique: true },
  display_name: { type: DataTypes.STRING(200), allowNull: false },
  module:       { type: DataTypes.STRING(100), allowNull: false },
  action:       { type: DataTypes.ENUM('view','create','edit','delete','approve','export','manage'), allowNull: false },
  description:  { type: DataTypes.TEXT },
  guard_name:   { type: DataTypes.STRING(50), defaultValue: 'api' },
}, { tableName: 'permissions', underscored: true });

const User = sequelize.define('User', {
  id:                   { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email:                { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password_hash:        { type: DataTypes.STRING(255), allowNull: false },
  first_name:           { type: DataTypes.STRING(100), allowNull: false },
  last_name:            { type: DataTypes.STRING(100), allowNull: false },
  is_active:            { type: DataTypes.BOOLEAN, defaultValue: true },
  is_suspended:         { type: DataTypes.BOOLEAN, defaultValue: false },
  suspended_reason:     { type: DataTypes.TEXT },
  suspended_by:         { type: DataTypes.UUID },
  two_fa_enabled:       { type: DataTypes.BOOLEAN, defaultValue: false },
  two_fa_secret:        { type: DataTypes.STRING(255) },
  last_login_at:        { type: DataTypes.DATE },
  last_login_ip:        { type: DataTypes.STRING(45) },
  force_password_reset: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'users', underscored: true });

const UserRole = sequelize.define('UserRole', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:     { type: DataTypes.UUID, allowNull: false },
  role_id:     { type: DataTypes.UUID, allowNull: false },
  assigned_by: { type: DataTypes.UUID },
  expires_at:  { type: DataTypes.DATE },
}, { tableName: 'user_roles', underscored: true, updatedAt: false });

const AuditLog = sequelize.define('AuditLog', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  actor_id:    { type: DataTypes.UUID, allowNull: false },
  actor_role:  { type: DataTypes.STRING(100), allowNull: false },
  action:      { type: DataTypes.STRING(100), allowNull: false },
  entity_type: { type: DataTypes.STRING(100), allowNull: false },
  entity_id:   { type: DataTypes.UUID },
  old_value:   { type: DataTypes.JSONB },
  new_value:   { type: DataTypes.JSONB },
  ip_address:  { type: DataTypes.STRING(45) },
  user_agent:  { type: DataTypes.TEXT },
}, { tableName: 'audit_logs', underscored: true, updatedAt: false });

const RoleAssignmentHistory = sequelize.define('RoleAssignmentHistory', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:      { type: DataTypes.UUID, allowNull: false },
  role_id:      { type: DataTypes.UUID, allowNull: false },
  action:       { type: DataTypes.ENUM('assigned','revoked'), allowNull: false },
  performed_by: { type: DataTypes.UUID, allowNull: false },
  reason:       { type: DataTypes.TEXT },
}, { tableName: 'role_assignment_history', underscored: true, updatedAt: false });

// Associations
Role.belongsToMany(Permission, { through: 'role_permissions', as: 'permissions', foreignKey: 'role_id',    otherKey: 'permission_id' });
Permission.belongsToMany(Role, { through: 'role_permissions', as: 'roles',       foreignKey: 'permission_id', otherKey: 'role_id' });
User.belongsToMany(Role,       { through: UserRole,           as: 'roles',       foreignKey: 'user_id',    otherKey: 'role_id' });
Role.belongsToMany(User,       { through: UserRole,           as: 'users',       foreignKey: 'role_id',    otherKey: 'user_id' });


const ModelProfile = sequelize.define('ModelProfile', {
  id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:         { type: DataTypes.UUID, allowNull: false },
  status:          { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
  bio:             { type: DataTypes.TEXT },
  phone:           { type: DataTypes.STRING(20) },
  country:         { type: DataTypes.STRING(100) },
  state:           { type: DataTypes.STRING(100) },
  city:            { type: DataTypes.STRING(100) },
  height_cm:       { type: DataTypes.INTEGER },
  weight_kg:       { type: DataTypes.DECIMAL(5,2) },
  skin_tone:       { type: DataTypes.STRING(50) },
  gender:          { type: DataTypes.ENUM('male','female','non_binary','prefer_not_to_say') },
  experience:      { type: DataTypes.ENUM('beginner','intermediate','professional') },
  languages:       { type: DataTypes.ARRAY(DataTypes.STRING) },
  specialties:     { type: DataTypes.ARRAY(DataTypes.STRING) },
  hobbies:         { type: DataTypes.TEXT },
  hourly_rate:     { type: DataTypes.DECIMAL(10,2) },
  daily_rate:      { type: DataTypes.DECIMAL(10,2) },
  is_featured:     { type: DataTypes.BOOLEAN, defaultValue: false },
  approved_by:     { type: DataTypes.UUID },
  approved_at:     { type: DataTypes.DATE },
  rejected_reason:         { type: DataTypes.TEXT },
  intro_video_url:         { type: DataTypes.STRING(500) },
  intro_video_public_id:   { type: DataTypes.STRING(300) },
  intro_video_status:      { type: DataTypes.STRING(20) },
  intro_video_approved_at: { type: DataTypes.DATE },
  intro_video_approved_by: { type: DataTypes.UUID },
}, { tableName: 'model_profiles', underscored: true });

const ShowbizProfile = sequelize.define('ShowbizProfile', {
  id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:       { type: DataTypes.UUID, allowNull: false },
  company_name:  { type: DataTypes.STRING(200) },
  business_type: { type: DataTypes.STRING(100) },
  phone:         { type: DataTypes.STRING(20) },
  country:       { type: DataTypes.STRING(100) },
  state:         { type: DataTypes.STRING(100) },
  city:          { type: DataTypes.STRING(100) },
  website:       { type: DataTypes.STRING(255) },
  bio:           { type: DataTypes.TEXT },
}, { tableName: 'showbiz_profiles', underscored: true });

User.hasOne(ModelProfile,   { foreignKey: 'user_id', as: 'modelProfile' });
User.hasOne(ShowbizProfile, { foreignKey: 'user_id', as: 'showbizProfile' });
ModelProfile.belongsTo(User,   { foreignKey: 'user_id', as: 'user' });
ShowbizProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });


const ModelPhoto = sequelize.define('ModelPhoto', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  model_id:    { type: DataTypes.UUID, allowNull: false },
  url:         { type: DataTypes.STRING(500), allowNull: false },
  public_id:   { type: DataTypes.STRING(255) },
  is_primary:  { type: DataTypes.BOOLEAN, defaultValue: false },
  is_approved: { type: DataTypes.BOOLEAN, defaultValue: false },
  caption:     { type: DataTypes.STRING(255) },
}, { tableName: 'model_photos', underscored: true });

const ModelAvailability = sequelize.define('ModelAvailability', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  model_id:     { type: DataTypes.UUID, allowNull: false },
  date:         { type: DataTypes.DATEONLY, allowNull: false },
  is_available: { type: DataTypes.BOOLEAN, defaultValue: true },
  note:         { type: DataTypes.STRING(255) },
}, { tableName: 'model_availability', underscored: true });

ModelProfile.hasMany(ModelPhoto,        { foreignKey: 'model_id', as: 'photos' });
ModelProfile.hasMany(ModelAvailability, { foreignKey: 'model_id', as: 'availability' });
ModelPhoto.belongsTo(ModelProfile,        { foreignKey: 'model_id', as: 'model' });
ModelAvailability.belongsTo(ModelProfile, { foreignKey: 'model_id', as: 'model' });


const Booking = sequelize.define('Booking', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  owner_id:       { type: DataTypes.UUID, allowNull: false },
  model_id:       { type: DataTypes.UUID, allowNull: false },
  event_title:    { type: DataTypes.STRING(200), allowNull: false },
  event_type:     { type: DataTypes.STRING(100) },
  event_date:     { type: DataTypes.DATEONLY, allowNull: false },
  event_end_date: { type: DataTypes.DATEONLY },
  event_location: { type: DataTypes.STRING(255) },
  event_details:  { type: DataTypes.TEXT },
  duration_hours: { type: DataTypes.DECIMAL(5,2) },
  agreed_rate:    { type: DataTypes.DECIMAL(10,2) },
  total_amount:   { type: DataTypes.DECIMAL(10,2) },
  status: {
    type: DataTypes.ENUM('pending','admin_review','model_review','confirmed','rejected_by_admin','rejected_by_model','cancelled','completed'),
    defaultValue: 'pending',
  },
  rejection_reason:  { type: DataTypes.TEXT },
  admin_notes:       { type: DataTypes.TEXT },
  reviewed_by_admin: { type: DataTypes.UUID },
  reviewed_at_admin: { type: DataTypes.DATE },
  model_response_at: { type: DataTypes.DATE },
  completed_at:      { type: DataTypes.DATE },
}, { tableName: 'bookings', underscored: true });

const BookingStatusHistory = sequelize.define('BookingStatusHistory', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  booking_id:  { type: DataTypes.UUID, allowNull: false },
  from_status: { type: DataTypes.STRING(50) },
  to_status:   { type: DataTypes.STRING(50), allowNull: false },
  changed_by:  { type: DataTypes.UUID, allowNull: false },
  note:        { type: DataTypes.TEXT },
}, { tableName: 'booking_status_history', underscored: true, updatedAt: false });

Booking.belongsTo(User,         { foreignKey: 'owner_id', as: 'owner' });
Booking.belongsTo(ModelProfile, { foreignKey: 'model_id', as: 'model' });
User.hasMany(Booking,           { foreignKey: 'owner_id', as: 'bookings' });
ModelProfile.hasMany(Booking,   { foreignKey: 'model_id', as: 'bookings' });
Booking.hasMany(BookingStatusHistory, { foreignKey: 'booking_id', as: 'statusHistory' });
BookingStatusHistory.belongsTo(Booking, { foreignKey: 'booking_id' });


const Payment = sequelize.define('Payment', {
  id:                   { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  booking_id:           { type: DataTypes.UUID, allowNull: false },
  payer_id:             { type: DataTypes.UUID, allowNull: false },
  amount:               { type: DataTypes.DECIMAL(10,2), allowNull: false },
  commission_rate:      { type: DataTypes.DECIMAL(5,2), defaultValue: 10.00 },
  commission_amount:    { type: DataTypes.DECIMAL(10,2) },
  model_payout:         { type: DataTypes.DECIMAL(10,2) },
  currency:             { type: DataTypes.STRING(10), defaultValue: 'NGN' },
  status:               { type: DataTypes.ENUM('pending','success','failed','refunded'), defaultValue: 'pending' },
  payment_method:       { type: DataTypes.STRING(50) },
  provider:             { type: DataTypes.STRING(50), defaultValue: 'paystack' },
  provider_reference:   { type: DataTypes.STRING(255) },
  provider_access_code: { type: DataTypes.STRING(255) },
  authorization_url:    { type: DataTypes.STRING(500) },
  paid_at:              { type: DataTypes.DATE },
  refunded_at:          { type: DataTypes.DATE },
  refund_reason:        { type: DataTypes.TEXT },
  metadata:             { type: DataTypes.JSONB },
}, { tableName: 'payments', underscored: true });

const Payout = sequelize.define('Payout', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  payment_id:     { type: DataTypes.UUID, allowNull: false },
  model_id:       { type: DataTypes.UUID, allowNull: false },
  amount:         { type: DataTypes.DECIMAL(10,2), allowNull: false },
  status:         { type: DataTypes.ENUM('pending','processing','completed','failed'), defaultValue: 'pending' },
  bank_name:      { type: DataTypes.STRING(100) },
  account_number: { type: DataTypes.STRING(20) },
  account_name:   { type: DataTypes.STRING(200) },
  transfer_code:  { type: DataTypes.STRING(255) },
  processed_by:   { type: DataTypes.UUID },
  processed_at:   { type: DataTypes.DATE },
  notes:          { type: DataTypes.TEXT },
}, { tableName: 'payouts', underscored: true });

Payment.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });
Payment.belongsTo(User,    { foreignKey: 'payer_id',   as: 'payer' });
Booking.hasOne(Payment,    { foreignKey: 'booking_id', as: 'payment' });
Payout.belongsTo(Payment,  { foreignKey: 'payment_id', as: 'payment' });
Payment.hasOne(Payout,     { foreignKey: 'payment_id', as: 'payout' });


const Conversation = sequelize.define('Conversation', {
  id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  booking_id:       { type: DataTypes.UUID },
  participant_id:   { type: DataTypes.UUID, allowNull: false },
  participant_role: { type: DataTypes.STRING(50), allowNull: false },
  subject:          { type: DataTypes.STRING(255) },
  status:           { type: DataTypes.ENUM('open','closed'), defaultValue: 'open' },
  last_message_at:  { type: DataTypes.DATE },
}, { tableName: 'conversations', underscored: true });

const Message = sequelize.define('Message', {
  id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  conversation_id: { type: DataTypes.UUID, allowNull: false },
  sender_id:       { type: DataTypes.UUID, allowNull: false },
  sender_role:     { type: DataTypes.STRING(50), allowNull: false },
  body:            { type: DataTypes.TEXT, allowNull: false },
  is_read:         { type: DataTypes.BOOLEAN, defaultValue: false },
  read_at:         { type: DataTypes.DATE },
  is_deleted:      { type: DataTypes.BOOLEAN, defaultValue: false },
  deleted_by:      { type: DataTypes.UUID },
  deleted_at:      { type: DataTypes.DATE },
  deleted_for:     { type: DataTypes.STRING(20), defaultValue: 'everyone' },
}, { tableName: 'messages', underscored: true });

Conversation.belongsTo(User,    { foreignKey: 'participant_id', as: 'participant' });
Conversation.hasMany(Message,   { foreignKey: 'conversation_id', as: 'messages' });
Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
Message.belongsTo(User,         { foreignKey: 'sender_id', as: 'sender' });


const PasswordReset = sequelize.define('PasswordReset', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:    { type: DataTypes.UUID, allowNull: false },
  token:      { type: DataTypes.STRING(255), allowNull: false, unique: true },
  token_hash: { type: DataTypes.STRING(255), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used_at:    { type: DataTypes.DATE, allowNull: true },
  ip_address: { type: DataTypes.STRING(45), allowNull: true },
}, { tableName: 'password_resets', underscored: true });

PasswordReset.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(PasswordReset,   { foreignKey: 'user_id', as: 'passwordResets' });


// ── KYC Verification ─────────────────────────────────────────────────────────
const KYCVerification = sequelize.define('KYCVerification', {
  id:                       { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:                  { type: DataTypes.UUID, allowNull: false },
  role:                     { type: DataTypes.ENUM('model', 'showbiz_owner') },
  status:                   { type: DataTypes.ENUM('pending', 'under_review', 'approved', 'rejected'), defaultValue: 'pending' },
  full_legal_name:          { type: DataTypes.STRING(200) },
  date_of_birth:            { type: DataTypes.DATEONLY },
  phone_number:             { type: DataTypes.STRING(20) },
  address:                  { type: DataTypes.TEXT },
  state:                    { type: DataTypes.STRING(100) },
  nin_number:               { type: DataTypes.STRING(50) },
  nin_doc_url:              { type: DataTypes.STRING(500) },
  nin_doc_public_id:        { type: DataTypes.STRING(500) },
  gov_id_type:              { type: DataTypes.STRING(50) },
  gov_id_url:               { type: DataTypes.STRING(500) },
  gov_id_public_id:         { type: DataTypes.STRING(500) },
  proof_of_address_url:     { type: DataTypes.STRING(500) },
  proof_of_address_public_id: { type: DataTypes.STRING(500) },
  selfie_url:               { type: DataTypes.STRING(500) },
  selfie_public_id:         { type: DataTypes.STRING(500) },
  business_name:            { type: DataTypes.STRING(200) },
  cac_number:               { type: DataTypes.STRING(100) },
  cac_doc_url:              { type: DataTypes.STRING(500) },
  cac_doc_public_id:        { type: DataTypes.STRING(500) },
  reviewed_by:              { type: DataTypes.UUID },
  reviewed_at:              { type: DataTypes.DATE },
  rejection_reason:         { type: DataTypes.TEXT },
  admin_notes:              { type: DataTypes.TEXT },
  submitted_at:             { type: DataTypes.DATE },
}, { tableName: 'kyc_verifications', underscored: true });

User.hasOne(KYCVerification, { foreignKey: 'user_id', as: 'kyc' });
KYCVerification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Active Sessions ───────────────────────────────────────────────────────────
const ActiveSession = sequelize.define('ActiveSession', {
  id:                 { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:            { type: DataTypes.UUID, allowNull: false },
  refresh_token_hash: { type: DataTypes.STRING(500) },
  ip_address:         { type: DataTypes.STRING(100) },
  user_agent:         { type: DataTypes.TEXT },
  is_revoked:         { type: DataTypes.BOOLEAN, defaultValue: false },
  expires_at:         { type: DataTypes.DATE },
}, { tableName: 'active_sessions', underscored: true });

User.hasMany(ActiveSession, { foreignKey: 'user_id', as: 'sessions' });
ActiveSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Contact Submissions ───────────────────────────────────────────────────────
const ContactSubmission = sequelize.define('ContactSubmission', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:       { type: DataTypes.STRING(200), allowNull: false },
  email:      { type: DataTypes.STRING(200), allowNull: false },
  subject:    { type: DataTypes.STRING(300), allowNull: false },
  message:    { type: DataTypes.TEXT, allowNull: false },
  status:     { type: DataTypes.ENUM('new', 'read', 'replied', 'closed'), defaultValue: 'new' },
  admin_note: { type: DataTypes.TEXT },
  ip_address: { type: DataTypes.STRING(100) },
}, { tableName: 'contact_submissions', underscored: true });

// ── Reports & Feedback ────────────────────────────────────────────────────────
const Report = sequelize.define('Report', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:      { type: DataTypes.UUID, allowNull: false },
  type:         { type: DataTypes.ENUM('report', 'feedback', 'complaint', 'suggestion') },
  category:     { type: DataTypes.ENUM('booking', 'payment', 'profile', 'safety', 'technical', 'other') },
  subject:      { type: DataTypes.STRING(300) },
  message:      { type: DataTypes.TEXT },
  related_id:   { type: DataTypes.UUID },
  related_type: { type: DataTypes.STRING(50) },
  status:       { type: DataTypes.ENUM('open', 'in_review', 'resolved', 'closed'), defaultValue: 'open' },
  priority:     { type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'), defaultValue: 'medium' },
  admin_reply:  { type: DataTypes.TEXT },
  replied_by:   { type: DataTypes.UUID },
  replied_at:   { type: DataTypes.DATE },
  attachments:  { type: DataTypes.JSONB, defaultValue: [] },
  voice_note_url:       { type: DataTypes.STRING(500) },
  voice_note_public_id: { type: DataTypes.STRING(500) },
}, { tableName: 'reports', underscored: true });

User.hasMany(Report, { foreignKey: 'user_id', as: 'reports' });
Report.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Announcements ─────────────────────────────────────────────────────────────
const Announcement = sequelize.define('Announcement', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title:      { type: DataTypes.STRING(300), allowNull: false },
  message:    { type: DataTypes.TEXT, allowNull: false },
  type:       { type: DataTypes.ENUM('info', 'warning', 'success', 'urgent'), defaultValue: 'info' },
  audience:   { type: DataTypes.ENUM('all', 'models', 'owners', 'admins'), defaultValue: 'all' },
  is_active:  { type: DataTypes.BOOLEAN, defaultValue: true },
  is_pinned:  { type: DataTypes.BOOLEAN, defaultValue: false },
  expires_at: { type: DataTypes.DATE },
  created_by: { type: DataTypes.UUID },
}, { tableName: 'announcements', underscored: true });

User.hasMany(Announcement, { foreignKey: 'created_by', as: 'announcements' });
Announcement.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// ── Wallet ────────────────────────────────────────────────────────────────────
const Wallet = sequelize.define('Wallet', {
  id:       { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:  { type: DataTypes.UUID, allowNull: false, unique: true },
  balance:  { type: DataTypes.DECIMAL(12,2), defaultValue: 0.00 },
  locked:   { type: DataTypes.DECIMAL(12,2), defaultValue: 0.00 },
  currency: { type: DataTypes.STRING(5), defaultValue: 'NGN' },
}, { tableName: 'wallets', underscored: true });

const WalletTransaction = sequelize.define('WalletTransaction', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  wallet_id:      { type: DataTypes.UUID, allowNull: false },
  user_id:        { type: DataTypes.UUID, allowNull: false },
  type:           { type: DataTypes.ENUM('credit', 'debit', 'lock', 'unlock', 'refund') },
  amount:         { type: DataTypes.DECIMAL(12,2), allowNull: false },
  balance_before: { type: DataTypes.DECIMAL(12,2) },
  balance_after:  { type: DataTypes.DECIMAL(12,2) },
  description:    { type: DataTypes.STRING(500) },
  reference:      { type: DataTypes.STRING(200) },
  status:         { type: DataTypes.ENUM('pending', 'success', 'failed'), defaultValue: 'success' },
  metadata:       { type: DataTypes.JSONB, defaultValue: {} },
}, { tableName: 'wallet_transactions', underscored: true });

User.hasOne(Wallet, { foreignKey: 'user_id', as: 'wallet' });
Wallet.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Wallet.hasMany(WalletTransaction, { foreignKey: 'wallet_id', as: 'transactions' });
WalletTransaction.belongsTo(Wallet, { foreignKey: 'wallet_id', as: 'wallet' });

// ── Bank Transfers ────────────────────────────────────────────────────────────
const BankTransfer = sequelize.define('BankTransfer', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:      { type: DataTypes.UUID, allowNull: false },
  booking_id:   { type: DataTypes.UUID },
  amount:       { type: DataTypes.DECIMAL(12,2), allowNull: false },
  bank_name:    { type: DataTypes.STRING(100) },
  account_name: { type: DataTypes.STRING(200) },
  reference:    { type: DataTypes.STRING(200), allowNull: false },
  receipt_url:  { type: DataTypes.STRING(500) },
  receipt_public_id: { type: DataTypes.STRING(500) },
  status:       { type: DataTypes.ENUM('pending', 'confirmed', 'rejected'), defaultValue: 'pending' },
  admin_note:   { type: DataTypes.TEXT },
  confirmed_by: { type: DataTypes.UUID },
  confirmed_at: { type: DataTypes.DATE },
}, { tableName: 'bank_transfers', underscored: true });

User.hasMany(BankTransfer, { foreignKey: 'user_id', as: 'bank_transfers' });
BankTransfer.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Settings ──────────────────────────────────────────────────────────────────
const Setting = sequelize.define('Setting', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  key:         { type: DataTypes.STRING(100), allowNull: false, unique: true },
  value:       { type: DataTypes.TEXT, allowNull: false },
  label:       { type: DataTypes.STRING(200) },
  description: { type: DataTypes.TEXT },
  type:        { type: DataTypes.ENUM('number', 'string', 'boolean', 'json'), defaultValue: 'string' },
  updated_by:  { type: DataTypes.UUID },
}, { tableName: 'settings', underscored: true });

// ── Push Subscriptions ────────────────────────────────────────────────────────
const PushSubscription = sequelize.define('PushSubscription', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:    { type: DataTypes.UUID, allowNull: false },
  endpoint:   { type: DataTypes.TEXT, allowNull: false },
  p256dh:     { type: DataTypes.TEXT, allowNull: false },
  auth:       { type: DataTypes.TEXT, allowNull: false },
  user_agent: { type: DataTypes.STRING(300) },
}, { tableName: 'push_subscriptions', underscored: true });

User.hasMany(PushSubscription, { foreignKey: 'user_id', as: 'push_subscriptions' });
PushSubscription.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ── Reviews ───────────────────────────────────────────────────────────────────
const Review = sequelize.define('Review', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  booking_id:  { type: DataTypes.UUID, allowNull: false, unique: true },
  reviewer_id: { type: DataTypes.UUID, allowNull: false },
  model_id:    { type: DataTypes.UUID, allowNull: false },
  rating:      { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  title:       { type: DataTypes.STRING(200) },
  comment:     { type: DataTypes.TEXT },
  is_visible:  { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'reviews', underscored: true });

User.hasMany(Review, { foreignKey: 'reviewer_id', as: 'reviews_given' });
Review.belongsTo(User, { foreignKey: 'reviewer_id', as: 'reviewer' });
ModelProfile.hasMany(Review, { foreignKey: 'model_id', as: 'reviews' });
Review.belongsTo(ModelProfile, { foreignKey: 'model_id', as: 'model' });

// ── Withdrawal ──────────────────────────────────────────────────────────────
const Withdrawal = sequelize.define('Withdrawal', {
  id:             { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  user_id:        { type: DataTypes.UUID, allowNull: false },
  amount:         { type: DataTypes.DECIMAL(15,2), allowNull: false },
  bank_name:      { type: DataTypes.STRING(100), allowNull: false },
  account_number: { type: DataTypes.STRING(20), allowNull: false },
  account_name:   { type: DataTypes.STRING(100), allowNull: false },
  status:         { type: DataTypes.STRING(20), defaultValue: 'pending' },
  admin_note:     { type: DataTypes.TEXT },
  processed_by:   { type: DataTypes.UUID },
  processed_at:   { type: DataTypes.DATE },
  wallet_debited: { type: DataTypes.BOOLEAN, defaultValue: false },
  reference:      { type: DataTypes.STRING(100), unique: true },
}, { tableName: 'withdrawals', underscored: true });

Withdrawal.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(Withdrawal, { foreignKey: 'user_id', as: 'withdrawals' });


module.exports = { sequelize, Sequelize, KYCVerification, ActiveSession, ContactSubmission, Report, Announcement, Wallet, WalletTransaction, BankTransfer, Setting, PushSubscription, Review, Role, Permission, User, UserRole, AuditLog, RoleAssignmentHistory, ModelProfile, ShowbizProfile, ModelPhoto, ModelAvailability, Booking, BookingStatusHistory, Payment, Payout, Conversation, Message, PasswordReset, Withdrawal };
