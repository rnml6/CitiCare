import { supabase } from '../config/supabase.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret, JWT_EXPIRES_IN } from '../config/auth.js';
import { isAdminLike } from '../middleware/auth.js';
import {
  sendValidationError,
  trimText,
  validateAdminRegistration,
  validateChangePassword,
  validateLoginPayload,
} from '../utils/validators.js';

// Escape LIKE wildcards so ilike() behaves as a literal case-insensitive match.
const escapeIlike = (s) => String(s).replace(/[\\%_]/g, (m) => '\\' + m);

const isMissingFocusColumn = (error) => {
  if (!error) return false;
  const msg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return error.code === 'PGRST204' || msg.includes('assigned_focus_group');
};

// Full BHW profile for auth payloads. Falls back gracefully when the
// assigned_focus_group migration has not been applied yet.
const fetchBhwProfileByUserId = async (userId) => {
  if (!userId) return null;
  const full = await supabase
    .from('bhws')
    .select('bhw_id, name, position, assigned_purok_id, assigned_focus_group, email, username, contact_number, puroks:assigned_purok_id (name)')
    .eq('user_id', userId)
    .maybeSingle();
  if (full.error) {
    if (!isMissingFocusColumn(full.error)) throw full.error;
    const retry = await supabase
      .from('bhws')
      .select('bhw_id, name, position, assigned_purok_id, email, username, contact_number, puroks:assigned_purok_id (name)')
      .eq('user_id', userId)
      .maybeSingle();
    if (retry.error) throw retry.error;
    if (!retry.data) return null;
    const b = retry.data;
    return {
      id: b.bhw_id,
      name: b.name,
      position: b.position,
      assignedPurokId: b.assigned_purok_id,
      assignedPurokName: b.puroks?.name || null,
      assignedFocusGroup: null,
      email: b.email,
      username: b.username,
      contactNumber: b.contact_number || ''
    };
  }
  if (!full.data) return null;
  const b = full.data;
  return {
    id: b.bhw_id,
    name: b.name,
    position: b.position,
    assignedPurokId: b.assigned_purok_id,
    assignedPurokName: b.puroks?.name || null,
    assignedFocusGroup: b.assigned_focus_group || null,
    email: b.email,
    username: b.username,
    contactNumber: b.contact_number || ''
  };
};

export const login = async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateLoginPayload(body);
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    const password = body.password;
    // Trim so "lina " and "lina" match the stored credential.
    const email = trimText(body.email ?? body.username);

    let user = null;
    let bhwInfo = null;

    // 1. Try users.email (admin accounts) — case-insensitive so
    // "Lina" and "lina" match the same stored credential.
    const { data: userByEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', escapeIlike(email))
      .maybeSingle();

    if (userByEmail) {
      user = userByEmail;
    }

    // 2. Try bhws.username
    if (!user) {
      const { data: bhwByUsername } = await supabase
        .from('bhws')
        .select('user_id, username, email, has_account, bhw_id, name, position, assigned_purok_id')
        .ilike('username', escapeIlike(email))
        .eq('has_account', true)
        .maybeSingle();

      if (bhwByUsername?.user_id) {
        const { data: userByBHW } = await supabase
          .from('users')
          .select('*')
          .eq('user_id', bhwByUsername.user_id)
          .maybeSingle();

        if (userByBHW) {
          user = userByBHW;
          bhwInfo = {
            id: bhwByUsername.bhw_id,
            name: bhwByUsername.name,
            position: bhwByUsername.position,
            assignedPurokId: bhwByUsername.assigned_purok_id,
            email: bhwByUsername.email,
            username: bhwByUsername.username
          };
        }
      }
    }

    // 3. Try bhws.email
    if (!user) {
      const { data: bhwByEmail } = await supabase
        .from('bhws')
        .select('user_id, username, email, has_account, bhw_id, name, position, assigned_purok_id')
        .ilike('email', escapeIlike(email))
        .eq('has_account', true)
        .maybeSingle();

      if (bhwByEmail?.user_id) {
        const { data: userByBHWEmail } = await supabase
          .from('users')
          .select('*')
          .eq('user_id', bhwByEmail.user_id)
          .maybeSingle();

        if (userByBHWEmail) {
          user = userByBHWEmail;
          bhwInfo = {
            id: bhwByEmail.bhw_id,
            name: bhwByEmail.name,
            position: bhwByEmail.position,
            assignedPurokId: bhwByEmail.assigned_purok_id,
            email: bhwByEmail.email,
            username: bhwByEmail.username
          };
        }
      }
    }

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email/username or password' 
      });
    }

    const isPasswordValid = Boolean(user.password_hash) &&
      await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email/username or password' 
      });
    }

    if (user.is_active === false) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been deactivated. Please contact the administrator.' 
      });
    }

    // Enrich to the full profile (purok name + focus group) regardless of
    // which lookup found the user, so the BHW portal can scope immediately.
    if (user.role_display === 'BHW Worker' || user.role_display === 'BHW Admin' || bhwInfo) {
      try {
        const full = await fetchBhwProfileByUserId(user.user_id);
        if (full) bhwInfo = { ...(bhwInfo || {}), ...full };
        else if (bhwInfo) {
          bhwInfo.assignedFocusGroup = bhwInfo.assignedFocusGroup ?? null;
          bhwInfo.assignedPurokName = bhwInfo.assignedPurokName ?? null;
        }
      } catch (e) {
        console.error('BHW profile enrich failed:', e?.message || e);
      }
    }

    const token = jwt.sign(
      {
        userId: user.user_id,
        email: user.email,
        role: user.role_display,
        bhwId: bhwInfo?.id || null,
        assignedPurokId: bhwInfo?.assignedPurokId ?? null,
        assignedFocusGroup: bhwInfo?.assignedFocusGroup ?? null
      },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.user_id,
          email: user.email,
          name: user.name,
          role: user.role_display,
          bhw: bhwInfo
        },
        token
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred during login. Please try again.' 
    });
  }
};

export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    let bhwInfo = null;
    try {
      bhwInfo = await fetchBhwProfileByUserId(user.user_id);
    } catch (e) {
      console.error('BHW profile fetch failed:', e?.message || e);
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.user_id,
          email: user.email,
          name: user.name,
          role: user.role_display,
          bhw: bhwInfo
        }
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const registerAdmin = async (req, res) => {
  try {
    const body = req.body || {};
    const { email, password, name } = body;
    const errors = validateAdminRegistration(body);
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);

    if (req.authInvalid) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    // This endpoint exists only to bootstrap the very first administrator.
    // Once an account exists it is treated as an admin-only user management
    // action, so an unauthenticated caller can never mint a new admin.
    const { count, error: countError } = await supabase
      .from('users')
      .select('user_id', { count: 'exact', head: true });
    if (countError) throw countError;

    if ((count || 0) > 0 && !isAdminLike(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: 'Administrator account already exists. Sign in as an administrator to create another.'
      });
    }

    const cleanEmail = trimText(email).toLowerCase();
    const cleanName = trimText(name);

    const { data: existingUser } = await supabase
      .from('users')
      .select('user_id')
      .ilike('email', escapeIlike(cleanEmail))
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists',
        errors: { email: 'A user with this email already exists.' }
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { data, error } = await supabase
      .from('users')
      .insert({
        email: cleanEmail,
        password_hash: passwordHash,
        name: cleanName,
        role_display: 'Administrator'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: {
        id: data.user_id,
        email: data.email,
        name: data.name,
        role: data.role_display
      },
      message: 'Admin registered successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Failed to register admin' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_id, email, name, role_display, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const users = data.map(user => ({
      id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role_display,
      isActive: user.is_active,
      createdAt: user.created_at
    }));

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

// controllers/authController.js - Add this function

// controllers/authController.js

export const changePassword = async (req, res) => {
  try {
    const errors = validateChangePassword(req.body || {});
    if (Object.keys(errors).length > 0) return sendValidationError(res, errors);
    const { newPassword } = req.body;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    // Hash new password
    const saltRounds = 10;
    const newHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password directly
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        password_hash: newHash, 
        updated_at: new Date() 
      })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

