import { useEffect, useRef, useState } from "react";

function websocketUrl(token) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL("/ws", `${protocol}//${window.location.host}`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function useWorkbenchSocket({ token, onEvent }) {
  const [connection, setConnection] = useState("offline");
  const handlerRef = useRef(onEvent);
  const reconnectRef = useRef(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!token) {
      setConnection("offline");
      return undefined;
    }

    let socket;
    let closedByEffect = false;

    function connect() {
      setConnection("connecting");
      socket = new WebSocket(websocketUrl(token));

      socket.addEventListener("open", () => {
        attemptsRef.current = 0;
        setConnection("online");
      });

      socket.addEventListener("message", (event) => {
        try {
          handlerRef.current?.(JSON.parse(event.data));
        } catch {
          handlerRef.current?.({ type: "unknown", raw: event.data });
        }
      });

      socket.addEventListener("close", () => {
        if (closedByEffect) return;
        setConnection("offline");
        const attempt = Math.min(attemptsRef.current + 1, 6);
        attemptsRef.current = attempt;
        reconnectRef.current = window.setTimeout(connect, Math.min(1000 * attempt, 6000));
      });

      socket.addEventListener("error", () => {
        setConnection("offline");
      });
    }

    connect();

    return () => {
      closedByEffect = true;
      window.clearTimeout(reconnectRef.current);
      socket?.close();
    };
  }, [token]);

  return connection;
}
