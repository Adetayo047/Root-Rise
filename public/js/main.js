(function () {
  const form = document.getElementById('candidate-application-form');
  const submitBtn = document.getElementById('submit-application-btn');
  const submitBtnLabel = document.getElementById('submit-application-btn-label');
  const successNotice = document.getElementById('application-success-notice');
  const errorNotice = document.getElementById('application-error-notice');

  function showError(message) {
    errorNotice.textContent = message;
    errorNotice.classList.remove('hidden');
  }

  function clearError() {
    errorNotice.textContent = '';
    errorNotice.classList.add('hidden');
  }

  function setLoading(isLoading, label) {
    submitBtn.disabled = isLoading;
    submitBtnLabel.textContent = label;
  }

  async function verifyPayment(reference) {
    const res = await fetch(`/api/applications/${encodeURIComponent(reference)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'We could not confirm your payment. Please contact support with your reference: ' + reference);
    }
  }

  function openPaystackCheckout({ reference, email, publicKey, amountKobo }) {
    if (!publicKey) {
      showError('Online payment is not configured yet. Please contact the admissions desk to complete your registration.');
      setLoading(false, 'Pay & Submit');
      return;
    }

    const handler = PaystackPop.setup({
      key: publicKey,
      email: email,
      amount: amountKobo,
      currency: 'NGN',
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: 'Application Reference', variable_name: 'reference', value: reference },
        ],
      },
      callback: function () {
        // Paystack reported success client-side — confirm with our server
        // (which re-checks with Paystack directly) before trusting it.
        setLoading(true, 'Confirming payment...');
        verifyPayment(reference)
          .then(() => {
            form.classList.add('hidden');
            successNotice.classList.remove('hidden');
          })
          .catch((err) => {
            showError(err.message);
            setLoading(false, 'Pay & Submit');
          });
      },
      onClose: function () {
        setLoading(false, 'Pay & Submit');
      },
    });

    handler.openIframe();
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();
    setLoading(true, 'Preparing payment...');

    const payload = {
      name: document.getElementById('applicant-name').value,
      email: document.getElementById('applicant-email').value,
      phone: document.getElementById('applicant-phone').value,
      age: document.getElementById('applicant-age').value,
      craft: document.getElementById('applicant-craft').value,
      scholarshipOptIn: document.getElementById('scholarship-opt-in').checked,
      statement: document.getElementById('applicant-statement').value,
    };

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        showError((data.errors && data.errors.join(' ')) || 'Something went wrong. Please check your details and try again.');
        setLoading(false, 'Pay & Submit');
        return;
      }

      setLoading(true, 'Opening secure payment...');
      openPaystackCheckout(data);
    } catch (err) {
      showError('Network error — please check your connection and try again.');
      setLoading(false, 'Pay & Submit');
    }
  });
})();
