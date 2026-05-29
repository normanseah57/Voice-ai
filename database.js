import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, 'receptionist.db');

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    db.run("PRAGMA journal_mode=WAL;", (err) => {
      if (err) console.error("Error setting WAL mode:", err);
      else console.log("SQLite WAL mode activated.");
    });
  }
});

// Helper to run query with Promise
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Helper to get single row
const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Helper to get all rows
const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize DB schema
export const initDb = async () => {
  // Check if we need to upgrade to multi-tenant
  const tenantsTableExists = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'");
  
  if (!tenantsTableExists) {
    console.log('Upgrading single-tenant database to multi-tenant SaaS schema...');
    // Drop old single-tenant tables to avoid schema collisions
    await run('DROP TABLE IF EXISTS settings');
    await run('DROP TABLE IF EXISTS appointments');
    await run('DROP TABLE IF EXISTS calls');
    await run('DROP TABLE IF EXISTS contacts');
    await run('DROP TABLE IF EXISTS deals');
    await run('DROP TABLE IF EXISTS activities');
  }

  // 1. Tenants Table
  await run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      company_name TEXT,
      subscription_tier TEXT DEFAULT 'free', -- 'free', 'starter', 'professional'
      billing_cycle TEXT DEFAULT 'monthly', -- 'monthly', 'annual'
      prepaid_overage_minutes REAL DEFAULT 0,
      overage_reminder_limit REAL DEFAULT 0,
      overage_reminder_sent INTEGER DEFAULT 0,
      subscription_status TEXT DEFAULT 'active',
      usage_minutes REAL DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Run dynamic migration for existing databases
  try {
    await run('ALTER TABLE tenants ADD COLUMN is_admin INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE tenants ADD COLUMN billing_cycle TEXT DEFAULT 'monthly'");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE tenants ADD COLUMN prepaid_overage_minutes REAL DEFAULT 0");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE tenants ADD COLUMN overage_reminder_limit REAL DEFAULT 0");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE tenants ADD COLUMN overage_reminder_sent INTEGER DEFAULT 0");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE settings ADD COLUMN transfer_phone_number TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE settings ADD COLUMN resources_list TEXT DEFAULT "Staff Member 1"');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE settings ADD COLUMN voice TEXT DEFAULT 'alloy'");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE settings ADD COLUMN voice_accent TEXT DEFAULT 'default'");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE settings ADD COLUMN agent_name TEXT DEFAULT 'Aura'");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE appointments ADD COLUMN resource_name TEXT DEFAULT "General"');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE settings ADD COLUMN working_hours TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE settings ADD COLUMN break_periods TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE settings ADD COLUMN appointment_gap INTEGER DEFAULT 15');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run("ALTER TABLE settings ADD COLUMN system_mode TEXT DEFAULT 'service'");
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE appointments ADD COLUMN table_number TEXT');
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await run('ALTER TABLE appointments ADD COLUMN party_size INTEGER DEFAULT 1');
  } catch (e) {
    // Column already exists, ignore
  }

  // 2. Settings Table (scoped by tenant_id)
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      tenant_id INTEGER PRIMARY KEY,
      company_name TEXT,
      business_hours TEXT,
      services_offered TEXT,
      openai_model TEXT,
      system_prompt TEXT,
      twilio_phone_number TEXT,
      transfer_phone_number TEXT,
      resources_list TEXT,
      voice TEXT DEFAULT 'alloy',
      voice_accent TEXT DEFAULT 'default',
      agent_name TEXT DEFAULT 'Aura',
      working_hours TEXT,
      break_periods TEXT,
      appointment_gap INTEGER DEFAULT 15,
      system_mode TEXT DEFAULT 'service',
      payment_gateway_provider TEXT DEFAULT 'sandbox',
      stripe_publishable_key TEXT,
      stripe_secret_key TEXT,
      max_call_duration INTEGER DEFAULT 10,
      max_no_speech_timeout INTEGER DEFAULT 30,
      website_url TEXT,
      crawled_content TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 3. Appointments Table (scoped by tenant_id)
  await run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      service TEXT NOT NULL,
      notes TEXT,
      resource_name TEXT DEFAULT 'General',
      table_number TEXT,
      party_size INTEGER DEFAULT 1,
      checkout_date TEXT,
      room_number TEXT,
      gcal_synced INTEGER DEFAULT 0,
      price REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 4. Calls Table (scoped by tenant_id)
  await run(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      call_sid TEXT UNIQUE NOT NULL,
      direction TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      status TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      summary TEXT,
      transcript TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 5. Contacts Table (scoped by tenant_id, unique phone per tenant)
  await run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT NOT NULL,
      company_name TEXT,
      lead_stage TEXT DEFAULT 'lead',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, phone),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 6. Deals Table (scoped by tenant_id)
  await run(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL DEFAULT 0,
      stage TEXT DEFAULT 'appointmentscheduled',
      close_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  // 7. Activities Table (scoped by tenant_id)
  await run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'call', 'email', 'meeting', 'note', 'deal_created', 'deal_moved'
      title TEXT NOT NULL,
      description TEXT,
      association_sid TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  // 8. Tenant/Platform Activities Table (for Admin Console)
  await run(`
    CREATE TABLE IF NOT EXISTS tenant_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      company_name TEXT,
      activity_type TEXT NOT NULL, -- 'registration', 'billing_upgrade', 'settings_update', 'call_started', 'call_completed', 'appointment_booked', 'suspension_toggle'
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 9. Tenant Users Table (Support multi-user workspace calendars)
  await run(`
    CREATE TABLE IF NOT EXISTS tenant_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'member', -- 'owner', 'member'
      google_calendar_email TEXT,
      google_calendar_connected INTEGER DEFAULT 0,
      working_hours TEXT,
      appointment_gap INTEGER DEFAULT 15,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 10. Restaurant Tables Table
  await run(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      table_number TEXT NOT NULL,
      seats INTEGER NOT NULL,
      UNIQUE(tenant_id, table_number),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 11. Hotel Rooms Table
  await run(`
    CREATE TABLE IF NOT EXISTS hotel_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      room_number TEXT NOT NULL,
      room_type TEXT NOT NULL,
      price_per_night REAL NOT NULL,
      UNIQUE(tenant_id, room_number),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 12. Services Table
  await run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      duration INTEGER DEFAULT 30,
      description TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // Migrations: Alter appointments table to add checkout_date and room_number
  try {
    await run("ALTER TABLE appointments ADD COLUMN checkout_date TEXT");
  } catch (err) {
    // Column might already exist
  }
  try {
    await run("ALTER TABLE appointments ADD COLUMN room_number TEXT");
  } catch (err) {
    // Column might already exist
  }
  try {
    await run("ALTER TABLE settings ADD COLUMN payment_gateway_provider TEXT DEFAULT 'sandbox'");
  } catch (err) {
    // Column might already exist
  }
  try {
    await run("ALTER TABLE settings ADD COLUMN stripe_publishable_key TEXT");
  } catch (err) {
    // Already exists
  }
  try {
    await run("ALTER TABLE settings ADD COLUMN stripe_secret_key TEXT");
  } catch (err) {
    // Already exists
  }
  try {
    await run("ALTER TABLE settings ADD COLUMN max_call_duration INTEGER DEFAULT 10");
  } catch (err) {
    // Already exists
  }
  try {
    await run("ALTER TABLE settings ADD COLUMN max_no_speech_timeout INTEGER DEFAULT 30");
  } catch (err) {
    // Already exists
  }
  try {
    await run("ALTER TABLE settings ADD COLUMN website_url TEXT");
  } catch (err) {
    // Already exists
  }
  try {
    await run("ALTER TABLE settings ADD COLUMN crawled_content TEXT");
  } catch (err) {
    // Already exists
  }
  try {
    await run("ALTER TABLE appointments ADD COLUMN payment_status TEXT DEFAULT 'unpaid'");
  } catch (err) {
    // Already exists
  }
  try {
    await run("ALTER TABLE appointments ADD COLUMN price REAL DEFAULT 0");
  } catch (err) {
    // Already exists
  }

  // Backfill existing tenants into tenant_users as owner role to ensure compatibility
  try {
    const tenants = await all('SELECT * FROM tenants');
    for (const t of tenants) {
      const userExists = await get('SELECT id FROM tenant_users WHERE email = ?', [t.email]);
      if (!userExists) {
        const defaultWorkingHours = JSON.stringify({
          monday: { active: true, start: '09:00', end: '17:00' },
          tuesday: { active: true, start: '09:00', end: '17:00' },
          wednesday: { active: true, start: '09:00', end: '17:00' },
          thursday: { active: true, start: '09:00', end: '17:00' },
          friday: { active: true, start: '09:00', end: '17:00' },
          saturday: { active: false, start: '10:00', end: '14:00' },
          sunday: { active: false, start: '10:00', end: '14:00' }
        });
        const defaultBreakPeriods = JSON.stringify([
          { name: 'Lunch', start: '12:00', end: '13:00' }
        ]);
        
        await run(`
          INSERT INTO tenant_users (tenant_id, name, email, password_hash, role, working_hours, break_periods, appointment_gap)
          VALUES (?, ?, ?, ?, 'owner', ?, ?, 15)
        `, [t.id, t.name, t.email, t.password_hash, defaultWorkingHours, defaultBreakPeriods]);
        console.log(`Backfilled workspace owner user for Tenant ID ${t.id} (${t.email})`);
      }
    }
  } catch (err) {
    console.error('Failed to backfill existing tenants:', err);
  }

  // Seed default super admin account
  try {
    const adminExists = await get('SELECT id FROM tenants WHERE email = ?', ['admin@aurasaas.com']);
    if (!adminExists) {
      await run(`
        INSERT INTO tenants (name, email, password_hash, company_name, subscription_tier, subscription_status, is_admin)
        VALUES ('Super Admin', 'admin@aurasaas.com', 'admin123', 'VoiceDesk Inc.', 'professional', 'active', 1)
      `);
      console.log('Default super admin account seeded: admin@aurasaas.com');
    }
  } catch (err) {
    console.error('Failed to seed default super admin account:', err);
  }

  // Seed initial activities if table is empty
  try {
    const activitiesCount = await get('SELECT COUNT(*) as count FROM tenant_activities');
    if (activitiesCount.count === 0) {
      await run(`
        INSERT INTO tenant_activities (tenant_id, company_name, activity_type, description, created_at)
        VALUES 
          (NULL, 'System / Platform', 'registration', 'Platform admin console successfully initialized.', datetime('now', '-2 hours')),
          (1, 'Aura Wellness Spa', 'registration', 'Workspace "Aura Wellness Spa" registered.', datetime('now', '-1.8 hours')),
          (1, 'Aura Wellness Spa', 'settings_update', 'AI settings updated (Receptionist: "Aura", Voice: "alloy", Accent: "default")', datetime('now', '-1.5 hours')),
          (1, 'Aura Wellness Spa', 'appointment_booked', 'Appointment scheduled: Alice Smith (Swedish Massage on 2026-06-01 at 10:00)', datetime('now', '-1.2 hours'))
      `);
      console.log('Seeded initial platform activities.');
    }
  } catch (err) {
    console.error('Failed to seed platform activities:', err);
  }

  // 12. Accounting Contacts
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'customer', 'supplier'
      email TEXT,
      phone TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 13. Accounting Invoices
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL,
      contact_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      total REAL NOT NULL,
      paid REAL DEFAULT 0,
      balance REAL NOT NULL,
      status TEXT NOT NULL, -- 'draft', 'unpaid', 'paid', 'overdue'
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id) REFERENCES accounting_contacts(id) ON DELETE CASCADE
    )
  `);

  // 14. Accounting Bills
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      bill_number TEXT NOT NULL,
      contact_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      total REAL NOT NULL,
      paid REAL DEFAULT 0,
      balance REAL NOT NULL,
      status TEXT NOT NULL, -- 'draft', 'unpaid', 'paid', 'overdue'
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id) REFERENCES accounting_contacts(id) ON DELETE CASCADE
    )
  `);

  // 15. Accounting Payments
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      invoice_id INTEGER,
      bill_id INTEGER,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      method TEXT NOT NULL, -- 'cash', 'bank', 'credit_card', 'cheque'
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 16. Accounting Expenses
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 17. Accounting Items
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      sku TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 18. Accounting Chart of Accounts
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'asset', 'liability', 'equity', 'revenue', 'expense'
      UNIQUE(tenant_id, code),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 19. Accounting Quotations
  await run(`
    CREATE TABLE IF NOT EXISTS accounting_quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      quotation_number TEXT NOT NULL,
      contact_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL, -- 'draft', 'sent', 'accepted', 'declined'
      description TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id) REFERENCES accounting_contacts(id) ON DELETE CASCADE
    )
  `);

  // Seed Accounting Chart of Accounts
  try {
    const tenants = await all('SELECT id FROM tenants');
    for (const t of tenants) {
      const accountsCount = await get('SELECT COUNT(*) as count FROM accounting_accounts WHERE tenant_id = ?', [t.id]);
      if (accountsCount.count === 0) {
        const defaultAccounts = [
          { code: '1000', name: 'Cash at Bank', type: 'asset' },
          { code: '1200', name: 'Accounts Receivable', type: 'asset' },
          { code: '1400', name: 'Inventory', type: 'asset' },
          { code: '2000', name: 'Accounts Payable', type: 'liability' },
          { code: '3000', name: 'Owner Equity', type: 'equity' },
          { code: '4000', name: 'Sales Revenue', type: 'revenue' },
          { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
          { code: '6000', name: 'Rent Expense', type: 'expense' },
          { code: '6100', name: 'Utilities Expense', type: 'expense' },
          { code: '6200', name: 'Marketing & Advertising', type: 'expense' }
        ];
        for (const act of defaultAccounts) {
          await run(`
            INSERT OR IGNORE INTO accounting_accounts (tenant_id, code, name, type)
            VALUES (?, ?, ?, ?)
          `, [t.id, act.code, act.name, act.type]);
        }

        // Seed some default items
        await run(`
          INSERT INTO accounting_items (tenant_id, name, price, sku)
          VALUES 
            (?, 'Swedish Massage (60m)', 80.00, 'SW-MASS-60'),
            (?, 'Deep Tissue Massage (60m)', 100.00, 'DT-MASS-60'),
            (?, 'Facial Treatment (45m)', 90.00, 'FC-TREAT-45')
        `, [t.id, t.id, t.id]);

        // Seed default contacts
        await run(`
          INSERT INTO accounting_contacts (tenant_id, name, type, email, phone)
          VALUES 
            (?, 'Alice Smith', 'customer', 'alice@gmail.com', '+6591234567'),
            (?, 'Bob Jones', 'customer', 'bob@gmail.com', '+6598765432'),
            (?, 'Massage Supplies SG', 'supplier', 'info@massagesupplies.sg', '+6561112222')
        `, [t.id, t.id, t.id]);

        // Fetch contacts to get IDs
        const customers = await all('SELECT id FROM accounting_contacts WHERE tenant_id = ? AND type = "customer"', [t.id]);
        const suppliers = await all('SELECT id FROM accounting_contacts WHERE tenant_id = ? AND type = "supplier"', [t.id]);

        if (customers.length >= 2 && suppliers.length >= 1) {
          // Seed default invoices
          await run(`
            INSERT INTO accounting_invoices (tenant_id, invoice_number, contact_id, date, due_date, total, paid, balance, status)
            VALUES 
              (?, 'INV-2026-001', ?, date('now', '-5 days'), date('now', '+25 days'), 80.00, 80.00, 0.00, 'paid'),
              (?, 'INV-2026-002', ?, date('now', '-2 days'), date('now', '+28 days'), 100.00, 0.00, 100.00, 'unpaid'),
              (?, 'INV-2026-003', ?, date('now', '-15 days'), date('now', '-5 days'), 90.00, 0.00, 90.00, 'overdue')
          `, [t.id, customers[0].id, t.id, customers[1].id, t.id, customers[0].id]);

          // Seed default bills
          await run(`
            INSERT INTO accounting_bills (tenant_id, bill_number, contact_id, date, due_date, total, paid, balance, status)
            VALUES 
              (?, 'BILL-2026-001', ?, date('now', '-10 days'), date('now', '+20 days'), 250.00, 250.00, 0.00, 'paid'),
              (?, 'BILL-2026-002', ?, date('now', '-1 days'), date('now', '+14 days'), 120.00, 0.00, 120.00, 'unpaid')
          `, [t.id, suppliers[0].id, t.id, suppliers[0].id]);

          // Seed default payments
          const invoices = await all('SELECT id FROM accounting_invoices WHERE tenant_id = ?', [t.id]);
          const bills = await all('SELECT id FROM accounting_bills WHERE tenant_id = ?', [t.id]);
          if (invoices.length > 0) {
            await run(`
              INSERT INTO accounting_payments (tenant_id, invoice_id, amount, date, method)
              VALUES (?, ?, 80.00, date('now', '-5 days'), 'credit_card')
            `, [t.id, invoices[0].id]);
          }
          if (bills.length > 0) {
            await run(`
              INSERT INTO accounting_payments (tenant_id, bill_id, amount, date, method)
              VALUES (?, ?, 250.00, date('now', '-10 days'), 'bank')
            `, [t.id, bills[0].id]);
          }

          // Seed default expenses
          await run(`
            INSERT INTO accounting_expenses (tenant_id, category, amount, date, description)
            VALUES 
              (?, 'Rent', 1200.00, date('now', '-20 days'), 'Office rent for May'),
              (?, 'Utilities', 150.00, date('now', '-10 days'), 'Water & Electric bill')
          `, [t.id, t.id]);
        }
      }
    }
  } catch (err) {
    console.error('Failed to seed default accounting data:', err);
  }

  console.log('Multi-Tenant Database schema initialized.');
  await logTenantActivity(null, 'registration', 'Voice AI SaaS server booted successfully.');
};

// ==========================================
// SAAS TENANCY OPERATIONS
// ==========================================

export const registerTenant = async ({ name, email, password, company_name }) => {
  const existingTenant = await get('SELECT id FROM tenants WHERE email = ?', [email]);
  const existingUser = await get('SELECT id FROM tenant_users WHERE email = ?', [email]);
  if (existingTenant || existingUser) {
    throw new Error('Email address already registered.');
  }

  // Insert Tenant
  const result = await run(`
    INSERT INTO tenants (name, email, password_hash, company_name, subscription_tier, subscription_status)
    VALUES (?, ?, ?, ?, 'free', 'active')
  `, [name, email, password, company_name]);

  const tenantId = result.id;

  // Insert default Settings for Tenant
  const systemPrompt = `You are Aura, the professional and warm AI receptionist for ${company_name || 'Aura Wellness Spa'}. Your goal is to assist callers with booking appointments, answering questions about our services and hours, and recording messages if necessary.

Services offered:
- Swedish Massage: $80, 60 minutes
- Deep Tissue Massage: $100, 60 minutes
- Facial Treatment: $90, 45 minutes
- Aromatherapy: $110, 60 minutes

Business hours:
Monday to Friday, 9:00 AM to 6:00 PM.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (09:00 to 18:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.

Conversational Style:
- Speak in a friendly, polite, and professional tone.
- Keep responses concise (one or two sentences) to maintain a natural conversation flow.
- If the user interrupts, stop talking and listen.`;

  const defaultWorkingHours = JSON.stringify({
    monday: { active: true, start: '09:00', end: '17:00' },
    tuesday: { active: true, start: '09:00', end: '17:00' },
    wednesday: { active: true, start: '09:00', end: '17:00' },
    thursday: { active: true, start: '09:00', end: '17:00' },
    friday: { active: true, start: '09:00', end: '17:00' },
    saturday: { active: false, start: '10:00', end: '14:00' },
    sunday: { active: false, start: '10:00', end: '14:00' }
  });
  const defaultBreakPeriods = JSON.stringify([
    { name: 'Lunch', start: '12:00', end: '13:00' }
  ]);

  await run(`
    INSERT INTO settings (
      tenant_id, company_name, business_hours, services_offered, openai_model, system_prompt, 
      twilio_phone_number, transfer_phone_number, resources_list, voice, voice_accent, agent_name, 
      working_hours, break_periods, appointment_gap, max_call_duration, max_no_speech_timeout
    )
    VALUES (?, ?, 'Monday to Friday, 9:00 AM to 6:00 PM', 'Swedish Massage ($80), Deep Tissue Massage ($100), Facial Treatment ($90), Aromatherapy ($110)', 'gpt-4o-realtime-preview-2024-12-17', ?, '', '', 'Therapist A, Therapist B', 'alloy', 'default', 'Aura', ?, ?, 15, 10, 30)
  `, [tenantId, company_name || 'Aura Wellness Spa', systemPrompt, defaultWorkingHours, defaultBreakPeriods]);

  // Insert primary user (owner) into tenant_users
  await run(`
    INSERT INTO tenant_users (tenant_id, name, email, password_hash, role, working_hours, break_periods, appointment_gap)
    VALUES (?, ?, ?, ?, 'owner', ?, ?, 15)
  `, [tenantId, name, email, password, defaultWorkingHours, defaultBreakPeriods]);

  // Insert demo CRM data for this new tenant
  const c1 = await run(`
    INSERT INTO contacts (tenant_id, name, email, phone, company_name, lead_stage)
    VALUES (?, 'Alice Smith', 'alice@smithsalon.com', '+15551234567', 'Smiths Salon', 'opportunity')
  `, [tenantId]);
  const c2 = await run(`
    INSERT INTO contacts (tenant_id, name, email, phone, company_name, lead_stage)
    VALUES (?, 'Bob Jones', 'bob@jonesgym.com', '+15559876543', 'Bobs Fitness', 'customer')
  `, [tenantId]);

  // Insert Deals
  await run(`
    INSERT INTO deals (tenant_id, contact_id, name, amount, stage, close_date)
    VALUES (?, ?, 'Spa Package', 250.00, 'appointmentscheduled', ?)
  `, [tenantId, c1.id, new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]]);

  // Insert Activities
  await run(`
    INSERT INTO activities (tenant_id, contact_id, type, title, description)
    VALUES (?, ?, 'note', 'Relationship Note', 'Alice prefers light tea post treatment.')
  `, [tenantId, c1.id]);

  await logTenantActivity(tenantId, 'registration', `New workspace registered for "${company_name || 'Aura Wellness Spa'}" by ${name} (${email})`);
  return { id: tenantId, name, email, company_name, subscription_tier: 'free', billing_cycle: 'monthly' };
};

export const authenticateTenant = async (email, password) => {
  const user = await get('SELECT * FROM tenant_users WHERE email = ?', [email]);
  if (!user || user.password_hash !== password) {
    throw new Error('Invalid email or password.');
  }
  const tenant = await get('SELECT * FROM tenants WHERE id = ?', [user.tenant_id]);
  if (!tenant) {
    throw new Error('Workspace not found.');
  }
  return {
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
  };
};

export const getTenantUsage = async (tenant_id) => {
  const tenant = await get('SELECT subscription_tier, billing_cycle, prepaid_overage_minutes, overage_reminder_limit, usage_minutes, subscription_status FROM tenants WHERE id = ?', [tenant_id]);
  if (!tenant) throw new Error('Tenant not found');

  const apptsCount = await get('SELECT COUNT(*) as count FROM appointments WHERE tenant_id = ?', [tenant_id]);
  const contactsCount = await get('SELECT COUNT(*) as count FROM contacts WHERE tenant_id = ?', [tenant_id]);
  const dealsCount = await get('SELECT COUNT(*) as count FROM deals WHERE tenant_id = ?', [tenant_id]);

  return {
    tier: tenant.subscription_tier,
    billing_cycle: tenant.billing_cycle || 'monthly',
    prepaid_overage_minutes: tenant.prepaid_overage_minutes || 0,
    overage_reminder_limit: tenant.overage_reminder_limit || 0,
    usage_minutes: tenant.usage_minutes,
    subscription_status: tenant.subscription_status || 'active',
    usage_appointments: apptsCount.count,
    usage_contacts: contactsCount.count,
    usage_deals: dealsCount.count
  };
};

export const updateTenantSubscription = async (tenant_id, tier, billing_cycle = 'monthly') => {
  await run('UPDATE tenants SET subscription_tier = ?, billing_cycle = ?, subscription_status = \'active\' WHERE id = ?', [tier, billing_cycle, tenant_id]);
  await logTenantActivity(tenant_id, 'billing_upgrade', `Upgraded subscription plan to ${tier.toUpperCase()} (${billing_cycle.toUpperCase()})`);
  return getTenantUsage(tenant_id);
};

// ==========================================
// SCOPED SETTINGS
// ==========================================
export const getSettings = async (tenant_id) => {
  const defaultWorkingHours = JSON.stringify({
    monday: { active: true, start: '09:00', end: '17:00' },
    tuesday: { active: true, start: '09:00', end: '17:00' },
    wednesday: { active: true, start: '09:00', end: '17:00' },
    thursday: { active: true, start: '09:00', end: '17:00' },
    friday: { active: true, start: '09:00', end: '17:00' },
    saturday: { active: false, start: '10:00', end: '14:00' },
    sunday: { active: false, start: '10:00', end: '14:00' }
  });
  const defaultBreakPeriods = JSON.stringify([
    { name: 'Lunch', start: '12:00', end: '13:00' }
  ]);

  const r = await get('SELECT * FROM settings WHERE tenant_id = ?', [tenant_id]);
  if (!r) {
    return {
      company_name: 'My Workspace',
      business_hours: 'Monday to Friday, 9:00 AM to 6:00 PM',
      services_offered: 'General Services',
      openai_model: 'gpt-4o-mini-realtime-preview',
      system_prompt: 'You are a helpful AI receptionist.',
      twilio_phone_number: '',
      transfer_phone_number: '',
      resources_list: 'Staff Member 1',
      voice: 'alloy',
      voice_accent: 'default',
      agent_name: 'Aura',
      working_hours: defaultWorkingHours,
      break_periods: defaultBreakPeriods,
      appointment_gap: 15,
      system_mode: 'service',
      payment_gateway_provider: 'sandbox',
      stripe_publishable_key: '',
      max_call_duration: 10,
      max_no_speech_timeout: 30,
      website_url: '',
      crawled_content: ''
    };
  }
  return {
    company_name: r.company_name || 'My Workspace',
    business_hours: r.business_hours || 'Monday to Friday, 9:00 AM to 6:00 PM',
    services_offered: r.services_offered || 'General Services',
    openai_model: r.openai_model || 'gpt-4o-mini-realtime-preview',
    system_prompt: r.system_prompt || 'You are a helpful AI receptionist.',
    twilio_phone_number: r.twilio_phone_number || '',
    transfer_phone_number: r.transfer_phone_number || '',
    resources_list: r.resources_list || 'Staff Member 1',
    voice: r.voice || 'alloy',
    voice_accent: r.voice_accent || 'default',
    agent_name: r.agent_name || 'Aura',
    working_hours: r.working_hours || defaultWorkingHours,
    break_periods: r.break_periods || defaultBreakPeriods,
    appointment_gap: r.appointment_gap !== null && r.appointment_gap !== undefined ? r.appointment_gap : 15,
    system_mode: r.system_mode || 'service',
    payment_gateway_provider: r.payment_gateway_provider || 'sandbox',
    stripe_publishable_key: r.stripe_publishable_key || '',
    stripe_secret_key: r.stripe_secret_key || '',
    max_call_duration: r.max_call_duration !== null && r.max_call_duration !== undefined ? r.max_call_duration : 10,
    max_no_speech_timeout: r.max_no_speech_timeout !== null && r.max_no_speech_timeout !== undefined ? r.max_no_speech_timeout : 30,
    website_url: r.website_url || '',
    crawled_content: r.crawled_content || ''
  };
};

export const updateSettings = async (tenant_id, settingsObj) => {
  const defaultWorkingHours = JSON.stringify({
    monday: { active: true, start: '09:00', end: '17:00' },
    tuesday: { active: true, start: '09:00', end: '17:00' },
    wednesday: { active: true, start: '09:00', end: '17:00' },
    thursday: { active: true, start: '09:00', end: '17:00' },
    friday: { active: true, start: '09:00', end: '17:00' },
    saturday: { active: false, start: '10:00', end: '14:00' },
    sunday: { active: false, start: '10:00', end: '14:00' }
  });
  const defaultBreakPeriods = JSON.stringify([
    { name: 'Lunch', start: '12:00', end: '13:00' }
  ]);

  await run(`
    INSERT OR REPLACE INTO settings (
      tenant_id, company_name, business_hours, services_offered, openai_model, system_prompt, 
      twilio_phone_number, transfer_phone_number, resources_list, voice, voice_accent, agent_name,
      working_hours, break_periods, appointment_gap, system_mode,
      payment_gateway_provider, stripe_publishable_key, stripe_secret_key,
      max_call_duration, max_no_speech_timeout,
      website_url, crawled_content
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    tenant_id,
    settingsObj.company_name,
    settingsObj.business_hours,
    settingsObj.services_offered,
    settingsObj.openai_model,
    settingsObj.system_prompt,
    settingsObj.twilio_phone_number || '',
    settingsObj.transfer_phone_number || '',
    settingsObj.resources_list || 'Staff Member 1',
    settingsObj.voice || 'alloy',
    settingsObj.voice_accent || 'default',
    settingsObj.agent_name || 'Aura',
    settingsObj.working_hours ? (typeof settingsObj.working_hours === 'object' ? JSON.stringify(settingsObj.working_hours) : settingsObj.working_hours) : defaultWorkingHours,
    settingsObj.break_periods ? (typeof settingsObj.break_periods === 'object' ? JSON.stringify(settingsObj.break_periods) : settingsObj.break_periods) : defaultBreakPeriods,
    settingsObj.appointment_gap !== undefined && settingsObj.appointment_gap !== null ? parseInt(settingsObj.appointment_gap) : 15,
    settingsObj.system_mode || 'service',
    settingsObj.payment_gateway_provider || 'sandbox',
    settingsObj.stripe_publishable_key || '',
    settingsObj.stripe_secret_key || '',
    settingsObj.max_call_duration !== undefined && settingsObj.max_call_duration !== null ? parseInt(settingsObj.max_call_duration) : 10,
    settingsObj.max_no_speech_timeout !== undefined && settingsObj.max_no_speech_timeout !== null ? parseInt(settingsObj.max_no_speech_timeout) : 30,
    settingsObj.website_url || '',
    settingsObj.crawled_content || ''
  ]);
  await logTenantActivity(tenant_id, 'settings_update', `AI settings updated (Receptionist: "${settingsObj.agent_name || 'Aura'}", Voice: "${settingsObj.voice || 'alloy'}", Accent: "${settingsObj.voice_accent || 'default'}")`);
  return getSettings(tenant_id);
};

export const normalizePhone = (phone) => {
  if (!phone) return '';
  // Remove non-digit characters
  let cleaned = phone.toString().replace(/\D/g, '');
  // Remove leading 0 (common in local numbers before country code is added)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
};

export const findTenantByTwilioNumber = async (twilioNumber) => {
  const settings = await all('SELECT tenant_id, twilio_phone_number FROM settings WHERE twilio_phone_number IS NOT NULL AND twilio_phone_number != ""');
  const target = normalizePhone(twilioNumber);
  if (!target) return null;
  
  let bestMatchTenantId = null;
  let bestMatchLen = 0;
  
  for (const s of settings) {
    const candidate = normalizePhone(s.twilio_phone_number);
    if (!candidate) continue;
    
    if (candidate === target) {
      return s.tenant_id; // Exact match, return immediately
    }
    
    // Check if one is suffix of another
    const minLen = Math.min(candidate.length, target.length);
    if (minLen >= 7) {
      const suffix1 = candidate.substring(candidate.length - minLen);
      const suffix2 = target.substring(target.length - minLen);
      if (suffix1 === suffix2 && minLen > bestMatchLen) {
        bestMatchLen = minLen;
        bestMatchTenantId = s.tenant_id;
      }
    }
  }
  return bestMatchTenantId;
};

// ==========================================
// SCOPED APPOINTMENTS
// ==========================================
export const getAppointments = async (tenant_id) => {
  return await all('SELECT * FROM appointments WHERE tenant_id = ? ORDER BY date ASC, time ASC', [tenant_id]);
};

export const addAppointment = async (tenant_id, { customer_name, customer_phone, date, time, service, notes = '', resource_name = 'General', table_number = null, party_size = 1, checkout_date = null, room_number = null }) => {
  // Check SaaS limits first
  const usage = await getTenantUsage(tenant_id);
  const limits = { free: 5, starter: 99999, professional: 99999, enterprise: 99999 };
  if (usage.usage_appointments >= limits[usage.tier]) {
    throw new Error(`SaaS Limit Exceeded: You have reached the maximum number of appointments (${limits[usage.tier]}) allowed on the ${usage.tier.toUpperCase()} Tier. Please upgrade to create more bookings.`);
  }

  const settings = await getSettings(tenant_id);
  const isRestaurant = settings.system_mode === 'restaurant';
  const isHotel = settings.system_mode === 'hotel';

  let allocatedTable = table_number;
  let allocatedRoom = room_number;
  let finalCheckoutDate = checkout_date;

  if (isRestaurant && !allocatedTable) {
    const availResult = await checkAvailability(tenant_id, date, time, null, party_size);
    if (!availResult.available) {
      throw new Error(`Booking failed: No tables available for a party of ${party_size} at ${time} on ${date}.`);
    }
    allocatedTable = availResult.suggested_resource;
  } else if (isHotel) {
    if (!finalCheckoutDate) {
      try {
        const parts = date.split('-');
        const checkinDateObj = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
        checkinDateObj.setUTCDate(checkinDateObj.getUTCDate() + 1);
        finalCheckoutDate = checkinDateObj.toISOString().split('T')[0];
      } catch (e) {
        throw new Error('Invalid check-in date format.');
      }
    }
    const availResult = await checkAvailability(tenant_id, date, time, allocatedRoom || resource_name || service, party_size, finalCheckoutDate);
    if (!availResult.available) {
      throw new Error(`Booking failed: ${availResult.message}`);
    }
    allocatedRoom = availResult.resource_name;
  }

  const assignedResource = isRestaurant ? (allocatedTable || 'Table') : (isHotel ? (allocatedRoom || 'Room') : (resource_name || 'General'));

  let calculatedPrice = 80; // Standard default
  if (isHotel) {
    try {
      const partsIn = date.split('-');
      const partsOut = finalCheckoutDate.split('-');
      const d1 = Date.UTC(parseInt(partsIn[0]), parseInt(partsIn[1]) - 1, parseInt(partsIn[2]));
      const d2 = Date.UTC(parseInt(partsOut[0]), parseInt(partsOut[1]) - 1, parseInt(partsOut[2]));
      const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
      
      let pricePerNight = 150; // Fallback
      if (allocatedRoom) {
        const roomObj = await get('SELECT price_per_night FROM hotel_rooms WHERE tenant_id = ? AND room_number = ?', [tenant_id, allocatedRoom]);
        if (roomObj) pricePerNight = roomObj.price_per_night;
      }
      calculatedPrice = nights * pricePerNight;
    } catch (e) {
      calculatedPrice = 150;
    }
  } else {
    const serviceCosts = {
      'Swedish Massage': 80,
      'Deep Tissue Massage': 100,
      'Facial Treatment': 90,
      'Aromatherapy': 110
    };
    calculatedPrice = serviceCosts[service] || 80;
  }

  const result = await run(`
    INSERT INTO appointments (tenant_id, customer_name, customer_phone, date, time, service, notes, resource_name, table_number, party_size, checkout_date, room_number, price, payment_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid')
  `, [tenant_id, customer_name, customer_phone, date, time, service, notes, assignedResource, allocatedTable, parseInt(party_size || 1), finalCheckoutDate, allocatedRoom, calculatedPrice]);
  
  await logTenantActivity(tenant_id, 'appointment_booked', isRestaurant 
    ? `Table Reservation: ${customer_name} (${service} at Table ${allocatedTable} for party of ${party_size} on ${date} at ${time})`
    : (isHotel
      ? `Hotel Booking: ${customer_name} (${service} in Room ${allocatedRoom} from ${date} to ${finalCheckoutDate})`
      : `Appointment scheduled: ${customer_name} (${service} with ${assignedResource} on ${date} at ${time})`)
  );
  
  // Auto-CRM sync scoping
  try {
    let contact = await findContactByPhone(tenant_id, customer_phone);
    if (!contact) {
      contact = await addContact(tenant_id, {
        name: customer_name,
        email: '',
        phone: customer_phone,
        company_name: 'Inbound Call Lead',
        lead_stage: 'opportunity'
      });
    } else {
      await updateContactLeadStage(tenant_id, contact.id, 'opportunity');
    }

    let amount = 80;
    if (isHotel) {
      try {
        const partsIn = date.split('-');
        const partsOut = finalCheckoutDate.split('-');
        const d1 = Date.UTC(parseInt(partsIn[0]), parseInt(partsIn[1]) - 1, parseInt(partsIn[2]));
        const d2 = Date.UTC(parseInt(partsOut[0]), parseInt(partsOut[1]) - 1, parseInt(partsOut[2]));
        const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        
        let pricePerNight = 150; // Fallback
        if (allocatedRoom) {
          const roomObj = await get('SELECT price_per_night FROM hotel_rooms WHERE tenant_id = ? AND room_number = ?', [tenant_id, allocatedRoom]);
          if (roomObj) pricePerNight = roomObj.price_per_night;
        }
        amount = nights * pricePerNight;
      } catch (e) {
        amount = 150;
      }
    } else {
      const serviceCosts = {
        'Swedish Massage': 80,
        'Deep Tissue Massage': 100,
        'Facial Treatment': 90,
        'Aromatherapy': 110
      };
      amount = serviceCosts[service] || 80;
    }
    
    await addDeal(tenant_id, {
      contact_id: contact.id,
      name: isHotel ? `${service} Stay - Room ${allocatedRoom}` : `${service} - Booking`,
      amount,
      stage: 'appointmentscheduled',
      close_date: date
    });

    await addActivity(tenant_id, {
      contact_id: contact.id,
      type: 'meeting',
      title: isHotel ? `Booked Room ${allocatedRoom}` : `Scheduled ${service}`,
      description: isHotel 
        ? `Hotel stay booked in Room ${allocatedRoom} from ${date} to ${finalCheckoutDate}.`
        : `Appointment booked with ${assignedResource} for ${date} at ${time}. Notes: ${notes}`
    });
  } catch (err) {
    console.error('CRM SaaS Sync error:', err);
  }

  let gcalSynced = false;
  let googleEmail = null;

  try {
    const user = await get('SELECT * FROM tenant_users WHERE tenant_id = ? AND LOWER(name) = ?', [tenant_id, assignedResource.toLowerCase()]);
    if (user && user.google_calendar_connected === 1) {
      const fs = await import('fs');
      const logPath = path.resolve(__dirname, 'google_calendar_syncs.log');
      const logEntry = `[${new Date().toISOString()}] Sync success: Appointment ID ${result.id} (${service} with ${user.name} on ${date} at ${time}) synced to Google Calendar (${user.google_calendar_email}).\n`;
      fs.appendFileSync(logPath, logEntry);
      gcalSynced = true;
      googleEmail = user.google_calendar_email;
      console.log(`[Google Calendar Sync] Synced appointment ${result.id} to ${user.google_calendar_email}`);
      await logTenantActivity(tenant_id, 'settings_update', `[Google Calendar Sync] Synced appointment for ${customer_name} to ${user.name}'s Google Calendar (${user.google_calendar_email})`);
    }
  } catch (err) {
    console.error('Google Calendar Sync simulation failed:', err);
  }

  return { 
    id: result.id, 
    customer_name, 
    customer_phone, 
    date, 
    time, 
    service, 
    notes, 
    resource_name: assignedResource,
    price: calculatedPrice,
    payment_status: 'unpaid',
    gcal_synced: gcalSynced,
    google_email: googleEmail
  };
};

export const deleteAppointment = async (tenant_id, id) => {
  return await run('DELETE FROM appointments WHERE tenant_id = ? AND id = ?', [tenant_id, id]);
};

export const checkAvailability = async (tenant_id, date, time, resource_name = '', party_size = 1, checkout_date = null) => {
  // Fetch configured resources list and rules for this tenant
  const settings = await getSettings(tenant_id);
  const isRestaurant = settings.system_mode === 'restaurant';
  const isHotel = settings.system_mode === 'hotel';
  
  const timeToMinutes = (t) => {
    if (!t) return 0;
    const parts = t.split(':');
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    return h * 60 + m;
  };

  const reqMin = timeToMinutes(time);

  // 1. Day of Week Verification
  let dateObj;
  try {
    dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return { available: false, message: `Invalid date format provided.` };
    }
  } catch (e) {
    return { available: false, message: `Invalid date format provided.` };
  }
  
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = daysOfWeek[dateObj.getUTCDay()];

  const checkSingleCalendar = async (targetUser, targetResourceName) => {
    let name = targetResourceName;
    let workingHours = settings.working_hours;
    let breakPeriods = settings.break_periods;
    let gap = settings.appointment_gap;

    if (targetUser) {
      name = targetUser.name;
      if (targetUser.working_hours) workingHours = targetUser.working_hours;
      if (targetUser.break_periods) breakPeriods = targetUser.break_periods;
      if (targetUser.appointment_gap !== null && targetUser.appointment_gap !== undefined) {
        gap = targetUser.appointment_gap;
      }
    }

    if (typeof workingHours === 'string') {
      try { workingHours = JSON.parse(workingHours); } catch (e) {}
    }
    if (typeof breakPeriods === 'string') {
      try { breakPeriods = JSON.parse(breakPeriods); } catch (e) {}
    }

    const dayRule = workingHours[dayName];
    if (!dayRule || !dayRule.active) {
      return { available: false, message: `We are closed on ${dayName.toUpperCase()}.` };
    }

    const startMin = timeToMinutes(dayRule.start);
    const endMin = timeToMinutes(dayRule.end);
    if (reqMin < startMin || reqMin > endMin) {
      return {
        available: false,
        message: `Requested time ${time} is outside our working hours on ${dayName.toUpperCase()} (${dayRule.start} - ${dayRule.end}).`
      };
    }

    for (const b of breakPeriods) {
      const breakStart = timeToMinutes(b.start);
      const breakEnd = timeToMinutes(b.end);
      if (reqMin >= breakStart && reqMin < breakEnd) {
        return {
          available: false,
          message: `Requested time ${time} falls during our rest break (${b.name}: ${b.start} - ${b.end}).`
        };
      }
    }

    const appointments = await all(`
      SELECT id, time FROM appointments 
      WHERE tenant_id = ? AND date = ? AND LOWER(resource_name) = ?
    `, [tenant_id, date, name.toLowerCase()]);

    for (const appt of appointments) {
      const apptMin = timeToMinutes(appt.time);
      const diff = Math.abs(reqMin - apptMin);
      if (diff < gap) {
        return {
          available: false,
          message: `${name} has a scheduled appointment at ${appt.time} which falls within our required ${gap}-minute gap buffer.`
        };
      }
    }

    return { available: true, name };
  };

  if (isRestaurant) {
    // Restaurant availability check:
    // 1. Fetch restaurant tables
    const tables = await all('SELECT * FROM restaurant_tables WHERE tenant_id = ?', [tenant_id]);
    if (tables.length === 0) {
      return { available: false, message: 'No tables configured for this restaurant.' };
    }
    
    // 2. Filter tables by seats capacity
    const eligibleTables = tables.filter(t => t.seats >= party_size);
    if (eligibleTables.length === 0) {
      return { available: false, message: `No tables can accommodate a party of ${party_size} guests.` };
    }

    // 3. Find available tables
    const gap = settings.appointment_gap || 90; // Dining duration slot, default 90 mins
    const appointments = await all('SELECT id, time, table_number FROM appointments WHERE tenant_id = ? AND date = ? AND table_number IS NOT NULL', [tenant_id, date]);
    
    const availableTables = [];
    for (const table of eligibleTables) {
      let occupied = false;
      const tableBookings = appointments.filter(appt => appt.table_number === table.table_number);
      for (const appt of tableBookings) {
        const apptMin = timeToMinutes(appt.time);
        if (Math.abs(reqMin - apptMin) < gap) {
          occupied = true;
          break;
        }
      }
      if (!occupied) {
        availableTables.push(table);
      }
    }

    // If specific table number requested
    if (resource_name) {
      const requestedTable = availableTables.find(t => t.table_number.toLowerCase() === resource_name.toLowerCase());
      if (requestedTable) {
        return { available: true, resource_name: requestedTable.table_number, message: `Table ${requestedTable.table_number} is available.` };
      } else {
        const tableExists = tables.find(t => t.table_number.toLowerCase() === resource_name.toLowerCase());
        if (!tableExists) {
          return { available: false, message: `Table ${resource_name} does not exist.` };
        }
        if (tableExists.seats < party_size) {
          return { available: false, message: `Table ${resource_name} only has ${tableExists.seats} seats (requires ${party_size}).` };
        }
        return { available: false, message: `Table ${resource_name} is already reserved around ${time}.` };
      }
    } else {
      // Suggest the smallest eligible table that is free to optimize seating capacity
      if (availableTables.length > 0) {
        availableTables.sort((a, b) => a.seats - b.seats);
        const suggestedTable = availableTables[0];
        const tableNames = availableTables.map(t => t.table_number);
        return {
          available: true,
          suggested_resource: suggestedTable.table_number,
          available_resources: tableNames,
          message: `Slot is available. Suggested table: ${suggestedTable.table_number} (${suggestedTable.seats} seats).`
        };
      } else {
        return { available: false, message: `No tables are available for a party of ${party_size} at ${time}.` };
      }
    }
  }

  if (isHotel) {
    // Hotel Reservation check:
    const checkin = date;
    let checkout = checkout_date;
    if (!checkout) {
      try {
        const parts = checkin.split('-');
        const checkinDate = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
        checkinDate.setUTCDate(checkinDate.getUTCDate() + 1);
        checkout = checkinDate.toISOString().split('T')[0];
      } catch (e) {
        return { available: false, message: 'Invalid check-in date format.' };
      }
    }

    const rooms = await all('SELECT * FROM hotel_rooms WHERE tenant_id = ?', [tenant_id]);
    if (rooms.length === 0) {
      return { available: false, message: 'No rooms configured for this hotel.' };
    }

    // Fetch overlapping bookings
    const bookings = await all(`
      SELECT id, date as checkin, checkout_date as checkout, room_number 
      FROM appointments 
      WHERE tenant_id = ? AND checkout_date IS NOT NULL AND room_number IS NOT NULL
    `, [tenant_id]);

    const occupiedRooms = new Set();
    for (const b of bookings) {
      // Overlap: B.checkout > checkin AND B.checkin < checkout
      if (b.checkout > checkin && b.checkin < checkout) {
        occupiedRooms.add(b.room_number);
      }
    }

    const availableRooms = rooms.filter(r => !occupiedRooms.has(r.room_number));

    let filteredRooms = availableRooms;
    let roomTypeRequested = null;
    let specificRoomRequested = null;

    if (resource_name) {
      const isRoomNumber = rooms.some(r => r.room_number.toLowerCase() === resource_name.toLowerCase());
      if (isRoomNumber) {
        specificRoomRequested = resource_name;
      } else {
        roomTypeRequested = resource_name;
      }
    }

    if (specificRoomRequested) {
      const targetRoom = availableRooms.find(r => r.room_number.toLowerCase() === specificRoomRequested.toLowerCase());
      if (targetRoom) {
        return { available: true, resource_name: targetRoom.room_number, message: `Room ${targetRoom.room_number} is available.` };
      } else {
        const roomExists = rooms.find(r => r.room_number.toLowerCase() === specificRoomRequested.toLowerCase());
        if (!roomExists) {
          return { available: false, message: `Room ${specificRoomRequested} does not exist.` };
        }
        return { available: false, message: `Room ${specificRoomRequested} is occupied from ${checkin} to ${checkout}.` };
      }
    }

    if (roomTypeRequested) {
      filteredRooms = availableRooms.filter(r => r.room_type.toLowerCase() === roomTypeRequested.toLowerCase());
      if (filteredRooms.length === 0) {
        const roomTypeExists = rooms.some(r => r.room_type.toLowerCase() === roomTypeRequested.toLowerCase());
        if (!roomTypeExists) {
          return { available: false, message: `Room type ${roomTypeRequested} does not exist.` };
        }
        return { available: false, message: `No ${roomTypeRequested} rooms are available from ${checkin} to ${checkout}.` };
      }
    }

    if (filteredRooms.length > 0) {
      filteredRooms.sort((a, b) => {
        if (a.price_per_night !== b.price_per_night) {
          return a.price_per_night - b.price_per_night;
        }
        return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
      });
      const suggested = filteredRooms[0];
      return {
        available: true,
        resource_name: suggested.room_number,
        suggested_resource: suggested.room_number,
        available_resources: filteredRooms.map(r => r.room_number),
        message: `Rooms are available. Suggested Room: ${suggested.room_number} (${suggested.room_type}, $${suggested.price_per_night}/night).`
      };
    } else {
      return { available: false, message: `No rooms are available from ${checkin} to ${checkout}.` };
    }
  }

  // Original Staff availability check:
  if (resource_name) {
    const user = await get('SELECT * FROM tenant_users WHERE tenant_id = ? AND LOWER(name) = ?', [tenant_id, resource_name.toLowerCase()]);
    const res = await checkSingleCalendar(user, resource_name);
    if (res.available) {
      return { available: true, resource_name: res.name, message: `${res.name} is available.` };
    } else {
      return { available: false, resource_name, message: res.message };
    }
  } else {
    // If no specific resource name, query all workspace users
    const users = await all('SELECT * FROM tenant_users WHERE tenant_id = ?', [tenant_id]);
    
    let resourcesToCheck = [];
    const rawList = settings.resources_list || '';
    const fallbackList = rawList.split(',').map(r => r.trim()).filter(Boolean);

    const hasMembers = users.some(u => u.role === 'member');
    if (hasMembers) {
      resourcesToCheck = users.map(u => ({ user: u, name: u.name }));
    } else if (fallbackList.length > 0) {
      resourcesToCheck = fallbackList.map(name => {
        const matchingUser = users.find(u => u.name.toLowerCase() === name.toLowerCase());
        return { user: matchingUser || null, name };
      });
    } else {
      resourcesToCheck = users.map(u => ({ user: u, name: u.name }));
    }

    const availableResources = [];
    const unavailableMessages = [];
    for (const item of resourcesToCheck) {
      const res = await checkSingleCalendar(item.user, item.name);
      if (res.available) {
        availableResources.push(res.name);
      } else {
        unavailableMessages.push(res.message);
      }
    }

    if (availableResources.length > 0) {
      return {
        available: true,
        suggested_resource: availableResources[0],
        available_resources: availableResources,
        message: `Slot is available. Available staff/resources: ${availableResources.join(', ')}`
      };
    } else {
      const uniqueMessages = [...new Set(unavailableMessages)];
      const message = uniqueMessages.length === 1 ? uniqueMessages[0] : `No staff or resources are available at this time due to buffer gap constraints or existing bookings.`;
      return {
        available: false,
        message
      };
    }
  }
};

// ==========================================
// SCOPED CALL LOGS
// ==========================================
export const addCallLog = async (tenant_id, { call_sid, direction, phone_number, status }) => {
  try {
    const contact = await findContactByPhone(tenant_id, phone_number);
    if (contact) {
      await addActivity(tenant_id, {
        contact_id: contact.id,
        type: 'call',
        title: `${direction === 'inbound' ? 'Inbound' : 'Outbound'} Call Connected`,
        description: `Voice session started. Call SID: ${call_sid}`,
        association_sid: call_sid
      });
    }
  } catch (err) {
    console.error('Call CRM sync error:', err);
  }

  await logTenantActivity(tenant_id, 'call_started', `${direction.toUpperCase()} call session started with caller (${phone_number})`);

  return await run(`
    INSERT INTO calls (tenant_id, call_sid, direction, phone_number, status, transcript)
    VALUES (?, ?, ?, ?, ?, '[]')
  `, [tenant_id, call_sid, direction, phone_number, status]);
};

export const updateCallStatus = async (call_sid, status, duration = 0) => {
  // Add duration to tenant's usage limits on call complete
  if (status === 'completed') {
    try {
      const call = await get('SELECT tenant_id, phone_number, direction FROM calls WHERE call_sid = ?', [call_sid]);
      if (call) {
        // Convert seconds to minutes fraction
        const minutes = duration / 60;
        await run('UPDATE tenants SET usage_minutes = usage_minutes + ? WHERE id = ?', [minutes, call.tenant_id]);
        
        await logTenantActivity(call.tenant_id, 'call_completed', `${call.direction.toUpperCase()} call session completed. Duration: ${duration} seconds (${minutes.toFixed(1)} mins)`);
      }
    } catch (err) {
      console.error('Failed to increment SaaS minutes usage:', err);
    }
  }
  return await run('UPDATE calls SET status = ?, duration = ? WHERE call_sid = ?', [status, duration, call_sid]);
};

export const updateCallSummary = async (call_sid, summary) => {
  await run('UPDATE calls SET summary = ? WHERE call_sid = ?', [summary, call_sid]);

  try {
    const callLog = await get('SELECT tenant_id, phone_number FROM calls WHERE call_sid = ?', [call_sid]);
    if (callLog) {
      const contact = await findContactByPhone(callLog.tenant_id, callLog.phone_number);
      if (contact) {
        await run(`
          UPDATE activities 
          SET description = description || '\n\nAI Summary: ' || ?
          WHERE tenant_id = ? AND contact_id = ? AND association_sid = ?
        `, [summary, callLog.tenant_id, contact.id, call_sid]);
      }
    }
  } catch (err) {
    console.error('Call summary CRM activity update failed:', err);
  }
};

export const getCallLogs = async (tenant_id) => {
  return await all('SELECT * FROM calls WHERE tenant_id = ? ORDER BY created_at DESC', [tenant_id]);
};

export const appendCallTranscript = async (call_sid, speaker, text) => {
  const call = await get('SELECT transcript FROM calls WHERE call_sid = ?', [call_sid]);
  if (!call) return;
  
  let transcriptList = [];
  try {
    transcriptList = JSON.parse(call.transcript || '[]');
  } catch (e) {
    transcriptList = [];
  }
  
  transcriptList.push({
    speaker,
    text,
    timestamp: new Date().toISOString()
  });

  return await run('UPDATE calls SET transcript = ? WHERE call_sid = ?', [JSON.stringify(transcriptList), call_sid]);
};

// ==========================================
// SCOPED CRM HUB METHODS
// ==========================================

// Contacts
export const getContacts = async (tenant_id) => {
  return await all('SELECT * FROM contacts WHERE tenant_id = ? ORDER BY name ASC', [tenant_id]);
};

export const findContactByPhone = async (tenant_id, phone) => {
  if (!phone) return null;
  const target = normalizePhone(phone);
  if (!target) return null;
  
  const contacts = await all('SELECT * FROM contacts WHERE tenant_id = ?', [tenant_id]);
  
  let bestMatch = null;
  let bestMatchLen = 0;
  
  for (const c of contacts) {
    const candidate = normalizePhone(c.phone);
    if (!candidate) continue;
    
    if (candidate === target) {
      return c; // Exact match
    }
    
    const minLen = Math.min(candidate.length, target.length);
    if (minLen >= 7) {
      const suffix1 = candidate.substring(candidate.length - minLen);
      const suffix2 = target.substring(target.length - minLen);
      if (suffix1 === suffix2 && minLen > bestMatchLen) {
        bestMatchLen = minLen;
        bestMatch = c;
      }
    }
  }
  return bestMatch;
};

export const addContact = async (tenant_id, { name, email, phone, company_name = '', lead_stage = 'lead' }) => {
  // Check SaaS limits first
  const usage = await getTenantUsage(tenant_id);
  const limits = { free: 15, starter: 100, professional: 999999, enterprise: 999999 };
  if (usage.usage_contacts >= limits[usage.tier]) {
    throw new Error(`SaaS Limit Exceeded: You have reached the maximum number of contacts (${limits[usage.tier]}) allowed on the ${usage.tier.toUpperCase()} Tier. Please upgrade to add more contacts.`);
  }

  const result = await run(`
    INSERT INTO contacts (tenant_id, name, email, phone, company_name, lead_stage)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [tenant_id, name, email, phone, company_name, lead_stage]);
  
  await addActivity(tenant_id, {
    contact_id: result.id,
    type: 'note',
    title: 'Contact Created',
    description: `Created in CRM as a new ${lead_stage}.`
  });

  return { id: result.id, name, email, phone, company_name, lead_stage };
};

export const updateContactLeadStage = async (tenant_id, id, lead_stage) => {
  await run('UPDATE contacts SET lead_stage = ? WHERE tenant_id = ? AND id = ?', [lead_stage, tenant_id, id]);
  await addActivity(tenant_id, {
    contact_id: id,
    type: 'note',
    title: 'Lead Stage Changed',
    description: `Contact status promoted to: ${lead_stage}`
  });
  return { id, lead_stage };
};

export const deleteContact = async (tenant_id, id) => {
  return await run('DELETE FROM contacts WHERE tenant_id = ? AND id = ?', [tenant_id, id]);
};

// Deals
export const getDeals = async (tenant_id) => {
  return await all(`
    SELECT deals.*, contacts.name as contact_name, contacts.phone as contact_phone
    FROM deals
    JOIN contacts ON deals.contact_id = contacts.id
    WHERE deals.tenant_id = ?
    ORDER BY deals.created_at DESC
  `, [tenant_id]);
};

export const addDeal = async (tenant_id, { contact_id, name, amount, stage = 'appointmentscheduled', close_date }) => {
  const result = await run(`
    INSERT INTO deals (tenant_id, contact_id, name, amount, stage, close_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [tenant_id, contact_id, name, amount, stage, close_date]);

  await addActivity(tenant_id, {
    contact_id,
    type: 'deal_created',
    title: 'New Deal Created',
    description: `Deal "${name}" ($${amount}) added to stage "${stage}". Close target: ${close_date}`
  });

  return { id: result.id, contact_id, name, amount, stage, close_date };
};

export const updateDealStage = async (tenant_id, id, stage) => {
  const deal = await get('SELECT * FROM deals WHERE tenant_id = ? AND id = ?', [tenant_id, id]);
  if (!deal) throw new Error('Deal not found');

  await run('UPDATE deals SET stage = ? WHERE tenant_id = ? AND id = ?', [stage, tenant_id, id]);

  await addActivity(tenant_id, {
    contact_id: deal.contact_id,
    type: 'deal_moved',
    title: 'Deal Moved',
    description: `Deal "${deal.name}" shifted stage: ${deal.stage} ➔ ${stage}`
  });

  if (stage === 'closedwon') {
    await updateContactLeadStage(tenant_id, deal.contact_id, 'customer');
  }

  return { id, stage };
};

export const deleteDeal = async (tenant_id, id) => {
  return await run('DELETE FROM deals WHERE tenant_id = ? AND id = ?', [tenant_id, id]);
};

// Activities
export const getActivities = async (tenant_id, contact_id) => {
  return await all('SELECT * FROM activities WHERE tenant_id = ? AND contact_id = ? ORDER BY created_at DESC', [tenant_id, contact_id]);
};

export const addActivity = async (tenant_id, { contact_id, type, title, description = '', association_sid = '' }) => {
  const result = await run(`
    INSERT INTO activities (tenant_id, contact_id, type, title, description, association_sid)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [tenant_id, contact_id, type, title, description, association_sid]);
  return { id: result.id, contact_id, type, title, description, association_sid };
};

// ==========================================
// SUPER ADMIN DASHBOARD OPERATIONS
// ==========================================

export const isAdminTenant = async (tenant_id) => {
  const tenant = await get('SELECT is_admin FROM tenants WHERE id = ?', [tenant_id]);
  return tenant ? tenant.is_admin === 1 : false;
};

export const getAllTenantsWithUsage = async () => {
  return await all(`
    SELECT 
      t.id, 
      t.name, 
      t.email, 
      t.company_name, 
      t.subscription_tier, 
      t.billing_cycle,
      t.subscription_status, 
      t.usage_minutes, 
      t.is_admin,
      t.created_at,
      (SELECT COUNT(*) FROM contacts WHERE tenant_id = t.id) as contacts_count,
      (SELECT COUNT(*) FROM appointments WHERE tenant_id = t.id) as appointments_count
    FROM tenants t
    ORDER BY t.is_admin DESC, t.created_at DESC
  `);
};

export const updateTenantByAdmin = async (tenantId, { subscription_tier, subscription_status, billing_cycle }) => {
  const cycle = billing_cycle || 'monthly';
  await run(`
    UPDATE tenants 
    SET subscription_tier = ?, subscription_status = ?, billing_cycle = ?
    WHERE id = ?
  `, [subscription_tier, subscription_status, cycle, tenantId]);
  await logTenantActivity(tenantId, 'suspension_toggle', `Admin modified workspace: Tier=${subscription_tier.toUpperCase()}, Status=${subscription_status.toUpperCase()}, Cycle=${cycle.toUpperCase()}`);
  return getTenantUsage(tenantId);
};

export const getTenantStatus = async (tenant_id) => {
  const tenant = await get('SELECT subscription_status, is_admin FROM tenants WHERE id = ?', [tenant_id]);
  return tenant ? tenant : null;
};

export const getActiveCallsCount = async () => {
  const row = await get("SELECT COUNT(*) as count FROM calls WHERE status = 'active'");
  return row ? row.count : 0;
};

export const getActiveCallsCountForTenant = async (tenant_id) => {
  const row = await get("SELECT COUNT(*) as count FROM calls WHERE tenant_id = ? AND status = 'active'", [tenant_id]);
  return row ? row.count : 0;
};

// Platform Activities Log Helpers
export const logTenantActivity = async (tenantId, activityType, description) => {
  let companyName = 'System / Platform';
  if (tenantId) {
    try {
      const tenant = await get('SELECT company_name FROM tenants WHERE id = ?', [tenantId]);
      if (tenant && tenant.company_name) {
        companyName = tenant.company_name;
      }
    } catch (e) {
      console.error('Error fetching tenant company name for log:', e);
    }
  }
  try {
    await run(`
      INSERT INTO tenant_activities (tenant_id, company_name, activity_type, description)
      VALUES (?, ?, ?, ?)
    `, [tenantId, companyName, activityType, description]);
  } catch (e) {
    console.error('Failed to log tenant activity:', e);
  }
};

export const getPlatformActivities = async () => {
  return await all('SELECT * FROM tenant_activities ORDER BY created_at DESC LIMIT 50');
};

// ==========================================
// TEAM CALENDARS & MULTI-USER MANAGEMENT
// ==========================================

export const getWorkspaceUsers = async (tenantId) => {
  return await all(`
    SELECT id, tenant_id, name, email, role, google_calendar_email, google_calendar_connected, working_hours, break_periods, appointment_gap, created_at
    FROM tenant_users 
    WHERE tenant_id = ? 
    ORDER BY role DESC, name ASC
  `, [tenantId]);
};

export const addWorkspaceUser = async (tenantId, { name, email, password, role = 'member' }) => {
  const tenant = await get('SELECT subscription_tier FROM tenants WHERE id = ?', [tenantId]);
  if (!tenant) throw new Error('Tenant workspace not found.');
  
  const tier = tenant.subscription_tier || 'free';
  const limits = {
    free: 1,
    starter: 1,
    professional: 10,
    enterprise: 99999
  };
  
  const currentUsers = await get('SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ?', [tenantId]);
  const currentCount = currentUsers ? currentUsers.count : 0;
  
  if (currentCount >= limits[tier]) {
    throw new Error(`SaaS Limit Exceeded: You have reached the maximum number of users (${limits[tier]} user${limits[tier] > 1 ? 's' : ''}) allowed on the ${tier.toUpperCase()} Tier. Please upgrade your subscription to add more team members.`);
  }

  const existingTenant = await get('SELECT id FROM tenants WHERE email = ?', [email]);
  const existingUser = await get('SELECT id FROM tenant_users WHERE email = ?', [email]);
  if (existingTenant || existingUser) {
    throw new Error('Email address already registered.');
  }

  const defaultWorkingHours = JSON.stringify({
    monday: { active: true, start: '09:00', end: '17:00' },
    tuesday: { active: true, start: '09:00', end: '17:00' },
    wednesday: { active: true, start: '09:00', end: '17:00' },
    thursday: { active: true, start: '09:00', end: '17:00' },
    friday: { active: true, start: '09:00', end: '17:00' },
    saturday: { active: false, start: '10:00', end: '14:00' },
    sunday: { active: false, start: '10:00', end: '14:00' }
  });
  const defaultBreakPeriods = JSON.stringify([
    { name: 'Lunch', start: '12:00', end: '13:00' }
  ]);

  const result = await run(`
    INSERT INTO tenant_users (tenant_id, name, email, password_hash, role, working_hours, break_periods, appointment_gap)
    VALUES (?, ?, ?, ?, ?, ?, ?, 15)
  `, [tenantId, name, email, password, role, defaultWorkingHours, defaultBreakPeriods]);

  await logTenantActivity(tenantId, 'settings_update', `Added new staff member: ${name} (${email}) as ${role.toUpperCase()}`);
  return { id: result.id, tenant_id: tenantId, name, email, role };
};

export const deleteWorkspaceUser = async (tenantId, userId) => {
  const user = await get('SELECT * FROM tenant_users WHERE tenant_id = ? AND id = ?', [tenantId, userId]);
  if (!user) throw new Error('User not found');
  if (user.role === 'owner') throw new Error('Cannot delete the workspace owner.');

  await run('DELETE FROM tenant_users WHERE tenant_id = ? AND id = ?', [tenantId, userId]);
  await logTenantActivity(tenantId, 'settings_update', `Removed staff member: ${user.name} (${user.email})`);
  return { id: userId };
};

export const getUserCalendarSettings = async (userId) => {
  const r = await get(`
    SELECT working_hours, break_periods, appointment_gap, name, email, role, google_calendar_email, google_calendar_connected 
    FROM tenant_users 
    WHERE id = ?
  `, [userId]);
  if (!r) throw new Error('User not found');
  return r;
};

export const updateUserCalendarSettings = async (userId, { working_hours, break_periods, appointment_gap }) => {
  await run(`
    UPDATE tenant_users 
    SET working_hours = ?, break_periods = ?, appointment_gap = ?
    WHERE id = ?
  `, [
    typeof working_hours === 'object' ? JSON.stringify(working_hours) : working_hours,
    typeof break_periods === 'object' ? JSON.stringify(break_periods) : break_periods,
    parseInt(appointment_gap),
    userId
  ]);
  return getUserCalendarSettings(userId);
};

// ==========================================
// RESTAURANT TABLES CRUD OPERATIONS
// ==========================================
export const getRestaurantTables = async (tenantId) => {
  return await all('SELECT * FROM restaurant_tables WHERE tenant_id = ? ORDER BY table_number ASC', [tenantId]);
};

export const addRestaurantTable = async (tenantId, { table_number, seats }) => {
  const existing = await get('SELECT id FROM restaurant_tables WHERE tenant_id = ? AND table_number = ?', [tenantId, table_number]);
  if (existing) throw new Error(`Table ${table_number} already exists.`);
  const result = await run(`
    INSERT INTO restaurant_tables (tenant_id, table_number, seats)
    VALUES (?, ?, ?)
  `, [tenantId, table_number, parseInt(seats)]);
  return { id: result.id, tenant_id: tenantId, table_number, seats: parseInt(seats) };
};

export const deleteRestaurantTable = async (tenantId, tableId) => {
  await run('DELETE FROM restaurant_tables WHERE tenant_id = ? AND id = ?', [tenantId, tableId]);
  return { id: tableId };
};

export const updateRestaurantTable = async (tenantId, tableId, { table_number, seats }) => {
  const existing = await get('SELECT id FROM restaurant_tables WHERE tenant_id = ? AND table_number = ? AND id != ?', [tenantId, table_number, tableId]);
  if (existing) throw new Error(`Table ${table_number} already exists.`);
  await run(`
    UPDATE restaurant_tables
    SET table_number = ?, seats = ?
    WHERE tenant_id = ? AND id = ?
  `, [table_number, parseInt(seats), tenantId, tableId]);
  return { id: tableId, table_number, seats: parseInt(seats) };
};

export const connectUserGoogleCalendar = async (userId, email) => {
  await run(`
    UPDATE tenant_users 
    SET google_calendar_email = ?, google_calendar_connected = 1
    WHERE id = ?
  `, [email, userId]);
  const user = await getUserCalendarSettings(userId);
  return user;
};

export const disconnectUserGoogleCalendar = async (userId) => {
  await run(`
    UPDATE tenant_users 
    SET google_calendar_email = NULL, google_calendar_connected = 0
    WHERE id = ?
  `, [userId]);
  const user = await getUserCalendarSettings(userId);
  return user;
};

// ==========================================
// HOTEL ROOMS CRUD OPERATIONS
// ==========================================
export const getHotelRooms = async (tenantId) => {
  return await all('SELECT * FROM hotel_rooms WHERE tenant_id = ? ORDER BY room_number ASC', [tenantId]);
};

export const addHotelRoom = async (tenantId, { room_number, room_type, price_per_night }) => {
  const existing = await get('SELECT id FROM hotel_rooms WHERE tenant_id = ? AND room_number = ?', [tenantId, room_number]);
  if (existing) throw new Error(`Room ${room_number} already exists.`);
  const result = await run(`
    INSERT INTO hotel_rooms (tenant_id, room_number, room_type, price_per_night)
    VALUES (?, ?, ?, ?)
  `, [tenantId, room_number, room_type, parseFloat(price_per_night)]);
  return { id: result.id, tenant_id: tenantId, room_number, room_type, price_per_night: parseFloat(price_per_night) };
};

export const deleteHotelRoom = async (tenantId, roomId) => {
  await run('DELETE FROM hotel_rooms WHERE tenant_id = ? AND id = ?', [tenantId, roomId]);
  return { id: roomId };
};

export const updateHotelRoom = async (tenantId, roomId, { room_number, room_type, price_per_night }) => {
  const existing = await get('SELECT id FROM hotel_rooms WHERE tenant_id = ? AND room_number = ? AND id != ?', [tenantId, room_number, roomId]);
  if (existing) throw new Error(`Room ${room_number} already exists.`);
  await run(`
    UPDATE hotel_rooms
    SET room_number = ?, room_type = ?, price_per_night = ?
    WHERE tenant_id = ? AND id = ?
  `, [room_number, room_type, parseFloat(price_per_night), tenantId, roomId]);
  return { id: roomId, room_number, room_type, price_per_night: parseFloat(price_per_night) };
};

// ==========================================
// PREPAID OVERAGE & REMINDERS OPERATIONS
// ==========================================
export const buyOverageMinutes = async (tenant_id, blocksCount = 1) => {
  const blocks = Math.max(1, parseInt(blocksCount) || 1);
  const minutesToAdd = blocks * 100;
  const cost = blocks * 35;
  await run(`
    UPDATE tenants 
    SET prepaid_overage_minutes = prepaid_overage_minutes + ?,
        overage_reminder_sent = 0
    WHERE id = ?
  `, [minutesToAdd, tenant_id]);
  await logTenantActivity(tenant_id, 'billing_upgrade', `Purchased ${minutesToAdd} prepaid overage minutes (${blocks} blocks) for $${cost.toFixed(2)}`);
  return getTenantUsage(tenant_id);
};

export const updateOverageReminderSettings = async (tenant_id, threshold) => {
  await run(`
    UPDATE tenants 
    SET overage_reminder_limit = ?,
        overage_reminder_sent = 0
    WHERE id = ?
  `, [threshold, tenant_id]);
  await logTenantActivity(tenant_id, 'settings_update', `Updated overage credit warning reminder limit to ${threshold} mins`);
  return getTenantUsage(tenant_id);
};

export const checkLowCreditReminderTrigger = async (tenant_id) => {
  const tenant = await get('SELECT subscription_tier, usage_minutes, prepaid_overage_minutes, overage_reminder_limit, overage_reminder_sent, email, name FROM tenants WHERE id = ?', [tenant_id]);
  if (!tenant) return null;
  
  if (tenant.subscription_tier === 'free') return null; // Sandbox plan doesn't have overage/reminders
  
  const limits = { free: 15, starter: 100, professional: 1000, enterprise: 999999 };
  const planLimit = limits[tenant.subscription_tier] || 0;
  const totalLimit = planLimit + (tenant.prepaid_overage_minutes || 0);
  const remaining = totalLimit - (tenant.usage_minutes || 0);
  
  if (remaining <= tenant.overage_reminder_limit && tenant.overage_reminder_sent === 0) {
    await run('UPDATE tenants SET overage_reminder_sent = 1 WHERE id = ?', [tenant_id]);
    return {
      remaining: remaining.toFixed(1),
      limit: tenant.overage_reminder_limit,
      email: tenant.email,
      name: tenant.name,
      tier: tenant.subscription_tier
    };
  }
  return null;
};

export const updateAppointmentPaymentStatus = async (tenant_id, id, status) => {
  await run('UPDATE appointments SET payment_status = ? WHERE id = ? AND tenant_id = ?', [status, id, tenant_id]);
  return get('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
};

export const getAppointmentById = async (id) => {
  return await get('SELECT * FROM appointments WHERE id = ?', [id]);
};

export const isTenantLocked = async (tenant_id) => {
  const tenant = await get('SELECT subscription_tier, subscription_status, prepaid_overage_minutes, usage_minutes, is_admin FROM tenants WHERE id = ?', [tenant_id]);
  if (!tenant) return { locked: false };
  if (tenant.is_admin === 1) return { locked: false }; // Admin is never locked

  // Check condition 1: Subscription status is unpaid or suspended
  if (tenant.subscription_status === 'suspended' || tenant.subscription_status === 'unpaid') {
    return { locked: true, reason: 'subscription_unpaid' };
  }

  // Check condition 2: 0 minute credit balance
  const limits = { free: 15, starter: 100, professional: 1000, enterprise: 999999 };
  const planQuota = limits[tenant.subscription_tier] || 0;
  const remainingMinutes = planQuota + (tenant.prepaid_overage_minutes || 0) - (tenant.usage_minutes || 0);
  if (remainingMinutes <= 0) {
    return { locked: true, reason: 'zero_credit' };
  }

  return { locked: false };
};

// ==========================================
// BASIC ACCOUNTING MODULE HELPERS
// ==========================================

export const getAccountingMetrics = async (tenant_id) => {
  const overdueInvoices = await get(`
    SELECT COUNT(*) as count FROM accounting_invoices 
    WHERE tenant_id = ? AND status != 'paid' AND (status = 'overdue' OR due_date < date('now'))
  `, [tenant_id]);

  const overdueBills = await get(`
    SELECT COUNT(*) as count FROM accounting_bills 
    WHERE tenant_id = ? AND status != 'paid' AND (status = 'overdue' OR due_date < date('now'))
  `, [tenant_id]);

  const receivables = await get(`
    SELECT SUM(balance) as total FROM accounting_invoices 
    WHERE tenant_id = ? AND status != 'paid'
  `, [tenant_id]);

  const payables = await get(`
    SELECT SUM(balance) as total FROM accounting_bills 
    WHERE tenant_id = ? AND status != 'paid'
  `, [tenant_id]);

  const revenue = await get(`
    SELECT SUM(paid) as total FROM accounting_invoices 
    WHERE tenant_id = ?
  `, [tenant_id]);

  const expenses = await get(`
    SELECT (SELECT COALESCE(SUM(amount), 0) FROM accounting_expenses WHERE tenant_id = ?) +
           (SELECT COALESCE(SUM(paid), 0) FROM accounting_bills WHERE tenant_id = ?) as total
  `, [tenant_id, tenant_id]);

  return {
    receivables: receivables?.total || 0,
    payables: payables?.total || 0,
    revenue: revenue?.total || 0,
    expenses: expenses?.total || 0,
    overdueInvoices: overdueInvoices?.count || 0,
    overdueBills: overdueBills?.count || 0
  };
};

export const getAccountingInvoices = async (tenant_id) => {
  return await all(`
    SELECT i.*, c.name as customer_name, c.email as customer_email 
    FROM accounting_invoices i
    JOIN accounting_contacts c ON i.contact_id = c.id
    WHERE i.tenant_id = ?
    ORDER BY i.date DESC
  `, [tenant_id]);
};

export const addAccountingInvoice = async (tenant_id, { invoice_number, contact_id, date, due_date, total, paid, status }) => {
  const parsedTotal = parseFloat(total) || 0;
  const parsedPaid = parseFloat(paid) || 0;
  const balance = parsedTotal - parsedPaid;
  const result = await run(`
    INSERT INTO accounting_invoices (tenant_id, invoice_number, contact_id, date, due_date, total, paid, balance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [tenant_id, invoice_number, parseInt(contact_id), date, due_date, parsedTotal, parsedPaid, balance, status]);
  return { id: result.id, invoice_number, contact_id, date, due_date, total: parsedTotal, paid: parsedPaid, balance, status };
};

export const deleteAccountingInvoice = async (tenant_id, id) => {
  return await run('DELETE FROM accounting_invoices WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
};

export const getAccountingBills = async (tenant_id) => {
  return await all(`
    SELECT b.*, c.name as supplier_name, c.email as supplier_email 
    FROM accounting_bills b
    JOIN accounting_contacts c ON b.contact_id = c.id
    WHERE b.tenant_id = ?
    ORDER BY b.date DESC
  `, [tenant_id]);
};

export const addAccountingBill = async (tenant_id, { bill_number, contact_id, date, due_date, total, paid, status }) => {
  const parsedTotal = parseFloat(total) || 0;
  const parsedPaid = parseFloat(paid) || 0;
  const balance = parsedTotal - parsedPaid;
  const result = await run(`
    INSERT INTO accounting_bills (tenant_id, bill_number, contact_id, date, due_date, total, paid, balance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [tenant_id, bill_number, parseInt(contact_id), date, due_date, parsedTotal, parsedPaid, balance, status]);
  return { id: result.id, bill_number, contact_id, date, due_date, total: parsedTotal, paid: parsedPaid, balance, status };
};

export const getAccountingPayments = async (tenant_id) => {
  return await all(`
    SELECT p.*, 
           i.invoice_number, 
           b.bill_number,
           COALESCE(ci.name, cb.name) as contact_name
    FROM accounting_payments p
    LEFT JOIN accounting_invoices i ON p.invoice_id = i.id
    LEFT JOIN accounting_contacts ci ON i.contact_id = ci.id
    LEFT JOIN accounting_bills b ON p.bill_id = b.id
    LEFT JOIN accounting_contacts cb ON b.contact_id = cb.id
    WHERE p.tenant_id = ?
    ORDER BY p.date DESC
  `, [tenant_id]);
};

export const addAccountingPayment = async (tenant_id, { invoice_id, bill_id, amount, date, method }) => {
  const parsedAmount = parseFloat(amount) || 0;
  const result = await run(`
    INSERT INTO accounting_payments (tenant_id, invoice_id, bill_id, amount, date, method)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [tenant_id, invoice_id ? parseInt(invoice_id) : null, bill_id ? parseInt(bill_id) : null, parsedAmount, date, method]);

  // If paying an invoice, update invoice paid balance and status
  if (invoice_id) {
    const inv = await get('SELECT total, paid FROM accounting_invoices WHERE id = ?', [invoice_id]);
    if (inv) {
      const newPaid = inv.paid + parsedAmount;
      const newBalance = Math.max(0, inv.total - newPaid);
      const newStatus = newBalance === 0 ? 'paid' : 'unpaid';
      await run('UPDATE accounting_invoices SET paid = ?, balance = ?, status = ? WHERE id = ?', [newPaid, newBalance, newStatus, invoice_id]);
    }
  }

  // If paying a bill, update bill paid balance and status
  if (bill_id) {
    const bill = await get('SELECT total, paid FROM accounting_bills WHERE id = ?', [bill_id]);
    if (bill) {
      const newPaid = bill.paid + parsedAmount;
      const newBalance = Math.max(0, bill.total - newPaid);
      const newStatus = newBalance === 0 ? 'paid' : 'unpaid';
      await run('UPDATE accounting_bills SET paid = ?, balance = ?, status = ? WHERE id = ?', [newPaid, newBalance, newStatus, bill_id]);
    }
  }

  return { id: result.id, invoice_id, bill_id, amount: parsedAmount, date, method };
};

export const getAccountingExpenses = async (tenant_id) => {
  return await all('SELECT * FROM accounting_expenses WHERE tenant_id = ? ORDER BY date DESC', [tenant_id]);
};

export const addAccountingExpense = async (tenant_id, { category, amount, date, description }) => {
  const parsedAmount = parseFloat(amount) || 0;
  const result = await run(`
    INSERT INTO accounting_expenses (tenant_id, category, amount, date, description)
    VALUES (?, ?, ?, ?, ?)
  `, [tenant_id, category, parsedAmount, date, description]);
  return { id: result.id, category, amount: parsedAmount, date, description };
};

export const getAccountingContacts = async (tenant_id) => {
  return await all('SELECT * FROM accounting_contacts WHERE tenant_id = ? ORDER BY name ASC', [tenant_id]);
};

export const addAccountingContact = async (tenant_id, { name, type, email, phone }) => {
  const result = await run(`
    INSERT INTO accounting_contacts (tenant_id, name, type, email, phone)
    VALUES (?, ?, ?, ?, ?)
  `, [tenant_id, name, type, email, phone]);
  return { id: result.id, name, type, email, phone };
};

export const getAccountingItems = async (tenant_id) => {
  return await all('SELECT * FROM accounting_items WHERE tenant_id = ? ORDER BY name ASC', [tenant_id]);
};

export const addAccountingItem = async (tenant_id, { name, price, sku }) => {
  const parsedPrice = parseFloat(price) || 0;
  const result = await run(`
    INSERT INTO accounting_items (tenant_id, name, price, sku)
    VALUES (?, ?, ?, ?)
  `, [tenant_id, name, parsedPrice, sku]);
  return { id: result.id, name, price: parsedPrice, sku };
};

export const getAccountingAccounts = async (tenant_id) => {
  return await all('SELECT * FROM accounting_accounts WHERE tenant_id = ? ORDER BY code ASC', [tenant_id]);
};

export const addAccountingAccount = async (tenant_id, { code, name, type }) => {
  const result = await run(`
    INSERT INTO accounting_accounts (tenant_id, code, name, type)
    VALUES (?, ?, ?, ?)
  `, [tenant_id, code, name, type]);
  return { id: result.id, code, name, type };
};

// Services Table CRUD helpers
export const getServices = async (tenant_id) => {
  return await all('SELECT * FROM services WHERE tenant_id = ? ORDER BY name ASC', [tenant_id]);
};

export const addService = async (tenant_id, { name, price, duration, description }) => {
  const parsedPrice = parseFloat(price) || 0;
  const parsedDuration = parseInt(duration) || 30;
  const result = await run(`
    INSERT INTO services (tenant_id, name, price, duration, description)
    VALUES (?, ?, ?, ?, ?)
  `, [tenant_id, name, parsedPrice, parsedDuration, description]);
  return { id: result.id, name, price: parsedPrice, duration: parsedDuration, description };
};

export const deleteService = async (tenant_id, id) => {
  await run('DELETE FROM services WHERE tenant_id = ? AND id = ?', [tenant_id, id]);
  return { id };
};

export const bulkInsertServices = async (tenant_id, servicesArray) => {
  // Clear existing services and insert new ones
  await run('DELETE FROM services WHERE tenant_id = ?', [tenant_id]);
  for (const svc of servicesArray) {
    const parsedPrice = parseFloat(svc.price) || 0;
    const parsedDuration = parseInt(svc.duration) || 30;
    await run(`
      INSERT INTO services (tenant_id, name, price, duration, description)
      VALUES (?, ?, ?, ?, ?)
    `, [tenant_id, svc.name, parsedPrice, parsedDuration, svc.description || '']);
  }
  return { success: true };
};

export const updateService = async (tenant_id, id, { name, price, duration, description }) => {
  const parsedPrice = parseFloat(price) || 0;
  const parsedDuration = parseInt(duration) || 30;
  await run(`
    UPDATE services
    SET name = ?, price = ?, duration = ?, description = ?
    WHERE tenant_id = ? AND id = ?
  `, [name, parsedPrice, parsedDuration, description, tenant_id, id]);
  return { id, name, price: parsedPrice, duration: parsedDuration, description };
};

export const getAccountingQuotations = async (tenant_id) => {
  return await all(`
    SELECT q.*, c.name as customer_name, c.email as customer_email 
    FROM accounting_quotations q
    JOIN accounting_contacts c ON q.contact_id = c.id
    WHERE q.tenant_id = ?
    ORDER BY q.date DESC
  `, [tenant_id]);
};

export const addAccountingQuotation = async (tenant_id, { quotation_number, contact_id, date, expiry_date, total, status, description }) => {
  const parsedTotal = parseFloat(total) || 0;
  const result = await run(`
    INSERT INTO accounting_quotations (tenant_id, quotation_number, contact_id, date, expiry_date, total, status, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [tenant_id, quotation_number, parseInt(contact_id), date, expiry_date, parsedTotal, status || 'draft', description || '']);
  return { id: result.id, quotation_number, contact_id, date, expiry_date, total: parsedTotal, status: status || 'draft', description };
};

export const deleteAccountingQuotation = async (tenant_id, id) => {
  return await run('DELETE FROM accounting_quotations WHERE id = ? AND tenant_id = ?', [id, tenant_id]);
};



