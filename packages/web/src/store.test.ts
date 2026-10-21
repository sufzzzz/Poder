import { describe, expect, it, vi, beforeEach } from 'vitest';
import { store, modelIdsOf } from './store';

describe('store - modelIdsOf', () => {
  it('extracts model IDs from both string and object arrays', () => {
    const provider = {
      id: 'p1',
      name: 'Test',
      models: [
        'model-a',
        { id: 'model-b' },
        { id: '' },
        null as any,
        'model-c',
      ],
    };
    expect(modelIdsOf(provider as any)).toEqual(['model-a', 'model-b', 'model-c']);
  });

  it('handles empty or undefined provider gracefully', () => {
    expect(modelIdsOf(null)).toEqual([]);
    expect(modelIdsOf(undefined)).toEqual([]);
    expect(modelIdsOf({ id: 'p2' } as any)).toEqual([]);
  });
});

describe('store - cursor tracking & replay self-healing', () => {
  beforeEach(() => {
    (store as any).link = {
      send: vi.fn(),
    };
    (store as any).state.link = 'online';
    (store as any).cursors.clear();
  });

  it('records cursor on session-sync and accepts sequential or gapped live cursors', () => {
    const sessionId = 'test-session-1';

    // 1. 模拟收到 session-sync 快照帧，带初始游标
    (store as any).handle({
      type: 'session-sync',
      sessionId,
      mode: 'snapshot',
      cursor: { epoch: 'epoch-1', seq: 10 },
      snapshot: { sessions: [{ sessionId, messages: [] }] },
    });

    expect((store as any).cursors.get(sessionId)).toEqual({ epoch: 'epoch-1', seq: 10 });

    // 2. 模拟连续 live 事件 seq: 11
    (store as any).state.activeId = sessionId;
    (store as any).handle({
      type: 'agent-event',
      cursor: { epoch: 'epoch-1', seq: 11 },
      event: { type: 'status', status: 'idle' },
    });

    expect((store as any).cursors.get(sessionId)).toEqual({ epoch: 'epoch-1', seq: 11 });

    // 3. 模拟跨号增量（因为宿主内部过滤事件导致 seq 从 11 跳到 14），应当正常放行并更新游标
    (store as any).handle({
      type: 'agent-event',
      cursor: { epoch: 'epoch-1', seq: 14 },
      event: { type: 'status', status: 'running' },
    });

    expect((store as any).cursors.get(sessionId)).toEqual({ epoch: 'epoch-1', seq: 14 });

    // 4. 模拟重复旧事件 seq: 14（seq <= current.seq，应当被安全丢弃，不发生额外操作）
    const sendSpy = (store as any).link.send;
    sendSpy.mockClear();

    (store as any).handle({
      type: 'agent-event',
      cursor: { epoch: 'epoch-1', seq: 14 },
      event: { type: 'status', status: 'running' },
    });

    expect(sendSpy).not.toHaveBeenCalled();
    expect((store as any).cursors.get(sessionId)).toEqual({ epoch: 'epoch-1', seq: 14 });
  });

  it('triggers resubscribe when epoch drifts (host restarted / generation changed)', () => {
    const sessionId = 'test-session-epoch-drift';
    (store as any).state.activeId = sessionId;

    (store as any).cursors.set(sessionId, { epoch: 'epoch-old', seq: 10 });

    const sendSpy = (store as any).link.send;
    sendSpy.mockClear();

    // 宿主换代，发来 epoch-new
    (store as any).handle({
      type: 'agent-event',
      cursor: { epoch: 'epoch-new', seq: 1 },
      event: { type: 'status', status: 'running' },
    });

    expect((store as any).cursors.has(sessionId)).toBe(false);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subscribe',
        sessionId,
      })
    );
  });
});