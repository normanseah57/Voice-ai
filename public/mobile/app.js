/* =============================================================
   Aura Tenant Mobile App - Core Logic
   ============================================================= */

let token = localStorage.getItem('saas_token');
let currentTenant = null;
let recentCallsList = [];
let loggedInUserProfile = null;
let currentSystemMode = 'service';

// DOM Elements
const authShield = document.getElementById('mobile-auth-shield');
const portalContainer = document.getElementById('mobile-portal');
const loginForm = document.getElementById('form-mobile-login');
const logoutBtn = document.getElementById('btn-m-logout');

// Header Elements
const headerCompany = document.getElementById('m-header-company');
const headerTier = document.getElementById('m-header-tier');

// Navigation Elements
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.mobile-screen');

// 1. Initial State Check
document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    initAuthenticatedSession();
  } else {
    showAuthShield(true);
  }
  
  initNavigation();
  initFormListeners();
  initCrmTabs();
  initBookingSheet();
  initSearchFilters();
  initCallDetailSheet();
  initGcalSheet();
  initMobileTableSheet();
  initMobileRoomSheet();
});

// Authentication Shield view
function showAuthShield(show) {
  if (show) {
    authShield.classList.add('active');
    portalContainer.style.display = 'none';
  } else {
    authShield.classList.remove('active');
    portalContainer.style.display = 'flex';
  }
}

// REST helper wrapper
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(endpoint, options);
  if (response.status === 401 || response.status === 403) {
    // Auth expired or suspended
    logout();
    throw new Error('Authentication expired or account suspended.');
  }
  return response;
}

// Initialize Authenticated Portal Session
async function initAuthenticatedSession() {
  showAuthShield(false);
  
  try {
    // 1. Fetch user billing and workspace info
    const res = await apiCall('/api/saas/billing');
    if (!res.ok) throw new Error('Failed to load session billing');
    
    const billing = await res.json();
    currentTenant = billing.usage;
    
    // Update Header
    headerCompany.textContent = currentTenant.company_name || 'My Workspace';
    headerTier.textContent = billing.usage.tier;
    document.getElementById('m-user-name').textContent = currentTenant.name || 'Manager';
    
    // Fetch profile and Load current Screen Data
    await fetchUserProfile();
    await refreshActiveScreenData();
  } catch (err) {
    console.error('Session initialization failed:', err);
    logout();
  }
}

// Navigation Handling
function initNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      const target = item.dataset.target;
      
      // Update Tab active
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      // Update Screen active
      screens.forEach(s => s.classList.remove('active'));
      const activeScreen = document.getElementById(`scr-${target}`);
      if (activeScreen) {
        activeScreen.classList.add('active');
      }
      
      // Reload relevant data
      await refreshActiveScreenData();
    });
  });
}

// Refresh Scoped data depending on active screen
async function refreshActiveScreenData() {
  if (!token) return;
  
  const activeScreen = document.querySelector('.mobile-screen.active');
  const screenId = activeScreen ? activeScreen.id : '';
  
  try {
    if (screenId === 'scr-home') {
      await loadHomeData();
    } else if (screenId === 'scr-bookings') {
      await loadBookingsData();
    } else if (screenId === 'scr-crm') {
      await loadCrmData();
    } else if (screenId === 'scr-settings') {
      await loadSettingsData();
    }
  } catch (e) {
    console.error('Failed to load screen data:', e);
  }
}

// Dashboard Screen data loader
async function loadHomeData() {
  // Update Stats
  const billingRes = await apiCall('/api/saas/billing');
  if (billingRes.ok) {
    const data = await billingRes.json();
    document.getElementById('m-stat-active-calls').textContent = data.usage.usage_active_calls || 0;
    document.getElementById('m-stat-minutes').textContent = (data.usage.usage_minutes || 0).toFixed(1);
    headerTier.textContent = data.usage.tier;
  }

  // Load Settings for Indicator
  const settingsRes = await apiCall('/api/settings');
  if (settingsRes.ok) {
    const settings = await settingsRes.json();
    document.getElementById('m-indicator-agent-name').textContent = settings.agent_name || 'Aura';
  }

  // Load Call logs
  const callsRes = await apiCall('/api/calls');
  if (callsRes.ok) {
    const calls = await callsRes.json();
    recentCallsList = calls; // Store globally
    const callsList = document.getElementById('m-calls-list');
    
    if (calls.length === 0) {
      callsList.innerHTML = '<p class="empty-text">No calls recorded yet.</p>';
    } else {
      // Display only last 5 calls on Home Screen
      const recentCalls = calls.slice(0, 5);
      callsList.innerHTML = recentCalls.map(call => {
        const timeStr = formatRelativeTime(call.created_at);
        const iconClass = call.direction === 'inbound' ? 'inbound' : 'outbound';
        const iconName = call.direction === 'inbound' ? 'phone-incoming' : 'phone-outgoing';
        
        return `
          <div class="m-call-item glass" onclick="showCallDetail('${call.call_sid}')" style="cursor: pointer;">
            <div class="call-item-left">
              <div class="call-icon-box ${iconClass}">
                <i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>
              </div>
              <div class="call-item-info">
                <h6>${escapeHtml(call.phone_number)}</h6>
                <span>${timeStr}</span>
              </div>
            </div>
            <div class="call-item-right">
              <div class="call-duration">${call.duration}s</div>
              <span class="call-status-pill ${call.status}">${call.status}</span>
            </div>
          </div>
        `;
      }).join('');
      lucide.createIcons();
    }
  }
}

// Bookings Screen data loader
async function loadBookingsData() {
  // Sync currentSystemMode before rendering bookings list and dropdown resources
  try {
    const settingsRes = await apiCall('/api/settings');
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      currentSystemMode = settings.system_mode || 'service';
    }
  } catch (e) {
    console.error('Failed to sync system mode during bookings load', e);
  }

  const res = await apiCall('/api/appointments');
  if (res.ok) {
    const bookings = await res.json();
    renderBookings(bookings);
  }
  await populateMobileResources();
}

function renderBookings(bookings) {
  const list = document.getElementById('m-bookings-list');
  const searchVal = document.getElementById('search-m-bookings').value.toLowerCase().trim();
  
  const isRestaurant = currentSystemMode === 'restaurant';
  const isHotel = currentSystemMode === 'hotel';
  const filtered = bookings.filter(b => {
    const matchesCustomer = b.customer_name.toLowerCase().includes(searchVal);
    const matchesService = b.service.toLowerCase().includes(searchVal);
    const matchesResource = b.resource_name && b.resource_name.toLowerCase().includes(searchVal);
    const matchesTable = b.table_number && b.table_number.toLowerCase().includes(searchVal);
    const matchesRoom = b.room_number && b.room_number.toLowerCase().includes(searchVal);
    return matchesCustomer || matchesService || matchesResource || matchesTable || matchesRoom;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<p class="empty-text">${searchVal ? 'No matches found.' : 'No upcoming bookings scheduled.'}</p>`;
    return;
  }

  list.innerHTML = filtered.map(b => {
    let resourceDisplay = escapeHtml(b.resource_name || 'General');
    let resourceIcon = 'user';
    if (isRestaurant) {
      resourceDisplay = `Table ${escapeHtml(b.table_number || b.resource_name || 'Auto-allocated')} (${b.party_size || 1} guests)`;
      resourceIcon = 'users';
    } else if (isHotel) {
      resourceDisplay = `Room ${escapeHtml(b.room_number || b.resource_name || 'Auto-allocated')} (${b.party_size || 1} guests)`;
      resourceIcon = 'home';
    }

    let dateDisplay = formatDate(b.date);
    if (isHotel && b.checkout_date) {
      dateDisplay = `${formatDate(b.date)} - ${formatDate(b.checkout_date)}`;
    }

    const timeBadge = isHotel ? '<span class="booking-time-badge">Hotel</span>' : `<span class="booking-time-badge">${b.time}</span>`;

    return `
      <div class="m-booking-card glass">
        <div class="booking-card-header">
          <h5>${escapeHtml(b.customer_name)}</h5>
          ${timeBadge}
        </div>
        <div class="booking-details-row">
          <span><i data-lucide="tag"></i> ${escapeHtml(b.service)}</span>
          <span><i data-lucide="${resourceIcon}"></i> ${resourceDisplay}</span>
          <span><i data-lucide="calendar"></i> ${dateDisplay}</span>
        </div>
        ${b.notes ? `<div class="booking-notes">${escapeHtml(b.notes)}</div>` : ''}
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

// CRM Screen data loader
async function loadCrmData() {
  const activeSubTab = document.querySelector('.m-sub-tab.active').dataset.subtab;
  
  if (activeSubTab === 'contacts') {
    const res = await apiCall('/api/crm/contacts');
    if (res.ok) {
      const contacts = await res.json();
      renderContacts(contacts);
    }
  } else {
    const res = await apiCall('/api/crm/deals');
    if (res.ok) {
      const deals = await res.json();
      renderDeals(deals);
    }
  }
}

function renderContacts(contacts) {
  const list = document.getElementById('m-contacts-list');
  const searchVal = document.getElementById('search-m-contacts').value.toLowerCase().trim();
  
  const filtered = contacts.filter(c => {
    return c.name.toLowerCase().includes(searchVal) ||
           c.phone.toLowerCase().includes(searchVal) ||
           (c.email && c.email.toLowerCase().includes(searchVal));
  });

  if (filtered.length === 0) {
    list.innerHTML = `<p class="empty-text">No contacts found.</p>`;
    return;
  }

  list.innerHTML = filtered.map(c => {
    return `
      <div class="m-contact-card glass">
        <div class="m-contact-info">
          <h6>${escapeHtml(c.name)}</h6>
          <span>${escapeHtml(c.phone)} ${c.email ? `• ${escapeHtml(c.email)}` : ''}</span>
        </div>
        <div class="m-contact-actions">
          <a href="tel:${c.phone}" class="btn-action-call">
            <i data-lucide="phone" style="width: 14px; height: 14px;"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

function renderDeals(deals) {
  const list = document.getElementById('m-deals-list');
  
  if (deals.length === 0) {
    list.innerHTML = '<p class="empty-text">No pipeline deals recorded.</p>';
    return;
  }

  list.innerHTML = deals.map(d => {
    return `
      <div class="m-deal-card glass">
        <div class="deal-card-left">
          <h6>${escapeHtml(d.name)}</h6>
          <div class="deal-client">${escapeHtml(d.contact_name)}</div>
          <span class="deal-stage-pill ${d.stage}">${escapeHtml(d.stage)}</span>
        </div>
        <div class="deal-amount">$${d.amount.toFixed(0)}</div>
      </div>
    `;
  }).join('');
}

// Settings Screen data loader
async function loadSettingsData() {
  const res = await apiCall('/api/settings');
  if (res.ok) {
    const settings = await res.json();
    currentSystemMode = settings.system_mode || 'service';
    document.getElementById('m-set-company').value = settings.company_name || '';
    document.getElementById('m-set-agent-name').value = settings.agent_name || '';
    document.getElementById('m-set-voice').value = settings.voice || 'alloy';
    document.getElementById('m-set-accent').value = settings.voice_accent || 'default';
    document.getElementById('m-set-system-mode').value = currentSystemMode;
    const maxDurationElement = document.getElementById('m-set-max-duration');
    const silenceTimeoutElement = document.getElementById('m-set-silence-timeout');
    if (maxDurationElement) {
      maxDurationElement.value = settings.max_call_duration !== undefined ? settings.max_call_duration.toString() : '10';
    }
    if (silenceTimeoutElement) {
      silenceTimeoutElement.value = settings.max_no_speech_timeout !== undefined ? settings.max_no_speech_timeout.toString() : '30';
    }
    document.getElementById('m-set-transfer').value = settings.transfer_phone_number || '';
    document.getElementById('m-set-resources').value = settings.resources_list || '';
    const websiteUrlElement = document.getElementById('m-set-website-url');
    const crawlStatusText = document.getElementById('m-crawl-status-text');
    const crawlStatusContainer = document.getElementById('m-crawl-status-container');
    if (websiteUrlElement) {
      websiteUrlElement.value = settings.website_url || '';
    }
    if (crawlStatusContainer && crawlStatusText) {
      if (settings.crawled_content) {
        crawlStatusContainer.style.display = 'block';
        crawlStatusText.textContent = `Scraped ${settings.crawled_content.length} characters`;
        crawlStatusText.style.color = '#00c864';
      } else {
        crawlStatusContainer.style.display = 'none';
      }
    }

    // Update UI components dynamically based on Scheduling Mode
    updateMobileSystemModeUi(currentSystemMode);
    if (currentSystemMode === 'restaurant') {
      await fetchMobileRestaurantTables();
    } else if (currentSystemMode === 'hotel') {
      await fetchMobileHotelRooms();
    }
  }

  // Load user profile for personal calendar settings
  await fetchUserProfile();
  if (loggedInUserProfile) {
    // Populate Working Hours
    let workingHours = {};
    if (loggedInUserProfile.working_hours) {
      try {
        workingHours = typeof loggedInUserProfile.working_hours === 'string' ? JSON.parse(loggedInUserProfile.working_hours) : loggedInUserProfile.working_hours;
      } catch (e) {
        console.error('Failed to parse working hours in mobile', e);
      }
    }
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const checkbox = document.getElementById('m-work-day-' + day);
      const startInput = document.getElementById('m-work-start-' + day);
      const endInput = document.getElementById('m-work-end-' + day);
      if (checkbox && startInput && endInput) {
        const dayRule = workingHours[day] || { active: day !== 'saturday' && day !== 'sunday', start: '09:00', end: '17:00' };
        checkbox.checked = !!dayRule.active;
        startInput.value = dayRule.start || '09:00';
        endInput.value = dayRule.end || '17:00';
      }
    });

    // Populate Break Periods
    let breakPeriods = [];
    if (loggedInUserProfile.break_periods) {
      try {
        breakPeriods = typeof loggedInUserProfile.break_periods === 'string' ? JSON.parse(loggedInUserProfile.break_periods) : loggedInUserProfile.break_periods;
      } catch (e) {
        console.error('Failed to parse break periods in mobile', e);
      }
    }
    const lunchBreak = breakPeriods.find(b => b.name === 'Lunch') || breakPeriods[0] || { start: '12:00', end: '13:00' };
    const breakStart = document.getElementById('m-break-start');
    const breakEnd = document.getElementById('m-break-end');
    if (breakStart) breakStart.value = lunchBreak.start || '12:00';
    if (breakEnd) breakEnd.value = lunchBreak.end || '13:00';

    // Populate Buffer Gap
    const gapSelect = document.getElementById('m-appointment-gap');
    if (gapSelect) {
      gapSelect.value = loggedInUserProfile.appointment_gap !== undefined && loggedInUserProfile.appointment_gap !== null ? loggedInUserProfile.appointment_gap.toString() : '15';
    }

    // Google Calendar Sync State
    const statusText = document.getElementById('m-gcal-status-text');
    const statusSubtext = document.getElementById('m-gcal-status-subtext');
    const connectBtn = document.getElementById('btn-m-connect-gcal');
    
    if (loggedInUserProfile.google_calendar_connected) {
      if (statusText) statusText.textContent = 'Connected';
      if (statusSubtext) statusSubtext.textContent = `Synced: ${loggedInUserProfile.google_calendar_email}`;
      if (connectBtn) {
        connectBtn.textContent = 'Disconnect';
        connectBtn.classList.remove('btn-primary-mobile');
        connectBtn.classList.add('btn-secondary-mobile');
      }
    } else {
      if (statusText) statusText.textContent = 'Disconnected';
      if (statusSubtext) statusSubtext.textContent = 'Sync appointments in real-time';
      if (connectBtn) {
        connectBtn.textContent = 'Connect';
        connectBtn.classList.remove('btn-secondary-mobile');
        connectBtn.classList.add('btn-primary-mobile');
      }
    }
    lucide.createIcons();
  }
}

// Auth Forms event handler
function initFormListeners() {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('m-login-email').value.trim();
    const password = document.getElementById('m-login-password').value;
    
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        token = data.token;
        localStorage.setItem('saas_token', token);
        
        // Notify parent iframe container if running inside simulator
        window.parent.postMessage({ event: 'mobile_login_success', token }, '*');
        
        await initAuthenticatedSession();
      } else {
        alert(data.error || 'Authentication failed. Please check credentials.');
      }
    } catch (err) {
      console.error(err);
      alert('Network failure connecting to SaaS portal.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Authorize Access</span> <i data-lucide="arrow-right"></i>';
      lucide.createIcons();
    }
  });

  logoutBtn.addEventListener('click', () => {
    logout();
  });

  // Dynamic system mode select listener
  const modeSelect = document.getElementById('m-set-system-mode');
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      const selectedMode = e.target.value;
      updateMobileSystemModeUi(selectedMode);
      if (selectedMode === 'restaurant') {
        fetchMobileRestaurantTables();
      } else if (selectedMode === 'hotel') {
        fetchMobileHotelRooms();
      }
    });
  }

  // Mobile Website Crawling Click Hook
  const btnMobileCrawl = document.getElementById('btn-m-crawl-website');
  if (btnMobileCrawl) {
    btnMobileCrawl.addEventListener('click', async () => {
      const urlInput = document.getElementById('m-set-website-url');
      const urlVal = urlInput ? urlInput.value.trim() : '';
      if (!urlVal) {
        alert('Please enter a valid website URL before crawling.');
        return;
      }

      btnMobileCrawl.disabled = true;
      btnMobileCrawl.innerHTML = `<i data-lucide="loader-2" style="width: 14px; height: 14px; animation: spin 1s linear infinite;"></i>`;
      if (window.lucide) window.lucide.createIcons();

      const crawlStatusContainer = document.getElementById('m-crawl-status-container');
      const crawlStatusText = document.getElementById('m-crawl-status-text');

      if (crawlStatusContainer && crawlStatusText) {
        crawlStatusContainer.style.display = 'block';
        crawlStatusText.textContent = 'Fetching...';
        crawlStatusText.style.color = '#ffaa00';
      }

      try {
        const response = await fetch('/api/settings/crawl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          body: JSON.stringify({ websiteUrl: urlVal })
        });

        const data = await response.json();
        if (response.ok && data.success) {
          alert(data.message);
          if (crawlStatusText) {
            crawlStatusText.textContent = `Scraped ${data.crawled_content.length} characters`;
            crawlStatusText.style.color = '#00c864';
          }
          // Sync with parent simulator to update desktopSettings UI too
          window.parent.postMessage({ event: 'mobile_settings_updated' }, '*');
        } else {
          throw new Error(data.error || 'Scraping failed.');
        }
      } catch (err) {
        console.error(err);
        alert('Crawl failed: ' + err.message);
        if (crawlStatusText) {
          crawlStatusText.textContent = 'Failed';
          crawlStatusText.style.color = '#ff3232';
        }
      } finally {
        btnMobileCrawl.disabled = false;
        btnMobileCrawl.innerHTML = `<i data-lucide="globe" style="width: 14px; height: 14px;"></i> Crawl`;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  // Settings Save listener
  document.getElementById('form-mobile-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btn-m-save-settings');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    // Fetch existing settings to avoid overwriting them
    let systemPrompt = "You are a helpful AI receptionist.";
    let businessHours = 'Monday to Friday, 9:00 AM to 6:00 PM';
    let servicesOffered = 'General Services';
    let openaiModel = 'gpt-4o-mini-realtime-preview';
    let twilioPhoneNumber = '';

    try {
      const currentSettings = await apiCall('/api/settings');
      if (currentSettings.ok) {
        const s = await currentSettings.json();
        systemPrompt = s.system_prompt || systemPrompt;
        businessHours = s.business_hours || businessHours;
        servicesOffered = s.services_offered || servicesOffered;
        openaiModel = s.openai_model || openaiModel;
        twilioPhoneNumber = s.twilio_phone_number || '';
      }
    } catch (e) {
      console.error('Error fetching settings for merge', e);
    }

    // Collect Working Hours from mobile checkboxes and times
    const workingHours = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const checkbox = document.getElementById('m-work-day-' + day);
      const startInput = document.getElementById('m-work-start-' + day);
      const endInput = document.getElementById('m-work-end-' + day);
      workingHours[day] = {
        active: checkbox ? checkbox.checked : false,
        start: startInput ? startInput.value : '09:00',
        end: endInput ? endInput.value : '17:00'
      };
    });

    // Collect Break Periods
    const breakStart = document.getElementById('m-break-start')?.value || '12:00';
    const breakEnd = document.getElementById('m-break-end')?.value || '13:00';
    const breakPeriods = [
      { name: 'Lunch', start: breakStart, end: breakEnd }
    ];

    // Collect Buffer Gap
    const gapSelect = document.getElementById('m-appointment-gap');
    const appointmentGap = gapSelect ? parseInt(gapSelect.value) : 15;
    const systemMode = document.getElementById('m-set-system-mode').value;

    const payload = {
      company_name: document.getElementById('m-set-company').value.trim(),
      agent_name: document.getElementById('m-set-agent-name').value.trim(),
      voice: document.getElementById('m-set-voice').value,
      voice_accent: document.getElementById('m-set-accent').value,
      transfer_phone_number: document.getElementById('m-set-transfer').value.trim(),
      resources_list: document.getElementById('m-set-resources').value.trim(),
      system_prompt: systemPrompt,
      business_hours: businessHours,
      services_offered: servicesOffered,
      openai_model: openaiModel,
      twilio_phone_number: twilioPhoneNumber,
      working_hours: JSON.stringify(workingHours),
      break_periods: JSON.stringify(breakPeriods),
      appointment_gap: appointmentGap,
      system_mode: systemMode,
      max_call_duration: document.getElementById('m-set-max-duration') ? parseInt(document.getElementById('m-set-max-duration').value) : 10,
      max_no_speech_timeout: document.getElementById('m-set-silence-timeout') ? parseInt(document.getElementById('m-set-silence-timeout').value) : 30,
      website_url: document.getElementById('m-set-website-url') ? document.getElementById('m-set-website-url').value.trim() : ''
    };

    try {
      const res = await apiCall('/api/settings', 'POST', payload);
      if (res.ok) {
        currentSystemMode = systemMode;
        if (loggedInUserProfile && loggedInUserProfile.id) {
          await apiCall(`/api/team/${loggedInUserProfile.id}/calendar`, 'PUT', {
            working_hours: workingHours,
            break_periods: breakPeriods,
            appointment_gap: appointmentGap
          });
        }
        await populateMobileResources();
        populateMobileServices(currentSystemMode);
        alert('AI settings successfully updated!');
        // Notify parent iframe container to reload desktop settings
        window.parent.postMessage({ event: 'mobile_settings_updated' }, '*');
      } else {
        const err = await res.json();
        alert('Save failed: ' + err.error);
      }
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="save"></i> <span>Save Settings</span>';
      lucide.createIcons();
    }
  });
}

// CRM tabs logic
function initCrmTabs() {
  const tabs = document.querySelectorAll('.m-sub-tab');
  const panes = document.querySelectorAll('.m-crm-subpane');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const target = tab.dataset.subtab;
      panes.forEach(p => p.classList.remove('active'));
      document.getElementById(`m-sub-${target}`).classList.add('active');
      
      await loadCrmData();
    });
  });
}

// Booking Sheet Slide-up logic
function initBookingSheet() {
  const sheet = document.getElementById('m-sheet-booking');
  const openBtn = document.getElementById('btn-m-add-booking');
  const closeBtn = document.getElementById('btn-m-close-sheet');
  const form = document.getElementById('form-m-booking');

  openBtn.addEventListener('click', async () => {
    sheet.classList.add('active');
    // Set default date as today
    document.getElementById('m-appt-date').value = new Date().toISOString().split('T')[0];
    
    // Sync settings System Mode before displaying booking form
    try {
      const settingsRes = await apiCall('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        currentSystemMode = settings.system_mode || 'service';
      }
    } catch (e) {
      console.error('Failed to sync system mode during booking sheet open', e);
    }
    
    updateMobileSystemModeUi(currentSystemMode);
    await populateMobileResources();
    populateMobileServices(currentSystemMode);
  });

  closeBtn.addEventListener('click', () => {
    sheet.classList.remove('active');
    form.reset();
  });

  // Schedule Submit listener
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const isRestaurant = currentSystemMode === 'restaurant';
    const isHotel = currentSystemMode === 'hotel';
    const resourceVal = document.getElementById('m-appt-resource').value.trim();
    const partySize = (isRestaurant || isHotel) ? parseInt(document.getElementById('m-appt-party-size').value || '1') : 1;
    const checkout_date = isHotel ? document.getElementById('m-appt-checkout-date').value : null;
    const timeVal = isHotel ? '14:00' : document.getElementById('m-appt-time').value;

    const payload = {
      customer_name: document.getElementById('m-appt-name').value.trim(),
      customer_phone: document.getElementById('m-appt-phone').value.trim(),
      date: document.getElementById('m-appt-date').value,
      time: timeVal,
      service: document.getElementById('m-appt-service').value,
      resource_name: resourceVal,
      notes: document.getElementById('m-appt-notes').value.trim(),
      party_size: partySize,
      table_number: isRestaurant ? resourceVal : null,
      room_number: isHotel ? resourceVal : null,
      checkout_date: checkout_date
    };

    try {
      const res = await apiCall('/api/appointments', 'POST', payload);
      if (res.ok) {
        alert('Booking scheduled successfully!');
        sheet.classList.remove('active');
        form.reset();
        
        // Notify parent iframe container to reload desktop appointments
        window.parent.postMessage({ event: 'mobile_booking_created' }, '*');
        
        await loadBookingsData();
      } else {
        const err = await res.json();
        alert('Booking failed: ' + err.error);
      }
    } catch (e) {
      alert('Booking failed: ' + e.message);
    }
  });
}

// Search Inputs logic
function initSearchFilters() {
  document.getElementById('search-m-bookings').addEventListener('input', async () => {
    await loadBookingsData();
  });
  
  document.getElementById('search-m-contacts').addEventListener('input', async () => {
    await loadCrmData();
  });
}

// Logout session
function logout() {
  token = null;
  localStorage.removeItem('saas_token');
  showAuthShield(true);
  loginForm.reset();
}

// Parent Simulator communication receiver
window.addEventListener('message', (e) => {
  if (e.data && e.data.event === 'sync_token') {
    token = e.data.token;
    localStorage.setItem('saas_token', token);
    initAuthenticatedSession();
  }
  if (e.data && e.data.event === 'refresh_data') {
    refreshActiveScreenData();
  }
});

// Timestamps & Dates formatting utilities
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(dateStr);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initCallDetailSheet() {
  const closeBtn = document.getElementById('btn-m-close-call-sheet');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('m-sheet-call-detail').classList.remove('active');
    });
  }
}

window.showCallDetail = (callSid) => {
  const call = recentCallsList.find(c => c.call_sid === callSid);
  if (!call) return;

  document.getElementById('m-call-detail-phone').textContent = escapeHtml(call.phone_number);
  
  const statusPill = document.getElementById('m-call-detail-status');
  statusPill.textContent = call.status;
  statusPill.className = `call-status-pill ${call.status}`;

  const timeStr = formatDate(call.created_at) + ' at ' + formatTime(call.created_at);
  document.getElementById('m-call-detail-time').textContent = timeStr;
  document.getElementById('m-call-detail-duration').textContent = `Duration: ${call.duration}s`;

  // Summary
  const summaryWrapper = document.getElementById('m-call-detail-summary-wrapper');
  const summaryEl = document.getElementById('m-call-detail-summary');
  if (call.summary) {
    summaryEl.textContent = call.summary;
    summaryWrapper.style.display = 'block';
  } else {
    summaryWrapper.style.display = 'none';
  }

  // Transcript Feed
  const transcriptList = document.getElementById('m-call-detail-transcript');
  let transcripts = [];
  try {
    transcripts = JSON.parse(call.transcript || '[]');
  } catch (e) {
    console.error('Failed to parse call transcript JSON:', e);
  }

  if (transcripts.length === 0) {
    transcriptList.innerHTML = '<p class="empty-text">No conversation transcript recorded.</p>';
  } else {
    transcriptList.innerHTML = transcripts.map(bubble => {
      const bubbleClass = bubble.speaker === 'user' ? 'user' : 'assistant';
      const speakerName = bubble.speaker === 'user' ? 'Customer' : (document.getElementById('m-indicator-agent-name').textContent || 'Aura');
      return `
        <div class="m-transcript-bubble ${bubbleClass}">
          <strong style="display:block; font-size:0.7rem; margin-bottom: 2px; opacity:0.85;">${escapeHtml(speakerName)}</strong>
          <span>${escapeHtml(bubble.text)}</span>
        </div>
      `;
    }).join('');
  }

  // Open the sheet
  document.getElementById('m-sheet-call-detail').classList.add('active');
};

async function fetchUserProfile() {
  try {
    const res = await apiCall('/api/user/profile');
    if (res.ok) {
      loggedInUserProfile = await res.json();
    }
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
  }
}

async function populateMobileResources() {
  try {
    const isRestaurant = currentSystemMode === 'restaurant';
    const isHotel = currentSystemMode === 'hotel';
    let endpoint = '/api/team';
    if (isRestaurant) {
      endpoint = '/api/restaurant/tables';
    } else if (isHotel) {
      endpoint = '/api/hotel/rooms';
    }
    
    const res = await fetch(endpoint, {
      headers: {
        'Authorization': token
      }
    });
    if (res.ok) {
      const items = await res.json();
      const selectEl = document.getElementById('m-appt-resource');
      if (selectEl) {
        const currentVal = selectEl.value;
        if (isRestaurant) {
          selectEl.innerHTML = `
            <option value="">-- Choose Table (Auto-allocated if blank) --</option>
            ${items.map(t => `<option value="${escapeHtml(t.table_number)}">${escapeHtml(t.table_number)} (${t.seats} seats)</option>`).join('')}
          `;
        } else if (isHotel) {
          selectEl.innerHTML = `
            <option value="">-- Choose Room (Auto-allocated if blank) --</option>
            ${items.map(r => `<option value="${escapeHtml(r.room_number)}">${escapeHtml(r.room_number)} (${escapeHtml(r.room_type)} - $${r.price_per_night}/night)</option>`).join('')}
          `;
        } else {
          selectEl.innerHTML = `
            <option value="">-- Select Staff / Resource --</option>
            ${items.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('')}
          `;
        }
        if (currentVal) selectEl.value = currentVal;
      }
    }
  } catch (err) {
    console.error('Failed to populate mobile resources:', err);
  }
}

function initGcalSheet() {
  const sheet = document.getElementById('m-sheet-gcal');
  const openBtn = document.getElementById('btn-m-connect-gcal');
  const closeBtn = document.getElementById('btn-m-close-gcal-sheet');
  const form = document.getElementById('form-m-connect-gcal');

  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      if (loggedInUserProfile && loggedInUserProfile.google_calendar_connected) {
        if (!confirm('Are you sure you want to disconnect Google Calendar?')) return;
        try {
          const res = await apiCall(`/api/team/${loggedInUserProfile.id}/gcal/disconnect`, 'POST');
          if (res.ok) {
            await loadSettingsData();
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        sheet.classList.add('active');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sheet.classList.remove('active');
      form.reset();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('m-gcal-email').value.trim();
      if (!loggedInUserProfile || !email) return;

      try {
        const res = await apiCall(`/api/team/${loggedInUserProfile.id}/gcal/connect`, 'POST', { email });
        if (res.ok) {
          sheet.classList.remove('active');
          form.reset();
          await loadSettingsData();
        } else {
          const err = await res.json();
          alert('Failed to connect: ' + err.error);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  }
}

function updateMobileSystemModeUi(mode) {
  const isRestaurant = mode === 'restaurant';
  const isHotel = mode === 'hotel';
  
  // Toggle settings inputs
  const resourcesGroup = document.getElementById('m-set-resources-group');
  const tablesGroup = document.getElementById('m-set-tables-group');
  const roomsGroup = document.getElementById('m-set-rooms-group');
  if (resourcesGroup) resourcesGroup.style.display = (isRestaurant || isHotel) ? 'none' : 'block';
  if (tablesGroup) tablesGroup.style.display = isRestaurant ? 'block' : 'none';
  if (roomsGroup) roomsGroup.style.display = isHotel ? 'block' : 'none';

  // Toggle booking fields
  const partyRow = document.getElementById('m-appt-party-row');
  if (partyRow) partyRow.style.display = (isRestaurant || isHotel) ? 'block' : 'none';

  const checkoutGroup = document.getElementById('m-appt-checkout-group');
  const timeGroup = document.getElementById('m-appt-time-group');
  const checkoutInput = document.getElementById('m-appt-checkout-date');
  const timeInput = document.getElementById('m-appt-time');
  const dateLabel = document.getElementById('m-appt-date-label');

  if (checkoutGroup) checkoutGroup.style.display = isHotel ? 'block' : 'none';
  if (timeGroup) timeGroup.style.display = isHotel ? 'none' : 'block';
  if (checkoutInput) checkoutInput.required = isHotel;
  if (timeInput) timeInput.required = !isHotel;
  if (dateLabel) dateLabel.textContent = isHotel ? 'Check-In Date *' : 'Date *';

  const apptResourceLabel = document.getElementById('m-appt-resource-label');
  if (apptResourceLabel) {
    apptResourceLabel.textContent = isHotel ? 'Room Preference *' : (isRestaurant ? 'Allocated Table Preference *' : 'Staff / Resource *');
  }

  const apptServiceLabel = document.getElementById('m-appt-service-label');
  if (apptServiceLabel) {
    apptServiceLabel.textContent = isHotel ? 'Room Type *' : (isRestaurant ? 'Meal / Occasion *' : 'Service *');
  }
}

function populateMobileServices(mode) {
  const serviceSelect = document.getElementById('m-appt-service');
  if (serviceSelect) {
    const currentVal = serviceSelect.value;
    if (mode === 'hotel') {
      serviceSelect.innerHTML = `
        <option value="">-- Choose Room Type --</option>
        <option value="Single Room">Single Room</option>
        <option value="Double Room">Double Room</option>
        <option value="Deluxe Suite">Deluxe Suite</option>
        <option value="Family Room">Family Room</option>
      `;
    } else if (mode === 'restaurant') {
      serviceSelect.innerHTML = `
        <option value="">-- Choose Meal/Occasion --</option>
        <option value="Breakfast">Breakfast</option>
        <option value="Brunch">Brunch</option>
        <option value="Lunch">Lunch</option>
        <option value="Dinner">Dinner</option>
        <option value="Drinks / Bar">Drinks / Bar</option>
        <option value="Special Occasion">Special Occasion</option>
      `;
    } else {
      serviceSelect.innerHTML = `
        <option value="">-- Select Service --</option>
        <option value="Swedish Massage">Swedish Massage</option>
        <option value="Deep Tissue Massage">Deep Tissue Massage</option>
        <option value="Facial Treatment">Facial Treatment</option>
        <option value="Aromatherapy">Aromatherapy</option>
      `;
    }
    if (currentVal) serviceSelect.value = currentVal;
  }
}

async function fetchMobileRestaurantTables() {
  try {
    const res = await fetch('/api/restaurant/tables', {
      headers: { 'Authorization': token }
    });
    if (res.ok) {
      const tables = await res.json();
      const container = document.getElementById('m-tables-list-container');
      if (container) {
        if (tables.length === 0) {
          container.innerHTML = '<p class="empty-text" style="font-size:0.75rem; text-align:center;">No tables configured.</p>';
        } else {
          container.innerHTML = tables.map(t => {
            return `
              <div class="glass" style="padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 0.8rem; margin-bottom: 8px;">
                <div style="font-weight: 600; color: white;">
                  ${escapeHtml(t.table_number)} 
                  <span class="badge-tier" style="font-size: 0.6rem; padding: 1px 4px; margin-left: 4px;">${t.seats} seats</span>
                </div>
                <div style="display: flex; gap: 4px;">
                  <button type="button" class="icon-btn-mobile" onclick="openMobileEditTableModal(${t.id}, '${escapeHtml(t.table_number)}', ${t.seats})" style="width: 26px; height: 26px; min-height: auto; padding: 0;">
                    <i data-lucide="edit" style="width: 12px; height: 12px;"></i>
                  </button>
                  <button type="button" class="icon-btn-mobile" onclick="deleteMobileRestaurantTable(${t.id})" style="width: 26px; height: 26px; min-height: auto; padding: 0; border-color: rgba(239, 68, 68, 0.2);">
                    <i data-lucide="trash-2" style="width: 12px; height: 12px; color: var(--color-danger);"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');
          lucide.createIcons();
        }
      }
    }
  } catch (err) {
    console.error('Failed to load mobile restaurant tables:', err);
  }
}

window.openMobileEditTableModal = (tableId, number, seats) => {
  document.getElementById('m-table-id-input').value = tableId;
  document.getElementById('m-table-number-input').value = number;
  document.getElementById('m-table-seats-input').value = seats;
  document.getElementById('m-table-sheet-title').textContent = 'Edit Restaurant Table';
  document.getElementById('m-sheet-table').classList.add('active');
};

window.deleteMobileRestaurantTable = async (tableId) => {
  if (!confirm('Are you sure you want to remove this table?')) return;
  try {
    const res = await fetch(`/api/restaurant/tables/${tableId}`, {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });
    if (res.ok) {
      await fetchMobileRestaurantTables();
      await populateMobileResources();
    } else {
      const err = await res.json();
      alert(`Error deleting table: ${err.error}`);
    }
  } catch (e) {
    console.error('Delete table error:', e);
  }
};

function initMobileTableSheet() {
  const sheet = document.getElementById('m-sheet-table');
  const openBtn = document.getElementById('btn-m-open-table-sheet');
  const closeBtn = document.getElementById('btn-m-close-table-sheet');
  const form = document.getElementById('form-m-table');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.getElementById('m-table-id-input').value = '';
      document.getElementById('m-table-number-input').value = '';
      document.getElementById('m-table-seats-input').value = '';
      document.getElementById('m-table-sheet-title').textContent = 'Add Restaurant Table';
      sheet.classList.add('active');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sheet.classList.remove('active');
      form.reset();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tableId = document.getElementById('m-table-id-input').value;
      const table_number = document.getElementById('m-table-number-input').value.trim();
      const seats = parseInt(document.getElementById('m-table-seats-input').value);

      const url = tableId ? `/api/restaurant/tables/${tableId}` : '/api/restaurant/tables';
      const method = tableId ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          body: JSON.stringify({ table_number, seats })
        });
        if (response.ok) {
          sheet.classList.remove('active');
          form.reset();
          await fetchMobileRestaurantTables();
          await populateMobileResources();
        } else {
          const err = await response.json();
          alert(`Error saving table: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
}

async function fetchMobileHotelRooms() {
  try {
    const res = await fetch('/api/hotel/rooms', {
      headers: { 'Authorization': token }
    });
    if (res.ok) {
      const rooms = await res.json();
      const container = document.getElementById('m-rooms-list-container');
      if (container) {
        if (rooms.length === 0) {
          container.innerHTML = '<p class="empty-text" style="font-size:0.75rem; text-align:center;">No rooms configured.</p>';
        } else {
          container.innerHTML = rooms.map(r => {
            return `
              <div class="glass" style="padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 0.8rem; margin-bottom: 8px;">
                <div style="font-weight: 600; color: white;">
                  Room ${escapeHtml(r.room_number)} 
                  <span class="badge-tier" style="font-size: 0.65rem; padding: 1px 4px; margin-left: 4px;">${escapeHtml(r.room_type)}</span>
                  <span style="color: var(--color-primary); margin-left: 4px;">$${r.price_per_night}/n</span>
                </div>
                <div style="display: flex; gap: 4px;">
                  <button type="button" class="icon-btn-mobile" onclick="openMobileEditRoomModal(${r.id}, '${escapeHtml(r.room_number)}', '${escapeHtml(r.room_type)}', ${r.price_per_night})" style="width: 26px; height: 26px; min-height: auto; padding: 0;">
                    <i data-lucide="edit" style="width: 12px; height: 12px;"></i>
                  </button>
                  <button type="button" class="icon-btn-mobile" onclick="deleteMobileHotelRoom(${r.id})" style="width: 26px; height: 26px; min-height: auto; padding: 0; border-color: rgba(239, 68, 68, 0.2);">
                    <i data-lucide="trash-2" style="width: 12px; height: 12px; color: var(--color-danger);"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('');
          lucide.createIcons();
        }
      }
    }
  } catch (err) {
    console.error('Failed to load mobile hotel rooms:', err);
  }
}
window.fetchMobileHotelRooms = fetchMobileHotelRooms;

window.openMobileEditRoomModal = (roomId, number, type, price) => {
  document.getElementById('m-room-id-input').value = roomId;
  document.getElementById('m-room-number-input').value = number;
  document.getElementById('m-room-type-input').value = type;
  document.getElementById('m-room-price-input').value = price;
  document.getElementById('m-room-sheet-title').textContent = 'Edit Hotel Room';
  document.getElementById('m-sheet-room').classList.add('active');
};

window.deleteMobileHotelRoom = async (roomId) => {
  if (!confirm('Are you sure you want to remove this room?')) return;
  try {
    const res = await fetch(`/api/hotel/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });
    if (res.ok) {
      await fetchMobileHotelRooms();
      await populateMobileResources();
    } else {
      const err = await res.json();
      alert(`Error deleting room: ${err.error}`);
    }
  } catch (e) {
    console.error('Delete room error:', e);
  }
};

function initMobileRoomSheet() {
  const sheet = document.getElementById('m-sheet-room');
  const openBtn = document.getElementById('btn-m-open-room-sheet');
  const closeBtn = document.getElementById('btn-m-close-room-sheet');
  const form = document.getElementById('form-m-room');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.getElementById('m-room-id-input').value = '';
      document.getElementById('m-room-number-input').value = '';
      document.getElementById('m-room-type-input').value = 'Single Room';
      document.getElementById('m-room-price-input').value = '';
      document.getElementById('m-room-sheet-title').textContent = 'Add Hotel Room';
      sheet.classList.add('active');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sheet.classList.remove('active');
      form.reset();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const roomId = document.getElementById('m-room-id-input').value;
      const room_number = document.getElementById('m-room-number-input').value.trim();
      const room_type = document.getElementById('m-room-type-input').value;
      const price_per_night = parseFloat(document.getElementById('m-room-price-input').value);

      const url = roomId ? `/api/hotel/rooms/${roomId}` : '/api/hotel/rooms';
      const method = roomId ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          body: JSON.stringify({ room_number, room_type, price_per_night })
        });
        if (response.ok) {
          sheet.classList.remove('active');
          form.reset();
          await fetchMobileHotelRooms();
          await populateMobileResources();
        } else {
          const err = await response.json();
          alert(`Error saving room: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
}

