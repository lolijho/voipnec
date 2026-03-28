declare module 'asterisk-manager' {
  class AsteriskManager {
    constructor(port: number, host: string, username: string, password: string, events: boolean);
    on(event: string, callback: (...args: any[]) => void): void;
    action(action: Record<string, any>, callback?: (err: Error | null, res: any) => void): void;
    connect(): void;
    disconnect(): void;
    keepConnected(): void;
    isConnected(): boolean;
  }
  export = AsteriskManager;
}

declare module 'ari-client' {
  interface Channel {
    id: string;
    name: string;
    state: string;
    caller: { name: string; number: string };
    connected: { name: string; number: string };
    dialplan: { context: string; exten: string; priority: number };
    answer(callback?: (err: Error) => void): void;
    hangup(callback?: (err: Error) => void): void;
    play(opts: { media: string }, playback?: any): any;
    record(opts: Record<string, any>, recording?: any): any;
    on(event: string, callback: (...args: any[]) => void): void;
  }

  interface Bridge {
    id: string;
    bridge_type: string;
    channels: string[];
    addChannel(opts: { channel: string }, callback?: (err: Error) => void): void;
    removeChannel(opts: { channel: string }, callback?: (err: Error) => void): void;
    destroy(callback?: (err: Error) => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
  }

  interface Recording {
    name: string;
    format: string;
    state: string;
    stop(callback?: (err: Error) => void): void;
  }

  interface AriClient {
    channels: {
      list(callback?: (err: Error, channels: Channel[]) => void): Promise<Channel[]>;
      get(opts: { channelId: string }): Promise<Channel>;
      originate(opts: Record<string, any>): Promise<Channel>;
      hangup(opts: { channelId: string }): Promise<void>;
    };
    bridges: {
      list(callback?: (err: Error, bridges: Bridge[]) => void): Promise<Bridge[]>;
      create(opts: { type: string; name?: string }): Promise<Bridge>;
      addChannel(opts: { bridgeId: string; channel: string }): Promise<void>;
    };
    recordings: {
      listStored(callback?: (err: Error, recordings: Recording[]) => void): Promise<Recording[]>;
      getStored(opts: { recordingName: string }): Promise<Recording>;
      deleteStored(opts: { recordingName: string }): Promise<void>;
    };
    on(event: string, callback: (...args: any[]) => void): void;
    start(appName: string | string[]): void;
  }

  function connect(url: string, username: string, password: string): Promise<AriClient>;
  function connect(url: string, username: string, password: string, callback: (err: Error, ari: AriClient) => void): void;

  export { connect, AriClient, Channel, Bridge, Recording };
}
