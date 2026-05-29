// State Management
let saasToken = localStorage.getItem('saas_token');
let currentTenant = null;
let selectedUpgradeTier = null;
let selectedBillingCycle = 'monthly';
let stripePaymentMode = 'upgrade'; // 'upgrade' or 'overage'

let currentTab = 'overview';
const activeCalls = new Map();
let dashboardSocket = null;
let systemConfig = {};
let currentWizardStep = 2;

// CRM State
let allAppointments = [];
let allContacts = [];
let allDeals = [];
let currentCrmSubtab = 'contacts';
let workspaceTeamList = [];
let loggedInUserProfile = null;

// Global Fetch Interceptor for SaaS Scoped API Calls
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : '');
  
  if (urlStr.startsWith('/api/') && !urlStr.startsWith('/api/auth/')) {
    options.headers = options.headers || {};
    
    if (saasToken) {
      if (options.headers instanceof Headers) {
        options.headers.set('Authorization', saasToken);
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['Authorization', saasToken]);
      } else {
        options.headers['Authorization'] = saasToken;
      }
    }
    
    // Inject Impersonation header if active
    if (window.impersonateTenantId) {
      if (options.headers instanceof Headers) {
        options.headers.set('X-Impersonate-Tenant-Id', window.impersonateTenantId);
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['X-Impersonate-Tenant-Id', window.impersonateTenantId]);
      } else {
        options.headers['X-Impersonate-Tenant-Id'] = window.impersonateTenantId;
      }
    }
  }
  
  const response = await originalFetch(url, options);
  if (response.status === 401) {
    logout();
  }
  return response;
};

// DOM Elements
const menuItems = document.querySelectorAll('.menu-item');
const panes = document.querySelectorAll('.pane');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const wsStatusDot = document.getElementById('ws-status-dot');
const wsStatusText = document.getElementById('ws-status-text');

// Modals
const outboundModal = document.getElementById('outbound-call-modal');
const btnOpenOutboundModal = document.getElementById('btn-outbound-call-modal');
const btnCloseOutboundModal = document.getElementById('btn-close-outbound-modal');
const btnCancelOutbound = document.getElementById('btn-cancel-outbound');
const formTriggerOutbound = document.getElementById('form-trigger-outbound');
const outboundPhoneInput = document.getElementById('outbound-phone');
const outboundNameInput = document.getElementById('outbound-name');

// CRM Modals
const addContactModal = document.getElementById('crm-add-contact-modal');
const btnOpenAddContact = document.getElementById('btn-add-contact-modal');
const formAddContact = document.getElementById('form-add-contact');

const addDealModal = document.getElementById('crm-add-deal-modal');
const btnOpenAddDeal = document.getElementById('btn-add-deal-modal');
const formAddDeal = document.getElementById('form-add-deal');
const dealContactSelect = document.getElementById('deal-contact');

const insightsModal = document.getElementById('crm-insights-modal');
const aiInsightsContent = document.getElementById('ai-insights-content');

// Pane Elements: Overview
const metricActiveCalls = document.getElementById('metric-active-calls');
const metricTotalCalls = document.getElementById('metric-total-calls');
const metricTotalAppointments = document.getElementById('metric-total-appointments');
const displayCompanyName = document.getElementById('display-company-name');
const displayOpenaiModel = document.getElementById('display-openai-model');
const displayBusinessHours = document.getElementById('display-business-hours');
const quickAppointmentsList = document.getElementById('quick-appointments-list');
const linkGotoAppointments = document.getElementById('link-goto-appointments');

// Pane Elements: Monitor
const monitorInactiveView = document.getElementById('monitor-inactive-view');
const monitorActiveView = document.getElementById('monitor-active-view');
const monitorCallDirection = document.getElementById('monitor-call-direction');
const monitorCallTimer = document.getElementById('monitor-call-timer');
const monitorCallNumber = document.getElementById('monitor-call-number');
const visualizerBars = document.getElementById('visualizer-bars');
const visualizerStatusText = document.getElementById('visualizer-status-text');
const liveTranscriptFeed = document.getElementById('live-transcript-feed');
const btnQuickOutbound = document.getElementById('btn-quick-outbound');
const menuLiveBadge = document.querySelector('#menu-item-monitor .live-badge');

// Pane Elements: Appointments
const appointmentsTbody = document.getElementById('appointments-tbody');
const appointmentsEmptyState = document.getElementById('appointments-empty-state');
const formManualAppointment = document.getElementById('form-manual-appointment');
const searchAppointmentsInput = document.getElementById('search-appointments');

// Pane Elements: Call History
const callLogsContainer = document.getElementById('call-logs-container');
const historyEmptyState = document.getElementById('history-empty-state');

// Pane Elements: Settings
const formSettingsAi = document.getElementById('form-settings-ai');
const settingsCompany = document.getElementById('settings-company');
const settingsAgentName = document.getElementById('settings-agent-name');
const settingsHours = document.getElementById('settings-hours');
const settingsServices = document.getElementById('settings-services');
const settingsModel = document.getElementById('settings-model');
const settingsVoice = document.getElementById('settings-voice');
const settingsAccent = document.getElementById('settings-accent');
const settingsMaxDuration = document.getElementById('settings-max-duration');
const settingsSilenceTimeout = document.getElementById('settings-silence-timeout');
const settingsWebsiteUrl = document.getElementById('settings-website-url');
const btnCrawlWebsite = document.getElementById('btn-crawl-website');
const crawlStatusContainer = document.getElementById('crawl-status-container');
const crawlStatusBadge = document.getElementById('crawl-status-badge');
const crawlStatusLength = document.getElementById('crawl-status-length');
const crawlStatusPreview = document.getElementById('crawl-status-preview');
const settingsPrompt = document.getElementById('settings-prompt');
const settingsTwilio = document.getElementById('settings-twilio-num');
const settingsTransfer = document.getElementById('settings-transfer-num');
const settingsResources = document.getElementById('settings-resources');
const settingsPaymentProvider = document.getElementById('settings-payment-provider');
const settingsStripePubKey = document.getElementById('settings-stripe-pub-key');
const settingsStripeSecKey = document.getElementById('settings-stripe-sec-key');
const stripeKeysConfig = document.getElementById('stripe-keys-config');
const webhookCopyUrl = document.getElementById('webhook-copy-url');
const btnCopyWebhook = document.getElementById('btn-copy-webhook');
const credOpenaiKey = document.getElementById('cred-openai-key');
const credTwilioSid = document.getElementById('cred-twilio-sid');
const credTwilioNumber = document.getElementById('cred-twilio-number');

// Pane Elements: CRM Hub Sub-tabs
const crmTabs = document.querySelectorAll('.crm-tab');
const crmSubpanes = document.querySelectorAll('.crm-subpane');
const crmContactsTbody = document.getElementById('crm-contacts-tbody');
const formCopilotChat = document.getElementById('form-copilot-chat');
const copilotInput = document.getElementById('copilot-input');
const copilotMessagesFeed = document.getElementById('copilot-messages-feed');

// Initialize Lucide Icons
function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// -------------------------------------------------------------
// TAB NAVIGATION
// -------------------------------------------------------------
const tabMetadata = {
  overview: { title: 'Dashboard Overview', subtitle: 'Real-time status and quick actions' },
  monitor: { title: 'Live Call Monitor', subtitle: 'Observe the AI receptionist in real-time' },
  appointments: { title: 'Bookings & Scheduling', subtitle: 'Manage upcoming appointments and schedule manual slots' },
  crm: { title: 'CRM Hub (HubSpot Model)', subtitle: 'Manage contacts, deal stages, and run natural language copilot actions' },
  history: { title: 'Call History Logs', subtitle: 'Access recordings, summaries, and complete chat transcripts' },
  settings: { title: 'Agent Settings & Profiles', subtitle: 'Customize prompts, services, and system parameters' },
  billing: { title: 'SaaS Billing & Quotas', subtitle: 'Track your call limits and upgrade subscription tiers' },
  services: { title: 'Services & Pricing', subtitle: 'Manage your catalog and import pricing structure' },
  accounting: { title: 'Accounting', subtitle: 'Manage finances, invoices, payments, expenses, and financial reports' },
  'mobile-app': { title: 'Mobile Simulator', subtitle: 'Interactive iPhone viewport and cross-device testing' }
};

function switchTab(tabId) {
  currentTab = tabId;
  
  // Update sidebar menu active state
  menuItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update visible pane
  panes.forEach(pane => {
    if (pane.id === `pane-${tabId}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // Update titles
  const meta = tabMetadata[tabId] || tabMetadata.overview;
  pageTitle.textContent = meta.title;
  pageSubtitle.textContent = meta.subtitle;

  // Refresh tab specific data
  if (tabId === 'appointments') {
    fetchAppointments();
    const mode = document.getElementById('settings-system-mode')?.value || 'service';
    if (mode === 'restaurant') {
      fetchRestaurantTables();
    } else {
      fetchTeamAndResources();
    }
  } else if (tabId === 'history') {
    fetchCallLogs();
  } else if (tabId === 'settings') {
    fetchSettings();
    fetchPersonalCalendar();
    const mode = document.getElementById('settings-system-mode')?.value || 'service';
    if (mode === 'restaurant') {
      fetchRestaurantTables();
    } else {
      fetchTeamAndResources();
    }
  } else if (tabId === 'overview') {
    fetchOverviewData();
  } else if (tabId === 'crm') {
    fetchCrmData();
  } else if (tabId === 'billing') {
    fetchBillingDetails();
  } else if (tabId === 'services') {
    fetchServicesCatalog();
  } else if (tabId === 'accounting') {
    fetchAccountingData();
  } else if (tabId === 'mobile-app') {
    initMobileSimulator();
  }
}
window.switchTab = switchTab;

window.toggleMobileSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('mobile-open');
  }
};

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  const sidebar = document.querySelector('.sidebar');
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    if (!sidebar.contains(e.target) && (!mobileMenuBtn || !mobileMenuBtn.contains(e.target))) {
      sidebar.classList.remove('mobile-open');
    }
  }
});

menuItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tabId = item.getAttribute('data-tab');
    switchTab(tabId);
    // Auto-close sidebar on mobile after selecting a tab
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.remove('mobile-open');
    }
  });
});

linkGotoAppointments.addEventListener('click', (e) => {
  e.preventDefault();
  switchTab('appointments');
});

// -------------------------------------------------------------
// CRM SUB-TABS NAVIGATION
// -------------------------------------------------------------
crmTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const subtabId = tab.getAttribute('data-subtab');
    currentCrmSubtab = subtabId;

    // Toggle active tab style
    crmTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Toggle subpane visibility
    crmSubpanes.forEach(pane => {
      if (pane.id === `crm-subpane-${subtabId}`) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    if (subtabId === 'contacts') {
      fetchContacts();
    } else if (subtabId === 'deals') {
      fetchDeals();
    }
  });
});

// -------------------------------------------------------------
// OUTBOUND CALL MODAL HANDLERS
// -------------------------------------------------------------
function toggleOutboundModal(show) {
  if (show) {
    outboundModal.classList.add('active');
    outboundPhoneInput.focus();
  } else {
    outboundModal.classList.remove('active');
    formTriggerOutbound.reset();
  }
}

btnOpenOutboundModal.addEventListener('click', () => toggleOutboundModal(true));
btnQuickOutbound.addEventListener('click', () => toggleOutboundModal(true));
btnCloseOutboundModal.addEventListener('click', () => toggleOutboundModal(false));
btnCancelOutbound.addEventListener('click', () => toggleOutboundModal(false));

outboundModal.addEventListener('click', (e) => {
  if (e.target === outboundModal) {
    toggleOutboundModal(false);
  }
});

formTriggerOutbound.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phoneNumber = outboundPhoneInput.value.trim();
  const customerName = outboundNameInput.value.trim();

  if (!phoneNumber) return;

  const btnSubmit = document.getElementById('btn-submit-outbound');
  const originalText = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = 'Dialing...';

  try {
    const response = await fetch('/api/call/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, customerName })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      toggleOutboundModal(false);
      switchTab('monitor');
    } else {
      alert(`Outbound call failed: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Failed to trigger call:', err);
    alert('Failed to connect to server API.');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalText;
  }
});

// -------------------------------------------------------------
// WEBSOCKET (REAL-TIME EVENTS)
// -------------------------------------------------------------
function connectWebSocket() {
  if (!saasToken) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/dashboard-ws?token=${encodeURIComponent(saasToken)}`;
  
  console.log('Connecting to dashboard WebSocket...');
  dashboardSocket = new WebSocket(wsUrl);

  dashboardSocket.onopen = () => {
    console.log('Dashboard WebSocket connected.');
    wsStatusDot.className = 'status-dot green';
    wsStatusText.textContent = 'Server Online';
    fetchOverviewData();
  };

  dashboardSocket.onclose = () => {
    console.log('Dashboard WebSocket closed. Reconnecting in 3s...');
    wsStatusDot.className = 'status-dot red';
    wsStatusText.textContent = 'Server Offline (Retry)';
    
    if (activeCalls && activeCalls.size > 0) {
      for (const callSid of activeCalls.keys()) {
        endActiveCallState({ callSid });
      }
    }
    setTimeout(connectWebSocket, 3000);
  };

  dashboardSocket.onmessage = (message) => {
    try {
      const { event, data } = JSON.parse(message.data);
      console.log('WS event:', event, data);

      switch (event) {
        case 'call_started':
          startActiveCallState(data);
          break;
          
        case 'transcript_delta':
          handleTranscriptDelta(data);
          break;
          
        case 'transcript':
          handleTranscriptFinal(data);
          break;
          
        case 'call_ended':
          endActiveCallState(data);
          break;
          
        case 'call_summary_updated':
          updateSummaryInHistory(data.callSid, data.summary);
          break;
          
        case 'refresh_appointments':
          fetchAppointments();
          fetchOverviewData();
          break;
          
        case 'refresh_crm':
          if (currentTab === 'crm') {
            if (currentCrmSubtab === 'contacts') fetchContacts();
            else if (currentCrmSubtab === 'deals') fetchDeals();
          }
          fetchOverviewData();
          break;
          
        case 'google_calendar_sync':
          showGoogleSyncToast(data);
          break;
          
        case 'credit_warning':
          showCreditWarningToast(data);
          fetchBillingDetails();
          break;
      }
    } catch (err) {
      console.error('Error handling websocket message:', err);
    }
  };
}

// -------------------------------------------------------------
// LIVE MONITOR AND TRANSCRIPT HANDLERS
// -------------------------------------------------------------

function startActiveCallState(callData) {
  const callSid = callData.callSid;
  if (activeCalls.has(callSid)) return;

  const callState = {
    data: callData,
    durationSeconds: 0,
    timerInterval: null,
    visualizerInterval: null,
    activeDeltaBubble: null,
    currentDeltaText: ''
  };
  activeCalls.set(callSid, callState);

  metricActiveCalls.textContent = activeCalls.size.toString();
  menuLiveBadge.style.display = 'inline-block';

  monitorInactiveView.style.display = 'none';
  const container = document.getElementById('monitor-active-calls-container');
  container.style.display = 'flex';

  const formattedNum = callData.phoneNumber === 'Browser Client' ? 'Browser Sandbox Client' : formatPhoneNumber(callData.phoneNumber);
  const directionText = callData.direction ? (callData.direction.charAt(0).toUpperCase() + callData.direction.slice(1)) : 'Inbound';
  const isBrowser = callData.phoneNumber === 'Browser Client';

  const cardHtml = `
    <div class="monitor-active-layout" id="active-call-${callSid}" style="border-bottom: 2px dashed var(--border-glass); padding-bottom: 30px; margin-bottom: 20px;">
      <!-- Left Side: Call Info and Visualizer -->
      <div class="monitor-left-panel">
        <div class="call-metadata-card">
          <div class="call-badge-wrapper">
            <span class="call-direction-badge ${callData.direction || 'inbound'}">${directionText}</span>
            <span class="call-duration-timer" id="timer-${callSid}">00:00</span>
          </div>
          <h2>${formattedNum}</h2>
          <p class="text-muted">Active Stream Connection</p>
        </div>

        <!-- Voice Visualizer -->
        <div class="voice-visualizer-container">
          <div class="visualizer-bars" id="visualizer-bars-${callSid}">
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
            <div class="bar"></div>
          </div>
          <p class="visualizer-status" id="status-text-${callSid}">AI is listening...</p>
        </div>

        ${isBrowser ? `
        <button class="btn btn-danger mt-4" onclick="stopBrowserVoiceCall()" style="margin: 20px auto 0; max-width: 200px; width: 100%;">
          <i data-lucide="phone-off"></i> Hang Up
        </button>
        ` : ''}
      </div>

      <!-- Right Side: Live Transcript -->
      <div class="monitor-right-panel">
        <div class="transcript-header">
          <h3>Real-time Transcript</h3>
        </div>
        <div class="live-transcript-feed" id="transcript-feed-${callSid}">
          <p class="empty-text" style="text-align:center; padding:20px; color:var(--text-muted);">Call connected. Waiting for conversation...</p>
        </div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', cardHtml);
  lucide.createIcons();

  // 1. Initialize timer interval
  const timerEl = document.getElementById(`timer-${callSid}`);
  callState.timerInterval = setInterval(() => {
    callState.durationSeconds++;
    const minutes = Math.floor(callState.durationSeconds / 60).toString().padStart(2, '0');
    const seconds = (callState.durationSeconds % 60).toString().padStart(2, '0');
    if (timerEl) timerEl.textContent = `${minutes}:${seconds}`;
  }, 1000);

  // 2. Initialize visualizer bars
  const visualizerBarsEl = document.getElementById(`visualizer-bars-${callSid}`);
  const statusTextEl = document.getElementById(`status-text-${callSid}`);
  if (visualizerBarsEl) {
    visualizerBarsEl.classList.add('animating');
    if (statusTextEl) statusTextEl.textContent = 'AI is listening...';
    const bars = visualizerBarsEl.querySelectorAll('.bar');
    callState.visualizerInterval = setInterval(() => {
      const speakMultiplier = visualizerBarsEl.classList.contains('speaking') ? 70 : 25;
      bars.forEach(bar => {
        const height = Math.floor(Math.random() * speakMultiplier) + 8;
        bar.style.height = `${height}px`;
      });
    }, 100);
  }
}

function handleTranscriptDelta(data) {
  const callState = activeCalls.get(data.callSid);
  if (!callState) return;

  const feedEl = document.getElementById(`transcript-feed-${data.callSid}`);
  if (!feedEl) return;

  if (!callState.activeDeltaBubble) {
    const emptyText = feedEl.querySelector('.empty-text');
    if (emptyText) emptyText.remove();

    callState.activeDeltaBubble = document.createElement('div');
    callState.activeDeltaBubble.className = 'speech-bubble assistant delta-speaking';
    callState.activeDeltaBubble.innerHTML = `<span class="speaker-tag">Aura Receptionist</span><span class="bubble-text"></span>`;
    feedEl.appendChild(callState.activeDeltaBubble);
  }
  
  callState.currentDeltaText += data.text;
  callState.activeDeltaBubble.querySelector('.bubble-text').textContent = callState.currentDeltaText;
  feedEl.scrollTop = feedEl.scrollHeight;

  const visualizerBarsEl = document.getElementById(`visualizer-bars-${data.callSid}`);
  const statusTextEl = document.getElementById(`status-text-${data.callSid}`);
  if (visualizerBarsEl) {
    visualizerBarsEl.classList.add('speaking');
    if (statusTextEl) statusTextEl.textContent = 'AI is speaking...';
  }
}

function handleTranscriptFinal(data) {
  const callState = activeCalls.get(data.callSid);
  if (!callState) return;

  const feedEl = document.getElementById(`transcript-feed-${data.callSid}`);
  if (!feedEl) return;

  if (data.speaker === 'assistant' && callState.activeDeltaBubble) {
    callState.activeDeltaBubble.remove();
    callState.activeDeltaBubble = null;
    callState.currentDeltaText = '';
  }

  const emptyText = feedEl.querySelector('.empty-text');
  if (emptyText) emptyText.remove();

  const bubble = document.createElement('div');
  bubble.className = `speech-bubble ${data.speaker}`;
  bubble.innerHTML = `
    <span class="speaker-tag">${data.speaker === 'user' ? 'Customer' : 'Aura Receptionist'}</span>
    <span class="bubble-text">${data.text}</span>
  `;
  feedEl.appendChild(bubble);
  feedEl.scrollTop = feedEl.scrollHeight;

  const visualizerBarsEl = document.getElementById(`visualizer-bars-${data.callSid}`);
  const statusTextEl = document.getElementById(`status-text-${data.callSid}`);
  if (visualizerBarsEl) {
    if (data.speaker === 'assistant') {
      visualizerBarsEl.classList.remove('speaking');
      if (statusTextEl) statusTextEl.textContent = 'AI is listening...';
    } else {
      if (statusTextEl) statusTextEl.textContent = 'AI is responding...';
    }
  }
}

function endActiveCallState(callData) {
  const callSid = callData.callSid;
  const callState = activeCalls.get(callSid);
  if (!callState) return;

  clearInterval(callState.timerInterval);
  clearInterval(callState.visualizerInterval);

  const cardEl = document.getElementById(`active-call-${callSid}`);
  if (cardEl) {
    cardEl.style.transition = 'opacity 0.4s ease';
    cardEl.style.opacity = '0';
    setTimeout(() => {
      cardEl.remove();
    }, 400);
  }

  activeCalls.delete(callSid);

  metricActiveCalls.textContent = activeCalls.size.toString();

  if (activeCalls.size === 0) {
    menuLiveBadge.style.display = 'none';
    monitorInactiveView.style.display = 'flex';
    document.getElementById('monitor-active-calls-container').style.display = 'none';
  }

  if (callData.phoneNumber === 'Browser Client') {
    stopBrowserVoiceCall();
  }

  fetchOverviewData();
  fetchCallLogs();
}

// -------------------------------------------------------------
// OVERVIEW & CORE APPOINTMENT LOGS
// -------------------------------------------------------------
async function fetchOverviewData() {
  try {
    const resAppointments = await fetch('/api/appointments');
    const appointments = await resAppointments.json();
    metricTotalAppointments.textContent = appointments.length;

    const resCalls = await fetch('/api/calls');
    const calls = await resCalls.json();
    metricTotalCalls.textContent = calls.length;

    const quickList = appointments.slice(0, 3);
    if (quickList.length > 0) {
      quickAppointmentsList.innerHTML = quickList.map(appt => `
        <div class="appt-list-item">
          <div class="appt-list-details">
            <h5>${escapeHtml(appt.customer_name)}</h5>
            <p class="text-muted">${escapeHtml(appt.service)}</p>
          </div>
          <div class="appt-list-meta">
            <span class="badge">${formatDate(appt.date)}</span>
            <span class="time">${appt.time}</span>
          </div>
        </div>
      `).join('');
    } else {
      quickAppointmentsList.innerHTML = `<p class="text-center text-muted py-4">No appointments booked.</p>`;
    }

    const resSettings = await fetch('/api/settings');
    systemConfig = await resSettings.json();
    
    displayCompanyName.textContent = systemConfig.company_name;
    displayOpenaiModel.textContent = systemConfig.openai_model.split('-').slice(0, 3).join('-');
    displayBusinessHours.textContent = systemConfig.business_hours;
    
    if (currentTenant && systemConfig.company_name) {
      currentTenant.company_name = systemConfig.company_name;
      updateHeaderUserInfo();
    }
    notifyMobileSimulatorRefresh();
  } catch (err) {
    console.error('Failed to load overview data:', err);
  }
}

async function fetchAppointments() {
  try {
    const response = await fetch('/api/appointments');
    const list = await response.json();
    allAppointments = list;
    renderAppointmentsTable(list);
    notifyMobileSimulatorRefresh();
  } catch (err) {
    console.error('Error fetching appointments:', err);
  }
}

function renderAppointmentsTable(list) {
  if (list.length === 0) {
    appointmentsTbody.innerHTML = '';
    appointmentsEmptyState.style.display = 'flex';
    return;
  }
  
  appointmentsEmptyState.style.display = 'none';
  const isHotel = systemConfig.system_mode === 'hotel';

  appointmentsTbody.innerHTML = list.map(appt => `
    <tr>
      <td>
        <div style="font-weight: 600;">${escapeHtml(appt.customer_name)}</div>
        <div class="text-muted" style="font-size: 0.8rem;">${escapeHtml(appt.customer_phone)}</div>
      </td>
      <td>${formatDate(appt.date)}</td>
      <td>${isHotel ? (appt.checkout_date ? formatDate(appt.checkout_date) : '—') : `<code style="font-size: 0.95rem;">${appt.time}</code>`}</td>
      <td><span class="badge" style="background-color: rgba(6,182,212,0.1); color: var(--color-primary); padding: 4px 10px; border-radius: 4px; font-weight: 500;">${escapeHtml(appt.service)}</span></td>
      <td>
        <span style="font-weight: 500; color: var(--text-color);">${escapeHtml(appt.room_number || appt.table_number || appt.resource_name || 'General')}</span>
        ${appt.party_size > 1 ? `<br><small class="text-muted" style="font-size: 0.75rem;">${appt.party_size} guests</small>` : ''}
      </td>
      <td class="text-muted" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(appt.notes || '—')}</td>
      <td><span style="font-weight: 500; color: var(--text-main);">$${(appt.price || 0).toFixed(2)}</span></td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="badge" style="background-color: ${appt.payment_status === 'paid' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${appt.payment_status === 'paid' ? 'var(--color-success)' : 'var(--color-danger)'}; padding: 4px 10px; border-radius: 4px; font-weight: 600;">
            ${appt.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
          </span>
          ${appt.payment_status !== 'paid' ? `
            <button class="btn btn-secondary" onclick="copyCheckoutLink('${appt.id}')" style="padding: 4px 8px; font-size: 0.75rem; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); cursor: pointer; color: var(--text-muted); border-radius: 4px;" title="Copy Checkout Link">
              <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
            </button>
          ` : ''}
        </div>
      </td>
      <td class="text-right">
        <button class="btn btn-danger" onclick="deleteAppointmentRecord(${appt.id})" style="padding: 6px 12px; font-size: 0.8rem;">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      </td>
    </tr>
  `).join('');
  
  initIcons();
}

formManualAppointment.addEventListener('submit', async (e) => {
  e.preventDefault();
  const customer_name = document.getElementById('appt-name').value.trim();
  const customer_phone = document.getElementById('appt-phone').value.trim();
  const date = document.getElementById('appt-date').value;
  const time = document.getElementById('appt-time').value;
  const service = document.getElementById('appt-service').value;
  const resource_name = document.getElementById('appt-resource').value.trim();
  const notes = document.getElementById('appt-notes').value.trim();

  const mode = document.getElementById('settings-system-mode')?.value || 'service';
  const party_size = (mode === 'restaurant' || mode === 'hotel') ? parseInt(document.getElementById('appt-party-size').value || '1') : 1;
  const table_number = mode === 'restaurant' ? resource_name : null;
  const room_number = mode === 'hotel' ? resource_name : null;
  const checkout_date = mode === 'hotel' ? document.getElementById('appt-checkout-date').value : null;
  const finalTime = mode === 'hotel' ? '14:00' : time;

  try {
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name, customer_phone, date, time: finalTime, service, notes, resource_name, table_number, party_size, checkout_date, room_number })
    });
    
    if (response.ok) {
      formManualAppointment.reset();
      fetchAppointments();
    } else {
      const data = await response.json();
      alert(`Booking error: ${data.error}`);
    }
  } catch (err) {
    console.error('Failed to save manual booking:', err);
  }
});

window.deleteAppointmentRecord = async (id) => {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;
  try {
    const response = await fetch(`/api/appointments/${id}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      fetchAppointments();
    }
  } catch (err) {
    console.error('Error deleting appointment:', err);
  }
};

searchAppointmentsInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const filtered = allAppointments.filter(appt => 
    appt.customer_name.toLowerCase().includes(query) ||
    appt.service.toLowerCase().includes(query) ||
    appt.customer_phone.includes(query) ||
    (appt.resource_name && appt.resource_name.toLowerCase().includes(query))
  );
  renderAppointmentsTable(filtered);
});

// -------------------------------------------------------------
// CRM MODULE: CONTACTS & DEALS & COPILOT
// -------------------------------------------------------------

function fetchCrmData() {
  if (currentCrmSubtab === 'contacts') {
    fetchContacts();
  } else if (currentCrmSubtab === 'deals') {
    fetchDeals();
  }
}

// Contacts Directory API
async function fetchContacts() {
  try {
    const response = await fetch('/api/crm/contacts');
    allContacts = await response.json();
    
    // Update CRM select menus in deal modals
    dealContactSelect.innerHTML = '<option value="">-- Choose Contact --</option>' + allContacts.map(c => `
      <option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.phone)})</option>
    `).join('');

    const tbody = document.getElementById('crm-contacts-tbody');
    if (allContacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No contacts found in CRM.</td></tr>';
      return;
    }

    tbody.innerHTML = allContacts.map(c => `
      <tr>
        <td style="font-weight: 600;">${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.company_name || '—')}</td>
        <td><code>${escapeHtml(c.phone)}</code></td>
        <td>${escapeHtml(c.email || '—')}</td>
        <td><span class="lead-stage-pill ${c.lead_stage}">${c.lead_stage}</span></td>
        <td>${formatDate(c.created_at)}</td>
        <td class="text-right">
          <button class="btn btn-secondary" onclick="openContactInsights(${c.id})" style="padding: 6px 10px; font-size: 0.8rem;">
            <i data-lucide="sparkles" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> Insights
          </button>
          <button class="btn btn-danger" onclick="deleteContactRecord(${c.id})" style="padding: 6px 10px; font-size: 0.8rem;">
            <i data-lucide="trash" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      </tr>
    `).join('');

    initIcons();
  } catch (err) {
    console.error('Failed to fetch CRM contacts:', err);
  }
}

// Add Contact Modal togglers
function toggleAddContactModal(show) {
  addContactModal.classList.toggle('active', show);
  if (!show) formAddContact.reset();
}

btnOpenAddContact.addEventListener('click', () => toggleAddContactModal(true));

formAddContact.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const email = document.getElementById('contact-email').value.trim();
  const company_name = document.getElementById('contact-company').value.trim();
  const lead_stage = document.getElementById('contact-stage').value;

  try {
    const response = await fetch('/api/crm/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, company_name, lead_stage })
    });
    
    if (response.ok) {
      toggleAddContactModal(false);
      fetchContacts();
    } else {
      const data = await response.json();
      alert(`Contact creation error: ${data.error}`);
    }
  } catch (err) {
    console.error('Failed to create contact:', err);
  }
});

window.deleteContactRecord = async (id) => {
  if (!confirm('Are you sure you want to delete this contact and all associated deals?')) return;
  try {
    const response = await fetch(`/api/crm/contacts/${id}`, { method: 'DELETE' });
    if (response.ok) fetchContacts();
  } catch (err) {
    console.error('Failed to delete contact:', err);
  }
};

// Insights Modal Loader
window.openContactInsights = async (id) => {
  toggleInsightsModal(true);
  aiInsightsContent.textContent = 'Gathering call history and generating relationship report...';
  
  try {
    const response = await fetch(`/api/crm/contacts/${id}/insights`);
    const data = await response.json();
    if (response.ok) {
      aiInsightsContent.textContent = data.insights;
    } else {
      aiInsightsContent.textContent = `Insights error: ${data.error}`;
    }
  } catch (e) {
    aiInsightsContent.textContent = 'Failed to connect to insights service.';
  }
};

function toggleInsightsModal(show) {
  insightsModal.classList.toggle('active', show);
}

// Deals Pipeline Kanban Board
async function fetchDeals() {
  try {
    const response = await fetch('/api/crm/deals');
    allDeals = await response.json();
    renderKanbanBoard(allDeals);
  } catch (err) {
    console.error('Error loading deals:', err);
  }
}

function renderKanbanBoard(deals) {
  const stages = ['appointmentscheduled', 'qualified', 'quotesent', 'closedwon', 'closedlost'];
  
  stages.forEach(stage => {
    const col = document.getElementById(`column-${stage}`);
    const countEl = document.getElementById(`count-${stage}`);
    col.innerHTML = '';
    countEl.textContent = '0';
  });

  const columnCounts = {
    appointmentscheduled: 0,
    qualified: 0,
    quotesent: 0,
    closedwon: 0,
    closedlost: 0
  };

  deals.forEach(deal => {
    const col = document.getElementById(`column-${deal.stage}`);
    if (!col) return;

    columnCounts[deal.stage]++;

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.setAttribute('data-deal-id', deal.id);
    
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);

    card.innerHTML = `
      <div class="kanban-card-title">${escapeHtml(deal.name)}</div>
      <div class="kanban-card-contact">
        <i data-lucide="user"></i>
        <span>${escapeHtml(deal.contact_name)}</span>
      </div>
      <div class="kanban-card-footer">
        <span class="kanban-card-amount">$${deal.amount.toFixed(2)}</span>
        <span class="kanban-card-date">${deal.close_date ? formatDate(deal.close_date) : 'No close date'}</span>
      </div>
    `;

    col.appendChild(card);
  });

  stages.forEach(stage => {
    document.getElementById(`count-${stage}`).textContent = columnCounts[stage];
  });

  initIcons();
  setupKanbanDropZones();
}

let draggedDealId = null;

function handleDragStart(e) {
  draggedDealId = this.getAttribute('data-deal-id');
  this.style.opacity = '0.4';
  e.dataTransfer.setData('text/plain', draggedDealId);
}

function handleDragEnd() {
  this.style.opacity = '1';
}

function setupKanbanDropZones() {
  const columns = document.querySelectorAll('.kanban-column');
  
  columns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      
      const id = e.dataTransfer.getData('text/plain');
      const stage = col.getAttribute('data-stage');
      
      if (id && stage) {
        try {
          const response = await fetch(`/api/crm/deals/${id}/stage`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage })
          });
          
          if (response.ok) {
            fetchDeals();
          } else {
            console.error('Failed to update deal stage');
          }
        } catch (err) {
          console.error('Drop error:', err);
        }
      }
    });
  });
}

// Add Deal Modals
function toggleAddDealModal(show) {
  addDealModal.classList.toggle('active', show);
  if (!show) formAddDeal.reset();
  else fetchContacts();
}

btnOpenAddDeal.addEventListener('click', () => toggleAddDealModal(true));

formAddDeal.addEventListener('submit', async (e) => {
  e.preventDefault();
  const contact_id = parseInt(dealContactSelect.value);
  const name = document.getElementById('deal-name').value.trim();
  const amount = parseFloat(document.getElementById('deal-amount').value);
  const stage = document.getElementById('deal-stage').value;
  const close_date = document.getElementById('deal-close').value;

  if (!contact_id || !name || isNaN(amount)) return;

  try {
    const response = await fetch('/api/crm/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id, name, amount, stage, close_date })
    });
    
    if (response.ok) {
      toggleAddDealModal(false);
      fetchDeals();
    }
  } catch (err) {
    console.error('Failed to create deal:', err);
  }
});

// AI CRM Copilot chat controller
formCopilotChat.addEventListener('submit', async (e) => {
  e.preventDefault();
  const instruction = copilotInput.value.trim();
  if (!instruction) return;

  copilotInput.value = '';
  copilotInput.disabled = true;

  appendCopilotMessage('user', instruction);

  try {
    const response = await fetch('/api/crm/copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: instruction })
    });
    
    const data = await response.json();
    if (response.ok) {
      appendCopilotMessage('assistant', data.reply);
      if (data.actions && data.actions.length > 0) {
        fetchCrmData();
      }
    } else {
      appendCopilotMessage('assistant', `Hubie Error: ${data.error}`);
    }
  } catch (e) {
    appendCopilotMessage('assistant', 'Unable to reach Copilot servers. Check your connection.');
  } finally {
    copilotInput.disabled = false;
    copilotInput.focus();
  }
});

function appendCopilotMessage(speaker, text) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${speaker} speech-bubble`;
  bubble.innerHTML = `
    <span class="speaker-tag">${speaker === 'user' ? 'Spa Manager' : 'Hubie CRM Assistant'}</span>
    <p>${escapeHtml(text)}</p>
  `;
  copilotMessagesFeed.appendChild(bubble);
  copilotMessagesFeed.scrollTop = copilotMessagesFeed.scrollHeight;
}

document.querySelectorAll('.copilot-suggestions li').forEach(item => {
  item.addEventListener('click', () => {
    copilotInput.value = item.textContent.replace(/"/g, '');
    copilotInput.focus();
  });
});

// -------------------------------------------------------------
// CALL HISTORY LOGS
// -------------------------------------------------------------
async function fetchCallLogs() {
  try {
    const response = await fetch('/api/calls');
    const logs = await response.json();
    
    if (logs.length === 0) {
      callLogsContainer.innerHTML = '';
      historyEmptyState.style.display = 'flex';
      return;
    }
    
    historyEmptyState.style.display = 'none';
    callLogsContainer.innerHTML = logs.map(log => {
      let transcripts = [];
      try { transcripts = JSON.parse(log.transcript || '[]'); } catch (e) {}

      const durationMinutes = Math.floor(log.duration / 60);
      const durationSeconds = log.duration % 60;
      const durationDisplay = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;

      return `
        <div class="history-card" id="call-card-${log.call_sid}">
          <div class="history-card-header" onclick="toggleCallCardExpand('${log.call_sid}')">
            <div class="history-card-left">
              <div class="history-icon-circle ${log.direction}">
                <i data-lucide="${log.direction === 'inbound' ? 'phone-incoming' : 'phone-outgoing'}"></i>
              </div>
              <div class="history-card-info">
                <h4>${formatPhoneNumber(log.phone_number)}</h4>
                <p class="text-muted">${formatDate(log.created_at)} at ${formatTime(log.created_at)}</p>
              </div>
            </div>
            <div class="history-card-right">
              <span class="duration-tag"><i data-lucide="clock" style="width: 14px; height: 14px; display: inline; vertical-align: middle; margin-right: 4px;"></i> ${durationDisplay}</span>
              <span class="badge" style="background-color: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase;">${log.status}</span>
              <i data-lucide="chevron-down" class="expand-chevron"></i>
            </div>
          </div>
          
          <div class="history-card-body">
            <div class="summary-box">
              <h5>AI Conversation Summary</h5>
              <p class="call-summary-text">${escapeHtml(log.summary || 'Summary is generating or was not created.')}</p>
            </div>
            
            <div class="history-transcript-section">
              <h5>Call Transcription</h5>
              <div class="history-transcript-feed">
                ${transcripts.length > 0 ? transcripts.map(bubble => `
                  <div class="speech-bubble ${bubble.speaker}" style="max-width: 90%; margin-bottom: 8px;">
                    <span class="speaker-tag" style="font-size: 0.65rem;">${bubble.speaker === 'user' ? 'Customer' : 'Aura Assistant'}</span>
                    <span>${escapeHtml(bubble.text)}</span>
                  </div>
                `).join('') : '<p class="text-muted text-center py-4">No audio transcripts recorded.</p>'}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    initIcons();
  } catch (err) {
    console.error('Error fetching call logs:', err);
  }
}

window.toggleCallCardExpand = (callSid) => {
  const card = document.getElementById(`call-card-${callSid}`);
  card.classList.toggle('expanded');
};

function updateSummaryInHistory(callSid, summaryText) {
  const card = document.getElementById(`call-card-${callSid}`);
  if (card) {
    const summaryEl = card.querySelector('.call-summary-text');
    if (summaryEl) {
      summaryEl.textContent = summaryText;
    }
  }
  fetchOverviewData();
}

// -------------------------------------------------------------
// AGENT SETTINGS
// -------------------------------------------------------------

function toggleStripeSettingsView() {
  if (settingsPaymentProvider && settingsPaymentProvider.value === 'stripe') {
    stripeKeysConfig.style.display = 'block';
  } else if (stripeKeysConfig) {
    stripeKeysConfig.style.display = 'none';
  }
}

if (settingsPaymentProvider) {
  settingsPaymentProvider.addEventListener('change', toggleStripeSettingsView);
}

async function fetchSettings() {
  try {
    const response = await fetch('/api/settings');
    const settings = await response.json();
    
    settingsCompany.value = settings.company_name;
    if (settingsAgentName) {
      settingsAgentName.value = settings.agent_name || 'Aura';
    }
    settingsHours.value = settings.business_hours;
    settingsServices.value = settings.services_offered;
    settingsModel.value = settings.openai_model;
    settingsPrompt.value = settings.system_prompt;
    if (settingsVoice) {
      settingsVoice.value = settings.voice || 'alloy';
    }
    if (settingsAccent) {
      settingsAccent.value = settings.voice_accent || 'default';
    }
    if (settingsMaxDuration) {
      settingsMaxDuration.value = settings.max_call_duration !== undefined ? settings.max_call_duration.toString() : '10';
    }
    if (settingsSilenceTimeout) {
      settingsSilenceTimeout.value = settings.max_no_speech_timeout !== undefined ? settings.max_no_speech_timeout.toString() : '30';
    }
    if (settingsTwilio) {
      settingsTwilio.value = settings.twilio_phone_number || '';
    }
    if (settingsTransfer) {
      settingsTransfer.value = settings.transfer_phone_number || '';
    }
    if (settingsResources) {
      settingsResources.value = settings.resources_list || '';
    }
    if (settingsWebsiteUrl) {
      settingsWebsiteUrl.value = settings.website_url || '';
    }
    if (crawlStatusContainer) {
      if (settings.crawled_content) {
        crawlStatusContainer.style.display = 'block';
        crawlStatusBadge.textContent = 'Status: Crawled';
        crawlStatusBadge.style.background = 'rgba(0, 200, 100, 0.2)';
        crawlStatusBadge.style.color = '#00c864';
        crawlStatusLength.textContent = `${settings.crawled_content.length} characters`;
        crawlStatusPreview.textContent = settings.crawled_content.substring(0, 500) + (settings.crawled_content.length > 500 ? '...' : '');
      } else {
        crawlStatusContainer.style.display = 'none';
      }
    }

    // Populate Working Hours
    let workingHours = {};
    if (settings.working_hours) {
      try {
        workingHours = typeof settings.working_hours === 'string' ? JSON.parse(settings.working_hours) : settings.working_hours;
      } catch (e) {
        console.error('Failed to parse working hours', e);
      }
    }
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const dayCheckbox = document.getElementById('work-day-' + day);
      const startInput = document.getElementById('work-start-' + day);
      const endInput = document.getElementById('work-end-' + day);
      if (dayCheckbox && startInput && endInput) {
        const dayRule = workingHours[day] || { active: day !== 'saturday' && day !== 'sunday', start: '09:00', end: '17:00' };
        dayCheckbox.checked = !!dayRule.active;
        startInput.value = dayRule.start || '09:00';
        endInput.value = dayRule.end || '17:00';
        
        // Sync day pill active state
        const pill = document.querySelector(`.working-day-pill[data-day="${day}"]`);
        if (pill) {
          if (dayCheckbox.checked) {
            pill.classList.add('active');
          } else {
            pill.classList.remove('active');
          }
        }
      }
    });

    // Populate Break Periods
    let breakPeriods = [];
    if (settings.break_periods) {
      try {
        breakPeriods = typeof settings.break_periods === 'string' ? JSON.parse(settings.break_periods) : settings.break_periods;
      } catch (e) {
        console.error('Failed to parse break periods', e);
      }
    }
    const lunchBreak = breakPeriods.find(b => b.name === 'Lunch') || breakPeriods[0] || { start: '12:00', end: '13:00' };
    const breakStartInput = document.getElementById('settings-break-start');
    const breakEndInput = document.getElementById('settings-break-end');
    if (breakStartInput) breakStartInput.value = lunchBreak.start || '12:00';
    if (breakEndInput) breakEndInput.value = lunchBreak.end || '13:00';

    // Populate Buffer Gap
    const gapSelect = document.getElementById('settings-appointment-gap');
    if (gapSelect) {
      gapSelect.value = settings.appointment_gap !== undefined && settings.appointment_gap !== null ? settings.appointment_gap.toString() : '15';
    }

    // Populate System Mode
    const modeSelect = document.getElementById('settings-system-mode');
    if (modeSelect) {
      modeSelect.value = settings.system_mode || 'service';
    }
    updateSystemModeUi(settings.system_mode || 'service');
    
    // Populate Payment Gateway settings
    if (settingsPaymentProvider) {
      settingsPaymentProvider.value = settings.payment_gateway_provider || 'sandbox';
      toggleStripeSettingsView();
    }
    if (settingsStripePubKey) {
      settingsStripePubKey.value = settings.stripe_publishable_key || '';
    }
    if (settingsStripeSecKey) {
      settingsStripeSecKey.value = settings.stripe_secret_key || '';
    }
    
    const host = window.location.origin;
    webhookCopyUrl.textContent = `${host}/incoming-call`;
    
    // Initialize wizard step visual indicator
    if (typeof updateOnboardingProgress === 'function') {
      updateOnboardingProgress();
    }
  } catch (err) {
    console.error('Failed to fetch settings:', err);
  }
}

// System Instruction Templates Dictionary
const PROMPT_TEMPLATES = {
  dental: `You are DentalCare AI, the friendly virtual receptionist for Dr. Smiles Dental Clinic.

Services offered:
- Dental Scaling & Polishing: $90, 45 minutes
- Teeth Whitening: $350, 60 minutes
- Wisdom Tooth Extraction Consultation: $150, 30 minutes
- Dental Implant / Braces Consultation: Free, 30 minutes

Business hours:
Monday to Saturday, 9:00 AM to 6:00 PM.

Frequently Asked Questions (FAQ):
- Q: Do you accept dental insurance?
  A: Yes, we partner with major insurance companies. Please bring your insurance card on your visit.
- Q: Is wisdom tooth surgery painful?
  A: Dr. Smiles performs it under local anesthesia, meaning you will feel minimal to no pain during the procedure.
- Q: Do you treat kids?
  A: Absolutely! We have a pediatric specialist clinic.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (09:00 to 18:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  medical: `You are ClinicCare AI, the professional medical assistant for Aura General Clinic.

Services offered:
- General Practitioner consultation: $50, 15 minutes
- Full Body Health Screening package: $220, 60 minutes
- Pediatric vaccination: $80, 20 minutes
- Chronic illness follow-up: $70, 30 minutes

Business hours:
Monday to Friday, 8:00 AM to 7:00 PM.

Frequently Asked Questions (FAQ):
- Q: Do I need to fast before a health screening?
  A: Yes, please fast (no food or drinks except plain water) for at least 8 hours prior to your slot.
- Q: Can I walk in without an appointment?
  A: Walk-ins are welcome but scheduled appointments are highly recommended to avoid long wait times.
- Q: Do you provide medical certs (MC)?
  A: Yes, our doctor can issue official medical certificates if clinically necessary.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (08:00 to 19:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  spa: `You are AuraSpa AI, the calming virtual receptionist for Aura Wellness Spa.

Services offered:
- Swedish Massage: $80, 60 minutes
- Deep Tissue Massage: $100, 60 minutes
- HydraFacial Skin Treatment: $120, 45 minutes
- Aromatherapy Session: $110, 60 minutes

Business hours:
Monday to Sunday, 10:00 AM to 9:00 PM.

Frequently Asked Questions (FAQ):
- Q: What is the difference between Swedish and Deep Tissue massage?
  A: Swedish is lighter and focused on relaxation, while Deep Tissue uses firmer pressure to target deep muscle tension.
- Q: Can I specify if I want a male or female therapist?
  A: Yes, you can specify your preference in the appointment notes.
- Q: What should I wear for the treatment?
  A: We provide disposable underwear, robes, and towels for your convenience.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (10:00 to 21:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  salon: `You are CutStyle AI, the trendy receptionist for Style & Co. Hair Salon.

Services offered:
- Professional Cut & Wash: $45, 45 minutes
- Full Color / Highlights: $130, 120 minutes
- Keratin Hair Treatment: $180, 90 minutes
- Scalp Detox Therapy: $75, 60 minutes

Business hours:
Tuesday to Sunday, 11:00 AM to 8:00 PM.

Frequently Asked Questions (FAQ):
- Q: Do you charge more for extra long hair?
  A: Our base pricing covers average hair lengths; full coloring for extra long hair may have a surcharge of $20-$40.
- Q: How long does keratin treatment last?
  A: Usually between 3 to 5 months depending on post-care and hair type.
- Q: Do you accept walk-ins?
  A: Yes, but colorists are usually booked, so appointments are best.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (11:00 to 20:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  chiropractor: `You are ChiroCare AI, the virtual assistant for BackCare Chiropractic Clinic.

Services offered:
- Initial Chiropractic Assessment & Adjustment: $120, 45 minutes
- Spinal Decompression Therapy: $80, 30 minutes
- Follow-up Adjustment: $70, 20 minutes
- Shockwave Therapy: $95, 30 minutes

Business hours:
Monday to Saturday, 9:00 AM to 7:00 PM.

Frequently Asked Questions (FAQ):
- Q: Does a chiropractic adjustment hurt?
  A: Adjustments are generally painless. You might hear popping sounds, which is simply gas releasing from joints.
- Q: Do you accept corporate claims?
  A: Yes, we provide official invoices with diagnosis codes for insurance or corporate reimbursement.
- Q: How many sessions do I need?
  A: The chiropractor will outline a personalized care plan during your initial assessment.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (09:00 to 19:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  tcm: `You are HerbClinic AI, the receptionist for TCM Harmony Clinic.

Services offered:
- Acupuncture Session: $65, 45 minutes
- Herbal Consultation: $45, 20 minutes (medicine billed separately)
- Cupping Therapy (Gua Sha): $50, 30 minutes
- Tui Na Deep Tissue Massage: $75, 45 minutes

Business hours:
Monday to Saturday, 10:00 AM to 7:00 PM.

Frequently Asked Questions (FAQ):
- Q: What does acupuncture treat?
  A: Acupuncture is effective for pain relief, stress, digestional issues, and sleep improvements.
- Q: Are TCM herbs safe?
  A: Yes, our herbs are GMP-certified, tested for heavy metals, and prescribed by registered TCM practitioners.
- Q: Does acupuncture leave marks?
  A: Sometimes small bruises may occur. Cupping therapy intentionally leaves temporary red circles that fade in 3-5 days.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (10:00 to 19:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  plumber: `You are PlumbCore AI, the dispatch assistant for FlowForce Plumbers.

Services offered:
- Urgent Leak / Pipe Repair Dispatch: $100 call-out fee (applied to repair), 60 minutes
- Toilet / Clog Clearance: $80, 45 minutes
- Water Heater Installation Inspection: $120, 60 minutes
- Kitchen Tap / Faucet Replacement: $90, 45 minutes

Business hours:
Monday to Sunday, 24/7 (Emergency Service).

Frequently Asked Questions (FAQ):
- Q: Is there an extra charge for weekend emergency call-outs?
  A: Yes, emergency calls between 10:00 PM and 7:00 AM incur an additional $50 surcharge.
- Q: Do you provide a warranty for repairs?
  A: Absolutely! We offer a 90-day warranty on all parts and workmanship.
- Q: How long does it take for a plumber to arrive?
  A: For urgent leaks, our plumber usually arrives within 1 hour of dispatch confirmation.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Plumbers can be booked 24/7.
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  realestate: `You are PropertyCare AI, the client coordinator for Aura Properties.

Services offered:
- Property Buyer/Tenant consultation: Free, 30 minutes
- Home Valuation & Seller Consultation: Free, 60 minutes
- Property Viewing Booking: Free, 45 minutes
- Investment Portfolio Review: Free, 45 minutes

Business hours:
Monday to Sunday, 9:00 AM to 9:00 PM.

Frequently Asked Questions (FAQ):
- Q: Do you charge fees for property listings?
  A: No, listing your property with us is completely free. We only charge a commission upon successful sale/lease.
- Q: What documents do I need to rent a home?
  A: You will need your identification, employment letter/payslips, and passport/visa if applicable.
- Q: Do you handle commercial properties?
  A: Yes, we have dedicated agents specializing in office and retail space leasing.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure viewings are booked during business hours (09:00 to 21:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  finance: `You are WealthCare AI, the virtual secretary for Ascent Wealth Management.

Services offered:
- Financial Planning Consultation: Free, 45 minutes
- Insurance Coverage Review: Free, 30 minutes
- Retirement / Pension Planning: Free, 45 minutes
- Tax & Estate Planning review: Free, 60 minutes

Business hours:
Monday to Friday, 9:00 AM to 6:00 PM.

Frequently Asked Questions (FAQ):
- Q: How do you charge for financial planning?
  A: Our initial consultation is complimentary. We offer fee-only planning as well as commission-based options depending on products chosen.
- Q: What products do you cover?
  A: We cover retirement funds, health/life insurance, mutual funds, and inheritance estate trusts.
- Q: Can I consult online via Zoom?
  A: Yes, we support online virtual meetings as well as in-office consultations.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (09:00 to 18:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  veterinary: `You are VetCare AI, the virtual receptionist for PawPrints Animal Clinic.

Services offered:
- General Vet Consultation & Check-up: $60, 20 minutes
- Puppy/Kitten Vaccination: $45, 15 minutes
- Pet Dental Scaling: $180 (consultation required first), 60 minutes
- Surgery / Neutering Consultation: $80, 30 minutes

Business hours:
Monday to Saturday, 9:00 AM to 8:00 PM.

Frequently Asked Questions (FAQ):
- Q: Can you give medical advice over the phone?
  A: We can only guide you on triage. True medical diagnosis requires an in-person physical vet check.
- Q: Do you treat exotic pets?
  A: Yes! We have veterinarians specialized in rabbits, hamsters, and reptiles.
- Q: What should I do in an emergency after hours?
  A: Please contact the Aura 24-Hour Animal Hospital at +1-555-999-0000.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 14:00 for 2:00 PM). Ensure appointments are booked during business hours (09:00 to 20:00).
- If the slot is available, ask for the customer's name, confirm their phone number, and then call schedule_appointment to reserve the spot.
- Always confirm the appointment details at the end.`,

  restaurant: `You are AuraHost AI, the professional and welcoming host for Aura Bistro & Grill. Your goal is to assist callers with reserving tables, answering questions about our dining menu, special events, and operating hours.

Services/Dining Options:
- Lunch Reservation: 11:30 AM to 3:00 PM (90-minute dining duration limit)
- Dinner Reservation: 5:00 PM to 10:00 PM (90-minute dining duration limit)
- Weekend Special Buffet: $55 per adult, $25 per child (Saturdays & Sundays only)

Business hours:
Monday to Sunday, 11:30 AM to 10:00 PM.

Frequently Asked Questions (FAQ):
- Q: How long will you hold a table reservation if we are running late?
  A: We hold all reservations for up to 15 minutes past the scheduled time before releasing the table.
- Q: Do you accommodate food allergies or dietary restrictions?
  A: Yes! Please let us know during booking so we can inform our chef. We have excellent vegetarian, vegan, and gluten-free options.
- Q: Can we bring our own birthday cake or wine?
  A: You are welcome to bring a birthday cake; we do not charge a cake-cutting fee. Corkage fee for wine is $25 per bottle.

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time) before booking a slot.
- Date format must be YYYY-MM-DD.
- Time format must be HH:MM in 24-hour format (e.g. 19:30 for 7:30 PM). Ensure appointments are booked during business hours (11:30 to 22:00).
- Always ask for the customer's name, their phone number, and the size of their party (guest count).
- If the slot is available, confirm their details and call schedule_appointment to reserve the table.
- Always confirm the reservation details (date, time, party size) at the end.`,

  hotel: `You are AuraStay AI, the polite and helpful virtual concierge for Grand Aura Hotel & Suites. Your goal is to assist guests with checking room availability, answering questions about our accommodations, amenities, policies, and booking room reservations.

Room Types & Pricing:
- Single Room: $110 per night (1 King bed, max 2 guests)
- Double Room: $150 per night (2 Queen beds, max 4 guests)
- Family Room: $200 per night (2 Queen beds + 1 Single bed, max 5 guests)
- Deluxe Suite: $250 per night (1 King bed, separate living area, ocean view, max 3 guests)

Hotel Amenities & Policies:
- Standard Check-In: 2:00 PM (14:00)
- Standard Check-Out: 11:00 AM (11:00)
- Complimentary Hot Breakfast: Served daily from 7:00 AM to 10:00 AM in the Grand Lobby.
- Amenities: Indoor heated pool, 24/7 fitness center, business lounge, and free high-speed Wi-Fi.

Frequently Asked Questions (FAQ):
- Q: Do you allow early check-in or late check-out?
  A: Early check-in (before 2:00 PM) and late check-out (after 11:00 AM) are subject to room availability on the day of request. Late check-out past 12:00 PM may incur a fee of $25 per hour.
- Q: What is your cancellation policy?
  A: Guests can cancel free of charge up to 24 hours prior to their check-in date. Cancellations made within 24 hours will be charged for the first night of the stay.
- Q: Do you provide parking or airport shuttles?
  A: Self-parking is available in our secure garage for $15 per night. We also offer a complimentary airport shuttle service running every hour from 6:00 AM to 10:00 PM (reservations required).

Booking Guidelines:
- ALWAYS check availability first by calling check_availability(date, time, room_type, party_size, table_number, checkout_date). In hotel mode, checkout_date is required (in YYYY-MM-DD format), and time defaults to 14:00 (you can pass "14:00").
- Dates must be in YYYY-MM-DD format. Ensure checkout_date is after checkin date (date).
- Ask the guest for their full name, phone number, preferred room type (Single Room, Double Room, Family Room, Deluxe Suite), and the number of guests.
- If rooms are available, explain the price per night and total amount, then confirm their details and call schedule_appointment to book the reservation (passing checkout_date and room_type/room_number as parameters).
- Always confirm the booking details (room type, check-in date, check-out date, and total stay price) at the end.`
};

// Add template select listener
document.addEventListener('DOMContentLoaded', () => {
  const settingsTemplateSelect = document.getElementById('settings-template');
  if (settingsTemplateSelect) {
    settingsTemplateSelect.addEventListener('change', (e) => {
      const templateKey = e.target.value;
      const textarea = document.getElementById('settings-prompt');
      if (!textarea) return;
      
      if (textarea.disabled) {
        alert("System Instruction customization is locked in Sandbox Mode. Please upgrade your subscription tier in the Billing tab to unlock and load templates!");
        settingsTemplateSelect.value = '';
        return;
      }
      
      if (!templateKey) return;
      
      const templateText = PROMPT_TEMPLATES[templateKey];
      if (templateText) {
        if (textarea.value.trim() !== "" && !confirm("Loading this template will overwrite your current system instructions. Are you sure you want to proceed?")) {
          settingsTemplateSelect.value = '';
          return;
        }
        textarea.value = templateText;
      }
    });
  }
});

// Web Scraper / Crawler Event Hook
if (btnCrawlWebsite) {
  btnCrawlWebsite.addEventListener('click', async () => {
    const urlVal = settingsWebsiteUrl ? settingsWebsiteUrl.value.trim() : '';
    if (!urlVal) {
      showToast('Error', 'Please enter a valid website URL before crawling.', 'error');
      return;
    }

    btnCrawlWebsite.disabled = true;
    btnCrawlWebsite.innerHTML = `<i data-lucide="loader-2" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"></i> Crawling...`;
    if (window.lucide) window.lucide.createIcons();

    if (crawlStatusContainer) {
      crawlStatusContainer.style.display = 'block';
      crawlStatusBadge.textContent = 'Status: Fetching site...';
      crawlStatusBadge.style.background = 'rgba(255, 170, 0, 0.2)';
      crawlStatusBadge.style.color = '#ffaa00';
      crawlStatusLength.textContent = 'Processing...';
      crawlStatusPreview.textContent = 'Contacting server & parsing HTML tag content...';
    }

    try {
      const response = await fetch('/api/settings/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': saasToken
        },
        body: JSON.stringify({ websiteUrl: urlVal })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        showToast('Success', data.message, 'success');
        crawlStatusBadge.textContent = 'Status: Crawled';
        crawlStatusBadge.style.background = 'rgba(0, 200, 100, 0.2)';
        crawlStatusBadge.style.color = '#00c864';
        crawlStatusLength.textContent = `${data.crawled_content.length} characters`;
        crawlStatusPreview.textContent = data.preview;
      } else {
        throw new Error(data.error || 'Failed to crawl website.');
      }
    } catch (err) {
      console.error(err);
      showToast('Crawl Failed', err.message, 'error');
      crawlStatusBadge.textContent = 'Status: Failed';
      crawlStatusBadge.style.background = 'rgba(255, 50, 50, 0.2)';
      crawlStatusBadge.style.color = '#ff3232';
      crawlStatusLength.textContent = 'Error';
      crawlStatusPreview.textContent = `Scraping error: ${err.message}`;
    } finally {
      btnCrawlWebsite.disabled = false;
      btnCrawlWebsite.innerHTML = `<i data-lucide="globe" style="width: 16px; height: 16px;"></i> Crawl Site`;
      if (window.lucide) window.lucide.createIcons();
    }
  });
}

async function saveWizardSettings(silent = false) {
  // Collect Working Hours
  const workingHours = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  days.forEach(day => {
    const checkbox = document.getElementById('work-day-' + day);
    const startInput = document.getElementById('work-start-' + day);
    const endInput = document.getElementById('work-end-' + day);
    workingHours[day] = {
      active: checkbox ? checkbox.checked : false,
      start: startInput ? startInput.value : '09:00',
      end: endInput ? endInput.value : '17:00'
    };
  });

  // Collect Break Periods
  const breakStart = document.getElementById('settings-break-start')?.value || '12:00';
  const breakEnd = document.getElementById('settings-break-end')?.value || '13:00';
  const breakPeriods = [
    { name: 'Lunch', start: breakStart, end: breakEnd }
  ];

  // Collect Appointment Gap
  const gapSelect = document.getElementById('settings-appointment-gap');
  const appointmentGap = gapSelect ? parseInt(gapSelect.value) : 15;

  const modeSelect = document.getElementById('settings-system-mode');
  const systemMode = modeSelect ? modeSelect.value : 'service';

  const payload = {
    company_name: settingsCompany.value.trim(),
    agent_name: settingsAgentName ? settingsAgentName.value.trim() : 'Aura',
    business_hours: settingsHours.value.trim(),
    services_offered: settingsServices.value.trim(),
    openai_model: settingsModel.value,
    system_prompt: settingsPrompt.value.trim(),
    voice: settingsVoice ? settingsVoice.value : 'alloy',
    voice_accent: settingsAccent ? settingsAccent.value : 'default',
    twilio_phone_number: settingsTwilio ? settingsTwilio.value.trim() : '',
    transfer_phone_number: settingsTransfer ? settingsTransfer.value.trim() : '',
    resources_list: settingsResources ? settingsResources.value.trim() : '',
    working_hours: JSON.stringify(workingHours),
    break_periods: JSON.stringify(breakPeriods),
    appointment_gap: appointmentGap,
    system_mode: systemMode,
    payment_gateway_provider: settingsPaymentProvider ? settingsPaymentProvider.value : 'sandbox',
    stripe_publishable_key: settingsStripePubKey ? settingsStripePubKey.value.trim() : '',
    stripe_secret_key: settingsStripeSecKey ? settingsStripeSecKey.value.trim() : '',
    max_call_duration: settingsMaxDuration ? parseInt(settingsMaxDuration.value) : 10,
    max_no_speech_timeout: settingsSilenceTimeout ? parseInt(settingsSilenceTimeout.value) : 30,
    website_url: settingsWebsiteUrl ? settingsWebsiteUrl.value.trim() : ''
  };

  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      if (!silent) {
        showToast('Settings Saved', 'AI Receptionist configuration successfully saved.', 'success');
      }
      fetchOverviewData();
      notifyMobileSimulatorRefresh();
      updateOnboardingProgress();
      return true;
    } else {
      if (!silent) {
        showToast('Save Failed', 'Failed to save settings.', 'danger');
      }
      return false;
    }
  } catch (err) {
    console.error('Error saving settings:', err);
    if (!silent) {
      showToast('Save Error', 'Error saving settings.', 'danger');
    }
    return false;
  }
}

formSettingsAi.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-wizard-next');
  if (btn) btn.disabled = true;
  
  const nextVisible = getNextVisibleStep(currentWizardStep, 1);
  if (nextVisible > currentWizardStep) {
    const saved = await saveWizardSettings(true);
    if (saved) {
      showWizardStep(nextVisible);
    }
  } else {
    // Step 11: Save and Complete
    const saved = await saveWizardSettings(false);
    if (saved) {
      showToast('Onboarding Complete', 'AI Receptionist is now active and live!', 'success');
    }
  }
  
  if (btn) btn.disabled = false;
});

btnCopyWebhook.addEventListener('click', () => {
  const url = webhookCopyUrl.textContent;
  navigator.clipboard.writeText(url).then(() => {
    const originalContent = btnCopyWebhook.innerHTML;
    btnCopyWebhook.innerHTML = '<i data-lucide="check" class="text-green"></i>';
    setTimeout(() => {
      btnCopyWebhook.innerHTML = originalContent;
      initIcons();
    }, 2000);
  });
});

// -------------------------------------------------------------
// UTILITIES
// -------------------------------------------------------------
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 0) return 'just now';
  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatPhoneNumber(phone) {
  if (!phone) return 'Unknown';
  if (phone.startsWith('+1') && phone.length === 12) {
    return `+1 (${phone.substring(2,5)}) ${phone.substring(5,8)}-${phone.substring(8)}`;
  }
  return phone;
}

// =============================================================
// SAAS SYSTEM & BILLING OPERATIONS
// =============================================================

function logout() {
  saasToken = null;
  currentTenant = null;
  selectedUpgradeTier = null;
  localStorage.removeItem('saas_token');
  localStorage.removeItem('current_tenant');
  
  if (dashboardSocket) {
    dashboardSocket.close();
    dashboardSocket = null;
  }
  
  document.getElementById('landing-page-container').style.display = 'block';
  document.getElementById('app-container').style.display = 'none';
}

function initAuthenticatedSession() {
  try {
    console.log('Initializing authenticated session for tenant:', currentTenant);
    
    document.getElementById('landing-page-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    
    const adminMenuItem = document.getElementById('menu-item-admin');
    if (adminMenuItem) {
      if (currentTenant && currentTenant.is_admin === 1) {
        adminMenuItem.style.display = 'flex';
      } else {
        adminMenuItem.style.display = 'none';
      }
    }

    // Regroup settings access based on tenant user role
    const advTab = document.getElementById('tab-settings-advanced');
    const basicTab = document.getElementById('tab-settings-basic');
    if (advTab) {
      const tabsContainer = document.querySelector('.settings-group-tabs');
      if (currentTenant && (currentTenant.role === 'owner' || !currentTenant.role)) {
        advTab.style.display = 'block';
        if (basicTab) basicTab.style.display = 'block';
        if (tabsContainer) tabsContainer.style.display = 'flex';
      } else {
        advTab.style.display = 'none';
        if (basicTab) basicTab.style.display = 'none'; // hide tabs entirely if only member
        if (tabsContainer) tabsContainer.style.display = 'none';
      }
    }
    
    switchSettingsGroup('basic');
    
    connectWebSocket();
    updateHeaderUserInfo();
    switchTab('overview');
  } catch (err) {
    console.error('CRITICAL ERROR in initAuthenticatedSession:', err);
    showToast('Session Error', 'There was an error loading your workspace: ' + err.message, 'danger');
    
    // Fallback: render error directly onto the screen if it's completely blank
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
      appContainer.style.display = 'flex';
      appContainer.innerHTML = `<div style="padding: 40px; color: red; font-family: monospace; font-size: 1.2rem;">
        <h2>Initialization Error</h2>
        <p>${err.toString()}</p>
        <pre>${err.stack}</pre>
        <button onclick="localStorage.clear(); window.location.reload();" style="margin-top: 20px; padding: 10px; cursor: pointer;">Clear Session & Reload</button>
      </div>`;
    }
  }
}

let currentSettingsGroup = 'basic';

function switchSettingsGroup(group) {
  currentSettingsGroup = group;
  const basicTab = document.getElementById('tab-settings-basic');
  const advTab = document.getElementById('tab-settings-advanced');

  if (group === 'basic') {
    if (basicTab) {
      basicTab.style.background = 'var(--color-primary)';
      basicTab.style.color = 'white';
    }
    if (advTab) {
      advTab.style.background = 'transparent';
      advTab.style.color = 'var(--text-dark)';
    }

    // Hide Advanced Steps in Sidebar Stepper: Steps 1, 3, 4, 8, 9 are Advanced or Hidden.
    document.querySelectorAll('.stepper-item').forEach(item => {
      const step = parseInt(item.getAttribute('data-step'));
      if ([1, 3, 4, 8, 9].includes(step)) {
        item.style.display = 'none';
      } else {
        item.style.display = 'flex';
      }
    });

    // Hide Advanced elements in Step 5 & 6
    document.querySelectorAll('.settings-advanced-only').forEach(el => {
      el.style.display = 'none';
    });

    // If current wizard step is one of the hidden steps, switch to Step 2
    if ([1, 3, 4, 8, 9].includes(currentWizardStep)) {
      showWizardStep(2);
    }
  } else {
    if (basicTab) {
      basicTab.style.background = 'transparent';
      basicTab.style.color = 'var(--text-dark)';
    }
    if (advTab) {
      advTab.style.background = 'var(--color-primary)';
      advTab.style.color = 'white';
    }

    // Show Advanced Steps in Sidebar Stepper, Hide Basic ones
    document.querySelectorAll('.stepper-item').forEach(item => {
      const step = parseInt(item.getAttribute('data-step'));
      if ([3, 4, 8, 9].includes(step)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });

    // Show Advanced elements in Step 5 & 6
    document.querySelectorAll('.settings-advanced-only').forEach(el => {
      if (el.classList.contains('form-row')) {
        el.style.display = 'flex';
      } else {
        el.style.display = 'block';
      }
    });

    // If current wizard step is not one of the advanced steps, switch to Step 3
    if (![3, 4, 9].includes(currentWizardStep)) {
      showWizardStep(3);
    }
  }
  
  if (window.renumberVisibleSteps) {
    window.renumberVisibleSteps();
  }
}
window.switchSettingsGroup = switchSettingsGroup;

function getNextVisibleStep(currentStep, direction) {
  let next = currentStep + direction;
  while (next >= 1 && next <= 11) {
    const item = document.querySelector(`.stepper-item[data-step="${next}"]`);
    if (item && item.style.display !== 'none') {
      return next;
    }
    next += direction;
  }
  return currentStep;
}

function updateHeaderUserInfo() {
  const headerCompany = document.getElementById('header-company-name');
  const headerTier = document.getElementById('header-tier-badge');
  
  if (currentTenant) {
    if (headerCompany) {
      headerCompany.textContent = currentTenant.company_name || 'My Workspace';
    }
    if (headerTier) {
      const tier = currentTenant.subscription_tier || 'free';
      headerTier.textContent = tier === 'free' ? 'SANDBOX' : tier.toUpperCase();
      headerTier.className = `lead-stage-pill ${tier === 'free' ? 'subscriber' : tier === 'starter' ? 'lead' : tier === 'professional' ? 'customer' : 'vip'}`;
    }
  }
}

async function fetchBillingDetails() {
  try {
    const response = await fetch('/api/saas/billing');
    if (!response.ok) throw new Error('Failed to load billing metrics');
    const data = await response.json();
    const { usage, limits, locked, lock_reason } = data;
    
    // Lock overlay visibility handler
    const lockOverlay = document.getElementById('account-lock-overlay');
    if (lockOverlay) {
      if (locked) {
        lockOverlay.style.display = 'flex';
        const reasonEl = document.getElementById('lock-overlay-reason');
        if (reasonEl) {
          if (lock_reason === 'subscription_unpaid') {
            reasonEl.innerHTML = `Your workspace tier subscription payment is currently outstanding.<br>Please pay your recurring subscription fee or upgrade your plan to unlock full workspace access.`;
            document.getElementById('lock-pay-sub-btn').style.display = 'flex';
            document.getElementById('lock-pay-minutes-btn').style.display = 'none';
          } else if (lock_reason === 'zero_credit') {
            reasonEl.innerHTML = `Your calling credits have reached <strong>0 minutes</strong>.<br>Please purchase prepaid minutes blocks or upgrade your plan tier to unlock and resume call services.`;
            document.getElementById('lock-pay-sub-btn').style.display = 'none';
            document.getElementById('lock-pay-minutes-btn').style.display = 'flex';
          }
        }
        initIcons();
      } else {
        lockOverlay.style.display = 'none';
      }
    }
    
    // Update local state and header
    if (currentTenant) {
      currentTenant.subscription_tier = usage.tier;
      currentTenant.billing_cycle = usage.billing_cycle || 'monthly';
    }
    updateHeaderUserInfo();
    
    if (usage.billing_cycle) {
      setDashboardBillingCycleState(usage.billing_cycle);
    }
    
    // Update Billing page badges
    const tierBadge = document.getElementById('billing-tier-badge');
    if (tierBadge) {
      const cycleLabel = (usage.tier === 'free' || usage.tier === 'enterprise') ? '' : (usage.billing_cycle === 'annual' ? ' (Annual)' : ' (Monthly)');
      const tierNames = {
        free: 'Sandbox Plan',
        starter: 'Starter Plan',
        professional: 'Professional Plan',
        enterprise: 'Enterprise Plan'
      };
      tierBadge.textContent = (tierNames[usage.tier] || 'Enterprise Plan') + cycleLabel;
      tierBadge.className = `lead-stage-pill ${usage.tier === 'free' ? 'subscriber' : usage.tier === 'starter' ? 'lead' : usage.tier === 'professional' ? 'customer' : 'vip'}`;
    }
    
    // Calculate Call Duration Progress Bar
    const minsUsed = usage.usage_minutes || 0;
    const minsMax = limits.minutes + (usage.prepaid_overage_minutes || 0);
    const minsUsedEl = document.getElementById('billing-minutes-used');
    const minsMaxEl = document.getElementById('billing-minutes-max');
    const minsFillEl = document.getElementById('fill-minutes');
    if (minsUsedEl) minsUsedEl.textContent = minsUsed.toFixed(1);
    if (minsMaxEl) minsMaxEl.textContent = minsMax;
    if (minsFillEl) {
      const percent = Math.min(100, (minsUsed / minsMax) * 100);
      minsFillEl.style.width = `${percent}%`;
    }
    
    // Prepaid Overage & Reminders UI Binding
    const prepaidBalanceEl = document.getElementById('overage-prepaid-balance');
    if (prepaidBalanceEl) {
      prepaidBalanceEl.textContent = (usage.prepaid_overage_minutes || 0).toFixed(1);
    }
    
    const thresholdInput = document.getElementById('reminder-threshold');
    if (thresholdInput) {
      thresholdInput.value = usage.overage_reminder_limit || 0;
    }
    
    const buyOverageBtn = document.getElementById('btn-buy-overage');
    if (buyOverageBtn) {
      buyOverageBtn.disabled = (usage.tier === 'free');
    }
    
    // Quota Hint
    const overageHint = document.getElementById('billing-minutes-overage-hint');
    if (overageHint) {
      const overageRate = usage.tier === 'free' ? 0.0 : 0.35;
      overageHint.textContent = usage.tier === 'free'
        ? 'Sandbox limit. Call connections block after exceeding 15 minutes.'
        : `Overage: Pro-rated at $${overageRate.toFixed(2)}/minute.`;
    }
    
    // Calculate Contacts progress
    const contactsUsed = usage.usage_contacts || 0;
    const contactsMax = limits.contacts;
    const contactsUsedEl = document.getElementById('billing-contacts-used');
    const contactsMaxEl = document.getElementById('billing-contacts-max');
    const contactsFillEl = document.getElementById('fill-contacts');
    if (contactsUsedEl) contactsUsedEl.textContent = contactsUsed;
    if (contactsMaxEl) contactsMaxEl.textContent = contactsMax;
    if (contactsFillEl) {
      const percent = Math.min(100, (contactsUsed / contactsMax) * 100);
      contactsFillEl.style.width = `${percent}%`;
    }
    
    // Calculate Appointments progress
    const apptsUsed = usage.usage_appointments || 0;
    const apptsMax = limits.appointments;
    const apptsUsedEl = document.getElementById('billing-appointments-used');
    const apptsMaxEl = document.getElementById('billing-appointments-max');
    const apptsFillEl = document.getElementById('fill-appointments');
    if (apptsUsedEl) apptsUsedEl.textContent = apptsUsed;
    if (apptsMaxEl) {
      apptsMaxEl.textContent = apptsMax > 9999 ? 'Unlimited' : apptsMax;
    }
    if (apptsFillEl) {
      const percent = apptsMax > 9999 ? 0 : Math.min(100, (apptsUsed / apptsMax) * 100);
      apptsFillEl.style.width = `${percent}%`;
    }
    
    // Calculate overages and simulated invoicing
    const overageMins = Math.max(0, minsUsed - minsMax);
    const overageRate = usage.tier === 'free' ? 0.0 : 0.35;
    const overageCost = overageMins * overageRate;
    
    const countEl = document.getElementById('overage-minutes-count');
    const costEl = document.getElementById('overage-cost-display');
    if (countEl) countEl.textContent = overageMins.toFixed(1);
    if (costEl) costEl.textContent = `$${overageCost.toFixed(2)}`;
    
    // Update Upgrade options card highlights
    document.querySelectorAll('.upgrade-option-card').forEach(card => card.classList.remove('selected'));
    const currentCard = document.getElementById(`upgrade-option-${usage.tier}`);
    if (currentCard) {
      currentCard.classList.add('selected');
    }
    
    // Enforce UI restrictions
    enforceTierRestrictions(usage.tier);
  } catch (err) {
    console.error('Failed to load billing metrics:', err);
  }
}

function enforceTierRestrictions(tier) {
  const promptTextarea = document.getElementById('settings-prompt');
  const promptLockedTag = document.getElementById('prompt-locked-tag');
  const copilotFreeWarning = document.getElementById('copilot-free-warning');
  const copilotActiveLayout = document.getElementById('copilot-active-layout');
  
  if (tier === 'free') {
    if (promptTextarea) promptTextarea.disabled = true;
    if (promptLockedTag) promptLockedTag.style.display = 'inline-block';
    if (copilotFreeWarning) copilotFreeWarning.style.display = 'block';
    if (copilotActiveLayout) copilotActiveLayout.style.display = 'none';
  } else {
    if (promptTextarea) promptTextarea.disabled = false;
    if (promptLockedTag) promptLockedTag.style.display = 'none';
    if (copilotFreeWarning) copilotFreeWarning.style.display = 'none';
    if (copilotActiveLayout) copilotActiveLayout.style.display = 'block';
  }
}

// Global exposure of handlers called inline in HTML
window.openAuthModal = function(mode) {
  const modal = document.getElementById('saas-auth-modal');
  if (modal) modal.classList.add('active');
  window.toggleAuthTab(mode);
};

window.closeAuthModal = function() {
  const modal = document.getElementById('saas-auth-modal');
  if (modal) modal.classList.remove('active');
};

window.toggleAuthTab = function(mode) {
  const tabLogin = document.getElementById('auth-tab-login');
  const tabReg = document.getElementById('auth-tab-register');
  const formLogin = document.getElementById('form-saas-login');
  const formReg = document.getElementById('form-saas-register');
  const modalTitle = document.getElementById('auth-modal-title');
  
  if (mode === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabReg) tabReg.classList.remove('active');
    if (formLogin) formLogin.style.display = 'block';
    if (formReg) formReg.style.display = 'none';
    if (modalTitle) modalTitle.textContent = 'Sign In to VoiceDesk';
  } else {
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabReg) tabReg.classList.add('active');
    if (formLogin) formLogin.style.display = 'none';
    if (formReg) formReg.style.display = 'block';
    if (modalTitle) modalTitle.textContent = 'Create VoiceDesk Account';
  }
};

window.selectUpgradeTier = function(tier) {
  selectedUpgradeTier = tier;
  
  document.querySelectorAll('.upgrade-option-card').forEach(card => card.classList.remove('selected'));
  const card = document.getElementById(`upgrade-option-${tier}`);
  if (card) card.classList.add('selected');
  
  const upgradeBtn = document.getElementById('btn-upgrade-subscription');
  if (upgradeBtn) {
    upgradeBtn.disabled = false;
    if (tier === 'enterprise') {
      upgradeBtn.innerHTML = '<i data-lucide="mail"></i> Contact Sales';
    } else {
      upgradeBtn.innerHTML = '<i data-lucide="credit-card"></i> Upgrade Plan Now';
    }
    if (window.lucide) window.lucide.createIcons();
  }
};

window.setBillingCycle = function(cycle) {
  selectedBillingCycle = cycle;
  
  // Toggle active class on landing buttons
  const btnMonthly = document.getElementById('toggle-monthly');
  const btnYearly = document.getElementById('toggle-yearly');
  if (btnMonthly && btnYearly) {
    if (cycle === 'monthly') {
      btnMonthly.classList.add('active');
      btnYearly.classList.remove('active');
    } else {
      btnMonthly.classList.remove('active');
      btnYearly.classList.add('active');
    }
  }
  
  // Update landing page price displays
  const starterPrice = document.getElementById('landing-price-starter');
  const proPrice = document.getElementById('landing-price-professional');
  
  if (starterPrice) {
    starterPrice.innerHTML = cycle === 'annual' ? '$79<span>/mo</span>' : '$99<span>/mo</span>';
  }
  if (proPrice) {
    proPrice.innerHTML = cycle === 'annual' ? '$799<span>/mo</span>' : '$999<span>/mo</span>';
  }
  
  // Sync the dashboard toggle state
  setDashboardBillingCycleState(cycle);
};

window.setDashboardBillingCycle = function(cycle) {
  setDashboardBillingCycleState(cycle);
  
  // Keep the landing cycle toggle synced
  const btnMonthly = document.getElementById('toggle-monthly');
  const btnYearly = document.getElementById('toggle-yearly');
  if (btnMonthly && btnYearly) {
    if (cycle === 'monthly') {
      btnMonthly.classList.add('active');
      btnYearly.classList.remove('active');
    } else {
      btnMonthly.classList.remove('active');
      btnYearly.classList.add('active');
    }
    const starterPrice = document.getElementById('landing-price-starter');
    const proPrice = document.getElementById('landing-price-professional');
    if (starterPrice) starterPrice.innerHTML = cycle === 'annual' ? '$79<span>/mo</span>' : '$99<span>/mo</span>';
    if (proPrice) proPrice.innerHTML = cycle === 'annual' ? '$799<span>/mo</span>' : '$999<span>/mo</span>';
  }
};

function setDashboardBillingCycleState(cycle) {
  selectedBillingCycle = cycle;
  
  const dbBtnMonthly = document.getElementById('db-toggle-monthly');
  const dbBtnYearly = document.getElementById('db-toggle-yearly');
  if (dbBtnMonthly && dbBtnYearly) {
    if (cycle === 'monthly') {
      dbBtnMonthly.classList.add('active');
      dbBtnYearly.classList.remove('active');
    } else {
      dbBtnMonthly.classList.remove('active');
      dbBtnYearly.classList.add('active');
    }
  }
  
  const dbStarterPrice = document.getElementById('db-price-starter');
  const dbProPrice = document.getElementById('db-price-professional');
  
  if (dbStarterPrice) {
    dbStarterPrice.textContent = cycle === 'annual' ? '$79/mo' : '$99/mo';
  }
  if (dbProPrice) {
    dbProPrice.textContent = cycle === 'annual' ? '$799/mo' : '$999/mo';
  }
}

window.togglePaymentModal = function(show) {
  const modal = document.getElementById('saas-payment-modal');
  if (modal) {
    modal.classList.toggle('active', show);
    if (show) {
      let tierDisplay = '';
      if (stripePaymentMode === 'overage') {
        const blocksSelect = document.getElementById('overage-blocks-select');
        const blocks = blocksSelect ? parseInt(blocksSelect.value) || 1 : 1;
        const minutes = blocks * 100;
        const price = (blocks * 35.00).toFixed(2);
        tierDisplay = `${minutes} Prepaid Overage Minutes ($${price} - Billed Upfront)`;
      } else {
        const isAnnual = selectedBillingCycle === 'annual';
        const starterPrice = isAnnual ? 79 : 99;
        const proPrice = isAnnual ? 799 : 999;
        const cycleSuffix = isAnnual ? '/month - Billed Annually' : '/month';
        
        tierDisplay = selectedUpgradeTier === 'free' 
          ? 'Sandbox Plan ($0)' 
          : (selectedUpgradeTier === 'starter' 
            ? `Starter Plan ($${starterPrice}${cycleSuffix} + $1,000 Setup - Billed Upfront)` 
            : `Professional Plan ($${proPrice}${cycleSuffix} + $5,000 Setup - Billed Upfront)`);
      }
          
      const stripeDisplay = document.getElementById('stripe-tier-display');
      if (stripeDisplay) stripeDisplay.textContent = tierDisplay;
      
      const cardNameInput = document.getElementById('stripe-card-name');
      if (cardNameInput) cardNameInput.focus();
    } else {
      const form = document.getElementById('form-stripe-payment');
      if (form) form.reset();
    }
  }
};

window.openOverageModal = function() {
  stripePaymentMode = 'overage';
  window.togglePaymentModal(true);
};

const upgradeBtn = document.getElementById('btn-upgrade-subscription');
if (upgradeBtn) {
  upgradeBtn.addEventListener('click', () => {
    if (selectedUpgradeTier === 'enterprise') {
      window.openFooterModal('contact');
    } else {
      stripePaymentMode = 'upgrade';
      if (selectedUpgradeTier) window.togglePaymentModal(true);
    }
  });
}

// Expose internal modal togglers globally
window.toggleAddContactModal = toggleAddContactModal;
window.toggleAddDealModal = toggleAddDealModal;
window.toggleInsightsModal = toggleInsightsModal;

// Authentication Forms Listeners
document.getElementById('form-saas-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      saasToken = data.token;
      localStorage.setItem('saas_token', saasToken);
      currentTenant = data.tenant;
      localStorage.setItem('current_tenant', JSON.stringify(currentTenant));
      window.closeAuthModal();
      initAuthenticatedSession();
    } else {
      alert(`Login failed: ${data.error || 'Check your credentials.'}`);
    }
  } catch (err) {
    console.error(err);
    alert('Error connecting to authentication service.');
  }
});

document.getElementById('form-saas-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const companyName = document.getElementById('reg-company').value.trim();
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, companyName })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      // Auto login
      const logRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const logData = await logRes.json();
      if (logRes.ok && logData.success) {
        saasToken = logData.token;
        localStorage.setItem('saas_token', saasToken);
        currentTenant = logData.tenant;
        localStorage.setItem('current_tenant', JSON.stringify(currentTenant));
        window.closeAuthModal();
        initAuthenticatedSession();
      }
    } else {
      alert(`Registration failed: ${data.error}`);
    }
  } catch (err) {
    console.error(err);
    alert('Error connecting to registration service.');
  }
});

// Logout Listener
document.getElementById('btn-logout').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

// Payment modal form listener
document.getElementById('form-stripe-payment').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payBtn = document.getElementById('btn-pay-stripe');
  const origText = payBtn.textContent;
  payBtn.disabled = true;
  payBtn.textContent = 'Processing Payment...';
  
  try {
    if (stripePaymentMode === 'overage') {
      const blocksSelect = document.getElementById('overage-blocks-select');
      const blocks = blocksSelect ? parseInt(blocksSelect.value) || 1 : 1;
      const response = await fetch('/api/saas/billing/buy-overage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        const minutes = blocks * 100;
        alert(`Successfully purchased ${minutes} prepaid overage minutes!`);
        window.togglePaymentModal(false);
        fetchBillingDetails();
        fetchOverviewData();
      } else {
        alert(`Purchase failed: ${result.error || 'Unknown error'}`);
      }
    } else {
      const response = await fetch('/api/saas/billing/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tier: selectedUpgradeTier,
          billing_cycle: selectedBillingCycle
        })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`Successfully upgraded subscription to the ${selectedUpgradeTier.toUpperCase()} Plan!`);
        window.togglePaymentModal(false);
        if (currentTenant) {
          currentTenant.subscription_tier = selectedUpgradeTier;
          currentTenant.billing_cycle = selectedBillingCycle;
        }
        fetchBillingDetails();
        fetchOverviewData();
      } else {
        alert(`Upgrade failed: ${result.error || 'Unknown error'}`);
      }
    }
  } catch (err) {
    console.error(err);
    alert('Payment authorization failed.');
  } finally {
    payBtn.disabled = false;
    payBtn.textContent = origText;
  }
});

// Overage reminder settings listener
document.getElementById('form-overage-reminder').addEventListener('submit', async (e) => {
  e.preventDefault();
  const threshold = parseFloat(document.getElementById('reminder-threshold').value) || 0;
  
  try {
    const response = await fetch('/api/saas/billing/reminder-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overage_reminder_limit: threshold })
    });
    const result = await response.json();
    if (response.ok && result.success) {
      alert('Credit warning reminder threshold successfully saved!');
      fetchBillingDetails();
    } else {
      alert(`Failed to save settings: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error(err);
    alert('Error saving credit warning threshold settings.');
  }
});

// -------------------------------------------------------------
// STARTUP
// -------------------------------------------------------------
// =============================================================
// SUPER ADMIN DASHBOARD LOGIC
// =============================================================

async function fetchAdminDashboard() {
  try {
    const statsResponse = await fetch('/api/admin/stats');
    if (!statsResponse.ok) throw new Error('Failed to load admin stats');
    
    const stats = await statsResponse.json();
    document.getElementById('admin-metric-tenants').textContent = stats.totalTenants;
    document.getElementById('admin-metric-minutes').textContent = (stats.totalMinutes || 0).toFixed(1);
    document.getElementById('admin-metric-mrr').textContent = `$${stats.estimatedMrr.toFixed(2)}`;
    document.getElementById('admin-metric-active-streams').textContent = stats.activeCalls;
    
    const listResponse = await fetch('/api/admin/tenants');
    if (!listResponse.ok) throw new Error('Failed to load tenants list');
    
    const tenants = await listResponse.json();
    const tbody = document.getElementById('admin-tenants-tbody');
    
    if (tenants.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No SaaS tenants registered.</td></tr>';
      return;
    }
    
    tbody.innerHTML = tenants.map(t => {
      const dateStr = formatDate(t.created_at);
      const isSelf = currentTenant && parseInt(currentTenant.id) === t.id;
      
      const tierSelectHtml = isSelf
        ? `<span style="font-size: 0.85rem; font-weight: 600; color: var(--color-primary);">Owner (PRO)</span>`
        : `
          <select class="admin-select" onchange="updateTenantTier(${t.id}, this.value)">
            <option value="free" ${t.subscription_tier === 'free' ? 'selected' : ''}>Sandbox</option>
            <option value="starter" ${t.subscription_tier === 'starter' ? 'selected' : ''}>Starter</option>
            <option value="professional" ${t.subscription_tier === 'professional' ? 'selected' : ''}>Professional</option>
            <option value="enterprise" ${t.subscription_tier === 'enterprise' ? 'selected' : ''}>Enterprise</option>
          </select>
        `;
        
      const cycleSelectHtml = isSelf
        ? `<span style="font-size: 0.85rem; color: var(--text-muted);">Monthly</span>`
        : `
          <select class="admin-select" onchange="updateTenantCycle(${t.id}, this.value)">
            <option value="monthly" ${t.billing_cycle === 'annual' ? '' : 'selected'}>Monthly</option>
            <option value="annual" ${t.billing_cycle === 'annual' ? 'selected' : ''}>Annual</option>
          </select>
        `;
        
      const statusBtnHtml = isSelf
        ? `<span class="admin-status-badge active">System Admin</span>`
        : `
          <button class="status-toggle-btn ${t.subscription_status === 'suspended' ? 'activate' : 'suspend'}"
                  onclick="toggleTenantStatus(${t.id}, '${t.subscription_status}')">
            ${t.subscription_status === 'suspended' ? 'Activate' : 'Suspend'}
          </button>
        `;

      return `
        <tr>
          <td>
            <div style="font-weight: 600;">${escapeHtml(t.company_name || 'My Workspace')}</div>
            <div class="text-muted" style="font-size: 0.75rem;">Created: ${dateStr}</div>
          </td>
          <td>${escapeHtml(t.email)}</td>
          <td>${tierSelectHtml}</td>
          <td>${cycleSelectHtml}</td>
          <td>
            <span class="admin-status-badge ${t.subscription_status === 'suspended' ? 'suspended' : 'active'}">
              ${t.subscription_status}
            </span>
          </td>
          <td><code>${(t.usage_minutes || 0).toFixed(1)}</code> mins</td>
          <td>
            <span class="val">${t.contacts_count} contacts</span><br/>
            <span class="val text-muted" style="font-size: 0.75rem;">${t.appointments_count} bookings</span>
          </td>
          <td class="text-right">
            <div class="admin-actions-cell" style="display: flex; gap: 8px; justify-content: flex-end;">
              ${statusBtnHtml}
              ${isSelf ? '' : `
                <button class="status-toggle-btn activate" style="background: var(--color-primary); color: white; display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(6,182,212,0.4); padding: 4px 10px; font-weight: 500;" onclick="remoteManageTenantSettings(${t.id}, '${escapeHtml(t.company_name)}')">
                  <i data-lucide="sliders" style="width: 12px; height: 12px;"></i> Remote Settings
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    // Fetch and render Platform Activities
    try {
      const activitiesResponse = await fetch('/api/admin/activities');
      if (activitiesResponse.ok) {
        const activities = await activitiesResponse.json();
        const feedContainer = document.getElementById('admin-activities-feed');
        if (feedContainer) {
          if (activities.length === 0) {
            feedContainer.innerHTML = '<p class="text-center text-muted py-4">No activities logged yet.</p>';
          } else {
            feedContainer.innerHTML = activities.map(act => {
              let icon = 'activity';
              let iconColor = '#a855f7'; // default purple
              let iconBg = 'rgba(168,85,247,0.15)';
              
              if (act.activity_type === 'registration') {
                icon = 'user-plus';
                iconColor = '#3b82f6'; // blue
                iconBg = 'rgba(59,130,246,0.15)';
              } else if (act.activity_type === 'billing_upgrade') {
                icon = 'zap';
                iconColor = '#22c55e'; // green
                iconBg = 'rgba(34,197,94,0.15)';
              } else if (act.activity_type === 'settings_update') {
                icon = 'sliders';
                iconColor = '#a855f7'; // purple
                iconBg = 'rgba(168,85,247,0.15)';
              } else if (act.activity_type === 'call_started') {
                icon = 'phone-incoming';
                iconColor = '#fbbf24'; // orange
                iconBg = 'rgba(251,191,36,0.15)';
              } else if (act.activity_type === 'call_completed') {
                icon = 'phone';
                iconColor = '#06b6d4'; // cyan
                iconBg = 'rgba(6,182,212,0.15)';
              } else if (act.activity_type === 'appointment_booked') {
                icon = 'calendar';
                iconColor = '#06b6d4'; // cyan
                iconBg = 'rgba(6,182,212,0.15)';
              } else if (act.activity_type === 'suspension_toggle') {
                icon = 'shield-alert';
                iconColor = '#ef4444'; // red
                iconBg = 'rgba(239,68,68,0.15)';
              }
              
              const timeStr = formatRelativeTime(act.created_at);
              const workspaceName = escapeHtml(act.company_name || 'System');
              
              return `
                <div class="activity-item" style="display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-start; padding-bottom: 12px; border-bottom: 1px solid var(--border-glass);">
                  <div class="activity-icon-container" style="padding: 8px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background-color: ${iconBg}; color: ${iconColor}; flex-shrink: 0;">
                    <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                  </div>
                  <div class="activity-details" style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; gap: 8px;">
                      <strong style="font-size: 0.85rem; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${workspaceName}</strong>
                      <span style="font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0;">${timeStr}</span>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0; line-height: 1.4; word-wrap: break-word;">${escapeHtml(act.description)}</p>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
      }
    } catch (e) {
      console.error('Error loading platform activities:', e);
    }
    
    initIcons();
  } catch (err) {
    console.error('Error fetching admin dashboard details:', err);
  }
}

window.updateTenantTier = async function(tenantId, tier) {
  try {
    const adminResponse = await fetch('/api/admin/tenants');
    const tenants = await adminResponse.json();
    const t = tenants.find(row => row.id === tenantId);
    if (!t) return;
    
    const response = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        subscription_tier: tier, 
        subscription_status: t.subscription_status || 'active',
        billing_cycle: t.billing_cycle || 'monthly'
      })
    });
    const result = await response.json();
    if (response.ok && result.success) {
      alert(`Tenant tier manually updated to ${tier.toUpperCase()}`);
      fetchAdminDashboard();
    } else {
      alert(`Failed to update tier: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error(err);
    alert('Error updating tenant tier.');
  }
};

window.updateTenantCycle = async function(tenantId, cycle) {
  try {
    const adminResponse = await fetch('/api/admin/tenants');
    const tenants = await adminResponse.json();
    const t = tenants.find(row => row.id === tenantId);
    if (!t) return;
    
    const response = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        subscription_tier: t.subscription_tier || 'free', 
        subscription_status: t.subscription_status || 'active',
        billing_cycle: cycle
      })
    });
    const result = await response.json();
    if (response.ok && result.success) {
      alert(`Tenant billing cycle manually updated to ${cycle.toUpperCase()}`);
      fetchAdminDashboard();
    } else {
      alert(`Failed to update billing cycle: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error(err);
    alert('Error updating tenant billing cycle.');
  }
};

window.toggleTenantStatus = async function(tenantId, currentStatus) {
  const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  if (!confirm(`Are you sure you want to change this tenant's status to ${nextStatus.toUpperCase()}?`)) return;
  
  try {
    const adminResponse = await fetch('/api/admin/tenants');
    const tenants = await adminResponse.json();
    const t = tenants.find(row => row.id === tenantId);
    if (!t) return;
    
    const response = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        subscription_tier: t.subscription_tier, 
        subscription_status: nextStatus,
        billing_cycle: t.billing_cycle || 'monthly'
      })
    });
    
    const result = await response.json();
    if (response.ok && result.success) {
      alert(`Tenant account status changed to ${nextStatus.toUpperCase()}`);
      fetchAdminDashboard();
    } else {
      alert(`Failed to toggle status: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error(err);
    alert('Error updating tenant status.');
  }
};

window.updateROICalculator = function() {
  const callsInput = document.getElementById('roi-calls');
  const valueInput = document.getElementById('roi-value');
  if (!callsInput || !valueInput) return;

  const callsCount = parseInt(callsInput.value);
  const bookingValue = parseInt(valueInput.value);

  // Update UI values
  document.getElementById('roi-calls-val').textContent = `${callsCount.toLocaleString()} calls`;
  document.getElementById('roi-value-val').textContent = `S$${bookingValue}`;

  // Computations: Missed calls = 28%
  const missedCalls = Math.round(callsCount * 0.28);
  // Lost bookings = 85% of missed calls
  const lostBookings = Math.round(missedCalls * 0.85);
  // Revenue Lost / Year
  const yearlyLoss = lostBookings * bookingValue * 12;
  // Reclaimed staff hours / Month (approx 5 mins of dispatch per call)
  const hoursReclaimed = Math.round((callsCount * 5 / 60) * 10) / 10;

  // VoiceDesk pricing tier estimated by volume
  let monthlyCost = 99;
  if (callsCount > 100 && callsCount <= 1000) {
    monthlyCost = 999;
  } else if (callsCount > 1000) {
    monthlyCost = 2500;
  }
  const yearlyCost = monthlyCost * 12;
  const recoveredRevenue = yearlyLoss;
  const netProfit = Math.max(0, recoveredRevenue - yearlyCost);

  // Update DOM Outputs
  document.getElementById('roi-loss-bar-text').textContent = `S$${yearlyLoss.toLocaleString()}`;
  document.getElementById('roi-recovered-bar-text').textContent = `S$${netProfit.toLocaleString()}`;
  document.getElementById('roi-vd-cost-text').textContent = `S$${yearlyCost.toLocaleString()}`;

  // Update hour circular gauge
  const hoursText = document.getElementById('roi-hours-text');
  if (hoursText) hoursText.textContent = `${hoursReclaimed}h`;
  
  // Hours percent circle: max 200 hours/mo
  const hoursCircle = document.getElementById('roi-hours-circle');
  if (hoursCircle) {
    const hoursPct = Math.min(100, Math.round((hoursReclaimed / 200) * 100));
    hoursCircle.style.strokeDashoffset = 188.4 - (188.4 * hoursPct) / 100;
  }

  // Update cost bar graph widths
  const profitRatio = yearlyLoss > 0 ? (netProfit / yearlyLoss) * 100 : 0;
  const recoveredBar = document.getElementById('roi-recovered-bar');
  if (recoveredBar) {
    recoveredBar.style.width = `${Math.max(5, profitRatio)}%`;
  }
};

// -------------------------------------------------------------
// STARTUP
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Fetch and display dynamic demo phone number on landing page
  fetch('/api/demo-number')
    .then(res => res.json())
    .then(data => {
      if (data && data.number) {
        const displayEl = document.getElementById('demo-phone-display');
        const linkEl = document.getElementById('demo-phone-link');
        if (displayEl) displayEl.textContent = data.number;
        if (linkEl) {
          const cleanNum = data.number.replace(/[^+\d]/g, '');
          linkEl.href = `tel:${cleanNum}`;
        }
      }
    })
    .catch(err => console.error('Failed to load demo number:', err));

  // Initialize ROI Calculator
  if (document.getElementById('roi-calls')) {
    window.updateROICalculator();
  }

  if (!saasToken) {
    document.getElementById('landing-page-container').style.display = 'block';
    document.getElementById('app-container').style.display = 'none';
  } else {
    try {
      currentTenant = JSON.parse(localStorage.getItem('current_tenant')) || {
        id: saasToken,
        company_name: 'My Workspace',
        subscription_tier: 'free',
        is_admin: 0
      };
    } catch (e) {
      currentTenant = {
        id: saasToken,
        company_name: 'My Workspace',
        subscription_tier: 'free',
        is_admin: 0
      };
    }
    initAuthenticatedSession();
  }
  
  const today = new Date().toISOString().split('T')[0];
  const apptDateInput = document.getElementById('appt-date');
  if (apptDateInput) {
    apptDateInput.value = today;
  }
  
  const dealCloseInput = document.getElementById('deal-close');
  if (dealCloseInput) {
    dealCloseInput.value = new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0];
  }
  
  const btnTestInBrowser = document.getElementById('btn-test-in-browser');
  if (btnTestInBrowser) {
    btnTestInBrowser.addEventListener('click', () => {
      startBrowserVoiceCall();
    });
  }
  
  const btnEndBrowserCall = document.getElementById('btn-end-browser-call');
  if (btnEndBrowserCall) {
    btnEndBrowserCall.addEventListener('click', () => {
      stopBrowserVoiceCall();
    });
  }
  
  initIcons();
});

// =============================================================
// BROWSER VOICE SANDBOX TESTING ENGINE
// =============================================================
const BIAS = 0x84;
const CLIP = 32635;
function pcmToUlaw(pcmVal) {
  let sign = (pcmVal < 0) ? 0x80 : 0;
  if (pcmVal < 0) pcmVal = -pcmVal;
  if (pcmVal > CLIP) pcmVal = CLIP;
  pcmVal += BIAS;
  let exponent = 7;
  for (let val = 0x4000; (pcmVal & val) === 0; val >>= 1) {
    exponent--;
  }
  let mantissa = (pcmVal >> (exponent + 3)) & 0x0F;
  let uByte = ~(sign | (exponent << 4) | mantissa);
  return uByte & 0xFF;
}

function ulawToPcm(uByte) {
  uByte = ~uByte;
  const sign = (uByte & 0x80);
  let exponent = (uByte >> 4) & 0x07;
  let mantissa = uByte & 0x0F;
  let sample = (mantissa << 3) + 132;
  sample <<= exponent;
  sample -= 132;
  return sign ? -sample : sample;
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 8000) {
  if (inputSampleRate === outputSampleRate) return buffer;
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

let browserMediaSocket = null;
let micStream = null;
let audioContext = null;
let micNode = null;
let processorNode = null;
let nextPlayTime = 0;

async function startBrowserVoiceCall() {
  const btnTest = document.getElementById('btn-test-in-browser');
  const originalText = btnTest.innerHTML;
  btnTest.disabled = true;
  btnTest.innerHTML = 'Connecting...';
  
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/media-stream`;
    browserMediaSocket = new WebSocket(wsUrl);
    
    browserMediaSocket.onopen = () => {
      console.log('Browser Media Stream WebSocket connected.');
      
      const streamSid = 'browser-stream-' + Math.random().toString(36).substring(2, 10);
      const callSid = 'browser-call-' + Math.random().toString(36).substring(2, 10);
      
      const extractedTenantId = currentTenant && currentTenant.id ? String(currentTenant.id).split(':')[0] : (saasToken ? String(saasToken).split(':')[0] : null);
      
      browserMediaSocket.send(JSON.stringify({
        event: 'start',
        streamSid,
        start: {
          callSid,
          customParameters: {
            tenantId: extractedTenantId,
            phoneNumber: 'Browser Client',
            direction: 'inbound'
          }
        }
      }));
      
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      nextPlayTime = audioContext.currentTime;
      
      micNode = audioContext.createMediaStreamSource(micStream);
      processorNode = audioContext.createScriptProcessor(2048, 1, 1);
      
      processorNode.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(inputBuffer, audioContext.sampleRate, 8000);
        
        const uLawBytes = new Uint8Array(downsampled.length);
        for (let i = 0; i < downsampled.length; i++) {
          let val = Math.max(-1, Math.min(1, downsampled[i]));
          let pcmVal = val < 0 ? val * 0x8000 : val * 0x7FFF;
          uLawBytes[i] = pcmToUlaw(Math.round(pcmVal));
        }
        
        let binary = '';
        for (let i = 0; i < uLawBytes.length; i++) {
          binary += String.fromCharCode(uLawBytes[i]);
        }
        const base64Payload = btoa(binary);
        
        if (browserMediaSocket.readyState === WebSocket.OPEN) {
          browserMediaSocket.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: {
              payload: base64Payload
            }
          }));
        }
      };
      
      micNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      
      btnTest.disabled = false;
      btnTest.innerHTML = originalText;
    };
    
    browserMediaSocket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.event === 'media' && data.media?.payload) {
          playBrowserUlawAudio(data.media.payload);
        }
      } catch (e) {
        console.error('Error handling media socket message:', e);
      }
    };
    
    browserMediaSocket.onclose = () => {
      console.log('Browser Media Socket closed.');
      stopBrowserVoiceCall();
    };
    
    browserMediaSocket.onerror = (err) => {
      console.error('Browser Media Socket error:', err);
      stopBrowserVoiceCall();
    };
    
  } catch (err) {
    console.error('Failed to start browser voice test:', err);
    alert('Microphone permission or audio connection failed: ' + err.message);
    btnTest.disabled = false;
    btnTest.innerHTML = originalText;
  }
}

function playBrowserUlawAudio(base64Payload) {
  if (!audioContext) return;
  try {
    const binaryString = atob(base64Payload);
    const len = binaryString.length;
    const floatData = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      floatData[i] = ulawToPcm(binaryString.charCodeAt(i)) / 32768;
    }
    
    const audioBuffer = audioContext.createBuffer(1, len, 8000);
    audioBuffer.getChannelData(0).set(floatData);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    const currentTime = audioContext.currentTime;
    if (nextPlayTime < currentTime) {
      nextPlayTime = currentTime;
    }
    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
  } catch (e) {
    console.error('Error playing received audio:', e);
  }
}

function stopBrowserVoiceCall() {
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  
  if (audioContext) {
    if (audioContext.state !== 'closed') {
      audioContext.close();
    }
    audioContext = null;
  }
  
  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }
  
  if (micNode) {
    micNode.disconnect();
    micNode = null;
  }
  
  if (browserMediaSocket) {
    if (browserMediaSocket.readyState === WebSocket.OPEN || browserMediaSocket.readyState === WebSocket.CONNECTING) {
      browserMediaSocket.close();
    }
    browserMediaSocket = null;
  }
  console.log('Browser voice call stopped.');
}

// =============================================================
// TENANT MOBILE APP SIMULATOR SUPPORT
// =============================================================

function initMobileSimulator() {
  const iframe = document.getElementById('mobile-simulator-iframe');
  if (iframe && saasToken) {
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ event: 'sync_token', token: saasToken }, '*');
    }
    iframe.onload = () => {
      iframe.contentWindow.postMessage({ event: 'sync_token', token: saasToken }, '*');
    };
  }

  // Fetch local network IP to construct dynamically-bound local Wi-Fi testing link and QR code
  fetch('/api/network-ip')
    .then(res => res.json())
    .then(data => {
      const host = data.ip;
      const port = window.location.port || '80';
      const protocol = window.location.protocol;
      const localUrl = `${protocol}//${host}:${port}/mobile/`;
      
      const directLink = document.getElementById('m-direct-link');
      if (directLink) {
        directLink.textContent = localUrl;
        directLink.href = localUrl;
      }
      
      const qrImg = document.getElementById('m-qr-code-img');
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(localUrl)}`;
      }
    })
    .catch(err => {
      console.error('Failed to resolve network IP:', err);
      // Fallback
      const fallbackUrl = `${window.location.origin}/mobile/`;
      const directLink = document.getElementById('m-direct-link');
      if (directLink) {
        directLink.textContent = fallbackUrl;
        directLink.href = fallbackUrl;
      }
      const qrImg = document.getElementById('m-qr-code-img');
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(fallbackUrl)}`;
      }
    });
}

function notifyMobileSimulatorRefresh() {
  const iframe = document.getElementById('mobile-simulator-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ event: 'refresh_data' }, '*');
  }
}

// Global Message Receiver from Mobile Client Iframe
window.addEventListener('message', (e) => {
  if (e.data) {
    if (e.data.event === 'mobile_login_success') {
      saasToken = e.data.token;
      localStorage.setItem('saas_token', saasToken);
      fetchOverviewData();
      if (currentTab === 'appointments') fetchAppointments();
      if (currentTab === 'crm') fetchCrmData();
      if (currentTab === 'settings') fetchSettings();
      if (currentTab === 'history') fetchCallLogs();
      if (currentTab === 'billing') fetchBillingDetails();
    }
    if (e.data.event === 'mobile_settings_updated') {
      fetchOverviewData();
      if (currentTab === 'settings') {
        fetchSettings();
      }
    }
    if (e.data.event === 'mobile_booking_created') {
      fetchOverviewData();
      if (currentTab === 'appointments') {
        fetchAppointments();
      }
    }
  }
});

// =============================================================
// REAL-TIME GOOGLE CALENDAR SYNC TOASTS
// =============================================================
function showGoogleSyncToast(data) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <i data-lucide="calendar" style="color: #4285F4; flex-shrink: 0; margin-top: 2px;"></i>
    <div class="toast-notification-body">
      <div class="toast-notification-title">Google Calendar Sync</div>
      <div class="toast-notification-content">
        Appointment for <strong>${escapeHtml(data.customerName)}</strong> (${escapeHtml(data.service)}) synced with <strong>${escapeHtml(data.googleEmail)}</strong> calendar.<br>
        <small>${escapeHtml(data.date)} at ${escapeHtml(data.time)} (${escapeHtml(data.resourceName)})</small>
      </div>
    </div>
  `;
  container.appendChild(toast);
  
  // Re-init lucide icons for the toast
  initIcons();

  // Trigger CSS transition
  setTimeout(() => {
    toast.classList.add('show');
  }, 50);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 5000);
}
window.showGoogleSyncToast = showGoogleSyncToast;

function showCreditWarningToast(data) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.borderLeft = '4px solid #f59e0b';
  toast.innerHTML = `
    <i data-lucide="alert-triangle" style="color: #f59e0b; flex-shrink: 0; margin-top: 2px;"></i>
    <div class="toast-notification-body">
      <div class="toast-notification-title" style="color: #fbbf24; font-weight: 700;">Low Voice Credit Warning</div>
      <div class="toast-notification-content">
        Your remaining credit is <strong>${escapeHtml(data.remaining)}</strong> minutes. This has fallen below your threshold limit of <strong>${escapeHtml(data.limit)}</strong> minutes. Please buy overage minutes to avoid call disruptions.
      </div>
    </div>
  `;
  container.appendChild(toast);
  
  initIcons();

  setTimeout(() => {
    toast.classList.add('show');
  }, 50);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 8000);
}
window.showCreditWarningToast = showCreditWarningToast;

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) {
    alert(`${title}: ${message}`);
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  
  let iconName = 'info';
  let iconColorClass = 'text-cyan';
  if (type === 'success') {
    toast.style.borderLeft = '4px solid var(--color-success)';
    iconName = 'check-circle';
    iconColorClass = 'text-green';
  } else if (type === 'danger') {
    toast.style.borderLeft = '4px solid var(--color-danger)';
    iconName = 'alert-triangle';
    iconColorClass = 'text-red';
  } else {
    toast.style.borderLeft = '4px solid var(--color-primary)';
  }
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="${iconColorClass}" style="flex-shrink: 0; margin-top: 2px;"></i>
    <div class="toast-notification-body">
      <div class="toast-notification-title">${escapeHtml(title)}</div>
      <div class="toast-notification-content">${escapeHtml(message)}</div>
    </div>
  `;
  container.appendChild(toast);
  
  initIcons();

  setTimeout(() => {
    toast.classList.add('show');
  }, 50);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4000);
}
window.showToast = showToast;

function copyCheckoutLink(id) {
  const url = `${window.location.origin}/checkout/${id}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link Copied', 'Checkout link copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy link: ', err);
    alert('Copy Checkout Link: ' + url);
  });
}
window.copyCheckoutLink = copyCheckoutLink;


// =============================================================
// TEAM CALENDAR & MULTI-USER DASHBOARD LOGIC
// =============================================================

function getLoggedInUserId() {
  if (loggedInUserProfile && loggedInUserProfile.id) {
    return loggedInUserProfile.id;
  }
  if (saasToken && saasToken.includes(':')) {
    return parseInt(saasToken.split(':')[1]);
  }
  return null;
}

// Fetch Logged-in User Calendar Profile
async function fetchPersonalCalendar() {
  try {
    const res = await fetch('/api/user/profile');
    if (!res.ok) throw new Error('Failed to load profile');
    const profile = await res.json();
    loggedInUserProfile = profile;

    // Populate Working Hours
    let workingHours = {};
    if (profile.working_hours) {
      try {
        workingHours = typeof profile.working_hours === 'string' ? JSON.parse(profile.working_hours) : profile.working_hours;
      } catch (e) {
        console.error(e);
      }
    }
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const dayCheckbox = document.getElementById('work-day-' + day);
      const startInput = document.getElementById('work-start-' + day);
      const endInput = document.getElementById('work-end-' + day);
      if (dayCheckbox && startInput && endInput) {
        const dayRule = workingHours[day] || { active: day !== 'saturday' && day !== 'sunday', start: '09:00', end: '17:00' };
        dayCheckbox.checked = !!dayRule.active;
        startInput.value = dayRule.start || '09:00';
        endInput.value = dayRule.end || '17:00';
      }
    });

    // Populate Breaks
    let breakPeriods = [];
    if (profile.break_periods) {
      try {
        breakPeriods = typeof profile.break_periods === 'string' ? JSON.parse(profile.break_periods) : profile.break_periods;
      } catch (e) {
        console.error(e);
      }
    }
    const lunchBreak = breakPeriods.find(b => b.name === 'Lunch') || breakPeriods[0] || { start: '12:00', end: '13:00' };
    const breakStartInput = document.getElementById('settings-break-start');
    const breakEndInput = document.getElementById('settings-break-end');
    if (breakStartInput) breakStartInput.value = lunchBreak.start || '12:00';
    if (breakEndInput) breakEndInput.value = lunchBreak.end || '13:00';

    // Populate Gap
    const gapSelect = document.getElementById('settings-appointment-gap');
    if (gapSelect) {
      gapSelect.value = profile.appointment_gap !== undefined && profile.appointment_gap !== null ? profile.appointment_gap.toString() : '15';
    }

    // Google Calendar Sync State
    const statusText = document.getElementById('gcal-status-text');
    const statusSubtext = document.getElementById('gcal-status-subtext');
    const connectBtn = document.getElementById('btn-connect-gcal');
    
    if (profile.google_calendar_connected) {
      if (statusText) statusText.textContent = 'Connected';
      if (statusSubtext) statusSubtext.textContent = `Syncing real-time with ${profile.google_calendar_email}`;
      if (connectBtn) {
        connectBtn.textContent = 'Disconnect';
        connectBtn.classList.remove('btn-primary');
        connectBtn.classList.add('btn-secondary');
      }
    } else {
      if (statusText) statusText.textContent = 'Disconnected';
      if (statusSubtext) statusSubtext.textContent = 'Sync appointments to your Google Calendar in real-time';
      if (connectBtn) {
        connectBtn.textContent = 'Connect';
        connectBtn.classList.remove('btn-secondary');
        connectBtn.classList.add('btn-primary');
      }
    }
  } catch (err) {
    console.error('Failed to load personal calendar settings:', err);
  }
}
window.fetchPersonalCalendar = fetchPersonalCalendar;

// Fetch Workspace Team & Populate Booking Resource Dropdown
async function fetchTeamAndResources() {
  try {
    const res = await fetch('/api/team');
    if (!res.ok) throw new Error('Failed to fetch team');
    const team = await res.json();
    workspaceTeamList = team;

    // 1. Populate appt resource dropdown
    const apptResourceSelect = document.getElementById('appt-resource');
    if (apptResourceSelect) {
      const currentVal = apptResourceSelect.value;
      apptResourceSelect.innerHTML = `
        <option value="">-- Choose Staff / Resource --</option>
        ${team.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)} (${escapeHtml(u.role)})</option>`).join('')}
      `;
      if (currentVal) apptResourceSelect.value = currentVal;
    }

    // 2. Populate team list container
    const teamListContainer = document.getElementById('team-list-container');
    if (teamListContainer) {
      if (team.length === 0) {
        teamListContainer.innerHTML = '<p class="text-center text-muted py-4">No team members registered.</p>';
      } else {
        teamListContainer.innerHTML = team.map(u => {
          const isOwner = u.role === 'owner';
          const gcalStatus = u.google_calendar_connected 
            ? `<span style="font-size: 0.75rem; color: #10b981; display: flex; align-items: center; gap: 4px; margin-top: 4px;"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Synced: ${escapeHtml(u.google_calendar_email)}</span>` 
            : `<span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 4px;">GCal Disconnected</span>`;
            
          return `
            <div class="team-member-item glass" style="padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div style="flex: 1; min-width: 0;">
                <h5 style="margin: 0; font-weight: 600; color: white; display: flex; align-items: center; gap: 6px;">
                  ${escapeHtml(u.name)} 
                  <span class="lead-stage-pill ${isOwner ? 'customer' : 'subscriber'}" style="font-size: 0.65rem; padding: 2px 6px;">${escapeHtml(u.role)}</span>
                </h5>
                <p style="margin: 2px 0; font-size: 0.8rem; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(u.email)}</p>
                ${gcalStatus}
              </div>
              <div style="display: flex; gap: 6px; flex-shrink: 0; margin-left: 10px;">
                <button type="button" class="btn btn-secondary btn-icon" onclick="openStaffCalendarModal(${u.id}, '${escapeHtml(u.name)}')" title="Configure Calendar" style="padding: 6px; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center;">
                  <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
                </button>
                ${!isOwner ? `
                  <button type="button" class="btn btn-danger btn-icon" onclick="deleteTeamMember(${u.id})" title="Remove Member" style="padding: 6px; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center; background-color: var(--color-danger); border-color: var(--color-danger);">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');
      }
      initIcons();
    }
  } catch (err) {
    console.error('Failed to load team and resources:', err);
  }
}
window.fetchTeamAndResources = fetchTeamAndResources;

// Staff Calendar Configuration Modal handlers
window.openStaffCalendarModal = (userId, name) => {
  const member = workspaceTeamList.find(u => u.id === userId);
  if (!member) return;

  document.getElementById('staff-calendar-userid').value = userId;
  document.getElementById('staff-calendar-title').textContent = `Configure ${name}'s Calendar`;

  // Populate Working Hours
  let workingHours = {};
  if (member.working_hours) {
    try {
      workingHours = typeof member.working_hours === 'string' ? JSON.parse(member.working_hours) : member.working_hours;
    } catch (e) {
      console.error(e);
    }
  }

  const container = document.getElementById('staff-working-hours-container');
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  container.innerHTML = days.map(day => {
    const dayRule = workingHours[day] || { active: day !== 'saturday' && day !== 'sunday', start: '09:00', end: '17:00' };
    const capDay = day.charAt(0).toUpperCase() + day.slice(1);
    return `
      <div style="display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 10px; align-items: center;">
        <label style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-color);">
          <input type="checkbox" id="staff-work-day-${day}" class="staff-work-day-checkbox" ${dayRule.active ? 'checked' : ''}> ${capDay}
        </label>
        <input type="time" id="staff-work-start-${day}" class="form-input" style="padding: 6px 10px;" value="${dayRule.start || '09:00'}">
        <input type="time" id="staff-work-end-${day}" class="form-input" style="padding: 6px 10px;" value="${dayRule.end || '17:00'}">
      </div>
    `;
  }).join('');

  // Populate Breaks
  let breakPeriods = [];
  if (member.break_periods) {
    try {
      breakPeriods = typeof member.break_periods === 'string' ? JSON.parse(member.break_periods) : member.break_periods;
    } catch (e) {
      console.error(e);
    }
  }
  const lunchBreak = breakPeriods.find(b => b.name === 'Lunch') || breakPeriods[0] || { start: '12:00', end: '13:00' };
  document.getElementById('staff-break-start').value = lunchBreak.start || '12:00';
  document.getElementById('staff-break-end').value = lunchBreak.end || '13:00';

  // Populate Gap
  document.getElementById('staff-appointment-gap').value = member.appointment_gap !== undefined && member.appointment_gap !== null ? member.appointment_gap.toString() : '15';

  document.getElementById('modal-staff-calendar').classList.add('active');
};

window.closeStaffCalendarModal = () => {
  document.getElementById('modal-staff-calendar').classList.remove('active');
};

window.deleteTeamMember = async (userId) => {
  if (!confirm('Are you sure you want to remove this team member? they will be removed as a bookable resource.')) return;
  try {
    const res = await fetch(`/api/team/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      fetchTeamAndResources();
    } else {
      const err = await res.json();
      alert(`Error deleting member: ${err.error}`);
    }
  } catch (e) {
    console.error('Delete member error:', e);
  }
};

// Bind modals buttons and form submissions on DOM load
document.addEventListener('DOMContentLoaded', () => {
  // Google Calendar Connect toggler
  const btnConnectGcal = document.getElementById('btn-connect-gcal');
  if (btnConnectGcal) {
    btnConnectGcal.addEventListener('click', async () => {
      const userId = getLoggedInUserId();
      if (!userId) {
        alert('Authentication error. User context not loaded.');
        return;
      }
      if (loggedInUserProfile && loggedInUserProfile.google_calendar_connected) {
        // Disconnect GCal
        if (!confirm('Are you sure you want to disconnect Google Calendar? Sync will stop immediately.')) return;
        try {
          const res = await fetch(`/api/team/${userId}/gcal/disconnect`, { method: 'POST' });
          if (res.ok) {
            fetchPersonalCalendar();
            fetchTeamAndResources();
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        // Connect GCal - open modal
        document.getElementById('modal-gcal').classList.add('active');
      }
    });
  }

  // Google Calendar Connect form submit
  const formConnectGcal = document.getElementById('form-connect-gcal');
  if (formConnectGcal) {
    formConnectGcal.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = getLoggedInUserId();
      const email = document.getElementById('gcal-email').value.trim();
      if (!userId || !email) return;

      try {
        const res = await fetch(`/api/team/${userId}/gcal/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (res.ok) {
          document.getElementById('modal-gcal').classList.remove('active');
          document.getElementById('gcal-email').value = '';
          fetchPersonalCalendar();
          fetchTeamAndResources();
        } else {
          const err = await res.json();
          alert(`Error: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Google Calendar Cancel/Close buttons
  const btnCancelGcal = document.getElementById('btn-cancel-gcal');
  if (btnCancelGcal) {
    btnCancelGcal.addEventListener('click', () => {
      document.getElementById('modal-gcal').classList.remove('active');
    });
  }
  const btnCloseGcalModal = document.getElementById('btn-close-gcal-modal');
  if (btnCloseGcalModal) {
    btnCloseGcalModal.addEventListener('click', () => {
      document.getElementById('modal-gcal').classList.remove('active');
    });
  }

  // Personal Calendar form submit
  const formPersonalCalendar = document.getElementById('form-settings-personal-calendar');
  if (formPersonalCalendar) {
    formPersonalCalendar.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = getLoggedInUserId();
      if (!userId) {
        alert('Authentication context missing.');
        return;
      }

      // Gather working hours
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const working_hours = {};
      days.forEach(day => {
        const active = document.getElementById(`work-day-${day}`).checked;
        const start = document.getElementById(`work-start-${day}`).value;
        const end = document.getElementById(`work-end-${day}`).value;
        working_hours[day] = { active, start, end };
      });

      // Gather breaks
      const break_start = document.getElementById('settings-break-start').value;
      const break_end = document.getElementById('settings-break-end').value;
      const break_periods = [{ name: 'Lunch', start: break_start, end: break_end }];

      // Gather gap
      const appointment_gap = parseInt(document.getElementById('settings-appointment-gap').value);

      try {
        const response = await fetch(`/api/team/${userId}/calendar`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ working_hours, break_periods, appointment_gap })
        });
        if (response.ok) {
          alert('Personal booking calendar settings saved successfully.');
          fetchPersonalCalendar();
          fetchTeamAndResources();
        } else {
          const err = await response.json();
          alert(`Error saving personal calendar: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Add Team Member modal buttons
  const btnAddTeamMember = document.getElementById('btn-add-team-member');
  if (btnAddTeamMember) {
    btnAddTeamMember.addEventListener('click', () => {
      document.getElementById('modal-add-member').classList.add('active');
    });
  }
  const btnCloseMemberModal = document.getElementById('btn-close-member-modal');
  if (btnCloseMemberModal) {
    btnCloseMemberModal.addEventListener('click', () => {
      document.getElementById('modal-add-member').classList.remove('active');
    });
  }
  const btnCancelMember = document.getElementById('btn-cancel-member');
  if (btnCancelMember) {
    btnCancelMember.addEventListener('click', () => {
      document.getElementById('modal-add-member').classList.remove('active');
    });
  }

  // Add Team Member form submit
  const formAddMember = document.getElementById('form-add-member');
  if (formAddMember) {
    formAddMember.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('member-name').value.trim();
      const email = document.getElementById('member-email').value.trim();
      const password = document.getElementById('member-password').value;

      try {
        const response = await fetch('/api/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, role: 'member' })
        });
        if (response.ok) {
          document.getElementById('modal-add-member').classList.remove('active');
          document.getElementById('member-name').value = '';
          document.getElementById('member-email').value = '';
          document.getElementById('member-password').value = '';
          fetchTeamAndResources();
        } else {
          const err = await response.json();
          alert(`Error adding member: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Staff Calendar Modal Cancel/Close buttons
  const btnCloseStaffModal = document.getElementById('btn-close-staff-modal');
  if (btnCloseStaffModal) {
    btnCloseStaffModal.addEventListener('click', () => {
      window.closeStaffCalendarModal();
    });
  }
  const btnCancelStaffCal = document.getElementById('btn-cancel-staff-cal');
  if (btnCancelStaffCal) {
    btnCancelStaffCal.addEventListener('click', () => {
      window.closeStaffCalendarModal();
    });
  }

  // Staff Calendar form submit
  const formStaffCalendar = document.getElementById('form-staff-calendar');
  if (formStaffCalendar) {
    formStaffCalendar.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('staff-calendar-userid').value;
      
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const working_hours = {};
      days.forEach(day => {
        const active = document.getElementById(`staff-work-day-${day}`).checked;
        const start = document.getElementById(`staff-work-start-${day}`).value;
        const end = document.getElementById(`staff-work-end-${day}`).value;
        working_hours[day] = { active, start, end };
      });

      const break_start = document.getElementById('staff-break-start').value;
      const break_end = document.getElementById('staff-break-end').value;
      const break_periods = [{ name: 'Lunch', start: break_start, end: break_end }];

      const appointment_gap = parseInt(document.getElementById('staff-appointment-gap').value);

      try {
        const response = await fetch(`/api/team/${userId}/calendar`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ working_hours, break_periods, appointment_gap })
        });
        if (response.ok) {
          window.closeStaffCalendarModal();
          fetchTeamAndResources();
          const loggedInUserId = getLoggedInUserId();
          if (loggedInUserId && loggedInUserId === parseInt(userId)) {
            fetchPersonalCalendar();
          }
        } else {
          const err = await response.json();
          alert(`Error saving calendar config: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
});


// =============================================================
// RESTAURANT TABLES CONTROLLER & MODE UI CHANGER
// =============================================================
let restaurantTablesList = [];

function updateSystemModeUi(mode) {
  const isRestaurant = mode === 'restaurant';
  const isHotel = mode === 'hotel';
  
  // Toggle sidebar cards
  const teamCard = document.getElementById('team-management-card');
  const tablesCard = document.getElementById('tables-management-card');
  const roomsCard = document.getElementById('rooms-management-card');
  if (teamCard) teamCard.style.display = (isRestaurant || isHotel) ? 'none' : 'flex';
  if (tablesCard) tablesCard.style.display = isRestaurant ? 'flex' : 'none';
  if (roomsCard) roomsCard.style.display = isHotel ? 'flex' : 'none';

  // Toggle booking fields
  const partyRow = document.getElementById('appt-party-row');
  if (partyRow) partyRow.style.display = (isRestaurant || isHotel) ? 'block' : 'none';

  const checkoutGroup = document.getElementById('appt-checkout-group');
  const timeGroup = document.getElementById('appt-time-group');
  const checkoutInput = document.getElementById('appt-checkout-date');
  const dateLabel = document.getElementById('appt-date-label');
  
  if (checkoutGroup) checkoutGroup.style.display = isHotel ? 'block' : 'none';
  if (timeGroup) timeGroup.style.display = isHotel ? 'none' : 'block';
  if (checkoutInput) checkoutInput.required = isHotel;
  if (dateLabel) dateLabel.textContent = isHotel ? 'Check-In Date *' : 'Date *';

  const apptResourceLabel = document.querySelector('label[for="appt-resource"]');
  if (apptResourceLabel) {
    apptResourceLabel.textContent = isHotel ? 'Room Preference *' : (isRestaurant ? 'Allocated Table Preference *' : 'Assigned Staff / Resource *');
  }

  const apptServiceLabel = document.querySelector('label[for="appt-service"]');
  if (apptServiceLabel) {
    apptServiceLabel.textContent = isHotel ? 'Room Type *' : (isRestaurant ? 'Meal / Occasion *' : 'Service *');
  }

  // Populate booking service choices dynamically
  const serviceSelect = document.getElementById('appt-service');
  if (serviceSelect) {
    const currentVal = serviceSelect.value;
    if (isHotel) {
      serviceSelect.innerHTML = `
        <option value="">-- Choose Room Type --</option>
        <option value="Single Room">Single Room</option>
        <option value="Double Room">Double Room</option>
        <option value="Deluxe Suite">Deluxe Suite</option>
        <option value="Family Room">Family Room</option>
      `;
    } else if (isRestaurant) {
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

  // Adjust table headers in Appointments tab
  const headers = document.querySelectorAll('#pane-appointments thead th');
  if (headers && headers.length >= 6) {
    if (isHotel) {
      headers[1].textContent = 'Check-In';
      headers[2].textContent = 'Check-Out';
      headers[3].textContent = 'Room Type';
      headers[4].textContent = 'Room';
    } else {
      headers[1].textContent = 'Date';
      headers[2].textContent = 'Time';
      headers[3].textContent = isRestaurant ? 'Meal / Occasion' : 'Service';
      headers[4].textContent = isRestaurant ? 'Table' : 'Staff / Resource';
    }
  }

  // Load appropriate resources
  if (isHotel) {
    fetchHotelRooms();
  } else if (isRestaurant) {
    fetchRestaurantTables();
  } else {
    fetchTeamAndResources();
  }
}

async function fetchRestaurantTables() {
  try {
    const res = await fetch('/api/restaurant/tables');
    if (!res.ok) throw new Error('Failed to fetch tables');
    const tables = await res.json();
    restaurantTablesList = tables;

    // 1. Populate appt resource dropdown
    const apptResourceSelect = document.getElementById('appt-resource');
    if (apptResourceSelect) {
      const currentVal = apptResourceSelect.value;
      apptResourceSelect.innerHTML = `
        <option value="">-- Choose Table (Auto-allocated if blank) --</option>
        ${tables.map(t => `<option value="${escapeHtml(t.table_number)}">${escapeHtml(t.table_number)} (${t.seats} seats)</option>`).join('')}
      `;
      if (currentVal) apptResourceSelect.value = currentVal;
    }

    // 2. Populate tables list container in Settings
    const tablesListContainer = document.getElementById('tables-list-container');
    if (tablesListContainer) {
      if (tables.length === 0) {
        tablesListContainer.innerHTML = '<p class="text-center text-muted py-4">No restaurant tables configured.</p>';
      } else {
        tablesListContainer.innerHTML = tables.map(t => {
          return `
            <div class="team-member-item glass" style="padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div style="flex: 1; min-width: 0;">
                <h5 style="margin: 0; font-weight: 600; color: white; display: flex; align-items: center; gap: 6px;">
                  ${escapeHtml(t.table_number)} 
                  <span class="lead-stage-pill customer" style="font-size: 0.65rem; padding: 2px 6px;">${t.seats} seats</span>
                </h5>
              </div>
              <div style="display: flex; gap: 6px; flex-shrink: 0; margin-left: 10px;">
                <button type="button" class="btn btn-secondary btn-icon" onclick="openEditTableModal(${t.id}, '${escapeHtml(t.table_number)}', ${t.seats})" title="Edit Table" style="padding: 6px; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center;">
                  <i data-lucide="edit" style="width: 14px; height: 14px;"></i>
                </button>
                <button type="button" class="btn btn-danger btn-icon" onclick="deleteRestaurantTable(${t.id})" title="Remove Table" style="padding: 6px; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center; background-color: var(--color-danger); border-color: var(--color-danger);">
                  <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
      initIcons();
    }
  } catch (err) {
    console.error('Failed to load restaurant tables:', err);
  }
}
window.fetchRestaurantTables = fetchRestaurantTables;

window.openEditTableModal = (tableId, number, seats) => {
  document.getElementById('table-id-input').value = tableId;
  document.getElementById('table-number-input').value = number;
  document.getElementById('table-seats-input').value = seats;
  document.getElementById('table-modal-title').textContent = 'Edit Restaurant Table';
  document.getElementById('modal-add-table').classList.add('active');
};

window.deleteRestaurantTable = async (tableId) => {
  if (!confirm('Are you sure you want to remove this table?')) return;
  try {
    const res = await fetch(`/api/restaurant/tables/${tableId}`, { method: 'DELETE' });
    if (res.ok) {
      fetchRestaurantTables();
    } else {
      const err = await res.json();
      alert(`Error deleting table: ${err.error}`);
    }
  } catch (e) {
    console.error('Delete table error:', e);
  }
};

// ==========================================
// HOTEL ROOMS CLIENT CRUD OPERATIONS
// ==========================================
let hotelRoomsList = [];

async function fetchHotelRooms() {
  try {
    const res = await fetch('/api/hotel/rooms');
    if (!res.ok) throw new Error('Failed to fetch rooms');
    const rooms = await res.json();
    hotelRoomsList = rooms;

    // 1. Populate appt resource dropdown
    const apptResourceSelect = document.getElementById('appt-resource');
    if (apptResourceSelect) {
      const currentVal = apptResourceSelect.value;
      apptResourceSelect.innerHTML = `
        <option value="">-- Choose Room (Auto-allocated if blank) --</option>
        ${rooms.map(r => `<option value="${escapeHtml(r.room_number)}">${escapeHtml(r.room_number)} (${escapeHtml(r.room_type)} - $${r.price_per_night}/night)</option>`).join('')}
      `;
      if (currentVal) apptResourceSelect.value = currentVal;
    }

    // 2. Populate rooms list container in Settings
    const roomsListContainer = document.getElementById('rooms-list-container');
    if (roomsListContainer) {
      if (rooms.length === 0) {
        roomsListContainer.innerHTML = '<p class="text-center text-muted py-4">No hotel rooms configured.</p>';
      } else {
        roomsListContainer.innerHTML = rooms.map(r => {
          return `
            <div class="team-member-item glass" style="padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div style="flex: 1; min-width: 0;">
                <h5 style="margin: 0; font-weight: 600; color: white; display: flex; align-items: center; gap: 6px;">
                  ${escapeHtml(r.room_number)} 
                  <span class="lead-stage-pill customer" style="font-size: 0.65rem; padding: 2px 6px;">${escapeHtml(r.room_type)}</span>
                </h5>
                <p style="margin: 2px 0 0; font-size: 0.8rem; color: var(--text-muted);">$${r.price_per_night} / night</p>
              </div>
              <div style="display: flex; gap: 6px; flex-shrink: 0; margin-left: 10px;">
                <button type="button" class="btn btn-secondary btn-icon" onclick="openEditRoomModal(${r.id}, '${escapeHtml(r.room_number)}', '${escapeHtml(r.room_type)}', ${r.price_per_night})" title="Edit Room" style="padding: 6px; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center;">
                  <i data-lucide="edit" style="width: 14px; height: 14px;"></i>
                </button>
                <button type="button" class="btn btn-danger btn-icon" onclick="deleteHotelRoom(${r.id})" title="Remove Room" style="padding: 6px; height: 32px; width: 32px; display: flex; align-items: center; justify-content: center; background-color: var(--color-danger); border-color: var(--color-danger);">
                  <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
      initIcons();
    }
  } catch (err) {
    console.error('Failed to load hotel rooms:', err);
  }
}
window.fetchHotelRooms = fetchHotelRooms;

window.openEditRoomModal = (roomId, number, type, price) => {
  document.getElementById('room-id-input').value = roomId;
  document.getElementById('room-number-input').value = number;
  document.getElementById('room-type-input').value = type;
  document.getElementById('room-price-input').value = price;
  document.getElementById('room-modal-title').textContent = 'Edit Hotel Room';
  document.getElementById('modal-add-room').classList.add('active');
};

window.deleteHotelRoom = async (roomId) => {
  if (!confirm('Are you sure you want to remove this room?')) return;
  try {
    const res = await fetch(`/api/hotel/rooms/${roomId}`, { method: 'DELETE' });
    if (res.ok) {
      fetchHotelRooms();
    } else {
      const err = await res.json();
      alert(`Error deleting room: ${err.error}`);
    }
  } catch (e) {
    console.error('Delete room error:', e);
  }
};

// Bind tables modal listeners
document.addEventListener('DOMContentLoaded', () => {
  const modeSelect = document.getElementById('settings-system-mode');
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      updateSystemModeUi(e.target.value);
    });
  }

  const btnOpenAddTable = document.getElementById('btn-open-add-table');
  if (btnOpenAddTable) {
    btnOpenAddTable.addEventListener('click', () => {
      document.getElementById('table-id-input').value = '';
      document.getElementById('table-number-input').value = '';
      document.getElementById('table-seats-input').value = '';
      document.getElementById('table-modal-title').textContent = 'Add Restaurant Table';
      document.getElementById('modal-add-table').classList.add('active');
    });
  }

  const btnCloseTableModal = document.getElementById('btn-close-table-modal');
  if (btnCloseTableModal) {
    btnCloseTableModal.addEventListener('click', () => {
      document.getElementById('modal-add-table').classList.remove('active');
    });
  }

  const btnCancelTable = document.getElementById('btn-cancel-table');
  if (btnCancelTable) {
    btnCancelTable.addEventListener('click', () => {
      document.getElementById('modal-add-table').classList.remove('active');
    });
  }

  const formAddTable = document.getElementById('form-add-table');
  if (formAddTable) {
    formAddTable.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tableId = document.getElementById('table-id-input').value;
      const table_number = document.getElementById('table-number-input').value.trim();
      const seats = parseInt(document.getElementById('table-seats-input').value);

      const url = tableId ? `/api/restaurant/tables/${tableId}` : '/api/restaurant/tables';
      const method = tableId ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table_number, seats })
        });
        if (response.ok) {
          document.getElementById('modal-add-table').classList.remove('active');
          fetchRestaurantTables();
        } else {
          const err = await response.json();
          alert(`Error saving table: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Bind hotel rooms modal listeners
  const btnOpenAddRoom = document.getElementById('btn-open-add-room');
  if (btnOpenAddRoom) {
    btnOpenAddRoom.addEventListener('click', () => {
      document.getElementById('room-id-input').value = '';
      document.getElementById('room-number-input').value = '';
      document.getElementById('room-type-input').value = 'Single Room';
      document.getElementById('room-price-input').value = '';
      document.getElementById('room-modal-title').textContent = 'Add Hotel Room';
      document.getElementById('modal-add-room').classList.add('active');
    });
  }

  const btnCloseRoomModal = document.getElementById('btn-close-room-modal');
  if (btnCloseRoomModal) {
    btnCloseRoomModal.addEventListener('click', () => {
      document.getElementById('modal-add-room').classList.remove('active');
    });
  }

  const btnCancelRoom = document.getElementById('btn-cancel-room');
  if (btnCancelRoom) {
    btnCancelRoom.addEventListener('click', () => {
      document.getElementById('modal-add-room').classList.remove('active');
    });
  }

  const formAddRoom = document.getElementById('form-add-room');
  if (formAddRoom) {
    formAddRoom.addEventListener('submit', async (e) => {
      e.preventDefault();
      const roomId = document.getElementById('room-id-input').value;
      const room_number = document.getElementById('room-number-input').value.trim();
      const room_type = document.getElementById('room-type-input').value;
      const price_per_night = parseFloat(document.getElementById('room-price-input').value);

      const url = roomId ? `/api/hotel/rooms/${roomId}` : '/api/hotel/rooms';
      const method = roomId ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_number, room_type, price_per_night })
        });
        if (response.ok) {
          document.getElementById('modal-add-room').classList.remove('active');
          fetchHotelRooms();
        } else {
          const err = await response.json();
          alert(`Error saving room: ${err.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
});

// Footer Dynamic Modal Handlers
const footerContent = {
  documentation: `
    <h4 style="color: white; margin-top: 0; font-size: 1.25rem; margin-bottom: 12px; border-bottom: 1px solid var(--border-glass); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 1.5rem;">📖</span> VoiceDesk Technical & User Documentation
    </h4>
    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">
      Welcome to the official VoiceDesk Platform Guide. This documentation details every feature, scheduling mechanism, billing setup, and testing flow available. Use the navigation panel below to jump to specific modules.
    </p>

    <!-- Table of Contents Navigation -->
    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
      <strong style="color: white; font-size: 0.85rem; display: block; margin-bottom: 8px;">📖 Table of Contents:</strong>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; font-size: 0.8rem;">
        <a href="#doc-overview" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">📈 1. Overview Dashboard</a>
        <a href="#doc-voice" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🗣️ 2. AI Voice & Accents</a>
        <a href="#doc-sandbox" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🧪 3. WebRTC Browser Sandbox</a>
        <a href="#doc-scheduling" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🗓️ 4. Scheduling Engines & Modes</a>
        <a href="#doc-crm" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🗂️ 5. CRM Pipeline & Copilot</a>
        <a href="#doc-billing" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">💳 6. Billing & Overage Alerts</a>
        <a href="#doc-mobile" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">📱 7. Mobile Simulator & Wi-Fi</a>
        <a href="#doc-whatsapp" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">💬 8. WhatsApp Callback Bridge</a>
      </div>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 24px; margin-top: 15px;">
      
      <!-- 1. Overview Dashboard -->
      <div id="doc-overview" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>📈</span> 1. Overview Dashboard & Core Statistics
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          The Overview screen acts as your operational nerve center. It aggregates calling metrics, scheduling records, and customer activities into a unified workspace.
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; margin-top: 5px; margin-bottom: 0; display: grid; gap: 6px; color: var(--text-muted);">
          <li><strong>Quota Usage Indicators</strong>: Tracks exact calling minutes consumed during the monthly cycle against your tier quota (Starter: 100 mins, Pro: 1,000 mins).</li>
          <li><strong>Live Status Monitors</strong>: Displays current CRM size (active contacts count) and booked slot tallies.</li>
          <li><strong>Activity Stream</strong>: A real-time, scrolling feed displaying incoming calls, deal creations, appointment confirmations, and system notifications. Click any item to inspect transaction logs.</li>
        </ul>
      </div>

      <!-- 2. AI Voice & Accents -->
      <div id="doc-voice" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>🗣️</span> 2. AI Voice Agent Configurations & Dialect Tuning
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          Configure the AI receptionist's behaviors, conversational instructions, templates, and language accents to match your regional customer demographics.
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; margin-top: 5px; margin-bottom: 0; display: grid; gap: 6px; color: var(--text-muted);">
          <li><strong>Custom Persona Instructions</strong>: Set up the receptionist's core prompt under <em>Agent Settings -> Voice Agent Persona</em>. Instruct the AI on your brand name, scheduling policies, prices, service descriptions, and specific FAQ answers (e.g., parking options, cancelation policy).</li>
          <li><strong>Preset Industry Templates</strong>: Speed up setup by clicking templates such as <em>Medical Clinic</em>, <em>Beauty Spa</em>, <em>Real Estate</em>, <em>Restaurant</em>, or <em>Hotel</em> to load pre-configured instructions automatically.</li>
          <li><strong>Accent & Dialect Adaptation</strong>: Align the receptionist with local vocabulary and pronunciation. Select standard or localized modes (<strong>Standard English</strong>, <strong>Singlish</strong>, <strong>Chinglish</strong>, or <strong>Manglish</strong>). The AI voice synthesis engine dynamically adjusts sentence structure, colloquial terms, and tone of voice.</li>
        </ul>
      </div>

      <!-- 3. WebRTC Browser Sandbox -->
      <div id="doc-sandbox" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>🧪</span> 3. WebRTC Browser Sandbox & Microphone Testing
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          VoiceDesk features a client-side WebRTC voice testing sandbox that allows you to talk directly to your configured receptionist without using Twilio lines or spending quota limits.
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; margin-top: 5px; margin-bottom: 0; display: grid; gap: 6px; color: var(--text-muted);">
          <li><strong>How to start a session</strong>: Go to the <strong>Live Call</strong> tab in the sidebar and click <strong>Test in Browser</strong>.</li>
          <li><strong>Microphone Permissions</strong>: Accept the browser prompt requesting mic access. A secure WebSocket media socket will connect to the OpenAI voice server.</li>
          <li><strong>Live Transcription & Waves</strong>: Speak into your computer mic. The dashboard renders live conversations as they occur, displays animated sound wave levels, and tracks voice activity indicators.</li>
          <li><strong>Zero Cost Sandbox</strong>: Browser-based tests do not count toward your subscription minutes or prepaid balance, providing an infinite playground to tweak prompts.</li>
        </ul>
      </div>

      <!-- 4. Scheduling Engines & Modes -->
      <div id="doc-scheduling" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>🗓️</span> 4. Core Scheduling Engines & Operational Modes
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          VoiceDesk has three independent scheduling modules designed for distinct business formats. Toggle your mode inside <em>Agent Settings -> General Settings</em>:
        </p>
        <div style="padding-left: 10px; border-left: 2px solid var(--color-primary); display: grid; gap: 12px; margin-top: 8px; color: var(--text-muted); font-size: 0.85rem;">
          <div>
            <strong style="color: white; display: block; font-size: 0.9rem; margin-bottom: 2px;">🏥 Clinic / Service / Staff Mode</strong>
            Configures resource bookings (e.g., therapists, doctors, spa facilities). Admins can set custom daily operational schedules (e.g., 9 AM to 6 PM), block out rest or lunch breaks, and enforce buffer gap intervals (e.g., 15 minutes) between appointments to prevent overlapping. The AI receptionist checks available slots, matches them with resources, and saves the entry.
          </div>
          <div>
            <strong style="color: white; display: block; font-size: 0.9rem; margin-bottom: 2px;">🍔 Restaurant / Table Booking Mode</strong>
            Optimizes restaurant reservations and table utilization. Add restaurant tables in settings, detailing table numbers and seat capacity (e.g., Table 4 - 4 seats). When a customer calls, the AI receptionist asks for the guest count and the scheduling engine auto-assigns the smallest available table that matches or exceeds the group size, saving larger tables for larger parties. All restaurant bookings have a fixed 90-minute limit.
          </div>
          <div>
            <strong style="color: white; display: block; font-size: 0.9rem; margin-bottom: 2px;">🏨 Hotel / Room Reservation Mode</strong>
            Manages date-range check-ins and check-outs. Add hotel rooms under resources, configuring room numbers, room types (Single Room, Double Room, Deluxe Suite), and night pricing. The scheduling system supports adjoining bookings: guest check-outs (e.g., check out by 11 AM) and check-ins (e.g., check in after 2 PM) can occur on the same day for the same room without overlapping. The AI calculates total room costs dynamically (nights × rate) and books the dates.
          </div>
        </div>
      </div>

      <!-- 5. CRM Pipeline & Hubie Copilot -->
      <div id="doc-crm" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>🗂️</span> 5. HubSpot CRM Pipeline & Hubie AI Copilot
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          An integrated CRM system that synchronizes caller records, sales opportunities, and database commands automatically.
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; margin-top: 5px; margin-bottom: 0; display: grid; gap: 6px; color: var(--text-muted);">
          <li><strong>Contacts Directory</strong>: Inbound phone numbers are parsed and created as contacts. You can manually edit contact names, email addresses, and lead stages (Lead, Customer, Inactive). Historical calls, duration graphs, sentiments, and AI transcripts map to each contact profile.</li>
          <li><strong>Kanban Deals Board</strong>: Track sales opportunities visually. Drag-and-drop cards across columns: <em>Appointment Scheduled</em>, <em>Qualified</em>, <em>Quote Sent</em>, <em>Closed Won</em>, and <em>Closed Lost</em>. Opportunities capture values automatically based on service costs or hotel reservation metrics.</li>
          <li><strong>Hubie CRM Copilot</strong>: Located in the CRM sidebar, Hubie is an interactive natural language command terminal. Enter queries like <em>"Create a deal for John Doe named spa package for $120"</em> or <em>"Update Alice's deal to Closed Won"</em>. Hubie processes your requests and updates the database instantly via tool calling.</li>
        </ul>
      </div>

      <!-- 6. Billing & Overage Alerts -->
      <div id="doc-billing" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>💳</span> 6. Prepaid Billing, Overage Packages & Alarm Thresholds
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          To guarantee phone line availability while maintaining cost controls, VoiceDesk operates on a hybrid quota and prepaid overage credit structure.
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; margin-top: 5px; margin-bottom: 0; display: grid; gap: 6px; color: var(--text-muted);">
          <li><strong>Plan Minute Quotas</strong>: Sandbox tier receives 15 mins. Starter receives 100 mins. Professional receives 1,000 mins. Once base minutes are exhausted, the receptionist relies on prepaid overage credits.</li>
          <li><strong>Overage Packages</strong>: Overage minutes are billed at $0.35/minute and purchased upfront in blocks of 100 minutes ($35.00/block) using the simulated Stripe upgrade screen. Unused overage minutes rollover monthly and do not expire.</li>
          <li><strong>Low Credit Alarm Threshold</strong>: Set a minute warning boundary (e.g., 15 minutes remaining) in the billing pane. If overage minutes drop below this threshold, VoiceDesk triggers automated email and WhatsApp alerts to notify the workspace owner to top up.</li>
        </ul>
      </div>

      <!-- 7. Mobile Simulator & Wi-Fi Testing -->
      <div id="doc-mobile" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
          <span>📱</span> 7. Mobile Simulator & Local Wi-Fi Device Synchronization
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          Manage and monitor your front desk receptionist on the go. VoiceDesk includes testing capabilities for cross-device mobile layouts.
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; margin-top: 5px; margin-bottom: 0; display: grid; gap: 6px; color: var(--text-muted);">
          <li><strong>iPhone Mockup Simulator</strong>: Play with a fully functional mobile layout inside the dashboard tab. All activities, calendar clicks, settings changes, and CRM deal movements sync between the simulated mockup and desktop database in real-time.</li>
          <li><strong>Physical Smartphone Synchronization</strong>: The Mobile Simulator tab generates a QR code and resolves your server's local network IP. Scan the QR code using your physical smartphone (connected to the same local Wi-Fi router) to run mobile tests directly on actual touchscreens.</li>
        </ul>
      </div>

      <!-- 8. WhatsApp Callback Bridge -->
      <div id="doc-whatsapp" style="scroll-margin-top: 20px;">
        <h5 style="color: white; font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 4px;">
          <span>💬</span> 8. Twilio WhatsApp Callback Bridge Configuration
        </h5>
        <p style="margin: 0 0 8px; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          Avoid missed text opportunities. Bridge your incoming WhatsApp messages directly to a live voice agent callback.
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; margin-top: 5px; margin-bottom: 0; display: grid; gap: 6px; color: var(--text-muted);">
          <li><strong>Configuration</strong>: Go to Twilio settings and link your WhatsApp Sandbox or Business Sender number to the VoiceDesk inbound API webhook.</li>
          <li><strong>Callback Flow</strong>: When a customer sends a message to your WhatsApp account (e.g., asking about availability), VoiceDesk answers with an automated confirmation reply.</li>
          <li><strong>Outbound Voice Trigger</strong>: At the same time, the server initiates an outbound voice dial-back call to the customer's phone, connecting them instantly to the Voice AI receptionist.</li>
        </ul>
      </div>

    </div>
  `,
  api: `
    <h4 style="color: white; margin-top: 0; font-size: 1.1rem; margin-bottom: 12px;">Developer API Reference</h4>
    <p>Integrate your external booking engines, scheduling sheets, or marketing pipelines with the secure VoiceDesk REST API. All requests require your workspace authorization token.</p>
    <h5 style="color: white; margin-top: 20px; margin-bottom: 8px;">Endpoints</h5>
    <ul style="padding-left: 20px; display: grid; gap: 8px; margin-bottom: 15px;">
      <li><code>GET /api/saas/billing</code> - Retrieve active subscription quotas, usage, and overage balance metrics.</li>
      <li><code>GET /api/crm/contacts</code> - List contact directory entries, lead stages, and matched phone attributes.</li>
      <li><code>POST /api/appointments</code> - Schedule a new appointment, table reservation, or room stay.</li>
      <li><code>POST /api/crm/copilot</code> - Send natural language instructions to Hubie, the AI pipeline orchestrator.</li>
    </ul>
    <h5 style="color: white; margin-top: 20px; margin-bottom: 8px;">Sample Request</h5>
    <pre style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 0.8rem; overflow-x: auto; color: #a5f3fc; margin: 0;">
fetch('/api/crm/contacts', {
  headers: {
    'Authorization': 'YOUR_WORKSPACE_TOKEN'
  }
})</pre>
  `,
  status: `
    <h4 style="color: white; margin-top: 0; font-size: 1.1rem; margin-bottom: 12px;">VoiceDesk System Status</h4>
    <p>We monitor the platform's API latency, voice recognition streams, and database locks in real-time. All services are currently fully operational.</p>
    <div style="display: grid; gap: 12px; margin-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-glass);">
        <span>🗣️ AI Realtime Voice Engine</span>
        <span style="color: #10b981; font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Operational (99.98%)</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-glass);">
        <span>📊 CRM Database & SQLite Engine</span>
        <span style="color: #10b981; font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Operational (100.0%)</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-glass);">
        <span>💬 Twilio Webhook & WhatsApp Bridge</span>
        <span style="color: #10b981; font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span> Operational (99.95%)</span>
      </div>
    </div>
  `,
  about: `
    <h4 style="color: white; margin-top: 0; font-size: 1.1rem; margin-bottom: 12px;">About VoiceDesk</h4>
    <p>VoiceDesk Inc. was founded in 2026 with a singular focus: helping local brick-and-mortar service businesses capture missed phone revenue. Over 62% of calls to small clinics, beauty spas, boutique hotels, and reservation restaurants go unanswered due to busy front desks or off-hour calls.</p>
    <p style="margin-top: 15px;">Our platform implements state-of-the-art conversational voice synthesis and natural language processing models, letting companies plug in an intelligent receptionist that scheduling tools, CRM contact logs, and Stripe pipelines can interact with instantly.</p>
  `,
  contact: `
    <h4 style="color: white; margin-top: 0; font-size: 1.1rem; margin-bottom: 12px;">Request a Callback / Contact Us</h4>
    <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 15px;">Fill out the details below and our team will get in touch with you within 2 hours.</p>
    <form id="landing-contact-form" onsubmit="event.preventDefault(); alert('Thank you! Your request has been received. We will contact you soon.'); document.getElementById('footer-info-modal').classList.remove('active'); this.reset();" style="display: flex; flex-direction: column; gap: 12px;">
      <div>
        <label style="display: block; font-size: 0.8rem; color: white; margin-bottom: 4px; font-weight: 600;">Full Name</label>
        <input type="text" required placeholder="John Doe" style="width:100%; padding: 8px 12px; font-size: 0.85rem; background: rgba(0,0,0,0.4); border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm); color: white; outline: none;">
      </div>
      <div>
        <label style="display: block; font-size: 0.8rem; color: white; margin-bottom: 4px; font-weight: 600;">Email Address</label>
        <input type="email" required placeholder="john@company.com" style="width:100%; padding: 8px 12px; font-size: 0.85rem; background: rgba(0,0,0,0.4); border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm); color: white; outline: none;">
      </div>
      <div>
        <label style="display: block; font-size: 0.8rem; color: white; margin-bottom: 4px; font-weight: 600;">Phone Number</label>
        <input type="tel" required placeholder="+65 9123 4567" style="width:100%; padding: 8px 12px; font-size: 0.85rem; background: rgba(0,0,0,0.4); border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm); color: white; outline: none;">
      </div>
      <div>
        <label style="display: block; font-size: 0.8rem; color: white; margin-bottom: 4px; font-weight: 600;">Business Name & Industry</label>
        <input type="text" placeholder="e.g. Smiles Dental Clinic" style="width:100%; padding: 8px 12px; font-size: 0.85rem; background: rgba(0,0,0,0.4); border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm); color: white; outline: none;">
      </div>
      <div>
        <label style="display: block; font-size: 0.8rem; color: white; margin-bottom: 4px; font-weight: 600;">How can we help you?</label>
        <textarea placeholder="Tell us about your business scheduling needs..." style="width:100%; padding: 8px 12px; font-size: 0.85rem; background: rgba(0,0,0,0.4); border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm); color: white; outline: none; height: 80px; resize: none;"></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="padding: 10px; margin-top: 10px;">Submit Form</button>
    </form>
  `,
  privacy: `
    <h4 style="color: white; margin-top: 0; font-size: 1.1rem; margin-bottom: 12px;">Privacy Policy</h4>
    <p>Last updated: May 2026. At VoiceDesk, we prioritize the confidentiality and safety of your customer interactions.</p>
    <h5 style="color: white; margin-top: 20px; margin-bottom: 8px;">1. Information We Process</h5>
    <p>We process telephone audio streams, parsed text transcripts, and customer names/phones to execute calendar entries and CRM deals on behalf of our tenants. All call audio logs and data are sandboxed per workspace.</p>
    <h5 style="color: white; margin-top: 20px; margin-bottom: 8px;">2. Data Residency</h5>
    <p>Customer contact databases are saved inside secure isolated SQLite tables. We do not trade, sell, or profile your customer details with external third-party advertising networks.</p>
  `,
  terms: `
    <h4 style="color: white; margin-top: 0; font-size: 1.1rem; margin-bottom: 12px;">Terms of Service</h4>
    <p>Last updated: May 2026. Welcome to VoiceDesk. By creating a tenant workspace or purchasing subscription plans, you agree to these terms.</p>
    <h5 style="color: white; margin-top: 20px; margin-bottom: 8px;">1. Overage & Quota Allowances</h5>
    <p>Paid subscriptions (Starter, Professional) receive monthly minute limits. Overage usage is billed upfront in blocks of 100 minutes at $35.00/block. Unused overage minutes carry forward and do not expire.</p>
    <h5 style="color: white; margin-top: 20px; margin-bottom: 8px;">2. User Code of Conduct</h5>
    <p>VoiceDesk services must not be used for unsolicited automated telemarketing, robocalls, harassment, or malicious recording without user warning/consent.</p>
  `,
  qa: `
    <h4 style="color: white; margin-top: 0; font-size: 1.1rem; margin-bottom: 12px;">Q&A / Platform Help Center</h4>
    <p>Find answers to common questions about using the VoiceDesk AI Receptionist and Pipeline CRM system below.</p>
    <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 15px;">
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: What is VoiceDesk?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">VoiceDesk is a multi-tenant SaaS application that deploys low-latency voice AI agents to answer customer phone calls, query/schedule calendar resources, and track sales pipeline deals in an integrated visual CRM.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: How does the AI receptionist handle different accents or languages?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">VoiceDesk supports English, Mandarin, and localized accents (such as Singlish, Manglish, or Chinglish). You can select your preferred agent accent inside settings, and the voice model adapts its tone and vocabulary dynamically.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: Can I set up separate scheduling constraints for different staff?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">Yes! Administrators can configure working hours, rest breaks, and buffer gaps globally, or customize them separately for individual team members under the Staff Calendar settings modal.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: What are overage minutes and how does prepaid billing work?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">Paid plans (Starter, Pro) carry monthly minute allocations. If exhausted, operations consume prepaid overage minutes at $0.35/min. You can buy overage minutes upfront in blocks of 100 ($35.00/block). Unused overage credits carry forward and do not expire.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: How are WhatsApp voice callbacks triggered?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">When a customer sends a WhatsApp message to your workspace's configured Twilio WhatsApp number, VoiceDesk immediately replies confirming receipt and triggers an automated outbound voice call to the customer, bridging them with your AI receptionist.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: Is my client database secure?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">Absolutely. VoiceDesk runs an isolated SQLite database schema for every tenant, preventing data leaks or cross-tenant visibility. All workspace tokens, contacts, calendar slots, and call summaries are strictly sandboxed.</p>
      </div>
    </div>
  `,
  howtostart: `
    <h4 style="color: white; margin-top: 0; font-size: 1.25rem; margin-bottom: 12px; border-bottom: 1px solid var(--border-glass); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 1.5rem;">🚀</span> Getting Started with VoiceDesk
    </h4>
    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">
      Welcome to VoiceDesk! This step-by-step guide is designed to take you from a brand-new registration to a fully automated, upgraded, and optimized AI receptionist desk and CRM pipeline.
    </p>

    <div style="display: flex; flex-direction: column; gap: 24px; margin-top: 15px;">
      
      <!-- Step 1: Sign Up -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">1</span>
          1. Sign Up & Tenant Creation
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          To begin, navigate to the top of the landing page and click the <strong>Get Started</strong> or <strong>Sign Up</strong> button. 
          Fill in your email, password, and your business/company name. Upon clicking register, VoiceDesk instantly initializes a dedicated, isolated SQLite database schema for your workspace, completely sandboxing your customer data from other tenants.
        </p>
      </div>

      <!-- Step 2: Choose Your Operational Mode -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">2</span>
          2. Set Your Scheduling Engine Mode
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted); margin-bottom: 8px;">
          Once logged in, head to <strong>Agent Settings</strong>. Under the <em>General Settings</em> section, select the scheduling format that matches your business:
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; color: var(--text-muted); display: grid; gap: 6px; margin: 0;">
          <li><strong>Clinic / Service Mode</strong>: Ideal for doctors, spas, or beauty salons. Manage therapists or team resources with dedicated time slots.</li>
          <li><strong>Restaurant Mode</strong>: Ideal for dining table bookings. Configures seating capacity and auto-assigns the smallest available table matching the group size.</li>
          <li><strong>Hotel Mode</strong>: Ideal for rooms and stays. Manages date-range check-ins and check-outs with automated night stays pricing calculations.</li>
        </ul>
      </div>

      <!-- Step 3: Configure Resources & Staff Availability -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">3</span>
          3. Set Up Availability, Breaks & Resources
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted); margin-bottom: 8px;">
          Define how bookings behave by tailoring your availability rules inside <strong>Agent Settings</strong>:
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; color: var(--text-muted); display: grid; gap: 6px; margin: 0;">
          <li><strong>Working Hours & Breaks</strong>: Tick active workdays and input daily start/end limits, along with recurring break windows (e.g. 12:00 PM - 1:00 PM lunch slots) during which bookings are blocked.</li>
          <li><strong>Buffer Gaps</strong>: Select a buffer padding (e.g. 15 mins) to prevent back-to-back booking conflicts.</li>
          <li><strong>Add Resources</strong>: Configure your list of resources (such as staff names, restaurant table numbers, or hotel room configurations with individual night rates).</li>
        </ul>
      </div>

      <!-- Step 4: Customize AI Voice Receptionist -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">4</span>
          4. Customize Prompt & Accent Presets
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          Under the <em>Voice Agent Persona</em> panel, customize the instructions that control your receptionist's talking style and knowledge base. 
          Use the quick-load templates (Medical, Spa, Real Estate, Restaurant, Hotel) to fill in structured guidelines automatically. 
          Adjust the <strong>Accent & Dialect</strong> preset to standard or localized formats (<strong>Singlish, Chinglish, Manglish</strong>) to make your caller feel at home.
        </p>
      </div>

      <!-- Step 5: Test Your Receptionist (WebRTC Sandbox) -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">5</span>
          5. Verify in Sandbox (Test in Browser)
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          Before going live with real phone lines, go to the <strong>Live Call</strong> tab on the sidebar. 
          Click the green <strong>Test in Browser</strong> button and grant microphone access. 
          Speak directly to the AI receptionist. Watch the real-time, side-by-side transcripts and visual sound waves update live. Sandbox testing is completely free and uses no quota limit!
        </p>
      </div>

      <!-- Step 6: Upgrade Subscription & Billing Toggles -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">6</span>
          6. Upgrade Plan & Billing Cycles
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted); margin-bottom: 8px;">
          Your sandbox account limits your desk to 15 calling minutes, 15 contacts, and 5 appointments, with Kanban board and Copilot access locked. To remove limits and go live:
        </p>
        <ul style="padding-left: 20px; font-size: 0.85rem; color: var(--text-muted); display: grid; gap: 6px; margin: 0;">
          <li>Go to the <strong>Billing & Usage</strong> tab on the sidebar.</li>
          <li>Choose between <strong>Starter Plan</strong> ($29/mo) or <strong>Professional Plan</strong> ($999/mo).</li>
          <li>Toggle between <strong>Monthly / Yearly billing</strong> cycles. Selecting Yearly automatically applies a <strong>20% discount</strong>.</li>
          <li>Click <strong>Upgrade Plan</strong>, which triggers the secure Stripe credit card simulator to complete your checkout payment securely.</li>
        </ul>
      </div>

      <!-- Step 7: Manage Prepaid Overage & Alert Limits -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">7</span>
          7. Manage Prepaid Overage Blocks
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          To prevent voice agent interruptions if monthly limits are exhausted, you can purchase prepaid overage credits at $0.35/min. 
          Under the Billing tab, select the number of minutes you want (options range from 100 to 1,000 minutes) and buy credit blocks. 
          Prepaid minutes carry forward monthly and do not expire. Set a <strong>low credit warning threshold</strong> (e.g. 10 mins) to receive alerts via email or WhatsApp when it's time to top up.
        </p>
      </div>

      <!-- Step 8: Visual CRM Pipeline & Hubie Copilot -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">8</span>
          8. Drive the CRM Hub & Hubie Copilot
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          As calls connect, customer contacts and opportunity deal sizes log automatically in your <strong>CRM Hub</strong>. 
          Use the visual Kanban board to track leads and opportunities by dragging cards across pipeline stages. 
          For fast operations, open the **AI CRM Copilot** terminal and type conversational instructions (e.g., <em>"Create a deal for Sarah Connor named Deluxe check-in for $450"</em> or <em>"Move John's deal to Qualified"</em>) to let Hubie update files and schemas instantly.
        </p>
      </div>

      <!-- Step 9: Pair Physical Mobile Devices -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-glass); padding: 16px; border-radius: 12px;">
        <h5 style="color: white; font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <span style="background: var(--color-primary); color: black; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">9</span>
          9. Pair Real Mobile Devices
        </h5>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
          To manage your front desk on actual smartphone hardware, go to the <strong>Mobile Simulator</strong> tab. 
          Scan the generated QR code with your mobile camera (ensure your phone is connected to the same Wi-Fi router as the server). 
          The mobile web app will load on your touchscreen with automatic token authentication, ready to modify settings or schedule appointments on the fly.
        </p>
      </div>

    </div>
  `
};

window.openFooterModal = function(topic) {
  const modal = document.getElementById('footer-info-modal');
  const title = document.getElementById('footer-modal-title');
  const body = document.getElementById('footer-modal-body');
  
  if (modal && body && footerContent[topic]) {
    body.innerHTML = footerContent[topic];
    if (title) {
      const topicTitleMap = {
        documentation: 'Documentation & Setup',
        api: 'Developer API Reference',
        status: 'VoiceDesk Service Status',
        about: 'About VoiceDesk',
        contact: 'Contact Support',
        privacy: 'Privacy & Security Policy',
        terms: 'Terms of Service',
        qa: 'Q&A / Help Center',
        howtostart: 'How to Start Guide'
      };
      title.textContent = topicTitleMap[topic] || 'VoiceDesk Info';
    }
    modal.classList.add('active');
    lucide.createIcons(); // Initialize any lucide icons in the injected HTML
  }
};
window.closeFooterModal = function() {
  const modal = document.getElementById('footer-info-modal');
  if (modal) modal.classList.remove('active');
};

// =============================================================
// AI RECEPTIONIST DEMO PLAYER LOGIC
// =============================================================
const demoDialogues = {
  dental: [
    { speaker: 'agent', text: "Thank you for calling Smiles Dental Clinic. I am Aura, your AI receptionist. How can I help you today?" },
    { speaker: 'caller', text: "Hi, um, I would like to book an appointment for a teeth cleaning next Thursday." },
    { speaker: 'agent', text: "No problem! Let me check the schedule... next Thursday is May 28th. We have openings at 10:00 AM, 2:00 PM, and 4:30 PM. Which one is good for you?" },
    { speaker: 'caller', text: "Oh, 2:00 PM works great." },
    { speaker: 'agent', text: "Perfect! Can I get your full name and phone number to secure the slot?" },
    { speaker: 'caller', text: "Yes, sure. My name is John Doe and my number is 9 1 2 3, 4 5 6 7." },
    { speaker: 'agent', text: "Got it, John. I've booked you in with Dr. Lim for your teeth cleaning next Thursday, May 28th at 2:00 PM already. A confirmation SMS is on the way!" }
  ],
  plumber: [
    { speaker: 'agent', text: "QuickFlow Plumbing Services, this is Aura here. Are you calling for emergency repair or routine service?" },
    { speaker: 'caller', text: "Hi, my kitchen sink is leaking heavily, water is going everywhere! Can you get someone here today?" },
    { speaker: 'agent', text: "Oh dear, that sounds urgent. I can dispatch a plumber to your location within 2 hours. Our emergency call-out fee is 85 dollars, including the first 30 minutes of diagnostic work. Can I book this emergency dispatch for you?" },
    { speaker: 'caller', text: "Yes, please! Send them as soon as possible." },
    { speaker: 'agent', text: "Sure. Please give me your address and contact number." },
    { speaker: 'caller', text: "I'm at 12 Orchid Drive, and my number is 8 2 3 4, 5 6 7 8." },
    { speaker: 'agent', text: "Thank you. Plumber Dave will head to 12 Orchid Drive already. He should arrive before 4:30 PM today and will call you when he's 10 minutes away." }
  ],
  realestate: [
    { speaker: 'agent', text: "Welcome to Apex Realty. I am Aura, your virtual property agent. Are you calling to rent or buy property?" },
    { speaker: 'caller', text: "Hi, I saw a listing for the 3-bedroom condo at Marina Bay Residences. Is it still available for viewing?" },
    { speaker: 'agent', text: "Yes, the Marina Bay 3-bedroom unit is still available. Viewings are open this Saturday at 11:00 AM or 3:00 PM. Which time is good for you?" },
    { speaker: 'caller', text: "Let's do 3:00 PM on Saturday." },
    { speaker: 'agent', text: "Great! Can I get your name, email, and mobile number to register your slot with the agent?" },
    { speaker: 'caller', text: "Sure, I'm Sarah Connor. Email is sarah at sky dot net and mobile is 9 8 7 6, 5 4 3 2." },
    { speaker: 'agent', text: "Thank you, Sarah. I have booked your Saturday 3:00 PM viewing already. I've sent the location details and agent contact to your phone." }
  ],
  restaurant: [
    { speaker: 'agent', text: "Thank you for calling Bistro-on-the-Hill. This is Aura, your booking assistant. Would you like to reserve a table?" },
    { speaker: 'caller', text: "Hi, yes, I'd like to book a table for four people for this Friday evening at 7:30 PM." },
    { speaker: 'agent', text: "Let me check... yes, we have a table for four available at 7:30 PM this Friday. Would you prefer indoor or outdoor dining?" },
    { speaker: 'caller', text: "Indoor dining, please." },
    { speaker: 'agent', text: "Perfect. May I have your name and contact number for the reservation?" },
    { speaker: 'caller', text: "My name is David, and my phone number is 9 2 2 2, 8 8 8 8." },
    { speaker: 'agent', text: "Alright, David. Your table for four is reserved for this Friday at 7:30 PM indoors. See you then!" }
  ],
  hotel: [
    { speaker: 'agent', text: "Apex Grand Hotel front desk, Aura speaking. How can I assist you with your reservation today?" },
    { speaker: 'caller', text: "Hi, I'd like to check room availability for next weekend, checking in on Friday and checking out on Sunday." },
    { speaker: 'agent', text: "Checking next weekend... yes, we have Deluxe Rooms and Executive Suites available. Which room type would you prefer?" },
    { speaker: 'caller', text: "A Deluxe Room is fine. What is the nightly rate?" },
    { speaker: 'agent', text: "The Deluxe Room is 250 dollars per night. Shall I proceed to book this room for your stay?" },
    { speaker: 'caller', text: "Yes, please." },
    { speaker: 'agent', text: "Wonderful. Can I have your name, email, and phone number to complete the booking?" },
    { speaker: 'caller', text: "Sure, my name is Alex, email is alex at gmail dot com and number is 8 1 1 1, 9 9 9 9." },
    { speaker: 'agent', text: "Thank you, Alex. I have reserved your Deluxe Room check-in next Friday, check-out Sunday. A confirmation email has been sent!" }
  ]
};

let activeDemoIndustry = 'dental';
let isDemoPlaying = false;
let demoLineIndex = 0;
let demoTimeElapsed = 0;
let demoTimeTotal = 0;
let demoTimerInterval = null;
let demoSpeechUtterance = null;
let demoSpeechTimeout = null;
let demoAudioCtx = null;
let demoOscs = [];
let demoAudioEl = null;

window.openCallDemoModal = function() {
  const modal = document.getElementById('call-demo-modal');
  if (modal) {
    modal.classList.add('active');
    switchDemoIndustry('dental');
    lucide.createIcons();
  }
};

window.closeCallDemoModal = function() {
  const modal = document.getElementById('call-demo-modal');
  if (modal) {
    modal.classList.remove('active');
    stopDemoPlayback();
  }
};

window.switchDemoIndustry = function(industry) {
  stopDemoPlayback();
  activeDemoIndustry = industry;
  
  // Update Pills UI
  const pills = document.querySelectorAll('#demo-industry-pills button');
  pills.forEach(pill => {
    if (pill.getAttribute('data-industry') === industry) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  // Calculate Total Duration
  const lines = demoDialogues[industry];
  const charCount = lines.reduce((acc, l) => acc + l.text.length, 0);
  // Estimate: 15 chars/sec + 1.5sec pause per line
  demoTimeTotal = Math.ceil(charCount / 14) + Math.ceil(lines.length * 1.5);
  
  document.getElementById('demo-time-elapsed').textContent = '0:00';
  document.getElementById('demo-time-total').textContent = `${Math.floor(demoTimeTotal / 60)}:${String(demoTimeTotal % 60).padStart(2, '0')}`;
  document.getElementById('demo-progress-bar').style.width = '0%';
  
  // Reset transcript pane
  const box = document.getElementById('demo-transcript-box');
  box.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;" id="demo-transcript-empty">
      Ready to start call demo. Click Play below to listen.
    </div>
  `;
  demoLineIndex = -1;
  demoTimeElapsed = 0;
};

const demoDialogueTimings = {
  dental: [0, 8.5, 15.3, 27.1, 29.9, 36.0, 41.8],
  plumber: [0, 8.4, 16.4, 33.3, 37.4, 42.2, 47.3],
  realestate: [0, 8.4, 16.9, 27.8, 30.8, 38.3, 45.3],
  restaurant: [0, 9.2, 16.4, 26.2, 28.8, 34.8, 40.0],
  hotel: [0, 7.4, 15.7, 24.7, 29.0, 36.2, 38.0, 44.5, 51.4]
};

let isVideoDemoActive = false;

window.toggleDemoPlayback = function() {
  if (isDemoPlaying) {
    stopDemoPlayback();
  } else {
    startDemoPlayback();
  }
};

function startDemoPlayback() {
  isDemoPlaying = true;
  updatePlayButton(true);
  
  document.getElementById('demo-status-dot').style.backgroundColor = '#f59e0b';
  document.getElementById('demo-status-dot').textContent = 'DIALING...';
  
  // Reset transcript box
  const box = document.getElementById('demo-transcript-box');
  box.innerHTML = '';
  
  // Play ring sound, then connect
  playPhoneRingRing(async () => {
    if (!isDemoPlaying) return;
    document.getElementById('demo-status-dot').style.backgroundColor = '#10b981';
    document.getElementById('demo-status-dot').textContent = 'CONNECTED';
    
    // Play local audio MP3 file
    const audioUrl = `/assets/demo_${activeDemoIndustry}.mp3`;
    const videoEl = document.getElementById('demo-avatar-video');
    if (videoEl) videoEl.style.display = 'none';
    
    const waveformEl = document.getElementById('demo-waveform');
    if (waveformEl) waveformEl.style.display = 'flex';
    
    let hasAudio = false;
    try {
      const checkRes = await fetch(audioUrl, { method: 'HEAD' });
      if (checkRes.ok) {
        hasAudio = true;
      }
    } catch (err) {
      hasAudio = false;
    }
    
    if (hasAudio) {
      demoAudioEl = new Audio(audioUrl);
      demoLineIndex = -1; // Reset line index so first line at 0 triggers
      
      demoAudioEl.onloadedmetadata = () => {
        demoTimeTotal = Math.ceil(demoAudioEl.duration) || 30;
        document.getElementById('demo-time-total').textContent = `${Math.floor(demoTimeTotal / 60)}:${String(demoTimeTotal % 60).padStart(2, '0')}`;
      };
      
      demoAudioEl.ontimeupdate = () => {
        if (!isDemoPlaying) return;
        const currentTime = demoAudioEl.currentTime;
        const timings = demoDialogueTimings[activeDemoIndustry] || [];
        const lines = demoDialogues[activeDemoIndustry] || [];
        
        let activeLineIndex = -1;
        for (let i = 0; i < timings.length; i++) {
          if (currentTime >= timings[i]) {
            activeLineIndex = i;
          }
        }
        
        if (activeLineIndex !== -1 && activeLineIndex !== demoLineIndex) {
          demoLineIndex = activeLineIndex;
          box.innerHTML = '';
          for (let i = 0; i <= demoLineIndex; i++) {
            if (lines[i]) {
              renderDemoLineBubble(lines[i]);
            }
          }
        }
        
        // Update progress bar
        document.getElementById('demo-time-elapsed').textContent = `${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, '0')}`;
        const duration = demoAudioEl.duration || 1;
        const pct = (currentTime / duration) * 100;
        document.getElementById('demo-progress-bar').style.width = `${pct}%`;
      };
      
      demoAudioEl.onended = () => {
        stopDemoPlayback();
      };
      
      startDemoWaveform();
      demoAudioEl.play().catch((err) => {
        console.warn('Audio play failed, falling back to speech synthesis:', err);
        fallbackToVoiceSynthesis();
      });
    } else {
      fallbackToVoiceSynthesis();
    }
  });
}

function fallbackToVoiceSynthesis() {
  isVideoDemoActive = false;
  const videoEl = document.getElementById('demo-avatar-video');
  if (videoEl) videoEl.style.display = 'none';
  document.getElementById('demo-waveform').style.display = 'flex';
  
  // Start timing
  demoTimerInterval = setInterval(() => {
    demoTimeElapsed++;
    if (demoTimeElapsed >= demoTimeTotal) {
      demoTimeElapsed = demoTimeTotal;
    }
    document.getElementById('demo-time-elapsed').textContent = `${Math.floor(demoTimeElapsed / 60)}:${String(demoTimeElapsed % 60).padStart(2, '0')}`;
    const pct = (demoTimeElapsed / demoTimeTotal) * 100;
    document.getElementById('demo-progress-bar').style.width = `${pct}%`;
    
    if (demoTimeElapsed >= demoTimeTotal) {
      stopDemoPlayback();
    }
  }, 1000);

  demoLineIndex = 0;
  playNextDemoLine();
}

function stopDemoPlayback() {
  isDemoPlaying = false;
  updatePlayButton(false);
  
  // Reset Status dot
  const statusDot = document.getElementById('demo-status-dot');
  if (statusDot) {
    statusDot.style.backgroundColor = '#ef4444';
    statusDot.textContent = 'DISCONNECTED';
  }

  // Stop video if active
  const videoEl = document.getElementById('demo-avatar-video');
  if (videoEl) {
    videoEl.pause();
    videoEl.style.display = 'none';
  }
  isVideoDemoActive = false;

  // Stop audio element if playing
  if (demoAudioEl) {
    try {
      demoAudioEl.pause();
    } catch (e) {}
    demoAudioEl = null;
  }

  // Clear timers
  if (demoTimerInterval) {
    clearInterval(demoTimerInterval);
    demoTimerInterval = null;
  }
  if (demoSpeechTimeout) {
    clearTimeout(demoSpeechTimeout);
    demoSpeechTimeout = null;
  }
  
  // Cancel speech synthesis
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  
  // Stop wave animation
  stopDemoWaveform();

  // Stop ring audioCtx if active
  if (demoOscs.length > 0) {
    demoOscs.forEach(osc => { try { osc.stop(); } catch(e){} });
    demoOscs = [];
  }
  if (demoAudioCtx) {
    try { demoAudioCtx.close(); } catch(e){}
    demoAudioCtx = null;
  }
}

function updatePlayButton(playing) {
  const icon = document.getElementById('icon-demo-play');
  const btn = document.getElementById('btn-demo-play');
  if (icon && btn) {
    if (playing) {
      icon.setAttribute('data-lucide', 'pause');
      btn.style.backgroundColor = 'var(--color-danger)';
      btn.style.boxShadow = '0 0 15px var(--color-danger)';
    } else {
      icon.setAttribute('data-lucide', 'play');
      btn.style.backgroundColor = 'var(--color-primary)';
      btn.style.boxShadow = '0 0 15px var(--color-primary)';
    }
    lucide.createIcons();
  }
}

function playPhoneRingRing(callback) {
  try {
    demoAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Telephone ring: 440Hz + 480Hz combined
    const osc1 = demoAudioCtx.createOscillator();
    const osc2 = demoAudioCtx.createOscillator();
    const gainNode = demoAudioCtx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.value = 440;
    osc2.type = 'sine';
    osc2.frequency.value = 480;
    
    gainNode.gain.setValueAtTime(0, demoAudioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, demoAudioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.15, demoAudioCtx.currentTime + 0.8);
    gainNode.gain.linearRampToValueAtTime(0, demoAudioCtx.currentTime + 1.0);
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(demoAudioCtx.destination);
    
    osc1.start();
    osc2.start();
    demoOscs = [osc1, osc2];
    
    // Pulse waveform during ring
    startDemoWaveform();
    
    setTimeout(() => {
      osc1.stop();
      osc2.stop();
      stopDemoWaveform();
      if (callback) callback();
    }, 1200);
  } catch (e) {
    console.error('AudioContext ring error:', e);
    if (callback) callback();
  }
}

function playNextDemoLine() {
  if (!isDemoPlaying) return;
  const lines = demoDialogues[activeDemoIndustry];
  if (demoLineIndex >= lines.length) {
    stopDemoPlayback();
    return;
  }

  const line = lines[demoLineIndex];
  renderDemoLineBubble(line);
  
  // Audio playback via SpeechSynthesis
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel(); // Clear any queued speech
    
    demoSpeechUtterance = new SpeechSynthesisUtterance(line.text);
    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    
    if (line.speaker === 'agent') {
      // Cheerful, lively receptionist: prioritize Singapore English (en-SG) or Malaysia English (en-MY) voices
      const priorityList = [
        // 1. Natural/Online/Google female voices in Singapore English (Singlish)
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-sg') && v.name.toLowerCase().includes('female') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online') || v.name.toLowerCase().includes('google')),
        // 2. Any female voice in Singapore English
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-sg') && v.name.toLowerCase().includes('female'),
        // 3. Any voice in Singapore English
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-sg'),
        // 4. Natural/Online/Google female voices in Malaysia English
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-my') && v.name.toLowerCase().includes('female') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online') || v.name.toLowerCase().includes('google')),
        // 5. Any voice in Malaysia English
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-my'),
        // 6. Generic high-quality English female voices
        v => v.name.toLowerCase().includes('natural') && v.name.toLowerCase().includes('female'),
        v => v.name.toLowerCase().includes('online') && (v.name.toLowerCase().includes('aria') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('sara') || v.name.toLowerCase().includes('jenny')),
        v => v.name.toLowerCase().includes('google') && v.name.toLowerCase().includes('female'),
        v => v.name.toLowerCase().includes('siri') && v.name.toLowerCase().includes('female'),
        v => v.name.toLowerCase().includes('enhanced') && v.name.toLowerCase().includes('female'),
        v => v.name.toLowerCase().includes('aria'),
        v => v.name.toLowerCase().includes('samantha'),
        v => v.name.toLowerCase().includes('zira'),
        v => v.name.toLowerCase().includes('female')
      ];
      
      let chosenVoice = null;
      for (const predicate of priorityList) {
        chosenVoice = englishVoices.find(predicate);
        if (chosenVoice) break;
      }
      demoSpeechUtterance.voice = chosenVoice || englishVoices[0] || voices[0] || null;
      demoSpeechUtterance.rate = 1.05;  // slightly faster pacing for an active, cheerful tone
      demoSpeechUtterance.pitch = 1.15; // slightly higher pitch to sound lively and positive
    } else {
      // Mellow, serious caller: prioritize natural, online, google, siri, or david/daniel male voices
      const priorityList = [
        v => v.name.toLowerCase().includes('natural') && v.name.toLowerCase().includes('male'),
        v => v.name.toLowerCase().includes('online') && (v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('ryan') || v.name.toLowerCase().includes('steffan')),
        v => v.name.toLowerCase().includes('google') && v.name.toLowerCase().includes('male'),
        v => v.name.toLowerCase().includes('siri') && v.name.toLowerCase().includes('male'),
        v => v.name.toLowerCase().includes('enhanced') && v.name.toLowerCase().includes('male'),
        v => v.name.toLowerCase().includes('daniel'),
        v => v.name.toLowerCase().includes('david'),
        v => v.name.toLowerCase().includes('male')
      ];
      
      let chosenVoice = null;
      for (const predicate of priorityList) {
        chosenVoice = englishVoices.find(predicate);
        if (chosenVoice) break;
      }
      demoSpeechUtterance.voice = chosenVoice || englishVoices.find(v => v.name.toLowerCase().includes('male')) || englishVoices[0] || voices[0] || null;
      demoSpeechUtterance.rate = 0.88;  // slightly slower, steady pacing for a serious tone
      demoSpeechUtterance.pitch = 0.82; // lower pitch for a deeper, mellow, and serious tone
    }
    
    demoSpeechUtterance.onstart = () => {
      startDemoWaveform();
    };
    
    demoSpeechUtterance.onend = () => {
      stopDemoWaveform();
      demoLineIndex++;
      const pauseDuration = line.speaker === 'agent' ? 2000 : 1200;
      demoSpeechTimeout = setTimeout(playNextDemoLine, pauseDuration);
    };
    
    demoSpeechUtterance.onerror = (err) => {
      console.warn('SpeechSynthesis error, running visual simulation:', err);
      // Failover visual simulator if browser permissions blocks speech synthesis
      startDemoWaveform();
      const speakDuration = Math.max(2500, line.text.length * 60);
      demoSpeechTimeout = setTimeout(() => {
        stopDemoWaveform();
        demoLineIndex++;
        const pauseDuration = line.speaker === 'agent' ? 2000 : 1200;
        demoSpeechTimeout = setTimeout(playNextDemoLine, pauseDuration);
      }, speakDuration);
    };

    window.speechSynthesis.speak(demoSpeechUtterance);
  } else {
    // Pure visual fallback if SpeechSynthesis is completely unavailable
    startDemoWaveform();
    const speakDuration = Math.max(2500, line.text.length * 60);
    demoSpeechTimeout = setTimeout(() => {
      stopDemoWaveform();
      demoLineIndex++;
      const pauseDuration = line.speaker === 'agent' ? 2000 : 1200;
      demoSpeechTimeout = setTimeout(playNextDemoLine, pauseDuration);
    }, speakDuration);
  }
}

function renderDemoLineBubble(line) {
  const box = document.getElementById('demo-transcript-box');
  if (!box) return;
  
  const isAgent = line.speaker === 'agent';
  const bubbleDiv = document.createElement('div');
  bubbleDiv.style.display = 'flex';
  bubbleDiv.style.flexDirection = 'column';
  bubbleDiv.style.alignItems = isAgent ? 'flex-start' : 'flex-end';
  bubbleDiv.style.width = '100%';
  bubbleDiv.style.animation = 'fadeIn 0.3s ease forwards';
  
  const speakerLabel = document.createElement('span');
  speakerLabel.style.fontSize = '0.7rem';
  speakerLabel.style.color = 'var(--text-muted)';
  speakerLabel.style.marginBottom = '2px';
  speakerLabel.textContent = isAgent ? '💁‍♀️ Aura (AI Receptionist)' : '📞 Customer';
  
  const bubble = document.createElement('div');
  bubble.style.padding = '10px 14px';
  bubble.style.borderRadius = '12px';
  bubble.style.fontSize = '0.85rem';
  bubble.style.maxWidth = '75%';
  bubble.style.lineHeight = '1.4';
  
  if (isAgent) {
    bubble.style.background = 'rgba(6, 182, 212, 0.15)';
    bubble.style.color = 'white';
    bubble.style.border = '1px solid rgba(6, 182, 212, 0.25)';
    bubble.style.borderTopLeftRadius = '2px';
  } else {
    bubble.style.background = 'rgba(255, 255, 255, 0.05)';
    bubble.style.color = 'var(--text-muted)';
    bubble.style.border = '1px solid var(--border-glass)';
    bubble.style.borderTopRightRadius = '2px';
  }
  bubble.textContent = line.text;
  
  bubbleDiv.appendChild(speakerLabel);
  bubbleDiv.appendChild(bubble);
  box.appendChild(bubbleDiv);
  
  // Scroll to bottom
  box.scrollTop = box.scrollHeight;
}

let demoWaveInterval = null;
function startDemoWaveform() {
  if (demoWaveInterval) clearInterval(demoWaveInterval);
  const bars = document.querySelectorAll('#demo-waveform .wave-bar');
  demoWaveInterval = setInterval(() => {
    bars.forEach(bar => {
      const height = Math.floor(Math.random() * 38) + 10;
      bar.style.height = `${height}px`;
    });
  }, 100);
}

function stopDemoWaveform() {
  if (demoWaveInterval) clearInterval(demoWaveInterval);
  demoWaveInterval = null;
  const bars = document.querySelectorAll('#demo-waveform .wave-bar');
  bars.forEach(bar => {
    bar.style.height = '10px';
  });
}

window.handleDemoProgressClick = function(event) {
  switchDemoIndustry(activeDemoIndustry);
};

window.triggerLockPayment = function(mode) {
  if (mode === 'sub') {
    stripePaymentMode = 'upgrade';
    selectedUpgradeTier = currentTenant && currentTenant.subscription_tier !== 'free' ? currentTenant.subscription_tier : 'starter';
    window.togglePaymentModal(true);
  } else if (mode === 'minutes') {
    stripePaymentMode = 'overage';
    window.togglePaymentModal(true);
  }
};

window.logoutRestrictedAccount = function() {
  logout();
  const lockOverlay = document.getElementById('account-lock-overlay');
  if (lockOverlay) {
    lockOverlay.style.display = 'none';
  }
};

window.openRequestDemoModal = function() {
  const modal = document.getElementById('request-demo-modal');
  if (modal) {
    modal.classList.add('active');
    lucide.createIcons();
  }
};

window.closeRequestDemoModal = function() {
  const modal = document.getElementById('request-demo-modal');
  if (modal) modal.classList.remove('active');
};

window.selectDemoOption = function(option) {
  closeRequestDemoModal();
  if (option === 'ai') {
    openCallDemoModal();
  } else if (option === 'form') {
    openFooterModal('contact');
  }
};

// =============================================================
// ONBOARDING WIZARD CONTROLLER
// =============================================================

function showWizardStep(stepNum) {
  currentWizardStep = stepNum;
  
  // Toggle active pane
  document.querySelectorAll('.wizard-step-pane').forEach(pane => {
    if (parseInt(pane.getAttribute('data-step')) === stepNum) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // Toggle active sidebar stepper item
  document.querySelectorAll('.stepper-item').forEach(item => {
    if (parseInt(item.getAttribute('data-step')) === stepNum) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle Back button visibility
  const backBtn = document.getElementById('btn-wizard-back');
  if (backBtn) {
    if (stepNum === 2) {
      backBtn.style.visibility = 'hidden';
    } else {
      backBtn.style.visibility = 'visible';
    }
  }

  // Set Next button text or class
  const nextBtn = document.getElementById('btn-wizard-next');
  if (nextBtn) {
    if (stepNum === 11) {
      nextBtn.innerHTML = 'Save & Complete <i data-lucide="check" style="width: 16px; height: 16px;"></i>';
    } else {
      nextBtn.innerHTML = 'Next Step <i data-lucide="arrow-right" style="width: 16px; height: 16px;"></i>';
    }
  }

  initIcons();
}
window.showWizardStep = showWizardStep;

function updateOnboardingProgress() {
  let completedCount = 0;
  const totalSteps = 10;

  // Step 2: Business Profile - Check company name & system mode
  const step2Comp = !!(settingsCompany && settingsCompany.value.trim());
  markStepCompletedState(2, step2Comp);
  if (step2Comp) completedCount++;

  // Step 3: Branding - Check agent name
  const step3Comp = !!(settingsAgentName && settingsAgentName.value.trim());
  markStepCompletedState(3, step3Comp);
  if (step3Comp) completedCount++;

  // Step 4: Voice Provider - Always true (default selected)
  markStepCompletedState(4, true);
  completedCount++;

  // Step 5: Phone Number - Check twilio phone number
  const step5Comp = !!(settingsTwilio && settingsTwilio.value.trim());
  markStepCompletedState(5, step5Comp);
  if (step5Comp) completedCount++;

  // Step 6: AI Receptionist - Check system instructions prompt
  const step6Comp = !!(settingsPrompt && settingsPrompt.value.trim());
  markStepCompletedState(6, step6Comp);
  if (step6Comp) completedCount++;

  // Step 7: Business Hours - Check if any day pill/checkbox is active
  let anyActiveDay = false;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  days.forEach(day => {
    const checkbox = document.getElementById('work-day-' + day);
    if (checkbox && checkbox.checked) anyActiveDay = true;
  });
  markStepCompletedState(7, anyActiveDay);
  if (anyActiveDay) completedCount++;

  // Step 8: Knowledge Base - Check template or crawler URL or crawled content
  const step8Comp = !!(settingsWebsiteUrl && settingsWebsiteUrl.value.trim()) || 
                   !!(document.getElementById('settings-template')?.value) ||
                   (crawlStatusContainer && crawlStatusContainer.style.display === 'block');
  markStepCompletedState(8, step8Comp);
  if (step8Comp) completedCount++;

  // Step 9: Add-on Modules - Sandbox/Stripe selected (always true)
  markStepCompletedState(9, true);
  completedCount++;

  // Step 10: Team Members - Check resources list or team list length
  const step10Comp = !!(settingsResources && settingsResources.value.trim()) || 
                    (workspaceTeamList && workspaceTeamList.length > 0);
  markStepCompletedState(10, step10Comp);
  if (step10Comp) completedCount++;

  // Step 11: Go Live - Always true
  markStepCompletedState(11, true);
  completedCount++;

  // Update progress UI elements
  const progressText = document.getElementById('wizard-progress-text');
  const progressPercent = document.getElementById('wizard-progress-percent');
  const progressFill = document.getElementById('wizard-progress-fill');
  
  const percentage = Math.round((completedCount / totalSteps) * 100);
  if (progressText) progressText.textContent = `Onboarding Progress`;
  if (progressPercent) progressPercent.textContent = `${percentage}%`;
  if (progressFill) progressFill.style.width = `${percentage}%`;
}
window.updateOnboardingProgress = updateOnboardingProgress;

function renumberVisibleSteps() {
  document.querySelectorAll('.stepper-item').forEach(item => {
    if (item.style.display !== 'none') {
      const circle = item.querySelector('.stepper-circle');
      if (circle) {
        if (item.classList.contains('completed')) {
          circle.innerHTML = '✓';
        } else {
          circle.innerHTML = '';
        }
      }
      const stepNum = item.getAttribute('data-step');
      const pane = document.querySelector(`.wizard-step-pane[data-step="${stepNum}"]`);
      if (pane) {
        const h3 = pane.querySelector('.wizard-step-header-text h3');
        if (h3) {
          const originalText = h3.textContent;
          // Strip "Step X: " prefix entirely
          const cleanText = originalText.replace(/^Step\s+\d+:\s*/i, '');
          h3.textContent = cleanText;
        }
      }
    }
  });
}
window.renumberVisibleSteps = renumberVisibleSteps;

function markStepCompletedState(stepNum, isCompleted) {
  const item = document.querySelector(`.stepper-item[data-step="${stepNum}"]`);
  if (item) {
    if (isCompleted) {
      item.classList.add('completed');
    } else {
      item.classList.remove('completed');
    }
  }
  renumberVisibleSteps();
}

// Bind Wizard event listeners once DOM is ready or function called
function initWizardEvents() {
  // Sidebar Stepper item click handlers
  document.querySelectorAll('.stepper-item').forEach(item => {
    item.addEventListener('click', () => {
      const step = parseInt(item.getAttribute('data-step'));
      saveWizardSettings(true); // Auto-save silently on step transition
      showWizardStep(step);
    });
  });

  // Back button click handler
  const backBtn = document.getElementById('btn-wizard-back');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const prevVisible = getNextVisibleStep(currentWizardStep, -1);
      if (prevVisible < currentWizardStep) {
        saveWizardSettings(true); // Auto-save silently
        showWizardStep(prevVisible);
      }
    });
  }

  // Day pills toggle handlers
  document.querySelectorAll('.working-day-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const day = pill.getAttribute('data-day');
      pill.classList.toggle('active');
      const checkbox = document.getElementById('work-day-' + day);
      if (checkbox) {
        checkbox.checked = pill.classList.contains('active');
      }
      
      // Live update preview text label
      updateBusinessHoursSchedulePreview();
      updateOnboardingProgress();
    });
  });

  // Sync time inputs
  const startTimeInput = document.getElementById('work-start-monday');
  const endTimeInput = document.getElementById('work-end-monday');
  
  if (startTimeInput) {
    startTimeInput.addEventListener('input', () => {
      // Sync to all weekday hidden values
      const days = ['tuesday', 'wednesday', 'thursday', 'friday'];
      days.forEach(day => {
        const input = document.getElementById(`work-start-${day}`);
        if (input) input.value = startTimeInput.value;
      });
      updateBusinessHoursSchedulePreview();
    });
  }

  if (endTimeInput) {
    endTimeInput.addEventListener('input', () => {
      const days = ['tuesday', 'wednesday', 'thursday', 'friday'];
      days.forEach(day => {
        const input = document.getElementById(`work-end-${day}`);
        if (input) input.value = endTimeInput.value;
      });
      updateBusinessHoursSchedulePreview();
    });
  }

  // Branding Avatar selectors
  document.querySelectorAll('.brand-avatar-option').forEach(avatar => {
    avatar.addEventListener('click', () => {
      document.querySelectorAll('.brand-avatar-option').forEach(a => a.classList.remove('active'));
      avatar.classList.add('active');
      showToast('Avatar Selected', `Representative avatar changed to ${avatar.getAttribute('data-avatar')}`, 'success');
    });
  });

  // Voice Provider selectors
  document.querySelectorAll('.voice-provider-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.voice-provider-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const provider = card.getAttribute('data-provider');
      showToast('Provider Configured', `Voice engine switched to ${provider === 'openai' ? 'OpenAI Realtime' : 'Retell / VAPI'}`, 'success');
    });
  });

  // Sync prompt instructions template preview
  const templateSelect = document.getElementById('settings-template');
  if (templateSelect) {
    templateSelect.addEventListener('change', () => {
      setTimeout(updateOnboardingProgress, 100);
    });
  }

  // Sync inputs to calculate completeness dynamically
  const liveInputs = [settingsCompany, settingsAgentName, settingsTwilio, settingsPrompt, settingsResources, settingsWebsiteUrl];
  liveInputs.forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        updateOnboardingProgress();
      });
    }
  });



  // Set up initial step state
  showWizardStep(2);
}

function updateBusinessHoursSchedulePreview() {
  const activeDays = [];
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  days.forEach(day => {
    const pill = document.querySelector(`.working-day-pill[data-day="${day}"]`);
    if (pill && pill.classList.contains('active')) {
      activeDays.push(day.substring(0, 3).charAt(0).toUpperCase() + day.substring(0, 3).slice(1));
    }
  });

  const start = document.getElementById('work-start-monday')?.value || '09:00';
  const end = document.getElementById('work-end-monday')?.value || '17:00';
  
  // Format 24h to 12h or keep it neat
  const daysString = activeDays.join(', ');
  const scheduleText = `${daysString || 'No days selected'} - ${start} - ${end} (Asia/Singapore)`;
  
  const label = document.getElementById('settings-hours');
  if (label) {
    label.value = `${daysString || 'Closed'} (${start} - ${end})`;
  }

  const preview = document.getElementById('schedule-preview-text');
  if (preview) {
    preview.textContent = scheduleText;
  }
}

// Automatically trigger wizard setup on load
setTimeout(() => {
  initWizardEvents();
}, 500);

// =============================================================
// BASIC ACCOUNTING MODULE CLIENT CONTROLLER
// =============================================================

let activeAccountingSubtab = 'invoices';
let accountingInvoices = [];
let accountingBills = [];
let accountingPayments = [];
let accountingExpenses = [];
let accountingContacts = [];
let accountingItems = [];
let accountingAccounts = [];

function formatKAmount(amount) {
  const val = parseFloat(amount) || 0;
  return `$${(val / 1000).toFixed(1)}k`;
}

function formatCurrency(amount) {
  const val = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

async function fetchAccountingData() {
  try {
    const res = await fetch('/api/accounting/metrics');
    if (res.ok) {
      const metrics = await res.json();
      document.getElementById('accounting-metric-receivables').textContent = formatKAmount(metrics.receivables);
      document.getElementById('accounting-metric-payables').textContent = formatKAmount(metrics.payables);
      document.getElementById('accounting-metric-revenue').textContent = formatKAmount(metrics.revenue);
      document.getElementById('accounting-metric-expenses').textContent = formatKAmount(metrics.expenses);
      document.getElementById('accounting-metric-overdue-invoices').textContent = metrics.overdueInvoices;
      document.getElementById('accounting-metric-overdue-bills').textContent = metrics.overdueBills;

      // Populate P&L Report values if active tab is reports
      const plRev = document.getElementById('report-pl-revenue');
      if (plRev) plRev.textContent = formatCurrency(metrics.revenue);
      
      const plExp = document.getElementById('report-pl-expenses');
      if (plExp) plExp.textContent = formatCurrency(metrics.expenses);
      
      const netProfit = metrics.revenue - metrics.expenses;
      const netProfitEl = document.getElementById('report-pl-net');
      if (netProfitEl) {
        netProfitEl.textContent = formatCurrency(netProfit);
        netProfitEl.className = netProfit >= 0 ? 'text-green' : 'text-red';
      }

      // Populate Balance Sheet values
      const totalAssets = (metrics.revenue - metrics.expenses) + metrics.receivables;
      const bsAssets = document.getElementById('report-bs-assets');
      if (bsAssets) bsAssets.textContent = formatCurrency(totalAssets);
      
      const bsLiab = document.getElementById('report-bs-liabilities');
      if (bsLiab) bsLiab.textContent = formatCurrency(metrics.payables);
      
      const equity = totalAssets - metrics.payables;
      const equityEl = document.getElementById('report-bs-equity');
      if (equityEl) {
        equityEl.textContent = formatCurrency(equity);
        equityEl.className = equity >= 0 ? 'text-green' : 'text-red';
      }
    }
  } catch (err) {
    console.error('Failed to fetch accounting metrics:', err);
  }

  // Load the current subtab data
  refreshActiveSubtab();
}

let accountingQuotations = [];

async function fetchAccountingQuotations() {
  try {
    const res = await fetch('/api/accounting/quotations');
    if (res.ok) {
      accountingQuotations = await res.json();
      renderAccountingQuotations();
    }
  } catch (err) {
    console.error('Failed to fetch quotations:', err);
  }
}

function renderAccountingQuotations() {
  const tbody = document.getElementById('ac-quotations-tbody');
  const emptyState = document.getElementById('ac-quotations-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-quotations')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('ac-filter-quotation-status')?.value || '';

  const filtered = accountingQuotations.filter(q => {
    const matchSearch = q.quotation_number.toLowerCase().includes(searchVal) ||
                        (q.customer_name && q.customer_name.toLowerCase().includes(searchVal)) ||
                        (q.description && q.description.toLowerCase().includes(searchVal));
    const matchStatus = !statusFilter || q.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
  }

  filtered.forEach(q => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';
    let statusClass = 'status-unpaid';
    if (q.status === 'accepted') statusClass = 'status-paid';
    else if (q.status === 'declined') statusClass = 'status-overdue';
    else if (q.status === 'sent') statusClass = 'status-unpaid';
    else statusClass = 'status-draft';

    tr.innerHTML = `
      <td style="font-weight: 700; color: white;">${escapeHtml(q.quotation_number)}</td>
      <td>${escapeHtml(q.customer_name)}</td>
      <td>${escapeHtml(q.date)}</td>
      <td>${escapeHtml(q.expiry_date)}</td>
      <td style="color: var(--color-primary); font-weight: 600;">${formatCurrency(q.total)}</td>
      <td><span class="status-badge ${statusClass}">${q.status.toUpperCase()}</span></td>
      <td>
        <button class="btn btn-secondary btn-ac-delete-quotation" data-id="${q.id}" style="padding: 4px 8px; font-size: 0.75rem; border-color: rgba(239, 68, 68, 0.3); color: #ef4444;">
          <i data-lucide="trash-2" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;"></i> Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-ac-delete-quotation').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this quotation?')) {
        try {
          const res = await fetch(`/api/accounting/quotations/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showToast('Success', 'Quotation deleted.', 'success');
            fetchAccountingData();
          } else {
            showToast('Error', 'Failed to delete quotation.', 'danger');
          }
        } catch (e) {
          console.error(e);
        }
      }
    });
  });

  initIcons();
}

function refreshActiveSubtab() {
  if (activeAccountingSubtab === 'invoices') fetchAccountingInvoices();
  else if (activeAccountingSubtab === 'quotations') fetchAccountingQuotations();
  else if (activeAccountingSubtab === 'bills') fetchAccountingBills();
  else if (activeAccountingSubtab === 'payments') fetchAccountingPayments();
  else if (activeAccountingSubtab === 'expenses') fetchAccountingExpenses();
  else if (activeAccountingSubtab === 'customers') fetchAccountingContacts('customer');
  else if (activeAccountingSubtab === 'suppliers') fetchAccountingContacts('supplier');
  else if (activeAccountingSubtab === 'items') fetchAccountingItems();
  else if (activeAccountingSubtab === 'accounts') fetchAccountingAccounts();
  else if (activeAccountingSubtab === 'reports') fetchAccountingData();
}

async function fetchAccountingInvoices() {
  try {
    const res = await fetch('/api/accounting/invoices');
    if (res.ok) {
      accountingInvoices = await res.json();
      renderAccountingInvoices();
    }
  } catch (err) {
    console.error('Failed to fetch invoices:', err);
  }
}

function renderAccountingInvoices() {
  const tbody = document.getElementById('ac-invoices-tbody');
  const emptyState = document.getElementById('ac-invoices-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-invoices')?.value || '').toLowerCase();
  const filterStatus = document.getElementById('ac-filter-invoice-status')?.value || '';

  const filtered = accountingInvoices.filter(inv => {
    const matchesSearch = inv.invoice_number.toLowerCase().includes(searchVal) ||
                          (inv.customer_name && inv.customer_name.toLowerCase().includes(searchVal));
    const matchesStatus = !filterStatus || inv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    filtered.forEach(inv => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: white;">${escapeHtml(inv.invoice_number)}</td>
        <td>
          <div style="font-weight: 600; color: white;">${escapeHtml(inv.customer_name || 'Unknown')}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(inv.customer_email || '')}</div>
        </td>
        <td>${inv.date}</td>
        <td>${inv.due_date}</td>
        <td style="font-weight: 600; color: white;">${formatCurrency(inv.total)}</td>
        <td class="text-green">${formatCurrency(inv.paid)}</td>
        <td style="font-weight: 600; color: white;">${formatCurrency(inv.balance)}</td>
        <td><span class="ac-badge ac-badge-${inv.status}">${inv.status}</span></td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 0.75rem;" onclick="deleteAccountingRecord('invoices', ${inv.id})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
  }
}

async function fetchAccountingBills() {
  try {
    const res = await fetch('/api/accounting/bills');
    if (res.ok) {
      accountingBills = await res.json();
      renderAccountingBills();
    }
  } catch (err) {
    console.error('Failed to fetch bills:', err);
  }
}

function renderAccountingBills() {
  const tbody = document.getElementById('ac-bills-tbody');
  const emptyState = document.getElementById('ac-bills-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-bills')?.value || '').toLowerCase();

  const filtered = accountingBills.filter(bill => {
    return bill.bill_number.toLowerCase().includes(searchVal) ||
           (bill.supplier_name && bill.supplier_name.toLowerCase().includes(searchVal));
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    filtered.forEach(bill => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: white;">${escapeHtml(bill.bill_number)}</td>
        <td>
          <div style="font-weight: 600; color: white;">${escapeHtml(bill.supplier_name || 'Unknown')}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(bill.supplier_email || '')}</div>
        </td>
        <td>${bill.date}</td>
        <td>${bill.due_date}</td>
        <td style="font-weight: 600; color: white;">${formatCurrency(bill.total)}</td>
        <td class="text-green">${formatCurrency(bill.paid)}</td>
        <td style="font-weight: 600; color: white;">${formatCurrency(bill.balance)}</td>
        <td><span class="ac-badge ac-badge-${bill.status}">${bill.status}</span></td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 0.75rem;" onclick="deleteAccountingRecord('bills', ${bill.id})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
  }
}

async function fetchAccountingPayments() {
  try {
    const res = await fetch('/api/accounting/payments');
    if (res.ok) {
      accountingPayments = await res.json();
      renderAccountingPayments();
    }
  } catch (err) {
    console.error('Failed to fetch payments:', err);
  }
}

function renderAccountingPayments() {
  const tbody = document.getElementById('ac-payments-tbody');
  const emptyState = document.getElementById('ac-payments-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-payments')?.value || '').toLowerCase();

  const filtered = accountingPayments.filter(pay => {
    const contactName = pay.contact_name || '';
    const invNum = pay.invoice_number || '';
    const billNum = pay.bill_number || '';
    return contactName.toLowerCase().includes(searchVal) ||
           invNum.toLowerCase().includes(searchVal) ||
           billNum.toLowerCase().includes(searchVal);
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    filtered.forEach(pay => {
      const type = pay.invoice_id ? 'Customer Receipt' : 'Supplier Payment';
      const ref = pay.invoice_id ? (pay.invoice_number || `INV #${pay.invoice_id}`) : (pay.bill_number || `BILL #${pay.bill_id}`);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${pay.date}</td>
        <td style="font-weight: 700; color: white;">${escapeHtml(ref)}</td>
        <td>${escapeHtml(pay.contact_name || 'General')}</td>
        <td style="font-weight: 600; color: white;" class="text-green">${formatCurrency(pay.amount)}</td>
        <td style="text-transform: uppercase; font-size: 0.8rem;">${pay.method}</td>
        <td><span class="badge" style="background: rgba(6, 182, 212, 0.1); color: var(--color-primary); padding: 4px 8px; border-radius: 4px;">${type}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
}

async function fetchAccountingExpenses() {
  try {
    const res = await fetch('/api/accounting/expenses');
    if (res.ok) {
      accountingExpenses = await res.json();
      renderAccountingExpenses();
    }
  } catch (err) {
    console.error('Failed to fetch expenses:', err);
  }
}

function renderAccountingExpenses() {
  const tbody = document.getElementById('ac-expenses-tbody');
  const emptyState = document.getElementById('ac-expenses-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-expenses')?.value || '').toLowerCase();

  const filtered = accountingExpenses.filter(exp => {
    return exp.category.toLowerCase().includes(searchVal) ||
           (exp.description && exp.description.toLowerCase().includes(searchVal));
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    filtered.forEach(exp => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${exp.date}</td>
        <td style="font-weight: 700; color: white;">${escapeHtml(exp.category)}</td>
        <td style="font-weight: 600; color: white;" class="text-red">${formatCurrency(exp.amount)}</td>
        <td>${escapeHtml(exp.description || '')}</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 0.75rem;" onclick="deleteAccountingRecord('expenses', ${exp.id})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
  }
}

async function fetchAccountingContacts(typeFilter) {
  try {
    const res = await fetch('/api/accounting/contacts');
    if (res.ok) {
      accountingContacts = await res.json();
      renderAccountingContacts(typeFilter);
    }
  } catch (err) {
    console.error('Failed to fetch contacts:', err);
  }
}

function renderAccountingContacts(typeFilter) {
  const tbody = document.getElementById('ac-contacts-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-contacts')?.value || '').toLowerCase();

  const filtered = accountingContacts.filter(con => {
    if (con.type !== typeFilter) return false;
    return con.name.toLowerCase().includes(searchVal) ||
           (con.email && con.email.toLowerCase().includes(searchVal)) ||
           (con.phone && con.phone.includes(searchVal));
  });

  filtered.forEach(con => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: white;">${escapeHtml(con.name)}</td>
      <td style="text-transform: capitalize;">${con.type}</td>
      <td>${escapeHtml(con.email || '')}</td>
      <td>${escapeHtml(con.phone || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function fetchAccountingItems() {
  try {
    const res = await fetch('/api/accounting/items');
    if (res.ok) {
      accountingItems = await res.json();
      renderAccountingItems();
    }
  } catch (err) {
    console.error('Failed to fetch items:', err);
  }
}

function renderAccountingItems() {
  const tbody = document.getElementById('ac-items-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-items')?.value || '').toLowerCase();

  const filtered = accountingItems.filter(item => {
    return item.name.toLowerCase().includes(searchVal) ||
           (item.sku && item.sku.toLowerCase().includes(searchVal));
  });

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--color-primary);">${escapeHtml(item.sku || 'N/A')}</td>
      <td style="font-weight: 600; color: white;">${escapeHtml(item.name)}</td>
      <td style="font-weight: 700; color: white;">${formatCurrency(item.price)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function fetchAccountingAccounts() {
  try {
    const res = await fetch('/api/accounting/accounts');
    if (res.ok) {
      accountingAccounts = await res.json();
      renderAccountingAccounts();
    }
  } catch (err) {
    console.error('Failed to fetch accounts:', err);
  }
}

function renderAccountingAccounts() {
  const tbody = document.getElementById('ac-accounts-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('ac-search-accounts')?.value || '').toLowerCase();

  const filtered = accountingAccounts.filter(act => {
    return act.code.includes(searchVal) ||
           act.name.toLowerCase().includes(searchVal) ||
           act.type.toLowerCase().includes(searchVal);
  });

  filtered.forEach(act => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: white;">${escapeHtml(act.code)}</td>
      <td style="font-weight: 600; color: white;">${escapeHtml(act.name)}</td>
      <td style="text-transform: capitalize;">${act.type}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteAccountingRecord = async (type, id) => {
  if (!confirm(`Are you sure you want to delete this record?`)) return;
  try {
    const res = await fetch(`/api/accounting/${type}/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Success', 'Record deleted successfully.', 'success');
      fetchAccountingData();
    } else {
      const err = await res.json();
      showToast('Error', err.error || 'Failed to delete record.', 'danger');
    }
  } catch (e) {
    console.error(e);
    showToast('Error', 'Connection error.', 'danger');
  }
};

function switchAccountingSubtab(subtabId) {
  activeAccountingSubtab = subtabId;

  // Toggle active tab buttons
  document.querySelectorAll('.ac-subtab-btn').forEach(btn => {
    if (btn.getAttribute('data-subtab') === subtabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle visible pane
  document.querySelectorAll('.ac-subpane').forEach(pane => {
    // Map customers/suppliers both to customer pane
    const targetPaneId = (subtabId === 'customers' || subtabId === 'suppliers') ? 'customers' : subtabId;
    if (pane.id === `ac-subpane-${targetPaneId}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  refreshActiveSubtab();
}

async function populateContactSelects() {
  try {
    const res = await fetch('/api/accounting/contacts');
    if (res.ok) {
      const list = await res.json();
      const invCust = document.getElementById('ac-inv-customer');
      const billSupp = document.getElementById('ac-bill-supplier');
      
      if (invCust) invCust.innerHTML = '<option value="">-- Select Customer --</option>';
      if (billSupp) billSupp.innerHTML = '<option value="">-- Select Supplier --</option>';

      list.forEach(c => {
        if (c.type === 'customer' && invCust) {
          invCust.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
        } else if (c.type === 'supplier' && billSupp) {
          billSupp.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
        }
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function populateQuotationContactSelect() {
  try {
    const res = await fetch('/api/accounting/contacts');
    if (res.ok) {
      const list = await res.json();
      const quotCust = document.getElementById('ac-quot-customer');
      if (quotCust) {
        quotCust.innerHTML = '<option value="">-- Select Customer --</option>';
        list.forEach(c => {
          if (c.type === 'customer') {
            quotCust.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
          }
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function populatePaymentSelects() {
  try {
    const targetType = document.getElementById('ac-pay-target-type').value;
    const invGrp = document.getElementById('group-pay-invoice');
    const billGrp = document.getElementById('group-pay-bill');

    if (targetType === 'invoice') {
      if (invGrp) invGrp.style.display = 'block';
      if (billGrp) billGrp.style.display = 'none';
      
      const res = await fetch('/api/accounting/invoices');
      const invoices = await res.json();
      const select = document.getElementById('ac-pay-invoice');
      if (select) {
        select.innerHTML = '<option value="">-- Select Invoice --</option>';
        invoices.forEach(inv => {
          if (inv.balance > 0) {
            select.innerHTML += `<option value="${inv.id}" data-balance="${inv.balance}">${escapeHtml(inv.invoice_number)} - ${escapeHtml(inv.customer_name)} (Bal: ${formatCurrency(inv.balance)})</option>`;
          }
        });
      }
    } else {
      if (invGrp) invGrp.style.display = 'none';
      if (billGrp) billGrp.style.display = 'block';

      const res = await fetch('/api/accounting/bills');
      const bills = await res.json();
      const select = document.getElementById('ac-pay-bill');
      if (select) {
        select.innerHTML = '<option value="">-- Select Bill --</option>';
        bills.forEach(bill => {
          if (bill.balance > 0) {
            select.innerHTML += `<option value="${bill.id}" data-balance="${bill.balance}">${escapeHtml(bill.bill_number)} - ${escapeHtml(bill.supplier_name)} (Bal: ${formatCurrency(bill.balance)})</option>`;
          }
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function initAccountingModule() {
  // Inject new account modal
  const accountModalHtml = `
  <div id="modal-ac-account" class="modal-overlay">
    <div class="modal-card glass" style="background: rgba(15, 23, 42, 0.98); border: 1px solid var(--border-glass); border-radius: 16px; padding: 24px; width: 420px; max-width: 90%;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-glass); padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; color: white;">Create Chart of Account</h3>
        <button type="button" class="btn-close-modal" id="btn-close-ac-account" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer;">&times;</button>
      </div>
      <div class="modal-body">
        <form id="form-ac-new-account">
          <div class="form-group mb-3">
            <label for="ac-act-code">Account Code</label>
            <input type="text" id="ac-act-code" class="form-input" required placeholder="e.g. 1100">
          </div>
          <div class="form-group mb-3">
            <label for="ac-act-name">Account Name</label>
            <input type="text" id="ac-act-name" class="form-input" required placeholder="e.g. Petty Cash">
          </div>
          <div class="form-group mb-4">
            <label for="ac-act-type">Account Type</label>
            <select id="ac-act-type" class="form-input" required>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div class="form-actions-right">
            <button type="button" class="btn btn-secondary" id="btn-cancel-ac-account" style="margin-right: 8px;">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Account</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  `;
  document.body.insertAdjacentHTML('beforeend', accountModalHtml);

  // Setup sub-navigation bar click events
  document.querySelectorAll('.ac-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-subtab');
      switchAccountingSubtab(subtab);
    });
  });

  // Wire search inputs
  const searchInputs = ['ac-search-invoices', 'ac-search-quotations', 'ac-search-bills', 'ac-search-payments', 'ac-search-expenses', 'ac-search-contacts', 'ac-search-items', 'ac-search-accounts'];
  searchInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        refreshActiveSubtab();
      });
    }
  });

  // Filter Invoice status
  const filterInvoiceStatus = document.getElementById('ac-filter-invoice-status');
  if (filterInvoiceStatus) {
    filterInvoiceStatus.addEventListener('change', () => {
      fetchAccountingInvoices();
    });
  }

  // Filter Quotation status
  const filterQuotationStatus = document.getElementById('ac-filter-quotation-status');
  if (filterQuotationStatus) {
    filterQuotationStatus.addEventListener('change', () => {
      fetchAccountingQuotations();
    });
  }

  // Modal open buttons
  document.getElementById('btn-ac-new-quotation')?.addEventListener('click', async () => {
    await populateQuotationContactSelect();
    document.getElementById('ac-quot-number').value = `QT-2026-${(accountingQuotations.length + 1).toString().padStart(3, '0')}`;
    document.getElementById('ac-quot-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ac-quot-expiry-date').value = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    document.getElementById('ac-quot-total').value = '';
    document.getElementById('ac-quot-status').value = 'draft';
    document.getElementById('ac-quot-description').value = '';
    document.getElementById('modal-ac-quotation').classList.add('active');
  });

  document.getElementById('btn-ac-new-invoice')?.addEventListener('click', async () => {
    await populateContactSelects();
    document.getElementById('ac-inv-number').value = `INV-2026-${(accountingInvoices.length + 1).toString().padStart(3, '0')}`;
    document.getElementById('ac-inv-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ac-inv-due-date').value = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    document.getElementById('ac-inv-total').value = '';
    document.getElementById('ac-inv-paid').value = '0.00';
    document.getElementById('modal-ac-invoice').classList.add('active');
  });

  document.getElementById('btn-ac-new-bill')?.addEventListener('click', async () => {
    await populateContactSelects();
    document.getElementById('ac-bill-number').value = `BILL-2026-${(accountingBills.length + 1).toString().padStart(3, '0')}`;
    document.getElementById('ac-bill-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ac-bill-due-date').value = new Date(Date.now() + 14*24*60*60*1000).toISOString().split('T')[0];
    document.getElementById('ac-bill-total').value = '';
    document.getElementById('ac-bill-paid').value = '0.00';
    document.getElementById('modal-ac-bill').classList.add('active');
  });

  document.getElementById('btn-ac-new-payment')?.addEventListener('click', async () => {
    await populatePaymentSelects();
    document.getElementById('ac-pay-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ac-pay-amount').value = '';
    document.getElementById('modal-ac-payment').classList.add('active');
  });

  document.getElementById('btn-ac-new-expense')?.addEventListener('click', () => {
    document.getElementById('ac-exp-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ac-exp-amount').value = '';
    document.getElementById('ac-exp-desc').value = '';
    document.getElementById('modal-ac-expense').classList.add('active');
  });

  document.getElementById('btn-ac-new-contact')?.addEventListener('click', () => {
    document.getElementById('ac-con-name').value = '';
    document.getElementById('ac-con-email').value = '';
    document.getElementById('ac-con-phone').value = '';
    document.getElementById('ac-con-type').value = activeAccountingSubtab === 'suppliers' ? 'supplier' : 'customer';
    document.getElementById('modal-ac-contact').classList.add('active');
  });

  document.getElementById('btn-ac-new-item')?.addEventListener('click', () => {
    document.getElementById('ac-itm-name').value = '';
    document.getElementById('ac-itm-price').value = '';
    document.getElementById('ac-itm-sku').value = '';
    document.getElementById('modal-ac-item').classList.add('active');
  });

  document.getElementById('btn-ac-new-account')?.addEventListener('click', () => {
    document.getElementById('ac-act-code').value = '';
    document.getElementById('ac-act-name').value = '';
    document.getElementById('ac-act-type').value = 'expense';
    document.getElementById('modal-ac-account').classList.add('active');
  });

  // Handle Payment Target Selection Change
  document.getElementById('ac-pay-target-type')?.addEventListener('change', async () => {
    await populatePaymentSelects();
  });

  // Auto populate payment amount on select invoice/bill
  document.getElementById('ac-pay-invoice')?.addEventListener('change', (e) => {
    const selectedOpt = e.target.options[e.target.selectedIndex];
    if (selectedOpt && selectedOpt.dataset.balance) {
      document.getElementById('ac-pay-amount').value = parseFloat(selectedOpt.dataset.balance).toFixed(2);
    }
  });

  document.getElementById('ac-pay-bill')?.addEventListener('change', (e) => {
    const selectedOpt = e.target.options[e.target.selectedIndex];
    if (selectedOpt && selectedOpt.dataset.balance) {
      document.getElementById('ac-pay-amount').value = parseFloat(selectedOpt.dataset.balance).toFixed(2);
    }
  });

  // Close modals buttons
  const modalCloseActions = [
    { btn: 'btn-close-ac-invoice', modal: 'modal-ac-invoice' },
    { btn: 'btn-cancel-ac-invoice', modal: 'modal-ac-invoice' },
    { btn: 'btn-close-ac-quotation', modal: 'modal-ac-quotation' },
    { btn: 'btn-cancel-ac-quotation', modal: 'modal-ac-quotation' },
    { btn: 'btn-close-ac-bill', modal: 'modal-ac-bill' },
    { btn: 'btn-cancel-ac-bill', modal: 'modal-ac-bill' },
    { btn: 'btn-close-ac-payment', modal: 'modal-ac-payment' },
    { btn: 'btn-cancel-ac-payment', modal: 'modal-ac-payment' },
    { btn: 'btn-close-ac-expense', modal: 'modal-ac-expense' },
    { btn: 'btn-cancel-ac-expense', modal: 'modal-ac-expense' },
    { btn: 'btn-close-ac-contact', modal: 'modal-ac-contact' },
    { btn: 'btn-cancel-ac-contact', modal: 'modal-ac-contact' },
    { btn: 'btn-close-ac-item', modal: 'modal-ac-item' },
    { btn: 'btn-cancel-ac-item', modal: 'modal-ac-item' },
    { btn: 'btn-close-ac-account', modal: 'modal-ac-account' },
    { btn: 'btn-cancel-ac-account', modal: 'modal-ac-account' }
  ];

  modalCloseActions.forEach(action => {
    document.getElementById(action.btn)?.addEventListener('click', () => {
      document.getElementById(action.modal).classList.remove('active');
    });
  });

  // Forms submissions
  document.getElementById('form-ac-new-quotation')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const quotation_number = document.getElementById('ac-quot-number').value;
    const contact_id = document.getElementById('ac-quot-customer').value;
    const date = document.getElementById('ac-quot-date').value;
    const expiry_date = document.getElementById('ac-quot-expiry-date').value;
    const total = document.getElementById('ac-quot-total').value;
    const status = document.getElementById('ac-quot-status').value;
    const description = document.getElementById('ac-quot-description').value;

    try {
      const res = await fetch('/api/accounting/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotation_number, contact_id, date, expiry_date, total, status, description })
      });
      if (res.ok) {
        showToast('Success', 'Quotation created successfully.', 'success');
        document.getElementById('modal-ac-quotation').classList.remove('active');
        fetchAccountingData();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to create quotation.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });

  document.getElementById('form-ac-new-invoice')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invoice_number = document.getElementById('ac-inv-number').value;
    const contact_id = document.getElementById('ac-inv-customer').value;
    const date = document.getElementById('ac-inv-date').value;
    const due_date = document.getElementById('ac-inv-due-date').value;
    const total = document.getElementById('ac-inv-total').value;
    const paid = document.getElementById('ac-inv-paid').value;

    const totalVal = parseFloat(total);
    const paidVal = parseFloat(paid);
    let status = 'unpaid';
    if (paidVal >= totalVal) status = 'paid';
    else if (new Date(due_date) < new Date().setHours(0,0,0,0)) status = 'overdue';

    try {
      const res = await fetch('/api/accounting/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_number, contact_id, date, due_date, total, paid, status })
      });
      if (res.ok) {
        showToast('Success', 'Invoice created successfully.', 'success');
        document.getElementById('modal-ac-invoice').classList.remove('active');
        fetchAccountingData();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to create invoice.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });

  document.getElementById('form-ac-new-bill')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bill_number = document.getElementById('ac-bill-number').value;
    const contact_id = document.getElementById('ac-bill-supplier').value;
    const date = document.getElementById('ac-bill-date').value;
    const due_date = document.getElementById('ac-bill-due-date').value;
    const total = document.getElementById('ac-bill-total').value;
    const paid = document.getElementById('ac-bill-paid').value;

    const totalVal = parseFloat(total);
    const paidVal = parseFloat(paid);
    let status = 'unpaid';
    if (paidVal >= totalVal) status = 'paid';
    else if (new Date(due_date) < new Date().setHours(0,0,0,0)) status = 'overdue';

    try {
      const res = await fetch('/api/accounting/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill_number, contact_id, date, due_date, total, paid, status })
      });
      if (res.ok) {
        showToast('Success', 'Purchase bill recorded successfully.', 'success');
        document.getElementById('modal-ac-bill').classList.remove('active');
        fetchAccountingData();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to create bill.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });

  document.getElementById('form-ac-new-payment')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetType = document.getElementById('ac-pay-target-type').value;
    const invoice_id = targetType === 'invoice' ? document.getElementById('ac-pay-invoice').value : null;
    const bill_id = targetType === 'bill' ? document.getElementById('ac-pay-bill').value : null;
    const amount = document.getElementById('ac-pay-amount').value;
    const method = document.getElementById('ac-pay-method').value;
    const date = document.getElementById('ac-pay-date').value;

    if (!invoice_id && !bill_id) {
      showToast('Error', 'Please select a valid invoice or purchase bill.', 'danger');
      return;
    }

    try {
      const res = await fetch('/api/accounting/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id, bill_id, amount, date, method })
      });
      if (res.ok) {
        showToast('Success', 'Payment transaction recorded.', 'success');
        document.getElementById('modal-ac-payment').classList.remove('active');
        fetchAccountingData();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to record payment.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });

  document.getElementById('form-ac-new-expense')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('ac-exp-category').value;
    const amount = document.getElementById('ac-exp-amount').value;
    const date = document.getElementById('ac-exp-date').value;
    const description = document.getElementById('ac-exp-desc').value;

    try {
      const res = await fetch('/api/accounting/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, amount, date, description })
      });
      if (res.ok) {
        showToast('Success', 'Operating expense recorded.', 'success');
        document.getElementById('modal-ac-expense').classList.remove('active');
        fetchAccountingData();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to record expense.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });

  document.getElementById('form-ac-new-contact')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('ac-con-name').value;
    const type = document.getElementById('ac-con-type').value;
    const email = document.getElementById('ac-con-email').value;
    const phone = document.getElementById('ac-con-phone').value;

    try {
      const res = await fetch('/api/accounting/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, email, phone })
      });
      if (res.ok) {
        showToast('Success', 'Accounting contact created.', 'success');
        document.getElementById('modal-ac-contact').classList.remove('active');
        refreshActiveSubtab();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to create contact.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });

  document.getElementById('form-ac-new-item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('ac-itm-name').value;
    const price = document.getElementById('ac-itm-price').value;
    const sku = document.getElementById('ac-itm-sku').value;

    try {
      const res = await fetch('/api/accounting/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, sku })
      });
      if (res.ok) {
        showToast('Success', 'Product/service registered.', 'success');
        document.getElementById('modal-ac-item').classList.remove('active');
        refreshActiveSubtab();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to register item.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });

  document.getElementById('form-ac-new-account')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('ac-act-code').value;
    const name = document.getElementById('ac-act-name').value;
    const type = document.getElementById('ac-act-type').value;

    try {
      const res = await fetch('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, type })
      });
      if (res.ok) {
        showToast('Success', 'Chart of Account created.', 'success');
        document.getElementById('modal-ac-account').classList.remove('active');
        refreshActiveSubtab();
      } else {
        const err = await res.json();
        showToast('Error', err.error || 'Failed to create account.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Error', 'Connection error.', 'danger');
    }
  });
}

// Global reference for switchTab or websocket notifications
window.fetchAccountingData = fetchAccountingData;

// Initialize on script load
setTimeout(() => {
  initAccountingModule();
  initServicesModule();
}, 600);

// =============================================================
// SERVICES & PRICING CATALOG MANAGER
// =============================================================
let servicesList = [];

async function fetchServicesCatalog() {
  try {
    const res = await fetch('/api/services');
    if (!res.ok) throw new Error('Failed to fetch services.');
    servicesList = await res.json();
    renderServicesTable();
  } catch (err) {
    console.error(err);
    showToast('Load Error', 'Failed to retrieve services catalog.', 'danger');
  }
}
window.fetchServicesCatalog = fetchServicesCatalog;

function renderServicesTable() {
  const tbody = document.getElementById('services-list-tbody');
  const emptyState = document.getElementById('services-empty-state');
  const table = document.getElementById('table-services-catalog');
  
  if (tbody) {
    tbody.innerHTML = '';
    
    if (servicesList.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (table) table.style.display = 'none';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (table) table.style.display = 'table';
      
      servicesList.forEach(svc => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-glass)';
        tr.innerHTML = `
          <td style="padding: 12px 10px; font-weight: 500; color: white;">${escapeHtml(svc.name)}</td>
          <td style="padding: 12px 10px; color: var(--color-primary); font-weight: 600;">$${parseFloat(svc.price).toFixed(2)}</td>
          <td style="padding: 12px 10px; color: var(--text-muted);"><span class="badge" style="background: rgba(6,182,212,0.1); color: var(--color-primary);">${svc.duration} mins</span></td>
          <td style="padding: 12px 10px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(svc.description || '-')}</td>
          <td style="padding: 12px 10px; text-align: center;">
            <button class="btn btn-secondary btn-delete-service" data-id="${svc.id}" style="padding: 4px 8px; font-size: 0.75rem; border-color: rgba(239, 68, 68, 0.3); color: #ef4444;">
              <i data-lucide="trash-2" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;"></i> Delete
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      
      tbody.querySelectorAll('.btn-delete-service').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await deleteWizardServiceRow(id);
        });
      });
    }
  }

  // Update spreadsheet view
  renderSpreadsheetCatalog();
  initIcons();
}

function renderSpreadsheetCatalog() {
  const tbody = document.getElementById('spreadsheet-services-tbody');
  const emptyState = document.getElementById('spreadsheet-empty-state');
  
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (servicesList.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  
  servicesList.forEach(svc => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-glass)';
    tr.setAttribute('data-id', svc.id);
    tr.innerHTML = `
      <td style="padding: 6px;"><input type="text" class="spreadsheet-input svc-name" value="${escapeHtml(svc.name)}" placeholder="Service Name" style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
      <td style="padding: 6px;"><input type="number" class="spreadsheet-input svc-price" value="${parseFloat(svc.price).toFixed(2)}" placeholder="0.00" step="0.01" style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
      <td style="padding: 6px;"><input type="number" class="spreadsheet-input svc-duration" value="${svc.duration}" placeholder="30" style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
      <td style="padding: 6px;"><input type="text" class="spreadsheet-input svc-description" value="${escapeHtml(svc.description || '')}" placeholder="Details..." style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
      <td style="padding: 6px; text-align: center;">
        <button type="button" class="btn-delete-row" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px;">
          <i data-lucide="trash-2" style="width: 14px; height: 14px; vertical-align: middle;"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
    
    // Auto-save on blur/change
    const inputs = tr.querySelectorAll('.spreadsheet-input');
    inputs.forEach(input => {
      input.addEventListener('change', () => autoSaveWizardServiceRow(tr));
    });
    
    // Bind delete row
    tr.querySelector('.btn-delete-row').addEventListener('click', () => {
      deleteWizardServiceRow(svc.id);
    });
  });
}

async function autoSaveWizardServiceRow(tr) {
  const id = tr.getAttribute('data-id');
  const name = tr.querySelector('.svc-name').value.trim();
  const price = parseFloat(tr.querySelector('.svc-price').value) || 0;
  const duration = parseInt(tr.querySelector('.svc-duration').value) || 30;
  const description = tr.querySelector('.svc-description').value.trim();
  
  if (!name) return; // Required
  
  try {
    if (id && id !== 'new') {
      const res = await fetch(`/api/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, duration, description })
      });
      if (res.ok) {
        showToast('Service Updated', `Successfully updated "${name}"`, 'success');
      } else {
        showToast('Update Failed', 'Could not save changes.', 'danger');
      }
    } else {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, duration, description })
      });
      if (res.ok) {
        const data = await res.json();
        tr.setAttribute('data-id', data.id);
        showToast('Service Added', `Successfully added "${name}"`, 'success');
        await fetchServicesCatalog();
      } else {
        showToast('Save Failed', 'Could not create service.', 'danger');
      }
    }
  } catch (err) {
    console.error(err);
    showToast('Save Error', 'Connection failed.', 'danger');
  }
}

async function deleteWizardServiceRow(id) {
  if (!id || id === 'new') {
    fetchServicesCatalog();
    return;
  }
  if (confirm('Are you sure you want to delete this service?')) {
    try {
      const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Service Deleted', 'Service removed from catalog.', 'success');
        fetchServicesCatalog();
      } else {
        showToast('Delete Failed', 'Failed to remove service.', 'danger');
      }
    } catch (e) {
      console.error(e);
      showToast('Error', 'Connection error.', 'danger');
    }
  }
}

function addBlankWizardServiceRow() {
  const tbody = document.getElementById('spreadsheet-services-tbody');
  const emptyState = document.getElementById('spreadsheet-empty-state');
  if (!tbody) return;
  
  if (emptyState) emptyState.style.display = 'none';
  
  const tr = document.createElement('tr');
  tr.style.borderBottom = '1px solid var(--border-glass)';
  tr.setAttribute('data-id', 'new');
  tr.innerHTML = `
    <td style="padding: 6px;"><input type="text" class="spreadsheet-input svc-name" value="" placeholder="Service Name" style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
    <td style="padding: 6px;"><input type="number" class="spreadsheet-input svc-price" value="" placeholder="0.00" step="0.01" style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
    <td style="padding: 6px;"><input type="number" class="spreadsheet-input svc-duration" value="" placeholder="30" style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
    <td style="padding: 6px;"><input type="text" class="spreadsheet-input svc-description" value="" placeholder="Details..." style="background: transparent; border: none; color: white; width: 100%; padding: 6px; font-family: inherit; font-size: 0.8rem;"></td>
    <td style="padding: 6px; text-align: center;">
      <button type="button" class="btn-delete-row" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px;">
        <i data-lucide="trash-2" style="width: 14px; height: 14px; vertical-align: middle;"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  
  const firstInput = tr.querySelector('.svc-name');
  if (firstInput) firstInput.focus();
  
  const inputs = tr.querySelectorAll('.spreadsheet-input');
  inputs.forEach(input => {
    input.addEventListener('change', () => autoSaveWizardServiceRow(tr));
  });
  
  tr.querySelector('.btn-delete-row').addEventListener('click', () => {
    tr.remove();
    if (tbody.children.length === 0 && emptyState) {
      emptyState.style.display = 'block';
    }
  });
  
  initIcons();
}

function initServicesModule() {
  const btnOpen = document.getElementById('btn-open-add-service');
  const btnClose = document.getElementById('btn-close-service-modal');
  const btnCancel = document.getElementById('btn-cancel-service');
  const modal = document.getElementById('modal-service');
  const form = document.getElementById('form-add-service');
  
  // Modal toggle
  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      form.reset();
      modal.classList.add('active');
    });
  }
  
  const closeModal = () => {
    if (modal) modal.classList.remove('active');
  };
  
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  
  // Submit single service form
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('service-name').value.trim();
      const price = parseFloat(document.getElementById('service-price').value);
      const duration = parseInt(document.getElementById('service-duration').value);
      const description = document.getElementById('service-description').value.trim();
      
      try {
        const res = await fetch('/api/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, price, duration, description })
        });
        if (res.ok) {
          showToast('Service Added', 'Service successfully registered in catalog.', 'success');
          closeModal();
          fetchServicesCatalog();
        } else {
          const err = await res.json();
          showToast('Error', err.error || 'Failed to register service.', 'danger');
        }
      } catch (err) {
        console.error(err);
        showToast('Error', 'Connection error.', 'danger');
      }
    });
  }
  
  // Upload and Drag & Drop file imports using SheetJS
  const dropZone = document.getElementById('services-drop-zone');
  const fileInput = document.getElementById('services-file-input');
  
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    // Highlight drop zone
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--color-primary)';
        dropZone.style.background = 'rgba(6, 182, 212, 0.1)';
      }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(6, 182, 212, 0.3)';
        dropZone.style.background = 'rgba(0,0,0,0.15)';
      }, false);
    });
    
    // Handle file drop
    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length) handleServicesFile(files[0]);
    });
    
    // Handle file select
    fileInput.addEventListener('change', (e) => {
      if (fileInput.files.length) handleServicesFile(fileInput.files[0]);
    });
  }
  
  // Initialize Wizard Services Catalog Spreadsheet
  initWizardServicesCatalog();
}

function initWizardServicesCatalog() {
  const toggleBtn = document.getElementById('btn-toggle-services-catalog');
  const collapsible = document.getElementById('services-catalog-collapsible');
  
  if (toggleBtn && collapsible) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = collapsible.style.display === 'none';
      if (isHidden) {
        collapsible.style.display = 'block';
        toggleBtn.innerHTML = '<i data-lucide="chevron-up" style="width: 14px; height: 14px;"></i> Collapse Catalog';
      } else {
        collapsible.style.display = 'none';
        toggleBtn.innerHTML = '<i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i> Expand Catalog';
      }
      initIcons();
    });
  }
  
  const addRowBtn = document.getElementById('btn-wizard-add-service-row');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', addBlankWizardServiceRow);
  }
  
  // Bind wizard upload zone
  const dropZone = document.getElementById('wizard-services-drop-zone');
  const fileInput = document.getElementById('wizard-services-file-input');
  
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--color-primary)';
        dropZone.style.background = 'rgba(16, 185, 129, 0.1)';
      }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        dropZone.style.background = 'rgba(16, 185, 129, 0.03)';
      }, false);
    });
    
    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length) handleServicesFile(files[0]);
    });
    
    fileInput.addEventListener('change', (e) => {
      if (fileInput.files.length) handleServicesFile(fileInput.files[0]);
    });
  }
}

function handleServicesFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);
      
      if (!json || json.length === 0) {
        showToast('Parse Error', 'The uploaded file is empty.', 'danger');
        return;
      }
      
      // Map columns dynamically and normalize headers
      const services = json.map(row => {
        // Find keys case-insensitively
        const keys = Object.keys(row);
        const nameKey = keys.find(k => k.toLowerCase() === 'name');
        const priceKey = keys.find(k => k.toLowerCase() === 'price');
        const durationKey = keys.find(k => k.toLowerCase() === 'duration');
        const descKey = keys.find(k => k.toLowerCase() === 'description');
        
        return {
          name: row[nameKey] ? String(row[nameKey]).trim() : 'Unnamed Service',
          price: row[priceKey] ? parseFloat(row[priceKey]) || 0 : 0,
          duration: row[durationKey] ? parseInt(row[durationKey]) || 30 : 30,
          description: row[descKey] ? String(row[descKey]).trim() : ''
        };
      }).filter(s => s.name !== 'Unnamed Service');
      
      if (services.length === 0) {
        showToast('Upload Failed', 'No valid services found. Check column headers.', 'danger');
        return;
      }
      
      // Upload bulk JSON array to backend
      const res = await fetch('/api/services/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(services)
      });
      
      if (res.ok) {
        showToast('Catalog Imported', `Successfully imported ${services.length} services.`, 'success');
        fetchServicesCatalog();
      } else {
        showToast('Import Failed', 'Failed to register imported services.', 'danger');
      }
    } catch (err) {
      console.error(err);
      showToast('Parse Error', 'Failed to read file as Excel/CSV.', 'danger');
    }
  };
  reader.readAsArrayBuffer(file);
}

// =============================================================
// OWNER IMPERSONATION / REMOTE SETTINGS ACCESS
// =============================================================
// Store impersonation state globally
window.impersonateTenantId = null;
let impersonateTenantName = null;

window.remoteManageTenantSettings = function(tenantId, companyName) {
  window.impersonateTenantId = tenantId;
  impersonateTenantName = companyName;
  
  // Show impersonation banner
  const banner = document.getElementById('impersonation-banner');
  const label = document.getElementById('impersonate-tenant-name-label');
  if (banner && label) {
    label.textContent = companyName;
    banner.style.display = 'flex';
  }
  
  showToast('Impersonation Active', `Remote managing settings for ${companyName}.`, 'warning');
  
  // Switch to the Settings tab to see this tenant's settings
  switchTab('settings');
};

window.exitImpersonationMode = function() {
  window.impersonateTenantId = null;
  impersonateTenantName = null;
  
  // Hide impersonation banner
  const banner = document.getElementById('impersonation-banner');
  if (banner) banner.style.display = 'none';
  
  showToast('Impersonation Exit', `Returned to administrative dashboard.`, 'success');
  
  // Re-switch to the Admin Console pane
  switchTab('admin');
};


