import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export function login(email, password) {
    const payload = JSON.stringify({
        email: email,
        password: password,
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);

    check(res, {
        'login status is 200': (r) => r.status === 200,
        'has token': (r) => r.json('token') !== undefined,
    });

    return res.json('token');
}

export function getWSTicket(token) {
    const params = {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    };

    const res = http.post(`${BASE_URL}/api/ws/ticket`, null, params);

    check(res, {
        'ticket status is 200': (r) => r.status === 200,
        'has ticket': (r) => r.json('ticket') !== undefined,
    });

    return res.json('ticket');
}
