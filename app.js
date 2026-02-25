/* ============================================================
   PrintNet – app.js
   Frontend-only SPA logic
   ============================================================ */

'use strict';


// ============================================================
// STATE
// ============================================================
const state = {
  isLoggedIn: false,
  user: {
    firstName: 'Ján',
    lastName: 'Novák',
    email: 'jan.novak@example.sk',
    credits: 0,
  },
  printJobs: [],
  sliderCredits: 100,
  uploadedFiles: [],
  nextJobId: 1,
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Start on login page
  showPage('login');
  updateNavbar();

  // Password strength listener
  const regPassword = document.getElementById('regPassword');
  if (regPassword) {
    regPassword.addEventListener('input', () => checkPasswordStrength(regPassword.value));
  }

  // User menu toggle
  const userMenu = document.getElementById('userMenu');
  if (userMenu) {
    userMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('open');
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    const userMenu = document.getElementById('userMenu');
    if (userMenu) userMenu.classList.remove('open');
  });

  // Generate bank reference
  const bankRef = document.getElementById('bankReference');
  if (bankRef) {
    bankRef.textContent = 'PN-' + Math.floor(100000 + Math.random() * 900000);
  }
});

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showPage(pageId) {
  // Guard: non-login pages require login
  if (!state.isLoggedIn && pageId !== 'login') {
    showPage('login');
    return;
  }

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

  // Show target page
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.remove('hidden');
  }

  // Show/hide navbar
  const navbar = document.getElementById('navbar');
  if (navbar) {
    navbar.style.display = pageId === 'login' ? 'none' : 'flex';
  }

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === pageId);
  });

  // Page-specific init
  if (pageId === 'dashboard') initDashboard();
  if (pageId === 'credits')   initCreditsPage();
  if (pageId === 'upload')    initUploadPage();
  if (pageId === 'history')   initHistoryPage();
  if (pageId === 'profile')   initProfile();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Close mobile menu
  const navLinks = document.getElementById('navLinks');
  if (navLinks) navLinks.classList.remove('mobile-open');
}

// ============================================================
// AUTH
// ============================================================
function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
  }
}

// Email validation with immediate visual feedback
function validateEmailInput(input, isRegister = false) {
  const email = input.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (email && !emailRegex.test(email)) {
    input.classList.add('input-error');
    return false;
  } else {
    input.classList.remove('input-error');
    return true;
  }
}

// Add email validation listeners
document.addEventListener('DOMContentLoaded', () => {
  const loginEmail = document.getElementById('loginEmail');
  const regEmail = document.getElementById('regEmail');
  
  if (loginEmail) {
    loginEmail.addEventListener('input', () => validateEmailInput(loginEmail, false));
    loginEmail.addEventListener('blur', () => validateEmailInput(loginEmail, false));
  }
  
  if (regEmail) {
    regEmail.addEventListener('input', () => validateEmailInput(regEmail, true));
    regEmail.addEventListener('blur', () => validateEmailInput(regEmail, true));
  }
});

function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showToast('Vyplňte prosím všetky polia.', 'error');
    return;
  }

  // Mock login – accept any valid email/password
  state.isLoggedIn = true;
  state.user.email = email;
  // Derive name from email
  const namePart = email.split('@')[0];
  const parts = namePart.split(/[._-]/);
  state.user.firstName = capitalize(parts[0] || 'Používateľ');
  state.user.lastName  = capitalize(parts[1] || '');
  state.user.credits   = 0;

  updateNavbar();
  showPage('dashboard');
  showToast(`Vitajte späť, ${state.user.firstName}!`, 'success');
}

function handleRegister(e) {
  e.preventDefault();
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName  = document.getElementById('regLastName').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const password  = document.getElementById('regPassword').value;
  const confirm   = document.getElementById('regConfirmPassword').value;

  if (password !== confirm) {
    showToast('Heslá sa nezhodujú.', 'error');
    return;
  }
  if (password.length < 8) {
    showToast('Heslo musí mať aspoň 8 znakov.', 'error');
    return;
  }

  state.isLoggedIn = true;
  state.user = { firstName, lastName, email, credits: 0 };

  updateNavbar();
  showPage('dashboard');
  showToast(`Účet vytvorený! Vitajte, ${firstName}!`, 'success');
}

function logout() {
  state.isLoggedIn = false;
  state.user.credits = 0;
  state.printJobs = [];
  state.uploadedFiles = [];
  state.sliderCredits = 100;
  showPage('login');
  showToast('Boli ste odhlásený.', 'info');
}

function showForgotPassword() {
  showModal('successModal', {
    title: 'Obnovenie hesla',
    message: 'Ak účet s týmto e-mailom existuje, čoskoro dostanete odkaz na obnovenie hesla.',
    btnText: 'Rozumiem',
  });
}

// ============================================================
// NAVBAR
// ============================================================
function updateNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const navCreditCount  = document.getElementById('navCreditCount');
  const userAvatar      = document.getElementById('userAvatar');
  const userNameDisplay = document.getElementById('userNameDisplay');

  if (navCreditCount) navCreditCount.textContent = `${state.user.credits} Kreditov`;
  if (userAvatar) {
    const initials = (state.user.firstName[0] || '') + (state.user.lastName[0] || '');
    userAvatar.textContent = initials.toUpperCase() || 'U';
  }
  if (userNameDisplay) {
    userNameDisplay.textContent = `${state.user.firstName} ${state.user.lastName}`.trim();
  }
}

function toggleMobileMenu() {
  const navLinks = document.getElementById('navLinks');
  if (navLinks) navLinks.classList.toggle('mobile-open');
}

// ============================================================
// DASHBOARD
// ============================================================
function initDashboard() {
  // Greeting
  const hour = new Date().getHours();
  let greeting = 'Dobré ráno';
  if (hour >= 10 && hour < 18) greeting = 'Dobrý deň';
  else if (hour >= 18) greeting = 'Dobrý večer';

  const dashGreeting = document.getElementById('dashGreeting');
  if (dashGreeting) dashGreeting.textContent = `${greeting}, ${state.user.firstName}!`;

  // Stats
  setEl('dashCredits', state.user.credits);
  setEl('dashJobsTotal', state.printJobs.length);

  const totalPages = state.printJobs.reduce((s, j) => s + j.pages, 0);
  setEl('dashPagesTotal', totalPages);

  const totalSpent = state.printJobs.reduce((s, j) => s + j.creditsUsed, 0);
  setEl('dashSpentTotal', `${totalSpent}`);

  // Recent jobs
  renderRecentJobs();

}

function renderRecentJobs() {
  const container = document.getElementById('dashRecentJobs');
  if (!container) return;

  const recent = [...state.printJobs].reverse().slice(0, 4);

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        <p>No print jobs yet.<br/><a href="#" onclick="showPage('upload'); return false;">Start your first print →</a></p>
      </div>`;
    return;
  }

  container.innerHTML = recent.map(job => `
    <div class="job-item">
      <div class="job-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="job-info">
        <div class="job-name">${escapeHtml(job.fileName)}</div>
        <div class="job-meta">${job.date} · ${job.pages} pages · ${job.color}</div>
      </div>
      <div class="job-credits">${job.creditsUsed} kr</div>
      <span class="status-badge status-${job.status}">${job.status}</span>
    </div>
  `).join('');
}

// ============================================================
// CREDITS PAGE
// ============================================================

// Pricing: base rate €0.15/credit (1 B&W page), peak efficiency at ~€40 (1000 credits)
function calcPrice(credits) {
  // Tiered pricing: more credits = lower per-credit cost
  let ppc;
  if (credits <= 50)       ppc = 0.150;
  else if (credits <= 200) ppc = 0.130;
  else if (credits <= 300) ppc = 0.110;
  else if (credits <= 500) ppc = 0.1;
  else if (credits <= 750) ppc = 0.1;
  else                     ppc = 0.1;  // peak: 1000 credits = €40
  return { price: credits * ppc, ppc };
}

function initCreditsPage() {
  setEl('creditsPageBalance', `${state.user.credits} kreditov`);
  // Init slider display
  updateSlider(state.sliderCredits);
  const slider = document.getElementById('creditSlider');
  if (slider) slider.value = state.sliderCredits;
  // Enable pay button (slider always has a value)
  const payBtn = document.getElementById('payBtn');
  if (payBtn) payBtn.disabled = false;
}

function updateSlider(value) {
  const credits = parseInt(value);
  state.sliderCredits = credits;
  const { price, ppc } = calcPrice(credits);

  setEl('sliderCreditsValue', credits);
  setEl('sliderPriceValue', `€${price.toFixed(2)}`);
  setEl('sliderPPC', `€${ppc.toFixed(3)} za každý kredit`);
  setEl('sliderBWPages', credits);
  setEl('sliderColorPages', Math.floor(credits / 2));

  // Update order summary
  setEl('summaryCredits', `${credits} kreditov`);
  setEl('summaryPPC', `€${ppc.toFixed(3)}`);
  setEl('summaryTotal', `€${price.toFixed(2)}`);

  // Update payment header summary
  const summary = document.getElementById('selectedPackageSummary');
  if (summary) summary.textContent = `${credits} kreditov za €${price.toFixed(2)}`;

  // Update slider track fill
  const slider = document.getElementById('creditSlider');
  if (slider) {
    const pct = ((credits - 10) / (1000 - 10)) * 100;
    slider.style.background = `linear-gradient(to right, var(--blue-500) ${pct}%, var(--blue-100) ${pct}%)`;
  }
}

function updateOrderSummary() {
  const credits = state.sliderCredits;
  const { price, ppc } = calcPrice(credits);
  setEl('summaryCredits', `${credits} credits`);
  setEl('summaryPPC', `€${ppc.toFixed(3)}`);
  setEl('summaryTotal', `€${price.toFixed(2)}`);
}

function switchPaymentMethod(method) {
  // Update active label
  ['card', 'paypal'].forEach(m => {
    const el = document.getElementById(`pm-${m}`);
    if (el) el.classList.toggle('active', m === method);
  });

  // Show/hide fields
  const cardFields   = document.getElementById('cardFields');
  const paypalFields = document.getElementById('paypalFields');

  if (cardFields)   cardFields.classList.toggle('hidden', method !== 'card');
  if (paypalFields) paypalFields.classList.toggle('hidden', method !== 'paypal');
}

function handlePayment(e) {
  e.preventDefault();

  const credits = state.sliderCredits;
  const { price } = calcPrice(credits);
  const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;

  if (method === 'card') {
    const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
    const cardExpiry = document.getElementById('cardExpiry').value;
    const cardCVV    = document.getElementById('cardCVV').value;
    const cardName   = document.getElementById('cardName').value.trim();

    if (!cardName || cardNumber.length < 16 || !cardExpiry || cardCVV.length < 3) {
      showToast('Vyplňte prosím všetky údaje karty.', 'error');
      return;
    }
  }

  // Simulate processing
  const payBtn = document.getElementById('payBtn');
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.innerHTML = `<span class="spinner"></span> Spracúva sa...`;
  }

  setTimeout(() => {
    // Add credits
    state.user.credits += credits;
    updateNavbar();

    // Re-enable button
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Dokončiť nákup`;
    }

    // Reset card fields
    ['cardName', 'cardNumber', 'cardExpiry', 'cardCVV'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Update balance display
    setEl('creditsPageBalance', `${state.user.credits} credits`);

    showModal('successModal', {
      title: 'Platba úspešná!',
      message: `${credits} kreditov bolo pridaných na váš účet. Váš nový zostatok je ${state.user.credits} kreditov.`,
      btnText: 'Späť na Prehľad',
      onClose: () => showPage('dashboard'),
    });
  }, 1800);
}

function formatCardNumber(input) {
  let val = input.value.replace(/\D/g, '').substring(0, 16);
  input.value = val.replace(/(.{4})/g, '$1 ').trim();

  // Detect card type
  const icon = document.getElementById('cardTypeIcon');
  if (icon) {
    if (/^4/.test(val)) icon.textContent = 'VISA';
    else if (/^5[1-5]/.test(val)) icon.textContent = 'MC';
    else if (/^3[47]/.test(val)) icon.textContent = 'AMEX';
    else icon.textContent = '';
  }
}

function formatExpiry(input) {
  let val = input.value.replace(/\D/g, '').substring(0, 4);
  if (val.length >= 2) val = val.substring(0, 2) + ' / ' + val.substring(2);
  input.value = val;
}

// ============================================================
// UPLOAD PAGE
// ============================================================
function initUploadPage() {
  setEl('uploadPageBalance', `${state.user.credits} kreditov`);
  state.uploadedFiles = [];
  renderFileList();
  updateCostEstimate();
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('drag-over');
}

function handleDragLeave(e) {
  document.getElementById('dropZone').classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  addFiles(files);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  addFiles(files);
  e.target.value = ''; // Reset input
}

function addFiles(files) {
  const allowed = ['pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png'];
  let added = 0;

  files.forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      showToast(`"${file.name}" nie je podporovaný typ súboru.`, 'error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast(`"${file.name}" prekračuje limit 50 MB.`, 'error');
      return;
    }
    // Avoid duplicates
    if (state.uploadedFiles.find(f => f.name === file.name && f.size === file.size)) {
      showToast(`"${file.name}" je už pridaný.`, 'warning');
      return;
    }

    // Estimate pages based on file size (rough mock)
    const estimatedPages = estimatePages(file);

    state.uploadedFiles.push({
      id: Date.now() + Math.random(),
      name: file.name,
      size: file.size,
      ext: ext,
      pages: estimatedPages,
    });
    added++;
  });

  if (added > 0) {
    renderFileList();
    updateCostEstimate();
    showToast(`${added} súbor${added > 1 ? 'y' : ''} pridaný/é.`, 'success');
  }
}

function estimatePages(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const sizeMB = file.size / (1024 * 1024);
  if (['jpg','jpeg','png'].includes(ext)) return 1;
  if (ext === 'pdf') return Math.max(1, Math.round(sizeMB * 8));
  if (['doc','docx'].includes(ext)) return Math.max(1, Math.round(sizeMB * 15));
  if (['ppt','pptx'].includes(ext)) return Math.max(1, Math.round(sizeMB * 5));
  if (['xls','xlsx'].includes(ext)) return Math.max(1, Math.round(sizeMB * 10));
  return Math.max(1, Math.round(sizeMB * 10));
}

function removeFile(id) {
  state.uploadedFiles = state.uploadedFiles.filter(f => f.id !== id);
  renderFileList();
  updateCostEstimate();
}

function renderFileList() {
  const container = document.getElementById('fileList');
  if (!container) return;

  if (state.uploadedFiles.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = state.uploadedFiles.map(file => `
    <div class="file-item" id="file-${file.id}">
      <div class="file-type-icon file-type-${getFileTypeClass(file.ext)}">${file.ext.toUpperCase()}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-size">${formatFileSize(file.size)}</div>
      </div>
      <div class="file-pages">~${file.pages} page${file.pages !== 1 ? 's' : ''}</div>
      <button class="file-remove" onclick="removeFile(${file.id})" title="Remove file">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

function getFileTypeClass(ext) {
  if (ext === 'pdf') return 'pdf';
  if (['doc','docx'].includes(ext)) return 'doc';
  if (['xls','xlsx'].includes(ext)) return 'xls';
  if (['ppt','pptx'].includes(ext)) return 'ppt';
  if (['jpg','jpeg','png'].includes(ext)) return 'img';
  return 'other';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function selectOption(groupId, btn) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function changeCopies(delta) {
  const input = document.getElementById('copiesInput');
  if (!input) return;
  let val = parseInt(input.value) + delta;
  val = Math.max(1, Math.min(99, val));
  input.value = val;
  updateCostEstimate();
}

function updateCostEstimate() {
  const totalPages = state.uploadedFiles.reduce((s, f) => s + f.pages, 0);
  const copies     = parseInt(document.getElementById('copiesInput')?.value || 1);
  const colorMode  = document.querySelector('#colorModeGroup .option-btn.active')?.dataset.value || 'bw';

  const creditsPerPage = colorMode === 'color' ? 3 : 1;
  const totalCost    = totalPages * copies * creditsPerPage;
  const balanceAfter = state.user.credits - totalCost;

  setEl('costFiles', state.uploadedFiles.length);
  setEl('costPages', totalPages);
  setEl('costCopies', copies);
  setEl('costColor', colorMode === 'color' ? 'Color (3 kr/str)' : 'B&W (1 kr/str)');
  setEl('costTotal', totalCost === 1 ? `${totalCost} kredit` : totalCost < 5 && totalCost != 0 ? `${totalCost} kredity` : `${totalCost} kreditov`);
  setEl('costAfter', balanceAfter === 1 ? `${balanceAfter} kredit` : balanceAfter < 5 && balanceAfter != 0 ? `${balanceAfter} kredity` : `${balanceAfter} kreditov`);

  // Insufficient warning
  const warning = document.getElementById('costWarning');
  const afterRow = document.querySelector('.cost-after');
  const submitBtn = document.getElementById('submitPrintBtn');

  const insufficient = totalCost > state.user.credits && totalCost > 0;
  const noFiles = state.uploadedFiles.length === 0;

  if (warning) warning.classList.toggle('hidden', !insufficient);
  if (afterRow) afterRow.classList.toggle('insufficient', insufficient);
  if (submitBtn) submitBtn.disabled = noFiles || insufficient;
}

function submitPrintJob() {
  if (state.uploadedFiles.length === 0) {
    showToast('Nahrajte prosím aspoň jeden súbor.', 'error');
    return;
  }

  const totalPages = state.uploadedFiles.reduce((s, f) => s + f.pages, 0);
  const copies     = parseInt(document.getElementById('copiesInput')?.value || 1);
  const colorMode  = document.querySelector('#colorModeGroup .option-btn.active')?.dataset.value || 'bw';
  const paperSize  = document.getElementById('paperSize')?.value || 'a4';
  const notes      = document.getElementById('printNotes')?.value || '';

  const creditsPerPage = colorMode === 'color' ? 3 : 1;
  const totalCost      = totalPages * copies * creditsPerPage;

  if (totalCost > state.user.credits) {
    showToast('Nedostatok kreditov. Prosím, doplňte si zostatok.', 'error');
    return;
  }

  // Disable button
  const submitBtn = document.getElementById('submitPrintBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> Odosiela sa...`;
  }

  setTimeout(() => {
    // Deduct credits
    state.user.credits -= totalCost;
    updateNavbar();

    // Create job records
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    state.uploadedFiles.forEach(file => {
      const jobPages = file.pages * copies;
      const jobCost  = file.pages * copies * creditsPerPage;
      state.printJobs.push({
        id: `PN-${String(state.nextJobId++).padStart(5, '0')}`,
        fileName: file.name,
        date: dateStr,
        pages: jobPages,
        color: colorMode === 'color' ? 'Color' : 'B&W',
        copies,
        paperSize: paperSize.toUpperCase(),
        notes,
        creditsUsed: jobCost,
        status: 'queued',
      });
    });

    // Simulate status progression
    simulateJobProgress();

    // Reset upload page
    state.uploadedFiles = [];
    renderFileList();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Send to Printer`;
    }
    updateCostEstimate();

    showModal('successModal', {
      title: 'Súbory boli zaslané!',
      message: `Vaše súbory boli zaslané tlačiarni. <br>Kredity využité: ${totalCost}<br>Zostatok kreditov: ${state.user.credits}`,
      btnText: 'Pozrieť Históriu',
      onClose: () => showPage('history'),
    });
  }, 1500);
}

function simulateJobProgress() {
  // Move queued → processing → completed over time
  const jobs = state.printJobs.filter(j => j.status === 'queued');
  jobs.forEach((job, i) => {
    setTimeout(() => {
      job.status = 'processing';
    }, 3000 + i * 1000);
    setTimeout(() => {
      job.status = 'completed';
      showToast(`Tlačová úloha "${job.fileName}" dokončená!`, 'success');
    }, 8000 + i * 2000);
  });
}

// ============================================================
// HISTORY PAGE
// ============================================================
function initHistoryPage() {
  renderHistoryTable(state.printJobs);
}

function renderHistoryTable(jobs) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (jobs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-table">
          <div class="empty-state-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2 2 2h16a0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <p>Zatiaľ žiadne tlačové úlohy. <a href="#" onclick="showPage('upload'); return false;">Začnite tlačiť →</a></p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = [...jobs].reverse().map(job => `
    <tr>
      <td><code style="font-size:12px;color:var(--blue-600)">${job.id}</code></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="file-type-icon file-type-${getFileTypeClass(job.fileName.split('.').pop().toLowerCase())}" style="width:28px;height:28px;font-size:8px;flex-shrink:0">${job.fileName.split('.').pop().toUpperCase()}</div>
          <span style="font-weight:500">${escapeHtml(job.fileName)}</span>
        </div>
      </td>
      <td style="white-space:nowrap">${job.date}</td>
      <td>${job.pages}</td>
      <td>${job.color}</td>
      <td><strong>${job.creditsUsed}</strong></td>
      <td><span class="status-badge status-${job.status}">${job.status}</span></td>
      <td>
        <button class="table-action-btn" title="Stiahnuť potvrdenku" onclick="showToast('Potvrdenka stiahnutá.', 'info')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button class="table-action-btn" title="Znovu vytlačiť" onclick="reprintJob('${job.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

function filterHistory() {
  const search = document.getElementById('historySearch')?.value.toLowerCase() || '';
  const filter = document.getElementById('historyFilter')?.value || 'all';

  const filtered = state.printJobs.filter(job => {
    const matchSearch = job.fileName.toLowerCase().includes(search) || job.id.toLowerCase().includes(search);
    const matchFilter = filter === 'all' || job.status === filter;
    return matchSearch && matchFilter;
  });

  renderHistoryTable(filtered);
}

function reprintJob(jobId) {
  const job = state.printJobs.find(j => j.id === jobId);
  if (!job) return;

  showModal('confirmModal', {
    title: 'Znovu vytlačiť úlohu?',
    message: `Toto vytvorí novú tlačovú úlohu pre "${job.fileName}" a odpočíta ${job.creditsUsed} kreditov z vášho zostatku.`,
    onConfirm: () => {
      if (job.creditsUsed > state.user.credits) {
        showToast('Nedostatok kreditov na znovu tlač.', 'error');
        return;
      }
      state.user.credits -= job.creditsUsed;
      updateNavbar();

      const now = new Date();
      const dateStr = now.toLocaleDateString('sk-SK', { day: '2-digit', month: 'short', year: 'numeric' });
      state.printJobs.push({
        ...job,
        id: `PN-${String(state.nextJobId++).padStart(5, '0')}`,
        date: dateStr,
        status: 'queued',
      });

      simulateJobProgress();
      initHistoryPage();
      showToast('Úloha na znovu tlač odoslaná!', 'success');
    },
  });
}
// ============================================================
// PROFILE PAGE
// ============================================================

function initProfile() {
  // Populate profile form with user data
  setEl('profileName', `${state.user.firstName} ${state.user.lastName}`);
  setEl('profileEmail', state.user.email);
  
  const firstNameInput = document.getElementById('profileFirstName');
  const lastNameInput = document.getElementById('profileLastName');
  const emailInput = document.getElementById('profileEmailInput');
  const avatar = document.getElementById('profileAvatar');
  
  if (firstNameInput) firstNameInput.value = state.user.firstName;
  if (lastNameInput) lastNameInput.value = state.user.lastName;
  if (emailInput) emailInput.value = state.user.email;
  if (avatar) {
    avatar.textContent = (state.user.firstName[0] + (state.user.lastName[0] || '')).toUpperCase();
  }
}

function saveProfile(e) {
  e.preventDefault();
  const firstName = document.getElementById('profileFirstName')?.value.trim();
  const lastName  = document.getElementById('profileLastName')?.value.trim();
  const email     = document.getElementById('profileEmailInput')?.value.trim();

  if (firstName) state.user.firstName = firstName;
  if (lastName)  state.user.lastName  = lastName;
  if (email)     state.user.email     = email;

  updateNavbar();

  setEl('profileName', `${state.user.firstName} ${state.user.lastName}`);
  setEl('profileEmail', state.user.email);

  const avatar = document.getElementById('profileAvatar');
  if (avatar) {
    avatar.textContent = (state.user.firstName[0] + (state.user.lastName[0] || '')).toUpperCase();
  }

  showToast('Profil úspešne aktualizovaný!', 'success');
}

function changePassword(e) {
  e.preventDefault();
  const current = document.getElementById('currentPassword')?.value;
  const newPwd   = document.getElementById('newPassword')?.value;
  const confirm  = document.getElementById('confirmNewPassword')?.value;

  if (!current || !newPwd || !confirm) {
    showToast('Vyplňte prosím všetky polia hesla.', 'error');
    return;
  }
  if (newPwd !== confirm) {
    showToast('Nové heslá sa nezhodujú.', 'error');
    return;
  }
  if (newPwd.length < 8) {
    showToast('Heslo musí mať aspoň 8 znakov.', 'error');
    return;
  }

  ['currentPassword', 'newPassword', 'confirmNewPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  showToast('Heslo úspešne zmenené!', 'success');
}

function confirmDeleteAccount() {
  showModal('confirmModal', {
    title: 'Vymazať účet?',
    message: 'Toto natrvalo vymaže váš účet a všetky súvisiace údaje. Táto akcia sa nedá vrátiť späť.',
    onConfirm: () => {
      logout();
      showToast('Váš účet bol vymazaný.', 'info');
    },
  });
}

// ============================================================
// PASSWORD STRENGTH
// ============================================================
function checkPasswordStrength(password) {
  const fill  = document.getElementById('strengthFill');
  const label = document.getElementById('strengthLabel');
  if (!fill || !label) return;

  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { pct: '0%',   color: 'var(--gray-300)',  text: 'Enter a password' },
    { pct: '20%',  color: 'var(--red-500)',   text: 'Very weak' },
    { pct: '40%',  color: 'var(--orange-500)',text: 'Weak' },
    { pct: '60%',  color: 'var(--yellow-500)',text: 'Fair' },
    { pct: '80%',  color: 'var(--blue-500)',  text: 'Strong' },
    { pct: '100%', color: 'var(--green-500)', text: 'Very strong' },
  ];

  const level = password.length === 0 ? levels[0] : levels[Math.min(score, 5)];
  fill.style.width    = level.pct;
  fill.style.background = level.color;
  label.textContent   = level.text;
  label.style.color   = level.color;
}

// ============================================================
// TOGGLE PASSWORD VISIBILITY
// ============================================================
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = isPassword
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

// ============================================================
// MODALS
// ============================================================
const modalCallbacks = {};

function showModal(modalId, options = {}) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  if (options.title)   setEl(modalId === 'successModal' ? 'successTitle' : 'confirmTitle', options.title);
  if (options.message) setEl(modalId === 'successModal' ? 'successMessage' : 'confirmMessage', options.message);

  if (modalId === 'successModal') {
    const btn = document.getElementById('successBtn');
    if (btn) btn.textContent = options.btnText || 'Continue';
    modalCallbacks['successModal'] = options.onClose || null;
  }

  if (modalId === 'confirmModal') {
    const confirmBtn = document.getElementById('confirmActionBtn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        closeModal('confirmModal');
        if (options.onConfirm) options.onConfirm();
      };
    }
  }

  modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');

  if (modalId === 'successModal' && modalCallbacks['successModal']) {
    modalCallbacks['successModal']();
    modalCallbacks['successModal'] = null;
  }
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
// HELPERS
// ============================================================
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
