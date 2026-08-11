// ════════════════════════════════════════════════════════════════════════
// qcode — all client-side logic
// Chrome behaviour (profile popover, tabs) first, your app logic at the end.
// ════════════════════════════════════════════════════════════════════════

// ── Profile button: set initial letter + toggle popover ─────────────────────
const profileBtn = document.getElementById('profileBtn');
if (profileBtn) {
  const name    = profileBtn.dataset.name || '';
  const initial = profileBtn.querySelector('.profile-initial');
  if (initial) initial.textContent = (name[0] || '?').toUpperCase();

  const popover = document.getElementById('profilePopover');
  profileBtn.addEventListener('click', () => {
    const open = popover.classList.toggle('open');
    profileBtn.classList.toggle('open', open);
  });
  document.addEventListener('click', e => {
    if (!profileBtn.contains(e.target) && !popover.contains(e.target)) {
      popover.classList.remove('open');
      profileBtn.classList.remove('open');
    }
  });
}

// ── Tab switching ───────────────────────────────────────────────────────────
// Each .tab carries data-target="<panel id>"; exactly one .panel is visible.
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const target = tab.dataset.target;
    if (!target) return;
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== target; });
  });
});

// ── App logic ───────────────────────────────────────────────────────────────
// The QR lab lives in #panel-human and is driven by /qr/*.js (loaded after this
// file). The ai and save panels are placeholders — nothing wired up yet.
