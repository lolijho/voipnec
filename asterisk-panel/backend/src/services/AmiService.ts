import AsteriskManager from 'asterisk-manager';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../logger';

export interface AmiConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface ActiveChannel {
  channel: string;
  uniqueid: string;
  context: string;
  extension: string;
  priority: string;
  state: string;
  application: string;
  calleridnum: string;
  calleridname: string;
  connectedlinenum: string;
  connectedlinename: string;
  bridgeid: string;
  duration: string;
}

export interface OriginateResult {
  response: string;
  actionid: string;
  message: string;
}

export interface ExtensionStatusResult {
  exten: string;
  context: string;
  hint: string;
  status: number;
  statustext: string;
}

export interface PeerStatusEntry {
  objectname: string;
  objecttype: string;
  devicestate: string;
  contacts: string;
  transport: string;
  aor: string;
}

export interface QueueStatusEntry {
  queue: string;
  max: string;
  strategy: string;
  calls: string;
  holdtime: string;
  talktime: string;
  completed: string;
  abandoned: string;
  servicelevel: string;
  servicelevelperf: string;
  weight: string;
  members: QueueMemberEntry[];
}

export interface QueueMemberEntry {
  queue: string;
  name: string;
  location: string;
  stateinterface: string;
  membership: string;
  penalty: string;
  callstaken: string;
  lastcall: string;
  lastpause: string;
  incall: string;
  status: string;
  paused: string;
  pausedreason: string;
  ringinuse: string;
}

const AMI_EVENTS = [
  'Hangup',
  'Dial',
  'Bridge',
  'Hold',
  'Unhold',
  'AgentConnect',
  'QueueMemberStatus',
  'PeerStatus',
  'Newchannel',
  'Newstate',
  'Registry',
] as const;

export class AmiService {
  private ami: any;
  private config: AmiConfig;
  private io: SocketIOServer;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected: boolean = false;

  constructor(config: AmiConfig, io: SocketIOServer) {
    this.config = config;
    this.io = io;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    try {
      this.ami = new AsteriskManager(
        this.config.port,
        this.config.host,
        this.config.user,
        this.config.password,
        true
      );

      this.ami.keepConnected();

      this.ami.on('connect', () => {
        this.connected = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        logger.info('AMI connected successfully', {
          host: this.config.host,
          port: this.config.port,
        });
        this.io.to('ami').emit('ami:connected');
      });

      this.ami.on('close', () => {
        this.connected = false;
        logger.warn('AMI connection closed');
        this.io.to('ami').emit('ami:disconnected');
        this.scheduleReconnect();
      });

      this.ami.on('error', (err: Error) => {
        this.connected = false;
        logger.error('AMI connection error', {
          error: err.message,
        });
        this.io.to('ami').emit('ami:error', { message: err.message });
        this.scheduleReconnect();
      });

      this.subscribeToEvents();

      logger.info('AMI service initialized');
    } catch (err) {
      logger.error('Failed to initialize AMI connection', {
        error: err instanceof Error ? err.message : 'Unknown error',
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
      logger.info('Attempting AMI reconnection...');
      this.connect();
    }, 5000);
  }

  private subscribeToEvents(): void {
    if (!this.ami) return;

    this.ami.on('managerevent', (event: any) => {
      const eventName = event.event;

      if (!AMI_EVENTS.includes(eventName)) {
        return;
      }

      switch (eventName) {
        case 'Hangup':
          this.io.to('calls').emit('ami:hangup', {
            channel: event.channel,
            uniqueid: event.uniqueid,
            calleridnum: event.calleridnum,
            calleridname: event.calleridname,
            connectedlinenum: event.connectedlinenum,
            connectedlinename: event.connectedlinename,
            cause: event.cause,
            causetxt: event['cause-txt'],
          });
          break;

        case 'Dial':
          this.io.to('calls').emit('ami:dial', {
            subevent: event.subevent,
            channel: event.channel,
            destination: event.destination,
            calleridnum: event.calleridnum,
            calleridname: event.calleridname,
            connectedlinenum: event.connectedlinenum,
            connectedlinename: event.connectedlinename,
            dialstring: event.dialstring,
            uniqueid: event.uniqueid,
            destuniqueid: event.destuniqueid,
          });
          break;

        case 'Bridge':
          this.io.to('calls').emit('ami:bridge', {
            bridgestate: event.bridgestate,
            bridgetype: event.bridgetype,
            channel1: event.channel1,
            channel2: event.channel2,
            uniqueid1: event.uniqueid1,
            uniqueid2: event.uniqueid2,
            callerid1: event.callerid1,
            callerid2: event.callerid2,
          });
          break;

        case 'Hold':
          this.io.to('calls').emit('ami:hold', {
            channel: event.channel,
            uniqueid: event.uniqueid,
            musicclass: event.musicclass,
          });
          break;

        case 'Unhold':
          this.io.to('calls').emit('ami:unhold', {
            channel: event.channel,
            uniqueid: event.uniqueid,
          });
          break;

        case 'AgentConnect':
          this.io.to('queues').emit('ami:agentconnect', {
            queue: event.queue,
            uniqueid: event.uniqueid,
            channel: event.channel,
            member: event.member,
            membername: event.membername,
            holdtime: event.holdtime,
            bridgedchannel: event.bridgedchannel,
            ringtime: event.ringtime,
          });
          break;

        case 'QueueMemberStatus':
          this.io.to('queues').emit('ami:queuememberstatus', {
            queue: event.queue,
            membername: event.membername,
            interface: event.interface,
            stateinterface: event.stateinterface,
            membership: event.membership,
            penalty: event.penalty,
            callstaken: event.callstaken,
            lastcall: event.lastcall,
            lastpause: event.lastpause,
            incall: event.incall,
            status: event.status,
            paused: event.paused,
            pausedreason: event.pausedreason,
            ringinuse: event.ringinuse,
          });
          break;

        case 'PeerStatus':
          this.io.to('peers').emit('ami:peerstatus', {
            channeltype: event.channeltype,
            peer: event.peer,
            peerstatus: event.peerstatus,
            cause: event.cause,
            address: event.address,
            port: event.port,
            time: event.time,
          });
          break;

        case 'Newchannel':
          this.io.to('calls').emit('ami:newchannel', {
            channel: event.channel,
            channelstate: event.channelstate,
            channelstatedesc: event.channelstatedesc,
            calleridnum: event.calleridnum,
            calleridname: event.calleridname,
            connectedlinenum: event.connectedlinenum,
            connectedlinename: event.connectedlinename,
            language: event.language,
            accountcode: event.accountcode,
            context: event.context,
            exten: event.exten,
            priority: event.priority,
            uniqueid: event.uniqueid,
            linkedid: event.linkedid,
          });
          break;

        case 'Newstate':
          this.io.to('calls').emit('ami:newstate', {
            channel: event.channel,
            channelstate: event.channelstate,
            channelstatedesc: event.channelstatedesc,
            calleridnum: event.calleridnum,
            calleridname: event.calleridname,
            connectedlinenum: event.connectedlinenum,
            connectedlinename: event.connectedlinename,
            uniqueid: event.uniqueid,
          });
          break;

        case 'Registry':
          this.io.to('trunks').emit('ami:registry', {
            channeltype: event.channeltype,
            username: event.username,
            domain: event.domain,
            status: event.status,
            cause: event.cause,
          });
          break;
      }
    });
  }

  executeAction(action: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ami || !this.connected) {
        reject(new Error('AMI not connected'));
        return;
      }

      this.ami.action(action, (err: Error | null, res: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    });
  }

  async getActiveCalls(): Promise<ActiveChannel[]> {
    try {
      const channels: ActiveChannel[] = [];

      return new Promise((resolve, reject) => {
        if (!this.ami || !this.connected) {
          reject(new Error('AMI not connected'));
          return;
        }

        const actionId = `coreshowchannels-${Date.now()}`;

        const handler = (event: any) => {
          if (event.actionid !== actionId) return;

          if (event.event === 'CoreShowChannel') {
            channels.push({
              channel: event.channel || '',
              uniqueid: event.uniqueid || '',
              context: event.context || '',
              extension: event.exten || '',
              priority: event.priority || '',
              state: event.channelstatedesc || '',
              application: event.application || '',
              calleridnum: event.calleridnum || '',
              calleridname: event.calleridname || '',
              connectedlinenum: event.connectedlinenum || '',
              connectedlinename: event.connectedlinename || '',
              bridgeid: event.bridgeid || '',
              duration: event.duration || '0',
            });
          }

          if (event.event === 'CoreShowChannelsComplete') {
            this.ami.removeListener('managerevent', handler);
            resolve(channels);
          }
        };

        this.ami.on('managerevent', handler);

        this.ami.action(
          { action: 'CoreShowChannels', actionid: actionId },
          (err: Error | null) => {
            if (err) {
              this.ami.removeListener('managerevent', handler);
              reject(err);
            }
          }
        );

        setTimeout(() => {
          this.ami.removeListener('managerevent', handler);
          resolve(channels);
        }, 10000);
      });
    } catch (err) {
      logger.error('Failed to get active calls', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async originateCall(
    from: string,
    to: string,
    context: string,
    trunk?: string
  ): Promise<OriginateResult> {
    try {
      const channelStr = trunk
        ? `PJSIP/${to}@${trunk}`
        : `PJSIP/${from}`;
      const extensionStr = trunk ? to : to;

      const result = await this.executeAction({
        action: 'Originate',
        channel: channelStr,
        exten: extensionStr,
        context: context,
        priority: '1',
        callerid: from,
        timeout: '30000',
        async: 'true',
      });

      logger.info('Call originated', { from, to, context, trunk });
      return result;
    } catch (err) {
      logger.error('Failed to originate call', {
        from,
        to,
        context,
        trunk,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async hangupChannel(channel: string): Promise<any> {
    try {
      const result = await this.executeAction({
        action: 'Hangup',
        channel: channel,
      });
      logger.info('Channel hung up', { channel });
      return result;
    } catch (err) {
      logger.error('Failed to hangup channel', {
        channel,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async transferBlind(
    channel: string,
    exten: string,
    context: string
  ): Promise<any> {
    try {
      const result = await this.executeAction({
        action: 'Redirect',
        channel: channel,
        exten: exten,
        context: context,
        priority: '1',
      });
      logger.info('Blind transfer executed', { channel, exten, context });
      return result;
    } catch (err) {
      logger.error('Failed to execute blind transfer', {
        channel,
        exten,
        context,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async transferAttended(
    channel: string,
    exten: string,
    context: string
  ): Promise<any> {
    try {
      const result = await this.executeAction({
        action: 'Atxfer',
        channel: channel,
        exten: exten,
        context: context,
        priority: '1',
      });
      logger.info('Attended transfer executed', { channel, exten, context });
      return result;
    } catch (err) {
      logger.error('Failed to execute attended transfer', {
        channel,
        exten,
        context,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async holdCall(channel: string): Promise<any> {
    try {
      const result = await this.executeAction({
        action: 'Hold',
        channel: channel,
      });
      logger.info('Call put on hold (toggle)', { channel });
      return result;
    } catch (err) {
      logger.error('Failed to hold call', {
        channel,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async unholdCall(channel: string): Promise<any> {
    try {
      const result = await this.executeAction({
        action: 'Unhold',
        channel: channel,
      });
      logger.info('Call taken off hold', { channel });
      return result;
    } catch (err) {
      logger.error('Failed to unhold call', {
        channel,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async parkCall(channel: string): Promise<any> {
    try {
      const result = await this.executeAction({
        action: 'Park',
        channel: channel,
        timeout: '45000',
        parkinglot: 'default',
      });
      logger.info('Call parked', { channel });
      return result;
    } catch (err) {
      logger.error('Failed to park call', {
        channel,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async getExtensionStatus(exten: string): Promise<ExtensionStatusResult> {
    try {
      const result = await this.executeAction({
        action: 'ExtensionState',
        exten: exten,
        context: 'from-internal',
      });
      return {
        exten: result.exten || exten,
        context: result.context || 'from-internal',
        hint: result.hint || '',
        status: parseInt(result.status, 10) || -1,
        statustext: result.statustext || 'Unknown',
      };
    } catch (err) {
      logger.error('Failed to get extension status', {
        exten,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async getPeerStatus(): Promise<PeerStatusEntry[]> {
    try {
      const peers: PeerStatusEntry[] = [];

      return new Promise((resolve, reject) => {
        if (!this.ami || !this.connected) {
          reject(new Error('AMI not connected'));
          return;
        }

        const actionId = `pjsipendpoints-${Date.now()}`;

        const handler = (event: any) => {
          if (event.actionid !== actionId) return;

          if (event.event === 'EndpointList') {
            peers.push({
              objectname: event.objectname || '',
              objecttype: event.objecttype || '',
              devicestate: event.devicestate || '',
              contacts: event.contacts || '',
              transport: event.transport || '',
              aor: event.aor || '',
            });
          }

          if (event.event === 'EndpointListComplete') {
            this.ami.removeListener('managerevent', handler);
            resolve(peers);
          }
        };

        this.ami.on('managerevent', handler);

        this.ami.action(
          { action: 'PJSIPShowEndpoints', actionid: actionId },
          (err: Error | null) => {
            if (err) {
              this.ami.removeListener('managerevent', handler);
              reject(err);
            }
          }
        );

        setTimeout(() => {
          this.ami.removeListener('managerevent', handler);
          resolve(peers);
        }, 10000);
      });
    } catch (err) {
      logger.error('Failed to get peer status', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async getTrunkStatus(): Promise<any[]> {
    try {
      if (!this.ami || !this.connected) {
        throw new Error('AMI not connected');
      }

      // Use AMI Command action to run CLI "pjsip show registrations"
      const result = await this.executeAction({
        action: 'Command',
        command: 'pjsip show registrations',
      });

      const output = result.output || result.content || result.$content || '';
      logger.info('getTrunkStatus raw output', { output: String(output).substring(0, 500) });

      // Parse the CLI output - format:
      // <Registration/ServerURI...>  <Auth...>  <Status...>
      // trunk-name/sip:host:port     trunk-auth  Registered  (exp. 3440s)
      const registrations: any[] = [];
      const lines = String(output).split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip headers, separators, empty lines
        if (!trimmed || trimmed.startsWith('<') || trimmed.startsWith('=') || trimmed.startsWith('Objects')) {
          continue;
        }

        // Parse registration lines - split by whitespace
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 3) {
          const regPart = parts[0]; // e.g. "trunk-messagenet-reg-0/sip:sip.messagenet.it:5060"
          const authPart = parts[1]; // e.g. "trunk-messagenet-oauth"
          const statusPart = parts[2]; // e.g. "Registered"

          // Extract objectname and serveruri from regPart
          const slashIdx = regPart.indexOf('/');
          const objectname = slashIdx >= 0 ? regPart.substring(0, slashIdx) : regPart;
          const serveruri = slashIdx >= 0 ? regPart.substring(slashIdx + 1) : '';

          registrations.push({
            objectname,
            serveruri,
            auth: authPart,
            status: statusPart,
            clienturi: '', // CLI output doesn't show clienturi, but we match by serveruri
          });
        }
      }

      logger.info('getTrunkStatus parsed', {
        count: registrations.length,
        registrations,
      });

      return registrations;
    } catch (err) {
      logger.error('Failed to get trunk status', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async reloadModule(module?: string): Promise<any> {
    try {
      const action: Record<string, string> = { action: 'Reload' };
      if (module) {
        action.module = module;
      }
      const result = await this.executeAction(action);
      logger.info('Asterisk reload triggered', { module: module || 'all' });
      return result;
    } catch (err) {
      logger.error('Failed to reload Asterisk module', {
        module,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async getSipPeers(): Promise<PeerStatusEntry[]> {
    try {
      return await this.getPeerStatus();
    } catch (err) {
      logger.error('Failed to get SIP peers', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async getQueueStatus(): Promise<QueueStatusEntry[]> {
    try {
      const queues: Map<string, QueueStatusEntry> = new Map();

      return new Promise((resolve, reject) => {
        if (!this.ami || !this.connected) {
          reject(new Error('AMI not connected'));
          return;
        }

        const actionId = `queuestatus-${Date.now()}`;

        const handler = (event: any) => {
          if (event.actionid !== actionId) return;

          if (event.event === 'QueueParams') {
            queues.set(event.queue, {
              queue: event.queue || '',
              max: event.max || '0',
              strategy: event.strategy || '',
              calls: event.calls || '0',
              holdtime: event.holdtime || '0',
              talktime: event.talktime || '0',
              completed: event.completed || '0',
              abandoned: event.abandoned || '0',
              servicelevel: event.servicelevel || '0',
              servicelevelperf: event.servicelevelperf || '0',
              weight: event.weight || '0',
              members: [],
            });
          }

          if (event.event === 'QueueMember') {
            const queue = queues.get(event.queue);
            if (queue) {
              queue.members.push({
                queue: event.queue || '',
                name: event.name || '',
                location: event.location || '',
                stateinterface: event.stateinterface || '',
                membership: event.membership || '',
                penalty: event.penalty || '0',
                callstaken: event.callstaken || '0',
                lastcall: event.lastcall || '0',
                lastpause: event.lastpause || '0',
                incall: event.incall || '0',
                status: event.status || '0',
                paused: event.paused || '0',
                pausedreason: event.pausedreason || '',
                ringinuse: event.ringinuse || '0',
              });
            }
          }

          if (event.event === 'QueueStatusComplete') {
            this.ami.removeListener('managerevent', handler);
            resolve(Array.from(queues.values()));
          }
        };

        this.ami.on('managerevent', handler);

        this.ami.action(
          { action: 'QueueStatus', actionid: actionId },
          (err: Error | null) => {
            if (err) {
              this.ami.removeListener('managerevent', handler);
              reject(err);
            }
          }
        );

        setTimeout(() => {
          this.ami.removeListener('managerevent', handler);
          resolve(Array.from(queues.values()));
        }, 10000);
      });
    } catch (err) {
      logger.error('Failed to get queue status', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async sendDTMF(channel: string, digit: string): Promise<any> {
    try {
      const result = await this.executeAction({
        action: 'PlayDTMF',
        channel: channel,
        digit: digit,
      });
      logger.info('DTMF sent', { channel, digit });
      return result;
    } catch (err) {
      logger.error('Failed to send DTMF', {
        channel,
        digit,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }
}
