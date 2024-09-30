import { useEffect, useState, useRef } from 'react'
import { useSession } from '../context/userContext';

const useWebsocket = (url, onmessage) => {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const tm = useRef(null);
  const { uuid } = useSession();

  useEffect(() => {
    const connect = () => {
      socketRef.current = new WebSocket(url);

      socketRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        socketRef.current.send(JSON.stringify({ type: 'INIT' , payload: {device: "CLIENT", sn: uuid}}));
      };

      socketRef.current.onmessage = onmessage

      socketRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        tm.current = setTimeout(connect, 1000);
      };
    };
    connect();
    return () => {
      if (socketRef.current) {
        clearTimeout(tm.current);
        socketRef.current.onclose = () => {};
        socketRef.current.close();
      }
    };
  }, []);

  const sendMessage = (message) => {
    socketRef.current.send(message);
  };

  return [sendMessage, connected];
};


export default useWebsocket;