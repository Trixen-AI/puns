import {useEffect, useState} from "react";
import {Link, useLocation} from "react-router-dom";
import {AnimatePresence, motion} from "motion/react";
import {Wordmark} from "@/components/Logo";
import {MenuButton} from "@/components/MenuButton";
import {nav} from "@/lib/content";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const {pathname, hash} = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, {passive: true});
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A menu that survives navigation traps the reader on the page they just left.
  useEffect(() => setOpen(false), [pathname, hash]);

  // While the overlay is up, the page behind it must not scroll.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header
        className={`sticky top-0 z-50 bg-paper/85 backdrop-blur-sm transition-colors ${
          scrolled && !open ? "border-b border-rule" : "border-b border-transparent"
        }`}
      >
        {/* Three tracks, so the centre column is centred on the page rather than
            on whatever the left and right columns happen to measure. */}
        <div className="page flex h-16 items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
          <Link to="/" aria-label="Puns, home" className="justify-self-start">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-7 justify-self-center md:flex">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-ink-soft transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 justify-self-end">
            <Link to="/app" className="btn btn-solid hidden md:inline-flex">
              Open the app
            </Link>
            <MenuButton open={open} onClick={() => setOpen((v) => !v)} />
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 bg-paper/70 backdrop-blur-xl md:hidden"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.22, ease: "easeOut"}}
          >
            <nav className="page flex h-full flex-col justify-center gap-1 pb-24">
              {nav.map((item, i) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="display-3 py-3 text-ink"
                  initial={{opacity: 0, y: 10}}
                  animate={{opacity: 1, y: 0}}
                  transition={{delay: 0.05 + i * 0.045, duration: 0.3}}
                >
                  {item.label}
                </motion.a>
              ))}

              <motion.div
                initial={{opacity: 0, y: 10}}
                animate={{opacity: 1, y: 0}}
                transition={{delay: 0.05 + nav.length * 0.045, duration: 0.3}}
                className="mt-8"
              >
                <Link to="/app" className="btn btn-solid" onClick={() => setOpen(false)}>
                  Open the app
                </Link>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
