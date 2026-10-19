import { attachHeartbeat, fromBase64Url, openFrame, sealFrame } from '@enso/pair';

export type LinkState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline'
  | 'unauthorized'
  | 'replaced';

export interface LinkDevice {
  pairId: string;
  token: string;
  contentKey: string;
  relayUrl: string;
}

type Message = Record<string, any>;

/**
 * Thin relay client for the desktop host.
 *
 * Frames are AES-GCM sealed with the pairing content key; the relay only sees
 * opaque bytes. This intentionally implements the small slice of the pair
 * protocol that a browser chat client needs: snapshot, subscribe, prompt,
 * abort, approvals, model/effort switches, queue and history paging.
 */
export class PairLink {
  private ws: WebSocket | null = null;
  private key: Uint8Array | null = null;
  private heartbeat: (() => void) | null = null;
  private attempts = 0;
  private closed = true;
  private queue: Message[] = [];
  private seq = 0;

  constructor(
    private device: LinkDevice,
    private onMessage: (msg: Message) => void,
    private onState: (state: LinkState, detail?: string) => void
  ) {}

  connect(): void {
    if (!this.closed) return;
    this.closed = false;
    this.open();
  }

  disconnect(): void {
    this.closed = true;
    this.heartbeat?.();
    this.heartbeat = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  /** Fire-and-forget command. Queued while the socket is still connecting. */
  send(cmd: Message): string {
    const requestId = (cmd.requestId as string) ?? `web-${Date.now().toString(36)}-${++this.seq}`;
    const msg = { ...cmd, requestId };
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(msg);
      return requestId;
    }
    void this.write(msg);
    return requestId;
  }

  private async write(msg: Message): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.key) return;
    try {
      ws.send(await sealFrame(this.key, msg));
    } catch (err) {
      console.warn('[enso] send failed', err);
    }
  }

  private open(): void {
    const { pairId, token, contentKey, relayUrl } = this.device;
    if (!pairId || !token || !contentKey || !relayUrl) {
      this.onState('unauthorized', '缺少配对凭据');
      return;
    }
    this.key = fromBase64Url(contentKey);
    const url = `${relayUrl.replace(/\/+$/, '')}/v1/pair/${encodeURIComponent(pairId)}?role=guest&token=${encodeURIComponent(token)}`;
    this.onState(this.attempts ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.onState('offline', String(err));
      this.scheduleRetry();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    const guard = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }, 15000);

    ws.onopen = async () => {
      clearTimeout(guard);
      this.attempts = 0;
      this.onState('online');
      this.heartbeat = attachHeartbeat(ws, () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      })?.stop ?? null;
      const queued = this.queue.splice(0);
      for (const msg of queued) await this.write(msg);
      await this.write({ type: 'snapshot', requestId: `web-snapshot-${Date.now().toString(36)}` });
    };

    ws.onmessage = async (ev: MessageEvent) => {
      if (typeof ev.data === 'string') return; // relay-level ping/pong
      try {
        const msg = (await openFrame(this.key!, new Uint8Array(ev.data as ArrayBuffer))) as Message;
        const log = ((window as any).__ensoFrames ??= [] as string[]);
        log.push(String(msg?.type));
        if (log.length > 200) log.shift();
        ((window as any).__ensoLast ??= {})[String(msg?.type)] = msg;
        this.onMessage(msg);
      } catch (err) {
        console.warn('[enso] undecodable frame', err);
      }
    };

    ws.onerror = () => {
      /* onclose follows */
    };

    ws.onclose = (ev: CloseEvent) => {
      clearTimeout(guard);
      this.heartbeat?.();
      this.heartbeat = null;
      if (this.closed) {
        this.onState('idle');
        return;
      }
      if (ev.code === 4001 || ev.code === 4003 || ev.code === 4401 || ev.code === 4403) {
        this.onState('unauthorized', '配对凭据已失效');
        return;
      }
      // 中继对同一设备凭据只保留一条连接：另一个窗口/设备接管时会以
      // 1000 "replaced" 踢掉本连接。这里不能自动重连，否则两边会互相
      // 抢占（每 1~2 秒断一次），时间线被反复刷新成空。
      if (ev.code === 1000 && /replac|taken|conflict/i.test(ev.reason || '')) {
        this.onState('replaced', ev.reason || '已在其他窗口连接');
        return;
      }
      this.onState('offline');
      this.scheduleRetry();
    };
  }

  /** 用户手动重连（例如关掉另一个窗口后点「重新连接」）。 */
  reconnect(): void {
    if (this.closed) return;
    this.attempts = 0;
    this.open();
  }

  private scheduleRetry(): void {
    const delay = Math.min(10000, 600 * 2 ** Math.min(this.attempts++, 5));
    setTimeout(() => {
      if (!this.closed) this.open();
    }, delay);
  }
}
