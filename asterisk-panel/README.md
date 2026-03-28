# AsteriskPanel

Pannello di gestione PBX web moderno per Asterisk. Interfaccia completa per gestire chiamate, interni, trunk SIP, code, IVR e rubrica con softphone WebRTC integrato.

## Stack Tecnologico

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Database**: SQLite (better-sqlite3)
- **Real-time**: Socket.io
- **PBX**: asterisk-manager (AMI) + ari-client (ARI)
- **WebRTC**: JsSIP
- **Auth**: JWT + bcrypt
- **Deploy**: Docker + docker-compose (compatibile Coolify)

## Funzionalita

- Dashboard real-time con statistiche chiamate e stato trunk
- Softphone WebRTC integrato nel browser (chiamate, DTMF, transfer, hold, mute)
- Gestione chiamate attive (hangup, hold, transfer, park, recording)
- Storico chiamate con filtri e export CSV
- Gestione interni SIP (CRUD completo)
- Trunk Manager con supporto MessageNet, Twilio e provider generici (TIM, Vodafone, ecc.)
- Generazione automatica configurazione pjsip.conf e extensions.conf
- Rubrica contatti con import/export CSV
- IVR Builder visuale
- Gestione code chiamate con statistiche live
- Notifiche browser per chiamate in arrivo
- Tema scuro professionale

## Requisiti

- **Asterisk** 16+ con PJSIP
- **Docker** e **docker-compose** (per deploy)
- **Node.js** 20+ (per sviluppo locale)

## Quick Start con Docker

```bash
# 1. Clona il repository
git clone <repository-url>
cd asterisk-panel

# 2. Configura le variabili d'ambiente
cp .env.example .env
# Modifica .env con i tuoi valori

# 3. Avvia con docker-compose
docker-compose up -d

# 4. Accedi al pannello
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# Login default: admin / admin123
```

## Configurazione Asterisk

### 1. AMI (Asterisk Manager Interface)

Modifica `/etc/asterisk/manager.conf`:

```ini
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[admin]
secret = supersecret
deny = 0.0.0.0/0.0.0.0
permit = 0.0.0.0/0.0.0.0
read = all
write = all
writetimeout = 5000
```

### 2. ARI (Asterisk REST Interface)

Modifica `/etc/asterisk/ari.conf`:

```ini
[general]
enabled = yes
pretty = yes
allowed_origins = *

[ariuser]
type = user
read_only = no
password = arisecret
```

### 3. HTTP Server (per WebRTC)

Modifica `/etc/asterisk/http.conf`:

```ini
[general]
enabled = yes
bindaddr = 0.0.0.0
bindport = 8088
tlsenable = yes
tlsbindaddr = 0.0.0.0:8089
tlscertfile = /etc/asterisk/keys/asterisk.pem
tlsprivatekey = /etc/asterisk/keys/asterisk.key
```

### 4. PJSIP WebSocket Transport

Aggiungi in `/etc/asterisk/pjsip.conf` (o usa il file fornito in `asterisk-configs/`):

```ini
[transport-wss]
type = transport
protocol = wss
bind = 0.0.0.0:8089
```

### 5. Ricarica la configurazione

```bash
asterisk -rx "core reload"
asterisk -rx "module reload res_pjsip.so"
asterisk -rx "module reload res_http_websocket.so"
```

## Porte Firewall

Assicurati di aprire le seguenti porte:

| Porta | Protocollo | Servizio |
|-------|-----------|----------|
| 5038 | TCP | AMI (Asterisk Manager) |
| 5060 | UDP/TCP | SIP Signaling |
| 5061 | TCP | SIP TLS |
| 8088 | TCP | ARI HTTP |
| 8089 | TCP | WebSocket (WSS) per WebRTC |
| 10000-20000 | UDP | RTP Media (audio) |
| 3000 | TCP | Frontend web |
| 3001 | TCP | Backend API |

```bash
# Esempio con firewalld
firewall-cmd --permanent --add-port=5038/tcp
firewall-cmd --permanent --add-port=5060/udp
firewall-cmd --permanent --add-port=5060/tcp
firewall-cmd --permanent --add-port=5061/tcp
firewall-cmd --permanent --add-port=8088/tcp
firewall-cmd --permanent --add-port=8089/tcp
firewall-cmd --permanent --add-port=10000-20000/udp
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --permanent --add-port=3001/tcp
firewall-cmd --reload

# Esempio con iptables
iptables -A INPUT -p tcp --dport 5038 -j ACCEPT
iptables -A INPUT -p udp --dport 5060 -j ACCEPT
iptables -A INPUT -p tcp --dport 5060 -j ACCEPT
iptables -A INPUT -p tcp --dport 5061 -j ACCEPT
iptables -A INPUT -p tcp --dport 8088 -j ACCEPT
iptables -A INPUT -p tcp --dport 8089 -j ACCEPT
iptables -A INPUT -p udp --dport 10000:20000 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
iptables -A INPUT -p tcp --dport 3001 -j ACCEPT

# Esempio con ufw
ufw allow 5038/tcp
ufw allow 5060/udp
ufw allow 5060/tcp
ufw allow 5061/tcp
ufw allow 8088/tcp
ufw allow 8089/tcp
ufw allow 10000:20000/udp
ufw allow 3000/tcp
ufw allow 3001/tcp
```

## Sviluppo Locale

```bash
# Backend
cd backend
npm install
npm run dev    # Avvia su http://localhost:3001

# Frontend (in un altro terminale)
cd frontend
npm install
npm run dev    # Avvia su http://localhost:3000
```

## Configurazione Trunk

### MessageNet

1. Vai su **Trunk Manager** > **Aggiungi Trunk** > **MessageNet**
2. Inserisci:
   - **Username**: il tuo username numerico MessageNet
   - **Password**: la tua password
   - **DID**: il numero assegnato da MessageNet
3. Il sistema genera automaticamente la configurazione PJSIP:
   - Server: `sip.messagenet.it`
   - Porta: 5060
   - Codec: G.711a (alaw), G.711u (ulaw), G.729
4. Clicca **Testa Connessione** per verificare la raggiungibilita
5. Clicca **Salva** per applicare

### Twilio

1. Vai su **Trunk Manager** > **Aggiungi Trunk** > **Twilio**
2. Inserisci:
   - **Account SID**: dal dashboard Twilio
   - **Auth Token**: dal dashboard Twilio
   - **Trunk SID**: dal Elastic SIP Trunking di Twilio
   - **Numero**: il numero acquistato
   - **Regione**: Ireland o US-East
3. Il sistema configura automaticamente TLS e SDES encryption

### Provider Generici (TIM, Vodafone, altri)

1. Vai su **Trunk Manager** > **Aggiungi Trunk** > **Generico**
2. Compila tutti i campi richiesti dal tuo provider
3. I parametri piu comuni:
   - **DTMF Mode**: RFC2833 (consigliato per la maggior parte dei provider italiani)
   - **NAT Traversal**: yes (se dietro NAT)
   - **Trasporto**: UDP (default per la maggior parte dei provider)

## Deploy con Coolify

1. Crea un nuovo progetto in Coolify
2. Seleziona "Docker Compose" come tipo di deploy
3. Punta al repository Git
4. Configura le variabili d'ambiente nel pannello Coolify
5. Deploy automatico

## Struttura Progetto

```
asterisk-panel/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Entry point
│   │   ├── config/
│   │   │   ├── asterisk.ts       # Asterisk config & generators
│   │   │   └── database.ts       # SQLite setup
│   │   ├── routes/
│   │   │   ├── auth.ts           # Authentication
│   │   │   ├── calls.ts          # Call management
│   │   │   ├── extensions.ts     # Extension CRUD
│   │   │   ├── trunks.ts         # Trunk management
│   │   │   └── phonebook.ts      # Contact directory
│   │   ├── services/
│   │   │   ├── AmiService.ts     # AMI connection
│   │   │   ├── AriService.ts     # ARI connection
│   │   │   ├── CallLogService.ts # Call history
│   │   │   └── TrunkService.ts   # Trunk config
│   │   └── middleware/
│   │       └── auth.ts           # JWT middleware
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main app shell
│   │   ├── components/
│   │   │   ├── Dashboard.tsx     # Stats & overview
│   │   │   ├── Softphone.tsx     # WebRTC phone
│   │   │   ├── ActiveCalls.tsx   # Live calls
│   │   │   ├── CallHistory.tsx   # Call logs
│   │   │   ├── Extensions.tsx    # SIP extensions
│   │   │   ├── TrunkManager.tsx  # Trunk config
│   │   │   ├── Phonebook.tsx     # Contacts
│   │   │   ├── IVRBuilder.tsx    # IVR designer
│   │   │   ├── Queues.tsx        # Queue mgmt
│   │   │   └── Settings.tsx      # App settings
│   │   ├── hooks/
│   │   │   ├── useSocket.ts      # Socket.io hook
│   │   │   ├── useAsterisk.ts    # Asterisk data
│   │   │   └── useSoftphone.ts   # JsSIP hook
│   │   └── lib/
│   │       ├── api.ts            # API client
│   │       └── jssip-config.ts   # WebRTC config
│   ├── Dockerfile
│   └── package.json
├── asterisk-configs/
│   ├── pjsip.conf
│   ├── extensions.conf
│   ├── manager.conf
│   ├── ari.conf
│   ├── queues.conf
│   └── trunks/
│       ├── messagenet.conf
│       ├── twilio.conf
│       ├── tim.conf
│       └── vodafone.conf
├── docker-compose.yml
├── .env.example
└── README.md
```

## Licenza

MIT
