// JsSIP configuration helpers for AsteriskPanel softphone

// ── Types ─────────────────────────────────────────────────────────────

export interface JsSIPUAConfig {
  uri: string;
  password: string;
  ws_servers: string;
  display_name: string;
  register: boolean;
  session_timers: boolean;
  connection_recovery_min_interval: number;
  connection_recovery_max_interval: number;
  registrar_server?: string;
  contact_uri?: string;
  user_agent: string;
}

export interface JsSIPCallOptions {
  mediaConstraints: {
    audio: boolean;
    video: boolean;
  };
  pcConfig: {
    iceServers: { urls: string | string[] }[];
  };
  rtcOfferConstraints?: {
    offerToReceiveAudio: boolean;
    offerToReceiveVideo: boolean;
  };
}

export interface JsSIPRegisteredEvent {
  response: unknown;
}

export interface JsSIPUnregisteredEvent {
  response: unknown;
  cause?: string;
}

export interface JsSIPRegistrationFailedEvent {
  response: unknown;
  cause: string;
}

export interface JsSIPNewRTCSessionEvent {
  originator: 'local' | 'remote';
  session: JsSIPSession;
  request: unknown;
}

export interface JsSIPSession {
  direction: 'incoming' | 'outgoing';
  remote_identity: {
    uri: {
      user: string;
      host: string;
    };
    display_name: string;
  };
  connection: RTCPeerConnection;
  start_time?: Date;
  end_time?: Date;
  end_cause?: string;

  // Methods
  answer(options?: JsSIPCallOptions): void;
  terminate(options?: { cause?: string; status_code?: number }): void;
  hold(options?: unknown): void;
  unhold(options?: unknown): void;
  mute(options?: { audio?: boolean; video?: boolean }): void;
  unmute(options?: { audio?: boolean; video?: boolean }): void;
  sendDTMF(tone: string, options?: { duration?: number; interToneGap?: number }): void;
  refer(target: string, options?: unknown): void;
  isOnHold(): { local: boolean; remote: boolean };
  isMuted(): { audio: boolean; video: boolean };

  // Event registration
  on(event: 'accepted', handler: (data: { originator: string }) => void): void;
  on(event: 'confirmed', handler: (data: { originator: string }) => void): void;
  on(event: 'ended', handler: (data: { originator: string; cause: string; message?: unknown }) => void): void;
  on(event: 'failed', handler: (data: { originator: string; cause: string; message?: unknown }) => void): void;
  on(event: 'hold', handler: (data: { originator: string }) => void): void;
  on(event: 'unhold', handler: (data: { originator: string }) => void): void;
  on(event: 'muted', handler: (data: { audio: boolean; video: boolean }) => void): void;
  on(event: 'unmuted', handler: (data: { audio: boolean; video: boolean }) => void): void;
  on(event: 'peerconnection', handler: (data: { peerconnection: RTCPeerConnection }) => void): void;
  on(event: 'sdp', handler: (data: { originator: string; type: string; sdp: string }) => void): void;
  on(event: 'progress', handler: (data: { originator: string }) => void): void;
  on(event: 'refer', handler: (data: unknown) => void): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

export interface JsSIPUA {
  start(): void;
  stop(): void;
  register(): void;
  unregister(options?: { all?: boolean }): void;
  call(target: string, options?: JsSIPCallOptions): JsSIPSession;
  isRegistered(): boolean;
  isConnected(): boolean;

  on(event: 'registered', handler: (data: JsSIPRegisteredEvent) => void): void;
  on(event: 'unregistered', handler: (data: JsSIPUnregisteredEvent) => void): void;
  on(event: 'registrationFailed', handler: (data: JsSIPRegistrationFailedEvent) => void): void;
  on(event: 'newRTCSession', handler: (data: JsSIPNewRTCSessionEvent) => void): void;
  on(event: 'connected', handler: () => void): void;
  on(event: 'disconnected', handler: () => void): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

// ── Configuration ─────────────────────────────────────────────────────

const DEFAULT_WS_URL = 'wss://localhost:8089/ws';

function getWebSocketUrl(): string {
  return import.meta.env.VITE_ASTERISK_WS || DEFAULT_WS_URL;
}

function extractHost(wsUrl: string): string {
  try {
    const url = new URL(wsUrl);
    return url.hostname;
  } catch {
    return 'localhost';
  }
}

/**
 * Creates JsSIP UA configuration for connecting to Asterisk.
 *
 * @param server - The WebSocket server URL (overrides VITE_ASTERISK_WS)
 * @param extension - The SIP extension number
 * @param password - The SIP password for the extension
 * @returns Configuration object compatible with JsSIP.UA constructor
 */
export function createJsSIPConfig(
  server: string,
  extension: string,
  password: string,
): JsSIPUAConfig {
  const wsUrl = server || getWebSocketUrl();
  const host = extractHost(wsUrl);

  return {
    uri: `sip:${extension}@${host}`,
    password,
    ws_servers: wsUrl,
    display_name: extension,
    register: true,
    session_timers: false,
    connection_recovery_min_interval: 2,
    connection_recovery_max_interval: 30,
    user_agent: 'AsteriskPanel-Softphone/1.0',
  };
}

/**
 * Creates call options for making or answering calls via JsSIP.
 *
 * @returns Options object to pass to session.call() or session.answer()
 */
export function createCallOptions(): JsSIPCallOptions {
  return {
    mediaConstraints: {
      audio: true,
      video: false,
    },
    pcConfig: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    },
    rtcOfferConstraints: {
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    },
  };
}
