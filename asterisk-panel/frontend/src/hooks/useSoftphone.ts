import { useState, useEffect, useRef, useCallback } from 'react';
import JsSIP from 'jssip';
import {
  createJsSIPConfig,
  createCallOptions,
  type JsSIPSession,
  type JsSIPNewRTCSessionEvent,
} from '../lib/jssip-config';

// ── Types ─────────────────────────────────────────────────────────────

export type CallDirection = 'in' | 'out' | null;

export interface UseSoftphoneReturn {
  // State
  registered: boolean;
  inCall: boolean;
  callDirection: CallDirection;
  remoteNumber: string;
  callDuration: number;
  isMuted: boolean;
  isOnHold: boolean;
  currentSession: JsSIPSession | null;

  // Methods
  call: (number: string, trunk?: string) => void;
  answer: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  sendDtmf: (digit: string) => void;
  blindTransfer: (target: string) => void;
  attendedTransfer: (target: string) => void;
}

// ── Helper: attach remote audio stream ────────────────────────────────

function attachRemoteAudio(session: JsSIPSession): HTMLAudioElement | null {
  try {
    const pc = session.connection;
    if (!pc) return null;

    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.id = 'softphone-remote-audio';

    // Remove any existing remote audio element
    const existing = document.getElementById('softphone-remote-audio');
    if (existing) {
      existing.remove();
    }

    // Attach streams when tracks arrive
    pc.ontrack = (event: RTCTrackEvent) => {
      if (event.streams && event.streams[0]) {
        audioEl.srcObject = event.streams[0];
      }
    };

    // Also check if streams are already available
    const receivers = pc.getReceivers();
    if (receivers.length > 0) {
      const stream = new MediaStream();
      receivers.forEach((receiver) => {
        if (receiver.track) {
          stream.addTrack(receiver.track);
        }
      });
      if (stream.getTracks().length > 0) {
        audioEl.srcObject = stream;
      }
    }

    document.body.appendChild(audioEl);
    return audioEl;
  } catch (err) {
    console.error('[useSoftphone] Failed to attach remote audio:', err);
    return null;
  }
}

function removeRemoteAudio(): void {
  const existing = document.getElementById('softphone-remote-audio');
  if (existing) {
    const audioEl = existing as HTMLAudioElement;
    if (audioEl.srcObject) {
      const stream = audioEl.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      audioEl.srcObject = null;
    }
    existing.remove();
  }
}

// ── Helper: browser notification for incoming calls ───────────────────

function showIncomingCallNotification(callerNumber: string): void {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification('Incoming Call', {
      body: `Call from ${callerNumber}`,
      icon: '/favicon.ico',
      tag: 'incoming-call',
      requireInteraction: true,
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification('Incoming Call', {
          body: `Call from ${callerNumber}`,
          icon: '/favicon.ico',
          tag: 'incoming-call',
          requireInteraction: true,
        });
      }
    });
  }
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useSoftphone(
  extension: string,
  password: string,
  server: string,
): UseSoftphoneReturn {
  const [registered, setRegistered] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callDirection, setCallDirection] = useState<CallDirection>(null);
  const [remoteNumber, setRemoteNumber] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);

  const uaRef = useRef<JsSIP.UA | null>(null);
  const sessionRef = useRef<JsSIPSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // ── Call duration timer ──────────────────────────────────────────

  const startTimer = useCallback(() => {
    stopTimer();
    callStartRef.current = Date.now();
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      if (callStartRef.current && mountedRef.current) {
        const elapsed = Math.floor((Date.now() - callStartRef.current) / 1000);
        setCallDuration(elapsed);
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    callStartRef.current = null;
  }, []);

  // ── Reset call state ─────────────────────────────────────────────

  const resetCallState = useCallback(() => {
    setInCall(false);
    setCallDirection(null);
    setRemoteNumber('');
    setCallDuration(0);
    setIsMuted(false);
    setIsOnHold(false);
    sessionRef.current = null;
    stopTimer();
    removeRemoteAudio();
  }, [stopTimer]);

  // ── Session event setup ──────────────────────────────────────────

  const setupSessionEvents = useCallback(
    (session: JsSIPSession) => {
      session.on('accepted', () => {
        if (!mountedRef.current) return;
        setInCall(true);
        startTimer();
        attachRemoteAudio(session);
      });

      session.on('confirmed', () => {
        if (!mountedRef.current) return;
        setInCall(true);
        attachRemoteAudio(session);
      });

      session.on('ended', () => {
        if (!mountedRef.current) return;
        resetCallState();
      });

      session.on('failed', () => {
        if (!mountedRef.current) return;
        resetCallState();
      });

      session.on('hold', () => {
        if (!mountedRef.current) return;
        setIsOnHold(true);
      });

      session.on('unhold', () => {
        if (!mountedRef.current) return;
        setIsOnHold(false);
      });

      session.on('muted', () => {
        if (!mountedRef.current) return;
        setIsMuted(true);
      });

      session.on('unmuted', () => {
        if (!mountedRef.current) return;
        setIsMuted(false);
      });

      // Handle peerconnection for remote audio
      session.on('peerconnection', (data: { peerconnection: RTCPeerConnection }) => {
        data.peerconnection.ontrack = (event: RTCTrackEvent) => {
          const audioEl = document.getElementById(
            'softphone-remote-audio',
          ) as HTMLAudioElement | null;
          if (audioEl && event.streams && event.streams[0]) {
            audioEl.srcObject = event.streams[0];
          }
        };
      });
    },
    [startTimer, resetCallState],
  );

  // ── JsSIP UA lifecycle ───────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    if (!extension || !password) {
      return;
    }

    const config = createJsSIPConfig(server, extension, password);

    // Create the WebSocket interface
    const socket = new JsSIP.WebSocketInterface(config.ws_servers);

    // Build the UA configuration
    const uaConfig = {
      sockets: [socket],
      uri: config.uri,
      password: config.password,
      display_name: config.display_name,
      register: config.register,
      session_timers: config.session_timers,
      connection_recovery_min_interval: config.connection_recovery_min_interval,
      connection_recovery_max_interval: config.connection_recovery_max_interval,
      user_agent: config.user_agent,
      registrar_server: config.registrar_server,
      contact_uri: config.contact_uri,
    };

    const ua = new JsSIP.UA(uaConfig);
    uaRef.current = ua;

    // ── UA events ────────────────────────────────────────────────

    ua.on('registered', () => {
      if (mountedRef.current) {
        setRegistered(true);
      }
    });

    ua.on('unregistered', () => {
      if (mountedRef.current) {
        setRegistered(false);
      }
    });

    ua.on('registrationFailed', (data: { cause?: string }) => {
      console.error('[useSoftphone] Registration failed:', data.cause);
      if (mountedRef.current) {
        setRegistered(false);
      }
    });

    ua.on('newRTCSession', (data: any) => {
      if (!mountedRef.current) return;

      const session = data.session;

      // If we are already in a call, reject the new incoming call
      if (sessionRef.current && data.originator === 'remote') {
        session.terminate({ status_code: 486 });
        return;
      }

      const callerNumber = session.remote_identity?.uri?.user || 'Unknown';

      if (data.originator === 'remote') {
        // Incoming call
        sessionRef.current = session;
        setCallDirection('in');
        setRemoteNumber(callerNumber);
        setInCall(false); // Not yet answered

        showIncomingCallNotification(callerNumber);
        setupSessionEvents(session);
      } else {
        // Outgoing call - session events set up in call() method
        sessionRef.current = session;
        setCallDirection('out');
        setRemoteNumber(callerNumber);
      }
    });

    ua.on('connected', () => {
      console.log('[useSoftphone] WebSocket connected');
    });

    ua.on('disconnected', () => {
      console.log('[useSoftphone] WebSocket disconnected');
      if (mountedRef.current) {
        setRegistered(false);
      }
    });

    // Start the UA
    ua.start();

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      stopTimer();
      removeRemoteAudio();

      if (sessionRef.current) {
        try {
          sessionRef.current.terminate();
        } catch {
          // Session may already be terminated
        }
        sessionRef.current = null;
      }

      ua.stop();
      uaRef.current = null;
    };
  }, [extension, password, server, setupSessionEvents, stopTimer]);

  // ── Methods ──────────────────────────────────────────────────────

  const call = useCallback(
    (number: string, trunk?: string) => {
      const ua = uaRef.current;
      if (!ua || !ua.isRegistered()) {
        console.error('[useSoftphone] UA not registered, cannot make call');
        return;
      }

      if (sessionRef.current) {
        console.error('[useSoftphone] Already in a call');
        return;
      }

      const target = trunk
        ? `sip:${trunk}/${number}@${new URL(server || 'wss://localhost:8089/ws').hostname}`
        : `sip:${number}@${new URL(server || 'wss://localhost:8089/ws').hostname}`;

      const options = createCallOptions();

      const session = ua.call(target, options) as unknown as JsSIPSession;
      sessionRef.current = session;
      setCallDirection('out');
      setRemoteNumber(number);
      setupSessionEvents(session);
    },
    [server, setupSessionEvents],
  );

  const answer = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      console.error('[useSoftphone] No session to answer');
      return;
    }

    const options = createCallOptions();
    session.answer(options);
  }, []);

  const hangup = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    try {
      session.terminate();
    } catch {
      // Session may already be terminated
    }
    resetCallState();
  }, [resetCallState]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    const muted = session.isMuted();
    if (muted.audio) {
      session.unmute({ audio: true });
      setIsMuted(false);
    } else {
      session.mute({ audio: true });
      setIsMuted(true);
    }
  }, []);

  const toggleHold = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    const held = session.isOnHold();
    if (held.local) {
      session.unhold();
      setIsOnHold(false);
    } else {
      session.hold();
      setIsOnHold(true);
    }
  }, []);

  const sendDtmf = useCallback((digit: string) => {
    const session = sessionRef.current;
    if (!session) return;

    session.sendDTMF(digit, { duration: 100, interToneGap: 70 });
  }, []);

  const blindTransferFn = useCallback(
    (target: string) => {
      const session = sessionRef.current;
      if (!session) {
        console.error('[useSoftphone] No active session for transfer');
        return;
      }

      const host = new URL(server || 'wss://localhost:8089/ws').hostname;
      const referTarget = `sip:${target}@${host}`;
      session.refer(referTarget);
    },
    [server],
  );

  const attendedTransferFn = useCallback(
    (target: string) => {
      const session = sessionRef.current;
      if (!session) {
        console.error('[useSoftphone] No active session for transfer');
        return;
      }

      // For attended transfer, we put the current call on hold, make a new
      // call to the target, and then complete the transfer via REFER.
      // JsSIP handles the REFER mechanism; the attended flow is:
      // 1. Hold current call
      // 2. Call the target
      // 3. When target answers, use refer() to bridge them

      session.hold();
      setIsOnHold(true);

      const host = new URL(server || 'wss://localhost:8089/ws').hostname;
      const referTarget = `sip:${target}@${host}`;

      // Use replaces header for attended transfer
      session.refer(referTarget, {
        extraHeaders: [
          `Referred-By: <sip:${extension}@${host}>`,
        ],
      });
    },
    [server, extension],
  );

  return {
    // State
    registered,
    inCall,
    callDirection,
    remoteNumber,
    callDuration,
    isMuted,
    isOnHold,
    currentSession: sessionRef.current,

    // Methods
    call,
    answer,
    hangup,
    toggleMute,
    toggleHold,
    sendDtmf,
    blindTransfer: blindTransferFn,
    attendedTransfer: attendedTransferFn,
  };
}

export default useSoftphone;
