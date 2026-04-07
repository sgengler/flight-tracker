import '@testing-library/jest-dom';

/**
 * Controllable EventSource mock — jsdom doesn't implement EventSource.
 * Tests reach into instances[] to simulate server events.
 */
export class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateError() {
    this.onerror?.();
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;
});
