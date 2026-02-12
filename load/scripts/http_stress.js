import http from 'k6/http';
import { check, sleep } from 'k6';
import { login } from '../utils/auth.js';

export const options = {
    // Configuration is loaded from moderate.json via CLI
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export function setup() {
    // Login as admin or test user
    const token = login('admin@example.com', 'password123');
    return { token };
}

export default function (data) {
    const params = {
        headers: {
            'Authorization': `Bearer ${data.token}`,
        },
    };

    // 1. Get posts
    let res = http.get(`${BASE_URL}/api/posts?limit=10`, params);
    check(res, {
        'status is 200': (r) => r.status === 200,
    });

    sleep(1);

    // 2. Get notifications
    res = http.get(`${BASE_URL}/api/notifications`, params);
    check(res, {
        'status is 200': (r) => r.status === 200,
    });

    sleep(1);

    // 3. Create a post (some users)
    if (__VU % 10 === 0) {
        const payload = JSON.stringify({
            content: `Stress test post from VU ${__VU} at ${new Date().toISOString()}`,
            type: 'text',
            visibility: 'public'
        });
        res = http.post(`${BASE_URL}/api/posts`, payload, Object.assign({}, params, {
            headers: Object.assign({}, params.headers, { 'Content-Type': 'application/json' })
        }));
        check(res, {
            'post created': (r) => r.status === 201,
        });
    }

    sleep(2);
}
