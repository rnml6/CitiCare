// routes/authRoutes.js
import express from 'express';
import { login, verifyToken, registerAdmin, getAllUsers, changePassword } from '../controllers/authController.js';
import { authenticate, authorizeAdmin, optionalAuthenticate } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/login', loginRateLimiter, login);
router.post('/register-admin', optionalAuthenticate, registerAdmin);
router.get('/verify', authenticate, verifyToken);
router.get('/users', authenticate, authorizeAdmin, getAllUsers);
router.put('/change-password', authenticate, changePassword); // Add this line

export default router;