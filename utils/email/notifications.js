'use strict';

const { sendEmail }  = require('./mailer');
const templates      = require('./templates');

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@showbiz.ng';

const onModelRegistered = async (user) => {
  await sendEmail({ to: user.email, ...templates.welcomeModel({ firstName: user.first_name }) });
};

const onOwnerRegistered = async (user) => {
  await sendEmail({ to: user.email, ...templates.welcomeOwner({ firstName: user.first_name }) });
};

const onModelApproved = async (user) => {
  await sendEmail({ to: user.email, ...templates.modelApproved({ firstName: user.first_name }) });
};

const onModelRejected = async (user, reason) => {
  await sendEmail({ to: user.email, ...templates.modelRejected({ firstName: user.first_name, reason }) });
};

const onPasswordChanged = async (user) => {
  await sendEmail({ to: user.email, ...templates.passwordChanged({ firstName: user.first_name }) });
};

const onBookingCreated = async (booking, owner, model) => {
  await sendEmail({ to: owner.email, ...templates.bookingSubmitted({ ownerName: owner.first_name, booking }) });
  await sendEmail({ to: ADMIN_EMAIL, ...templates.adminNewBooking({ booking, ownerName: owner.first_name + ' ' + owner.last_name, modelName: model.first_name + ' ' + model.last_name }) });
};

const onBookingApprovedByAdmin = async (booking, model, owner) => {
  await sendEmail({ to: model.email, ...templates.bookingForModel({ modelName: model.first_name, booking, ownerName: owner.first_name + ' ' + owner.last_name }) });
};

const onBookingConfirmedByModel = async (booking, owner, model) => {
  await sendEmail({ to: owner.email, ...templates.bookingConfirmed({ ownerName: owner.first_name, modelName: model.first_name + ' ' + model.last_name, booking }) });
};

const onBookingDeclinedByModel = async (booking, owner, model, reason) => {
  await sendEmail({ to: owner.email, ...templates.bookingDeclined({ ownerName: owner.first_name, modelName: model.first_name + ' ' + model.last_name, booking, reason }) });
};

const onPaymentSuccess = async (payment, booking, owner) => {
  await sendEmail({ to: owner.email, ...templates.paymentSuccess({ ownerName: owner.first_name, payment, booking }) });
};

const onPayoutProcessed = async (payout, model) => {
  await sendEmail({ to: model.email, ...templates.payoutProcessed({ modelName: model.first_name, payout }) });
};

module.exports = {
  onModelRegistered, onOwnerRegistered,
  onModelApproved, onModelRejected,
  onPasswordChanged,
  onBookingCreated, onBookingApprovedByAdmin,
  onBookingConfirmedByModel, onBookingDeclinedByModel,
  onPaymentSuccess, onPayoutProcessed,
};
