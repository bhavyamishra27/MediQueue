import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

/**
 * Opens one authenticated Socket.IO connection per signed-in session.
 *
 * The JWT travels in the handshake (`auth.token`) and is never used to choose
 * rooms. The server derives rooms from the freshly loaded database identity.
 * On reconnect Socket.IO re-runs the handshake and rejoins the same rooms, so a
 * dropped connection heals without a page refresh.
 */
export function SocketProvider({ children }) {
  const { isAuthenticated, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setSocket(null);
      setStatus('idle');
      return undefined;
    }

    const next = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    setSocket(next);
    setStatus(next.connected ? 'connected' : 'connecting');

    const handleConnect = () => setStatus('connected');
    const handleDisconnect = (reason) => {
      setStatus(reason === 'io client disconnect' ? 'idle' : 'reconnecting');
    };
    const handleConnectError = () => setStatus('error');

    next.on('connect', handleConnect);
    next.on('disconnect', handleDisconnect);
    next.on('connect_error', handleConnectError);

    return () => {
      next.off('connect', handleConnect);
      next.off('disconnect', handleDisconnect);
      next.off('connect_error', handleConnectError);
      next.disconnect();
      setSocket((current) => (current === next ? null : current));
    };
  }, [isAuthenticated, token]);

  const value = useMemo(
    () => ({ socket, status, connected: status === 'connected' }),
    [socket, status],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used inside a SocketProvider');
  }
  return context;
}

/**
 * Subscribes to one event for the lifetime of a component. The latest handler
 * is always used, so callbacks can close over fresh state without re-binding.
 */
export function useSocketEvent(event, handler, { enabled = true } = {}) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket || !enabled || !event) return undefined;

    const listener = (payload) => handlerRef.current?.(payload);
    socket.on(event, listener);

    return () => socket.off(event, listener);
  }, [socket, event, enabled]);
}

/**
 * Coalesces bursts of realtime events into a single refresh. Several queue
 * events can arrive together after one action (queue update, positions,
 * appointment signal); one REST reload keeps the UI consistent.
 */
export function useSocketRefresh(events, callback, { enabled = true, delay = 250 } = {}) {
  const { socket } = useSocket();
  const callbackRef = useRef(callback);
  const key = events.join('|');

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!socket || !enabled || !key) return undefined;

    let timer = null;
    const trigger = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = null;
        callbackRef.current?.();
      }, delay);
    };

    const names = key.split('|').filter(Boolean);
    for (const name of names) socket.on(name, trigger);

    return () => {
      if (timer) window.clearTimeout(timer);
      for (const name of names) socket.off(name, trigger);
    };
  }, [socket, key, enabled, delay]);
}
