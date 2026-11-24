(function () {
  const form = document.getElementById('candidate-application-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const submitBtn = $('submit-application-btn');
  const submitBtnLabel = $('submit-application-btn-label');
  const errorNotice = $('application-error-notice');
  const paymentStep = $('payment-step');
  const paymentError = $('payment-error-notice');
  const payOnlineOption = $('pay-online-option');
  const payOnlineBtn = $('pay-online-btn');
  const payOnlineLabel = $('pay-online-btn-label');
  const transferBtn = $('transfer-done-btn');
  const defaultPayLabel = payOnlineLabel ? payOnlineLabel.textContent : 'Pay Online';

  let application = null; // { reference, email, amountKobo, publicKey }

  function show(el, message) {
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function whatsappWithText(link, text) {
    const url = new URL(link.href);
    url.searchParams.set('text', text);
    link.href = url.toString();
  }

  function showPaymentStep() {
    form.classList.add('hidden');
    paymentStep.classList.remove('hidden');
    paymentStep.classList.add('flex');
    $('payment-reference').textContent = application.reference;
    if (application.publicKey && window.PaystackPop) {
      payOnlineOption.classList.remove('hidden');
      payOnlineOption.classList.add('flex');
    } else if (!transferBtn) {
      show(paymentError, 'Online payment is temporarily unavailable. Your application is saved — message us on WhatsApp with your reference and we will help you pay.');
    }
    const text = `Hello, I just applied to Root & Rise. My reference is ${application.reference}.`;
    whatsappWithText($('payment-help-link'), text);
    whatsappWithText($('send-receipt-link'), `Hello, here is my transfer receipt for the registration fee. My reference is ${application.reference}.`);
    paymentStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function finish(noticeId) {
    paymentStep.classList.add('hidden');
    paymentStep.classList.remove('flex');
    const notice = $(noticeId);
    notice.classList.remove('hidden');
    if (notice.classList.contains('flex-col')) notice.classList.add('flex');
    notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  // Step 1: save the application.
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    errorNotice.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtnLabel.textContent = 'Saving your application...';

    const payload = {
      name: $('applicant-name').value,
      email: $('applicant-email').value,
      phone: $('applicant-phone').value,
      age: $('applicant-age').value,
      craft: $('applicant-craft').value,
      scholarshipOptIn: $('scholarship-opt-in').checked,
      statement: $('applicant-statement').value,
    };

    try {
      const { res, data } = await postJson('/api/applications', payload);
      if (!res.ok || !data.ok) {
        show(errorNotice, (data.errors && data.errors.join(' ')) || 'Something went wrong. Please check your details and try again.');
        return;
      }
      application = data;
      showPaymentStep();
    } catch (err) {
      show(errorNotice, 'Network error — please check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtnLabel.textContent = 'Submit Application';
    }
  });

  // Step 2a: pay online with Paystack (card, transfer incl. OPay, USSD).
  if (payOnlineBtn) {
    payOnlineBtn.addEventListener('click', function () {
      paymentError.classList.add('hidden');
      payOnlineBtn.disabled = true;
      payOnlineLabel.textContent = 'Opening secure payment...';
      const reset = () => {
        payOnlineBtn.disabled = false;
        payOnlineLabel.textContent = defaultPayLabel;
      };
      const handler = PaystackPop.setup({
        key: application.publicKey,
        email: application.email,
        amount: application.amountKobo,
        currency: 'NGN',
        ref: application.reference,
        metadata: {
          custom_fields: [{ display_name: 'Application Reference', variable_name: 'reference', value: application.reference }],
        },
        callback: function () {
          // Confirm with our server, which re-checks with Paystack directly.
          payOnlineLabel.textContent = 'Confirming payment...';
          postJson(`/api/applications/${encodeURIComponent(application.reference)}/verify`)
            .then(({ res, data }) => {
              if (!res.ok || !data.ok) throw new Error(data.error || 'We could not confirm your payment yet. Please contact admissions with your reference.');
              finish('application-success-notice');
            })
            .catch((err) => {
              show(paymentError, err.message);
              reset();
            });
        },
        onClose: reset,
      });
      handler.openIframe();
    });
  }

  // Step 2b: candidate paid by direct transfer; admissions confirms by hand.
  if (transferBtn) {
    transferBtn.addEventListener('click', async function () {
      paymentError.classList.add('hidden');
      transferBtn.disabled = true;
      try {
        const { res, data } = await postJson(`/api/applications/${encodeURIComponent(application.reference)}/transfer`);
        if (!res.ok || !data.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
        finish(data.alreadyPaid ? 'application-success-notice' : 'transfer-success-notice');
      } catch (err) {
        show(paymentError, err.message);
        transferBtn.disabled = false;
      }
    });
  }
})();

// Copy buttons (e.g. the account number).
document.addEventListener('click', async function (event) {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  event.preventDefault();
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    const original = button.innerHTML;
    button.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span>';
    setTimeout(() => { button.innerHTML = original; }, 1500);
  } catch (err) {
    /* clipboard blocked — the text is visible to copy by hand */
  }
});

// Mobile menu: the desktop nav is hidden below the xl breakpoint.
(function () {
  const toggle = document.getElementById('mobile-nav-toggle');
  const nav = document.getElementById('mobile-nav');
  const icon = document.getElementById('mobile-nav-icon');
  if (!toggle || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    icon.textContent = open ? 'close' : 'menu';
  }

  toggle.addEventListener('click', () => setOpen(nav.classList.contains('hidden')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
})();

// Schools explorer: pick a school on the left, see its programmes on the
// right. Below the lg breakpoint the panel moves under the chosen school,
// so it reads like an accordion on phones.
(function () {
  const explorer = document.getElementById('school-explorer');
  if (!explorer) return;
  const tabs = Array.from(explorer.querySelectorAll('.school-tab'));
  const panel = document.getElementById('school-panel');
  const slot = document.getElementById('school-panel-slot');
  const wide = window.matchMedia('(min-width: 1024px)');

  function place(tab) {
    if (wide.matches) {
      if (panel.parentElement !== slot) slot.appendChild(panel);
    } else {
      tab.parentElement.appendChild(panel);
    }
  }

  function select(tab, scroll) {
    tabs.forEach((t) => t.setAttribute('aria-expanded', String(t === tab)));
    panel.querySelectorAll('[data-panel]').forEach((body) => {
      body.classList.toggle('hidden', body.dataset.panel !== tab.dataset.school);
    });
    place(tab);
    if (scroll && !wide.matches) tab.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => select(tab, true)));
  wide.addEventListener('change', () => place(tabs.find((t) => t.getAttribute('aria-expanded') === 'true')));
  place(tabs[0]);

  // "Apply to this school" fills in the form's school field.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-apply-school]');
    if (!link) return;
    const select = document.getElementById('applicant-craft');
    if (select) select.value = link.dataset.applySchool;
  });
})();

// Scroll reveal: sections ease in as they come into view.
(function () {
  const auto = [
    '#programmes h2', '#programmes .grid > *',
    '#journey h2', '#journey .grid > *',
    '#curriculum h2', '#curriculum .grid > *',
    '#admissions h2', '#admissions .grid > *',
    '#admissions-form .grid > *',
  ];
  auto.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => el.setAttribute('data-reveal', ''));
  });

  document.querySelectorAll('#programmes .grid > *, #curriculum .grid.mb-space-2xl > *, #admissions .grid > * > *').forEach((el) => el.classList.add('lift'));

  const items = document.querySelectorAll('[data-reveal]');
  // Stagger siblings so a row of cards arrives one after another.
  items.forEach((el) => {
    const siblings = Array.from(el.parentElement.children).filter((c) => c.hasAttribute('data-reveal'));
    el.style.setProperty('--stagger', Math.min(siblings.indexOf(el), 8));
  });

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  items.forEach((el) => observer.observe(el));
})();

// On a computer, phone and email links often have no app to open them, so
// clicking copies the number/address instead and says so.
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach((link) => {
    if (link.hasAttribute('data-keep-link')) return;
    link.addEventListener('click', async (event) => {
      const value = decodeURIComponent(link.getAttribute('href').replace(/^(tel:|mailto:)/, '').split('?')[0]);
      event.preventDefault();
      try {
        await navigator.clipboard.writeText(value);
        toast(`Copied ${value}`);
      } catch (err) {
        toast(value);
      }
    });
  });

  let timer;
  function toast(message) {
    let el = document.getElementById('copy-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'copy-toast';
      el.setAttribute('role', 'status');
      el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-space-md py-space-xs rounded-lg bg-primary text-secondary-fixed font-label-md text-label-md shadow-xl';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.add('hidden'), 2200);
  }
})();
