// SIP.js configuration helpers for AsteriskPanel softphone

// ── Types ─────────────────────────────────────────────────────────────

export interface SIPConfig {
  uri: string;
  wsUrl: string;
  authorizationUsername: string;
  authorizationPassword: string;
  displayName: string;
  domain: string;
}

export type SIPSessionState =
  | 'Initial'
  | 'Establishing'
  | 'Established'
  | 'Terminating'
  | 'Terminated';

// ── Configuration ─────────────────────────────────────────────────────

/**
 * Creates SIP.js configuration for connecting to Asterisk.
 *
 * @param wsUrl - The WebSocket proxy URL (e.g. wss://vd.all-cloud-x.com/ws-sip-proxy)
 * @param extension - The SIP extension number (default: '101')
 * @param password - The SIP password for the extension (default: 'Maddy210521')
 * @param domain - The Asterisk host / SIP domain
 * @returns Configuration object for SIP.js UserAgent
 */
export function createSIPConfig(
  wsUrl: string,
  extension: string = '101',
  password: string = 'Maddy210521',
  domain: string = 'localhost',
): SIPConfig {
  return {
    uri: `sip:${extension}@${domain}`,
    wsUrl,
    authorizationUsername: extension,
    authorizationPassword: password,
    displayName: extension,
    domain,
  };
}
