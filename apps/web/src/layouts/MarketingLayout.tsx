import {Outlet} from "react-router-dom";
import {Header} from "@/components/Header";
import {Footer} from "@/components/Footer";

/** The public site: spacious, static, and selling nothing but the mechanics. */
export default function MarketingLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
    </>
  );
}
