// A short, maintained list of hosts that are known to send
// X-Frame-Options / frame-ancestors headers that block embedding in an
// iframe on someone else's site. This can never be exhaustive — any
// site can add that header at any time — so it's just a fast-path to
// skip straight to "Open in new tab" for the sites people paste in
// most often (mail, banking, social) instead of showing a blank/broken
// iframe first. Unlisted domains still get tried as a normal iframe;
// if they fail, the person can always use the same "Open in new tab"
// button that's already next to every tab.

const KNOWN_UNFRAMEABLE_SUFFIXES = [
  // Google — Gmail, Drive, Docs, Calendar, accounts/login all refuse framing.
  'mail.google.com',
  'accounts.google.com',
  'drive.google.com',
  'docs.google.com',
  'calendar.google.com',

  // Social / messaging
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'reddit.com',
  'tiktok.com',

  // Banking / finance (clickjacking protection is standard here)
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citibank.com',
  'capitalone.com',
  'paypal.com',
  'venmo.com',

  // Other common login-walled apps
  'github.com',
  'amazon.com',
  'netflix.com',
  'microsoft.com',
  'login.microsoftonline.com',
  'outlook.com',
  'live.com',
  'apple.com',
  'icloud.com',
];

// True if `hostname` is one of the listed hosts, or a subdomain of one
// (so "www.facebook.com" and "m.facebook.com" both match "facebook.com").
export function isKnownUnframeable(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return KNOWN_UNFRAMEABLE_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}
