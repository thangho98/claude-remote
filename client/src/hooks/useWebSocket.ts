import { useEffect, useRef, useState, useCallback } from "react";
import type { WSClientEvent, WSServerEvent } from "@shared/types";

interface UseWebSocketOptions {
  token: string;
  onMessage?: (event: WSServerEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  autoConnect?: boolean;
}

export function useWebSocket({
  token,
  onMessage,
  onConnect,
  onDisconnect,
  autoConnect = false,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  // Store token in ref to avoid stale closure issues
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const connect = useCallback((tokenOverride?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Use tokenOverride if provided, otherwise use tokenRef for latest value
    const currentToken = tokenOverride ?? tokenRef.current;

    // In development, connect directly to backend server
    const isDev = import.meta.env.DEV;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // In dev mode, use current hostname with backend port (for Tailscale/LAN access)
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const host = isDev
      ? (isLocalhost ? "localhost:3001" : `${window.location.hostname}:3001`)
      : window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(currentToken)}`;

    console.log("🔌 Connecting to WebSocket at:", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setIsConnected(true);
      setError(null);
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const data: WSServerEvent = JSON.parse(event.data);
        onMessage?.(data);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    ws.onclose = (event) => {
      console.log("🔌 WebSocket disconnected", event.code, event.reason);
      setIsConnected(false);
      onDisconnect?.();

      // Attempt reconnect if it was an unexpected close
      if (event.code !== 1000 && event.code !== 1001) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Attempting reconnect...");
          connect();
        }, 3000);
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("Connection failed");
      setIsConnected(false);
    };
  }, [token, onMessage, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close(1000, "User disconnect");
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const send = useCallback((event: WSClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
      return true;
    }
    console.warn("WebSocket not connected, cannot send:", event);
    return false;
  }, []);

  // Auto-connect if enabled (runs only once on mount)
  useEffect(() => {
    if (autoConnect && token) {
      connect(token);
    }
    // Cleanup on unmount only
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isConnected, error, connect, disconnect, send };
}
