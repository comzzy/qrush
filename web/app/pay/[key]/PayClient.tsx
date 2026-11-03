"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useBalance, useConnection, useReadContract } from "wagmi";
import { erc20Abi, formatEther, formatUnits, type Hex } from "viem";
import { api, ApiError } from "@/lib/api";
import { errorText, sendBatchOrSequential } from "@/lib/tx";
import { BASESCAN, shortAddress, usd } from "@/lib/format";
import type { Checkout, PayView, RawPayment } from "@/lib/types";
import { ConnectWallet, WalletChip } from "@/components/Wallet";
import { Notice, Skeleton, Spinner } from "@/components/ui";
import { Guy } from "@/components/art/Guy";
import { Sparkle } from "@/components/art/Sparkle";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
type Token = "usdc" | "eth";
type Phase = { kind: "idle" } | { kind: "paying"; step?: string } | { kind: "confirming"; hash: Hex } | { kind: "done"; receiptId: number; hash: Hex };

export function PayClient({ invoiceKey }: { invoiceKey: string }) {
  const view = useQuery({
    queryKey: ["pay", invoiceKey],
    queryFn: () => api<PayView>(`/pay/${invoiceKey}`, { auth: false }),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const seller = view.data?.invoice.seller;
  const basename = useQuery({
    queryKey: ["basename", seller],
    queryFn: () => api<{ name: string | null }>(`/basenames/reverse/${seller}`, { auth: false }).catch(() => ({ name: null })),
    enabled: Boolean(seller),
    staleTime: 3_600_000,
  });

  return (
    <div className="section grid items-start gap-8 py-8 md:grid-cols-[1fr_minmax(0,26rem)] md:py-14">
      <div className="order-2 hidden md:order-1 md:block">
        <PayArt paid={false} />
      </div>
      <div className="order-1 md:order-2">
        {view.isLoading ? (
          <Skeleton className="h-[28rem]" />
        ) : view.error ? (
          <div className="card p-6">
            <h1 className="text-2xl font-bold">Link not found</h1>
            <p className="mt-2 text-ink-soft">This pay link does not exist. Ask the seller for a new QR.</p>
          </div>
        ) : view.data ? (
          <PayCard view={view.data} basename={basename.data?.name ?? null} invoiceKey={invoiceKey} />
        ) : null}
      </div>
    </div>
  );
}

function PayArt({ paid }: { paid: boolean }) {
  return (
    <div className="relative mx-auto max-w-sm">
      <Sparkle className="absolute top-6 left-2" size={26} />
      <Sparkle className="absolute top-24 right-4" size={18} delay={0.6} />
      <Guy paid={paid} demo={false} className="w-full" />
    </div>
  );
}

function PayCard({ view, basename, invoiceKey }: { view: PayView; basename: string | null; invoiceKey: string }) {
  const { invoice, shop } = view;
  const { address, status } = useConnection();
  const [token, setToken] = useState<Token>("usdc");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  const quote = useQuery({
    queryKey: ["quote", invoiceKey, address, token],
    queryFn: () => api<Checkout>(`/pay/${invoiceKey}/checkout?buyer=${address}&token=${token}`, { auth: false }),
    enabled: Boolean(address) && view.payable && phase.kind === "idle",
    refetchInterval: token === "eth" ? 20_000 : false,
    retry: false,
  });
  const aa = useQuery({ queryKey: ["aa"], queryFn: () => api<{ paymasterUrl: string | null }>("/aa/config", { auth: false }), staleTime: Infinity });
  const usdcBal = useReadContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: Boolean(address) } });
  const ethBal = useBalance({ address, query: { enabled: Boolean(address) } });

  // Wait for the indexer to record the payment, then show the receipt.
  useEffect(() => {
    if (phase.kind !== "confirming") return;
    let stop = false;
    const tick = async () => {
      while (!stop) {
        const rows = await api<RawPayment[]>(`/pay/${invoiceKey}/receipts`, { auth: false }).catch(() => []);
        const hit = rows.find((r) => r.txHash.toLowerCase() === phase.hash.toLowerCase());
        if (hit) return setPhase({ kind: "done", receiptId: hit.receiptId, hash: phase.hash });
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [phase, invoiceKey]);

  const pay = async () => {
    if (!quote.data) return;
    setError(null);
    setPhase({ kind: "paying" });
    try {
      const hash = await sendBatchOrSequential(quote.data.calls, quote.data.transactions, aa.data?.paymasterUrl ?? null, ({ index, total }) =>
        setPhase({ kind: "paying", step: total > 1 ? `Step ${index + 1} of ${total}` : undefined }),
      );
      setPhase({ kind: "confirming", hash });
    } catch (e) {
      setError(errorText(e));
      setPhase({ kind: "idle" });
    }
  };

  const balance =
    token === "usdc"
      ? usdcBal.data !== undefined && `${Number(formatUnits(usdcBal.data, 6)).toFixed(2)} USDC`
      : ethBal.data && `${Number(formatEther(ethBal.data.value)).toFixed(5)} ETH`;
  const short =
    quote.data &&
    (token === "usdc"
      ? usdcBal.data !== undefined && usdcBal.data < BigInt(quote.data.amountDueUnits)
      : ethBal.data && quote.data.swap && ethBal.data.value < BigInt(quote.data.swap.maxAmountIn));

  if (phase.kind === "done") return <Paid view={view} receiptId={phase.receiptId} hash={phase.hash} />;

  return (
    <motion.div layout className="card overflow-hidden" data-testid="pay-card">
      <div className="relative bg-pink px-6 pt-6 pb-8 text-white">
        <p className="text-sm font-semibold opacity-90">Pay {basename ?? shop.name}</p>
        <h1 className="mt-1 text-2xl font-bold" data-testid="pay-shop">{shop.name}</h1>
        {basename && <p className="text-sm opacity-90">{basename}</p>}
        <p className="mt-4 text-5xl font-bold tracking-tight" data-testid="pay-amount">{usd(quote.data?.amountDue ?? invoice.amount)}</p>
        {quote.data && quote.data.discount !== "0" && Number(quote.data.discount) > 0 && (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-2 inline-block rounded-full bg-sun px-3 py-1 text-sm font-bold text-ink">
            Loyalty reward: {usd(quote.data.discount)} off {usd(quote.data.gross)}
          </motion.p>
        )}
        <Sparkle className="absolute top-5 right-6" size={22} />
      </div>
      <div className="space-y-4 p-6">
        {invoice.items.length > 0 && (
          <ul className="space-y-1 text-sm">
            {invoice.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3"><span>{it.quantity}× {it.name}</span><span>{usd(Number(it.unitPriceFormatted) * it.quantity)}</span></li>
            ))}
          </ul>
        )}
        {invoice.memo && <p className="rounded-xl bg-cream p-3 text-sm">{invoice.memo}</p>}

        {!view.payable ? (
          <Notice>{view.onchain.status === "completed" || invoice.status === "completed" ? "This link has already been paid." : invoice.status === "cancelled" || view.onchain.status === "cancelled" ? "The seller cancelled this link." : "This link is not ready yet. Ask the seller to sign it."}</Notice>
        ) : status !== "connected" ? (
          <ConnectWallet label="Connect a wallet to pay" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2"><span className="text-sm text-ink-soft">Paying from</span><WalletChip /></div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pay with">
              {(["usdc", "eth"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={token === t} onClick={() => setToken(t)} disabled={phase.kind !== "idle"} className={`rounded-2xl border-2 border-ink p-3 text-left transition ${token === t ? "bg-sun shadow-[3px_3px_0_#161616]" : "bg-white"}`} data-testid={`token-${t}`}>
                  <span className="block font-bold">{t.toUpperCase()}</span>
                  <span className="text-xs text-ink-soft">{t === "usdc" ? "Sent as is" : "Swapped to USDC on Uniswap"}</span>
                </button>
              ))}
            </div>
            <div className="min-h-12 text-sm">
              {quote.isFetching && !quote.data ? (
                <span className="text-ink-soft"><Spinner /> Getting the best price…</span>
              ) : quote.error ? (
                <Notice tone="error">{errorText(quote.error)}</Notice>
              ) : quote.data ? (
                <div className="space-y-1">
                  {quote.data.swap && <p>You pay about <b>{Number(formatEther(BigInt(quote.data.swap.amountIn))).toFixed(6)} ETH</b>, at most {Number(formatEther(BigInt(quote.data.swap.maxAmountIn))).toFixed(6)}. Unused ETH is refunded.</p>}
                  {balance && <p className="text-ink-soft">Balance: {balance}</p>}
                  <p className="text-ink-soft">Plus a tiny Base network fee, usually under one cent, paid in ETH.</p>
                  {short && <p className="font-semibold text-pink-deep">Not enough balance for this payment.</p>}
                </div>
              ) : null}
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <button type="button" className="btn btn-ink w-full text-lg" onClick={pay} disabled={!quote.data || phase.kind !== "idle" || Boolean(short)} data-testid="pay-button">
              {phase.kind === "paying" ? <><Spinner /> {phase.step ?? "Confirm in your wallet…"}</> : phase.kind === "confirming" ? <><Spinner /> Confirming on Base…</> : `Pay ${quote.data ? usd(quote.data.amountDue) : ""}`}
            </button>
            <AnimatePresence>
              {phase.kind === "confirming" && (
                <motion.a initial={{ opacity: 0 }} animate={{ opacity: 1 }} href={`${BASESCAN}/tx/${phase.hash}`} target="_blank" rel="noreferrer" className="block text-center text-sm underline">
                  View transaction
                </motion.a>
              )}
            </AnimatePresence>
          </>
        )}
        <p className="text-center text-xs text-ink-soft">Paid to {shortAddress(invoice.seller)} through the QRush checkout contract on Base.</p>
      </div>
    </motion.div>
  );
}

function Paid({ view, receiptId, hash }: { view: PayView; receiptId: number; hash: Hex }) {
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card bg-mint p-6 text-center" data-testid="pay-success">
      <div className="mx-auto max-w-[14rem]"><Guy paid demo={false} /></div>
      <h1 className="mt-2 text-3xl font-bold">Paid!</h1>
      <p className="mt-1">{view.shop.name} has received your payment.</p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href={`/receipt/${receiptId}`} className="btn btn-ink" data-testid="view-receipt">View receipt #{receiptId}</Link>
        <a href={`${BASESCAN}/tx/${hash}`} target="_blank" rel="noreferrer" className="btn btn-cream">See it on Basescan</a>
      </div>
    </motion.div>
  );
}
