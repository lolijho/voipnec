// API client for AsteriskPanel backend

const API_URL: string = import.meta.env.VITE_API_URL || '';

// ── Token management ──────────────────────────────────────────────────

const TOKEN_KEY = 'asterisk_panel_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  username: string;
  role: string;
  extension?: string;
}

export interface ActiveCall {
  channel: string;
  callerIdNum: string;
  callerIdName: string;
  connectedLineNum: string;
  connectedLineName: string;
  state: string;
  duration: number;
  bridgeId?: string;
  context: string;
  exten: string;
  priority: number;
  uniqueId: string;
  linkedId: string;
}

export interface CallHistoryFilters {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  disposition?: string;
  minDuration?: number;
  maxDuration?: number;
  search?: string;
}

export interface CallHistoryEntry {
  id: number;
  calldate: string;
  src: string;
  dst: string;
  duration: number;
  billsec: number;
  disposition: string;
  channel: string;
  dstchannel: string;
  uniqueid: string;
  recordingfile?: string;
}

export interface CallHistoryResponse {
  calls: CallHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CallStats {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  failedCalls: number;
  averageDuration: number;
  totalDuration: number;
  callsByHour: { hour: number; count: number }[];
  callsByDay: { date: string; count: number }[];
}

export interface Extension {
  id: number;
  exten: string;
  name: string;
  context: string;
  callerId: string;
  secret?: string;
  transport: string;
  host: string;
  nat: string;
  codecs: string[];
  callGroup?: string;
  pickupGroup?: string;
  mailbox?: string;
  voicemailEnabled: boolean;
  enabled: boolean;
}

export interface ExtensionStatus {
  exten: string;
  status: 'online' | 'offline' | 'busy' | 'ringing' | 'unavailable';
  ip?: string;
  port?: number;
  userAgent?: string;
}

export interface CreateExtensionData {
  exten: string;
  name: string;
  context?: string;
  secret: string;
  transport?: string;
  codecs?: string[];
  callGroup?: string;
  pickupGroup?: string;
  mailbox?: string;
  voicemailEnabled?: boolean;
}

export interface UpdateExtensionData extends Partial<CreateExtensionData> {}

export interface Trunk {
  id: number;
  name: string;
  type: 'sip' | 'pjsip' | 'iax2';
  host: string;
  port: number;
  username: string;
  secret?: string;
  context: string;
  codecs: string[];
  maxChannels: number;
  outboundCallerId: string;
  transport: string;
  qualify: boolean;
  enabled: boolean;
  status?: 'registered' | 'unregistered' | 'rejected' | 'unknown';
}

export interface CreateTrunkData {
  name: string;
  provider: 'messagenet' | 'twilio' | 'generic';
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateTrunkData extends Partial<CreateTrunkData> {}

export interface TrunkTestResult {
  success: boolean;
  latency?: number;
  message: string;
}

export interface PhonebookParams {
  page?: number;
  limit?: number;
  search?: string;
  group?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PhonebookContact {
  id: number;
  firstName: string;
  lastName: string;
  company?: string;
  email?: string;
  phone: string;
  mobile?: string;
  fax?: string;
  address?: string;
  notes?: string;
  group?: string;
  speedDial?: string;
}

export interface PhonebookResponse {
  contacts: PhonebookContact[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateContactData {
  firstName: string;
  lastName: string;
  company?: string;
  email?: string;
  phone: string;
  mobile?: string;
  fax?: string;
  address?: string;
  notes?: string;
  group?: string;
  speedDial?: string;
}

export interface UpdateContactData extends Partial<CreateContactData> {}

export interface Recording {
  name: string;
  channel: string;
  filename: string;
  format: string;
  duration: number;
  startTime: string;
  size: number;
}

export interface OriginateParams {
  from: string;
  to: string;
  context?: string;
  trunk?: string;
}

// ── Base request helper ───────────────────────────────────────────────

export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const authToken = token ?? getToken();
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const url = `${API_URL}${path}`;

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let message = response.statusText;
    let details: unknown = undefined;
    try {
      const errorBody = await response.json();
      message = errorBody.message || errorBody.error || message;
      details = errorBody.details || errorBody;
    } catch {
      // response body was not JSON
    }

    const error: ApiError = {
      status: response.status,
      message,
      details,
    };
    throw error;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Check content-type to decide how to parse
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  // For blob responses (CSV exports, recordings, etc.)
  return response.text() as unknown as T;
}

// Specialized request for blob downloads
async function apiBlobRequest(
  path: string,
  token?: string | null,
): Promise<Blob> {
  const headers: Record<string, string> = {};
  const authToken = token ?? getToken();
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const url = `${API_URL}${path}`;
  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const errorBody = await response.json();
      message = errorBody.message || errorBody.error || message;
    } catch {
      // ignore
    }
    throw { status: response.status, message } as ApiError;
  }

  return response.blob();
}

// ── Auth ──────────────────────────────────────────────────────────────

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('POST', '/api/auth/login', {
    username,
    password,
  });
  setToken(data.token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('POST', '/api/auth/logout');
  } finally {
    clearToken();
  }
}

export async function getMe(): Promise<UserInfo> {
  const res = await apiRequest<{ user: UserInfo } | UserInfo>('GET', '/api/auth/me');
  if ('user' in res && res.user) return res.user;
  return res as UserInfo;
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  return apiRequest<void>('POST', '/api/auth/change-password', {
    oldPassword,
    newPassword,
  });
}

// ── Active Calls ──────────────────────────────────────────────────────

export async function getActiveCalls(): Promise<ActiveCall[]> {
  const res = await apiRequest<{ calls: ActiveCall[] } | ActiveCall[]>('GET', '/api/calls/active');
  return Array.isArray(res) ? res : (res.calls || []);
}

export async function originateCall(
  from: string,
  to: string,
  context?: string,
  trunk?: string,
): Promise<{ success: boolean; message: string }> {
  return apiRequest('POST', '/api/calls/originate', {
    from,
    to,
    context,
    trunk,
  });
}

export async function hangupCall(
  channel: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/calls/hangup', { channel });
}

export async function blindTransfer(
  channel: string,
  exten: string,
  context?: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/calls/transfer/blind', {
    channel,
    exten,
    context,
  });
}

export async function attendedTransfer(
  channel: string,
  exten: string,
  context?: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/calls/transfer/attended', {
    channel,
    exten,
    context,
  });
}

export async function holdCall(
  channel: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/calls/hold', { channel });
}

export async function unholdCall(
  channel: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/calls/unhold', { channel });
}

export async function parkCall(
  channel: string,
): Promise<{ success: boolean; parkingLot?: string }> {
  return apiRequest('POST', '/api/calls/park', { channel });
}

export async function sendDTMF(
  channel: string,
  digit: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/calls/dtmf', { channel, digit });
}

// ── Call History / CDR ────────────────────────────────────────────────

export async function getCallHistory(
  filters?: CallHistoryFilters,
): Promise<CallHistoryResponse> {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
  }
  const query = params.toString();
  const path = `/api/calls/history${query ? `?${query}` : ''}`;
  return apiRequest<CallHistoryResponse>('GET', path);
}

export async function getCallStats(
  period?: string,
): Promise<CallStats> {
  const path = period
    ? `/api/calls/stats?period=${encodeURIComponent(period)}`
    : '/api/calls/stats';
  const res = await apiRequest<{ stats: CallStats } | CallStats>('GET', path);
  if ('stats' in res && res.stats) return res.stats;
  return res as CallStats;
}

export async function exportCallsCSV(
  filters?: CallHistoryFilters,
): Promise<Blob> {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
  }
  const query = params.toString();
  const path = `/api/calls/export${query ? `?${query}` : ''}`;
  return apiBlobRequest(path);
}

// ── Recordings ────────────────────────────────────────────────────────

export async function getRecordings(): Promise<Recording[]> {
  return apiRequest<Recording[]>('GET', '/api/recordings');
}

export async function startRecording(
  channel: string,
  filename: string,
): Promise<{ success: boolean; recording: Recording }> {
  return apiRequest('POST', '/api/recordings/start', { channel, filename });
}

export async function stopRecording(
  name: string,
): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/recordings/stop', { name });
}

// ── Extensions ────────────────────────────────────────────────────────

export async function getExtensions(): Promise<Extension[]> {
  const res = await apiRequest<{ extensions: Extension[] } | Extension[]>('GET', '/api/extensions');
  return Array.isArray(res) ? res : (res.extensions || []);
}

export async function getExtension(id: number): Promise<Extension> {
  return apiRequest<Extension>('GET', `/api/extensions/${id}`);
}

export async function createExtension(
  data: CreateExtensionData,
): Promise<Extension> {
  return apiRequest<Extension>('POST', '/api/extensions', data);
}

export async function updateExtension(
  id: number,
  data: UpdateExtensionData,
): Promise<Extension> {
  return apiRequest<Extension>('PUT', `/api/extensions/${id}`, data);
}

export async function deleteExtension(
  id: number,
): Promise<{ success: boolean }> {
  return apiRequest('DELETE', `/api/extensions/${id}`);
}

export async function getExtensionStatus(
  exten: string,
): Promise<ExtensionStatus> {
  return apiRequest<ExtensionStatus>(
    'GET',
    `/api/extensions/status/${encodeURIComponent(exten)}`,
  );
}

// ── Trunks ────────────────────────────────────────────────────────────

export async function getTrunks(): Promise<Trunk[]> {
  const res = await apiRequest<{ trunks: Trunk[] } | Trunk[]>('GET', '/api/trunks');
  return Array.isArray(res) ? res : (res.trunks || []);
}

export async function getTrunk(id: number): Promise<Trunk> {
  return apiRequest<Trunk>('GET', `/api/trunks/${id}`);
}

export async function createTrunk(data: CreateTrunkData): Promise<Trunk> {
  return apiRequest<Trunk>('POST', '/api/trunks', data);
}

export async function updateTrunk(
  id: number,
  data: UpdateTrunkData,
): Promise<Trunk> {
  return apiRequest<Trunk>('PUT', `/api/trunks/${id}`, data);
}

export async function deleteTrunk(
  id: number,
): Promise<{ success: boolean }> {
  return apiRequest('DELETE', `/api/trunks/${id}`);
}

export async function testTrunk(id: number): Promise<TrunkTestResult> {
  return apiRequest<TrunkTestResult>('POST', `/api/trunks/${id}/test`);
}

export async function reloadTrunks(): Promise<{ success: boolean }> {
  return apiRequest('POST', '/api/trunks/reload');
}

// ── Phonebook ─────────────────────────────────────────────────────────

export async function getPhonebook(
  params?: PhonebookParams,
): Promise<PhonebookResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    });
  }
  const query = searchParams.toString();
  const path = `/api/phonebook${query ? `?${query}` : ''}`;
  return apiRequest<PhonebookResponse>('GET', path);
}

export async function createContact(
  data: CreateContactData,
): Promise<PhonebookContact> {
  return apiRequest<PhonebookContact>('POST', '/api/phonebook', data);
}

export async function updateContact(
  id: number,
  data: UpdateContactData,
): Promise<PhonebookContact> {
  return apiRequest<PhonebookContact>('PUT', `/api/phonebook/${id}`, data);
}

export async function deleteContact(
  id: number,
): Promise<{ success: boolean }> {
  return apiRequest('DELETE', `/api/phonebook/${id}`);
}

export async function exportPhonebook(): Promise<Blob> {
  return apiBlobRequest('/api/phonebook/export');
}

export async function importPhonebook(
  csv: File,
): Promise<{ success: boolean; imported: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', csv);

  const authToken = getToken();
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const url = `${API_URL}/api/phonebook/import`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const errorBody = await response.json();
      message = errorBody.message || message;
    } catch {
      // ignore
    }
    throw { status: response.status, message } as ApiError;
  }

  return response.json();
}

export { API_URL };
