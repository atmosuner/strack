import { useMemo, useState } from "react";

import { MobileShell, type TabId } from "@/components/MobileShell";
import { AccountView } from "@/views/AccountView";
import { AgendaView } from "@/views/AgendaView";
import { BillingView } from "@/views/BillingView";
import { FamilyView } from "@/views/FamilyView";
import { HomeView } from "@/views/HomeView";

const titles: Record<TabId, string> = {
  home: "Classes",
  agenda: "Agenda",
  family: "Family",
  billing: "Billing",
  account: "Account",
};

export default function App() {
  const [tab, setTab] = useState<TabId>("home");

  const title = titles[tab];

  const panel = useMemo(() => {
    switch (tab) {
      case "home":
        return <HomeView />;
      case "agenda":
        return <AgendaView />;
      case "family":
        return <FamilyView />;
      case "billing":
        return <BillingView />;
      case "account":
        return <AccountView />;
      default:
        return null;
    }
  }, [tab]);

  return (
    <MobileShell title={title} active={tab} onTabChange={setTab}>
      {panel}
    </MobileShell>
  );
}
