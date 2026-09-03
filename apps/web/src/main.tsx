import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter, Route, Routes} from "react-router-dom";
import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";

import "./index.css";
import {wagmiConfig} from "@/lib/wallet";
import MarketingLayout from "@/layouts/MarketingLayout";
import AppLayout from "@/layouts/AppLayout";
import Home from "@/routes/Home";
import Docs from "@/routes/Docs";
import {Explore, Create, Pass, Portfolio, Token} from "@/routes/app";

// Chain reads are the app's data layer, so caching them well is the data layer.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The endpoint is unreliable; retrying is the difference between a blank
      // screen and a page that loads a beat late.
      retry: 3,
      retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 4000),
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/docs" element={<Docs />} />
            </Route>

            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Explore />} />
              <Route path="create" element={<Create />} />
              <Route path="pass" element={<Pass />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="t/:address" element={<Token />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
