import ariClient from 'ari-client';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../logger';

export interface AriConfig {
  url: string;
  user: string;
  password: string;
}

export interface StasisApp {
  name: string;
  handler: (event: any, channel: any) => void;
}

export interface RecordingInfo {
  name: string;
  format: string;
  state: string;
  duration: number;
  target_uri: string;
}

export interface IvrMenuOption {
  digit: string;
  action: 'playback' | 'transfer' | 'voicemail' | 'submenu' | 'hangup';
  target: string;
  description?: string;
}

export interface IvrMenu {
  name: string;
  greeting: string;
  options: IvrMenuOption[];
  timeout: number;
  invalidSound: string;
  maxRetries: number;
}

export class AriService {
  private ari: any = null;
  private config: AriConfig;
  private io: SocketIOServer;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected: boolean = false;
  private stasisApps: Map<string, StasisApp> = new Map();
  private ivrMenus: Map<string, IvrMenu> = new Map();
  private ivrRetries: Map<string, number> = new Map();

  constructor(config: AriConfig, io: SocketIOServer) {
    this.config = config;
    this.io = io;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    try {
      this.ari = await ariClient.connect(
        this.config.url,
        this.config.user,
        this.config.password
      );

      this.connected = true;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      logger.info('ARI connected successfully', {
        url: this.config.url,
      });

      this.io.to('ari').emit('ari:connected');
      this.subscribeToEvents();
    } catch (err) {
      this.connected = false;
      logger.error('Failed to connect to ARI', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      this.io.to('ari').emit('ari:error', {
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info('Attempting ARI reconnection...');
      this.connect();
    }, 5000);
  }

  private subscribeToEvents(): void {
    if (!this.ari) return;

    this.ari.on('StasisStart', (event: any, channel: any) => {
      logger.info('StasisStart received', {
        channelId: channel.id,
        name: channel.name,
        callerIdNum: channel.caller?.number,
        callerIdName: channel.caller?.name,
      });

      this.io.to('ari').emit('ari:stasisstart', {
        channelId: channel.id,
        name: channel.name,
        state: channel.state,
        callerIdNum: channel.caller?.number,
        callerIdName: channel.caller?.name,
        args: event.args,
        application: event.application,
      });

      // Check if there is an IVR menu registered for this app
      const appName = event.application;
      const menu = this.ivrMenus.get(appName);
      if (menu) {
        this.handleIvrEntry(channel, menu);
      }

      // Invoke any registered stasis app handler
      const app = this.stasisApps.get(appName);
      if (app) {
        try {
          app.handler(event, channel);
        } catch (handlerErr) {
          logger.error('Stasis app handler error', {
            app: appName,
            error: handlerErr instanceof Error ? handlerErr.message : 'Unknown error',
          });
        }
      }
    });

    this.ari.on('StasisEnd', (event: any, channel: any) => {
      logger.info('StasisEnd received', {
        channelId: channel.id,
        name: channel.name,
      });

      this.ivrRetries.delete(channel.id);

      this.io.to('ari').emit('ari:stasisend', {
        channelId: channel.id,
        name: channel.name,
        application: event.application,
      });
    });

    this.ari.on('ChannelDtmfReceived', (event: any, channel: any) => {
      logger.info('DTMF received', {
        channelId: channel.id,
        digit: event.digit,
        duration: event.duration_ms,
      });

      this.io.to('ari').emit('ari:dtmf', {
        channelId: channel.id,
        digit: event.digit,
        duration: event.duration_ms,
      });
    });

    this.ari.on('ChannelDestroyed', (_event: any, channel: any) => {
      this.ivrRetries.delete(channel.id);
    });
  }

  async startStasisApp(appName: string): Promise<void> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      await this.ari.start(appName);

      this.stasisApps.set(appName, {
        name: appName,
        handler: () => {},
      });

      logger.info('Stasis application started', { appName });
    } catch (err) {
      logger.error('Failed to start Stasis application', {
        appName,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async answerChannel(channelId: string): Promise<void> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      await this.ari.channels.answer({ channelId });
      logger.info('Channel answered', { channelId });
    } catch (err) {
      logger.error('Failed to answer channel', {
        channelId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async playSound(channelId: string, sound: string): Promise<any> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      const playback = await this.ari.channels.play({
        channelId,
        media: `sound:${sound}`,
      });

      logger.info('Sound playback started', { channelId, sound });
      return playback;
    } catch (err) {
      logger.error('Failed to play sound', {
        channelId,
        sound,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async startRecording(channelId: string, filename: string): Promise<any> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      const recording = await this.ari.channels.record({
        channelId,
        name: filename,
        format: 'wav',
        ifExists: 'overwrite',
        beep: true,
        terminateOn: '#',
        maxDurationSeconds: 3600,
      });

      logger.info('Recording started', { channelId, filename });
      return recording;
    } catch (err) {
      logger.error('Failed to start recording', {
        channelId,
        filename,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async stopRecording(recordingName: string): Promise<void> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      await this.ari.recordings.stop({ recordingName });
      logger.info('Recording stopped', { recordingName });
    } catch (err) {
      logger.error('Failed to stop recording', {
        recordingName,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async createBridge(): Promise<any> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      const bridge = await this.ari.bridges.create({
        type: 'mixing',
      });

      logger.info('Bridge created', { bridgeId: bridge.id });
      return bridge;
    } catch (err) {
      logger.error('Failed to create bridge', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      await this.ari.bridges.addChannel({
        bridgeId,
        channel: channelId,
      });

      logger.info('Channel added to bridge', { bridgeId, channelId });
    } catch (err) {
      logger.error('Failed to add channel to bridge', {
        bridgeId,
        channelId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async getRecordings(): Promise<RecordingInfo[]> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      const recordings = await this.ari.recordings.listStored();

      return recordings.map((rec: any) => ({
        name: rec.name || '',
        format: rec.format || '',
        state: rec.state || '',
        duration: rec.duration || 0,
        target_uri: rec.target_uri || '',
      }));
    } catch (err) {
      logger.error('Failed to get recordings', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async deleteRecording(name: string): Promise<void> {
    try {
      if (!this.ari || !this.connected) {
        throw new Error('ARI not connected');
      }

      await this.ari.recordings.deleteStored({ recordingName: name });
      logger.info('Recording deleted', { name });
    } catch (err) {
      logger.error('Failed to delete recording', {
        name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  // ── IVR Handler ───────────────────────────────────────────────────────────────

  registerIvrMenu(appName: string, menu: IvrMenu): void {
    this.ivrMenus.set(appName, menu);
    logger.info('IVR menu registered', { appName, menuName: menu.name });
  }

  private async handleIvrEntry(channel: any, menu: IvrMenu): Promise<void> {
    try {
      await this.ari.channels.answer({ channelId: channel.id });

      await this.playIvrGreeting(channel, menu);
    } catch (err) {
      logger.error('Failed to handle IVR entry', {
        channelId: channel.id,
        menu: menu.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  private async playIvrGreeting(channel: any, menu: IvrMenu): Promise<void> {
    try {
      const playback = await this.ari.channels.play({
        channelId: channel.id,
        media: `sound:${menu.greeting}`,
      });

      // Set up DTMF listener for this channel
      const dtmfHandler = async (event: any, dtmfChannel: any) => {
        if (dtmfChannel.id !== channel.id) return;

        this.ari.removeListener('ChannelDtmfReceived', dtmfHandler);

        await this.handleIvrDtmf(channel, menu, event.digit);
      };

      this.ari.on('ChannelDtmfReceived', dtmfHandler);

      // Set up timeout for no DTMF input
      const timeoutId = setTimeout(async () => {
        this.ari.removeListener('ChannelDtmfReceived', dtmfHandler);

        const retries = this.ivrRetries.get(channel.id) || 0;
        if (retries < menu.maxRetries) {
          this.ivrRetries.set(channel.id, retries + 1);
          await this.playIvrGreeting(channel, menu);
        } else {
          this.ivrRetries.delete(channel.id);
          try {
            await this.ari.channels.hangup({ channelId: channel.id });
          } catch {
            // Channel may already be gone
          }
        }
      }, menu.timeout * 1000);

      // Clean up timeout when playback finishes or channel is destroyed
      const cleanupHandler = (_event: any, destroyedChannel: any) => {
        if (destroyedChannel.id === channel.id) {
          clearTimeout(timeoutId);
          this.ari.removeListener('ChannelDtmfReceived', dtmfHandler);
          this.ari.removeListener('ChannelDestroyed', cleanupHandler);
        }
      };

      this.ari.on('ChannelDestroyed', cleanupHandler);

      // Also clear timeout if DTMF arrives during playback
      playback.on('PlaybackFinished', () => {
        // Greeting finished, timeout is still active for input
      });
    } catch (err) {
      logger.error('Failed to play IVR greeting', {
        channelId: channel.id,
        menu: menu.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  private async handleIvrDtmf(
    channel: any,
    menu: IvrMenu,
    digit: string
  ): Promise<void> {
    try {
      const option = menu.options.find((opt) => opt.digit === digit);

      if (!option) {
        // Invalid option
        const retries = this.ivrRetries.get(channel.id) || 0;
        if (retries < menu.maxRetries) {
          this.ivrRetries.set(channel.id, retries + 1);

          await this.ari.channels.play({
            channelId: channel.id,
            media: `sound:${menu.invalidSound}`,
          });

          // Replay the greeting
          await this.playIvrGreeting(channel, menu);
        } else {
          this.ivrRetries.delete(channel.id);
          try {
            await this.ari.channels.hangup({ channelId: channel.id });
          } catch {
            // Channel may already be gone
          }
        }
        return;
      }

      logger.info('IVR option selected', {
        channelId: channel.id,
        digit,
        action: option.action,
        target: option.target,
      });

      this.io.to('ari').emit('ari:ivr:selection', {
        channelId: channel.id,
        menu: menu.name,
        digit,
        action: option.action,
        target: option.target,
      });

      switch (option.action) {
        case 'playback':
          await this.ari.channels.play({
            channelId: channel.id,
            media: `sound:${option.target}`,
          });
          break;

        case 'transfer': {
          // Transfer to an extension by creating a new channel and bridging
          const bridge = await this.ari.bridges.create({ type: 'mixing' });
          await this.ari.bridges.addChannel({
            bridgeId: bridge.id,
            channel: channel.id,
          });

          const dialed = await this.ari.channels.originate({
            endpoint: `PJSIP/${option.target}`,
            app: channel.dialplan?.app_name || 'asterisk-panel',
            appArgs: 'dialed',
          });

          dialed.on('StasisStart', async () => {
            await this.ari.channels.answer({ channelId: dialed.id });
            await this.ari.bridges.addChannel({
              bridgeId: bridge.id,
              channel: dialed.id,
            });
          });

          dialed.on('ChannelDestroyed', async () => {
            try {
              await this.ari.bridges.destroy({ bridgeId: bridge.id });
            } catch {
              // Bridge may already be gone
            }
          });
          break;
        }

        case 'voicemail':
          // Transfer to voicemail by redirecting to the voicemail context
          await this.ari.channels.continueInDialplan({
            channelId: channel.id,
            context: 'voicemail',
            extension: option.target,
            priority: 1,
          });
          break;

        case 'submenu': {
          const subMenu = this.ivrMenus.get(option.target);
          if (subMenu) {
            this.ivrRetries.delete(channel.id);
            await this.playIvrGreeting(channel, subMenu);
          } else {
            logger.warn('IVR submenu not found', { target: option.target });
            await this.ari.channels.play({
              channelId: channel.id,
              media: `sound:${menu.invalidSound}`,
            });
          }
          break;
        }

        case 'hangup':
          try {
            await this.ari.channels.play({
              channelId: channel.id,
              media: 'sound:vm-goodbye',
            });
          } catch {
            // Ignore playback errors on hangup
          }
          try {
            await this.ari.channels.hangup({ channelId: channel.id });
          } catch {
            // Channel may already be gone
          }
          break;
      }
    } catch (err) {
      logger.error('Failed to handle IVR DTMF', {
        channelId: channel.id,
        digit,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
}
