"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/lib/api";
import { errorText } from "@/lib/tx";
import { Notice, Spinner } from "@/components/ui";

const REASONS = [
  { key: "stolen", label: "It copies someone else's work" },
  { key: "misleading", label: "It is not what it claims to be" },
  { key: "broken", label: "The file or link does not work" },
  { key: "other", label: "Something else" },
] as const;

/** Lets anyone flag a product. Reports are saved for review. */
export function ReportProduct({ invoiceKey }: { invoiceKey: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] =
    useState<(typeof REASONS)[number]["key"]>("stolen");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setState("sending");
    try {
      await api(`/pay/${invoiceKey}/report`, {
        auth: false,
        json: {
          reason,
          details: details || undefined,
          contact: contact || undefined,
        },
      });
      setState("sent");
    } catch (e) {
      setError(errorText(e));
      setState("idle");
    }
  };

  return (
    <div className="text-center">
      {!open ? (
        <button
          type="button"
          className="text-xs text-ink-soft underline underline-offset-2"
          onClick={() => setOpen(true)}
          data-testid="report-open"
        >
          Report this product
        </button>
      ) : null}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden text-left"
          >
            <div
              className="mt-2 space-y-3 rounded-2xl border-2 border-ink bg-cream p-4"
              data-testid="report-form"
            >
              {state === "sent" ? (
                <p className="text-sm font-semibold" data-testid="report-sent">
                  Thanks. Your report is saved and will be reviewed.
                </p>
              ) : (
                <>
                  <p className="text-sm font-bold">What is wrong?</p>
                  <div className="space-y-1">
                    {REASONS.map((r) => (
                      <label
                        key={r.key}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="report-reason"
                          checked={reason === r.key}
                          onChange={() => setReason(r.key)}
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                  <textarea
                    className="field"
                    rows={2}
                    maxLength={1000}
                    placeholder="Details (optional)"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                  />
                  <input
                    className="field"
                    maxLength={200}
                    placeholder="Your email, if you want a reply (optional)"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                  {error && <Notice tone="error">{error}</Notice>}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-ink !py-1.5 text-sm"
                      onClick={send}
                      disabled={state === "sending"}
                      data-testid="report-send"
                    >
                      {state === "sending" ? (
                        <>
                          <Spinner /> Sending…
                        </>
                      ) : (
                        "Send report"
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-cream !py-1.5 text-sm"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
