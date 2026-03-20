import { useEffect, useRef } from "react";

const WS_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000")
  .replace(/^http/, "ws") + "/ws";

function getWsUrl() {
  const raw = localStorage.getItem("gympulse_auth");
  if (!raw) return null;
  try {
    const { token } = JSON.parse(raw);
    return token ? `${WS_BASE}?token=${encodeURIComponent(token)}` : null;
  } catch {
    return null;
  }
}

/**
 * useRealtimeSync — connects to the backend WebSocket and calls onEvent
 * whenever the server pushes a message (e.g. { type: "data_changed" }).
 * Automatically reconnects if the connection drops.
 */
export function useRealtimeSync(onEvent) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    let ws;
    let retryTimeout;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const url = getWsUrl();
      if (!url) return; // not logged in — skip WS connection
      try {
        ws = new WebSocket(url);

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            cbRef.current?.(data);
          } catch {}
        };

        ws.onclose = () => {
          if (!destroyed) retryTimeout = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!destroyed) retryTimeout = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, []);
}
