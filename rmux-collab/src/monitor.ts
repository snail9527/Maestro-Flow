import type { Rmux } from '@rmux/sdk';
import {
  ControlModeClient,
  ControlOutput,
  ControlExtendedOutput,
  ControlExit,
  type ControlEvent,
} from '@rmux/sdk';

export interface MonitorEvent {
  paneId: string;
  agentName: string;
  type: 'output' | 'activity' | 'exit';
  content?: string;
  timestamp: number;
}

export interface MonitorHandler {
  onOutput?: (event: MonitorEvent) => void;
  onActivity?: (event: MonitorEvent) => void;
  onExit?: (event: MonitorEvent) => void;
}

export class AgentMonitor {
  private rmux: Rmux;
  private client: ControlModeClient | null = null;
  private handlers: Map<string, MonitorHandler> = new Map();
  private paneToAgent: Map<string, string> = new Map();
  private running = false;

  constructor(rmux: Rmux) {
    this.rmux = rmux;
  }

  registerAgent(agentName: string, paneId: string, handler: MonitorHandler): void {
    this.handlers.set(agentName, handler);
    this.paneToAgent.set(paneId, agentName);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.client = await this.rmux.control();

    this.processEvents().catch((err) => {
      console.error('[rmux-collab] Monitor event loop failed:', err instanceof Error ? err.message : err);
      this.running = false;
    });
  }

  private async processEvents(): Promise<void> {
    if (!this.client) return;

    try {
      for await (const event of this.client.events({ seconds: 3600 })) {
        if (!this.running) break;
        this.dispatchEvent(event);
      }
    } catch (err) {
      console.error('[rmux-collab] Monitor stream error:', err instanceof Error ? err.message : err);
      this.running = false;
    }
  }

  private dispatchEvent(event: ControlEvent): void {
    if (event instanceof ControlOutput || event instanceof ControlExtendedOutput) {
      const agentName = this.paneToAgent.get(event.paneId);
      if (!agentName) return;

      const handler = this.handlers.get(agentName);
      if (!handler) return;

      const monitorEvent: MonitorEvent = {
        paneId: event.paneId,
        agentName,
        type: 'output',
        content: event.data.toString('utf-8'),
        timestamp: Date.now(),
      };

      handler.onOutput?.(monitorEvent);
      handler.onActivity?.({ ...monitorEvent, type: 'activity' });
    } else if (event instanceof ControlExit) {
      const exitPaneId = 'paneId' in event ? String((event as any).paneId) : '';
      if (exitPaneId) {
        const agentName = this.paneToAgent.get(exitPaneId);
        if (agentName) {
          const handler = this.handlers.get(agentName);
          handler?.onExit?.({ paneId: exitPaneId, agentName, type: 'exit', timestamp: Date.now() });
        }
      } else {
        for (const [agentName, handler] of this.handlers) {
          handler.onExit?.({ paneId: '', agentName, type: 'exit', timestamp: Date.now() });
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    if (this.client) {
      this.client.close().catch(() => {});
      this.client = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }
}
