// VoiceDesk Landing Page — Standalone JS
// Handles: login, signup, 2FA, Google OAuth, invite acceptance, ROI, demo player, and footer modals
// After auth: redirects to /app (does NOT load the dashboard)

'use strict';

// ── Auth state ──
let saasToken = localStorage.getItem('saas_token');
let currentTenant = null;
let pending2FATempToken = null;
window.activeInviteToken = null;

// ── Helpers ──
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

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

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
  } else if (type === 'danger' || type === 'error') {
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

// ── Auth modal exposure ──
window.openAuthModal = function(mode) {
  const modal = document.getElementById('saas-auth-modal');
  if (modal) {
    if (modal.parentNode !== document.body) {
      document.body.appendChild(modal);
    }
    modal.classList.add('active');
  }
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
  const formInvite = document.getElementById('auth-invite-step');
  const authTabs = document.querySelector('.auth-tabs');
  const step2fa = document.getElementById('auth-2fa-step');
  const stepForgot = document.getElementById('auth-forgot-step');
  
  if (mode === 'invite') {
    if (authTabs) authTabs.style.display = 'none';
    if (formLogin) formLogin.style.display = 'none';
    if (formReg) formReg.style.display = 'none';
    if (step2fa) step2fa.style.display = 'none';
    if (stepForgot) stepForgot.style.display = 'none';
    if (formInvite) formInvite.style.display = 'block';
    if (modalTitle) modalTitle.textContent = 'Accept Workspace Invitation';
  } else {
    if (authTabs) authTabs.style.display = 'flex';
    if (formInvite) formInvite.style.display = 'none';
    
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
  }
};

// ── Authentication Success Redirect ──
function onAuthSuccess(token, tenant) {
  localStorage.setItem('saas_token', token);
  localStorage.setItem('current_tenant', JSON.stringify(tenant));
  window.location.href = '/app';
}

// ── Request Demo picker modal exposure ──
window.openRequestDemoModal = function() {
  const modal = document.getElementById('request-demo-modal');
  if (modal) {
    modal.classList.add('active');
    initIcons();
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

// ── Simulated telephone audio call demo ──
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

const demoDialogueTimings = {
  dental: [0, 8.5, 15.3, 27.1, 29.9, 36.0, 41.8],
  plumber: [0, 8.4, 16.4, 33.3, 37.4, 42.2, 47.3],
  realestate: [0, 8.4, 16.9, 27.8, 30.8, 38.3, 45.3],
  restaurant: [0, 9.2, 16.4, 26.2, 28.8, 34.8, 40.0],
  hotel: [0, 7.4, 15.7, 24.7, 29.0, 36.2, 38.0, 44.5, 51.4]
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
    initIcons();
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
  
  const pills = document.querySelectorAll('#demo-industry-pills button');
  pills.forEach(pill => {
    if (pill.getAttribute('data-industry') === industry) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  const lines = demoDialogues[industry];
  const charCount = lines.reduce((acc, l) => acc + l.text.length, 0);
  demoTimeTotal = Math.ceil(charCount / 14) + Math.ceil(lines.length * 1.5);
  
  document.getElementById('demo-time-elapsed').textContent = '0:00';
  document.getElementById('demo-time-total').textContent = `${Math.floor(demoTimeTotal / 60)}:${String(demoTimeTotal % 60).padStart(2, '0')}`;
  document.getElementById('demo-progress-bar').style.width = '0%';
  
  const box = document.getElementById('demo-transcript-box');
  box.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;" id="demo-transcript-empty">
      Ready to start call demo. Click Play below to listen.
    </div>
  `;
  demoLineIndex = -1;
  demoTimeElapsed = 0;
};

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
  
  const box = document.getElementById('demo-transcript-box');
  box.innerHTML = '';
  
  playPhoneRingRing(async () => {
    if (!isDemoPlaying) return;
    document.getElementById('demo-status-dot').style.backgroundColor = '#10b981';
    document.getElementById('demo-status-dot').textContent = 'CONNECTED';
    
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
      demoLineIndex = -1;
      
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
  const videoEl = document.getElementById('demo-avatar-video');
  if (videoEl) videoEl.style.display = 'none';
  document.getElementById('demo-waveform').style.display = 'flex';
  
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
  
  const statusDot = document.getElementById('demo-status-dot');
  if (statusDot) {
    statusDot.style.backgroundColor = '#ef4444';
    statusDot.textContent = 'DISCONNECTED';
  }

  const videoEl = document.getElementById('demo-avatar-video');
  if (videoEl) {
    videoEl.pause();
    videoEl.style.display = 'none';
  }

  if (demoAudioEl) {
    try {
      demoAudioEl.pause();
    } catch (e) {}
    demoAudioEl = null;
  }

  if (demoTimerInterval) {
    clearInterval(demoTimerInterval);
    demoTimerInterval = null;
  }
  if (demoSpeechTimeout) {
    clearTimeout(demoSpeechTimeout);
    demoSpeechTimeout = null;
  }
  
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  
  stopDemoWaveform();

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
    initIcons();
  }
}

function playPhoneRingRing(callback) {
  try {
    demoAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
  
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    
    demoSpeechUtterance = new SpeechSynthesisUtterance(line.text);
    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    
    if (line.speaker === 'agent') {
      const priorityList = [
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-sg') && v.name.toLowerCase().includes('female') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online') || v.name.toLowerCase().includes('google')),
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-sg') && v.name.toLowerCase().includes('female'),
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-sg'),
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-my') && v.name.toLowerCase().includes('female') && (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online') || v.name.toLowerCase().includes('google')),
        v => v.lang.toLowerCase().replace('_', '-').startsWith('en-my'),
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
      demoSpeechUtterance.rate = 1.05;
      demoSpeechUtterance.pitch = 1.15;
    } else {
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
      demoSpeechUtterance.rate = 0.88;
      demoSpeechUtterance.pitch = 0.82;
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

// ── Footer modal content data ──
const footerContent = {
  documentation: `
    <h4 style="color: white; margin-top: 0; font-size: 1.25rem; margin-bottom: 12px; border-bottom: 1px solid var(--border-glass); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 1.5rem;">📖</span> VoiceDesk Technical & User Documentation
    </h4>
    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">
      Welcome to the official VoiceDesk Guide. This guide details every feature, scheduling mechanism, and test sandboxing flow.
    </p>
    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
      <strong style="color: white; font-size: 0.85rem; display: block; margin-bottom: 8px;">📖 Table of Contents:</strong>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; font-size: 0.8rem;">
        <a href="#doc-overview" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">📈 1. Overview Dashboard</a>
        <a href="#doc-voice" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🗣️ 2. AI Voice & Accents</a>
        <a href="#doc-sandbox" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🧪 3. WebRTC Browser Sandbox</a>
        <a href="#doc-scheduling" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🗓️ 4. Scheduling Engines</a>
        <a href="#doc-crm" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">🗂️ 5. CRM Pipeline & Copilot</a>
        <a href="#doc-billing" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">💳 6. Billing & Overage Blocks</a>
        <a href="#doc-mobile" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">📱 7. Mobile Simulator & Wi-Fi</a>
        <a href="#doc-whatsapp" style="color: var(--color-primary); text-decoration: none; display: flex; align-items: center; gap: 4px;">💬 8. WhatsApp Callback Bridge</a>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 24px; margin-top: 15px; text-align: left; font-size: 0.85rem; line-height: 1.5; color: var(--text-muted);">
      <div id="doc-overview">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">📈 1. Overview Dashboard</h5>
        <p>Operational nerve center showing minutes consumed, CRM size, and a real-time activity stream feed.</p>
      </div>
      <div id="doc-voice">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">🗣️ 2. AI Voice Accents</h5>
        <p>Configure instructions, templates (Spa, Medical, Hotel), and regional accents (English, Singlish, Chinglish, Manglish).</p>
      </div>
      <div id="doc-sandbox">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">🧪 3. WebRTC Browser Sandbox</h5>
        <p>Talk directly to the AI receptionist via your microphone on the browser for free to test prompts before going live.</p>
      </div>
      <div id="doc-scheduling">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">🗓️ 4. Core Scheduling Engines</h5>
        <p>Supports Clinic/Service Mode ( therapist bookings with buffer gaps), Restaurant Mode ( table capacity allocation), and Hotel Mode ( check-ins and check-outs management).</p>
      </div>
      <div id="doc-crm">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">🗂️ 5. CRM Pipeline & Hubie Copilot</h5>
        <p>Tracks caller information inside a contact database, shows opportunities on a Kanban deals board, and lets you run commands via Hubie terminal.</p>
      </div>
      <div id="doc-billing">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">💳 6. Billing & Overage Blocks</h5>
        <p>Quota allowance topped up automatically with prepaid overage minutes billed at $0.35/min. Set warning thresholds to receive alerts.</p>
      </div>
      <div id="doc-mobile">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">📱 7. Mobile Simulator</h5>
        <p>Provides a device mockup container on screen and a QR code generator to scan and pair your physical touchscreens over local Wi-Fi.</p>
      </div>
      <div id="doc-whatsapp">
        <h5 style="color: white; font-size: 1rem; margin: 0 0 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">💬 8. WhatsApp Callback Bridge</h5>
        <p>Integrates with Twilio incoming WhatsApp messages to reply instantly and launch an automated outbound callback voice connection.</p>
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
    <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 15px; text-align: left;">
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: What is VoiceDesk?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">VoiceDesk is a SaaS application that deploys low-latency voice AI agents to answer customer phone calls, query/schedule calendar resources, and track sales pipeline deals in an integrated visual CRM.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: How does the AI receptionist handle different accents or languages?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">VoiceDesk supports English, Mandarin, and localized accents (such as Singlish, Manglish, or Chinglish). You can select your preferred agent accent inside settings.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: Can I set up separate scheduling constraints for different staff?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">Yes! Administrators can configure working hours, rest breaks, and buffer gaps globally, or customize them separately for individual team members under the Staff Calendar settings.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: What are overage minutes and how does prepaid billing work?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">Paid plans (Starter, Pro) carry monthly minute allocations. If exhausted, operations consume prepaid overage minutes at $0.35/min. You can buy overage minutes upfront in blocks of 100 ($35.00/block).</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: How are WhatsApp voice callbacks triggered?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">When a customer sends a WhatsApp message to your workspace's Twilio number, VoiceDesk replies confirming receipt and triggers outbound voice call bridging the customer with your AI receptionist.</p>
      </div>
      <div>
        <strong style="color: white; display: block; font-size: 0.95rem; margin-bottom: 4px;">Q: Is my client database secure?</strong>
        <p style="margin: 0; font-size: 0.85rem; line-height: 1.5;">Absolutely. VoiceDesk runs an isolated SQLite database schema for every tenant, preventing data leaks or cross-tenant visibility.</p>
      </div>
    </div>
  `,
  howtostart: `
    <h4 style="color: white; margin-top: 0; font-size: 1.25rem; margin-bottom: 12px; border-bottom: 1px solid var(--border-glass); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 1.5rem;">🚀</span> Getting Started with VoiceDesk
    </h4>
    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.5;">
      Welcome to VoiceDesk! This step-by-step guide is designed to take you from a brand-new registration to a fully automated AI receptionist desk and CRM pipeline.
    </p>
    <div style="display: flex; flex-direction: column; gap: 24px; margin-top: 15px; text-align: left; font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">
      <div>
        <strong style="color: white; display: block; margin-bottom: 4px;">1. Sign Up & Tenant Creation</strong>
        <p>Click Get Started to register with your email, password, and business name. We instantly initialize a dedicated schema for your workspace.</p>
      </div>
      <div>
        <strong style="color: white; display: block; margin-bottom: 4px;">2. Set Your Scheduling Engine Mode</strong>
        <p>In settings, select the mode that matches your business: Clinic/Service, Restaurant, or Hotel.</p>
      </div>
      <div>
        <strong style="color: white; display: block; margin-bottom: 4px;">3. Set Up Availability, Breaks & Resources</strong>
        <p>Configure operational hours, lunch breaks, and buffer gaps, and add your active resources (staff, tables, or rooms).</p>
      </div>
      <div>
        <strong style="color: white; display: block; margin-bottom: 4px;">4. Customize Prompt & Accent Presets</strong>
        <p>Tune the voice agent's core instructions using persona settings. Select localized accents like Singlish or Manglish.</p>
      </div>
      <div>
        <strong style="color: white; display: block; margin-bottom: 4px;">5. Verify in Sandbox</strong>
        <p>Go to Live Call, click Test in Browser, and grant mic permission to test your setup with zero quota usage.</p>
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
    initIcons();
  }
};

window.closeFooterModal = function() {
  const modal = document.getElementById('footer-info-modal');
  if (modal) modal.classList.remove('active');
};

// ── ROI Calculator ──
window.updateROICalculator = function() {
  const callsInput = document.getElementById('roi-calls');
  const valueInput = document.getElementById('roi-value');
  if (!callsInput || !valueInput) return;

  const callsCount = parseInt(callsInput.value);
  const bookingValue = parseInt(valueInput.value);

  document.getElementById('roi-calls-val').textContent = `${callsCount.toLocaleString()} calls`;
  document.getElementById('roi-value-val').textContent = `S$${bookingValue}`;

  const missedCalls = Math.round(callsCount * 0.28);
  const lostBookings = Math.round(missedCalls * 0.85);
  const yearlyLoss = lostBookings * bookingValue * 12;
  const hoursReclaimed = Math.round((callsCount * 5 / 60) * 10) / 10;

  let monthlyCost = 99;
  if (callsCount > 100 && callsCount <= 1000) {
    monthlyCost = 999;
  } else if (callsCount > 1000) {
    monthlyCost = 2500;
  }
  const yearlyCost = monthlyCost * 12;
  const recoveredRevenue = yearlyLoss;
  const netProfit = Math.max(0, recoveredRevenue - yearlyCost);

  document.getElementById('roi-loss-bar-text').textContent = `S$${yearlyLoss.toLocaleString()}`;
  document.getElementById('roi-recovered-bar-text').textContent = `S$${netProfit.toLocaleString()}`;
  document.getElementById('roi-vd-cost-text').textContent = `S$${yearlyCost.toLocaleString()}`;

  const hoursText = document.getElementById('roi-hours-text');
  if (hoursText) hoursText.textContent = `${hoursReclaimed}h`;
  
  const hoursCircle = document.getElementById('roi-hours-circle');
  if (hoursCircle) {
    const hoursPct = Math.min(100, Math.round((hoursReclaimed / 200) * 100));
    hoursCircle.style.strokeDashoffset = 188.4 - (188.4 * hoursPct) / 100;
  }

  const profitRatio = yearlyLoss > 0 ? (netProfit / yearlyLoss) * 100 : 0;
  const recoveredBar = document.getElementById('roi-recovered-bar');
  if (recoveredBar) {
    recoveredBar.style.width = `${Math.max(5, profitRatio)}%`;
  }
};

// ── Pricing interactions ──
function setupPricingInteractions() {
  window.setBillingCycle = function(cycle) {
    const btnMonthly = document.getElementById('toggle-monthly');
    const btnYearly  = document.getElementById('toggle-yearly');
    const callout = document.getElementById('annual-savings-callout');
    const starterPrice = document.getElementById('landing-price-starter');
    const professionalPrice = document.getElementById('landing-price-professional');
    
    if (cycle === 'annual') {
      if (btnMonthly) btnMonthly.classList.remove('active');
      if (btnYearly) btnYearly.classList.add('active');
      if (callout) callout.style.display = 'block';
      if (starterPrice) starterPrice.innerHTML = '$79<span style="font-size: 0.85rem; font-weight: 400; color: #94a3b8;">/mo</span>';
      if (professionalPrice) professionalPrice.innerHTML = '$799<span style="font-size: 0.85rem; font-weight: 400; color: #94a3b8;">/mo</span>';
    } else {
      if (btnMonthly) btnMonthly.classList.add('active');
      if (btnYearly) btnYearly.classList.remove('active');
      if (callout) callout.style.display = 'none';
      if (starterPrice) starterPrice.innerHTML = '$99<span style="font-size: 0.85rem; font-weight: 400; color: #94a3b8;">/mo</span>';
      if (professionalPrice) professionalPrice.innerHTML = '$999<span style="font-size: 0.85rem; font-weight: 400; color: #94a3b8;">/mo</span>';
    }
  };
}

// ── DOM Initialization ──
document.addEventListener('DOMContentLoaded', () => {
  if (saasToken) {
    window.location.href = '/app';
    return;
  }
  
  if (typeof window._appReady === 'function') window._appReady();
  
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref') || urlParams.get('referral');
  if (refCode) {
    localStorage.setItem('referred_by', refCode.trim());
  }
  const inviteToken = urlParams.get('invite_token');
  if (inviteToken) {
    window.activeInviteToken = inviteToken;
    setTimeout(() => window.showInviteAcceptStep(inviteToken), 500);
  }
  
  fetch('/api/demo-number')
    .then(r => r.json())
    .then(data => {
      if (data && data.number) {
        const displayEl = document.getElementById('demo-phone-display');
        const linkEl = document.getElementById('demo-phone-link');
        if (displayEl) displayEl.textContent = data.number;
        if (linkEl) linkEl.href = `tel:${data.number.replace(/[^+\d]/g, '')}`;
      }
    }).catch(() => {});
  
  if (document.getElementById('roi-calls')) {
    window.updateROICalculator();
  }
  
  setupPricingInteractions();
  
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const targetId = a.getAttribute('href');
      if (targetId === '#') return;
      const el = document.querySelector(targetId);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
  
  const formLogin = document.getElementById('form-saas-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
    
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          saasToken = data.token;
          currentTenant = data.tenant;
          window.closeAuthModal();
          onAuthSuccess(saasToken, currentTenant);
        } else if (data.requires2FA) {
          pending2FATempToken = data.tempToken;
          document.getElementById('form-saas-login').style.display = 'none';
          const twoFAStep = document.getElementById('auth-2fa-step');
          if (twoFAStep) twoFAStep.style.display = 'block';
        } else {
          showToast(data.error || 'Login failed. Check your credentials.', 'error');
        }
      } catch (err) {
        showToast('Error connecting to authentication service.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Log In'; }
      }
    });
  }
  
  const form2FA = document.getElementById('form-saas-2fa');
  if (form2FA) {
    form2FA.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('login-2fa-code').value.trim();
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
      try {
        const res = await fetch('/api/auth/login/2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken: pending2FATempToken, code })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          saasToken = data.token;
          pending2FATempToken = null;
          window.closeAuthModal();
          const profileRes = await fetch('/api/profile');
          if (profileRes.ok) {
            const profile = await profileRes.json();
            currentTenant = { ...currentTenant, ...profile };
          }
          onAuthSuccess(saasToken, currentTenant);
        } else {
          showToast(data.error || 'Invalid code.', 'error');
        }
      } catch (err) {
        showToast('Error verifying 2FA code.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Verify'; }
      }
    });
  }
  
  const formRegister = document.getElementById('form-saas-register');
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const companyName = document.getElementById('reg-company').value.trim();
      const manualRefCode = document.getElementById('reg-referred-by')?.value.trim();
      const referredBy = manualRefCode || localStorage.getItem('referred_by') || null;
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
    
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, companyName, referredBy })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          const logRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const logData = await logRes.json();
          if (logRes.ok && logData.success) {
            saasToken = logData.token;
            currentTenant = logData.tenant;
            window.closeAuthModal();
            onAuthSuccess(saasToken, currentTenant);
          }
        } else {
          showToast(data.error || 'Registration failed.', 'error');
        }
      } catch (err) {
        showToast('Error connecting to registration service.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Register & Get Started'; }
      }
    });
  }
  
  const formForgot = document.getElementById('form-forgot-password');
  if (formForgot) {
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        showToast(data.message || 'Reset email sent.', 'success');
        document.getElementById('auth-forgot-step').style.display = 'none';
        document.getElementById('form-saas-login').style.display = 'block';
      } catch (err) {
        showToast('Error sending reset email.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
      }
    });
  }

  const formInvite = document.getElementById('form-saas-invite');
  if (formInvite) {
    formInvite.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('invite-name').value.trim();
      const password = document.getElementById('invite-password').value;
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Joining Workspace…'; }
      
      try {
        const response = await fetch('/api/team/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            inviteToken: window.activeInviteToken, 
            name, 
            password 
          })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          saasToken = data.token;
          currentTenant = data.tenant;
          window.activeInviteToken = null;
          const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.history.replaceState({ path: newUrl }, '', newUrl);
  
          window.closeAuthModal();
          onAuthSuccess(saasToken, currentTenant);
          showToast('Successfully accepted invitation! Welcome to your workspace.', 'success');
        } else {
          showToast(data.error || 'Failed to accept invitation.', 'error');
        }
      } catch (err) {
        showToast('Error connecting to invitation service.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Accept & Join Workspace'; }
      }
    });
  }
});

// ── Google Sign-In callback ──
window.handleGoogleCredential = async function(response) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        credential: response.credential,
        inviteToken: window.activeInviteToken || null,
        referredBy: localStorage.getItem('referred_by') || null
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      saasToken = data.token;
      currentTenant = data.tenant;
      
      if (window.activeInviteToken) {
        window.activeInviteToken = null;
        const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }

      window.closeAuthModal();
      onAuthSuccess(saasToken, currentTenant);
      if (data.isNew) showToast('Welcome to VoiceDesk! Your account has been created.', 'success');
      showToast('Successfully logged in!', 'success');
    } else {
      showToast(data.error || 'Google Sign-In failed.', 'error');
    }
  } catch (err) {
    showToast('Google Sign-In error. Please try again.', 'error');
  }
};

// ── Invite acceptance ──
window.showInviteAcceptStep = async function(token) {
  try {
    const res = await fetch(`/api/team/invite/verify/${encodeURIComponent(token)}`);
    const data = await res.json();
    if (res.ok && data.valid) {
      document.getElementById('invite-email').value = data.email;
      document.getElementById('invite-welcome-text').innerHTML = `You have been invited to join <strong>${data.company_name}</strong> as <strong>${data.role}</strong>.`;
      window.openAuthModal('invite');
    } else {
      showToast(data.error || 'Invitation is invalid or has expired.', 'error');
    }
  } catch (err) {
    showToast('Failed to fetch invitation details.', 'error');
  }
};

// ── Affiliate Info Modal Handlers ──
window.openAffiliateInfoModal = function() {
  const modal = document.getElementById('affiliate-info-modal');
  if (modal) {
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  }
};

window.closeAffiliateInfoModal = function() {
  const modal = document.getElementById('affiliate-info-modal');
  if (modal) modal.style.display = 'none';
};

window.goToAffiliateRegistration = function() {
  window.location.href = '/affiliate.html?tab=signup';
};

