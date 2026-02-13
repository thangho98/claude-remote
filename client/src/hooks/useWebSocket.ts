import { useEffect, useRef, useState, useCallback } from "react";
import type { WSClientEvent, WSServerEvent } from "@shared/types";

interface UseWebSocketOptions {
  token: string;
  onMessage?: (event: WSServerEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onReconnect?: (attempt: number) => void;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

export function useWebSocket({
  token,
  onMessage,
  onConnect,
  onDisconnect,
  onReconnect,
  autoConnect = false,
  reconnectInterval = 3000,
  maxReconnectAttempts = 10,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);

  // Store token and callbacks in refs to avoid stale closures
  // and prevent connect() from being recreated when callbacks change
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";
  const isReconnecting = connectionState === "reconnecting";

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
  }, []);

  const resetReconnectState = useCallback(() => {
    clearReconnectTimeout();
    reconnectAttemptsRef.current = 0;
    shouldReconnectRef.current = true;
  }, [clearReconnectTimeout]);

  const connect = useCallback((tokenOverride?: string) => {
    // Don't connect if already connected or connecting
    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        return;
      }
      wsRef.current.close();
    }

    clearReconnectTimeout();

    const isReconnect = reconnectAttemptsRef.current > 0;
    setConnectionState(isReconnect ? "reconnecting" : "connecting");

    const currentToken = tokenOverride ?? tokenRef.current;

    const isDev = import.meta.env.DEV;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const host = isDev
      ? (isLocalhost ? "localhost:3001" : `${window.location.hostname}:3001`)
      : window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(currentToken)}`;

    console.log(`🔌 ${isReconnect ? "Reconnecting" : "Connecting"} to WebSocket at:`, url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setConnectionState("connected");
      setError(null);
      resetReconnectState();

      const authToken = tokenOverride ?? tokenRef.current;
      if (authToken) {
        ws.send(JSON.stringify({ type: "auth", token: authToken }));
      }

      onConnectRef.current?.();
    };

    ws.onmessage = (event) => {
      try {
        const data: WSServerEvent = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    ws.onclose = (event) => {
      console.log("🔌 WebSocket disconnected", event.code, event.reason);
      wsRef.current = null;

      setConnectionState("disconnected");
      onDisconnectRef.current?.();

      if (shouldReconnectRef.current && event.code !== 1000 && event.code !== 1001) {
        const attempts = reconnectAttemptsRef.current;

        if (attempts < maxReconnectAttempts) {
          const delay = Math.min(reconnectInterval * Math.pow(1.5, attempts), 30000);
          reconnectAttemptsRef.current = attempts + 1;

          console.log(`🔄 Reconnect attempt ${attempts + 1}/${maxReconnectAttempts} in ${delay}ms...`);
          onReconnectRef.current?.(attempts + 1);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error(`❌ Max reconnect attempts (${maxReconnectAttempts}) reached`);
          setError("Connection lost. Please refresh the page to reconnect.");
          shouldReconnectRef.current = false;
        }
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("Connection failed");
    };
  }, [clearReconnectTimeout, resetReconnectState, maxReconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimeout();
    wsRef.current?.close(1000, "User disconnect");
    wsRef.current = null;
    setConnectionState("disconnected");
    reconnectAttemptsRef.current = 0;
  }, [clearReconnectTimeout]);

  const reconnect = useCallback(() => {
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  const send = useCallback((event: WSClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
      return true;
    }
    console.warn("WebSocket not connected, cannot send:", event);
    return false;
  }, []);

  // Auto-connect if enabled (runs only once on mount)
  useEffect(() => {
    if (autoConnect && token) {
      shouldReconnectRef.current = true;
      connect(token);
    }

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimeout();
      // Note: Don't close wsRef here - StrictMode causes double mount/unmount
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    isConnecting,
    isReconnecting,
    connectionState,
    reconnectAttempts: reconnectAttemptsRef.current,
    error,
    connect,
    disconnect,
    reconnect,
    send,
  };
}
