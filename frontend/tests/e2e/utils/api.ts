import type { APIRequestContext } from "@playwright/test";

export interface SanctumRequestPayload {
	requested_name: string;
	requested_slug: string;
	reason: string;
}

const API_BASE = (
	process.env.PLAYWRIGHT_API_URL || "http://localhost:8375/api"
).replace(/\/$/, "");

export function uniqueSlug(prefix: string): string {
	const maxLen = 24;
	const sep = "-";
	const prefixSafe = prefix.replace(/[^a-z0-9-]/gi, "").toLowerCase();
	const available = Math.max(3, maxLen - prefixSafe.length - sep.length);
	const rand = Math.random()
		.toString(36)
		.slice(2, 2 + available);
	let slug = `${prefixSafe}${sep}${rand}`;
	if (slug.length > maxLen) {
		slug = slug.slice(0, maxLen);
	}
	// ensure minimum length and allowed chars
	slug = slug.replace(/[^a-z0-9-]/g, "");
	if (slug.length < 3) {
		slug = (slug + "aaa").slice(0, 3);
	}
	return slug;
}

export async function createSanctumRequest(
	request: APIRequestContext,
	token: string,
	payload: SanctumRequestPayload,
) {
	return request.post(`${API_BASE}/sanctums/requests`, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
		data: payload,
	});
}

export async function listAdminRequests(
	request: APIRequestContext,
	token: string,
	status: "pending" | "approved" | "rejected",
) {
	return request.get(`${API_BASE}/admin/sanctum-requests?status=${status}`, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
}

export async function approveSanctumRequest(
	request: APIRequestContext,
	token: string,
	id: number,
	review_notes?: string,
) {
	return request.post(`${API_BASE}/admin/sanctum-requests/${id}/approve`, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
		data: { review_notes },
	});
}
