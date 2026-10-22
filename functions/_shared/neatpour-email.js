import { renderShell, renderButton, renderPanel, renderPanelRow, formatDate, formatTime } from './email.js';
import { NEATPOUR_EXPERIENCES, PROVIDER_LABEL, STATUS_LABEL, providerFirstName, ownerEmail } from './neatpour-config.js';

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SECTION = "font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8168;margin:22px 0 10px;";
const NOTE = 'font-size:13px;color:#6b6555;';
const SIGN = '<p style="margin-top:16px;font-style:italic;">Courtney<br>Cedar Escape</p>';

const DISCLAIMER = 'Submitting a request does not confirm your experience. No payment is due when submitting your request.';
const PROVIDER_STATEMENT = `All experiences are subject to availability. ${PROVIDER_LABEL} will coordinate experience details and payment directly with guests following their inquiry.`;

export const experienceLabel = (code) => (NEATPOUR_EXPERIENCES[code] ? NEATPOUR_EXPERIENCES[code].label : code);
const when = (d, t) => `${esc(formatDate(d))}<br>${esc(formatTime(t))}`;
const fullName = (r) => `${r.guest_first_name} ${r.guest_last_name}`;

function requestRows(r, { ref = false, contact = false, checkin = false } = {}) {
  return (
    (ref ? renderPanelRow('Reference ID', esc(r.id)) : '') +
    (contact || ref ? renderPanelRow('Guest', esc(fullName(r)), 'guests') : '') +
    (contact ? renderPanelRow('Email', esc(r.guest_email)) + renderPanelRow('Phone', esc(r.guest_phone)) : '') +
    (checkin && r.checkin_date ? renderPanelRow('Cedar Escape check-in', esc(formatDate(r.checkin_date)), 'calendar') : '') +
    renderPanelRow('Experience', esc(experienceLabel(r.experience_code))) +
    renderPanelRow('Number of guests', String(r.group_size), 'guests') +
    renderPanelRow('Preferred date & time', when(r.preferred_date, r.preferred_time), 'calendar') +
    (r.alternate_date ? renderPanelRow('Alternate date & time', when(r.alternate_date, r.alternate_time), 'calendar') : '') +
    (r.class_preferences ? renderPanelRow('Would love to learn', esc(r.class_preferences)) : '') +
    (r.notes ? renderPanelRow('Notes / special requests', esc(r.notes)) : '')
  );
}

// ---- Email 1: guest acknowledgement -------------------------------------
export function guestAcknowledgement(r) {
  return {
    subject: `We received your ${PROVIDER_LABEL} experience request`,
    html: renderShell({
      title: `We received your ${PROVIDER_LABEL} request`,
      heroEyebrow: 'Request Received',
      heroHeadline: 'Request received!',
      bodyHtml: `
        <p>Hi ${esc(r.guest_first_name)},</p>
        <p>Thank you for your request. We're checking availability with ${PROVIDER_LABEL} for your Cedar Escape cocktail experience, and we'll email you with an update.</p>
        <div style="${SECTION}">Your Request</div>
        ${renderPanel(requestRows(r, { ref: true }))}
        <p style="margin-top:10px;"><strong>${DISCLAIMER}</strong></p>
        <p style="${NOTE}">${PROVIDER_STATEMENT}</p>
        ${SIGN}
      `,
    }),
  };
}

// ---- Email 2: provider availability request ------------------------------
export function providerAvailabilityRequest(env, r, { availableUrl, unavailableUrl }) {
  const questionUrl = `mailto:${ownerEmail(env)}?subject=${encodeURIComponent(`Question about NEAT POUR request ${r.id}`)}`;
  return {
    subject: `New Cedar Escape cocktail experience request (${r.id})`,
    html: renderShell({
      title: 'New Cedar Escape cocktail experience request',
      heroEyebrow: PROVIDER_LABEL,
      heroHeadline: `Hi ${esc(providerFirstName(env))}, got a moment?`,
      bodyHtml: `
        <p>We have a new Cedar Escape guest interested in a private cocktail experience with ${PROVIDER_LABEL}</p>
        <p>Here are the request details:</p>
        ${renderPanel(requestRows(r, { ref: true }))}
        <p style="margin-top:10px;">Are you available for this request?</p>
        <div style="text-align:center;margin:28px 0;">
          ${renderButton({ href: availableUrl, label: "YES, I'M AVAILABLE", style: 'solid' })}
          ${renderButton({ href: unavailableUrl, label: 'NOT AVAILABLE', style: 'outline' })}
        </div>
        <p style="${NOTE}">One tap is all it takes: no account or login. Need to know something first? You can answer later; this request stays open until you tap Yes or Not available.</p>
        <div style="text-align:center;margin:0 0 8px;">
          ${renderButton({ href: questionUrl, label: 'I HAVE A QUESTION', style: 'outline' })}
        </div>
        <p style="${NOTE}text-align:center;">This opens an email to Cedar Escape with the request number filled in. Replying to this email works too.</p>
        <hr style="border:none;border-top:1px solid rgba(43,39,31,0.12);margin:26px 0;">
        <p style="font-style:italic;">Thank you!<br>Courtney<br>Cedar Escape</p>
      `,
    }),
  };
}

// ---- Owner courtesy: new request ---------------------------------------
export function ownerNewRequest(r, { providerConfigured }) {
  return {
    subject: `NEAT POUR request ${r.id} from ${fullName(r)}`,
    html: renderShell({
      title: 'Cedar Escape: new NEAT POUR request',
      heroEyebrow: 'NEAT POUR CO. — Informational',
      heroHeadline: 'A new cocktail experience request.',
      bodyHtml: `
        <p>A guest just requested a ${PROVIDER_LABEL} experience.</p>
        ${renderPanel(requestRows(r, { ref: true, contact: true, checkin: true }) + renderPanelRow('Current status', esc(STATUS_LABEL[r.status] || r.status)))}
        ${providerConfigured ? `<p style="${NOTE}">The availability request, with Yes / Not available buttons, has been emailed to ${PROVIDER_LABEL} The guest was sent an acknowledgement.</p>` : `<p style="color:#a13b3b;font-weight:700;">${PROVIDER_LABEL} has not been emailed because no provider email address is configured yet. Please forward this request to them manually.</p>`}
      `,
    }),
  };
}

// ---- Owner courtesy: provider responded ---------------------------------
export function ownerProviderResponse(r, decision) {
  if (decision === 'available') {
    return {
      subject: `NEAT POUR CO. is available: ${r.id} (${fullName(r)})`,
      html: renderShell({
        title: 'Cedar Escape: NEAT POUR CO. is available',
        heroEyebrow: 'NEAT POUR CO. — Informational',
        heroHeadline: 'NEAT POUR CO. is available.',
        bodyHtml: `
          <p>${PROVIDER_LABEL} said <strong>yes, available</strong> for this request. ${r.status === 'HANDED_OFF' ? `One introduction email went to the guest and ${PROVIDER_LABEL} together so they can finish coordinating directly. No action needed.` : `<strong>The introduction email to the guest and ${PROVIDER_LABEL} could not be sent. Please connect them manually.</strong>`}</p>
          ${renderPanel(requestRows(r, { ref: true, contact: true, checkin: true }) + renderPanelRow('Current status', esc(STATUS_LABEL[r.status] || r.status)))}
          <p style="${NOTE}">Cedar Escape does not collect payment for this experience, and no calendar invitation was created.</p>
        `,
      }),
    };
  }
  return {
    subject: `Action needed: NEAT POUR CO. is not available (${r.id})`,
    html: renderShell({
      title: 'Cedar Escape: NEAT POUR CO. is not available',
      heroEyebrow: 'Action Needed',
      heroHeadline: 'NEAT POUR CO. is not available.',
      bodyHtml: `
        <p>${PROVIDER_LABEL} replied <strong>not available</strong> for the requested date and time. <strong>The guest has not been told.</strong> You may want to coordinate another date or time with the guest and ${PROVIDER_LABEL}</p>
        ${renderPanel(requestRows(r, { ref: true, contact: true, checkin: true }) + renderPanelRow('NEAT POUR CO. response', 'Not available') + renderPanelRow('Current status', esc(STATUS_LABEL[r.status] || r.status)))}
        <p style="${NOTE}">No payment request was generated.</p>
      `,
    }),
  };
}

// ---- Email 3: one shared introduction to the guest and the provider ----------
export function introEmail(env, r) {
  const amber = esc(providerFirstName(env));
  return {
    subject: `${PROVIDER_LABEL} is available for your Cedar Escape experience (${r.id})`,
    html: renderShell({
      title: `${PROVIDER_LABEL} is available`,
      heroEyebrow: 'Availability Update',
      heroHeadline: 'Good news!',
      bodyHtml: `
        <p>Hi ${esc(r.guest_first_name)} and ${amber},</p>
        <p>Good news: ${PROVIDER_LABEL} is available for the cocktail experience requested through Cedar Escape. I'm introducing you both so you can take it from here.</p>
        <div style="${SECTION}">The Request</div>
        ${renderPanel(requestRows(r, { ref: true, contact: true, checkin: true }))}
        <p>${amber} will coordinate any further details with you directly, including customizing the experience, final details, final pricing and payment.</p>
        <p style="${NOTE}">Your experience is not booked until you finalize it with ${PROVIDER_LABEL} Cedar Escape does not collect payment for this experience. Just hit reply and it will go to you both.</p>
        ${SIGN}
      `,
    }),
  };
}
