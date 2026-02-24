import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { getWSTicket } from '../utils/auth.js';

export const options = {
    // Scenario/profile settings are loaded via --config load/profiles/*.json
};

// Realistic think time between actions (seconds). Keeps each VU under per-user rate limits
// (e.g. 1 comment/min, 10 posts/5min) so the test measures system capacity, not rate-limit hits.
const THINK_TIME_MIN_SEC = 10;
const THINK_TIME_MAX_SEC = 30;

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8375';
const WS_URL = BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');
const LOAD_PASSWORD = __ENV.LOAD_PASSWORD || 'Password123!';

function authHeaders(token) {
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
}

function createOrLoginUser(index, seed) {
    const username = `loadu_${seed}_${index}`;
    const email = `${username}@example.com`;

    const signupPayload = JSON.stringify({
        username,
        email,
        password: LOAD_PASSWORD,
    });

    const signupRes = http.post(`${BASE_URL}/api/auth/signup`, signupPayload, {
        headers: { 'Content-Type': 'application/json' },
    });

    if (signupRes.status === 201) {
        return {
            email,
            token: signupRes.json('token'),
            userId: signupRes.json('user.id'),
        };
    }

    const loginPayload = JSON.stringify({ email, password: LOAD_PASSWORD });
    const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
        headers: { 'Content-Type': 'application/json' },
    });

    check(loginRes, {
        'load user login status is 200': (r) => r.status === 200,
        'load user login has token': (r) => !!r.json('token'),
    });

    return {
        email,
        token: loginRes.json('token'),
        userId: loginRes.json('user.id'),
    };
}

function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function getPosts(token) {
    const res = http.get(`${BASE_URL}/api/posts?limit=20`, authHeaders(token));
    check(res, { 'get posts status 200': (r) => r.status === 200 });
    return res;
}

function runReadFlow(user) {
    const me = http.get(`${BASE_URL}/api/users/me`, authHeaders(user.token));
    check(me, { 'get me status 200': (r) => r.status === 200 });

    const feedRes = getPosts(user.token);
    check(feedRes, { 'feed response status 200': (r) => r.status === 200 });
}

function runPostFlow(user) {
    const payload = JSON.stringify({
        title: `Load Post ${__VU}-${__ITER}`,
        content: `Stress post content ${new Date().toISOString()}`,
        post_type: 'text',
    });

    const res = http.post(`${BASE_URL}/api/posts`, payload, authHeaders(user.token));
    check(res, { 'create post status 201': (r) => r.status === 201 || r.status === 200 });

    getPosts(user.token);
}

function runCommentLikeFlow(user) {
    const feedRes = getPosts(user.token);
    if (feedRes.status !== 200) {
        return;
    }

    const posts = feedRes.json();
    if (!Array.isArray(posts) || posts.length === 0) {
        return;
    }

    const post = pickRandom(posts);
    if (!post || !post.id) {
        return;
    }

    const postId = post.id;

    const likeRes = http.post(`${BASE_URL}/api/posts/${postId}/like`, null, {
        headers: { Authorization: `Bearer ${user.token}` },
    });
    check(likeRes, { 'like status ok': (r) => r.status === 200 || r.status === 201 });

    const commentPayload = JSON.stringify({
        content: `Comment from VU ${__VU} iter ${__ITER}`,
    });
    const commentRes = http.post(`${BASE_URL}/api/posts/${postId}/comments`, commentPayload, authHeaders(user.token));
    check(commentRes, { 'comment status ok': (r) => r.status === 201 || r.status === 200 });

    const unlikeRes = http.del(`${BASE_URL}/api/posts/${postId}/like`, null, {
        headers: { Authorization: `Bearer ${user.token}` },
        responseCallback: http.expectedStatuses(200, 204, 404),
    });
    check(unlikeRes, { 'unlike status ok': (r) => [200, 204, 404].includes(r.status) });
}

function runFriendFlow(user, partner) {
    if (!partner || !partner.userId || partner.userId === user.userId) {
        return;
    }

    const sendRes = http.post(
        `${BASE_URL}/api/friends/requests/${partner.userId}`,
        null,
        {
            headers: { Authorization: `Bearer ${user.token}` },
            responseCallback: http.expectedStatuses(200, 201, 409, 404),
        }
    );
    check(sendRes, {
        'friend request status acceptable': (r) => [201, 200, 409, 404].includes(r.status),
    });

    const sentRes = http.get(`${BASE_URL}/api/friends/requests/sent`, {
        headers: { Authorization: `Bearer ${user.token}` },
    });
    check(sentRes, { 'friend sent list status 200': (r) => r.status === 200 });

    const pendingRes = http.get(`${BASE_URL}/api/friends/requests`, {
        headers: { Authorization: `Bearer ${partner.token}` },
    });

    if (pendingRes.status === 200) {
        const pending = pendingRes.json();
        if (Array.isArray(pending) && pending.length > 0) {
            const request = pending.find((r) => r.requester_id === user.userId) || pending[0];
            if (request && request.id) {
                const acceptRes = http.post(
                    `${BASE_URL}/api/friends/requests/${request.id}/accept`,
                    null,
                    {
                        headers: { Authorization: `Bearer ${partner.token}` },
                        responseCallback: http.expectedStatuses(200, 204, 409),
                    }
                );
                check(acceptRes, {
                    'friend accept status acceptable': (r) => [200, 204, 409].includes(r.status),
                });
            }
        }
    }

    const statusRes = http.get(`${BASE_URL}/api/friends/status/${partner.userId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
        responseCallback: http.expectedStatuses(200, 404),
    });
    check(statusRes, { 'friend status request acceptable': (r) => [200, 404].includes(r.status) });

    const listRes = http.get(`${BASE_URL}/api/friends`, {
        headers: { Authorization: `Bearer ${user.token}` },
    });
    check(listRes, { 'friend list status 200': (r) => r.status === 200 });
}

function runDMFlow(user, partner) {
    if (!partner || !partner.userId || partner.userId === user.userId) {
        return;
    }

    const convPayload = JSON.stringify({
        is_group: false,
        participant_ids: [partner.userId],
    });
    const convRes = http.post(`${BASE_URL}/api/conversations`, convPayload, {
        headers: authHeaders(user.token).headers,
        responseCallback: http.expectedStatuses(200, 201, 409),
    });
    check(convRes, {
        'create dm conversation acceptable': (r) => [200, 201, 409].includes(r.status),
    });

    const listRes = http.get(`${BASE_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${user.token}` },
    });
    if (listRes.status !== 200) {
        return;
    }

    const conversations = listRes.json();
    if (!Array.isArray(conversations) || conversations.length === 0) {
        return;
    }

    const conv = conversations.find((c) => !c.is_group) || conversations[0];
    if (!conv || !conv.id) {
        return;
    }

    const sendPayload = JSON.stringify({
        content: `DM from ${user.userId} at iter ${__ITER}`,
        message_type: 'text',
    });

    const sendRes = http.post(
        `${BASE_URL}/api/conversations/${conv.id}/messages`,
        sendPayload,
        authHeaders(user.token)
    );
    check(sendRes, { 'dm send status acceptable': (r) => [200, 201].includes(r.status) });

    const msgsRes = http.get(`${BASE_URL}/api/conversations/${conv.id}/messages`, {
        headers: { Authorization: `Bearer ${user.token}` },
        responseCallback: http.expectedStatuses(200, 403, 404),
    });
    check(msgsRes, { 'dm messages status acceptable': (r) => [200, 403, 404].includes(r.status) });

    const readRes = http.post(
        `${BASE_URL}/api/conversations/${conv.id}/read`,
        null,
        {
            headers: { Authorization: `Bearer ${user.token}` },
            responseCallback: http.expectedStatuses(200, 400, 403, 404),
        }
    );
    check(readRes, { 'dm read status acceptable': (r) => [200, 400, 403, 404].includes(r.status) });
}

function runChatWSFlow(user, partner) {
    if (!partner || !partner.userId || partner.userId === user.userId) {
        return;
    }

    const convPayload = JSON.stringify({
        is_group: false,
        participant_ids: [partner.userId],
    });
    http.post(`${BASE_URL}/api/conversations`, convPayload, authHeaders(user.token));

    const convListRes = http.get(`${BASE_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${user.token}` },
    });
    if (convListRes.status !== 200) {
        return;
    }

    const conversations = convListRes.json();
    const conv = Array.isArray(conversations)
        ? (conversations.find((c) => !c.is_group && Array.isArray(c.participants) && c.participants.some((p) => p.id === partner.userId)) || conversations[0])
        : null;

    if (!conv || !conv.id) {
        return;
    }

    const ticket = getWSTicket(user.token);
    const wsURL = `${WS_URL}/api/ws/chat?ticket=${ticket}`;

    const res = ws.connect(wsURL, {}, function (socket) {
        socket.on('open', function () {
            socket.send(JSON.stringify({ type: 'join', conversation_id: conv.id }));
            socket.send(JSON.stringify({ type: 'message', conversation_id: conv.id, content: `WS chat ${__VU}-${__ITER}` }));
            socket.send(JSON.stringify({ type: 'read', conversation_id: conv.id }));
        });

        socket.setTimeout(function () {
            socket.close();
        }, 3000);
    });

    check(res, { 'chat ws status is 101': (r) => r && r.status === 101 });
}

function runGameFlow(user, partner) {
    if (!partner || !partner.userId || partner.userId === user.userId) {
        return;
    }

    const createRes = http.post(
        `${BASE_URL}/api/games/rooms`,
        JSON.stringify({ type: 'othello' }),
        authHeaders(user.token)
    );

    if (![200, 201].includes(createRes.status)) {
        return;
    }

    const roomId = createRes.json('id');
    if (!roomId) {
        return;
    }

    const ticket = getWSTicket(partner.token);
    const wsURL = `${WS_URL}/api/ws/game?room_id=${roomId}&ticket=${ticket}`;

    const res = ws.connect(wsURL, {}, function (socket) {
        socket.on('open', function () {
            socket.send(JSON.stringify({ type: 'join_room', payload: {} }));
            socket.send(JSON.stringify({ type: 'chat', payload: { content: `game chat ${__VU}-${__ITER}` } }));
            socket.send(JSON.stringify({ type: 'make_move', payload: { row: 2, column: 3 } }));
        });

        socket.setTimeout(function () {
            socket.close();
        }, 3000);
    });

    check(res, { 'game ws status is 101': (r) => r && r.status === 101 });
}

export function setup() {
    const seed = Date.now();
    const users = [
        createOrLoginUser(1, seed),
        createOrLoginUser(2, seed),
        createOrLoginUser(3, seed),
    ];

    return { users };
}

export default function (data) {
    if (!data || !data.users || data.users.length === 0) {
        return;
    }

    const users = data.users;
    const actor = users[__VU % users.length];
    const partner = users[(__VU + 1) % users.length];
    const dice = Math.random();

    if (dice < 0.25) {
        runReadFlow(actor);
    } else if (dice < 0.40) {
        runPostFlow(actor);
    } else if (dice < 0.55) {
        runCommentLikeFlow(actor);
    } else if (dice < 0.70) {
        runFriendFlow(actor, partner);
    } else if (dice < 0.85) {
        runDMFlow(actor, partner);
    } else if (dice < 0.95) {
        runChatWSFlow(actor, partner);
    } else {
        runGameFlow(actor, partner);
    }

    // Realistic pacing: 10–30s between actions so each VU mimics a human and stays under per-user limits.
    sleep(THINK_TIME_MIN_SEC + Math.random() * (THINK_TIME_MAX_SEC - THINK_TIME_MIN_SEC));
}
