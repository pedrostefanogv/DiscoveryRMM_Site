import { connect, type NatsConnection, type Subscription } from "nats";

export interface DashboardEvent {
  eventType: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface NatsConfig {
  url: string;
  enabled: boolean;
}

class NatsService {
  private connection: NatsConnection | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private listeners: Map<string, Set<(event: DashboardEvent) => void>> =
    new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private config: NatsConfig) {}

  async connect(): Promise<void> {
    if (this.connection?.isClosed()) {
      this.connection = null;
    }

    if (this.connection) return;
    if (!this.config.enabled) return;

    if (
      typeof window !== "undefined" &&
      this.config.url.startsWith("nats://")
    ) {
      console.warn(
        "NATS URL is using nats:// in browser context. Browser clients usually require ws:// or wss:// with NATS websocket enabled.",
      );
    }

    try {
      this.connection = await connect({
        servers: [this.config.url],
      });
      this.reconnectAttempts = 0;
      console.log("NATS connected successfully");
    } catch (error) {
      console.error("Failed to connect to NATS:", error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(() => this.connect(), Math.min(delay, 30000));
    }
  }

  async subscribe(
    subject: string,
    callback: (event: DashboardEvent) => void,
  ): Promise<void> {
    if (!this.connection) {
      await this.connect();
    }

    if (!this.connection) {
      console.warn("Cannot subscribe: NATS not connected");
      return;
    }

    // Store callback in listeners map
    if (!this.listeners.has(subject)) {
      this.listeners.set(subject, new Set());
    }
    this.listeners.get(subject)!.add(callback);

    // Skip if already subscribed to this subject
    if (this.subscriptions.has(subject)) {
      return;
    }

    try {
      const subscription = this.connection.subscribe(subject);
      this.subscriptions.set(subject, subscription);

      // Handle incoming messages
      (async () => {
        for await (const msg of subscription) {
          try {
            const data = JSON.parse(new TextDecoder().decode(msg.data));
            const listeners = this.listeners.get(subject);
            if (listeners) {
              listeners.forEach((listener) => {
                try {
                  listener(data);
                } catch (error) {
                  console.error("Error in NATS listener:", error);
                }
              });
            }
          } catch (error) {
            console.error("Error parsing NATS message:", error);
          }
        }
      })();
    } catch (error) {
      console.error(`Failed to subscribe to ${subject}:`, error);
    }
  }

  unsubscribe(
    subject: string,
    callback: (event: DashboardEvent) => void,
  ): void {
    const listeners = this.listeners.get(subject);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.listeners.delete(subject);
      }
    }

    // Only unsubscribe from NATS if no more listeners
    if (!this.listeners.has(subject)) {
      const subscription = this.subscriptions.get(subject);
      if (subscription) {
        subscription.unsubscribe();
        this.subscriptions.delete(subject);
      }
    }
  }

  async publish(subject: string, data: Record<string, unknown>): Promise<void> {
    if (!this.connection) {
      await this.connect();
    }

    if (!this.connection) {
      throw new Error("NATS not connected");
    }

    this.connection.publish(subject, JSON.stringify(data));
  }

  async disconnect(): Promise<void> {
    // Unsubscribe from all subjects
    for (const subscription of this.subscriptions.values()) {
      subscription.unsubscribe();
    }
    this.subscriptions.clear();
    this.listeners.clear();

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  isConnected(): boolean {
    return this.connection?.isClosed() === false;
  }
}

let natsService: NatsService | null = null;

export function getNatsService(config?: NatsConfig): NatsService {
  if (!natsService && config) {
    natsService = new NatsService(config);
  }
  return natsService || new NatsService({ url: "", enabled: false });
}

export function resetNatsService(): void {
  natsService = null;
}
