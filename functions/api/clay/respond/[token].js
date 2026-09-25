import { peekToken, consumeToken, markTokenUsed, invalidateTokens, getOrCreateToken } from '../../../_shared/clay-tokens.js';
import { getClayRequest, updateClayStatus, logClayEvent } from '../../../_shared/clay-db.js';
import { sendEmail, renderShell, renderButton, renderPanel, renderPanelRow, formatDate, formatTime } from '../../../_shared/email.js';
import { EXPERIENCES } from '../request.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function landingPage(heading, message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cedar Escape</title>
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
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

// Short, no-login response screen for LP to supply current price + booking
// info once they've said they're available. Pre-filled with the request
// summary Cedar Escape already sent — LP never re-types guest/date info.
function availableForm(req, { formToken, errorMsg } = {}) {
  const summaryPanel = renderPanel(
    renderPanelRow('Guest', escapeHtml(`${req.guest_first_name} ${req.guest_last_name}`)) +
      renderPanelRow('Experience', escapeHtml(EXPERIENCES[req.experience_code] || req.experience_code)) +
      renderPanelRow('Group size', String(req.group_size)) +
      renderPanelRow('Preferred date & time', `${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}`) +
      (req.alternate_date ? renderPanelRow('Alternate date & time', `${escapeHtml(formatDate(req.alternate_date))} at ${escapeHtml(formatTime(req.alternate_time))}`) : '') +
      (req.notes ? renderPanelRow('Notes', escapeHtml(req.notes)) : '')
  );

  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cedar Escape</title>
     <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"></head>
     <body style="margin:0;font-family:'DM Sans',sans-serif;background:#F6F1E6;color:#2B271F;">
       <div style="background:linear-gradient(155deg,#37452F 0%,#232D1D 100%);padding:40px 24px;text-align:center;">
         <div style="font-family:'Playfair Display',serif;font-style:italic;color:#F6F1E6;font-size:15px;letter-spacing:0.08em;">CEDAR ESCAPE</div>
       </div>
       <div style="max-width:520px;margin:0 auto;padding:40px 24px 64px;">
         <h1 style="font-family:'Playfair Display',serif;font-style:italic;font-weight:500;font-size:26px;color:#232D1D;margin:0 0 10px;">You're available &mdash; a couple details?</h1>
         <p style="font-size:15px;color:#4b453b;line-height:1.6;margin-bottom:20px;">No account needed. Just share the current price and how the guest should book, and we'll pass it along.</p>
         ${summaryPanel}
         ${errorMsg ? `<p style="color:#a33;font-size:14px;margin:16px 0 0;">${escapeHtml(errorMsg)}</p>` : ''}
         <form method="POST" action="/api/clay/respond/${encodeURIComponent(formToken)}" style="margin-top:24px;">
           <label style="display:block;font-size:13px;font-weight:600;color:#4b453b;margin-bottom:6px;">Current price / quote <span style="color:#a33;">*</span></label>
           <input name="price" type="text" required placeholder="e.g. $45 per person, minimum 6" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d8d0bc;border-radius:4px;font-size:15px;margin-bottom:18px;">

           <label style="display:block;font-size:13px;font-weight:600;color:#4b453b;margin-bottom:6px;">Booking link or instructions</label>
           <textarea name="bookingInfo" rows="3" placeholder="A link the guest can book at, or how they should reach you" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d8d0bc;border-radius:4px;font-size:15px;margin-bottom:18px;"></textarea>

           <label style="display:block;font-size:13px;font-weight:600;color:#4b453b;margin-bottom:6px;">Note for the guest (optional)</label>
           <textarea name="note" rows="2" placeholder="Anything else the guest should know" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d8d0bc;border-radius:4px;font-size:15px;margin-bottom:22px;"></textarea>

           <button type="submit" style="display:inline-block;padding:15px 30px;border-radius:30px;border:1px solid #232D1D;background:#232D1D;color:#FAF6EE;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:bold;font-size:13.5px;letter-spacing:0.04em;cursor:pointer;">SEND TO GUEST</button>
         </form>
       </div>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

async function sendGuestAvailableEmail(env, db, req) {
  const experienceLabel = EXPERIENCES[req.experience_code] || req.experience_code;
  const recapPanel = renderPanel(
    renderPanelRow('Experience', escapeHtml(experienceLabel)) +
      renderPanelRow('Date & time', `${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}`) +
      renderPanelRow('Group size', String(req.group_size))
  );
  const bookingIsUrl = /^https?:\/\//i.test(req.booking_url || '');
  const pricingPanel = renderPanel(
    renderPanelRow('Current pricing', escapeHtml(req.quoted_price_text)) +
      (req.booking_url && !bookingIsUrl ? renderPanelRow('Booking instructions', escapeHtml(req.booking_url)) : '') +
      (req.provider_note ? renderPanelRow('Note from Friendly City Clay', escapeHtml(req.provider_note)) : '')
  );

  const html = renderShell({
    title: 'Your Friendly City Clay experience is available',
    heroEyebrow: 'Availability Update',
    heroHeadline: 'Good news!',
    bodyHtml: `
      <p>Hi ${escapeHtml(req.guest_first_name)},</p>
      <p>Good news &mdash; Friendly City Clay &amp; Art Center can accommodate your group!</p>
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8168;margin:22px 0 10px;">Your Request</div>
      ${recapPanel}
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8168;margin:22px 0 10px;">Current Pricing &amp; Next Steps</div>
      ${pricingPanel}
      ${bookingIsUrl ? `<div style="text-align:center;margin:28px 0;">${renderButton({ href: req.booking_url, label: 'COMPLETE BOOKING WITH FRIENDLY CITY CLAY →' })}</div>` : ''}
      <p style="font-size:13px;color:#6b6555;">Your experience is not booked through Cedar Escape. Final booking, payment, cancellation terms, and any experience-specific details are handled directly by Friendly City Clay &amp; Art Center.</p>
      <p style="margin-top:16px;font-style:italic;">Courtney<br>Cedar Escape</p>
    `,
  });
  await sendEmail(env, {
    to: req.guest_email,
    cc: env.COURTESY_EMAIL,
    subject: 'Your Friendly City Clay experience is available',
    html,
  });
  await updateClayStatus(db, req.id, 'GUEST_NOTIFIED', { guest_notified_at: new Date().toISOString() });
  await logClayEvent(db, req.id, 'guest_notified_available');
}

async function sendGuestUnavailableEmail(env, db, req) {
  const workshopsUrl = 'https://www.friendlycityclay.com/current-classes';
  const html = renderShell({
    title: 'Update on your Friendly City Clay request',
    heroEyebrow: 'Availability Update',
    heroHeadline: "Here's an update.",
    bodyHtml: `
      <p>Hi ${escapeHtml(req.guest_first_name)},</p>
      <p>Thanks again for sending your private experience request.</p>
      <p>Unfortunately, Friendly City Clay isn't available for the date and time you requested.</p>
      <p>Feel free to submit another request with a different date, or explore their currently scheduled workshops instead.</p>
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: workshopsUrl, label: 'VIEW WORKSHOPS + SAVE 10%' })}</div>
      <p style="font-size:13px;color:#6b6555;">Cedar Escape guests receive 10% off scheduled workshops with code <strong>CedarEscape</strong>.</p>
      <p style="margin-top:16px;font-style:italic;">Courtney<br>Cedar Escape</p>
    `,
  });
  await sendEmail(env, {
    to: req.guest_email,
    cc: env.COURTESY_EMAIL,
    subject: 'Update on your Friendly City Clay request',
    html,
  });
  await updateClayStatus(db, req.id, 'GUEST_NOTIFIED', { guest_notified_at: new Date().toISOString() });
  await logClayEvent(db, req.id, 'guest_notified_unavailable');
}

export async function onRequestGet({ request, env, params }) {
  const token = params.token;
  const url = new URL(request.url);
  const decision = url.searchParams.get('decision');
  const db = env.CLAY_DB;

  const respondRow = await peekToken(db, token, 'lp_respond');
  if (respondRow) {
    if (decision === 'unavailable') {
      if (respondRow.used_at) return landingPage('Already handled', 'This request has already been responded to &mdash; no further action is needed.');
      await consumeToken(db, token, 'lp_respond');
      await invalidateTokens(db, respondRow.request_id, 'lp_respond');
      await updateClayStatus(db, respondRow.request_id, 'UNAVAILABLE');
      await logClayEvent(db, respondRow.request_id, 'provider_unavailable');
      const req = await getClayRequest(db, respondRow.request_id);
      await sendGuestUnavailableEmail(env, db, req);
      return landingPage('Response received.', "Thanks for letting us know &mdash; we've let the guest know this time didn't work.");
    }

    if (decision === 'available') {
      const req = await getClayRequest(db, respondRow.request_id);
      if (req.status === 'AVAILABLE' || req.status === 'GUEST_NOTIFIED') {
        return landingPage('Already submitted', "You already sent price and booking details for this request &mdash; no further action is needed.");
      }
      const formToken = await getOrCreateToken(db, respondRow.request_id, 'lp_available_form');
      return availableForm(req, { formToken });
    }

    return landingPage('Something went wrong', 'This link is missing a valid decision.');
  }

  const formRow = await peekToken(db, token, 'lp_available_form');
  if (formRow) {
    const req = await getClayRequest(db, formRow.request_id);
    if (formRow.used_at || req.status === 'AVAILABLE' || req.status === 'GUEST_NOTIFIED') {
      return landingPage('Already submitted', 'You already sent price and booking details for this request.');
    }
    return availableForm(req, { formToken: token });
  }

  return landingPage('Link expired', 'This link is invalid or has expired.');
}

export async function onRequestPost({ request, env, params }) {
  const token = params.token;
  const db = env.CLAY_DB;

  const formRow = await peekToken(db, token, 'lp_available_form');
  if (!formRow) return landingPage('Link expired', 'This link is invalid or has expired.');

  const req = await getClayRequest(db, formRow.request_id);
  if (formRow.used_at || req.status === 'AVAILABLE' || req.status === 'GUEST_NOTIFIED') {
    return landingPage('Already submitted', 'You already sent price and booking details for this request.');
  }

  const formData = await request.formData();
  const price = (formData.get('price') || '').toString().trim();
  const bookingInfo = (formData.get('bookingInfo') || '').toString().trim();
  const note = (formData.get('note') || '').toString().trim();

  if (!price) {
    return availableForm(req, { formToken: token, errorMsg: 'Please enter a current price or quote.' });
  }

  await markTokenUsed(db, token);
  await invalidateTokens(db, formRow.request_id, 'lp_respond');
  await updateClayStatus(db, formRow.request_id, 'AVAILABLE', {
    quoted_price_text: price,
    booking_url: bookingInfo || null,
    provider_note: note || null,
  });
  await logClayEvent(db, formRow.request_id, 'provider_available_submitted', { price });

  const updatedReq = await getClayRequest(db, formRow.request_id);
  await sendGuestAvailableEmail(env, db, updatedReq);

  return landingPage('Sent to guest.', "Thanks &mdash; we've passed your price and booking details along to the guest.");
}
