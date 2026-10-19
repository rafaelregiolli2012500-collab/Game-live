import { useEffect, useRef, useState } from "react";

import type { GiftEvent, GiftSocketMessage, LiveStatus } from "@/lib/live";

const MAX_EVENTS = 60;

export function useGiftSocket(gameId: string) {
  const [events, setEvents] = useState<GiftEvent[]>([]);
  const [status, setStatus] = useState<LiveStatus>({ state: "reconnecting", mode: "demo", message: "Conectando ao canal de presentes…" });
  const seenEvents = useRef(new Set<string>());

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer = 0;
    let stopped = false;
    let delay = 1000;

    const connect = () => {
      if (stopped) return;
      setStatus((current) => ({ ...current, state: "reconnecting", message: "Reconectando ao canal de presentes…" }));
      const endpoint = new URL(`/api/live/ws/${encodeURIComponent(gameId)}`, window.location.origin);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(endpoint.toString());
      socket.onopen = () => {
        delay = 1000;
        socket?.send("ping");
      };
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data) as GiftSocketMessage;
          if (payload.type === "status") {
            setStatus({ state: payload.state, mode: payload.mode, message: payload.message });
            return;
          }
          if (seenEvents.current.has(payload.event.event_id)) return;
          seenEvents.current.add(payload.event.event_id);
          setEvents((current) => [payload.event, ...current].slice(0, MAX_EVENTS));
        } catch {
          setStatus((current) => ({ ...current, state: "error", message: "Mensagem inválida recebida do canal" }));
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        setStatus((current) => ({ ...current, state: "reconnecting", message: "Canal desconectado — tentando novamente" }));
        retryTimer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30_000);
      };
      socket.onerror = () => setStatus((current) => ({ ...current, state: "error", message: "Canal indisponível; a luta continua localmente" }));
    };

    connect();
    const heartbeat = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), 20_000);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(heartbeat);
      socket?.close();
    };
  }, [gameId]);

  return { events, status };
}