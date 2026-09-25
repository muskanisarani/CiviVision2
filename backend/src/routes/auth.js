const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { COOKIE_NAME, JWT_SECRET } = require('../middleware/auth');
const { sendRegistrationOTP, verifyOTP } = require('../services/emailService');

router.post('/login', async (req, res) => {
  try {
    const { value, password, isAdminLogin } = req.body;

    if (!value || !password) {
      return res.status(400).json({ error: 'Credentials value and password are required' });
    }

    const isEmail = value.includes('@');
    let user = null;

    if (isEmail) {
      user = await prisma.user.findUnique({
        where: { email: value.toLowerCase().trim() }
      });
    } else {
      user = await prisma.user.findUnique({
        where: { mobile: value.trim() }
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User credentials not found. Please check your credentials.' });
    }

    if (isAdminLogin) {
      if (value.toLowerCase().trim() !== 'civivision@gmail.com') {
        return res.status(403).json({ error: 'Unauthorized: Only official admin email civivision@gmail.com is permitted for admin access.' });
      }
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized. Not an administrator account.' });
      }
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid password. Please try again.' });
    }

    // Sign JWT token
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      path: '/'
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        city: user.city,
        state: user.state,
        ward: user.ward,
        role: user.role,
        avatarType: user.avatarType,
        avatarBadge: user.avatarBadge,
        avatarUrl: user.avatarUrl,
        language: user.language,
        credits: user.credits || 50,
        rankTitle: user.rankTitle || 'Civic Scout',
        verifiedReportsCount: user.verifiedReportsCount || 0
      }
    });
  } catch (error) {
    console.error('Login API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/auth/send-otp
 * Generates and emails a 6-digit OTP to the registrant
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already registered
    const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmail) {
      return res.status(400).json({ error: 'This email address is already registered. Please login instead.' });
    }

    const result = await sendRegistrationOTP(normalizedEmail, name || 'Citizen');

    const isDev = result.deliveredVia === 'dev_console' || result.deliveredVia === 'console_fallback';

    return res.json({
      success: true,
      message: isDev 
        ? 'Verification code generated! (Note: Configure EMAIL_USER and EMAIL_PASS in backend/.env for live inbox delivery)' 
        : 'A 6-digit verification code has been dispatched to your email address.',
      devMode: isDev,
      devOtp: isDev ? result.otp : undefined
    });
  } catch (error) {
    console.error('Send OTP Error:', error);
    return res.status(500).json({ error: 'Failed to dispatch verification code. Please try again.' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, mobile, password, city, state, role, otp } = req.body;

    if (!name || !email || !mobile || !password || !city || !state) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail === 'civivision@gmail.com' || role === 'admin') {
      return res.status(403).json({ error: 'Administrative accounts cannot be registered publicly.' });
    }

    if (mobile.length !== 10 || !/^\d+$/.test(mobile)) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify OTP
    if (!otp) {
      return res.status(400).json({ error: 'Please enter the 6-digit verification code sent to your email.' });
    }

    const otpValidation = verifyOTP(normalizedEmail, otp);
    if (!otpValidation.success) {
      return res.status(400).json({ error: otpValidation.error });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const existingMobile = await prisma.user.findUnique({ where: { mobile: mobile.trim() } });
    if (existingMobile) {
      return res.status(400).json({ error: 'Mobile number is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        mobile: mobile.trim(),
        passwordHash,
        city: city.trim(),
        state: state.trim(),
        ward: 'Sector 5',
        role: role || 'user',
        credits: 50,
        rankTitle: 'Civic Scout'
      }
    });

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      path: '/'
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        city: user.city,
        state: user.state,
        ward: user.ward,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully' });
});

// Import middleware inside endpoint or routes config
const { verifyAuth } = require('../middleware/auth');

router.get('/me', verifyAuth, (req, res) => {
  const user = req.user;
  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      city: user.city,
      state: user.state,
      ward: user.ward,
      role: user.role,
      avatarType: user.avatarType,
      avatarBadge: user.avatarBadge,
      avatarUrl: user.avatarUrl,
      language: user.language,
      credits: user.credits || 50,
      rankTitle: user.rankTitle || 'Civic Scout',
      verifiedReportsCount: user.verifiedReportsCount || 0
    }
  });
});

module.exports = router;
