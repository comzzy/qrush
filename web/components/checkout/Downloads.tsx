"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Hex } from "viem";
import { useConnection, useSignMessage } from "wagmi";
import { api, ApiError } from "@/lib/api";
import { errorText } from "@/lib/tx";
import type { DeliveryItem } from "@/lib/types";
import { ConnectWallet } from "@/components/Wallet";
import { Notice, Spinner } from "@/components/ui";
import { PdfReader } from "./PdfReader";

const orderKey = (hash: string) => `qrush.order.${hash.toLowerCase()}`;
export const rememberOrder = (hash: string, orderId: string) => {
  try {
    localStorage.setItem(orderKey(hash), orderId);
  } catch {
    /* private mode */
  }
};
export const recallOrder = (hash: string) => {
  try {
    return localStorage.getItem(orderKey(hash));
  } catch {
    return null;
  }
};

export const unlockMessage = (txHash: string) =>
  `Unlock my QRush download\nPayment: ${txHash.toLowerCase()}`;

function size(n: number | null) {
  if (!n) return "";
  return n >= 1_048_576
    ? `${(n / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Asks the server for fresh download links. The server re-reads the payment from Base each time,
 * so links only appear once the transaction is confirmed.
 */
export function Downloads({
  invoiceKey,
  txHash,
  buyer,
  tone = "light",
}: {
  invoiceKey: string;
  txHash: Hex;
  buyer?: string;
  tone?: "light" | "plain";
}) {
  const [items, setItems] = useState<DeliveryItem[] | null>(null);
  const [state, setState] = useState<
    "loading" | "waiting" | "locked" | "ready" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [orderId] = useState(() => recallOrder(txHash));
  const [reading, setReading] = useState<DeliveryItem | null>(null);
  const { address } = useConnection();
  const sign = useSignMessage();

  const fetchLinks = async (body: Record<string, unknown>) => {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await api<{ items: DeliveryItem[]; pending?: boolean }>(
          `/pay/${invoiceKey}/delivery`,
          { auth: false, json: { txHash, ...body } },
        );
        if (!res.pending) return res.items;
        setState("waiting");
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) return null;
        throw e;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      "Still waiting for Base to confirm your payment. Refresh in a minute.",
    );
  };

  useEffect(() => {
    let live = true;
    if (!orderId) {
      void Promise.resolve().then(() => live && setState("locked"));
      return () => {
        live = false;
      };
    }
    Promise.resolve()
      .then(() => (live ? fetchLinks({ orderId }) : null))
      .then((r) => {
        if (!live) return;
        if (r) {
          setItems(r);
          setState("ready");
        } else setState("locked");
      })
      .catch((e) => live && (setError(errorText(e)), setState("error")));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, invoiceKey, txHash]);

  const unlock = async () => {
    setError(null);
    try {
      const signature = await sign.mutateAsync({
        message: unlockMessage(txHash),
      });
      setState("loading");
      const r = await fetchLinks({ signature });
      if (!r) {
        setState("locked");
        setError(
          "That wallet did not make this payment. Switch to the wallet you paid with.",
        );
        return;
      }
      setItems(r);
      setState("ready");
    } catch (e) {
      setState("locked");
      setError(errorText(e));
    }
  };

  const wrong =
    buyer && address && buyer.toLowerCase() !== address.toLowerCase();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 border-ink p-4 text-left ${tone === "light" ? "bg-white" : "bg-cream"}`}
      data-testid="downloads"
    >
      <p className="font-bold">Your download</p>
      {state === "loading" || state === "waiting" ? (
        <p className="mt-2 text-sm text-ink-soft">
          <Spinner />{" "}
          {state === "waiting"
            ? "Waiting for Base to confirm your payment…"
            : "Checking your payment…"}
        </p>
      ) : state === "ready" && items ? (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.productId} className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {it.readable && (
                  <button
                    type="button"
                    className="btn btn-ink w-full"
                    onClick={() => setReading(it)}
                    data-testid="read-button"
                  >
                    Read in browser
                  </button>
                )}
                <a
                  href={it.url}
                  className={`btn btn-sun w-full !whitespace-normal text-center ${it.readable ? "" : "sm:col-span-2"}`}
                  rel="noreferrer"
                  target={it.kind === "url" ? "_blank" : undefined}
                  data-testid="download-button"
                  aria-disabled={it.downloadsLeft === 0}
                >
                  {it.kind === "file"
                    ? `Download ${it.fileName ?? it.name}`
                    : `Open ${it.name}`}
                  {it.size ? (
                    <span className="text-xs font-normal">
                      ({size(it.size)})
                    </span>
                  ) : null}
                </a>
              </div>
              {it.downloadsLeft != null && (
                <p
                  className="text-xs text-ink-soft"
                  data-testid="downloads-left"
                >
                  {it.downloadsLeft > 0
                    ? `${it.downloadsLeft} download${it.downloadsLeft === 1 ? "" : "s"} left.`
                    : "No downloads left. You can still read it here."}
                  {it.readable
                    ? " Your copy is marked with your name and order code."
                    : ""}
                </p>
              )}
              {reading?.productId === it.productId && (
                <PdfReader
                  url={`${it.url}?view=1`}
                  title={it.fileName ?? it.name}
                  onClose={() => setReading(null)}
                />
              )}
            </li>
          ))}
          <li className="text-xs text-ink-soft">
            Links expire in 15 minutes. Come back to this receipt any time to
            get a fresh one.
          </li>
        </ul>
      ) : state === "locked" ? (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-ink-soft">
            Sign a free message with the wallet that paid to unlock your file.
            It does not move any money.
          </p>
          {!address ? (
            <ConnectWallet label="Connect the wallet you paid with" />
          ) : (
            <button
              type="button"
              className="btn btn-ink w-full"
              onClick={unlock}
              disabled={sign.isPending}
              data-testid="unlock-download"
            >
              {sign.isPending ? (
                <>
                  <Spinner /> Check your wallet…
                </>
              ) : (
                "Unlock download"
              )}
            </button>
          )}
          {wrong && (
            <p className="text-xs text-pink-deep">
              This wallet is not the one that paid.
            </p>
          )}
        </div>
      ) : null}
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </motion.div>
  );
}
