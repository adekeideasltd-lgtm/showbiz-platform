'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3001', methods: ['GET','POST'], credentials: true },
});
app.set('io', io);
require('./utils/socket')(io);

app.use(cors());
// Trust proxy — needed for correct IP detection behind load balancers
app.set('trust proxy', 1);

// Paystack webhook needs raw body for signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
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
server.listen(PORT, () => {
  console.log('');
  console.log('  Showbiz API running on http://localhost:' + PORT);
  console.log('');
});
