function createSocket(path) {
    const listeners = new Map();
    let ws = null;
    let connected = false;
    let queue = [];

    function emitLocal(type, data) {
        const handlers = listeners.get(type);
        if (!handlers) {
            return;
        }
        handlers.forEach((handler) => {
            try {
                handler(data);
            } catch (error) {
                console.error(error);
            }
        });
    }

    function connect() {
        const protocol = location.protocol === "https:" ? "wss://" : "ws://";
        ws = new WebSocket(protocol + location.host + path);
        ws.onopen = () => {
            connected = true;
            const pending = queue;
            queue = [];
            pending.forEach((payload) => ws.send(payload));
            emitLocal("connect");
        };
        ws.onclose = () => {
            const wasConnected = connected;
            connected = false;
            if (wasConnected) {
                emitLocal("disconnect");
            }
            setTimeout(connect, 1500);
        };
        ws.onerror = () => {
            ws.close();
        };
        ws.onmessage = (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (error) {
                return;
            }
            if (!message || typeof message.type !== "string") {
                return;
            }
            emitLocal(message.type, message.data);
        };
    }

    connect();

    return {
        get connected() {
            return connected;
        },
        on(type, handler) {
            if (!listeners.has(type)) {
                listeners.set(type, []);
            }
            listeners.get(type).push(handler);
            if (type === "connect" && connected) {
                handler();
            }
        },
        emit(type, data) {
            const payload = JSON.stringify({ type: type, data: data === undefined ? {} : data });
            if (connected && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
                return;
            }
            queue.push(payload);
        }
    };
}
