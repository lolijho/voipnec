export interface TrunkConfig {
  id: string;
  name: string;
  provider: 'messagenet' | 'twilio' | 'generic';
  enabled: boolean;
  username: string;
  password: string;
  server: string;
  port: number;
  did: string;
  codecs: string[];
  transport: 'udp' | 'tcp' | 'tls';
  dtmfMode: 'rfc4733' | 'inband' | 'info' | 'auto';
  natTraversal: boolean;
  realm: string;
  sipProxy: string;
  prefixOut: string;
  region: string;
  accountSid: string;
  authToken: string;
  trunkSid: string;
}

export const asteriskConfig = {
  host: process.env.ASTERISK_HOST || '127.0.0.1',
  amiPort: parseInt(process.env.AMI_PORT || '5038', 10),
  amiUser: process.env.AMI_USER || 'admin',
  amiPassword: process.env.AMI_PASSWORD || 'admin',
  ariUrl: process.env.ARI_URL || 'http://127.0.0.1:8088',
  ariUser: process.env.ARI_USER || 'asterisk',
  ariPassword: process.env.ARI_PASSWORD || 'asterisk',
};

export function generatePjsipTrunkConfig(trunk: TrunkConfig): string {
  switch (trunk.provider) {
    case 'messagenet':
      return generateMessagenetConfig(trunk);
    case 'twilio':
      return generateTwilioConfig(trunk);
    case 'generic':
    default:
      return generateGenericConfig(trunk);
  }
}

function generateMessagenetConfig(trunk: TrunkConfig): string {
  const transportType = trunk.transport || 'udp';
  const codecList = trunk.codecs.length > 0 ? trunk.codecs.join(',') : 'ulaw,alaw,g729';

  return `
; === MessageNet Trunk: ${trunk.name} (${trunk.id}) ===

[messagenet-auth-${trunk.id}]
type=auth
auth_type=userpass
username=${trunk.username}
password=${trunk.password}
realm=${trunk.realm || 'sip.messagenet.it'}

[messagenet-aor-${trunk.id}]
type=aor
contact=sip:${trunk.server || 'sip.messagenet.it'}:${trunk.port || 5060}
qualify_frequency=60
qualify_timeout=3.0

[messagenet-identify-${trunk.id}]
type=identify
endpoint=messagenet-endpoint-${trunk.id}
match=${trunk.server || 'sip.messagenet.it'}

[messagenet-registration-${trunk.id}]
type=registration
transport=transport-${transportType}
outbound_auth=messagenet-auth-${trunk.id}
server_uri=sip:${trunk.server || 'sip.messagenet.it'}:${trunk.port || 5060}
client_uri=sip:${trunk.username}@${trunk.server || 'sip.messagenet.it'}:${trunk.port || 5060}
retry_interval=60
expiration=3600

[messagenet-endpoint-${trunk.id}]
type=endpoint
transport=transport-${transportType}
context=from-trunk-${trunk.id}
disallow=all
allow=${codecList}
outbound_auth=messagenet-auth-${trunk.id}
aors=messagenet-aor-${trunk.id}
from_user=${trunk.username}
from_domain=${trunk.server || 'sip.messagenet.it'}
dtmf_mode=${trunk.dtmfMode || 'rfc4733'}
${trunk.natTraversal ? 'rtp_symmetric=yes\nforce_rport=yes\nrewrite_contact=yes\nice_support=yes' : ''}
trust_id_inbound=yes
send_pai=yes
`.trim();
}

function generateTwilioConfig(trunk: TrunkConfig): string {
  const codecList = trunk.codecs.length > 0 ? trunk.codecs.join(',') : 'ulaw,alaw';
  const twilioRegion = trunk.region || 'us1';
  const twilioServer = trunk.server || `${trunk.trunkSid}.pstn.${twilioRegion}.twilio.com`;

  return `
; === Twilio Trunk: ${trunk.name} (${trunk.id}) ===

[twilio-auth-${trunk.id}]
type=auth
auth_type=userpass
username=${trunk.username || trunk.trunkSid}
password=${trunk.password || trunk.authToken}

[twilio-aor-${trunk.id}]
type=aor
contact=sip:${twilioServer}:${trunk.port || 5060}
qualify_frequency=60

[twilio-identify-${trunk.id}]
type=identify
endpoint=twilio-endpoint-${trunk.id}
match=${twilioServer}

[twilio-registration-${trunk.id}]
type=registration
transport=transport-${trunk.transport || 'udp'}
outbound_auth=twilio-auth-${trunk.id}
server_uri=sip:${twilioServer}:${trunk.port || 5060}
client_uri=sip:${trunk.username || trunk.trunkSid}@${twilioServer}
retry_interval=60
expiration=3600

[twilio-endpoint-${trunk.id}]
type=endpoint
transport=transport-${trunk.transport || 'udp'}
context=from-trunk-${trunk.id}
disallow=all
allow=${codecList}
outbound_auth=twilio-auth-${trunk.id}
aors=twilio-aor-${trunk.id}
from_user=${trunk.username || trunk.trunkSid}
from_domain=${twilioServer}
dtmf_mode=${trunk.dtmfMode || 'rfc4733'}
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
trust_id_inbound=yes
send_pai=yes
`.trim();
}

function generateGenericConfig(trunk: TrunkConfig): string {
  const transportType = trunk.transport || 'udp';
  const codecList = trunk.codecs.length > 0 ? trunk.codecs.join(',') : 'ulaw,alaw,g729';

  return `
; === Generic SIP Trunk: ${trunk.name} (${trunk.id}) ===

[trunk-auth-${trunk.id}]
type=auth
auth_type=userpass
username=${trunk.username}
password=${trunk.password}
${trunk.realm ? `realm=${trunk.realm}` : ''}

[trunk-aor-${trunk.id}]
type=aor
contact=sip:${trunk.server}:${trunk.port || 5060}
qualify_frequency=60
qualify_timeout=3.0

[trunk-identify-${trunk.id}]
type=identify
endpoint=trunk-endpoint-${trunk.id}
match=${trunk.server}

[trunk-registration-${trunk.id}]
type=registration
transport=transport-${transportType}
outbound_auth=trunk-auth-${trunk.id}
server_uri=sip:${trunk.server}:${trunk.port || 5060}
client_uri=sip:${trunk.username}@${trunk.server}:${trunk.port || 5060}
${trunk.sipProxy ? `outbound_proxy=sip:${trunk.sipProxy}` : ''}
retry_interval=60
expiration=3600

[trunk-endpoint-${trunk.id}]
type=endpoint
transport=transport-${transportType}
context=from-trunk-${trunk.id}
disallow=all
allow=${codecList}
outbound_auth=trunk-auth-${trunk.id}
aors=trunk-aor-${trunk.id}
from_user=${trunk.username}
from_domain=${trunk.server}
dtmf_mode=${trunk.dtmfMode || 'rfc4733'}
${trunk.natTraversal ? 'rtp_symmetric=yes\nforce_rport=yes\nrewrite_contact=yes\nice_support=yes' : ''}
trust_id_inbound=yes
send_pai=yes
`.trim();
}

export function generateExtensionsConfig(trunks: TrunkConfig[]): string {
  const enabledTrunks = trunks.filter((t) => t.enabled);

  let config = `
; === Auto-generated Dialplan by AsteriskPanel ===
; Generated at: ${new Date().toISOString()}

[globals]
; Trunk priority order
`;

  enabledTrunks.forEach((trunk, index) => {
    const prefix = trunk.provider === 'messagenet' ? 'messagenet' : trunk.provider === 'twilio' ? 'twilio' : 'trunk';
    config += `TRUNK${index + 1}=${prefix}-endpoint-${trunk.id}\n`;
  });

  config += `
[from-internal]
; Local extensions (100-999)
exten => _1XX,1,NoOp(Internal call to \${EXTEN})
 same => n,Dial(PJSIP/\${EXTEN},30,tTkK)
 same => n,VoiceMail(\${EXTEN}@default,u)
 same => n,Hangup()

exten => _[2-9]XX,1,NoOp(Internal call to \${EXTEN})
 same => n,Dial(PJSIP/\${EXTEN},30,tTkK)
 same => n,VoiceMail(\${EXTEN}@default,u)
 same => n,Hangup()
`;

  // Generate outbound routes for each trunk
  enabledTrunks.forEach((trunk, index) => {
    const trunkNum = index + 1;
    const prefix = trunk.provider === 'messagenet' ? 'messagenet' : trunk.provider === 'twilio' ? 'twilio' : 'trunk';
    const endpoint = `${prefix}-endpoint-${trunk.id}`;
    const dialPrefix = trunk.prefixOut || '';

    config += `
; Outbound via ${trunk.name} (prefix: ${dialPrefix || 'none'})
`;

    if (dialPrefix) {
      config += `exten => _${dialPrefix}.,1,NoOp(Outbound via ${trunk.name}: \${EXTEN})
 same => n,Set(DIAL_NUMBER=\${EXTEN:${dialPrefix.length}})
 same => n,Set(CDR(trunk)=${trunk.name})
 same => n,Dial(PJSIP/\${DIAL_NUMBER}@${endpoint},60,tTkK)
 same => n,Hangup()
`;
    }
  });

  // Default outbound route using first enabled trunk
  if (enabledTrunks.length > 0) {
    const primaryTrunk = enabledTrunks[0];
    const prefix = primaryTrunk.provider === 'messagenet' ? 'messagenet' : primaryTrunk.provider === 'twilio' ? 'twilio' : 'trunk';
    const primaryEndpoint = `${prefix}-endpoint-${primaryTrunk.id}`;

    config += `
; Default outbound route (national/international)
exten => _0.,1,NoOp(Default outbound: \${EXTEN})
 same => n,Set(CDR(trunk)=${primaryTrunk.name})
 same => n,Dial(PJSIP/\${EXTEN}@${primaryEndpoint},60,tTkK)
 same => n,Hangup()

exten => _+.,1,NoOp(International outbound: \${EXTEN})
 same => n,Set(CDR(trunk)=${primaryTrunk.name})
 same => n,Dial(PJSIP/\${EXTEN}@${primaryEndpoint},60,tTkK)
 same => n,Hangup()
`;
  }

  // Inbound contexts for each trunk
  enabledTrunks.forEach((trunk) => {
    config += `
[from-trunk-${trunk.id}]
; Inbound from ${trunk.name}
exten => _X.,1,NoOp(Inbound from ${trunk.name}: \${CALLERID(all)})
 same => n,Set(CDR(trunk)=${trunk.name})
 same => n,Goto(from-incoming,\${EXTEN},1)
 same => n,Hangup()

exten => ${trunk.did || '_X.'},1,NoOp(DID ${trunk.did || 'any'} from ${trunk.name})
 same => n,Set(CDR(trunk)=${trunk.name})
 same => n,Goto(from-incoming,\${EXTEN},1)
 same => n,Hangup()
`;
  });

  config += `
[from-incoming]
; Default incoming handler - route to ring group or IVR
exten => _X.,1,NoOp(Incoming call to \${EXTEN})
 same => n,Answer()
 same => n,Dial(PJSIP/100&PJSIP/101&PJSIP/102,30,tTkK)
 same => n,VoiceMail(100@default,u)
 same => n,Hangup()

[macro-record]
; Call recording macro
exten => s,1,NoOp(Recording call)
 same => n,Set(RECORDING_FILE=\${STRFTIME(\${EPOCH},,%Y%m%d-%H%M%S)}-\${UNIQUEID})
 same => n,MixMonitor(/var/spool/asterisk/monitor/\${RECORDING_FILE}.wav,b)
 same => n,MacroExit()
`;

  return config.trim();
}
