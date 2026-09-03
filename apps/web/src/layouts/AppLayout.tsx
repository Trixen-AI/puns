import {useEffect, useState} from "react";
import {Link, NavLink, Outlet, useLocation} from "react-router-dom";
import {AnimatePresence, motion} from "motion/react";
import {Wordmark} from "@/components/Logo";
import {MenuButton} from "@/components/MenuButton";
import {ConnectButton} from "@/components/ConnectButton";
import {appTabs, EXPLORER, PUNS_PASS_ADDRESS} from "@/lib/content";

/**
 * The application shell.
 *
 * It shares the visual system with the marketing site and nothing else. None of
 * the marketing navigation appears here: someone who has opened the app is
 * trying to do something, and offering them "How it works" mid-task is a way of
 * asking whether they are in the right place.
 */
export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const {pathname} = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-rule bg-paper/85 backdrop-blur-sm">
        <div className="page flex h-16 items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
          <Link to="/app" aria-label="Puns, explore" className="justify-self-start">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-7 justify-self-center md:flex">
            {appTabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({isActive}) =>
                  isActive ? "text-ink" : "text-ink-soft transition-colors hover:text-ink"
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 justify-self-end">
            <span className="hidden md:inline-flex">
              <ConnectButton />
            </span>
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
              {appTabs.map((tab, i) => (
                <motion.div
                  key={tab.to}
                  initial={{opacity: 0, y: 10}}
                  animate={{opacity: 1, y: 0}}
                  transition={{delay: 0.05 + i * 0.045, duration: 0.3}}
                >
                  <NavLink
                    to={tab.to}
                    end={tab.end}
                    onClick={() => setOpen(false)}
                    className={({isActive}) =>
                      `display-3 block py-3 ${isActive ? "text-ink" : "text-ink-muted"}`
                    }
                  >
                    {tab.label}
                  </NavLink>
                </motion.div>
              ))}

              <motion.div
                className="mt-8"
                initial={{opacity: 0, y: 10}}
                animate={{opacity: 1, y: 0}}
                transition={{delay: 0.05 + appTabs.length * 0.045, duration: 0.3}}
              >
                <ConnectButton />
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="border-t border-rule">
        <div className="page flex flex-wrap items-end justify-between gap-6 py-6">
          <div>
            <p className="meta mb-1.5">Puns Pass on Robinhood Chain</p>
            <a
              href={`${EXPLORER}/address/${PUNS_PASS_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs break-all text-ink-muted underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
            >
              {PUNS_PASS_ADDRESS}
            </a>
          </div>

          <Link to="/" className="text-ink-soft transition-colors hover:text-ink">
            Back to the main site
          </Link>
        </div>
      </footer>
    </div>
  );
}
