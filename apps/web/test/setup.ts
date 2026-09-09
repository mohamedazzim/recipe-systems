import '@testing-library/jest-dom';

// jsdom lacks fetch-based EventSource; analysis-status tests mock it explicitly.
if (typeof window !== 'undefined' && !('EventSource' in window)) {
  class EventSourceStub {
    static instances: EventSourceStub[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(public url: string) {
      EventSourceStub.instances.push(this);
    }
    close(): void {
      this.closed = true;
    }
  }
  (window as unknown as { EventSource: typeof EventSourceStub }).EventSource =
    EventSourceStub;
}
