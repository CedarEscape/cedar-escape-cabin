// Shared helpers for the Cedar Rewards pages.

function rwEscapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rwFormatPoints(n) {
  return Number(n || 0).toLocaleString();
}

// Fetches /api/rewards/me. Redirects to sign-in if the guest has no valid
// session, unless `optional` is true (used on pages guests can browse
// signed out, like the shop preview).
async function rwRequireSession({ optional = false } = {}) {
  const res = await fetch('/api/rewards/me', { credentials: 'same-origin' });
  if (res.status === 401) {
    if (optional) return null;
    window.location.href = '/rewards-signin.html';
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

async function rwLogout() {
  await fetch('/api/rewards/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/rewards.html';
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.burger').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nav = btn.closest('.nav');
      var links = nav && nav.querySelector('.nav-links');
      if (links) links.classList.toggle('open');
    });
  });
  document.querySelectorAll('.js-rw-logout').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      rwLogout();
    });
  });
});
