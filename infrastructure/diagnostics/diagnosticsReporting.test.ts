import assert from 'node:assert/strict';
import test from 'node:test';
import { installGlobalErrorReporting, reportRendererError } from './diagnosticsReporting';

test.beforeEach(() => {
  (globalThis as { window: unknown }).window = {};
});

test('reportRendererError forwards an Error to the bridge with message and stack', () => {
  const calls: Array<{ source: string; message: string; extra?: Record<string, unknown> }> = [];
  (globalThis as { window: unknown }).window = {
    magiesTerminal: {
      logDiagnostic: async (payload: { source: string; message: string; extra?: Record<string, unknown> }) => {
        calls.push(payload);
        return { success: true };
      },
    },
  };

  reportRendererError('ui-boundary:test', new Error('boom'), { componentStack: 'at X' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'ui-boundary:test');
  assert.equal(calls[0].message, 'boom');
  assert.equal(calls[0].extra?.componentStack, 'at X');
  assert.equal(typeof calls[0].extra?.stack, 'string');
});

test('reportRendererError wraps non-Error values', () => {
  const calls: Array<{ message: string }> = [];
  (globalThis as { window: unknown }).window = {
    magiesTerminal: {
      logDiagnostic: async (payload: { message: string }) => {
        calls.push(payload);
        return { success: true };
      },
    },
  };

  reportRendererError('renderer-window-error', 'plain string failure');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, 'plain string failure');
});

test('reportRendererError is a no-op when the bridge is unavailable', () => {
  (globalThis as { window: unknown }).window = {};
  assert.doesNotThrow(() => reportRendererError('source', new Error('boom')));
});

test('installGlobalErrorReporting reports window error events', () => {
  const calls: Array<{ source: string; message: string }> = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const fakeTarget = {
    addEventListener: (type: string, cb: (event: unknown) => void) => {
      listeners.set(type, cb);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
  } as unknown as Window;

  (globalThis as { window: unknown }).window = {
    magiesTerminal: {
      logDiagnostic: async (payload: { source: string; message: string }) => {
        calls.push(payload);
        return { success: true };
      },
    },
  };

  installGlobalErrorReporting(fakeTarget);
  listeners.get('error')?.({ message: 'window blew up', error: new Error('window blew up'), filename: 'a.ts', lineno: 1, colno: 2 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'renderer-window-error');
  assert.equal(calls[0].message, 'window blew up');
});

test('installGlobalErrorReporting reports unhandled promise rejections', () => {
  const calls: Array<{ source: string; message: string }> = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const fakeTarget = {
    addEventListener: (type: string, cb: (event: unknown) => void) => {
      listeners.set(type, cb);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
  } as unknown as Window;

  (globalThis as { window: unknown }).window = {
    magiesTerminal: {
      logDiagnostic: async (payload: { source: string; message: string }) => {
        calls.push(payload);
        return { success: true };
      },
    },
  };

  installGlobalErrorReporting(fakeTarget);
  listeners.get('unhandledrejection')?.({ reason: new Error('rejected') });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'renderer-unhandled-rejection');
  assert.equal(calls[0].message, 'rejected');
});

test('installGlobalErrorReporting returns a function that removes both listeners', () => {
  const removed: string[] = [];
  const fakeTarget = {
    addEventListener: () => {},
    removeEventListener: (type: string) => {
      removed.push(type);
    },
  } as unknown as Window;

  const uninstall = installGlobalErrorReporting(fakeTarget);
  uninstall();

  assert.deepEqual(removed.sort(), ['error', 'unhandledrejection']);
});
