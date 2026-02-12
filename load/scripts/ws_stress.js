import ws from 'k6/ws';
import { check } from 'k6';
import { login, getWSTicket } from '../utils/auth.js';

export const options = {
    // Configuration is loaded from moderate.json via CLI
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WS_URL = BASE_URL.replace('http', 'ws');

export function setup() {
    const token = login('admin@example.com', 'password123');
    return { token };
}

export default function (data) {
    const ticket = getWSTicket(data.token);
    const url = `${WS_URL}/ws/1?ticket=${ticket}`;

    const res = ws.connect(url, {}, function (socket) {
        socket.on('open', function () {
            // console.log('connected');
            
            socket.setInterval(function () {
                socket.send(JSON.stringify({
                    content: 'ping',
                    message_type: 'text'
                }));
            }, 5000);
        });

        socket.on('message', function (message) {
            // console.log('received message: ' + message);
        });

        socket.on('close', function () {
            // console.log('disconnected');
        });

        socket.on('error', function (e) {
            console.log('error: ' + e.error());
        });

        socket.setTimeout(function () {
            socket.close();
        }, 30000); // Stay connected for 30s
    });

    check(res, { 'status is 101': (r) => r && r.status === 101 });
}
