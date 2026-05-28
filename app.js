'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors());
// Trust proxy — needed for correct IP detection behind load balancers
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const rbacRoutes = require('./routes/rbac.routes');
app.use('/api', rbacRoutes);

// Health check
app.get('/', (req, res) => res.json({ message: 'Showbiz API is running', version: '1.0.0' }));

// 404 handler
app.use((req, res) => res.status(404).json({ status: 'error', message: 'Route not found.' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ status: 'error', message: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  Showbiz API running on http://localhost:' + PORT);
  console.log('');
});
