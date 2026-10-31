import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes.js';
import bhwRoutes from './routes/bhwRoutes.js';
import residentRoutes from './routes/residentRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import purokRoutes from './routes/purokRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import medicineRoutes from './routes/medicineRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { responseCache } from './middleware/responseCache.js';
import { keepSupabaseWarm } from './utils/keepAlive.js';

const app = express();

// Respect the reverse proxy in production so rate limiting keys on the real
// client address rather than the proxy's.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Bound request bodies so a client cannot exhaust memory with a huge payload.
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve repeated JSON reads (Dashboard, Residents, Purok, ...) from memory.
// Any successful write clears the cache, so reads stay fresh after edits.
app.use((req, res, next) => {
  // Keep the remote Supabase connection warm while someone is using the app.
  keepSupabaseWarm();
  next();
});
app.use(responseCache);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CitiCare Backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/bhws', bhwRoutes);
app.use('/api/residents', residentRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/puroks', purokRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/medicines', medicineRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

export default app;
