// Renders the EJS templates into a plain static site in dist/. Cloudflare
// Workers can't run EJS at request time (it compiles templates with
// `new Function`, which Workers forbid), and nothing on the page changes
// per visitor anyway — so it's rendered once here, at deploy time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { COHORT, RESUMPTION_DATE, REGISTRATION_FEE_NAIRA, CRAFT_LABELS, ADMISSION_STAGES, SCHOOLS, BANK_TRANSFER, WHATSAPP_NUMBER } from '../src/config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), distDir, { recursive: true });

const html = await ejs.renderFile(path.join(root, 'views', 'index.ejs'), {
  cohort: COHORT,
  resumptionDate: RESUMPTION_DATE,
  registrationFee: `₦${REGISTRATION_FEE_NAIRA.toLocaleString('en-NG')}`,
  schools: SCHOOLS,
  bankTransfer: BANK_TRANSFER,
  whatsappNumber: WHATSAPP_NUMBER,
});
fs.writeFileSync(path.join(distDir, 'index.html'), html);

// The admin page is only a shell — every bit of applicant data it shows is
// fetched from /api/admin/*, which requires signing in.
const adminHtml = await ejs.renderFile(path.join(root, 'views', 'admin.ejs'), {
  cohort: COHORT,
  crafts: CRAFT_LABELS,
  stages: ADMISSION_STAGES,
});
fs.mkdirSync(path.join(distDir, 'admin'), { recursive: true });
fs.writeFileSync(path.join(distDir, 'admin', 'index.html'), adminHtml);

console.log('Built static site into dist/');
