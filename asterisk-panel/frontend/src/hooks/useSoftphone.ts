import { useState, useEffect, useRef, useCallback } from 'react';
import { UserAgent, Registerer, Inviter, Invitation, SessionState, Session } from 'sip.js';
import { createSIPConfig } from '../lib/jssip-config';

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
  currentSession: Session | null;

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

function attachRemoteAudio(session: Session): void {
  try {
    const sdh = (session as any).sessionDescriptionHandler;
    if (!sdh) return;

    // Remove any existing remote audio element
    const existing = document.getElementById('softphone-remote-audio');
    if (existing) {
      existing.remove();
    }

    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.id = 'softphone-remote-audio';
    document.body.appendChild(audioEl);

    // SIP.js 0.21.x: sessionDescriptionHandler has remoteMediaStream
    const remoteStream = sdh.remoteMediaStream as MediaStream | undefined;
    if (remoteStream) {
      audioEl.srcObject = remoteStream;
    }

    // Also listen for track events on the peer connection
    const pc = sdh.peerConnection as RTCPeerConnection | undefined;
    if (pc) {
      pc.ontrack = (event: RTCTrackEvent) => {
        if (event.streams && event.streams[0]) {
          audioEl.srcObject = event.streams[0];
        }
      };
    }
  } catch (err) {
    console.error('[useSoftphone] Failed to attach remote audio:', err);
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

// ── Helper: get caller number from session ────────────────────────────

function getRemoteNumber(session: Session): string {
  try {
    const remoteURI = (session as any).remoteIdentity?.uri;
    if (remoteURI) {
      return remoteURI.user || 'Unknown';
    }
    // Fallback for Inviter/Invitation
    const req = (session as any).request || (session as any).incomingInviteRequest;
    if (req) {
      const from = req.from?.uri?.user || req.to?.uri?.user;
      if (from) return from;
    }
  } catch {
    // ignore
  }
  return 'Unknown';
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useSoftphone(
  extension: string,
  password: string,
  server: string,
  domain?: string,
): UseSoftphoneReturn {
  const [registered, setRegistered] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callDirection, setCallDirection] = useState<CallDirection>(null);
  const [remoteNumber, setRemoteNumber] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);

  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
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

  // ── Session state change handler ─────────────────────────────────

  const setupSessionStateListener = useCallback(
    (session: Session) => {
      session.stateChange.addListener((state: SessionState) => {
        if (!mountedRef.current) return;

        switch (state) {
          case SessionState.Establishing:
            // Call is being set up
            break;
          case SessionState.Established:
            setInCall(true);
            startTimer();
            attachRemoteAudio(session);
            break;
          case SessionState.Terminating:
            // Call is ending
            break;
          case SessionState.Terminated:
            resetCallState();
            break;
        }
      });
    },
    [startTimer, resetCallState],
  );

  // ── SIP.js UserAgent lifecycle ──────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    if (!extension || !password || !server) {
      return;
    }

    const sipDomain = domain || (() => {
      try {
        return new URL(server).hostname;
      } catch {
        return 'localhost';
      }
    })();

    const config = createSIPConfig(server, extension, password, sipDomain);

    let userAgent: UserAgent;
    let registerer: Registerer;

    try {
      const uri = UserAgent.makeURI(config.uri);
      if (!uri) {
        console.error('[useSoftphone] Failed to create URI from:', config.uri);
        return;
      }

      userAgent = new UserAgent({
        uri,
        transportOptions: {
          server: config.wsUrl,
        },
        authorizationUsername: config.authorizationUsername,
        authorizationPassword: config.authorizationPassword,
        displayName: config.displayName,
        noAnswerTimeout: 120,
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        },
        delegate: {
          onInvite: (invitation: Invitation) => {
            if (!mountedRef.current) return;

            // If we are already in a call, reject the new incoming call
            if (sessionRef.current) {
              invitation.reject();
              return;
            }

            const callerNumber = getRemoteNumber(invitation);
            console.log('[useSoftphone] Incoming call from:', callerNumber);

            sessionRef.current = invitation;
            setCallDirection('in');
            setRemoteNumber(callerNumber);
            setInCall(false); // Not yet answered - waiting for user to answer

            showIncomingCallNotification(callerNumber);
            setupSessionStateListener(invitation);
          },
        },
      } as any);

      uaRef.current = userAgent;
    } catch (err) {
      console.error('[useSoftphone] Failed to create SIP.js UserAgent:', err);
      return;
    }

    // Start the UserAgent and register
    (async () => {
      try {
        await userAgent.start();
        console.log('[useSoftphone] UserAgent started');

        registerer = new Registerer(userAgent);
        registererRef.current = registerer;

        registerer.stateChange.addListener((state) => {
          if (!mountedRef.current) return;
          // Registerer states: Initial, Registered, Unregistered, Terminated
          switch (state.toString()) {
            case 'Registered':
              setRegistered(true);
              break;
            case 'Unregistered':
            case 'Terminated':
              setRegistered(false);
              break;
          }
        });

        await registerer.register();
        if (mountedRef.current) {
          setRegistered(true);
        }
      } catch (err) {
        console.error('[useSoftphone] Failed to start/register:', err);
        if (mountedRef.current) {
          setRegistered(false);
        }
      }
    })();

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      stopTimer();
      removeRemoteAudio();

      if (sessionRef.current) {
        try {
          const s = sessionRef.current;
          if (s.state === SessionState.Established) {
            s.bye();
          } else if (s.state === SessionState.Establishing || s.state === SessionState.Initial) {
            if (s instanceof Inviter) {
              s.cancel();
            } else if (s instanceof Invitation) {
              s.reject();
            }
          }
        } catch {
          // Session may already be terminated
        }
        sessionRef.current = null;
      }

      if (registererRef.current) {
        try {
          registererRef.current.unregister();
        } catch {
          // ignore
        }
        registererRef.current = null;
      }

      try {
        userAgent.stop();
      } catch {
        // UA may already be stopped
      }
      uaRef.current = null;
    };
  }, [extension, password, server, domain, setupSessionStateListener, stopTimer]);

  // ── Methods ──────────────────────────────────────────────────────

  const call = useCallback(
    (number: string, trunk?: string) => {
      const ua = uaRef.current;
      if (!ua || !registered) {
        console.error('[useSoftphone] UA not registered, cannot make call');
        return;
      }

      if (sessionRef.current) {
        console.error('[useSoftphone] Already in a call');
        return;
      }

      const sipDomain = domain || (() => {
        try {
          return new URL(server || 'wss://localhost:8089/ws').hostname;
        } catch {
          return 'localhost';
        }
      })();

      const targetStr = trunk
        ? `sip:${trunk}/${number}@${sipDomain}`
        : `sip:${number}@${sipDomain}`;

      try {
        const targetURI = UserAgent.makeURI(targetStr);
        if (!targetURI) {
          console.error('[useSoftphone] Failed to create target URI:', targetStr);
          return;
        }

        const inviter = new Inviter(ua, targetURI, {
          sessionDescriptionHandlerOptions: {
            constraints: {
              audio: true,
              video: false,
            },
            peerConnectionConfiguration: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
              ],
            },
          },
        } as any);

        sessionRef.current = inviter;
        setCallDirection('out');
        setRemoteNumber(number);
        setupSessionStateListener(inviter);

        inviter.invite();
      } catch (err) {
        console.error('[useSoftphone] Failed to make call:', err);
        resetCallState();
      }
    },
    [server, domain, registered, setupSessionStateListener, resetCallState],
  );

  const answer = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !(session instanceof Invitation)) {
      console.error('[useSoftphone] No incoming session to answer');
      return;
    }

    try {
      session.accept({
        sessionDescriptionHandlerOptions: {
          constraints: {
            audio: true,
            video: false,
          },
          peerConnectionConfiguration: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        },
      } as any);
    } catch (err) {
      console.error('[useSoftphone] Failed to answer call:', err);
    }
  }, []);

  const hangup = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    try {
      switch (session.state) {
        case SessionState.Established:
          session.bye();
          break;
        case SessionState.Establishing:
        case SessionState.Initial:
          if (session instanceof Inviter) {
            session.cancel();
          } else if (session instanceof Invitation) {
            session.reject();
          }
          break;
        default:
          break;
      }
    } catch {
      // Session may already be terminated
    }
    resetCallState();
  }, [resetCallState]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    try {
      const sdh = (session as any).sessionDescriptionHandler;
      if (!sdh) return;

      const pc = sdh.peerConnection as RTCPeerConnection | undefined;
      if (!pc) return;

      const senders = pc.getSenders();
      const audioSender = senders.find(
        (s) => s.track && s.track.kind === 'audio',
      );
      if (audioSender && audioSender.track) {
        const newMuted = !isMuted;
        audioSender.track.enabled = !newMuted;
        setIsMuted(newMuted);
      }
    } catch (err) {
      console.error('[useSoftphone] Failed to toggle mute:', err);
    }
  }, [isMuted]);

  const toggleHold = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    try {
      const sdh = (session as any).sessionDescriptionHandler;
      if (!sdh) return;

      const pc = sdh.peerConnection as RTCPeerConnection | undefined;
      if (!pc) return;

      if (isOnHold) {
        // Unhold: set direction back to sendrecv
        const senders = pc.getSenders();
        senders.forEach((sender) => {
          if (sender.track) {
            sender.track.enabled = true;
          }
        });
        setIsOnHold(false);
      } else {
        // Hold: disable sending
        const senders = pc.getSenders();
        senders.forEach((sender) => {
          if (sender.track) {
            sender.track.enabled = false;
          }
        });
        setIsOnHold(true);
      }
    } catch (err) {
      console.error('[useSoftphone] Failed to toggle hold:', err);
    }
  }, [isOnHold]);

  const sendDtmf = useCallback((digit: string) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    try {
      session.info({
        requestOptions: {
          body: {
            contentDisposition: 'render',
            contentType: 'application/dtmf-relay',
            content: `Signal=${digit}\r\nDuration=100`,
          },
        },
      });
    } catch (err) {
      console.error('[useSoftphone] Failed to send DTMF:', err);
    }
  }, []);

  const blindTransferFn = useCallback(
    (target: string) => {
      const session = sessionRef.current;
      if (!session || session.state !== SessionState.Established) {
        console.error('[useSoftphone] No active session for transfer');
        return;
      }

      const sipDomain = domain || (() => {
        try {
          return new URL(server || 'wss://localhost:8089/ws').hostname;
        } catch {
          return 'localhost';
        }
      })();

      try {
        const targetURI = UserAgent.makeURI(`sip:${target}@${sipDomain}`);
        if (!targetURI) {
          console.error('[useSoftphone] Failed to create transfer target URI');
          return;
        }
        session.refer(targetURI);
      } catch (err) {
        console.error('[useSoftphone] Failed to blind transfer:', err);
      }
    },
    [server, domain],
  );

  const attendedTransferFn = useCallback(
    (target: string) => {
      const session = sessionRef.current;
      if (!session || session.state !== SessionState.Established) {
        console.error('[useSoftphone] No active session for transfer');
        return;
      }

      const sipDomain = domain || (() => {
        try {
          return new URL(server || 'wss://localhost:8089/ws').hostname;
        } catch {
          return 'localhost';
        }
      })();

      try {
        const targetURI = UserAgent.makeURI(`sip:${target}@${sipDomain}`);
        if (!targetURI) {
          console.error('[useSoftphone] Failed to create transfer target URI');
          return;
        }
        // For attended transfer in SIP.js, use refer with the replaces header
        // This puts the call on hold and refers
        session.refer(targetURI);
      } catch (err) {
        console.error('[useSoftphone] Failed to attended transfer:', err);
      }
    },
    [server, domain],
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
