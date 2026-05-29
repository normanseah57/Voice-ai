const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('public/index.html', 'utf-8');
const js = fs.readFileSync('public/app.js', 'utf-8');

const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/" });
const window = dom.window;

window.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; }
};

window.lucide = { createIcons: () => {} };
window.fetch = async () => ({ ok: true, json: async () => ({}) });

try {
  window.eval(js);
  
  // Simulate login
  window.document.getElementById('login-email').value = 'test@test.com';
  window.document.getElementById('login-password').value = 'password';
  
  // Mock the API response
  window.fetch = async (url, options) => {
    if (url === '/api/auth/login') {
      return {
        ok: true,
        json: async () => ({
          success: true,
          token: 'token123',
          tenant: { id: 't1', company_name: 'Test Co' }
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const form = window.document.getElementById('form-saas-login');
  const submitEvent = new window.Event('submit', { bubbles: true, cancelable: true });
  
  // Override preventDefault to prevent JSDOM warnings
  submitEvent.preventDefault = () => {};
  
  form.dispatchEvent(submitEvent);
  
  setTimeout(() => {
    console.log("landing-page-container display:", window.document.getElementById('landing-page-container').style.display);
    console.log("app-container display:", window.document.getElementById('app-container').style.display);
    
    // Check main-content dimensions/visibility
    const mainContent = window.document.querySelector('.main-content');
    console.log("main-content exists:", !!mainContent);
    
    const overviewPane = window.document.getElementById('pane-overview');
    console.log("overview pane active class:", overviewPane.classList.contains('active'));
    console.log("overview pane display (inline):", overviewPane.style.display);
  }, 1000);
  
} catch (e) {
  console.error("Runtime error:", e);
}
