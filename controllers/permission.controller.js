'use strict';

const db = require('../models');

const listPermissions = async (req, res) => {
  try {
    const permissions = await db.Permission.findAll({ order: [['module','ASC'],['action','ASC']] });
    return res.json({ status: 'success', data: permissions });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch permissions.' });
  }
};

const listModules = async (req, res) => {
  try {
    const permissions = await db.Permission.findAll({ attributes: ['module'], group: ['module'], order: [['module','ASC']] });
    const modules = permissions.map(p => p.module);
    return res.json({ status: 'success', data: modules });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch modules.' });
  }
};

module.exports = { listPermissions, listModules };
