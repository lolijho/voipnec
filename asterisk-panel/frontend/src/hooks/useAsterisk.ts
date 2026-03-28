import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type ActiveCall,
  type Extension,
  type Trunk,
  type CallStats,
  type ExtensionStatus,
  getActiveCalls,
  getExtensions,
  getTrunks,
  getCallStats,
  originateCall,
  hangupCall,
  blindTransfer,
  attendedTransfer,
  holdCall,
  unholdCall,
  parkCall,
  sendDTMF,
  getExtensionStatus,
} from '../lib/api';
import {
  useSocket,
  type TrunkStatusEvent,
  type ExtensionStatusEvent,
} from './useSocket';

// ── Types ─────────────────────────────────────────────────────────────

export interface TrunkStatus {
  trunkName: string;
  status: 'registered' | 'unregistered' | 'rejected' | 'lagged';
  latency?: number;
}

export interface UseAsteriskReturn {
  // State
  activeCalls: ActiveCall[];
  extensions: Extension[];
  trunks: Trunk[];
  callStats: CallStats | null;
  trunkStatuses: Map<string, TrunkStatus>;
  extensionStatuses: Map<string, ExtensionStatus>;
  isLoading: boolean;
  error: string | null;

  // Socket state
  isConnected: boolean;
  asteriskStatus: 'connected' | 'disconnected';

  // Methods
  originate: (
    from: string,
    to: string,
    context?: string,
    trunk?: string,
  ) => Promise<void>;
  hangup: (channel: string) => Promise<void>;
  transfer: (
    channel: string,
    exten: string,
    context?: string,
  ) => Promise<void>;
  attendedXfer: (
    channel: string,
    exten: string,
    context?: string,
  ) => Promise<void>;
  hold: (channel: string) => Promise<void>;
  unhold: (channel: string) => Promise<void>;
  park: (channel: string) => Promise<{ parkingLot?: string }>;
  dtmf: (channel: string, digit: string) => Promise<void>;
  refreshCalls: () => Promise<void>;
  refreshExtensions: () => Promise<void>;
  refreshTrunks: () => Promise<void>;
  refreshStats: (period?: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useAsterisk(): UseAsteriskReturn {
  const { isConnected, asteriskStatus, on, off } = useSocket();

  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [callStats, setCallStats] = useState<CallStats | null>(null);
  const [trunkStatuses, setTrunkStatuses] = useState<Map<string, TrunkStatus>>(
    () => new Map(),
  );
  const [extensionStatuses, setExtensionStatuses] = useState<
    Map<string, ExtensionStatus>
  >(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  // ── Data fetchers ────────────────────────────────────────────────

  const refreshCalls = useCallback(async () => {
    try {
      const calls = await getActiveCalls();
      if (mountedRef.current) {
        setActiveCalls(calls);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message || 'Failed to fetch calls';
        setError(message);
      }
    }
  }, []);

  const refreshExtensions = useCallback(async () => {
    try {
      const exts = await getExtensions();
      if (mountedRef.current) {
        setExtensions(exts);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message ||
              'Failed to fetch extensions';
        setError(message);
      }
    }
  }, []);

  const refreshTrunks = useCallback(async () => {
    try {
      const t = await getTrunks();
      if (mountedRef.current) {
        setTrunks(t);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message ||
              'Failed to fetch trunks';
        setError(message);
      }
    }
  }, []);

  const refreshStats = useCallback(async (period?: string) => {
    try {
      const stats = await getCallStats(period);
      if (mountedRef.current) {
        setCallStats(stats);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message ||
              'Failed to fetch stats';
        setError(message);
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await Promise.all([
      refreshCalls(),
      refreshExtensions(),
      refreshTrunks(),
      refreshStats(),
    ]);
    if (mountedRef.current) {
      setIsLoading(false);
    }
  }, [refreshCalls, refreshExtensions, refreshTrunks, refreshStats]);

  // ── Action wrappers ──────────────────────────────────────────────

  const originate = useCallback(
    async (from: string, to: string, context?: string, trunk?: string) => {
      await originateCall(from, to, context, trunk);
      await refreshCalls();
    },
    [refreshCalls],
  );

  const hangup = useCallback(
    async (channel: string) => {
      await hangupCall(channel);
      await refreshCalls();
    },
    [refreshCalls],
  );

  const transfer = useCallback(
    async (channel: string, exten: string, context?: string) => {
      await blindTransfer(channel, exten, context);
      await refreshCalls();
    },
    [refreshCalls],
  );

  const attendedXfer = useCallback(
    async (channel: string, exten: string, context?: string) => {
      await attendedTransfer(channel, exten, context);
      await refreshCalls();
    },
    [refreshCalls],
  );

  const hold = useCallback(
    async (channel: string) => {
      await holdCall(channel);
      await refreshCalls();
    },
    [refreshCalls],
  );

  const unhold = useCallback(
    async (channel: string) => {
      await unholdCall(channel);
      await refreshCalls();
    },
    [refreshCalls],
  );

  const park = useCallback(
    async (channel: string) => {
      const result = await parkCall(channel);
      await refreshCalls();
      return { parkingLot: result.parkingLot };
    },
    [refreshCalls],
  );

  const dtmf = useCallback(async (channel: string, digit: string) => {
    await sendDTMF(channel, digit);
  }, []);

  // ── Socket event handlers ────────────────────────────────────────

  useEffect(() => {
    const handleCallNew = () => {
      refreshCalls();
    };

    const handleCallHangup = () => {
      refreshCalls();
    };

    const handleCallBridge = () => {
      refreshCalls();
    };

    const handleCallHold = () => {
      refreshCalls();
    };

    const handleCallUnhold = () => {
      refreshCalls();
    };

    const handleTrunkStatus = (data: TrunkStatusEvent) => {
      setTrunkStatuses((prev: Map<string, TrunkStatus>) => {
        const next = new Map(prev);
        next.set(data.trunkName, {
          trunkName: data.trunkName,
          status: data.status,
          latency: data.latency,
        });
        return next;
      });
      refreshTrunks();
    };

    const handleExtensionStatus = (data: ExtensionStatusEvent) => {
      setExtensionStatuses((prev: Map<string, ExtensionStatus>) => {
        const next = new Map(prev);
        next.set(data.exten, {
          exten: data.exten,
          status: data.status,
          ip: data.ip,
          userAgent: data.userAgent,
        });
        return next;
      });
    };

    const handleQueueUpdate = () => {
      // Queue updates can trigger a calls refresh for monitoring
      refreshCalls();
    };

    on('call:new', handleCallNew);
    on('call:hangup', handleCallHangup);
    on('call:bridge', handleCallBridge);
    on('call:hold', handleCallHold);
    on('call:unhold', handleCallUnhold);
    on('trunk:status', handleTrunkStatus);
    on('extension:status', handleExtensionStatus);
    on('queue:update', handleQueueUpdate);

    return () => {
      off('call:new', handleCallNew);
      off('call:hangup', handleCallHangup);
      off('call:bridge', handleCallBridge);
      off('call:hold', handleCallHold);
      off('call:unhold', handleCallUnhold);
      off('trunk:status', handleTrunkStatus);
      off('extension:status', handleExtensionStatus);
      off('queue:update', handleQueueUpdate);
    };
  }, [on, off, refreshCalls, refreshTrunks]);

  // ── Initial data load ────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    refreshAll();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshAll]);

  // ── Fetch extension statuses when extensions change ──────────────

  useEffect(() => {
    if (extensions.length === 0) return;

    const fetchStatuses = async () => {
      const statusPromises = extensions.map(async (ext: Extension) => {
        try {
          const status = await getExtensionStatus(ext.exten);
          return { exten: ext.exten, status };
        } catch {
          return {
            exten: ext.exten,
            status: {
              exten: ext.exten,
              status: 'offline' as const,
            },
          };
        }
      });

      const results = await Promise.all(statusPromises);
      if (mountedRef.current) {
        const statusMap = new Map<string, ExtensionStatus>();
        for (const { exten, status } of results) {
          statusMap.set(exten, status);
        }
        setExtensionStatuses(statusMap);
      }
    };

    fetchStatuses();
  }, [extensions]);

  return {
    // State
    activeCalls,
    extensions,
    trunks,
    callStats,
    trunkStatuses,
    extensionStatuses,
    isLoading,
    error,

    // Socket state
    isConnected,
    asteriskStatus,

    // Methods
    originate,
    hangup,
    transfer,
    attendedXfer,
    hold,
    unhold,
    park,
    dtmf,
    refreshCalls,
    refreshExtensions,
    refreshTrunks,
    refreshStats,
    refreshAll,
  };
}

export default useAsterisk;
