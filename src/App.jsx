import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Heart, Mail, Sparkles, X } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import HeartScene from './components/HeartScene.jsx';

gsap.registerPlugin(ScrollTrigger);

const PENDING_REQUEST_STORAGE_KEY = 'golden-visit-pass-pending-request';
const YEAR_IN_MS = 365 * 24 * 60 * 60 * 1000;

function formatDate(dateValue) {
  if (!dateValue) return 'the date shown in the status';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(dateValue));
}

export default function App() {
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redemptionState, setRedemptionState] = useState('idle');
  const [redemptionError, setRedemptionError] = useState('');
  const [activeRequestId, setActiveRequestId] = useState(() => {
    try { return window.localStorage.getItem(PENDING_REQUEST_STORAGE_KEY); } catch { return null; }
  });
  const [availability, setAvailability] = useState({ loading: true, available: null, nextAvailableAt: null, notificationStatus: null, retryRequestId: null });
  const [cardTilt, setCardTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return undefined;

    const lenis = new Lenis({
      duration: 1.12,
      smoothWheel: true,
      wheelMultiplier: 0.86,
      touchMultiplier: 1.25,
    });

    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const context = gsap.context(() => {
      gsap.utils.toArray('.reveal').forEach((element) => {
        gsap.fromTo(
          element,
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: element,
              start: 'top 88%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      });
    });

    return () => {
      context.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/status', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not check pass status.');
        if (cancelled) return;
        setAvailability({
          loading: false,
          available: typeof data.available === 'boolean' ? data.available : null,
          nextAvailableAt: data.nextAvailableAt || null,
          notificationStatus: data.notificationStatus || null,
          retryRequestId: data.retryRequestId || null,
          configured: Boolean(data.configured),
        });
        if (data.retryRequestId) {
          setActiveRequestId(data.retryRequestId);
          try { window.localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, data.retryRequestId); } catch { /* Storage is optional. */ }
        } else if (data.available === true) {
          setActiveRequestId(null);
          try { window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY); } catch { /* Storage is optional. */ }
        }
      })
      .catch(() => {
        if (!cancelled) setAvailability((current) => ({ ...current, loading: false, available: null }));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!redeemOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setRedeemOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [redeemOpen]);

  const handleCardMove = (event) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    setCardTilt({ x: y * -7, y: x * 9 });
  };

  const resetCardTilt = () => setCardTilt({ x: 0, y: 0 });

  const openRedeemModal = () => {
    setRedemptionError('');
    setRedeemOpen(true);
    if (availability.available === false && availability.notificationStatus === 'sent') {
      setRedemptionState('used');
      return;
    }
    setRedemptionState('sending');
    if (availability.available === false && availability.retryRequestId) {
      setActiveRequestId(availability.retryRequestId);
      void handleRedeem(availability.retryRequestId);
      return;
    }
    void handleRedeem();
  };

  const handleRedeem = async (requestIdOverride = null) => {
    if (redemptionState === 'sending') return;
    setRedemptionState('sending');
    setRedemptionError('');
    const requestId = requestIdOverride || activeRequestId || window.crypto.randomUUID();
    setActiveRequestId(requestId);
    try { window.localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, requestId); } catch { /* Storage is optional. */ }

    try {
      const response = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.code === 'PASS_ALREADY_REDEEMED') {
        if (data.retryRequestId && data.notificationStatus !== 'sent') {
          setActiveRequestId(data.retryRequestId);
          try { window.localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, data.retryRequestId); } catch { /* Storage is optional. */ }
          setAvailability({ loading: false, available: false, nextAvailableAt: data.nextAvailableAt || null, notificationStatus: data.notificationStatus || 'failed', retryRequestId: data.retryRequestId });
          setRedemptionError('The pass was already claimed, but the email still needs attention. Retry the notification below. You do not need to redeem again.');
          setRedemptionState('error');
        } else {
          setAvailability({ loading: false, available: false, nextAvailableAt: data.nextAvailableAt || null, notificationStatus: 'sent', retryRequestId: null });
          try { window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY); } catch { /* Storage is optional. */ }
          setActiveRequestId(null);
          setRedemptionState('used');
        }
        return;
      }

      if (!response.ok || !data.success) {
        if (response.status === 503 || response.status === 400) {
          try { window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY); } catch { /* Storage is optional. */ }
          setActiveRequestId(null);
        }
        setRedemptionError(data.error || 'Something interrupted the redemption. Please try again.');
        setRedemptionState('error');
        return;
      }

      try { window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY); } catch { /* Storage is optional. */ }
      setActiveRequestId(null);
      setAvailability({
        loading: false,
        available: false,
        nextAvailableAt: data.nextAvailableAt || new Date(Date.now() + YEAR_IN_MS).toISOString(),
        notificationStatus: 'sent',
        retryRequestId: null,
      });
      setRedemptionState('success');
    } catch (error) {
      setRedemptionError('We could not reach the redemption service just now. Your request ID has been kept so you can safely retry without using another pass.');
      setRedemptionState('error');
    }
  };

  return (
    <main>
      <div className="grain" aria-hidden="true" />
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="A little promise, back to top">
          <span className="wordmark-mark"><Heart size={15} strokeWidth={1.7} /></span>
          <span>A LITTLE PROMISE</span>
        </a>
        <div className="header-note"><span className="status-dot" /> MADE FOR CUTUU <span className="header-divider">/</span> 17 OCT</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow"><span className="eyebrow-line" /> A GOLDEN PROMISE, JUST FOR YOU</div>
          <h1>
            For the miles<br />
            <span className="headline-light">between us,</span><br />
            <em>I’ll still come.</em>
          </h1>
          <p className="hero-description">
            Cutuu, this is your once-a-year pass for when “I wish you were here” just isn’t enough.
            Redeem it, and I’ll make the trip. Work can wait. The calendar can figure it out.
          </p>
          <div className="hero-actions">
            <a className="button button-gold" href="#pass">Meet me in real life <ArrowDownRight size={17} /></a>
            <span className="hero-microcopy"><Heart size={13} fill="currentColor" /> valid for one very real hug</span>
          </div>
          <div className="hero-footnote"><span>01</span><span className="footnote-rule" /><span>AN ANNIVERSARY EDITION</span></div>
        </div>

        <div className="hero-visual">
          <div className="visual-orbit visual-orbit-one" />
          <div className="visual-orbit visual-orbit-two" />
          <HeartScene />
          <div className="floating-note note-top"><Sparkles size={14} /> NOT A VIRTUAL HUG</div>
          <div className="floating-note note-bottom"><span className="note-star">✳</span> ACTUAL, IN-PERSON YOU + ME</div>
        </div>
        <div className="hero-bottom-line"><span>MADE WITH ALL MY HEART</span><span>SCROLL A LITTLE <ArrowDownRight size={14} /></span></div>
      </section>

      <div className="ticker" aria-label="Distance is temporary, this promise is real">
        <div className="ticker-track">
          {Array.from({ length: 4 }, (_, index) => (
            <span className="ticker-set" key={index} aria-hidden={index > 0}>
              DISTANCE IS TEMPORARY <i>✳</i> THIS PROMISE IS REAL <i>✳</i> ONE VISIT, EVERY YEAR <i>✳</i>
            </span>
          ))}
        </div>
      </div>

      <section className="pass-section" id="pass">
        <div className="section-intro reveal">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR LITTLE GET-OUT-OF-MISSING-ME CARD</div>
          <h2>Some promises<br />deserve to be <em>held.</em></h2>
          <p>
            Not another saved post. Not a “soon, promise”. A tiny golden reminder that whenever the distance gets too much,
            there’s a real person on the other side who will show up for you.
          </p>
        </div>

        <div className="pass-stage reveal">
          <div className="pass-card-wrap" style={{ perspective: '1200px' }}>
            <article
              className="pass-card"
              style={{ transform: `rotateX(${cardTilt.x}deg) rotateY(${cardTilt.y}deg)` }}
              onPointerMove={handleCardMove}
              onPointerLeave={resetCardTilt}
            >
              <div className="card-sheen" aria-hidden="true" />
              <div className="card-topline">
                <div className="card-brand"><span className="card-brand-symbol">✳</span><span>THE LITTLE PROMISE CO.</span></div>
                <div className="card-edition">EDITION Nº 001</div>
              </div>
              <div className="card-center">
                <div className="card-kicker">THE DISTANCE-DOESN’T-WIN COLLECTION</div>
                <div className="card-title">Golden<br /><i>Visit Pass</i></div>
                <div className="card-subtitle">ONE VERY REAL VISIT. NO MAYBES.</div>
              </div>
              <div className="card-bottomline">
                <div className="card-holder"><span>ISSUED WITH LOVE TO</span><strong>CUTUU <Heart size={13} fill="currentColor" /></strong></div>
                <div className="card-validity"><span>REDEMPTION</span><strong>EVERY 365 DAYS</strong></div>
                <div className="card-stamp" aria-hidden="true"><span>R</span><small>♡</small></div>
              </div>
              <div className="card-serial">17 · 10 · US <span>♡</span> NO EXPIRY ON THE PROMISE</div>
            </article>
          </div>
          <div className="pass-caption"><span><Sparkles size={14} /> HANDLE WITH LOVE</span><span>ONE REDEMPTION EVERY 365 DAYS</span></div>
        </div>

        <div className="redeem-row reveal">
          <div className="redeem-copy">
            <span className="redeem-number">THE IMPORTANT BIT</span>
            <h3>Whenever you need me,<br /><em>this is your sign.</em></h3>
            <p>No convincing. No perfect timing required. You can redeem this only once every 365 days. One click sends an email to me automatically. You won’t need to message me separately; I’ll start figuring out the soonest day I can be there.</p>
          </div>
          <button
            className="button button-cream redeem-button"
            type="button"
            onClick={openRedeemModal}
            disabled={availability.loading || (availability.available === false && availability.notificationStatus === 'sent')}
          >
            {availability.loading ? 'Checking your pass…' : availability.available === false && availability.notificationStatus === 'sent' ? 'Redeemed for this year' : availability.available === false && availability.retryRequestId ? 'Retry email notification' : 'Redeem your visit'}
            <ArrowUpRight size={17} />
          </button>
        </div>
      </section>

      <section className="last-note">
        <div className="last-note-star" aria-hidden="true">✳</div>
        <div className="eyebrow reveal"><span className="eyebrow-line" /> UNTIL I CAN BE THERE IN PERSON</div>
        <p className="last-note-message reveal">“The distance gets a say in our plans,<br />but <em>never in how much you matter.</em>”</p>
        <div className="signature reveal"><span>made for you, always</span><strong>Ritik <Heart size={16} fill="currentColor" /></strong></div>
      </section>

      <footer className="site-footer"><span>© ONE HEART, TWO LOCATIONS</span><span>BUILT WITH LOVE, NOT A TEMPLATE <Heart size={11} fill="currentColor" /></span></footer>

      {redeemOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && redemptionState !== 'sending') setRedeemOpen(false); }}>
          <section className="redeem-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-busy={redemptionState === 'sending'}>
            <button className="modal-close" type="button" onClick={() => setRedeemOpen(false)} aria-label="Close" disabled={redemptionState === 'sending'}><X size={19} /></button>
            {redemptionState === 'sending' && (
              <>
                <div className="modal-icon modal-icon-pulse"><Mail size={23} /></div>
                <div className="eyebrow modal-eyebrow">MAKING IT OFFICIAL</div>
                <h2 id="modal-title">One little click,<br /><em>one big plan.</em></h2>
                <p>Locking in your annual pass and emailing Ritik now. You can leave the rest to him.</p>
                <div className="modal-progress" role="status"><span /> SENDING YOUR NOTIFICATION</div>
              </>
            )}
            {redemptionState === 'success' && (
              <>
                <div className="modal-icon"><Heart size={24} fill="currentColor" /></div>
                <div className="eyebrow modal-eyebrow">IT’S OFFICIAL, CUTUU</div>
                <h2 id="modal-title">Your promise is<br /><em>in motion.</em></h2>
                <p>Your Golden Visit Pass is redeemed, and Ritik has been emailed. You don’t need to open your mail, send him a message, or remind him separately. Your job here is done. The pass is now locked for 365 days, and he’ll start figuring out the soonest realistic date to come see you. ❤️</p>
                <div className="modal-success-note"><span>NEXT REDEMPTION</span><strong>{formatDate(availability.nextAvailableAt)}</strong></div>
                <button className="button button-gold modal-action" type="button" onClick={() => setRedeemOpen(false)}>Keep this little promise <Heart size={16} /></button>
              </>
            )}
            {redemptionState === 'used' && (
              <>
                <div className="modal-icon"><Heart size={24} fill="currentColor" /></div>
                <div className="eyebrow modal-eyebrow">THE GOLDEN PASS</div>
                <h2 id="modal-title">Already claimed,<br /><em>my love.</em></h2>
                <p>This pass has already been redeemed, so it can’t be used again until <strong className="modal-date-emphasis">{formatDate(availability.nextAvailableAt)}</strong>. That’s the once-every-365-days promise doing its job. Your visit request is already on record.</p>
                <button className="button button-gold modal-action" type="button" onClick={() => setRedeemOpen(false)}>Got it, my love <Heart size={16} /></button>
              </>
            )}
            {redemptionState === 'error' && (
              <>
                <div className="modal-icon"><Mail size={24} /></div>
                <div className="eyebrow modal-eyebrow">A TINY TECHNICAL PAUSE</div>
                <h2 id="modal-title">We’ll get this<br /><em>sorted.</em></h2>
                <p>{redemptionError || 'Something interrupted the redemption. Please try again.'}</p>
                <button className="button button-gold modal-action" type="button" onClick={handleRedeem}>{activeRequestId ? 'Retry email notification' : 'Try again'} <ArrowUpRight size={16} /></button>
                <button className="modal-dismiss" type="button" onClick={() => setRedeemOpen(false)}>Close this window</button>
              </>
            )}
          </section>
        </div>
      )}

    </main>
  );
}
