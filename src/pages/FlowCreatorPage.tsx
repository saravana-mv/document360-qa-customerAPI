import { Layout } from "../components/common/Layout";
import { useAuthGuard } from "../hooks/useAuthGuard";

export function FlowCreatorPage() {
  useAuthGuard();

  return (
    <Layout>
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center space-y-2">
          <div className="text-4xl">✨</div>
          <p className="text-sm font-medium text-gray-500">Flow Creator coming soon</p>
          <p className="text-xs text-gray-400">Describe a test flow in plain English and Claude will generate the XML</p>
        </div>
      </div>
    </Layout>
  );
}
