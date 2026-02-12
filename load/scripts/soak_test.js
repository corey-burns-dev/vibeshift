import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { login, getWSTicket } from '../utils/auth.js';

export const options = {
    // Soak test options usually defined here or passed via CLI
    // For soak, we want stable VUs for long time
    vus: 50,
    duration: '2h',
    thresholds: {
        http_req_duration: ['p(95)<300'],
        http_req_failed: ['rate<0.01'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WS_URL = BASE_URL.replace('http', 'ws');

export function setup() {
    const token = login('admin@example.com', 'password123');
    return { token };
}

export default function (data) {
    // 50% chance of HTTP or WS interaction
    if (Math.random() > 0.5) {
        // HTTP interaction
        const params = {
            headers: {
                'Authorization': `Bearer ${data.token}`,
            },
        };
        const res = http.get(`${BASE_URL}/api/posts?limit=10`, params);
        check(res, { 'status is 200': (r) => r.status === 200 });
        sleep(5);
    } else {
        // WS interaction
        const ticket = getWSTicket(data.token);
        const url = `${WS_URL}/ws/1?ticket=${ticket}`;

        const res = ws.connect(url, {}, function (socket) {
            socket.on('open', () => {
                socket.setTimeout(() => socket.close(), 10000);
            });
        });
        check(res, { 'status is 101': (r) => r && r.status === 101 });
        sleep(5);
    }
}
