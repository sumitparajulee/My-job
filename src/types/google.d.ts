// Minimal ambient types for Google Identity Services (GIS).
// GIS is loaded at runtime via a <script> tag (see lib/googleAuth.ts), not
// installed as an npm package — there's no official @types package for it,
// so this covers only the handful of calls Docket actually makes.
export {};

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type: string; message?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}
