import type { ChatSessionSummary } from "../../../lib/api/flowChatSessionsApi";

interface ChatHistorySidebarProps {
  sessions: ChatSessionSummary[];
  sessionsLoading: boolean;
  currentSessionId: string | null;
  sessionDeleteId: string | null;
  onLoadSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onSetDeleteId: (id: string | null) => void;
}

export function ChatHistorySidebar({
  sessions,
  sessionsLoading,
  currentSessionId,
  sessionDeleteId,
  onLoadSession,
  onNewSession,
  onDeleteSession,
  onSetDeleteId,
}: ChatHistorySidebarProps) {
  return (
    <div className="w-[220px] shrink-0 border-r border-[#d1d9e0] bg-white flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#d1d9e0]">
        <span className="text-sm font-semibold text-[#1f2328] flex-1">Chat History</span>
        <button
          onClick={onNewSession}
          className="text-[#656d76] hover:text-[#1f2328] p-0.5 rounded hover:bg-[#eef1f6] transition-colors"
          title="New conversation"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessionsLoading && (
          <div className="flex items-center justify-center py-6">
            <svg className="w-4 h-4 animate-spin text-[#656d76]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        {!sessionsLoading && sessions.length === 0 && (
          <p className="px-3 py-4 text-sm text-[#656d76] text-center">No past conversations</p>
        )}
        {!sessionsLoading && sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex items-start gap-1.5 px-3 py-2 cursor-pointer transition-colors border-b border-[#f0f0f0] ${
              s.id === currentSessionId ? "bg-[#ddf4ff]" : "hover:bg-[#f6f8fa]"
            }`}
          >
            <button
              onClick={() => onLoadSession(s.id)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium text-[#1f2328] truncate leading-snug">{s.title}</p>
              <p className="text-xs text-[#656d76] mt-0.5">
                {new Date(s.updatedAt).toLocaleDateString()} · {s.messageCount} msg{s.messageCount !== 1 ? "s" : ""}
                {s.totalCost > 0 && ` · $${s.totalCost.toFixed(4)}`}
              </p>
            </button>
            {sessionDeleteId === s.id ? (
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <button
                  onClick={() => onDeleteSession(s.id)}
                  className="text-sm text-[#d1242f] hover:underline"
                >
                  Delete
                </button>
                <button
                  onClick={() => onSetDeleteId(null)}
                  className="text-sm text-[#656d76] hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSetDeleteId(s.id)}
                className="shrink-0 mt-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 text-[#656d76] hover:text-[#d1242f] hover:bg-[#ffebe9] transition-all"
                title="Delete"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
