// Loops (loops.so) contact sync. Adding a contact triggers the existing
// "Contact added" welcome workflow in Loops, so this must fire once per NEW
// account — and must never break auth if the email service hiccups.

const LOOPS_CREATE_URL = "https://app.loops.so/api/v1/contacts/create";

export interface LoopsContact {
  email: string;
  firstName?: string;
  /** Where the contact came from, e.g. "signup". */
  source?: string;
}

// Create the contact in Loops. Uses the /create endpoint deliberately: a 409
// ("email already on list") means the contact exists and the welcome workflow
// already ran — we treat that as a benign no-op, which makes repeated calls
// (e.g. a re-verified email) safe and guarantees the workflow never re-fires.
// NEVER throws: failures are logged and swallowed so signup always succeeds.
export async function addLoopsContact(contact: LoopsContact): Promise<void> {
  const apiKey = process.env.LOOPS_API_KEY;
  if (!apiKey) {
    console.error("[loops] LOOPS_API_KEY missing — contact not added:", contact.email);
    return;
  }

  try {
    const res = await fetch(LOOPS_CREATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: contact.email,
        ...(contact.firstName ? { firstName: contact.firstName } : {}),
        ...(contact.source ? { source: contact.source } : {}),
      }),
      // A slow email API must not stall the auth redirect.
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      console.log("[loops] contact added:", contact.email);
      return;
    }
    if (res.status === 409) {
      // Contact already exists — expected for repeat passes; nothing to do.
      return;
    }
    console.error(
      "[loops] contact create failed:",
      res.status,
      await res.text().catch(() => "")
    );
  } catch (e) {
    console.error("[loops] contact create errored:", e);
  }
}
