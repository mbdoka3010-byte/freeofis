import { createV4Application } from '../application/application.mjs';
import { V4_DATABASE_NAME } from '../persistence/schema.mjs';
import { createFreshProductionController } from './fresh-production-control.mjs';

const $ = selector => document.querySelector(selector);
const enable = (selector, on = true) => { $(selector).disabled = !on; };
const message = (text, error = false) => { $('#message').className = error ? 'error' : 'success'; $('#message').textContent = text; };
let app;
let control;
let latest;

$('#database').textContent = `${V4_DATABASE_NAME} (current HTTP-origin browser profile)`;
const display = state => { latest = state; $('#fresh-summary').textContent = JSON.stringify(state, null, 2); };

async function guarded(work) {
  try { message('Working…'); await work(); }
  catch (error) { message(error.message || String(error), true); }
}

async function diagnose() {
  const state = await control.diagnose();
  display(state);
  enable('#fresh-reset', false);
  enable('#fresh-repair', false);
  enable('#fresh-understanding', false);
  enable('#fresh-activate', false);
  if (state.activation && state.eligible) {
    $('#fresh-result').textContent = 'ALREADY ACTIVATED — VERIFIED';
    return message('ALREADY ACTIVATED — VERIFIED');
  }
  if (state.eligible) {
    $('#fresh-result').textContent = 'FRESH-START SAFETY VERIFIED';
    enable('#fresh-understanding');
    enable('#fresh-activate', $('#fresh-understanding').checked);
    return message('FRESH-START SAFETY VERIFIED');
  }
  $('#fresh-result').textContent = 'FRESH START NOT YET ELIGIBLE';
  const codes = state.blockers.map(item => item.code);
  const resettable = state.storeReports.length > 0 && state.storeReports.every(report => report.safelyDisposable) && !codes.some(code => ['FRESH_START_UNKNOWN_DATA_PRESENT', 'MIGRATION_RUN_ALREADY_COMPLETED', 'PRODUCTION_BOOTSTRAP_SCOPE_INCOMPLETE', 'PRODUCTION_BOOTSTRAP_CONTEXT_INCONSISTENT', 'PRODUCTION_OWNER_CONTEXT_INCONSISTENT', 'PRODUCTION_BOOTSTRAP_SCOPE_AMBIGUOUS'].includes(code));
  enable('#fresh-reset', resettable);
  const normalizationOnly = codes.every(code => code === 'PRODUCTION_SCOPE_NORMALIZATION_REQUIRED');
  enable('#fresh-repair', normalizationOnly);
  message(`Complete blocker report: ${codes.join(', ')}`, true);
}

$('#fresh-inspect').onclick = () => guarded(diagnose);
$('#fresh-reset').onclick = () => guarded(async () => {
  if (!confirm('RESET V4 DEVELOPMENT DATA FOR FRESH PRODUCTION? This removes the enumerated pre-activation operational/accounting records but preserves bootstrap scope, configuration, audit events, and immutable migration snapshots.')) throw Error('DEVELOPMENT_RESET_CANCELLED');
  display(await control.resetDevelopmentData());
  await diagnose();
});
$('#fresh-repair').onclick = () => guarded(async () => { display(await control.normalize()); await diagnose(); });
$('#fresh-understanding').onchange = () => enable('#fresh-activate', $('#fresh-understanding').checked && latest?.eligible);
$('#fresh-activate').onclick = () => guarded(async () => {
  if (!$('#fresh-understanding').checked) throw Error('FRESH_START_ACKNOWLEDGEMENT_REQUIRED');
  const result = await control.activate();
  display(result.verification);
  $('#fresh-result').textContent = result.alreadyActivated ? 'ALREADY ACTIVATED — VERIFIED' : 'FRESH V4 PRODUCTION ACTIVATED';
  enable('#fresh-understanding', false);
  enable('#fresh-activate', false);
  message($('#fresh-result').textContent);
});

async function initialize() {
  app = await createV4Application({ indexedDB, databaseName: V4_DATABASE_NAME });
  control = createFreshProductionController({ app, databaseName: V4_DATABASE_NAME });
  await diagnose();
}

initialize().catch(error => message(error.message || String(error), true));
addEventListener('beforeunload', () => app?.close());
