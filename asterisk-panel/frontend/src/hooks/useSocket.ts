import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from '../lib/api';

// ── Event types ───────────────────────────────────────────────────────

export interface CallNewEvent {
  channel: string;
  callerIdNum: string;
  callerIdName: string;
  connectedLineNum: string;
  connectedLineName: string;
  context: string;
  exten: string;
  state: string;
  uniqueId: string;
  linkedId: string;
}

export interface CallHangupEvent {
  channel: string;
  callerIdNum: string;
  cause: number;
  causeTxt: string;
  uniqueId: string;
}

export interface CallBridgeEvent {
  bridgeId: string;
  channel1: string;
  channel2: string;
  callerIdNum1: string;
  callerIdNum2: string;
  bridgeType: string;
}

export interface CallHoldEvent {
  channel: string;
  callerIdNum: string;
  status: 'on' | 'off';
}

export interface CallUnholdEvent {
  channel: string;
  callerIdNum: string;
}

export interface TrunkStatusEvent {
  trunkName: string;
  status: 'registered' | 'unregistered' | 'rejected' | 'lagged';
  peer: string;
  address?: string;
  latency?: number;
}

export interface ExtensionStatusEvent {
  exten: string;
  status: 'online' | 'offline' | 'busy' | 'ringing' | 'unavailable';
  ip?: string;
  userAgent?: string;
}

export interface QueueUpdateEvent {
  queue: string;
  members: number;
  callers: number;
  holdtime: number;
  completed: number;
  abandoned: number;
}

export interface AsteriskStatusEvent {
  connected: boolean;
  version?: string;
  uptime?: number;
}

export type SocketEventMap = {
  'call:new': CallNewEvent;
  'call:hangup': CallHangupEvent;
  'call:bridge': CallBridgeEvent;
  'call:hold': CallHoldEvent;
  'call:unhold': CallUnholdEvent;
  'trunk:status': TrunkStatusEvent;
  'extension:status': ExtensionStatusEvent;
  'queue:update': QueueUpdateEvent;
  'asterisk:status': AsteriskStatusEvent;
};

export type SocketEventHandler<K extends keyof SocketEventMap> = (
  data: SocketEventMap[K],
) => void;

// ── Hook return type ──────────────────────────────────────────────────

export interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  asteriskStatus: 'connected' | 'disconnected';
  on: <K extends keyof SocketEventMap>(
    event: K,
    handler: SocketEventHandler<K>,
  ) => void;
  off: <K extends keyof SocketEventMap>(
    event: K,
    handler: SocketEventHandler<K>,
  ) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────

const API_URL: string = import.meta.env.VITE_API_URL || '';

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [asteriskStatus, setAsteriskStatus] = useState<
    'connected' | 'disconnected'
  >('disconnected');

  useEffect(() => {
    const token = getToken();

    const socket = io(API_URL || undefined, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('[useSocket] Connection error:', error.message);
      setIsConnected(false);
    });

    // Asterisk status
    socket.on('asterisk:status', (data: AsteriskStatusEvent) => {
      setAsteriskStatus(data.connected ? 'connected' : 'disconnected');
    });

    // Cleanup on unmount
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const on = useCallback(
    <K extends keyof SocketEventMap>(
      event: K,
      handler: SocketEventHandler<K>,
    ) => {
      socketRef.current?.on(event as string, handler as (...args: unknown[]) => void);
    },
    [],
  );

  const off = useCallback(
    <K extends keyof SocketEventMap>(
      event: K,
      handler: SocketEventHandler<K>,
    ) => {
      socketRef.current?.off(event as string, handler as (...args: unknown[]) => void);
    },
    [],
  );

  return {
    socket: socketRef.current,
    isConnected,
    asteriskStatus,
    on,
    off,
  };
}

export default useSocket;
