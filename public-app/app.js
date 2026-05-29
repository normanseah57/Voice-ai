// Mobile Web App Controller

let saasToken = localStorage.getItem('saas_token');
let currentTenant = null;
let dashboardSocket = null;

try {
  currentTenant = JSON.parse(localStorage.getItem('current_tenant'));
} catch (e) {
  currentTenant = null;
}

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
  }
  
  const response = await originalFetch(url, options);
  if (response.status === 401) {
    logout();
  }
  return response;
};

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Icons
  if (window.lucide) window.lucide.createIcons();

  // Screen Routing
  if (saasToken && currentTenant) {
    initApp();
  } else {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('main-app').classList.remove('active');
  }

  // Login Form Handler
  const loginForm = document.getElementById('mobile-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errorText = document.getElementById('login-error');
      
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
          initApp();
        } else {
          errorText.textContent = data.error || 'Login failed. Check your credentials.';
        }
      } catch (err) {
        errorText.textContent = 'Error connecting to authentication service.';
      }
    });
  }

  // Logout Handler
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', logout);
  }

  // Bottom Navigation Routing
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-target');
      
      // Update nav states
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      // Update tab panes
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      document.getElementById(targetId).classList.add('active');
      
      if (targetId === 'tab-overview') fetchOverviewData();
    });
  });
});

function initApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('main-app').classList.add('active');
  
  const companyNameEl = document.getElementById('header-company-name');
  if (companyNameEl && currentTenant) {
    companyNameEl.textContent = currentTenant.company_name || 'My Workspace';
  }

  fetchOverviewData();
  connectWebSocket();
}

async function fetchOverviewData() {
  try {
    const res = await fetch('/api/dashboard/metrics');
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    
    document.getElementById('metric-active-calls').textContent = data.activeCalls || 0;
    document.getElementById('metric-total-calls').textContent = data.totalCalls || 0;
    document.getElementById('metric-appointments').textContent = data.totalAppointments || 0;
  } catch (err) {
    console.error('Failed to fetch mobile overview data:', err);
  }
}

function connectWebSocket() {
  if (!saasToken) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/dashboard-ws?token=${encodeURIComponent(saasToken)}`;
  
  dashboardSocket = new WebSocket(wsUrl);
  const statusDot = document.getElementById('ws-status-dot');

  dashboardSocket.onopen = () => {
    if (statusDot) statusDot.classList.add('green');
    fetchOverviewData(); // Refresh data on reconnect
  };

  dashboardSocket.onclose = () => {
    if (statusDot) statusDot.classList.remove('green');
    setTimeout(connectWebSocket, 3000); // Reconnect loop
  };

  dashboardSocket.onmessage = (message) => {
    try {
      const payload = JSON.parse(message.data);
      if (payload.event === 'metrics_update') fetchOverviewData();
      if (payload.event === 'refresh_appointments') fetchOverviewData();
    } catch (e) {
      console.error('Mobile WS parse error:', e);
    }
  };
}

function logout() {
  localStorage.removeItem('saas_token');
  localStorage.removeItem('current_tenant');
  saasToken = null;
  currentTenant = null;
  if (dashboardSocket) dashboardSocket.close();
  
  // Clean up UI
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('main-app').classList.remove('active');
  document.getElementById('login-screen').classList.add('active');
}
