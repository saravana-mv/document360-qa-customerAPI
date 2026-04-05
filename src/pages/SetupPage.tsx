import { useAuthGuard } from "../hooks/useAuthGuard";
import { Layout } from "../components/common/Layout";
import { SetupPanel } from "../components/setup/SetupPanel";

export function SetupPage() {
  useAuthGuard();
  return (
    <Layout>
      <SetupPanel />
    </Layout>
  );
}
