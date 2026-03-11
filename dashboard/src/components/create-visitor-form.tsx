"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateVisitorResponse = {
  ok?: boolean;
  visitorId?: string;
};

export function CreateVisitorForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_HOPE_OPS_BASE_URL?.trim();
      const apiKey = process.env.NEXT_PUBLIC_HOPE_API_KEY?.trim();

      if (!baseUrl) {
        throw new Error("Missing required env var: NEXT_PUBLIC_HOPE_OPS_BASE_URL");
      }

      if (!apiKey) {
        throw new Error("Missing required env var: NEXT_PUBLIC_HOPE_API_KEY");
      }

      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/visitors`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          accept: "application/json"
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail
        })
      });

      if (!response.ok) {
        throw new Error(`POST /api/visitors failed with status ${response.status}`);
      }

      const data = (await response.json()) as CreateVisitorResponse;
      const visitorId = typeof data.visitorId === "string" ? data.visitorId : "";

      if (!visitorId) {
        throw new Error("POST /api/visitors returned no visitorId");
      }

      router.push(`/visitors/${visitorId}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create visitor.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Create Visitor</h2>
        <p style={{ marginTop: 6, marginBottom: 0, color: "#6b7280", fontSize: 14 }}>
          Create a visitor record using the current identity surface. Phone is optional for now and is not stored yet.
        </p>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="visitor-name" style={{ fontWeight: 600 }}>
            Name
          </label>
          <input
            id="visitor-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jane Doe"
            style={{
              padding: 10,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              font: "inherit"
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="visitor-email" style={{ fontWeight: 600 }}>
            Email
          </label>
          <input
            id="visitor-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="jane@example.com"
            style={{
              padding: 10,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              font: "inherit"
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="visitor-phone" style={{ fontWeight: 600 }}>
            Phone <span style={{ color: "#6b7280", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="visitor-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="555-123-4567"
            style={{
              padding: 10,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              font: "inherit"
            }}
          />
        </div>

        {error ? (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b"
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              font: "inherit",
              cursor: isSubmitting ? "default" : "pointer",
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isSubmitting ? "Creating..." : "Create Visitor"}
          </button>
        </div>
      </form>
    </div>
  );
}
