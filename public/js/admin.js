(function () {
  const { crafts, stages } = window.ADMIN_CONFIG;
  const $ = (id) => document.getElementById(id);

  const loginView = $('login-view');
  const dashboardView = $('dashboard-view');
  const detailPanel = $('detail-panel');
  const detailContent = $('detail-content');
  const filters = {
    q: $('filter-q'),
    status: $('filter-status'),
    stage: $('filter-stage'),
    craft: $('filter-craft'),
  };

  let applications = [];
  let searchTimer = null;
  let toastTimer = null;

  const STATUS_LABELS = { paid: 'Paid', pending: 'Not paid yet', awaiting_confirmation: 'Transfer to confirm', failed: 'Payment failed' };
  const STATUS_STYLES = {
    paid: 'bg-primary-fixed text-on-primary-fixed',
    pending: 'bg-surface-variant text-on-surface-variant',
    awaiting_confirmation: 'bg-secondary-fixed text-on-secondary-fixed',
    failed: 'bg-error-container text-on-error-container',
  };
  const STAGE_STYLES = {
    new: 'bg-secondary-fixed text-on-secondary-fixed',
    contacted: 'bg-surface-container-high text-on-surface',
    interview: 'bg-tertiary-fixed text-on-tertiary-fixed',
    admitted: 'bg-primary-container text-on-primary',
    waitlisted: 'bg-surface-variant text-on-surface-variant',
    declined: 'bg-error-container text-on-error-container',
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatNaira(kobo) {
    return '₦' + ((kobo || 0) / 100).toLocaleString('en-NG');
  }

  function formatDate(iso, withTime = true) {
    if (!iso) return '—';
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    if (withTime) Object.assign(options, { hour: 'numeric', minute: '2-digit' });
    return new Date(iso).toLocaleString('en-NG', options);
  }

  // Nigerian numbers are usually typed as 080..., but wa.me needs 23480...
  function whatsappLink(phone) {
    let digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) digits = '234' + digits.slice(1);
    return 'https://wa.me/' + digits;
  }

  function badge(label, classes) {
    return `<span class="inline-block px-space-xs py-space-3xs rounded font-caption text-caption whitespace-nowrap ${classes}">${escapeHtml(label)}</span>`;
  }

  function stageBadge(application) {
    if (application.status !== 'paid') {
      return badge(STATUS_LABELS[application.status] || application.status, STATUS_STYLES[application.status] || '');
    }
    return badge(stages[application.admissionStage] || application.admissionStage, STAGE_STYLES[application.admissionStage] || '');
  }

  function showToast(message, isError = false) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.toggle('bg-error', isError);
    toast.classList.toggle('bg-primary', !isError);
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const error = new Error(data.error || 'Something went wrong. Please try again.');
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function showLogin() {
    dashboardView.classList.add('hidden');
    closeDetail();
    loginView.classList.remove('hidden');
    $('admin-password').focus();
  }

  function showDashboard() {
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
  }

  function handleError(err) {
    if (err.status === 401) {
      showLogin();
    } else {
      showToast(err.message, true);
    }
  }

  function filterQuery() {
    const params = new URLSearchParams();
    for (const [key, input] of Object.entries(filters)) {
      const value = input.value.trim();
      if (value) params.set(key, value);
    }
    return params.toString();
  }

  async function loadApplications() {
    const query = filterQuery();
    const data = await api('/api/admin/applications?' + query);
    applications = data.applications;
    $('export-btn').href = '/api/admin/applications.csv?' + query;
    renderStats(data.summary);
    renderList();
    showDashboard();
  }

  function renderStats(summary) {
    const cards = [
      { label: 'Paid applications', value: summary.paid, icon: 'how_to_reg' },
      { label: 'Fees received', value: formatNaira(summary.revenueKobo), icon: 'payments' },
      { label: 'Transfers to confirm', value: summary.awaitingConfirmation, icon: 'account_balance', highlight: summary.awaitingConfirmation > 0 },
      { label: 'Awaiting first contact', value: summary.awaitingContact, icon: 'call', highlight: summary.awaitingContact > 0 },
      { label: 'Admitted', value: summary.byStage.admitted || 0, icon: 'school' },
      { label: 'Scholarship requests', value: summary.scholarshipRequests, icon: 'workspace_premium' },
    ];
    $('stats').innerHTML = cards
      .map(
        (card) => `
        <div class="rounded-2xl p-space-md flex flex-col gap-space-2xs ${card.highlight ? 'bg-secondary-fixed' : 'bg-surface-container-low'}">
          <span class="material-symbols-outlined text-[22px] text-secondary">${card.icon}</span>
          <span class="font-headline-md text-headline-md text-primary leading-tight">${escapeHtml(card.value)}</span>
          <span class="font-caption text-caption text-on-surface-variant">${escapeHtml(card.label)}</span>
        </div>`
      )
      .join('');
  }

  function renderList() {
    const isEmpty = applications.length === 0;
    $('empty-state').classList.toggle('hidden', !isEmpty);
    $('result-count').textContent = isEmpty ? '' : `${applications.length} application${applications.length === 1 ? '' : 's'}`;

    $('applications-table').innerHTML = applications
      .map(
        (a) => `
        <tr class="border-t border-surface-container-high hover:bg-surface-container-low cursor-pointer transition-colors" data-ref="${escapeHtml(a.reference)}">
          <td class="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">${formatDate(a.createdAt, false)}</td>
          <td class="px-space-md py-space-sm">
            <div class="font-label-md text-label-md text-primary">${escapeHtml(a.name)}</div>
            <div class="font-caption text-caption text-on-surface-variant">${escapeHtml(a.email)}</div>
          </td>
          <td class="px-space-md py-space-sm font-body-sm text-body-sm">${escapeHtml(crafts[a.craft] || a.craft)}</td>
          <td class="px-space-md py-space-sm font-body-sm text-body-sm whitespace-nowrap">${escapeHtml(a.phone)}</td>
          <td class="px-space-md py-space-sm">${stageBadge(a)}</td>
          <td class="px-space-md py-space-sm text-center">${a.scholarshipOptIn ? '<span class="material-symbols-outlined text-[18px] text-secondary">check_circle</span>' : ''}</td>
        </tr>`
      )
      .join('');

    $('applications-cards').innerHTML = applications
      .map(
        (a) => `
        <button class="text-left bg-surface-container-lowest rounded-2xl p-space-md shadow-sm flex flex-col gap-space-2xs" data-ref="${escapeHtml(a.reference)}" type="button">
          <div class="flex items-start justify-between gap-space-sm">
            <span class="font-label-md text-label-md text-primary">${escapeHtml(a.name)}</span>
            ${stageBadge(a)}
          </div>
          <span class="font-body-sm text-body-sm">${escapeHtml(crafts[a.craft] || a.craft)}${a.scholarshipOptIn ? ' · Scholarship' : ''}</span>
          <span class="font-caption text-caption text-on-surface-variant">${escapeHtml(a.phone)} · ${formatDate(a.createdAt, false)}</span>
        </button>`
      )
      .join('');
  }

  function detailRow(label, value) {
    return `
      <div class="flex flex-col">
        <span class="font-caption text-caption text-on-surface-variant">${escapeHtml(label)}</span>
        <span class="font-body-md text-body-md text-on-surface break-words">${value}</span>
      </div>`;
  }

  function renderDetail(a) {
    const stageOptions = Object.entries(stages)
      .map(([value, label]) => `<option value="${value}" ${value === a.admissionStage ? 'selected' : ''}>${escapeHtml(label)}</option>`)
      .join('');

    detailContent.innerHTML = `
      <div class="flex flex-col gap-space-lg">
        <div>
          <h2 class="font-headline-md text-headline-md text-primary">${escapeHtml(a.name)}</h2>
          <div class="flex flex-wrap items-center gap-space-2xs mt-space-2xs">
            ${badge(STATUS_LABELS[a.status] || a.status, STATUS_STYLES[a.status] || '')}
            ${a.status === 'paid' ? badge(stages[a.admissionStage] || a.admissionStage, STAGE_STYLES[a.admissionStage] || '') : ''}
            ${a.scholarshipOptIn ? badge('Scholarship requested', 'bg-tertiary-fixed text-on-tertiary-fixed') : ''}
          </div>
        </div>

        <div class="grid grid-cols-3 gap-space-xs">
          <a class="flex flex-col items-center gap-space-3xs p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors" href="${escapeHtml(whatsappLink(a.phone))}" rel="noopener noreferrer" target="_blank">
            <span class="material-symbols-outlined text-secondary">chat</span><span class="font-label-md text-label-md">WhatsApp</span>
          </a>
          <a class="flex flex-col items-center gap-space-3xs p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors" href="tel:${escapeHtml(a.phone.replace(/[^\d+]/g, ''))}">
            <span class="material-symbols-outlined text-secondary">call</span><span class="font-label-md text-label-md">Call</span>
          </a>
          <a class="flex flex-col items-center gap-space-3xs p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors" href="mailto:${escapeHtml(a.email)}">
            <span class="material-symbols-outlined text-secondary">mail</span><span class="font-label-md text-label-md">Email</span>
          </a>
        </div>

        ${
          a.status === 'paid'
            ? `
        <form class="bg-surface-container-low rounded-2xl p-space-md flex flex-col gap-space-sm" id="admin-update-form">
          <span class="font-label-caps text-label-caps text-secondary uppercase tracking-widest">Admissions</span>
          <div class="flex flex-col gap-space-3xs">
            <label class="font-label-md text-label-md text-primary" for="detail-stage">Stage</label>
            <select class="px-space-sm py-space-xs rounded bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary shadow-sm" id="detail-stage">${stageOptions}</select>
            ${a.stageUpdatedAt ? `<span class="font-caption text-caption text-on-surface-variant">Last changed ${formatDate(a.stageUpdatedAt)}</span>` : ''}
          </div>
          <div class="flex flex-col gap-space-3xs">
            <label class="font-label-md text-label-md text-primary" for="detail-notes">Private notes</label>
            <textarea class="w-full px-space-sm py-space-xs rounded bg-surface-container-lowest text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary shadow-sm font-body-md" id="detail-notes" maxlength="5000" placeholder="Interview date, call outcome, portfolio feedback…" rows="4">${escapeHtml(a.adminNotes || '')}</textarea>
          </div>
          <button class="self-end px-space-lg py-space-xs bg-primary-container text-on-primary font-label-md text-label-md rounded-lg shadow-sm hover:bg-primary transition-all disabled:opacity-60" id="detail-save-btn" type="submit">Save changes</button>
        </form>`
            : `
        <div class="p-space-md rounded-2xl ${a.status === 'awaiting_confirmation' ? 'bg-secondary-fixed' : 'bg-surface-container-low'} flex flex-col gap-space-sm">
          <p class="font-body-sm text-body-sm text-on-surface">
            ${a.status === 'awaiting_confirmation'
              ? `This candidate says they paid <strong>${formatNaira(a.amountKobo)}</strong> by bank transfer. Check the account for a transfer with reference <strong>${escapeHtml(a.reference)}</strong> (or from this name), then confirm it below.`
              : "This candidate submitted the form but the registration fee hasn't been confirmed yet. If they paid another way (transfer, cash), confirm it below — otherwise reach out and help them finish paying."}
          </p>
          <button class="self-start px-space-lg py-space-xs bg-primary-container text-on-primary font-label-md text-label-md rounded-lg shadow-sm hover:bg-primary transition-all disabled:opacity-60" id="confirm-payment-btn" type="button">Confirm payment received</button>
        </div>`
        }

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
          ${detailRow('Email', escapeHtml(a.email))}
          ${detailRow('WhatsApp phone', escapeHtml(a.phone))}
          ${detailRow('Age', escapeHtml(a.age))}
          ${detailRow('School', escapeHtml(crafts[a.craft] || a.craft))}
          ${detailRow('Submitted', formatDate(a.createdAt))}
          ${detailRow('Scholarship evaluation', a.scholarshipOptIn ? 'Yes' : 'No')}
        </div>

        <div class="flex flex-col gap-space-2xs">
          <span class="font-caption text-caption text-on-surface-variant">Statement of intent</span>
          <p class="font-body-md text-body-md bg-surface-container-low rounded-xl p-space-md whitespace-pre-line">${escapeHtml(a.statement)}</p>
        </div>

        <div class="flex flex-col gap-space-sm">
          <span class="font-label-caps text-label-caps text-secondary uppercase tracking-widest">Payment</span>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            ${detailRow('Amount', formatNaira(a.amountKobo))}
            ${detailRow('Paid at', formatDate(a.paidAt))}
            ${detailRow('Channel', escapeHtml(a.channel || '—'))}
            ${detailRow('Reference', `<span class="font-body-sm text-body-sm">${escapeHtml(a.reference)}</span>`)}
          </div>
        </div>
      </div>`;

    const confirmBtn = $('confirm-payment-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => confirmPayment(a));
    }

    const form = $('admin-update-form');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        saveDetail(a.reference);
      });
    }
  }

  async function openDetail(reference) {
    try {
      const { application } = await api('/api/admin/applications/' + encodeURIComponent(reference));
      renderDetail(application);
      detailPanel.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } catch (err) {
      handleError(err);
    }
  }

  function closeDetail() {
    detailPanel.classList.add('hidden');
    document.body.style.overflow = '';
  }

  async function saveDetail(reference) {
    const button = $('detail-save-btn');
    button.disabled = true;
    try {
      const { application } = await api('/api/admin/applications/' + encodeURIComponent(reference), {
        method: 'PATCH',
        body: JSON.stringify({
          admissionStage: $('detail-stage').value,
          adminNotes: $('detail-notes').value,
        }),
      });
      renderDetail(application);
      showToast('Saved');
      await loadApplications();
    } catch (err) {
      handleError(err);
    } finally {
      const current = $('detail-save-btn');
      if (current) current.disabled = false;
    }
  }

  async function confirmPayment(a) {
    if (!confirm(`Confirm that ${formatNaira(a.amountKobo)} from ${a.name} has arrived in the account? This marks the application as paid.`)) return;
    const button = $('confirm-payment-btn');
    button.disabled = true;
    try {
      const { application } = await api('/api/admin/applications/' + encodeURIComponent(a.reference), {
        method: 'PATCH',
        body: JSON.stringify({ confirmPayment: true }),
      });
      renderDetail(application);
      showToast('Payment confirmed');
      await loadApplications();
    } catch (err) {
      handleError(err);
      button.disabled = false;
    }
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('login-error');
    const button = $('login-btn');
    errorBox.classList.add('hidden');
    button.disabled = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('admin-password').value }),
      });
      $('admin-password').value = '';
      await loadApplications();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    applications = [];
    showLogin();
  });

  filters.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadApplications().catch(handleError), 250);
  });
  for (const key of ['status', 'stage', 'craft']) {
    filters[key].addEventListener('change', () => loadApplications().catch(handleError));
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-detail]')) {
      closeDetail();
      return;
    }
    const row = event.target.closest('[data-ref]');
    if (row) openDetail(row.dataset.ref);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !detailPanel.classList.contains('hidden')) closeDetail();
  });

  loadApplications().catch(handleError);
})();
