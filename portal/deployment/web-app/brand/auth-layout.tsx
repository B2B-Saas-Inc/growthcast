import Link from 'next/link';
import {GrowthcastWordmark} from '@/components/growthcast-wordmark';
export const dynamic='force-dynamic';
export default function AuthLayout({children}:{children:React.ReactNode}) {
  return <div className="gc-auth">
    <header className="gc-auth-header"><Link href="/login" aria-label="GrowthCast client portal"><GrowthcastWordmark /></Link><a href="https://growthcast.app">Back to GrowthCast <span aria-hidden="true">↗</span></a></header>
    <main className="gc-auth-main"><section className="gc-auth-intro"><span className="gc-eyebrow">YOUR GROWTH, IN VIEW</span><h1>One place.<br />Clear progress<span className="gc-coral">.</span></h1><p>Your projects, conversations, and next steps.<br />All together with your GrowthCast team.</p><div className="gc-auth-footnote"><span>01 / CLIENT PORTAL</span><span>Built for what’s next.</span></div></section><section className="gc-auth-form" aria-label="Portal account">{children}</section></main>
    <footer className="gc-auth-footer"><span>GrowthCast</span><span>Clarity. Alignment. Growth.</span></footer>
  </div>;
}
