import { sendEmail } from '../../../_shared/email.js';
import { STATUS, ownerEmail, providerEmail } from '../../../_shared/neatpour-config.js';
import { findRespondToken, getRequest, recordProviderResponse, updateStatus, logEvent } from '../../../_shared/neatpour-db.js';
import { ownerProviderResponse, introEmail } from '../../../_shared/neatpour-email.js';

function landingPage(heading, message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Cedar Escape</title>
     <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"></head>
     <body style="margin:0;font-family:'DM Sans',sans-serif;background:#F6F1E6;color:#2B271F;">
       <div style="background:linear-gradient(155deg,#37452F 0%,#232D1D 100%);padding:48px 24px;text-align:center;">
         <div style="font-family:'Playfair Display',serif;font-style:italic;color:#F6F1E6;font-size:15px;letter-spacing:0.08em;">CEDAR ESCAPE</div>
       </div>
       <div style="max-width:480px;margin:0 auto;padding:56px 24px;text-align:center;">
         <h1 style="font-family:'Playfair Display',serif;font-style:italic;font-weight:500;font-size:28px;color:#232D1D;margin:0 0 16px;">${heading}</h1>
         <p style="font-size:15.5px;color:#4b453b;line-height:1.6;">${message}</p>
       </div>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } }
  );
}

async function trySend(db, requestId, eventName, env, opts) {
  try {
    await sendEmail(env, opts);
    await logEvent(db, requestId, eventName);
    return true;
  } catch (err) {
    await logEvent(db, requestId, `${eventName}_failed`, { error: String(err && err.message) }).catch(() => {});
    return false;
  }
}

// One tap from the provider's email: no login, no form. The first response wins.
export async function onRequestGet({ request, env, params }) {
  const db = env.CLAY_DB;
  const decision = new URL(request.url).searchParams.get('decision');
  if (decision !== 'available' && decision !== 'unavailable') {
    return landingPage('Link not recognized', 'Please use the buttons in the original email, or reply to it and we will help.');
  }
  const tokenRow = await findRespondToken(db, params.token);
  if (!tokenRow) {
    return landingPage('Link not recognized', 'This link is not valid. Please reply to the original email and we will help.');
  }

  const won = await recordProviderResponse(db, tokenRow.request_id, decision);
  if (!won) {
    return landingPage('Already received', 'This request has already been answered, so no further action is needed. Thank you!');
  }
  await logEvent(db, tokenRow.request_id, `provider_${decision}`);
  let row = await getRequest(db, tokenRow.request_id);

  if (decision === 'unavailable') {
    // Owner decides what happens next: the guest is deliberately not emailed.
    const msg = ownerProviderResponse(row, 'unavailable');
    await trySend(db, row.id, 'owner_notified_unavailable', env, { to: ownerEmail(env), subject: msg.subject, html: msg.html, replyTo: row.guest_email });
    return landingPage('Thank you!', 'We have let Cedar Escape know you are not available for this request. No further action is needed from you.');
  }

  // Available: one shared introduction to the guest and provider, then tell the owner.
  const providerTo = providerEmail(env);
  let introOk = false;
  if (providerTo) {
    const m = introEmail(env, row);
    introOk = await trySend(db, row.id, 'intro_sent', env, { to: [row.guest_email, providerTo], subject: m.subject, html: m.html, replyTo: [row.guest_email, providerTo] });
  } else {
    await logEvent(db, row.id, 'intro_not_sent_no_provider_email');
  }
  if (introOk) await updateStatus(db, row.id, STATUS.HANDED_OFF, { handoff_sent_at: new Date().toISOString() });
  row = await getRequest(db, row.id);
  const o = ownerProviderResponse(row, 'available');
  await trySend(db, row.id, 'owner_notified_available', env, { to: ownerEmail(env), subject: o.subject, html: o.html, replyTo: row.guest_email });

  return landingPage('Thank you!', 'We have emailed you and the guest together, so you can take it from here. Just reply to that email to reach them.');
}
