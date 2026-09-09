require('dotenv').config();

const path = require('path');
const express = require('express');
const applicationsRouter = require('./routes/applications');
const webhooksRouter = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/applications', applicationsRouter);
app.use('/api/webhooks', webhooksRouter);

app.get('/', (req, res) => {
  res.render('index', {
    cohort: '2026/2027',
    resumptionDate: '28th September 2026',
    registrationFee: '₦20,000',
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  });
});

function isPlaceholder(value) {
  return !value || value.includes('xxxx');
}

app.listen(PORT, () => {
  console.log(`Root & Rise site running at http://localhost:${PORT}`);
  if (isPlaceholder(process.env.PAYSTACK_PUBLIC_KEY) || isPlaceholder(process.env.PAYSTACK_SECRET_KEY)) {
    console.warn('⚠️  Paystack keys look like placeholders — payment will not work until real PAYSTACK_PUBLIC_KEY and PAYSTACK_SECRET_KEY are set in .env.');
  }
  if (isPlaceholder(process.env.SMTP_USER) || isPlaceholder(process.env.SMTP_APP_PASSWORD)) {
    console.warn('⚠️  Email credentials look like placeholders — application notification emails will not send until real SMTP_USER and SMTP_APP_PASSWORD are set in .env.');
  }
});
