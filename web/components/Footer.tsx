import Link from "next/link";
import { Logo } from "./Logo";
import { GITHUB_URL, GitHubIcon, X_URL, XIcon } from "./SocialIcons";

const CHECKOUT = "0x6E41C4C993f0C2967eB9F8a3B27E9AD1E0dDb12e";

export function Footer() {
  return (
    <footer className="mt-24 border-t-2 border-ink bg-cream-deep">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="min-w-0">
          <Logo />
          <p className="mt-3 max-w-sm text-ink-soft">QR payments that settle in USDC on Base. No card terminal, no seed phrase.</p>
          <a
            href={`https://basescan.org/address/${CHECKOUT}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block max-w-full truncate text-sm underline decoration-2 underline-offset-4"
          >
            Checkout contract {CHECKOUT.slice(0, 8)}…{CHECKOUT.slice(-6)}
          </a>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="QRush source code on GitHub" className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-white transition-transform hover:-translate-y-0.5">
              <GitHubIcon />
            </a>
            <a href={X_URL} target="_blank" rel="noopener noreferrer me" aria-label="Follow @kane_120 on X" className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-white transition-transform hover:-translate-y-0.5">
              <XIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
        <FooterCol title="Product" links={[["/features", "Features"], ["/live", "Live payments"], ["/app", "Seller dashboard"]]} />
        <FooterCol title="Learn" links={[["/docs", "Docs"], ["/docs#sellers", "Seller guide"], ["/docs#faq", "FAQ"]]} />
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-ink-soft">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="hover:text-ink hover:underline decoration-2 underline-offset-4">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
