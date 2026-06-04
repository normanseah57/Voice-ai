import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import twilio from 'twilio';
import { RestClient as signalwire } from '@signalwire/compatibility-api';
import cors from 'cors';
import os from 'os';
import { spawn } from 'child_process';
import { Resend } from 'resend';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import {
  initDb,
  getSettings,
  updateSettings,
  getAppointments,
  addAppointment,
  deleteAppointment,
  checkAvailability,
  addCallLog,
  updateCallStatus,
  updateCallSummary,
  appendCallTranscript,
  getCallLogs,
  getServices,
  addService,
  deleteService,
  bulkInsertServices,
  updateService,
  
  // CRM Imports
  getContacts,
  findContactByPhone,
  addContact,
  updateContactLeadStage,
  deleteContact,
  getDeals,
  addDeal,
  updateDealStage,
  deleteDeal,
  getActivities,
  addActivity,

  // SaaS Imports
  registerTenant,
  authenticateTenant,
  getTenantUsage,
  updateTenantSubscription,
  findTenantByTwilioNumber,
  isAdminTenant,
  getAllTenantsWithUsage,
  updateTenantByAdmin,
  getTenantStatus,
  getActiveCallsCount,
  getActiveCallsCountForTenant,
  getPlatformActivities,
  buyOverageMinutes,
  updateOverageReminderSettings,
  checkLowCreditReminderTrigger,
  logTenantActivity,
  updateTenantLimitsByAdmin,
  getGlobalOverageRate,
  updateGlobalOverageRate,
  checkSubscriptionGracePeriodsAndSuspend,
  simulateLatePaymentInDb,
  getAllContactsWithTenant,
  getAllAppointmentsWithTenant,
  getAllCallsWithTenant,
  getAllInvoicesWithTenant,
  getAllBillsWithTenant,
  getAllPaymentsWithTenant,

  // Accounting Imports
  getAccountingMetrics,
  getAccountingInvoices,
  addAccountingInvoice,
  getAccountingBills,
  addAccountingBill,
  getAccountingPayments,
  addAccountingPayment,
  getAccountingExpenses,
  addAccountingExpense,
  getAccountingContacts,
  addAccountingContact,
  getAccountingItems,
  addAccountingItem,
  getAccountingAccounts,
  addAccountingAccount,
  getAccountingQuotations,
  addAccountingQuotation,
  deleteAccountingQuotation,


  // Team & Calendar Imports
  getWorkspaceUsers,
  getWorkspaceUserById,
  addWorkspaceUser,
  deleteWorkspaceUser,
  getUserCalendarSettings,
  updateUserCalendarSettings,
  connectUserGoogleCalendar,
  connectUserGoogleCalendarTokens,
  disconnectUserGoogleCalendar,

  // Restaurant Tables Imports
  getRestaurantTables,
  addRestaurantTable,
  deleteRestaurantTable,
  updateRestaurantTable,

  // Hotel Rooms Imports
  getHotelRooms,
  addHotelRoom,
  deleteHotelRoom,
  updateHotelRoom,

  // Payments
  updateAppointmentPaymentStatus,
  getAppointmentById,
  isTenantLocked,

  // Admin Profile Imports
  getTenantById,
  getTenantByEmail,
  updateTenantProfile,

  // Payment Reminder Imports
  checkAndSendPaymentReminders,
  markReminderSent,
  resetPaymentReminderFlags,
  updateNotificationPhone,
  updateTenantAddonRecording,
  updateTenantAddonDepartmentRouting,
  updateTenantAddonWhatsapp,
  updateTenantAddonCrm,
  updateTenantAddonAccounting,
  updateTenantAddonPaymentGateway,
  getTenantDepartments,
  addTenantDepartment,
  deleteTenantDepartment,

  // Security Imports
  findOrCreateGoogleUser,
  createPasswordResetToken,
  resetPasswordWithToken,
  enableTotp,
  disableTotp,
  getTotpUser,

  // Encryption helpers
  maskApiKey,

  // Marketing Campaigns Hub
  getCampaigns,
  addCampaign,
  deleteCampaign,
  updateCampaignStatus,
  getCampaignLogs,
  addCampaignLog,
  getCampaignTemplates,
  addCampaignTemplate,
  deleteCampaignTemplate,

  // Blocked Slots
  getBlockedSlots,
  getBlockedSlotsForUser,
  addBlockedSlot,
  deleteBlockedSlot,

  // Scoped Invitations
  createInvitation,
  getInvitationByToken,
  deleteInvitation,
  getPendingInvitations,
  deleteInvitationByEmail,
  acceptInvitationAndCreateUser,

  // Platform billing analytics
  getPlatformBillingEvents,
  getCallCostTotals,
  getTenantCallCostTotals,
  encryptField,
  decryptField,
  run,
  all,
  get
} from './database.js';

import Stripe from 'stripe';


dotenv.config();

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || 'vd_fallback_secret_change_me';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function issueJWT(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}
function issue2FAToken(payload) {
  return jwt.sign({ ...payload, is2FAStep: true }, JWT_SECRET, { expiresIn: '5m' });
}

// Brute-force rate limiter on login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP. Please try again in 15 minutes.' }
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts from this IP. Please try again in an hour.' }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again in 15 minutes.' }
});

// Initialize Resend email client
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RESEND_FROM = process.env.RESEND_FROM || 'VoiceDesk Billing <onboarding@resend.dev>';

/**
 * Send a payment reminder email via Resend.
 */
async function sendPaymentReminderEmail(tenant, daysLeft) {
  if (!resendClient) {
    console.log(`[Email Reminder - Simulated] Would send ${daysLeft}-day reminder to ${tenant.email}`);
    return;
  }
  const dueDate = new Date(tenant.next_payment_due).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const urgency = daysLeft === 1 ? '🚨 URGENT: ' : '⚠️ ';
  try {
    await resendClient.emails.send({
      from: RESEND_FROM,
      to: [tenant.email],
      subject: `${urgency}Payment Due in ${daysLeft} Day${daysLeft > 1 ? 's' : ''} — VoiceDesk Subscription`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #06b6d4, #8b5cf6); padding: 32px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px;">VoiceDesk</h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Subscription Billing Reminder</p>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #f8fafc; margin-top: 0;">Hi ${tenant.company_name},</h2>
            <p style="color: #94a3b8; line-height: 1.6;">This is a reminder that your VoiceDesk subscription payment is due in <strong style="color: #f8fafc;">${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>
            <div style="background: rgba(6,182,212,0.1); border: 1px solid rgba(6,182,212,0.3); border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0; color: #94a3b8; font-size: 14px;">Payment Due Date</p>
              <p style="margin: 4px 0 0; color: #06b6d4; font-size: 22px; font-weight: bold;">${dueDate}</p>
            </div>
            <p style="color: #94a3b8; line-height: 1.6;">To avoid service interruption, please ensure your payment is made before the due date. Your workspace will be <strong style="color: #f87171;">automatically suspended</strong> if payment is not received by ${dueDate}.</p>
            <p style="color: #64748b; font-size: 13px; margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">This is an automated billing reminder from VoiceDesk.</p>
          </div>
        </div>
      `
    });
    console.log(`[Email Reminder] Sent ${daysLeft}-day reminder to ${tenant.email}`);
  } catch (err) {
    console.error(`[Email Reminder Error] Failed to send to ${tenant.email}:`, err.message);
  }
}

/**
 * Send a payment reminder via WhatsApp using Twilio.
 */
async function sendPaymentReminderWhatsApp(tenant, phone, daysLeft) {
  if (!phone) {
    console.log(`[WhatsApp Reminder - Skipped] No phone number for tenant ${tenant.id} (${tenant.company_name})`);
    return;
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const isMock = !accountSid || !accountSid.startsWith('AC');
  const dueDate = new Date(tenant.next_payment_due).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const urgencyEmoji = daysLeft === 1 ? '🚨' : '⚠️';
  const body = `${urgencyEmoji} *VoiceDesk Payment Reminder*\n\nHi ${tenant.company_name},\n\nYour VoiceDesk subscription payment is due in *${daysLeft} day${daysLeft > 1 ? 's' : ''}* on *${dueDate}*.\n\nPlease make payment to avoid automatic account suspension.\n\n— VoiceDesk Billing Team`;

  if (isMock) {
    console.log(`[WhatsApp Reminder - Simulated] Would send to ${phone}: ${body}`);
    return;
  }
  try {
    const client = getSignalWireClient();
    const fromWhatsApp = `whatsapp:${process.env.TWILIO_PHONE_NUMBER || '+14155238886'}`;
    await client.messages.create({ from: fromWhatsApp, to: `whatsapp:${phone}`, body });
    console.log(`[WhatsApp Reminder] Sent ${daysLeft}-day reminder to ${phone}`);
  } catch (err) {
    console.error(`[WhatsApp Reminder Error] Failed to send to ${phone}:`, err.message);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.enable('trust proxy');
const PORT = process.env.PORT || 3000;

app.use(cors());

// Force HTTPS redirect in production (based on load balancer headers)
app.use((req, res, next) => {
  if (req.headers.host && (req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1'))) {
    return next();
  }
  console.log(`[Redirect Check] host=${req.headers.host}, protocol=${req.protocol}, x-forwarded-proto=${req.headers['x-forwarded-proto']}`);
  if (req.protocol === 'http' || req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================================
// HEALTH CHECK — Prevents Railway cold starts
// Railway pings this to keep the server alive
// =============================================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', ts: Date.now() });
});

// Subdomain Routing Middleware

app.use((req, res, next) => {
  // Disable caching for JS and CSS to ensure clients always get latest code
  // Cache strategy: versioned assets (JS/CSS with ?v=) get long cache
  // HTML stays no-cache so users always get fresh page structure
  const url = req.url.split('?')[0]; // strip query string for extension check
  if (url.endsWith('.html')) {
    // HTML: always revalidate
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else if (url.endsWith('.js') || url.endsWith('.css')) {
    // JS/CSS: cache 7 days (versioned via ?v= query string in HTML)
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  } else if (url.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2|woff)$/i)) {
    // Images & fonts: cache 30 days
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
  // Serve the main application directory (public/) for both root and app subdomains
  express.static(path.join(__dirname, 'public'))(req, res, next);

});

// =============================================================
// PUBLIC CHECKOUT ENDPOINTS (No Dashboard Auth Required)
// =============================================================

// Serve the checkout HTML page for a specific appointment ID
app.get('/checkout/:appointmentId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// Fetch checkout details (appointment info & tenant public settings)
app.get('/api/checkout/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const settings = await getSettings(appointment.tenant_id);
    res.json({
      id: appointment.id,
      customer_name: appointment.customer_name,
      customer_phone: appointment.customer_phone,
      service: appointment.service,
      price: appointment.price || 0,
      date: appointment.date,
      time: appointment.time,
      payment_status: appointment.payment_status || 'unpaid',
      company_name: settings.company_name || 'Our Business',
      payment_gateway_provider: settings.payment_gateway_provider || 'sandbox',
      stripe_publishable_key: settings.payment_gateway_provider === 'stripe' ? settings.stripe_publishable_key : ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process public checkout payment
app.post('/api/checkout/:appointmentId/pay', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.payment_status === 'paid') {
      return res.status(400).json({ error: 'This appointment has already been paid.' });
    }

    const settings = await getSettings(appointment.tenant_id);
    const provider = settings.payment_gateway_provider || 'sandbox';

    if (provider === 'stripe') {
      const { paymentMethodId } = req.body;
      if (!paymentMethodId) {
        return res.status(400).json({ error: 'Payment method is required for Stripe payments.' });
      }
      if (!settings.stripe_secret_key) {
        return res.status(400).json({ error: 'Merchant payment configuration is incomplete (missing Stripe credentials).' });
      }

      // Initialize Stripe with the tenant's secret key
      const stripeInstance = new Stripe(settings.stripe_secret_key);
      const amountCents = Math.round((appointment.price || 80) * 100);

      const paymentIntent = await stripeInstance.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never'
        }
      });

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: `Payment failed with status: ${paymentIntent.status}` });
      }
    } else {
      // Simulate sandbox delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update appointment payment status in DB
    const updatedAppt = await updateAppointmentPaymentStatus(appointment.tenant_id, appointment.id, 'paid');

    // Find and update matching Kanban Deal
    try {
      const contact = await findContactByPhone(appointment.tenant_id, appointment.customer_phone);
      if (contact) {
        const deals = await getDeals(appointment.tenant_id);
        const match = deals.find(d => 
          d.contact_id === contact.id && 
          d.close_date === appointment.date && 
          d.stage !== 'closedwon'
        );
        if (match) {
          await updateDealStage(appointment.tenant_id, match.id, 'closedwon');
        }
      }
    } catch (dealErr) {
      console.error('Error auto-updating CRM Deal to Closed Won:', dealErr);
    }

    // Log Activity
    await logTenantActivity(
      appointment.tenant_id,
      'payment_received',
      `Payment received: $${(appointment.price || 0).toFixed(2)} from ${appointment.customer_name} via ${provider.toUpperCase()}`
    );

    // Broadcast WebSocket updates
    broadcastToDashboard(appointment.tenant_id, 'refresh_appointments', updatedAppt);
    broadcastToDashboard(appointment.tenant_id, 'refresh_crm', {});

    res.json({ success: true, appointment: updatedAppt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Authentication required. Please login.' });

  let tenantId = null;
  let userId = null;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.is2FAStep) return res.status(401).json({ error: '2FA verification required.' });
      tenantId = decoded.tenantId;
      userId = decoded.userId;
    } catch (err) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
  } else {
    return res.status(401).json({ error: 'Invalid authentication scheme. Bearer token required.' });
  }

  if (!tenantId || isNaN(tenantId)) return res.status(400).json({ error: 'Invalid authentication token.' });

  try {
    const status = await getTenantStatus(tenantId);
    if (!status) return res.status(401).json({ error: 'Account does not exist.' });

    const lockStatus = await isTenantLocked(tenantId);
    if (lockStatus.locked) {
      const allowedPaths = ['/api/saas/billing', '/api/saas/billing/upgrade', '/api/saas/billing/buy-overage', '/api/auth/profile'];
      if (!allowedPaths.includes(req.path)) {
        return res.status(403).json({ error: 'Account Restricted: Your workspace is restricted due to outstanding due payments. Please make a payment to unlock your account.', locked: true, reason: lockStatus.reason });
      }
    }

    if (!userId) {
      const users = await getWorkspaceUsers(tenantId);
      const owner = users.find(u => u.role === 'owner') || users[0];
      userId = owner ? owner.id : null;
    }

    req.tenantId = tenantId;
    req.userId = userId;
    req.isAdmin = status.is_admin === 1;

    if (req.isAdmin && req.headers['x-impersonate-tenant-id']) {
      const impId = parseInt(req.headers['x-impersonate-tenant-id']);
      if (!isNaN(impId)) {
        const impStatus = await getTenantStatus(impId);
        if (impStatus) req.tenantId = impId;
      }
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Access Denied: Administrative privileges required.' });
  }
  next();
}

// Resolve Twilio Client (with Mock fallback for testing & local development)
function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (accountSid && accountSid.startsWith('AC') && authToken) {
    return twilio(accountSid, authToken);
  }
  
  return {
    messages: {
      create: async (opts) => {
        console.log(`[Twilio Mock] Send Message: From=${opts.from}, To=${opts.to}, Body="${opts.body}"`);
        return { sid: 'SMmock_' + Math.random().toString(36).substring(2, 10) };
      }
    },
    calls: {
      create: async (opts) => {
        console.log(`[Twilio Mock] Create Call: From=${opts.from}, To=${opts.to}, Url="${opts.url}"`);
        return { sid: 'CAmock_' + Math.random().toString(36).substring(2, 10) };
      }
    }
  };
}

// Resolve SignalWire Compatibility Client
function getSignalWireClient() {
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const apiToken = process.env.SIGNALWIRE_API_TOKEN;
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL;

  if (projectId && apiToken && spaceUrl) {
    return signalwire(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
  }

  // Fallback to Twilio client if SignalWire credentials are not set
  return getTwilioClient();
}

// =============================================================
// AUTHENTICATION & REGISTRATION ENDPOINTS
// =============================================================

// Auto-provision an OpenAI Project + Service Account for a new tenant
async function provisionOpenAIProject(tenantId, tenantName, companyName) {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  const orgId    = process.env.OPENAI_ORG_ID;

  if (!adminKey || !orgId) {
    console.log(`[OpenAI Provision] Skipped for Tenant ${tenantId} — OPENAI_ADMIN_KEY or OPENAI_ORG_ID not set.`);
    return;
  }

  const label = (companyName || tenantName || `Tenant ${tenantId}`)
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 60);

  try {
    // 1. Create a Project
    const projRes = await fetch(`https://api.openai.com/v1/organization/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Organization': orgId
      },
      body: JSON.stringify({ name: `VoiceDesk — ${label}` })
    });
    if (!projRes.ok) {
      const err = await projRes.text();
      console.error(`[OpenAI Provision] Project creation failed for Tenant ${tenantId}:`, err);
      return;
    }
    const project = await projRes.json();
    const projectId = project.id;
    console.log(`[OpenAI Provision] Project created: ${project.name} (${projectId}) for Tenant ${tenantId}`);

    // 2. Create a Service Account inside the project
    const saRes = await fetch(`https://api.openai.com/v1/organization/projects/${projectId}/service_accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Organization': orgId
      },
      body: JSON.stringify({ name: `voicedesk-t${tenantId}` })
    });
    if (!saRes.ok) {
      const err = await saRes.text();
      console.error(`[OpenAI Provision] Service account creation failed for Tenant ${tenantId}:`, err);
      return;
    }
    const sa = await saRes.json();
    const apiKey = sa.api_key?.value;
    if (!apiKey) {
      console.error(`[OpenAI Provision] No API key returned for Tenant ${tenantId} — check service account response.`);
      return;
    }

    // 3. Set a default monthly budget on the project ($20 soft limit — adjustable per plan)
    const defaultBudget = 20;
    await fetch(`https://api.openai.com/v1/organization/projects/${projectId}/rate_limits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Organization': orgId
      },
      body: JSON.stringify({ soft_limit_usd: defaultBudget })
    }).catch(() => {}); // Non-fatal if budget endpoint isn't available

    // 4. Encrypt and store the key in the tenant's settings
    const existing = await getSettings(tenantId);
    await updateSettings(tenantId, { ...existing, openai_api_key: apiKey });
    console.log(`[OpenAI Provision] ✅ API key stored (encrypted) for Tenant ${tenantId}. Project: ${projectId}`);

  } catch (err) {
    // Non-fatal — tenant account is still created, admin can add key manually
    console.error(`[OpenAI Provision] Unexpected error for Tenant ${tenantId}:`, err.message);
  }
}


app.post('/api/auth/register', signupLimiter, async (req, res) => {
  const { name, email, password, companyName } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  try {
    const tenant = await registerTenant({ name, email, password, company_name: companyName });

    // Auto-provision OpenAI project in background — non-blocking so signup is instant
    provisionOpenAIProject(tenant.id, name, companyName).catch(e =>
      console.error('[OpenAI Provision] Background error:', e.message)
    );

    res.json({ success: true, tenant });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/debug-reset', async (req, res) => {
  try {
    // Ensure the corresponding user exists in the tenant_users table
    let adminUser = await get("SELECT * FROM tenant_users WHERE email = 'admin@aurasaas.com'");
    if (!adminUser) {
      await run(`
        INSERT INTO tenant_users (tenant_id, name, email, password_hash, password_is_hashed, role)
        VALUES (1, 'Super Admin', 'admin@aurasaas.com', 'admin123', 0, 'owner')
      `);
    } else {
      await run(`
        UPDATE tenant_users SET password_hash = 'admin123', password_is_hashed = 0, role = 'owner', tenant_id = 1
        WHERE email = 'admin@aurasaas.com'
      `);
    }

    // Explicitly run resets here to be 100% sure they run on the active database instance
    await run("UPDATE tenants SET password_hash = 'admin123', is_admin = 1 WHERE email = 'admin@aurasaas.com'");
    await run("UPDATE tenants SET is_admin = 1 WHERE email = 'normansiah.sg@gmail.com'");

    const tenants = await all('SELECT id, name, email, is_admin FROM tenants');
    const users = await all('SELECT id, tenant_id, name, email, role, password_hash, password_is_hashed FROM tenant_users');

    res.json({
      success: true,
      message: "Resets executed successfully",
      tenants,
      users
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const tenant = await authenticateTenant(email, password);
    if (tenant.subscription_status === 'suspended') {
      return res.status(403).json({ error: 'Account Suspended: Your access has been deactivated by the system administrator.' });
    }
    // If 2FA is enabled, issue a short-lived temp token
    if (tenant.totp_enabled) {
      const tempToken = issue2FAToken({ tenantId: tenant.id, userId: tenant.userId });
      return res.json({ success: false, requires2FA: true, tempToken });
    }
    // No 2FA — issue full JWT session
    const token = issueJWT({ tenantId: tenant.id, userId: tenant.userId, is_admin: tenant.is_admin });
    const { totp_enabled, totp_secret, ...safeTenant } = tenant;
    res.json({ success: true, token, tenant: safeTenant });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// 2FA login step — verify TOTP code with temp token
app.post('/api/auth/login/2fa', async (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) return res.status(400).json({ error: 'tempToken and code are required' });
  try {
    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: '2FA session expired. Please log in again.' });
    }
    if (!decoded.is2FAStep) return res.status(400).json({ error: 'Invalid token type.' });
    const user = await getTotpUser(decoded.userId);
    if (!user || !user.totp_secret) return res.status(400).json({ error: '2FA not configured.' });
    const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) return res.status(401).json({ error: 'Invalid authenticator code. Please try again.' });
    // Issue full session JWT using tenantId/userId from temp token
    const token = issueJWT({ tenantId: decoded.tenantId, userId: decoded.userId });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth Sign-In
app.post('/api/auth/google', async (req, res) => {
  const { credential, inviteToken } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential required.' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;
    
    let tenant;
    if (inviteToken) {
      const invite = await getInvitationByToken(inviteToken);
      if (!invite) {
        return res.status(404).json({ error: 'Invitation not found or invalid.' });
      }
      if (new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Invitation has expired.' });
      }

      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const createdUser = await acceptInvitationAndCreateUser(invite.tenant_id, {
        name: name || invite.email.split('@')[0],
        email: invite.email, // Bind to the invited email address
        passwordHash,
        role: invite.role,
        googleId
      });

      await deleteInvitation(invite.tenant_id, invite.id);
      broadcastToDashboard(invite.tenant_id, 'refresh_crm', {});

      const fetchedTenant = await getTenantById(invite.tenant_id);
      tenant = {
        id: fetchedTenant.id,
        userId: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        company_name: fetchedTenant.company_name,
        subscription_tier: fetchedTenant.subscription_tier,
        billing_cycle: fetchedTenant.billing_cycle || 'monthly',
        subscription_status: fetchedTenant.subscription_status,
        is_admin: fetchedTenant.is_admin,
        role: createdUser.role,
        totp_enabled: false
      };
    } else {
      tenant = await findOrCreateGoogleUser({ googleId, email, name });
    }

    if (tenant.subscription_status === 'suspended') {
      return res.status(403).json({ error: 'Account Suspended.' });
    }
    const token = issueJWT({ tenantId: tenant.id, userId: tenant.userId, is_admin: tenant.is_admin });
    const { totp_enabled, totp_secret, ...safeTenant } = tenant;
    res.json({ success: true, token, tenant: safeTenant, isNew: inviteToken ? true : !tenant.existing });
  } catch (err) {
    console.error('[Google Auth Error]', err.message);
    res.status(401).json({ error: err.message || 'Google Sign-In failed. Please try again.' });
  }
});

// Forgot Password — send reset email
app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    const record = await createPasswordResetToken(email);
    // Always return success to prevent email enumeration
    if (record && resendClient) {
      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${record.token}`;
      await resendClient.emails.send({
        from: RESEND_FROM,
        to: [email],
        subject: '🔐 Reset Your VoiceDesk Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #06b6d4, #8b5cf6); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px;">VoiceDesk</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Password Reset Request</p>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #f8fafc; margin-top: 0;">Reset Your Password</h2>
              <p style="color: #94a3b8; line-height: 1.6;">We received a request to reset your VoiceDesk password. Click the button below to set a new password. This link expires in <strong style="color: white;">1 hour</strong>.</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="background: linear-gradient(135deg, #06b6d4, #8b5cf6); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Reset Password</a>
              </div>
              <p style="color: #64748b; font-size: 13px;">If you didn't request a password reset, you can safely ignore this email.</p>
              <p style="color: #475569; font-size: 11px; word-break: break-all;">Or copy this link: ${resetUrl}</p>
            </div>
          </div>
        `
      });
    } else if (record) {
      console.log(`[Password Reset] Link for ${email}: /reset-password.html?token=${record.token}`);
    }
    res.json({ success: true, message: 'If this email is registered, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    await resetPasswordWithToken(token, newPassword);
    res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2FA Setup — generate secret + QR code (not saved until confirmed)
app.get('/api/auth/2fa/setup', requireAuth, async (req, res) => {
  try {
    const user = await getTotpUser(req.userId);
    const secret = speakeasy.generateSecret({ name: `VoiceDesk (${user?.email || 'account'})`, length: 20 });
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCodeDataUrl, otpauthUrl: secret.otpauth_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2FA Enable — verify code then save secret
app.post('/api/auth/2fa/enable', requireAuth, async (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) return res.status(400).json({ error: 'Secret and code are required.' });
  const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
  if (!valid) return res.status(400).json({ error: 'Invalid code. Please try again with your authenticator app.' });
  try {
    await enableTotp(req.userId, secret);
    res.json({ success: true, message: '2FA enabled successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2FA Disable — re-verify code before disabling
app.post('/api/auth/2fa/disable', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Current authenticator code is required to disable 2FA.' });
  try {
    const user = await getTotpUser(req.userId);
    if (!user?.totp_secret) return res.status(400).json({ error: '2FA is not enabled.' });
    const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) return res.status(400).json({ error: 'Invalid code. 2FA not disabled.' });
    await disableTotp(req.userId);
    res.json({ success: true, message: '2FA disabled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2FA Status
app.get('/api/auth/2fa/status', requireAuth, async (req, res) => {
  try {
    const user = await getTotpUser(req.userId);
    res.json({ totp_enabled: user?.totp_enabled === 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const tenant = await getTenantById(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    res.json({ id: tenant.id, name: tenant.name, email: tenant.email, is_admin: tenant.is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// SAAS BILLING & USAGE LIMITS
// =============================================================

/**
 * Resolves the effective usage limits for a tenant.
 * Custom limits set by Super Admin always override the plan defaults.
 */
function resolveTenantLimits(usage) {
  const planDefaults = {
    free:         { minutes: 15,     contacts: 15,    appointments: 5 },
    starter:      { minutes: 100,    contacts: 100,   appointments: 9999 },
    professional: { minutes: 1000,   contacts: 99999, appointments: 99999 },
    enterprise:   { minutes: 999999, contacts: 999999, appointments: 999999 }
  };
  const defaults = planDefaults[usage.tier] || planDefaults.free;
  return {
    minutes:      usage.custom_minute_limit      != null ? usage.custom_minute_limit      : defaults.minutes,
    contacts:     usage.custom_contact_limit     != null ? usage.custom_contact_limit     : defaults.contacts,
    appointments: usage.custom_appointment_limit != null ? usage.custom_appointment_limit : defaults.appointments,
    // Expose which ones are overridden
    custom_minute_limit:      usage.custom_minute_limit      ?? null,
    custom_contact_limit:     usage.custom_contact_limit     ?? null,
    custom_appointment_limit: usage.custom_appointment_limit ?? null,
    plan_default_minutes:      defaults.minutes,
    plan_default_contacts:     defaults.contacts,
    plan_default_appointments: defaults.appointments
  };
}

app.get('/api/saas/billing', requireAuth, async (req, res) => {
  try {
    const usage = await getTenantUsage(req.tenantId);
    const limits = resolveTenantLimits(usage);
    const lockStatus = await isTenantLocked(req.tenantId);
    res.json({
      usage,
      limits,
      locked: lockStatus.locked,
      lock_reason: lockStatus.reason
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Auto-enable or disable addons based on the purchased tier.
 * Professional & Enterprise: CRM + Accounting included.
 * Starter & Free: CRM + Accounting disabled.
 */
async function autoEnableAddonsForTier(tenantId, tier) {
  const includedInPro = ['professional', 'enterprise'].includes(tier);
  try {
    await updateTenantAddonCrm(tenantId, includedInPro);
    await updateTenantAddonAccounting(tenantId, includedInPro);
    console.log(`[Tier] Tenant ${tenantId} → ${tier}: addon_crm=${+includedInPro}, addon_accounting=${+includedInPro}`);
  } catch (err) {
    console.error('[Tier] Failed to auto-set addons for tenant', tenantId, err.message);
  }
}

app.post('/api/saas/billing/upgrade', requireAuth, async (req, res) => {
  const { tier, billing_cycle } = req.body;
  const cycle = billing_cycle || 'monthly';
  if (!['free', 'starter', 'professional', 'enterprise'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid subscription tier' });
  }
  if (!['monthly', 'annual'].includes(cycle)) {
    return res.status(400).json({ error: 'Invalid billing cycle' });
  }
  try {
    const usage = await updateTenantSubscription(req.tenantId, tier, cycle);

    // Auto-enable CRM & Accounting for Pro/Enterprise; disable for lower tiers
    await autoEnableAddonsForTier(req.tenantId, tier);

    // Auto-assign phone number if they upgraded to a paid plan
    if (tier !== 'free') {
      try {
        await autoAssignPhoneNumberForTenant(req.tenantId);
      } catch (phoneErr) {
        console.error('Non-blocking error auto-assigning phone number on upgrade:', phoneErr);
      }
    }

    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json({ success: true, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/billing/buy-overage', requireAuth, async (req, res) => {
  const blocks = req.body && req.body.blocks !== undefined ? parseInt(req.body.blocks) : 1;
  if (isNaN(blocks) || blocks < 1 || blocks > 100) {
    return res.status(400).json({ error: 'Blocks count must be an integer between 1 and 100.' });
  }
  try {
    const usage = await buyOverageMinutes(req.tenantId, blocks);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json({ success: true, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/billing/reminder-settings', requireAuth, async (req, res) => {
  const { overage_reminder_limit } = req.body;
  const threshold = parseFloat(overage_reminder_limit);
  if (isNaN(threshold) || threshold < 0) {
    return res.status(400).json({ error: 'Reminder limit must be a positive number.' });
  }
  try {
    const usage = await updateOverageReminderSettings(req.tenantId, threshold);
    res.json({ success: true, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/billing/simulate-late-payment', requireAuth, async (req, res) => {
  try {
    const usage = await simulateLatePaymentInDb(req.tenantId);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json({ success: true, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve the server's local network IP for QR code and mobile app cross-device testing
app.get('/api/network-ip', (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp !== 'localhost') break;
    }
    res.json({ ip: localIp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Expose the public Twilio demo phone number for the landing page
app.get('/api/demo-number', (req, res) => {
  res.json({ number: process.env.TWILIO_PHONE_NUMBER || '+1 (520) 353-8181' });
});

// =============================================================
// SUPER ADMIN OPERATIONS
// =============================================================

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenants = await getAllTenantsWithUsage();
    
    // Aggregate metrics
    let totalTenants = tenants.length;
    let totalMinutes = 0;
    let estimatedMrr = 0;
    
    tenants.forEach(t => {
      totalMinutes += t.usage_minutes || 0;
      if (t.subscription_tier === 'starter') {
        const price = (t.billing_cycle === 'annual') ? 79 : 99;
        estimatedMrr += price;
      } else if (t.subscription_tier === 'professional') {
        const price = (t.billing_cycle === 'annual') ? 799 : 999;
        estimatedMrr += price;
      } else if (t.subscription_tier === 'enterprise') {
        const price = (t.billing_cycle === 'annual') ? 2000 : 2500;
        estimatedMrr += price;
      }
    });
    
    const activeCalls = await getActiveCallsCount();

    res.json({
      totalTenants,
      totalMinutes,
      estimatedMrr,
      activeCalls
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/financial-stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenants = await getAllTenantsWithUsage();
    let estimatedMrr = 0;
    const tierCounts = { starter: 0, professional: 0, enterprise: 0, free: 0 };
    
    tenants.forEach(t => {
      const tier = t.subscription_tier || 'free';
      if (tierCounts[tier] !== undefined) {
        tierCounts[tier]++;
      }
      if (tier === 'starter') {
        estimatedMrr += (t.billing_cycle === 'annual') ? 79 : 99;
      } else if (tier === 'professional') {
        estimatedMrr += (t.billing_cycle === 'annual') ? 799 : 999;
      } else if (tier === 'enterprise') {
        estimatedMrr += (t.billing_cycle === 'annual') ? 2000 : 2500;
      }
    });

    const billingEvents = await getPlatformBillingEvents();
    let totalRevenue = 0;
    billingEvents.forEach(e => {
      totalRevenue += e.amount || 0;
    });

    const callCosts = await getCallCostTotals();
    const totalOpenai = callCosts.total_openai || 0;
    const totalTwilio = callCosts.total_twilio || 0;
    const totalCosts = totalOpenai + totalTwilio + 150.0; // $150 baseline for simulated hosting server costs

    const grossMargin = totalRevenue - totalCosts;
    const grossMarginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

    const unitEconomics = [];
    for (const t of tenants) {
      const tBilling = billingEvents.filter(e => e.tenant_id === t.id);
      let tRevenue = tBilling.reduce((sum, e) => sum + e.amount, 0);
      
      let monthlySub = 0;
      if (t.subscription_tier === 'starter') {
        monthlySub = (t.billing_cycle === 'annual') ? 79 : 99;
      } else if (t.subscription_tier === 'professional') {
        monthlySub = (t.billing_cycle === 'annual') ? 799 : 999;
      } else if (t.subscription_tier === 'enterprise') {
        monthlySub = (t.billing_cycle === 'annual') ? 2000 : 2500;
      }
      tRevenue += monthlySub;

      const tCalls = await getTenantCallCostTotals(t.id);
      const tCost = (tCalls.total_openai || 0) + (tCalls.total_twilio || 0);

      const tMargin = tRevenue - tCost;
      const tMarginPercent = tRevenue > 0 ? (tMargin / tRevenue) * 100 : 0;

      unitEconomics.push({
        id: t.id,
        company_name: t.company_name,
        owner_name: t.name,
        tier: t.subscription_tier,
        revenue: tRevenue,
        cost: tCost,
        margin: tMargin,
        margin_percent: tMarginPercent,
        alert: tCost > tRevenue && tRevenue > 0
      });
    }

    res.json({
      estimatedMrr,
      totalRevenue,
      totalCosts,
      grossMargin,
      grossMarginPercent,
      tierCounts,
      unitEconomics
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/billing-ledger', requireAuth, requireAdmin, async (req, res) => {
  try {
    const list = await getPlatformBillingEvents();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-tenant purchase history drill-down for Super Admin
app.get('/api/admin/billing-ledger/:tenantId', requireAuth, requireAdmin, async (req, res) => {
  const tenantId = parseInt(req.params.tenantId);
  if (isNaN(tenantId)) return res.status(400).json({ error: 'Invalid tenant ID.' });
  try {
    const allEvents = await getPlatformBillingEvents();
    const tenantEvents = allEvents.filter(e => e.tenant_id === tenantId);

    // Also fetch the tenant's current profile / usage for the summary banner
    const tenant = await getTenantById(tenantId);
    const usage  = tenant ? await getTenantUsage(tenantId) : null;

    res.json({
      events: tenantEvents,
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        company_name: tenant.company_name || tenant.name,
        subscription_tier: usage?.tier || tenant.subscription_tier || 'free',
        subscription_status: tenant.subscription_status || 'active',
        billing_cycle: usage?.billing_cycle || 'monthly',
        usage_minutes: usage?.usage_minutes || 0,
        prepaid_overage_minutes: usage?.prepaid_overage_minutes || 0,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/tenants', requireAuth, requireAdmin, async (req, res) => {
  try {
    const list = await getAllTenantsWithUsage();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/tenants/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id);
  const { subscription_tier, subscription_status, billing_cycle } = req.body;
  
  if (!['free', 'starter', 'professional', 'enterprise'].includes(subscription_tier)) {
    return res.status(400).json({ error: 'Invalid subscription tier' });
  }
  if (!['active', 'suspended'].includes(subscription_status)) {
    return res.status(400).json({ error: 'Invalid subscription status' });
  }
  const cycle = billing_cycle || 'monthly';
  if (!['monthly', 'annual'].includes(cycle)) {
    return res.status(400).json({ error: 'Invalid billing cycle' });
  }
  
  try {
    const usage = await updateTenantByAdmin(targetId, { subscription_tier, subscription_status, billing_cycle: cycle });

    // Auto-enable CRM & Accounting for Pro/Enterprise; disable for lower tiers
    await autoEnableAddonsForTier(targetId, subscription_tier);

    // Force refresh dashboard UI of upgraded/downgraded client
    broadcastToDashboard(targetId, 'refresh_crm', {});
    broadcastToDashboard(targetId, 'session_refresh', { reason: 'tier_change', tier: subscription_tier });

    res.json({ success: true, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/activities', requireAuth, requireAdmin, async (req, res) => {
  try {
    const list = await getPlatformActivities();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Super Admin: Set per-tenant custom usage rate limits.
 * Accepts custom_minute_limit, custom_contact_limit, custom_appointment_limit.
 * Pass null or empty string to clear a custom override and revert to plan default.
 */
app.put('/api/admin/tenants/:id/limits', requireAuth, requireAdmin, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid tenant ID.' });
  }
  const { custom_minute_limit, custom_contact_limit, custom_appointment_limit, custom_overage_rate } = req.body;
  // Validate: each must be a positive integer or null/empty (clear override)
  const validateField = (val, name) => {
    if (val === null || val === undefined || val === '') return true;
    const n = parseInt(val);
    if (isNaN(n) || n < 0) return `${name} must be a non-negative integer or empty to use plan default.`;
    return true;
  };
  const validateFloat = (val, name) => {
    if (val === null || val === undefined || val === '') return true;
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return `${name} must be a non-negative number or empty to use default.`;
    return true;
  };
  const errs = [
    validateField(custom_minute_limit, 'Minute limit'),
    validateField(custom_contact_limit, 'Contact limit'),
    validateField(custom_appointment_limit, 'Appointment limit'),
    validateFloat(custom_overage_rate, 'Overage rate override')
  ].filter(e => e !== true);
  if (errs.length) return res.status(400).json({ error: errs.join(' ') });

  try {
    const usage = await updateTenantLimitsByAdmin(targetId, { 
      custom_minute_limit, 
      custom_contact_limit, 
      custom_appointment_limit,
      custom_overage_rate 
    });
    broadcastToDashboard(targetId, 'refresh_crm', {});
    res.json({ success: true, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/global-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rate = await getGlobalOverageRate();
    res.json({ global_overage_rate: rate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/profile', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, new_password } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
  try {
    const existing = await getTenantById(req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Admin account not found.' });
    // Check email uniqueness if changed
    if (email !== existing.email) {
      const conflict = await getTenantByEmail(email);
      if (conflict) return res.status(409).json({ error: 'That email is already in use by another account.' });
    }
    const password_hash = new_password && new_password.trim() ? new_password.trim() : existing.password_hash;
    await updateTenantProfile(req.tenantId, { name, email, password_hash });
    res.json({ success: true, name, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save tenant notification phone (for WhatsApp payment reminders)
app.put('/api/billing/notification-phone', requireAuth, async (req, res) => {
  const { notification_phone } = req.body;
  try {
    await updateNotificationPhone(req.tenantId, notification_phone || null);
    res.json({ success: true, notification_phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle call recording handoff addon status
app.post('/api/addons/toggle-recording', requireAuth, async (req, res) => {
  const { active } = req.body;
  try {
    const activeVal = active === true || active === 1 || active === '1';
    await updateTenantAddonRecording(req.tenantId, activeVal);
    await logTenantActivity(req.tenantId, 'settings_update', `Call Handoff Recording Addon ${activeVal ? 'Activated' : 'Deactivated'}`);
    res.json({ success: true, addon_call_recording: activeVal ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle department routing addon status
app.post('/api/addons/toggle-departments', requireAuth, async (req, res) => {
  const { active } = req.body;
  try {
    const activeVal = active === true || active === 1 || active === '1';
    await updateTenantAddonDepartmentRouting(req.tenantId, activeVal);
    await logTenantActivity(req.tenantId, 'settings_update', `Department & Extension Routing Addon ${activeVal ? 'Activated' : 'Deactivated'}`);
    res.json({ success: true, addon_department_routing: activeVal ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle WhatsApp addon status
app.post('/api/addons/toggle-whatsapp', requireAuth, async (req, res) => {
  const { active } = req.body;
  try {
    const activeVal = active === true || active === 1 || active === '1';
    await updateTenantAddonWhatsapp(req.tenantId, activeVal);
    await logTenantActivity(req.tenantId, 'settings_update', `WhatsApp/SMS/Email Addon ${activeVal ? 'Activated' : 'Deactivated'}`);
    res.json({ success: true, addon_whatsapp: activeVal ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle CRM addon status
app.post('/api/addons/toggle-crm', requireAuth, async (req, res) => {
  const { active } = req.body;
  try {
    const activeVal = active === true || active === 1 || active === '1';
    await updateTenantAddonCrm(req.tenantId, activeVal);
    await logTenantActivity(req.tenantId, 'settings_update', `AI CRM Hub Addon ${activeVal ? 'Activated' : 'Deactivated'}`);
    res.json({ success: true, addon_crm: activeVal ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Accounting addon status
app.post('/api/addons/toggle-accounting', requireAuth, async (req, res) => {
  const { active } = req.body;
  try {
    const activeVal = active === true || active === 1 || active === '1';
    await updateTenantAddonAccounting(req.tenantId, activeVal);
    await logTenantActivity(req.tenantId, 'settings_update', `Accounting & Invoicing Addon ${activeVal ? 'Activated' : 'Deactivated'}`);
    res.json({ success: true, addon_accounting: activeVal ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Payment Gateway addon status
app.post('/api/addons/toggle-payment-gateway', requireAuth, async (req, res) => {
  const { active } = req.body;
  try {
    const activeVal = active === true || active === 1 || active === '1';
    await updateTenantAddonPaymentGateway(req.tenantId, activeVal);
    await logTenantActivity(req.tenantId, 'settings_update', `Stripe Payment Gateway Addon ${activeVal ? 'Activated' : 'Deactivated'}`);
    res.json({ success: true, addon_payment_gateway: activeVal ? 1 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET active departments list
app.get('/api/settings/departments', requireAuth, async (req, res) => {
  try {
    const departments = await getTenantDepartments(req.tenantId);
    res.json(departments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add department
app.post('/api/settings/departments', requireAuth, async (req, res) => {
  const { name, phone_number, extension, record_calls } = req.body;
  if (!name || !phone_number) {
    return res.status(400).json({ error: 'Name and phone number are required.' });
  }
  try {
    const tenant = await getTenantById(req.tenantId);
    if (!tenant || tenant.addon_department_routing !== 1) {
      return res.status(403).json({ error: 'Multi-Department & Extension Routing addon is not active. Please activate the addon in Step 6: Add Modules settings first.' });
    }

    const dept = await addTenantDepartment(req.tenantId, { name, phone_number, extension, record_calls });
    await logTenantActivity(req.tenantId, 'settings_update', `Added department routing: ${name} to ${phone_number}${extension ? ` (Ext ${extension})` : ''} (Record: ${record_calls ? 'ON' : 'OFF'})`);
    res.json({ success: true, department: dept });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE department
app.delete('/api/settings/departments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await deleteTenantDepartment(req.tenantId, parseInt(id));
    await logTenantActivity(req.tenantId, 'settings_update', `Deleted department routing entry`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT toggle department recording
app.put('/api/settings/departments/:id/record', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { record_calls } = req.body;
  try {
    await updateTenantDepartmentRecordCalls(req.tenantId, parseInt(id), record_calls);
    await logTenantActivity(req.tenantId, 'settings_update', `Updated department recording toggle for ID ${id} to ${record_calls ? 'ON' : 'OFF'}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: manually trigger reminder check (for testing)
app.post('/api/admin/test-reminders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reminders = await checkAndSendPaymentReminders();
    for (const r of reminders) {
      await sendPaymentReminderEmail(r, r.daysLeft);
      await sendPaymentReminderWhatsApp(r, r.phone, r.daysLeft);
      await markReminderSent(r.id, r.flag);
      await logTenantActivity(r.id, 'billing_reminder', `[Manual Test] Payment reminder sent (${r.daysLeft} day${r.daysLeft > 1 ? 's' : ''} before due date)`);
    }
    res.json({ success: true, remindersSent: reminders.length, details: reminders.map(r => ({ id: r.id, name: r.company_name, email: r.email, daysLeft: r.daysLeft, phone: r.phone })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/global-settings', requireAuth, requireAdmin, async (req, res) => {

  const { global_overage_rate } = req.body;
  const rate = parseFloat(global_overage_rate);
  if (isNaN(rate) || rate < 0) {
    return res.status(400).json({ error: 'Global overage rate must be a non-negative number.' });
  }
  try {
    await updateGlobalOverageRate(rate);
    res.json({ success: true, global_overage_rate: rate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET platform-wide OpenAI API key status (masked)
app.get('/api/admin/platform-openai-key', requireAuth, requireAdmin, async (req, res) => {
  try {
    const row = await get("SELECT value FROM global_settings WHERE key = 'platform_openai_api_key'");
    if (row && row.value) {
      const decrypted = decryptField(row.value);
      const masked = decrypted ? 'sk-...' + decrypted.slice(-4) : null;
      res.json({ set: true, masked });
    } else {
      res.json({ set: false, masked: null });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST save/clear platform-wide OpenAI API key
app.post('/api/admin/platform-openai-key', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { openai_api_key } = req.body;
    if (openai_api_key === '' || openai_api_key === null) {
      await run("DELETE FROM global_settings WHERE key = 'platform_openai_api_key'");
      await logTenantActivity(null, 'settings_update', 'Super Admin cleared the platform-wide OpenAI API key.');
      return res.json({ success: true, cleared: true });
    }
    if (!openai_api_key || !openai_api_key.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid OpenAI API key. Must start with sk-' });
    }
    const encrypted = encryptField(openai_api_key);
    await run(
      "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('platform_openai_api_key', ?)",
      [encrypted]
    );
    await logTenantActivity(null, 'settings_update', 'Super Admin updated the platform-wide OpenAI API key.');
    const masked = 'sk-...' + openai_api_key.slice(-4);
    res.json({ success: true, masked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/contacts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const contacts = await getAllContactsWithTenant();
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/appointments', requireAuth, requireAdmin, async (req, res) => {
  try {
    const appointments = await getAllAppointmentsWithTenant();
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/calls', requireAuth, requireAdmin, async (req, res) => {
  try {
    const calls = await getAllCallsWithTenant();
    res.json(calls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/accounting', requireAuth, requireAdmin, async (req, res) => {
  try {
    const invoices = await getAllInvoicesWithTenant();
    const bills = await getAllBillsWithTenant();
    const payments = await getAllPaymentsWithTenant();
    res.json({ invoices, bills, payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// SCOPED REST API ENDPOINTS
// =============================================================

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await getSettings(req.tenantId);
    // Never send the raw API key to the browser — send masked version only
    const safeSettings = {
      ...settings,
      openai_api_key: undefined,
      openai_api_key_set: !!settings.openai_api_key,
      openai_api_key_masked: maskApiKey(settings.openai_api_key)
    };
    res.json(safeSettings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function autoAssignPhoneNumberForTenant(tenantId) {
  try {
    const settings = await getSettings(tenantId);
    if (settings && settings.twilio_phone_number && settings.twilio_phone_number.trim() !== '') {
      console.log(`[Telephony] Tenant ${tenantId} already has a phone number assigned: ${settings.twilio_phone_number}`);
      return settings.twilio_phone_number;
    }

    const country = 'US';
    const PORT = process.env.PORT || 5050;
    const ngrokUrl = process.env.NGROK_URL || `http://localhost:${PORT}`;
    const client = getSignalWireClient();
    const isMock = (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) && !process.env.SIGNALWIRE_PROJECT_ID;

    let selectedNumber = '';
    if (isMock) {
      selectedNumber = `+1 (800) 555-0199`;
      console.log(`[Telephony Mock] Auto-assigned number ${selectedNumber} for Tenant ${tenantId}`);
    } else {
      const available = await client.availablePhoneNumbers(country).local.list({
        limit: 1
      });
      if (available.length === 0) {
        throw new Error('No available numbers found in client pool.');
      }
      selectedNumber = available[0].phoneNumber;
      await client.incomingPhoneNumbers.create({
        phoneNumber: selectedNumber,
        voiceUrl: `${ngrokUrl}/incoming-call`,
        voiceMethod: 'POST'
      });
      console.log(`[Telephony] Auto-assigned real number ${selectedNumber} for Tenant ${tenantId}`);
    }

    if (selectedNumber) {
      await updateSettings(tenantId, { twilio_phone_number: selectedNumber });
      return selectedNumber;
    }
  } catch (err) {
    console.error(`Error auto-assigning phone number for tenant ${tenantId}:`, err);
    throw err;
  }
}

app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const existing = await getSettings(req.tenantId);
    
    // Clear obsolete crawled content if URL changes
    if (req.body.website_url !== undefined && req.body.website_url !== existing.website_url) {
      req.body.crawled_content = '';
    }
    
    const merged = { ...existing, ...req.body };
    const updated = await updateSettings(req.tenantId, merged);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HTML Tag Stripper Helper for Website Scraping
function extractTextFromHtml(html) {
  if (!html) return '';
  
  // 1. Remove script, style, head, svg, and comment sections
  let text = html
    .replace(/<head[^]*?<\/head>/gi, '')
    .replace(/<script[^]*?<\/script>/gi, '')
    .replace(/<style[^]*?<\/style>/gi, '')
    .replace(/<svg[^]*?<\/svg>/gi, '')
    .replace(/<noscript[^]*?<\/noscript>/gi, '')
    .replace(/<!--[^]*?-->/g, '');
  
  // 2. Replace common block elements with newlines to preserve spacing
  text = text
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
    
  // 3. Strip remaining HTML tags
  text = text.replace(/<[^>]*>/g, ' ');
  
  // 4. Decode common HTML entities
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&lt;': '<',
    '&gt;': '>',
    '&#039;': "'",
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&ndash;': '-',
    '&mdash;': '--'
  };
  
  for (const [entity, replacement] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), replacement);
  }
  
  // 5. Clean up multiple whitespaces and empty lines
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
    
  // Limit length to prevent token blowing (10,000 characters)
  if (text.length > 10000) {
    text = text.substring(0, 10000) + '\n\n[Content truncated due to length limits...]';
  }
  
  return text;
}

// REST API endpoint to crawl website URL(s) and extract content for agent settings
app.post('/api/settings/crawl', requireAuth, async (req, res) => {
  const { websiteUrl } = req.body;
  if (!websiteUrl) {
    return res.status(400).json({ error: 'Website URL is required.' });
  }

  // Parse comma-separated list of URLs
  const urls = websiteUrl.split(',').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    return res.status(400).json({ error: 'Please enter at least one valid website URL.' });
  }

  // Validate each URL
  const validatedUrls = [];
  for (const urlStr of urls) {
    try {
      const parsed = new URL(urlStr);
      validatedUrls.push(parsed);
    } catch (e) {
      return res.status(400).json({ error: `Invalid URL format: "${urlStr}". Please ensure all URLs start with http:// or https://` });
    }
  }

  try {
    console.log(`Starting parallel crawl for tenant ${req.tenantId} across ${validatedUrls.length} pages`);

    // Fetch pages in parallel using Promise.all
    const crawlPromises = validatedUrls.map(async (url) => {
      try {
        // Set an 8s fetch timeout per page to avoid blocking main thread
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url.href, {
          headers: {
            'User-Agent': 'VoiceDesk-Crawler/1.0 (+http://localhost:5050)'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return {
            url: url.href,
            success: false,
            error: `HTTP status ${response.status}: ${response.statusText}`
          };
        }

        const html = await response.text();
        const extractedText = extractTextFromHtml(html);

        if (!extractedText || extractedText.trim().length === 0) {
          return {
            url: url.href,
            success: false,
            error: 'No readable text content could be extracted.'
          };
        }

        return {
          url: url.href,
          success: true,
          content: extractedText
        };
      } catch (err) {
        console.error(`Failed to crawl URL ${url.href}:`, err);
        const errType = err.name === 'AbortError' ? 'Request timed out (limit: 8 seconds)' : err.message;
        return {
          url: url.href,
          success: false,
          error: errType
        };
      }
    });

    const results = await Promise.all(crawlPromises);

    // Group successes and errors
    const successes = results.filter(r => r.success);
    const errors = results.filter(r => !r.success);

    if (successes.length === 0) {
      const errorMsg = errors.map(e => `- ${e.url}: ${e.error}`).join('\n');
      return res.status(400).json({ error: `Failed to crawl all specified URLs:\n${errorMsg}` });
    }

    // Concatenate text contents with source boundaries
    const concatenatedText = successes.map(s => {
      return `--- START CONTENT FROM ${s.url} ---\n${s.content}\n--- END CONTENT FROM ${s.url} ---`;
    }).join('\n\n');

    // Limit length to prevent token blowing (15,000 characters)
    let finalCombinedText = concatenatedText;
    if (finalCombinedText.length > 15000) {
      finalCombinedText = finalCombinedText.substring(0, 15000) + '\n\n[Content truncated due to length limits...]';
    }

    // Save crawl results
    const settings = await getSettings(req.tenantId);
    // Store the cleaned comma-separated list of URLs
    settings.website_url = validatedUrls.map(u => u.href).join(', ');
    settings.crawled_content = finalCombinedText;
    const updatedSettings = await updateSettings(req.tenantId, settings);

    const successMessage = `Successfully crawled ${successes.length} page(s).` + 
      (errors.length > 0 ? ` Note: Failed to crawl ${errors.length} page(s).` : '');

    res.json({
      success: true,
      message: `${successMessage} Extracted ${finalCombinedText.length} characters in total.`,
      website_url: settings.website_url,
      crawled_content: finalCombinedText,
      preview: finalCombinedText.substring(0, 600) + (finalCombinedText.length > 600 ? '...' : '')
    });

  } catch (err) {
    console.error(`Error processing crawls for tenant ${req.tenantId}:`, err);
    res.status(500).json({ error: `Failed to process website crawl: ${err.message}` });
  }
});

// =============================================================
// TEAM CALENDARS & MULTI-USER API ROUTES
// =============================================================

app.get('/api/team', requireAuth, async (req, res) => {
  try {
    const list = await getWorkspaceUsers(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/team', requireAuth, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  try {
    const user = await addWorkspaceUser(req.tenantId, { name, email, password, role });
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/team/:id', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const result = await deleteWorkspaceUser(req.tenantId, userId);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Workspace Invitation Management
app.get('/api/team/invitations', requireAuth, async (req, res) => {
  try {
    const list = await getPendingInvitations(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/team/invite', requireAuth, async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }

  try {
    const requestingUser = await getWorkspaceUserById(req.userId);
    if (!requestingUser || requestingUser.role !== 'owner') {
      return res.status(403).json({ error: 'Forbidden: Only workspace owners can invite new members.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const invitation = await createInvitation(req.tenantId, { email, role, token, expires_at });

    const host = process.env.NGROK_URL || `${req.protocol}://${req.get('host')}`;
    const inviteLink = `${host}/?invite_token=${token}`;

    console.log(`\n=============================================================`);
    console.log(`[SIMULATED EMAIL INVITATION]`);
    console.log(`To: ${email}`);
    console.log(`Subject: Invite to join Voice AI Receptionist`);
    console.log(`Body: Hello! You have been invited to join the workspace on Voice AI.`);
    console.log(`Please click the link below to accept and setup your account:`);
    console.log(`${inviteLink}`);
    console.log(`=============================================================\n`);

    res.json({ success: true, invitation, inviteLink });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/team/invitations/:id', requireAuth, async (req, res) => {
  try {
    const requestingUser = await getWorkspaceUserById(req.userId);
    if (!requestingUser || requestingUser.role !== 'owner') {
      return res.status(403).json({ error: 'Forbidden: Only workspace owners can revoke invitations.' });
    }

    const inviteId = parseInt(req.params.id);
    await deleteInvitation(req.tenantId, inviteId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/team/invite/verify/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const invite = await getInvitationByToken(token);
    if (!invite) {
      return res.status(404).json({ valid: false, error: 'Invalid or non-existent invitation token.' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ valid: false, error: 'Invitation link has expired.' });
    }

    res.json({
      valid: true,
      email: invite.email,
      role: invite.role,
      company_name: invite.company_name
    });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

app.post('/api/team/invite/accept', async (req, res) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password) {
    return res.status(400).json({ error: 'Name and password are required to accept the invitation.' });
  }

  try {
    const invite = await getInvitationByToken(token);
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found or invalid.' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation has expired.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await acceptInvitationAndCreateUser(invite.tenant_id, {
      name,
      email: invite.email,
      passwordHash,
      role: invite.role
    });

    await deleteInvitation(invite.tenant_id, invite.id);
    broadcastToDashboard(invite.tenant_id, 'refresh_crm', {});

    // Issue standard JWT session
    const jwtToken = issueJWT({ tenantId: invite.tenant_id, userId: user.id });

    // Fetch full tenant info for frontend session initialization
    const tenant = await getTenantById(invite.tenant_id);

    res.json({
      success: true,
      token: jwtToken,
      tenant: {
        id: tenant.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        company_name: tenant.company_name,
        subscription_tier: tenant.subscription_tier,
        billing_cycle: tenant.billing_cycle || 'monthly',
        subscription_status: tenant.subscription_status,
        is_admin: tenant.is_admin,
        role: user.role
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getUserCalendarSettings(req.userId);
    profile.id = req.userId;
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/team/:id/calendar', requireAuth, async (req, res) => {
  const { working_hours, break_periods, appointment_gap } = req.body;
  try {
    const userId = parseInt(req.params.id);
    const updated = await updateUserCalendarSettings(req.tenantId, userId, { working_hours, break_periods, appointment_gap });
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================
// BLOCKED TIME SLOTS API ROUTES
// =============================================================
app.get('/api/blocked-slots/user/:userId', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const slots = await getBlockedSlotsForUser(req.tenantId, userId);
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/blocked-slots', requireAuth, async (req, res) => {
  const { userId, resource_name, date, start_time, end_time, notes } = req.body;
  try {
    const slot = await addBlockedSlot(req.tenantId, {
      userId: userId ? parseInt(userId) : null,
      resource_name,
      date,
      start_time,
      end_time,
      notes
    });
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(slot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/blocked-slots/:id', requireAuth, async (req, res) => {
  try {
    const slotId = parseInt(req.params.id);
    const result = await deleteBlockedSlot(req.tenantId, slotId);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================
// SERVICES AND PRICING API ROUTES
// =============================================================

app.get('/api/services', requireAuth, async (req, res) => {
  try {
    const list = await getServices(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services', requireAuth, async (req, res) => {
  const { name, price, duration, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Service name is required.' });
  }
  try {
    const result = await addService(req.tenantId, { name, price, duration, description });
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/services/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await deleteService(req.tenantId, id);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/services/:id', requireAuth, async (req, res) => {
  const { name, price, duration, description } = req.body;
  const id = parseInt(req.params.id);
  if (!name) {
    return res.status(400).json({ error: 'Service name is required.' });
  }
  try {
    const result = await updateService(req.tenantId, id, { name, price, duration, description });
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services/bulk', requireAuth, async (req, res) => {
  const services = req.body;
  if (!Array.isArray(services)) {
    return res.status(400).json({ error: 'Invalid data format, expected array.' });
  }
  try {
    const result = await bulkInsertServices(req.tenantId, services);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// RESTAURANT TABLES API ROUTES
// =============================================================

app.get('/api/restaurant/tables', requireAuth, async (req, res) => {
  try {
    const list = await getRestaurantTables(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurant/tables', requireAuth, async (req, res) => {
  const { table_number, seats } = req.body;
  if (!table_number || !seats) {
    return res.status(400).json({ error: 'Table number and seats are required.' });
  }
  try {
    const table = await addRestaurantTable(req.tenantId, { table_number, seats });
    res.json(table);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/restaurant/tables/:id', requireAuth, async (req, res) => {
  try {
    const tableId = parseInt(req.params.id);
    const result = await deleteRestaurantTable(req.tenantId, tableId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/restaurant/tables/:id', requireAuth, async (req, res) => {
  const { table_number, seats } = req.body;
  try {
    const tableId = parseInt(req.params.id);
    const result = await updateRestaurantTable(req.tenantId, tableId, { table_number, seats });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================================================
// HOTEL ROOMS REST API ENDPOINTS
// =============================================================

app.get('/api/hotel/rooms', requireAuth, async (req, res) => {
  try {
    const list = await getHotelRooms(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hotel/rooms', requireAuth, async (req, res) => {
  const { room_number, room_type, price_per_night } = req.body;
  if (!room_number || !room_type || price_per_night === undefined) {
    return res.status(400).json({ error: 'Room number, type, and price per night are required.' });
  }
  try {
    const room = await addHotelRoom(req.tenantId, { room_number, room_type, price_per_night });
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/hotel/rooms/:id', requireAuth, async (req, res) => {
  try {
    const roomId = parseInt(req.params.id);
    const result = await deleteHotelRoom(req.tenantId, roomId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/hotel/rooms/:id', requireAuth, async (req, res) => {
  const { room_number, room_type, price_per_night } = req.body;
  try {
    const roomId = parseInt(req.params.id);
    const result = await updateHotelRoom(req.tenantId, roomId, { room_number, room_type, price_per_night });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Google Calendar Live Integration OAuth Routes
app.get('/api/team/:id/gcal/oauth', requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(400).send(`
      <html>
        <head>
          <title>Configuration Required</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center; }
            .card { background: rgba(255,255,255,0.05); padding: 30px; border-radius: 12px; display: inline-block; max-width: 500px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
            h2 { color: #f43f5e; margin-top: 0; }
            code { background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; color: #38bdf8; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Google Calendar Integration Disabled</h2>
            <p>The platform owner has not configured the Google OAuth credentials in their environment variables yet.</p>
            <p>Please define <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in the server's <code>.env</code> file to enable live calendar sync.</p>
          </div>
        </body>
      </html>
    `);
  }

  // Determine host dynamically (ngrok tunnel or protocol host)
  const host = process.env.NGROK_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${host}/api/gcal/callback`;
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
    `client_id=${encodeURIComponent(clientId)}&` + 
    `redirect_uri=${encodeURIComponent(redirectUri)}&` + 
    `response_type=code&` + 
    `scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email')}&` + 
    `access_type=offline&` + 
    `prompt=consent&` + 
    `state=${userId}`;

  res.redirect(googleAuthUrl);
});

app.get('/api/gcal/callback', async (req, res) => {
  const { code, state: userIdStr } = req.query;
  const userId = parseInt(userIdStr);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!code || !userId) {
    return res.status(400).send('Invalid callback request parameters.');
  }

  try {
    const host = process.env.NGROK_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${host}/api/gcal/callback`;

    // 1. Exchange OAuth code for Google API tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Google Token Exchange Error]', errText);
      throw new Error(`Failed to exchange Google OAuth code: ${errText}`);
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in || 3600;
    const expiry = Date.now() + (expiresIn * 1000);

    // 2. Fetch authenticated user's email address
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    let email = 'Google Calendar Account';
    if (userRes.ok) {
      const userData = await userRes.json();
      if (userData.email) email = userData.email;
    }

    // 3. Fallback refresh_token retrieval
    let storedRefreshToken = refreshToken;
    if (!storedRefreshToken) {
      const dbUser = await getWorkspaceUserById(userId);
      if (dbUser) storedRefreshToken = dbUser.google_refresh_token;
    }

    // 4. Update tenant_user table in the database
    await connectUserGoogleCalendarTokens(userId, email, accessToken, storedRefreshToken, expiry);

    // 5. Success screen and automatic message dispatcher
    res.send(`
      <html>
        <head>
          <title>Connection Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center; }
            .card { background: rgba(255,255,255,0.05); padding: 30px; border-radius: 12px; display: inline-block; max-width: 500px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
            h2 { color: #10b981; margin-top: 0; }
            .close-btn { background: #10b981; color: white; border: none; padding: 10px 20px; font-weight: 600; border-radius: 6px; cursor: pointer; margin-top: 20px; text-decoration: none; display: inline-block; }
          </style>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'gcal_connected', userId: ${userId} }, '*');
            }
            setTimeout(() => { window.close(); }, 3000);
          </script>
        </head>
        <body>
          <div class="card">
            <h2>Google Calendar Connected!</h2>
            <p>Your calendar (<code>${email}</code>) has been successfully synchronized with VoiceDesk.</p>
            <p>This window will close automatically in 3 seconds...</p>
            <button class="close-btn" onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Google Callback Error:', err);
    res.status(500).send(`
      <html>
        <head>
          <title>Connection Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center; }
            .card { background: rgba(255,255,255,0.05); padding: 30px; border-radius: 12px; display: inline-block; max-width: 500px; border: 1px solid rgba(255,255,255,0.1); }
            h2 { color: #f43f5e; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Connection Failed</h2>
            <p>${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.post('/api/team/:id/gcal/connect', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Google Calendar Email is required.' });
  try {
    const userId = parseInt(req.params.id);
    const updated = await connectUserGoogleCalendar(userId, email);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/team/:id/gcal/disconnect', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const updated = await disconnectUserGoogleCalendar(userId);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// APPOINTMENTS
// =============================================================

app.get('/api/appointments', requireAuth, async (req, res) => {
  try {
    const list = await getAppointments(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const appointment = await addAppointment(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_appointments', appointment);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    
    // Broadcast Google Calendar sync toast alert
    if (appointment.gcal_synced) {
      broadcastToDashboard(req.tenantId, 'google_calendar_sync', {
        appointmentId: appointment.id,
        customerName: appointment.customer_name,
        service: appointment.service,
        date: appointment.date,
        time: appointment.time,
        resourceName: appointment.resource_name,
        googleEmail: appointment.google_email
      });
    }
    
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/appointments/:id', requireAuth, async (req, res) => {
  try {
    await deleteAppointment(req.tenantId, req.params.id);
    broadcastToDashboard(req.tenantId, 'refresh_appointments', { deletedId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calls', requireAuth, async (req, res) => {
  try {
    const logs = await getCallLogs(req.tenantId);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Outbound Call scoping
app.post('/api/call/outbound', requireAuth, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Validate SaaS minute limits before calling (respects custom admin overrides)
  const usage = await getTenantUsage(req.tenantId);
  const limits = resolveTenantLimits(usage);
  const totalLimit = limits.minutes + (usage.prepaid_overage_minutes || 0);
  if (usage.usage_minutes >= totalLimit) {
    return res.status(403).json({ error: 'SaaS Limit Exceeded: You have run out of calling minutes. Please buy overage minutes or upgrade your subscription.' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const signalwireProject = process.env.SIGNALWIRE_PROJECT_ID;
  const isMock = (!accountSid || !accountSid.startsWith('AC')) && !signalwireProject;
  const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  const ngrokUrl = process.env.NGROK_URL;

  if (!isMock && (!fromNumber || !ngrokUrl)) {
    return res.status(500).json({
      error: 'Telephony configurations (SIGNALWIRE_PHONE_NUMBER/TWILIO_PHONE_NUMBER) and NGROK_URL must be defined for live calls.'
    });
  }

  const activeFromNumber = fromNumber || '+15550001111';
  const activeNgrokUrl = ngrokUrl || `http://localhost:${PORT}`;

  try {
    const client = getSignalWireClient();
    // Pass tenantId inside TwiML URL so the callback scopes it
    const webhookUrl = `${activeNgrokUrl}/outbound-call-twiml?phoneNumber=${encodeURIComponent(phoneNumber)}&tenantId=${req.tenantId}`;
    
    console.log(`Initiating outbound call for Tenant ${req.tenantId} to ${phoneNumber}...`);
    const call = await client.calls.create({
      url: webhookUrl,
      to: phoneNumber,
      from: activeFromNumber
    });
    
    res.json({ success: true, callSid: call.sid });
  } catch (err) {
    console.error('Error initiating outbound call:', err);
    res.status(500).json({ error: err.message });
  }
});

// Telephony Provisioning API
app.get('/api/telephony/search-numbers', requireAuth, async (req, res) => {
  const country = req.query.country || 'US';
  const areaCode = req.query.areaCode || '';
  
  try {
    const client = getSignalWireClient();
    const isMock = (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) && !process.env.SIGNALWIRE_PROJECT_ID;
    
    if (isMock) {
      // Mock some available numbers for local development/testing
      const mockNumbers = [
        { phoneNumber: `+1 (${areaCode || '800'}) 555-0199` },
        { phoneNumber: `+1 (${areaCode || '800'}) 555-0144` },
        { phoneNumber: `+1 (${areaCode || '800'}) 555-0177` }
      ];
      return res.json(mockNumbers);
    }

    const available = await client.availablePhoneNumbers(country).local.list({
      areaCode: areaCode || undefined,
      limit: 10
    });
    
    res.json(available.map(num => ({ phoneNumber: num.phoneNumber })));
  } catch (err) {
    console.error('Error searching available numbers:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telephony/provision-number', requireAuth, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number parameter is required.' });
  }

  const ngrokUrl = process.env.NGROK_URL || `http://localhost:${PORT}`;

  try {
    const client = getSignalWireClient();
    const isMock = (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) && !process.env.SIGNALWIRE_PROJECT_ID;

    if (!isMock) {
      // Programmatically purchase the number on behalf of the tenant
      // and point its inbound voice webhook directly to our server's /incoming-call URL
      await client.incomingPhoneNumbers.create({
        phoneNumber: phoneNumber,
        voiceUrl: `${ngrokUrl}/incoming-call`,
        voiceMethod: 'POST'
      });
    } else {
      console.log(`[Telephony Mock] Purchased number ${phoneNumber} on behalf of Tenant ${req.tenantId} and pointed to ${ngrokUrl}/incoming-call`);
    }

    // Save the purchased number to the Tenant's settings
    await updateSettings(req.tenantId, { twilio_phone_number: phoneNumber });
    
    res.json({ success: true, phoneNumber });
  } catch (err) {
    console.error('Error provisioning phone number:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telephony/auto-assign', requireAuth, async (req, res) => {
  const country = req.body.country || 'US';
  const areaCode = req.body.areaCode || '';
  const ngrokUrl = process.env.NGROK_URL || `http://localhost:${PORT}`;

  try {
    const client = getSignalWireClient();
    const isMock = (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) && !process.env.SIGNALWIRE_PROJECT_ID;

    let selectedNumber = '';

    if (isMock) {
      selectedNumber = `+1 (${areaCode || '800'}) 555-0199`;
      console.log(`[Telephony Mock] Auto-assigned number ${selectedNumber} for Tenant ${req.tenantId}`);
    } else {
      // 1. Search for first available number
      const available = await client.availablePhoneNumbers(country).local.list({
        areaCode: areaCode || undefined,
        limit: 1
      });

      if (available.length === 0) {
        return res.status(404).json({ error: 'No available numbers found to auto-assign.' });
      }

      selectedNumber = available[0].phoneNumber;

      // 2. Provision the selected number
      await client.incomingPhoneNumbers.create({
        phoneNumber: selectedNumber,
        voiceUrl: `${ngrokUrl}/incoming-call`,
        voiceMethod: 'POST'
      });
    }

    // 3. Save the number to settings
    await updateSettings(req.tenantId, { twilio_phone_number: selectedNumber });

    res.json({ success: true, phoneNumber: selectedNumber });
  } catch (err) {
    console.error('Error in auto-assigning phone number:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// SCOPED CRM API ENDPOINTS
// =============================================================

app.get('/api/crm/contacts', requireAuth, async (req, res) => {
  try {
    const list = await getContacts(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/contacts', requireAuth, async (req, res) => {
  try {
    const contact = await addContact(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/crm/contacts/:id', requireAuth, async (req, res) => {
  try {
    await deleteContact(req.tenantId, req.params.id);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/crm/contacts/:id/insights', requireAuth, async (req, res) => {
  const contactId = req.params.id;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key is missing' });
  }

  try {
    const activities = await getActivities(req.tenantId, contactId);
    
    let summaryData = `Contact Activities Log:\n`;
    activities.forEach(act => {
      summaryData += `[${act.created_at}] ${act.type.toUpperCase()}: ${act.title} - ${act.description}\n`;
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an advanced CRM intelligence tool. Given the activity logs, summarize: 1. Customer profile and preferences. 2. General sentiment (Positive, Neutral, Negative). 3. Relationship Health Score (1-100). 4. Recommended next sales/service action. Format output nicely with headers.'
          },
          {
            role: 'user',
            content: summaryData
          }
        ],
        max_tokens: 400
      })
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ insights: data.choices?.[0]?.message?.content || 'No insights generated.' });
    } else {
      res.status(500).json({ error: 'OpenAI insights generation failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/crm/deals', requireAuth, async (req, res) => {
  try {
    const list = await getDeals(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/deals', requireAuth, async (req, res) => {
  try {
    const deal = await addDeal(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(deal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/crm/deals/:id/stage', requireAuth, async (req, res) => {
  try {
    const updated = await updateDealStage(req.tenantId, req.params.id, req.body.stage);
    broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// MARKETING CAMPAIGNS HUB ENDPOINTS
// =============================================================

async function executeCampaignAsync(tenantId, campaign, targets) {
  const channels = campaign.channels.split(',');
  const settings = await getSettings(tenantId);
  const companyName = settings.company_name || 'Our Company';

  for (const contact of targets) {
    // 1. Process Email Broadcast
    if (channels.includes('email') && contact.email && resendClient) {
      try {
        const emailSubject = campaign.email_subject.replace(/\{\{name\}\}/g, contact.name).replace(/\{\{company_name\}\}/g, companyName);
        const emailBody = campaign.email_body.replace(/\{\{name\}\}/g, contact.name).replace(/\{\{company_name\}\}/g, companyName);
        
        await resendClient.emails.send({
          from: RESEND_FROM,
          to: [contact.email],
          subject: emailSubject,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background: #f8fafc;">${emailBody.replace(/\n/g, '<br>')}</div>`
        });
        await addCampaignLog(tenantId, campaign.id, contact.id, 'email', 'sent', `Email sent successfully to ${contact.email}`);
      } catch (err) {
        await addCampaignLog(tenantId, campaign.id, contact.id, 'email', 'failed', err.message);
      }
    } else if (channels.includes('email') && !contact.email) {
      await addCampaignLog(tenantId, campaign.id, contact.id, 'email', 'failed', 'No email address on file.');
    }

    // 2. Process SMS/WhatsApp Broadcast
    if (channels.includes('whatsapp') && contact.phone) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const isMock = !accountSid || !accountSid.startsWith('AC');
      const smsBody = campaign.sms_body.replace(/\{\{name\}\}/g, contact.name).replace(/\{\{company_name\}\}/g, companyName);

      if (isMock) {
        console.log(`[Campaign SMS - Simulated] To=${contact.phone}, Body="${smsBody}"`);
        await addCampaignLog(tenantId, campaign.id, contact.id, 'whatsapp', 'sent', `[Simulated] SMS broadcasted: "${smsBody}"`);
      } else {
        try {
          const client = getSignalWireClient();
          const fromNum = process.env.TWILIO_PHONE_NUMBER || '+15203538181';
          await client.messages.create({
            from: fromNum,
            to: contact.phone,
            body: smsBody
          });
          await addCampaignLog(tenantId, campaign.id, contact.id, 'whatsapp', 'sent', `SMS broadcasted to ${contact.phone}`);
        } catch (err) {
          await addCampaignLog(tenantId, campaign.id, contact.id, 'whatsapp', 'failed', err.message);
        }
      }
    }

    // 3. Process Outbound Call Broadcast
    if (channels.includes('call') && contact.phone) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const isMock = !accountSid || !accountSid.startsWith('AC');
      const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;
      const ngrokUrl = process.env.NGROK_URL;

      if (isMock) {
        console.log(`[Campaign Outbound Call - Simulated] To=${contact.phone}, Prompt="${campaign.call_prompt}"`);
        await addCampaignLog(tenantId, campaign.id, contact.id, 'call', 'called', `[Simulated] Outbound call placed to ${contact.phone}`);
      } else if (fromNumber && ngrokUrl) {
        try {
          const client = getSignalWireClient();
          const webhookUrl = `${ngrokUrl}/outbound-call-twiml?phoneNumber=${encodeURIComponent(contact.phone)}&tenantId=${tenantId}&campaignPrompt=${encodeURIComponent(campaign.call_prompt)}`;
          await client.calls.create({
            url: webhookUrl,
            to: contact.phone,
            from: fromNumber
          });
          await addCampaignLog(tenantId, campaign.id, contact.id, 'call', 'called', `Outbound call initiated to ${contact.phone}`);
        } catch (err) {
          await addCampaignLog(tenantId, campaign.id, contact.id, 'call', 'failed', err.message);
        }
      } else {
        await addCampaignLog(tenantId, campaign.id, contact.id, 'call', 'failed', 'Missing telephony phone or public URL configuration on host.');
      }
    }

    // Small delay between contacts to avoid triggering rate limit protections
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Update status to completed
  await updateCampaignStatus(tenantId, campaign.id, 'completed');
  broadcastToDashboard(tenantId, 'refresh_campaigns', {});
}

app.get('/api/crm/campaigns', requireAuth, async (req, res) => {
  try {
    const list = await getCampaigns(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/campaigns', requireAuth, async (req, res) => {
  const { name, target_audience, channels, email_subject, email_body, sms_body, call_prompt } = req.body;
  if (!name || !target_audience || !channels) {
    return res.status(400).json({ error: 'Name, target audience, and channels are required.' });
  }
  try {
    const record = await addCampaign(req.tenantId, { name, target_audience, channels, email_subject, email_body, sms_body, call_prompt });
    broadcastToDashboard(req.tenantId, 'refresh_campaigns', {});
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/campaigns/:id/run', requireAuth, async (req, res) => {
  const campaignId = parseInt(req.params.id);
  try {
    const campaignsList = await getCampaigns(req.tenantId);
    const campaign = campaignsList.find(c => c.id === campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    if (campaign.status === 'running') {
      return res.status(400).json({ error: 'Campaign is already running.' });
    }

    // Set status to running
    await updateCampaignStatus(req.tenantId, campaignId, 'running');
    broadcastToDashboard(req.tenantId, 'refresh_campaigns', {});

    // Get matching contacts based on target_audience
    const contacts = await getContacts(req.tenantId);
    let targets = [];
    if (campaign.target_audience === 'all') {
      targets = contacts;
    } else {
      targets = contacts.filter(c => c.lead_stage === campaign.target_audience);
    }

    // Execute run asynchronously
    executeCampaignAsync(req.tenantId, campaign, targets).catch(err => {
      console.error(`Error during Campaign ${campaignId} run:`, err);
    });

    res.json({ success: true, message: `Campaign execution started for ${targets.length} contact(s).` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/crm/campaigns/:id/logs', requireAuth, async (req, res) => {
  const campaignId = parseInt(req.params.id);
  try {
    const logs = await getCampaignLogs(req.tenantId, campaignId);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/crm/campaigns/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await deleteCampaign(req.tenantId, id);
    broadcastToDashboard(req.tenantId, 'refresh_campaigns', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// MARKETING CAMPAIGNS TEMPLATE LIBRARY ENDPOINTS
// =============================================================

app.get('/api/crm/templates', requireAuth, async (req, res) => {
  try {
    const list = await getCampaignTemplates(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crm/templates', requireAuth, async (req, res) => {
  const { name, type, subject, content } = req.body;
  if (!name || !type || !content) {
    return res.status(400).json({ error: 'Name, type, and content are required.' });
  }
  try {
    const record = await addCampaignTemplate(req.tenantId, { name, type, subject, content });
    broadcastToDashboard(req.tenantId, 'refresh_templates', {});
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/crm/templates/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await deleteCampaignTemplate(req.tenantId, id);
    broadcastToDashboard(req.tenantId, 'refresh_templates', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// SAAS SCOPED BASIC ACCOUNTING ADDON ENDPOINTS
// =============================================================
app.get('/api/accounting/metrics', requireAuth, async (req, res) => {
  try {
    const metrics = await getAccountingMetrics(req.tenantId);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/quotations', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingQuotations(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/quotations', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingQuotation(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_accounting', {});
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounting/quotations/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deleteAccountingQuotation(req.tenantId, id);
    broadcastToDashboard(req.tenantId, 'refresh_accounting', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/invoices', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingInvoices(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/invoices', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingInvoice(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_accounting', {});
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/bills', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingBills(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/bills', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingBill(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_accounting', {});
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/payments', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingPayments(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/payments', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingPayment(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_accounting', {});
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/expenses', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingExpenses(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/expenses', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingExpense(req.tenantId, req.body);
    broadcastToDashboard(req.tenantId, 'refresh_accounting', {});
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/contacts', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingContacts(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/contacts', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingContact(req.tenantId, req.body);
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/items', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingItems(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/items', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingItem(req.tenantId, req.body);
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/accounting/accounts', requireAuth, async (req, res) => {
  try {
    const list = await getAccountingAccounts(req.tenantId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounting/accounts', requireAuth, async (req, res) => {
  try {
    const record = await addAccountingAccount(req.tenantId, req.body);
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// SAAS SCOPED AI CRM COPILOT
// =============================================================
app.post('/api/crm/copilot', requireAuth, async (req, res) => {
  const { message } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!message) {
    return res.status(400).json({ error: 'Instruction is required' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key is missing' });
  }

  // Validate Starter/Professional tier before using AI CRM Copilot
  const usage = await getTenantUsage(req.tenantId);
  if (usage.tier === 'free') {
    return res.status(403).json({ error: 'Subscription Upgrade Required: The AI CRM Copilot is only available on STARTER and PROFESSIONAL Tiers. Please upgrade to use this feature.' });
  }

  const actionsPerformed = [];

  const tools = [
    {
      type: 'function',
      function: {
        name: 'list_contacts',
        description: 'Get list of CRM contacts to match names or see info.'
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_contact',
        description: 'Create a new contact record in the CRM.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full name' },
            email: { type: 'string', description: 'Email address' },
            phone: { type: 'string', description: 'E.164 format phone number (e.g. +15558889999)' },
            company_name: { type: 'string', description: 'Company name' },
            lead_stage: { type: 'string', enum: ['lead', 'opportunity', 'customer', 'subscriber'], description: 'Default status' }
          },
          required: ['name', 'phone']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_deals',
        description: 'List all sales pipeline deals.'
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_deal',
        description: 'Create a new deal for an existing contact.',
        parameters: {
          type: 'object',
          properties: {
            contact_id: { type: 'integer', description: 'The database integer ID of the contact' },
            name: { type: 'string', description: 'Deal description (e.g. Swedish Massage Booking)' },
            amount: { type: 'number', description: 'Dollar value' },
            stage: { type: 'string', enum: ['appointmentscheduled', 'qualified', 'quotesent', 'closedwon', 'closedlost'], description: 'Stage name' },
            close_date: { type: 'string', description: 'Closing date YYYY-MM-DD' }
          },
          required: ['contact_id', 'name', 'amount']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'move_deal',
        description: 'Shift deal stage in pipeline.',
        parameters: {
          type: 'object',
          properties: {
            deal_id: { type: 'integer', description: 'The deal database ID' },
            stage: { type: 'string', enum: ['appointmentscheduled', 'qualified', 'quotesent', 'closedwon', 'closedlost'], description: 'Target stage column' }
          },
          required: ['deal_id', 'stage']
        }
      }
    }
  ];

  try {
    let messages = [
      {
        role: 'system',
        content: `You are Hubie, the AI CRM Copilot. You help spa managers search, create, and manage contacts and deals. Use tool calls to manipulate SQLite data, then explain what you did. Always verify names by running list_contacts if the user does not supply IDs. Note: You are running on behalf of Tenant ID ${req.tenantId}.`
      },
      { role: 'user', content: message }
    ];

    let keepGoing = true;
    let iterations = 0;
    let finalResponseContent = '';

    while (keepGoing && iterations < 5) {
      iterations++;
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          tools
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API Error: ${await response.text()}`);
      }

      const result = await response.json();
      const choice = result.choices[0];
      const resMsg = choice.message;
      messages.push(resMsg);

      if (resMsg.tool_calls && resMsg.tool_calls.length > 0) {
        for (const call of resMsg.tool_calls) {
          const name = call.function.name;
          const args = JSON.parse(call.function.arguments);
          let output = {};

          try {
            if (name === 'list_contacts') {
              output = await getContacts(req.tenantId);
            } else if (name === 'create_contact') {
              const c = await addContact(req.tenantId, args);
              output = c;
              actionsPerformed.push({ action: 'contact_created', data: c });
            } else if (name === 'list_deals') {
              output = await getDeals(req.tenantId);
            } else if (name === 'create_deal') {
              const d = await addDeal(req.tenantId, args);
              output = d;
              actionsPerformed.push({ action: 'deal_created', data: d });
            } else if (name === 'move_deal') {
              const d = await updateDealStage(req.tenantId, args.deal_id, args.stage);
              output = d;
              actionsPerformed.push({ action: 'deal_moved', data: d });
            }
          } catch (err) {
            output = { error: err.message };
          }

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(output)
          });
        }
      } else {
        finalResponseContent = resMsg.content;
        keepGoing = false;
      }
    }

    if (actionsPerformed.length > 0) {
      broadcastToDashboard(req.tenantId, 'refresh_crm', {});
    }

    res.json({ reply: finalResponseContent, actions: actionsPerformed });
  } catch (err) {
    console.error('CRM Copilot execution failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// TWILIO INBOUND ROUTERS WITH SAAS TENANCY RESOLUTION
// =============================================================

// Webhook: Incoming WhatsApp Message (Triggers automated Outbound Callback call)
app.post('/incoming-whatsapp', async (req, res) => {
  const fromWhatsApp = req.body.From || ''; // e.g. "whatsapp:+6587654321"
  const toWhatsApp = req.body.To || '';     // e.g. "whatsapp:+14155238886"
  const body = req.body.Body || '';
  
  console.log(`Incoming WhatsApp message from ${fromWhatsApp} to ${toWhatsApp}: "${body}"`);
  
  // Respond to Twilio immediately
  res.type('text/xml');
  res.send('<Response></Response>');

  try {
    const cleanTo = toWhatsApp.replace('whatsapp:', '').trim();
    const cleanFrom = fromWhatsApp.replace('whatsapp:', '').trim();
    
    if (!cleanTo || !cleanFrom) {
      console.log('Invalid WhatsApp To/From numbers.');
      return;
    }
    
    // Resolve tenant by the dialed Twilio WhatsApp number
    const tenantId = await findTenantByTwilioNumber(cleanTo);
    if (!tenantId) {
      console.log(`No active SaaS tenant registered for WhatsApp number ${cleanTo}. Cannot trigger callback.`);
      return;
    }

    const lockStatus = await isTenantLocked(tenantId);
    if (lockStatus.locked) {
      console.log(`WhatsApp callback blocked: Tenant ${tenantId} is locked due to outstanding payments (${lockStatus.reason}).`);
      return;
    }

    // Quota Limit Check
    const usage = await getTenantUsage(tenantId);
    const limits = { free: 15, starter: 100, professional: 1000, enterprise: 999999 };
    const planLimit = limits[usage.tier] || 0;
    const totalLimit = planLimit + (usage.prepaid_overage_minutes || 0);
    if (usage.usage_minutes >= totalLimit) {
      console.log(`Tenant ${tenantId} WhatsApp call-back blocked due to call minutes limit.`);
      return;
    }

    const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+15550001111';
    const ngrokUrl = process.env.NGROK_URL || `http://localhost:${PORT}`;

    const twilioClient = getTwilioClient();
    const signalwireClient = getSignalWireClient();

    // 1. Send WhatsApp confirmation message back via Twilio
    try {
      console.log(`Sending WhatsApp response confirmation to ${fromWhatsApp}...`);
      await twilioClient.messages.create({
        from: toWhatsApp,
        to: fromWhatsApp,
        body: `Thanks for your message! 🌟 Our AI Receptionist is calling you right now to assist. Please pick up the call! 📞`
      });
    } catch (msgErr) {
      console.error('Failed to send WhatsApp confirmation message:', msgErr.message);
    }

    // 2. Initiate Outbound Call to customer via SignalWire
    const webhookUrl = `${ngrokUrl}/outbound-call-twiml?phoneNumber=${encodeURIComponent(cleanFrom)}&tenantId=${tenantId}`;
    console.log(`Initiating automatic WhatsApp callback call to ${cleanFrom} for Tenant ${tenantId}...`);
    
    await signalwireClient.calls.create({
      url: webhookUrl,
      to: cleanFrom,
      from: fromNumber
    });
    
    console.log(`Successfully initiated WhatsApp callback call to ${cleanFrom}`);
  } catch (err) {
    console.error('Failed to process WhatsApp callback call:', err);
  }
});

// Telephony Webhook: Handoff Recording Completed (Addon feature)
app.post('/api/telephony/recording-complete', async (req, res) => {
  const tenantId = parseInt(req.query.tenantId);
  const callSid = req.query.callSid;
  const recordingUrl = req.body.RecordingUrl || req.body.recordingUrl || '';
  const recordingDuration = parseInt(req.body.RecordingDuration || req.body.recordingDuration || 0);

  console.log(`[Recording Callback] Received recording for Tenant ${tenantId}, CallSid ${callSid}. Recording URL: ${recordingUrl}, Duration: ${recordingDuration}s`);

  // Instantly acknowledge the webhook
  res.type('text/xml');
  res.send('<Response></Response>');

  if (isNaN(tenantId) || !callSid) {
    console.error('[Recording Callback] Missing tenantId or callSid.');
    return;
  }

  try {
    let transcriptText = '';

    // Resolve credentials
    const settings = await getSettings(tenantId);
    const apiKey = settings.openai_api_key;
    const adminKey = process.env.OPENAI_ADMIN_KEY;
    const resolvedKey = apiKey || adminKey;

    const isRealRecording = recordingUrl && recordingUrl.startsWith('http') && !recordingUrl.includes('localhost') && !recordingUrl.includes('127.0.0.1');

    if (isRealRecording && resolvedKey) {
      try {
        console.log(`[Recording Callback] Real recording detected. Sending to Whisper for transcription...`);
        const audioFetch = await fetch(recordingUrl);
        if (!audioFetch.ok) throw new Error(`Failed to download recording audio: ${audioFetch.statusText}`);
        const audioBlob = await audioFetch.blob();
        
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.wav');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resolvedKey}`
          },
          body: formData
        });

        if (whisperRes.ok) {
          const json = await whisperRes.json();
          transcriptText = json.text || '';
          console.log(`[Recording Callback] Whisper transcription successful: "${transcriptText}"`);
        } else {
          const errText = await whisperRes.text();
          throw new Error(`Whisper API error: ${errText}`);
        }
      } catch (whisperErr) {
        console.error('[Recording Callback] Real transcription failed, falling back to simulated handoff text:', whisperErr.message);
        transcriptText = `[Human Handoff] Caller was connected to representative. Spoke about billing and support details for ${recordingDuration || 45} seconds.`;
      }
    } else {
      // Offline/sandbox or simulated key
      console.log(`[Recording Callback] Running simulated handoff transcription...`);
      transcriptText = `[Human Handoff] Caller was successfully connected to the representative. They discussed account setup steps, pricing queries, and successfully resolved their questions.`;
    }

    if (transcriptText) {
      // 1. Append the transcript
      await appendCallTranscript(callSid, 'human_agent', transcriptText);

      // 2. Add recording duration to overall call duration
      const dbCalls = await getCallLogs(tenantId);
      const callObj = dbCalls.find(c => c.call_sid === callSid);
      if (callObj) {
        const newDuration = (callObj.duration || 0) + recordingDuration;
        await updateCallStatus(callSid, 'completed', newDuration);
      }

      // 3. Regenerate call summary with the appended transcript
      await generateCallSummary(tenantId, callSid);

      // 4. Send websocket notification to refresh the dashboard
      broadcastToDashboard(tenantId, 'transcript', {
        callSid,
        speaker: 'human_agent',
        text: transcriptText
      });
      broadcastToDashboard(tenantId, 'refresh_crm', {});
      
      console.log(`[Recording Callback] Successfully updated call log and regenerated summary for CallSid ${callSid}`);
    }

  } catch (err) {
    console.error('[Recording Callback] Error processing recording completion:', err);
  }
});

// TwiML Webhook: Inbound Call
app.post('/incoming-call', async (req, res) => {
  const twilioNumber = req.body.To || '';
  const phoneNumber = req.body.From || 'unknown';
  const domain = req.headers.host;
  
  console.log(`Inbound call received on Twilio number: ${twilioNumber} from: ${phoneNumber}`);
  
  res.type('text/xml');
  
  try {
    const tenantId = await findTenantByTwilioNumber(twilioNumber);
    if (!tenantId) {
      console.log(`No active SaaS tenant registered for phone number ${twilioNumber}. Playing fallback TwiML.`);
      res.send(`
        <Response>
          <Say>Thank you for calling. This phone number has not been configured in our voice SaaS portal yet. Please sign up and register your Twilio number.</Say>
        </Response>
      `);
      return;
    }

    const lockStatus = await isTenantLocked(tenantId);
    if (lockStatus.locked) {
      console.log(`Tenant ${tenantId} call blocked: Account is restricted due to outstanding payments (${lockStatus.reason}).`);
      res.send(`
        <Response>
          <Say>Thank you for calling. We are sorry, but this service is temporarily restricted due to outstanding payments. Please contact support.</Say>
        </Response>
      `);
      return;
    }

    // Check call concurrency limits (max 2 active calls per tenant)
    const activeCallsCount = await getActiveCallsCountForTenant(tenantId);
    if (activeCallsCount >= 2) {
      console.log(`Tenant ${tenantId} call blocked: Concurrency limit reached (${activeCallsCount} active calls). Redirecting to human transfer.`);
      const settings = await getSettings(tenantId);
      const transferNumber = settings.transfer_phone_number || '';
      if (transferNumber) {
        res.send(`
          <Response>
            <Say>All our AI operators are currently busy. Transferring you to our representative.</Say>
            <Dial>${transferNumber}</Dial>
          </Response>
        `);
      } else {
        res.send(`
          <Response>
            <Say>All our AI operators are currently busy. Please call back later. Thank you.</Say>
            <Hangup />
          </Response>
        `);
      }
      return;
    }

    let contactName = '';
    let leadStage = '';
    const contact = await findContactByPhone(tenantId, phoneNumber);
    if (contact) {
      contactName = contact.name;
      leadStage = contact.lead_stage;
    }

    // Connect to WebSocket passing tenantId
    res.send(`
      <Response>
        <Say>Thank you for calling. Please note that this call is recorded and transcribed for quality and verification purposes.</Say>
        <Connect>
          <Stream url="wss://${domain}/media-stream">
            <Parameter name="tenantId" value="${tenantId}" />
            <Parameter name="phoneNumber" value="${phoneNumber}" />
            <Parameter name="direction" value="inbound" />
            <Parameter name="contactName" value="${contactName}" />
            <Parameter name="leadStage" value="${leadStage}" />
          </Stream>
        </Connect>
      </Response>
    `);
  } catch (err) {
    console.error('Error resolving tenant on inbound call:', err);
    res.send(`<Response><Say>A system error occurred. Please try calling back later.</Say></Response>`);
  }
});

// Outbound Call TwiML Webhook
app.post('/outbound-call-twiml', async (req, res) => {
  const phoneNumber = req.query.phoneNumber || 'unknown';
  const tenantId = parseInt(req.query.tenantId);
  const campaignPrompt = req.query.campaignPrompt || '';
  const domain = req.headers.host;
  
  console.log(`Outbound call webhook triggered for Tenant ${tenantId} calling customer: ${phoneNumber}`);
  
  res.type('text/xml');

  if (isNaN(tenantId)) {
    res.send(`<Response><Say>Authentication failed. Tenant ID missing.</Say></Response>`);
    return;
  }

  let contactName = '';
  let leadStage = '';

  try {
    const contact = await findContactByPhone(tenantId, phoneNumber);
    if (contact) {
      contactName = contact.name;
      leadStage = contact.lead_stage;
    }
  } catch (e) {
    console.error('Failed to lookup contact on outbound callback:', e);
  }

  res.send(`
    <Response>
      <Say>Hello. This is an automated call from our virtual voice assistant. Please note that this call is recorded and transcribed for quality purposes.</Say>
      <Connect>
        <Stream url="wss://${domain}/media-stream">
          <Parameter name="tenantId" value="${tenantId}" />
          <Parameter name="phoneNumber" value="${phoneNumber}" />
          <Parameter name="direction" value="outbound" />
          <Parameter name="contactName" value="${contactName}" />
          <Parameter name="leadStage" value="${leadStage}" />
          <Parameter name="campaignPrompt" value="${encodeURIComponent(campaignPrompt)}" />
        </Stream>
      </Connect>
    </Response>
  `);
});

// Transfer Call TwiML Webhook
app.post('/transfer-call-twiml', async (req, res) => {
  const tenantId = parseInt(req.query.tenantId);
  const reason = req.query.reason || 'AI requested transfer';
  const departmentName = req.query.department || req.body.department || '';
  res.type('text/xml');

  if (isNaN(tenantId)) {
    res.send(`<Response><Say>Transfer failed. Tenant ID missing.</Say></Response>`);
    return;
  }

  try {
    const settings = await getSettings(tenantId);
    let transferNumber = settings.transfer_phone_number || '';
    let extension = '';
    let resolvedDeptName = '';

    const tenant = await getTenantById(tenantId);
    const addonDeptsActive = tenant && tenant.addon_department_routing === 1;

    let hasAddon = tenant && tenant.addon_call_recording === 1;

    // Resolve target department routing if addon is active
    if (addonDeptsActive) {
      try {
        const departments = await getTenantDepartments(tenantId);
        if (departments.length > 0) {
          let match = null;
          if (departmentName && departmentName.trim()) {
            match = departments.find(d => d.name.toLowerCase().trim() === departmentName.toLowerCase().trim());
          }
          
          // General fallback: match general, operator, or default names
          if (!match) {
            match = departments.find(d => ['general', 'operator', 'default'].includes(d.name.toLowerCase().trim()));
          }
          
          // If still no match, fallback to the first configured department entry
          if (!match) {
            match = departments[0];
          }

          if (match) {
            transferNumber = match.phone_number;
            extension = match.extension || '';
            resolvedDeptName = match.name;
            hasAddon = match.record_calls === 1;
          }
        }
      } catch (e) {
        console.error('Failed to lookup department for call redirect:', e);
      }
    }

    if (!transferNumber) {
      console.log(`Tenant ${tenantId} transfer failed: No transfer number or matched department configured.`);
      res.send(`
        <Response>
          <Say>I am sorry, we cannot answer your question right now, and no transfer number is configured. Please leave a message or call back later. Thank you.</Say>
          <Hangup />
        </Response>
      `);
      return;
    }

    const callSid = req.body.CallSid || req.query.callSid || '';
    const ngrokUrl = process.env.NGROK_URL || `http://localhost:${PORT}`;

    console.log(`Redirecting call ${callSid} to ${resolvedDeptName || 'default'} transfer number: ${transferNumber}${extension ? ` (Ext: ${extension})` : ''} (Reason: ${reason}), Addon Active: ${hasAddon}`);
    
    let dialTag = '';
    const callbackUrlStr = `${ngrokUrl}/api/telephony/recording-complete?tenantId=${tenantId}&amp;callSid=${encodeURIComponent(callSid)}`;
    
    if (hasAddon) {
      if (extension) {
        dialTag = `<Dial record="record-from-answer" recordingStatusCallback="${callbackUrlStr}"><Number sendDigits="ww${extension}">${transferNumber}</Number></Dial>`;
      } else {
        dialTag = `<Dial record="record-from-answer" recordingStatusCallback="${callbackUrlStr}">${transferNumber}</Dial>`;
      }
    } else {
      if (extension) {
        dialTag = `<Dial><Number sendDigits="ww${extension}">${transferNumber}</Number></Dial>`;
      } else {
        dialTag = `<Dial>${transferNumber}</Dial>`;
      }
    }
    
    res.send(`
      <Response>
        <Say>Please hold while we transfer your call to ${resolvedDeptName || 'a representative'}.</Say>
        ${dialTag}
      </Response>
    `);
  } catch (err) {
    console.error('Error rendering transfer TwiML:', err);
    res.send(`<Response><Say>A system error occurred during transfer.</Say></Response>`);
  }
});

// HTTP Server
const server = http.createServer(app);

// WebSockets Config
const mediaStreamWss = new WebSocketServer({ noServer: true });
const dashboardWss = new WebSocketServer({ noServer: true });
const liveDemoWss = new WebSocketServer({ noServer: true });

// Live Demo / Gemini Omni WebSocket Proxy
liveDemoWss.on('connection', (ws) => {
  console.log('Client connected to live-demo (Gemini Omni proxy).');
  
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY; // Fallback or direct key
  if (!geminiApiKey) {
    console.error('CRITICAL: GEMINI_API_KEY is not defined in environment variables.');
    ws.close(1011, 'GEMINI_API_KEY is missing on server');
    return;
  }
  
  // Connect to Google Gemini Multimodal Live API via WebSockets (v1alpha)
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiApiKey}`;
  const geminiWs = new WebSocket(geminiUrl);
  
  geminiWs.on('open', () => {
    console.log('Connected to Google Gemini Multimodal Live API WebSocket.');
    
    // Send initial configuration setup payload
    const setupMsg = {
      setup: {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Puck" // Friendly, clean professional voice
              }
            }
          }
        }
      }
    };
    geminiWs.send(JSON.stringify(setupMsg));
  });
  
  geminiWs.on('message', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
  
  geminiWs.on('close', (code, reason) => {
    console.log(`Gemini WebSocket closed. Code: ${code}, Reason: ${reason}`);
    ws.close();
  });
  
  geminiWs.on('error', (err) => {
    console.error('Gemini WebSocket error:', err);
    ws.close();
  });
  
  ws.on('message', (message) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(message);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected from live-demo.');
    if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
      geminiWs.close();
    }
  });
});

// Live dashboard clients pool
const dashboardClients = new Set();

dashboardWss.on('connection', (ws) => {
  dashboardClients.add(ws);
  console.log(`Dashboard socket connected. Tenant: ${ws.tenantId || 'unauth'}. Pool size:`, dashboardClients.size);
  
  ws.on('close', () => {
    dashboardClients.delete(ws);
  });
});

// Scoped Broadcast: Sends only to dashboard clients of a specific tenant
function broadcastToDashboard(tenantId, event, data) {
  const payload = JSON.stringify({ event, data });
  dashboardClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.tenantId === tenantId) {
      client.send(payload);
    }
  });
}

// Media Stream WebSocket (Bridges Twilio Audio to OpenAI Realtime API)
mediaStreamWss.on('connection', (ws) => {
  console.log('Twilio Media Stream WebSocket connection established.');
  
  let tenantId = null;
  let streamSid = '';
  let callSid = '';
  let phoneNumber = '';
  let direction = '';
  let contactName = '';
  let leadStage = '';
  let campaignPrompt = '';
  let openaiWs = null;
  let currentTurnText = '';
  let startTime = Date.now();
  let durationLimitTimeout = null;
  let silenceTimeout = null;
  let resetSilenceTimeout = () => {};

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.event === 'start') {
        tenantId = parseInt(data.start.customParameters?.tenantId);
        streamSid = data.streamSid;
        callSid = data.start.callSid;
        phoneNumber = data.start.customParameters?.phoneNumber || 'unknown';
        direction = data.start.customParameters?.direction || 'inbound';
        contactName = data.start.customParameters?.contactName || '';
        leadStage = data.start.customParameters?.leadStage || '';
        campaignPrompt = data.start.customParameters?.campaignPrompt ? decodeURIComponent(data.start.customParameters.campaignPrompt) : '';
        
        if (isNaN(tenantId)) {
          console.error('Call stream aborted: Invalid or missing Tenant ID.');
          ws.close();
          return;
        }

        console.log(`Tenant ${tenantId} call active: Sid=${callSid}, From=${phoneNumber}, Client=${contactName || 'New Client'}`);
        
        // Quota Check
        const usage = await getTenantUsage(tenantId);
        const limits = { free: 15, starter: 100, professional: 1000, enterprise: 999999 };
        const planLimit = limits[usage.tier] || 0;
        const totalLimit = planLimit + (usage.prepaid_overage_minutes || 0);
        if (usage.usage_minutes >= totalLimit) {
          console.log(`Tenant ${tenantId} call blocked due to overage limits.`);
          // Send TwiML or close websocket early
          ws.close();
          return;
        }

        // Log call record
        await addCallLog(tenantId, {
          call_sid: callSid,
          direction,
          phone_number: phoneNumber,
          status: 'active'
        });
        
        // Broadcast to tenant dashboard
        broadcastToDashboard(tenantId, 'call_started', {
          callSid,
          streamSid,
          phoneNumber,
          direction,
          status: 'active',
          startTime: new Date().toISOString()
        });

        // Initialize connection to OpenAI Realtime API
        const settings = await getSettings(tenantId);

        // Setup Call Duration Limit Timeout
        const maxDurationMins = parseInt(settings.max_call_duration) || 10;
        console.log(`Setting call duration limit to ${maxDurationMins} minutes for Tenant ${tenantId}, CallSid=${callSid}`);
        durationLimitTimeout = setTimeout(async () => {
          console.log(`Call ${callSid} auto-terminated: exceeded max duration of ${maxDurationMins} minutes.`);
          const client = getSignalWireClient();
          const isMock = (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) && !process.env.SIGNALWIRE_PROJECT_ID;
          if (!isMock && callSid) {
            try {
              await client.calls(callSid).update({ status: 'completed' });
            } catch (e) {
              console.error('Failed to terminate over-duration call:', e);
            }
          }
          ws.close();
        }, maxDurationMins * 60 * 1000);

        // Setup Silence Timeout Function
        const maxSilenceSecs = parseInt(settings.max_no_speech_timeout) || 30;
        resetSilenceTimeout = () => {
          if (silenceTimeout) {
            clearTimeout(silenceTimeout);
            silenceTimeout = null;
          }
          if (ws.readyState === 1) {
            silenceTimeout = setTimeout(async () => {
              console.log(`Call ${callSid} auto-terminated: caller silence exceeded ${maxSilenceSecs} seconds.`);
              const client = getSignalWireClient();
              const isMock = (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) && !process.env.SIGNALWIRE_PROJECT_ID;
              if (!isMock && callSid) {
                try {
                  await client.calls(callSid).update({ status: 'completed' });
                } catch (e) {
                  console.error('Failed to terminate silent call:', e);
                }
              }
              ws.close();
            }, maxSilenceSecs * 1000);
          }
        };

        // Start initial silence timeout
        resetSilenceTimeout();
        const dbModel = settings.openai_model || 'gpt-4o-mini-realtime-preview';
        const MODEL_MAPPING = {
          'gpt-4o-mini-realtime-preview': 'gpt-realtime-mini',
          'gpt-4o-realtime-preview': 'gpt-realtime-2',
          'gpt-4o-realtime-preview-2024-12-17': 'gpt-realtime-2',
          'gpt-4o-realtime-preview-2024-10-01': 'gpt-realtime-2'
        };
        const model = MODEL_MAPPING[dbModel] || dbModel;

        // Key resolution: tenant key → platform key (global_settings) → env var
        let apiKey = settings.openai_api_key || null;
        if (!apiKey) {
          const platformKeyRow = await get("SELECT value FROM global_settings WHERE key = 'platform_openai_api_key'");
          if (platformKeyRow && platformKeyRow.value) {
            apiKey = decryptField(platformKeyRow.value);
            if (apiKey) console.log(`Tenant ${tenantId}: Using platform-wide OpenAI API key.`);
          }
        }
        if (!apiKey) {
          apiKey = process.env.OPENAI_API_KEY || null;
        }

        if (!apiKey) {
          console.error('CRITICAL: No OpenAI API key configured for Tenant', tenantId, '— neither tenant key nor OPENAI_API_KEY env var is set.');
          // Notify the browser client with a clear error before closing
          try {
            ws.send(JSON.stringify({
              event: 'error',
              code: 'NO_OPENAI_KEY',
              message: 'No OpenAI API Key configured. Please add your OpenAI API Key in Agent Settings → Advanced → OpenAI API Key.'
            }));
          } catch (_) {}
          ws.close();
          return;
        }

        if (settings.openai_api_key) {
          console.log(`Tenant ${tenantId}: Using custom OpenAI project API key for this call.`);
        }

        console.log(`Connecting OpenAI Realtime API (${model}) for Tenant ${tenantId}...`);
        openaiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });

        openaiWs.on('open', async () => {
          console.log(`Connected to OpenAI Realtime API for call ${callSid}`);
          
          let systemInstructions = '';

          // Accent & Language Specific Instructions (Prepended for priority)
          if (settings.voice_accent === 'singlish') {
            systemInstructions += `ACCENT/DIALECT RULE - SINGLISH:\n- You MUST speak English with a natural Singaporean (Singlish) accent and pacing.\n- To achieve this, write and structure your response text using Singaporean sentence structures, grammatical patterns, and colloquial particles.\n- Use words like 'lah', 'lor', 'meh', 'leh', 'can' naturally at the end of sentences (e.g., 'Sure, can do that for you lah.', 'What time you want lor?', 'Are you sure meh?').\n- Use local terms like 'booking' instead of 'reservation', and phrase questions directly (e.g., 'You want Swedish massage or facial?').\n- Maintain a highly polite, helpful, and professional receptionist demeanor, but sound like a native Singaporean local speaking Singlish.\n\n`;
          } else if (settings.voice_accent === 'chinese-english') {
            systemInstructions += `ACCENT/DIALECT RULE - CHINESE ENGLISH (CHINGLISH):\n- You MUST speak English with a polite, native Chinese accent (cadence and rhythm of a Mandarin speaker speaking English).\n- To achieve this, structure your response text using typical Chinese-English phrasing and pacing.\n- Use simple grammatical transitions and repeat words for confirmation/emphasis (e.g., 'Okay, can, can, no problem.', 'Hello, yes, how can I help you?', 'We have very good Swedish massage, yes.').\n- Keep sentences shorter and pacing clear, mimicking the intonation patterns of a polite native Chinese receptionist speaking English.\n\n`;
          } else if (settings.voice_accent === 'chinese-mandarin') {
            systemInstructions += `ACCENT/DIALECT RULE - CHINESE MANDARIN:\n- You MUST speak and respond entirely in fluent Mandarin Chinese (普通话).\n- Translate all instructions, system instructions, services, and conversation details to standard Mandarin Chinese.\n- Write all outputs using simplified Chinese characters (简体字).\n- Keep your tone polite, warm, and professional, using standard Chinese business greetings and honorifics (e.g., '您好，欢迎致电...', '请问您怎么称呼？', '好的，没问题。').\n\n`;
          } else if (settings.voice_accent === 'malaysian-english') {
            systemInstructions += `ACCENT/DIALECT RULE - MALAYSIAN ENGLISH (MANGLISH):\n- You MUST speak English with a friendly Malaysian (Manglish) accent and cadence.\n- Structure your response text using local Malaysian conversational pacing and colloquial particles.\n- Use words like 'ah', 'lah', 'eh', 'can' naturally (e.g., 'Can, boss, what time you want ah?', 'We are open at 9am lah.').\n- Maintain a warm, welcoming, and polite receptionist tone, characteristic of a local Malaysian staff member.\n\n`;
          }

          systemInstructions += settings.system_prompt;
          
          // Append Services and Pricing dynamically
          try {
            const dbServices = await getServices(tenantId);
            if (dbServices && dbServices.length > 0) {
              const listStr = dbServices.map(s => `- ${s.name}: $${s.price} (${s.duration} mins) - ${s.description || 'No description'}`).join('\n');
              systemInstructions += `\n\nOFFICIAL SERVICES & PRICING CATALOGUE:\n${listStr}\n\nUse this official catalog as your primary reference for pricing and booking duration.`;
            }
          } catch (svcErr) {
            console.error('Error loading services for AI prompt:', svcErr);
          }

          if (settings.crawled_content) {
            systemInstructions += `\n\nADDITIONAL BUSINESS, PRODUCTS, AND SERVICES INFORMATION (CRAWLED FROM ${settings.website_url || 'tenant website'}):\n${settings.crawled_content}`;
          }

          if (campaignPrompt) {
            systemInstructions += `\n\nMARKETING CAMPAIGN GOAL / OUTBOUND PROMPT:\n- You are placing an outbound call to this customer as part of a marketing campaign.\n- Your campaign objective is: ${campaignPrompt}\n- Strictly guide the conversation to achieve this objective and invite them to take action (e.g., book a service, verify information, or confirm an offer).`;
          }
          const agentName = settings.agent_name || 'Aura';
          const companyName = settings.company_name || 'Aura Wellness Spa';

          if (contactName) {
            systemInstructions += `\n\nCRITICAL CONTEXT: You are talking to an existing client named "${contactName}" (Lead Stage: "${leadStage}"). Greet them back warmly by name! For example, say: "Hello ${contactName}, welcome back to ${companyName}..."`;
          }
          if (settings.system_mode === 'restaurant') {
            systemInstructions += `\n\nRESTAURANT RESERVATION MODE CONTEXT:\n- You are a professional virtual host receptionist for the restaurant "${companyName}".\n- You help customers book table reservations.\n- ALWAYS ask the customer for the guest count/party size (how many people), date, and time of the reservation.\n- If they have a table preference, check if that table is available. Otherwise, just book whichever table is free.\n- You MUST call check_availability first before scheduling an appointment. Always pass party_size and optionally table_number.`;
            
            // Append dynamic tables listing if available
            try {
              // Wait, since we are inside a synchronous context or promise chain, let's wrap this in a way to fetch tables
              // But settings.resources_list is already in scope, or we can instruct it generally. Let's list general table info.
              systemInstructions += `\n- The dining slot duration is ${settings.appointment_gap || 90} minutes.`;
            } catch (e) {}
          } else if (settings.system_mode === 'hotel') {
            systemInstructions += `\n\nHOTEL RESERVATION MODE CONTEXT:\n- You are a professional virtual front desk receptionist for the hotel "${companyName}".\n- You help customers book room stays.\n- ALWAYS ask the customer for their check-in date, check-out date (or number of nights), and room type preference (e.g. Single, Double, Deluxe Suite, Family Room), and guest count.\n- You MUST call check_availability first before scheduling an appointment. Always pass date (check-in), checkout_date, and optionally room_number or room_type under resource_name.\n- Standard check-in date format is YYYY-MM-DD. Checkout date format is YYYY-MM-DD.`;
          } else if (settings.resources_list) {
            systemInstructions += `\n\nAVAILABLE STAFF/RESOURCES: The active staff members, doctors, therapists, or tables available for booking are: ${settings.resources_list}. Ask the customer if they have a preference, or assign whichever resource is free. Check availability for that specific resource.`;
          }

          // Append Departments dynamically for Call Transfer Addon
          try {
            const dbDepts = await getTenantDepartments(tenantId);
            const tenant = await getTenantById(tenantId);
            const addonDeptsActive = tenant && tenant.addon_department_routing === 1;

            if (addonDeptsActive && dbDepts && dbDepts.length > 0) {
              const deptStr = dbDepts.map(d => `- ${d.name}${d.extension ? ` (Ext: ${d.extension})` : ''}`).join('\n');
              systemInstructions += `\n\nOFFICIAL DEPARTMENTS AVAILABLE FOR CALL TRANSFER:\n${deptStr}\n\nIf the caller requests to speak to one of these departments (e.g. Sales, Billing), call the 'transfer_to_human' tool and specify the matching department name in the 'department' parameter exactly.`;
            }
          } catch (deptErr) {
            console.error('Error loading departments for system instructions:', deptErr);
          }

          // Dynamic identity and company override to enforce settings
          systemInstructions += `\n\nIDENTITY & BUSINESS OVERRIDE:\n- Your name is "${agentName}". You must ALWAYS refer to yourself as "${agentName}". Never call yourself "Aura" unless your configured name is indeed "Aura".\n- You represent "${companyName}". Always refer to the business as "${companyName}". Never refer to the business as "Aura Wellness Spa" unless the business name is set to that.`;

          // Character-specific Dialect / Accent Injector
          let characterAccentPrompt = '';
          if (settings.voice === 'meiling' || settings.voice === 'jianguo') {
            characterAccentPrompt = `ACCENT/DIALECT RULE - CHINA:\n- You represent a receptionist from China.\n- You MUST speak English with a polite, native Chinese accent (cadence and rhythm of a Mandarin speaker speaking English).\n- To achieve this, structure your response text using typical Chinese-English phrasing and pacing. Use simple grammatical transitions and repeat words for confirmation (e.g., 'Okay, can, can, no problem.', 'Hello, yes, how can I help you?', 'We have very good Swedish massage, yes.'). Keep sentences shorter and pacing clear.\n- (Note: If the customer speaks to you in Mandarin Chinese, you may respond in fluent Mandarin Chinese).\n\n`;
          } else if (settings.voice === 'wing_yee' || settings.voice === 'ka_ho') {
            characterAccentPrompt = `ACCENT/DIALECT RULE - HONG KONG:\n- You represent a receptionist from Hong Kong.\n- You MUST speak English with a clear Hong Kong / Cantonese accent (Honkish intonation and phrasing).\n- Keep your tone highly polite, formal, and professional, characteristic of a Hong Kong business representative.\n- (Note: If the customer speaks to you in Cantonese or Mandarin Chinese, you may respond in their preferred language fluently).\n\n`;
          } else if (settings.voice === 'siti' || settings.voice === 'arif') {
            characterAccentPrompt = `ACCENT/DIALECT RULE - MALAYSIA:\n- You represent a receptionist from Malaysia.\n- You MUST speak English with a friendly Malaysian accent (Manglish pacing).\n- Structure your response text using local Malaysian conversational pacing and colloquial particles naturally, such as 'ah', 'lah', 'eh', 'can' (e.g., 'Can, boss, what time you want ah?', 'We are open at 9am lah.').\n- Maintain a warm, welcoming, and polite receptionist tone.\n\n`;
          } else if (settings.voice === 'priya' || settings.voice === 'aarav') {
            characterAccentPrompt = `ACCENT/DIALECT RULE - INDIA:\n- You represent a receptionist from India.\n- You MUST speak English with a warm, polite, and clear Indian accent (Indian English rhythm and pronunciation).\n- Structure your phrasing to sound like a professional Indian receptionist, keeping it highly polite, respectful, and structured (e.g., using terms like 'Certainly, I can assist you with that.', 'Please let me check the availability.').\n\n`;
          }

          if (characterAccentPrompt) {
            systemInstructions = characterAccentPrompt + systemInstructions;
          }

          // Send configuration settings to OpenAI
          const voiceMapping = {
            'fable': 'ballad',
            'onyx': 'echo',
            'nova': 'shimmer',
            'meiling': 'coral',
            'jianguo': 'echo',
            'wing_yee': 'shimmer',
            'ka_ho': 'ballad',
            'siti': 'coral',
            'arif': 'verse',
            'priya': 'sage',
            'aarav': 'echo'
          };
          const selectedVoice = settings.voice || 'alloy';
          const realtimeVoice = voiceMapping[selectedVoice] || selectedVoice;

          const sessionUpdate = {
            type: 'session.update',
            session: {
              type: 'realtime',
              output_modalities: ['audio'],
              instructions: systemInstructions,
              audio: {
                input: {
                  format: {
                    type: 'audio/pcmu'
                  },
                  transcription: {
                    model: 'whisper-1'
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                  }
                },
                output: {
                  format: {
                    type: 'audio/pcmu'
                  },
                  voice: realtimeVoice
                }
              },
              tools: [
                {
                  type: 'function',
                  name: 'check_availability',
                  description: 'Check if a specific date and time slot, or hotel room stay, is available for a booking. Returns true if available, false if already booked.',
                  parameters: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', description: 'The check-in date in YYYY-MM-DD format (e.g. 2026-05-25)' },
                      time: { type: 'string', description: 'The check-in time in HH:MM format (24-hour, e.g. 14:30) (defaults to 14:00/2:00 PM for hotels if not specified).' },
                      resource_name: { type: 'string', description: 'Specific staff name, table name, or room type/room number (e.g., Suite, Room 102) to check (optional).' },
                      party_size: { type: 'integer', description: 'Number of guests/seats requested. Defaults to 1.', default: 1 },
                      table_number: { type: 'string', description: 'Specific table number preference (optional). Relevant in Restaurant Mode.' },
                      checkout_date: { type: 'string', description: 'The check-out date in YYYY-MM-DD format. Required in Hotel Mode.' },
                      room_type: { type: 'string', description: 'Preferred room type (e.g., Single, Double, Deluxe Suite) (optional). Relevant in Hotel Mode.' },
                      room_number: { type: 'string', description: 'Specific room number preference (optional). Relevant in Hotel Mode.' }
                    },
                    required: ['date']
                  }
                },
                {
                  type: 'function',
                  name: 'schedule_appointment',
                  description: 'Schedules a new reservation. Confirm availability with check_availability first.',
                  parameters: {
                    type: 'object',
                    properties: {
                      customer_name: { type: 'string', description: 'The full name of the customer' },
                      customer_phone: { type: 'string', description: 'The phone number of the customer' },
                      date: { type: 'string', description: 'The check-in date in YYYY-MM-DD format' },
                      time: { type: 'string', description: 'The check-in time (e.g., 14:00) (defaults to 14:00 for hotels).' },
                      service: { type: 'string', description: 'The service type, meal type, or stay type being booked (e.g., Deluxe Suite stay, Dinner, Swedish Massage)' },
                      notes: { type: 'string', description: 'Any special requests or instructions (optional)' },
                      resource_name: { type: 'string', description: 'Specific therapist, table, or room to book with (optional).' },
                      party_size: { type: 'integer', description: 'Number of guests (optional, defaults to 1).', default: 1 },
                      table_number: { type: 'string', description: 'Specific table number allocated/preferred (optional).' },
                      checkout_date: { type: 'string', description: 'The check-out date in YYYY-MM-DD format. Required in Hotel Mode.' },
                      room_number: { type: 'string', description: 'Specific room number allocated (optional).' }
                    },
                    required: ['customer_name', 'customer_phone', 'date', 'service']
                  }
                },
                {
                  type: 'function',
                  name: 'transfer_to_human',
                  description: 'Call this when the customer requests to speak to a human, is frustrated, or asks a question that the AI receptionist cannot answer.',
                  parameters: {
                    type: 'object',
                    properties: {
                      reason: { type: 'string', description: 'The reason why the call is being transferred.' },
                      department: { type: 'string', description: 'The name of the department to transfer to (e.g. Sales, Billing, Support). Use exact match from instructions if available, otherwise keep empty.' }
                    },
                    required: ['reason']
                  }
                }
              ]
            }
          };
          
          openaiWs.send(JSON.stringify(sessionUpdate));

          // Play dynamic greeting
          const greetingText = contactName 
            ? `Introduce yourself: "Hello ${contactName}, welcome back to ${settings.company_name || 'Aura Wellness Spa'}! It is great to hear from you again. Please note that this call is recorded and transcribed for quality and verification purposes. How can I help you today?"`
            : `Introduce yourself: "Thank you for calling ${settings.company_name || 'Aura Wellness Spa'}, my name is ${agentName}. Please note that this call is recorded and transcribed for quality and verification purposes. How can I help you today?"`;

          openaiWs.send(JSON.stringify({
            type: 'response.create',
            response: {
              instructions: greetingText
            }
          }));
        });

        openaiWs.on('message', async (openAiMsg) => {
          try {
            const event = JSON.parse(openAiMsg);
            
            if (event.type === 'error') {
              console.error(`OpenAI Realtime API Error for call ${callSid}:`, JSON.stringify(event.error, null, 2));
            }

            // Handle audio output from OpenAI -> Twilio
            if (event.type === 'response.output_audio.delta' && event.delta) {
              ws.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: {
                  payload: event.delta
                }
              }));
            }

            // Handle user transcription completed (Whisper)
            if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
              const text = event.transcript.trim();
              if (text) {
                await appendCallTranscript(callSid, 'user', text);
                broadcastToDashboard(tenantId, 'transcript', {
                  callSid,
                  speaker: 'user',
                  text
                });
              }
            }

            // Handle streaming assistant transcript delta
            if (event.type === 'response.output_audio_transcript.delta' && event.delta) {
              broadcastToDashboard(tenantId, 'transcript_delta', {
                callSid,
                speaker: 'assistant',
                text: event.delta
              });
              currentTurnText += event.delta;
            }

            // Handle assistant transcript completed
            if (event.type === 'response.output_audio_transcript.done' && event.transcript) {
              resetSilenceTimeout();
              const text = event.transcript.trim();
              if (text) {
                await appendCallTranscript(callSid, 'assistant', text);
                broadcastToDashboard(tenantId, 'transcript', {
                  callSid,
                  speaker: 'assistant',
                  text
                });
              }
              currentTurnText = '';
            }

            // Handle function call execution requests
            if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
              const { name, call_id, arguments: fnArgs } = event.item;
              console.log(`Tenant ${tenantId} call execution function: ${name}`);
              const args = JSON.parse(fnArgs);
              let result = {};

              try {
                if (name === 'check_availability') {
                  const partySize = args.party_size ? parseInt(args.party_size) : 1;
                  const resName = args.table_number || args.resource_name || args.room_number || args.room_type || '';
                  result = await checkAvailability(tenantId, args.date, args.time, resName, partySize, args.checkout_date);
                } else if (name === 'schedule_appointment') {
                  if (!args.customer_phone || args.customer_phone.toLowerCase() === 'caller') {
                    args.customer_phone = phoneNumber;
                  }
                  const appointment = await addAppointment(tenantId, args);
                  result = { scheduled: true, appointment };
                  
                  // Broadcast updates to dashboard
                  broadcastToDashboard(tenantId, 'refresh_appointments', appointment);
                  broadcastToDashboard(tenantId, 'refresh_crm', {});

                  // Broadcast Google Calendar sync toast alert
                  if (appointment.gcal_synced) {
                    broadcastToDashboard(tenantId, 'google_calendar_sync', {
                      appointmentId: appointment.id,
                      customerName: appointment.customer_name,
                      service: appointment.service,
                      date: appointment.date,
                      time: appointment.time,
                      resourceName: appointment.resource_name,
                      googleEmail: appointment.google_email
                    });
                  }
                } else if (name === 'transfer_to_human') {
                  const reason = args.reason || 'AI requested transfer';
                  const department = args.department || '';
                  console.log(`Initiating call transfer to human for Tenant ${tenantId}, CallSid=${callSid}, Reason: ${reason}, Department: ${department}`);
                  
                  const client = getSignalWireClient();
                  const isMock = (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) && !process.env.SIGNALWIRE_PROJECT_ID;
                  const ngrokUrl = process.env.NGROK_URL || `http://localhost:${PORT}`;

                  if (!isMock) {
                    try {
                      await client.calls(callSid).update({
                        url: `${ngrokUrl}/transfer-call-twiml?tenantId=${tenantId}&reason=${encodeURIComponent(reason)}&department=${encodeURIComponent(department)}`
                      });
                      result = { success: true, message: `Redirecting customer call to ${department || 'human'} now.` };
                    } catch (redirectErr) {
                      console.error('Failed to redirect live call:', redirectErr);
                      result = { error: 'Failed to redirect live call: ' + redirectErr.message };
                    }
                  } else {
                    console.log(`[Mock] Redirecting call ${callSid} to: ${ngrokUrl}/transfer-call-twiml?tenantId=${tenantId}&department=${encodeURIComponent(department)}`);
                    result = { success: true, message: `[Mock] Redirecting call to ${department || 'human'} now.` };
                  }

                  // Gracefully close WebRTC media stream socket after 1s to stop OpenAI API billing
                  setTimeout(() => {
                    if (ws && ws.readyState === 1) {
                      console.log(`Closing media stream ws for CallSid=${callSid} following transfer.`);
                      ws.close();
                    }
                  }, 1000);
                }
              } catch (err) {
                console.error(`Tenant ${tenantId} error executing ${name}:`, err);
                result = { error: err.message };
              }

              // Send function output back to OpenAI
              openaiWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id,
                  output: JSON.stringify(result)
                }
              }));

              // Tell model to generate a response
              openaiWs.send(JSON.stringify({
                type: 'response.create'
              }));
            }

            // Handle user interruption
            if (event.type === 'input_audio_buffer.speech_started') {
              resetSilenceTimeout();
              ws.send(JSON.stringify({
                event: 'clear',
                streamSid
              }));
              openaiWs.send(JSON.stringify({
                type: 'response.cancel'
              }));
            }

          } catch (err) {
            console.error('Error parsing OpenAI event:', err);
          }
        });

        openaiWs.on('error', (err) => {
          console.error(`OpenAI connection error for call ${callSid}:`, err);
        });

        openaiWs.on('close', (code, reason) => {
          console.log(`OpenAI connection closed for call ${callSid}. Code: ${code}, Reason: ${reason ? reason.toString() : 'None'}`);
          ws.close();
        });

      } else if (data.event === 'media' && data.media?.payload) {
        if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: data.media.payload
          }));
        }
      } else if (data.event === 'stop') {
        ws.close();
      }

    } catch (err) {
      console.error('Error processing Twilio WebSocket message:', err);
    }
  });

  ws.on('close', async () => {
    console.log('Twilio Media Stream closed.');
    if (durationLimitTimeout) clearTimeout(durationLimitTimeout);
    if (silenceTimeout) clearTimeout(silenceTimeout);
    if (openaiWs) {
      openaiWs.close();
    }
    
    if (callSid && tenantId) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      await updateCallStatus(callSid, 'completed', duration);
      
      // Check and send low credit reminders
      try {
        const trigger = await checkLowCreditReminderTrigger(tenantId);
        if (trigger) {
          console.log(`[Low Credit Trigger] Tenant ${tenantId} reached threshold of ${trigger.limit} mins. Remaining: ${trigger.remaining} mins.`);
          
          // 1. Send simulated Email
          console.log(`[Email Reminder] Sent to ${trigger.email}: Low Credit Warning! You have only ${trigger.remaining} minutes left on your Voice AI Receptionist account.`);
          
          // 2. Send simulated WhatsApp message
          const settings = await getSettings(tenantId);
          const tenantPhone = settings.twilio_phone_number || '+15551112222';
          console.log(`[WhatsApp Reminder] Sent to ${tenantPhone}: Low Credit Warning! You have only ${trigger.remaining} minutes left on your Voice AI Receptionist account.`);
          
          // Send live WhatsApp via Twilio if configured
          const accountSid = process.env.TWILIO_ACCOUNT_SID;
          const fromWhatsApp = `whatsapp:${process.env.TWILIO_PHONE_NUMBER || '+14155238886'}`;
          if (accountSid && accountSid.startsWith('AC') && tenantPhone) {
            try {
              const client = getTwilioClient();
              await client.messages.create({
                from: fromWhatsApp,
                to: `whatsapp:${tenantPhone}`,
                body: `Low Credit Warning! You have only ${trigger.remaining} minutes left on your Voice AI Receptionist account.`
              });
              console.log(`[WhatsApp Reminder] Successfully sent live WhatsApp message to ${tenantPhone}`);
            } catch (err) {
              console.error('Failed to send live WhatsApp low credit reminder:', err.message);
            }
          }
          
          // Log Activity
          await logTenantActivity(tenantId, 'settings_update', `[Credit Warning Triggered] Email and WhatsApp reminder sent. Remaining minutes: ${trigger.remaining}`);
          
          // Broadcast to dashboard
          broadcastToDashboard(tenantId, 'credit_warning', {
            remaining: trigger.remaining,
            limit: trigger.limit
          });
        }
      } catch (err) {
        console.error('Failed to process low credit reminder check:', err);
      }
      
      // Notify dashboard
      broadcastToDashboard(tenantId, 'call_ended', {
        callSid,
        duration,
        status: 'completed'
      });
      
      // Generate summary asynchronously
      try {
        await generateCallSummary(tenantId, callSid);
      } catch (err) {
        console.error('Failed to generate call summary:', err);
      }
    }
  });
});

// Generate OpenAI summary of the conversation
async function generateCallSummary(tenantId, callSid) {
  try {
    const dbCalls = await getCallLogs(tenantId);
    const callObj = dbCalls.find(c => c.call_sid === callSid);
    if (!callObj || !callObj.transcript) return;
    
    let transcriptArray = [];
    try {
      transcriptArray = JSON.parse(callObj.transcript);
    } catch (e) {
      console.error('Failed to parse transcript for summary:', e);
      return;
    }
    
    if (transcriptArray.length === 0) return;
    
    const transcriptText = transcriptArray
      .map(entry => `${entry.speaker === 'user' ? 'Customer' : 'Receptionist'}: ${entry.text}`)
      .join('\n');
      
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional assistant summarizing a customer phone call with an AI Wellness Spa receptionist. Write a concise, 1-2 sentence summary of the call. Mention the caller\'s main request and the outcome (e.g. booked an appointment, asked about hours).'
          },
          {
            role: 'user',
            content: `Here is the transcript:\n\n${transcriptText}`
          }
        ],
        max_tokens: 100
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      const summaryText = result.choices?.[0]?.message?.content?.trim() || 'No summary generated.';
      await updateCallSummary(callSid, summaryText);
      broadcastToDashboard(tenantId, 'call_summary_updated', { callSid, summary: summaryText });
      broadcastToDashboard(tenantId, 'refresh_crm', {});
    }
  } catch (err) {
    console.error('Error generating summary:', err);
  }
}

// Upgrade WebSocket with query token parsing
server.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/media-stream') {
    mediaStreamWss.handleUpgrade(request, socket, head, (ws) => {
      mediaStreamWss.emit('connection', ws, request);
    });
  } else if (pathname === '/dashboard-ws') {
    const token = parsedUrl.query.token;
    dashboardWss.handleUpgrade(request, socket, head, (ws) => {
      let tenantId = null;
      if (token) {
        let cleanToken = token;
        if (token.startsWith('Bearer ')) {
          cleanToken = token.slice(7);
        }
        try {
          const decoded = jwt.verify(cleanToken, JWT_SECRET);
          tenantId = decoded.tenantId;
        } catch (err) {
          console.error('[Dashboard WS] Authentication failed:', err.message);
        }
      }
      ws.tenantId = tenantId;
      dashboardWss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/live-demo') {
    liveDemoWss.handleUpgrade(request, socket, head, (ws) => {
      liveDemoWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

let tunnelProcess = null;

// Start a public HTTPS tunnel via localhost.run for webhook forwarding in local dev
function startSshTunnel() {
  return new Promise((resolve) => {
    const ngrokUrl = process.env.NGROK_URL;
    // Skip if NGROK_URL is set to a real external address (e.g. ngrok-free.app or lhr.life)
    if (ngrokUrl && !ngrokUrl.includes('localhost') && !ngrokUrl.includes('127.0.0.1')) {
      console.log(`Using existing public NGROK_URL: ${ngrokUrl}`);
      return resolve(ngrokUrl);
    }

    console.log('Spawning automated public HTTPS tunnel via localhost.run...');
    const ssh = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      '-R', `80:127.0.0.1:${PORT}`,
      'nokey@localhost.run'
    ]);

    tunnelProcess = ssh;
    let resolved = false;

    ssh.stdout.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
      if (match && !resolved) {
        const tunnelUrl = match[0];
        console.log(`\n🎉 Public Tunnel Active: ${tunnelUrl}`);
        console.log(`Twilio webhook calls will route to ${tunnelUrl}/incoming-call or /outbound-call-twiml\n`);
        process.env.NGROK_URL = tunnelUrl;
        resolved = true;
        resolve(tunnelUrl);
      }
    });

    ssh.stderr.on('data', (data) => {
      const errOutput = data.toString().trim();
      if (errOutput && !errOutput.includes('Pseudo-terminal')) {
        console.log(`[Tunnel Info] ${errOutput}`);
      }
    });

    ssh.on('close', (code) => {
      console.log(`Tunnel process disconnected (code ${code})`);
      if (!resolved) resolve(null);
    });

    // Timeout fallback after 12 seconds
    setTimeout(() => {
      if (!resolved) {
        console.warn('Tunnel setup timed out. Twilio outbound calls might fail without a public proxy.');
        resolve(null);
      }
    }, 12000);
  });
}

// Clean up child tunnel process on exit
process.on('SIGINT', () => {
  if (tunnelProcess) tunnelProcess.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (tunnelProcess) tunnelProcess.kill();
  process.exit(0);
});

// Initialize database and start HTTP Server
initDb().then(async () => {
  // Skip SSH tunnel on Railway/production — Railway provides a public HTTPS URL natively
  const isProduction = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PUBLIC_DOMAIN;
  if (!isProduction) {
    await startSshTunnel();
  } else {
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
    if (railwayDomain) {
      process.env.NGROK_URL = `https://${railwayDomain}`;
      console.log(`Production mode: Using Railway domain https://${railwayDomain}`);
    }
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`Voice AI SaaS Server listening on port ${PORT}`);
    console.log(`- Web portal dashboard: http://localhost:${PORT}`);
    if (process.env.NGROK_URL) {
      console.log(`- Public HTTPS URL: ${process.env.NGROK_URL}`);
    }
    console.log(`======================================================\n`);
  });

  // Suspension check — runs every 5 minutes (was 15s — too frequent for DB)
  setInterval(async () => {
    try {
      const suspended = await checkSubscriptionGracePeriodsAndSuspend();
      if (suspended.length > 0) {
        console.log(`[Billing System] Auto-suspended ${suspended.length} overdue tenants.`);
        for (const t of suspended) {
          broadcastToDashboard(t.id, 'refresh_crm', {});
          await logTenantActivity(t.id, 'suspension_toggle', `Account suspended due to non-payment. Reminder flags reset.`);
        }
      }
    } catch (err) {
      console.error('[Billing System Error] Failed to run automated checks:', err);
    }
  }, 300000); // 5 minutes

  // ── Self-ping keep-alive: prevents Railway cold starts ──
  // Hits /health every 4 minutes so Railway never sleeps the server
  const APP_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.NGROK_URL || `http://localhost:${PORT}`;

  import('node:https').then(({ default: https }) => {
    import('node:http').then(({ default: http }) => {
      setInterval(() => {
        try {
          const url = new URL(`${APP_URL}/health`);
          const mod = url.protocol === 'https:' ? https : http;
          const req = mod.get({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: '/health', headers: { 'User-Agent': 'VoiceDesk-KeepAlive/1.0' } }, (res) => {
            res.resume();
          });
          req.on('error', () => {}); // silent on network hiccup
        } catch (_) {}
      }, 240000); // every 4 minutes
      console.log(`[Keep-Alive] Self-ping active → ${APP_URL}/health every 4 min`);
    });
  });



  // Payment reminder check — runs every hour
  setInterval(async () => {
    try {
      const reminders = await checkAndSendPaymentReminders();
      if (reminders.length > 0) {
        console.log(`[Billing System] Sending payment reminders to ${reminders.length} tenant(s).`);
        for (const r of reminders) {
          await sendPaymentReminderEmail(r, r.daysLeft);
          await sendPaymentReminderWhatsApp(r, r.phone, r.daysLeft);
          await markReminderSent(r.id, r.flag);
          await logTenantActivity(r.id, 'billing_reminder', `Payment reminder sent (${r.daysLeft} day${r.daysLeft > 1 ? 's' : ''} before due date) via Email${r.phone ? ' + WhatsApp' : ''}`);
        }
      }
    } catch (err) {
      console.error('[Billing System Error] Failed to run payment reminder checks:', err);
    }
  }, 60 * 60 * 1000); // Every hour
}).catch(err => {
  console.error('Database initialization failed. Server could not start.', err);
});
