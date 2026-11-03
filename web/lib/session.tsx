"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConnection, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";
import { getAddress, type Address } from "viem";
import { api, getToken, setToken } from "./api";

type Me = { address: Address; onchainRegistered: boolean; basename: string | null };

type Session = {
  me: Me | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useConnection();
  const { mutateAsync: signMessage } = useSignMessage();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {
      setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load the stored session once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // A session belongs to one wallet: switching accounts signs out.
  const mismatch = Boolean(me && isConnected && address && getAddress(address) !== me.address);
  if (mismatch) setMe(null);
  useEffect(() => {
    if (mismatch) setToken(null);
  }, [mismatch]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigningIn(true);
    setError(null);
    try {
      const n = await api<{ nonce: string; domain: string; uri: string; chainId: number }>("/auth/nonce", { auth: false });
      const message = createSiweMessage({
        address: getAddress(address),
        chainId: n.chainId,
        domain: n.domain,
        nonce: n.nonce,
        uri: n.uri,
        version: "1",
        statement: "Sign in to QRush to manage your shop.",
        issuedAt: new Date(),
      });
      const signature = await signMessage({ message });
      const res = await api<{ token: string }>("/auth/verify", { json: { message, signature }, auth: false });
      setToken(res.token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0]! : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }, [address, refresh, signMessage]);

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ me, loading, signingIn, error, signIn, signOut, refresh }),
    [me, loading, signingIn, error, signIn, signOut, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
