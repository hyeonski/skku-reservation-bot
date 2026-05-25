import { useCallback, useEffect, useState } from 'react';
import type { ConversationSessionSummary, ReminderDto } from '../shared/types';
import { ChatScene } from './ChatScene';
import { ChatStarter } from './components/ChatStarter';
import { DevNavigator } from './DevNavigator';
import { Onboarding } from './components/Onboarding';
import { SessionList } from './components/SessionList';
import { useConversation } from './hooks/useConversation';
import type { ReminderData, SessionSummary } from './types';

export type View =
  | 'onboarding'
  | 'sessions'
  | 'chat-start'
  | 'chat';

const ONBOARDING_KEY = 'onboardingComplete';

async function sendRuntime<T>(msg: unknown): Promise<T> {
  return (await chrome.runtime.sendMessage(msg)) as T;
}

function mapSessionSummary(row: ConversationSessionSummary): SessionSummary {
  const completedPreview =
    row.status === 'completed'
      ? `예약 완료 · ${row.confirmedSpaceLabel ?? row.confirmedReservationLabel ?? '완료'}`
      : '';
  return {
    id: row.id,
    title: row.title,
    preview: completedPreview || row.lastMessagePreview || '대화 내용 없음',
    updatedAt: row.updatedAt,
    status: row.status,
  };
}

function mapReminder(row: ReminderDto | null | undefined): ReminderData | null {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    pattern: row.pattern,
    proposed: row.proposed,
  };
}

export function App() {
  const [view, setView] = useState<View>('sessions');
  const [booting, setBooting] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [reminder, setReminder] = useState<ReminderData | null>(null);
  const conv = useConversation();

  const refreshSessions = useCallback(async () => {
    const res = await sendRuntime<{
      ok: boolean;
      conversations?: ConversationSessionSummary[];
      error?: string;
    }>({ type: 'POPUP_LIST_CONVERSATIONS' });
    if (!res.ok) throw new Error(res.error ?? '대화 목록을 불러오지 못했습니다.');
    setSessions((res.conversations ?? []).map(mapSessionSummary));
  }, []);

  const refreshReminder = useCallback(async () => {
    const res = await sendRuntime<{
      ok: boolean;
      reminder?: ReminderDto | null;
      error?: string;
    }>({ type: 'POPUP_GET_REMINDER' });
    if (!res.ok) throw new Error(res.error ?? '리마인드를 불러오지 못했습니다.');
    setReminder(mapReminder(res.reminder));
  }, []);

  const refreshHome = useCallback(async () => {
    await Promise.all([
      refreshSessions().catch((error) => console.warn('[sidepanel] session refresh failed', error)),
      refreshReminder().catch((error) => console.warn('[sidepanel] reminder refresh failed', error)),
    ]);
  }, [refreshReminder, refreshSessions]);

  const goSessions = useCallback(() => {
    setView('sessions');
    void refreshHome();
  }, [refreshHome]);
  const goChatStart = useCallback(() => setView('chat-start'), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const got = await chrome.storage.local.get(ONBOARDING_KEY);
      if (cancelled) return;
      const complete = got?.[ONBOARDING_KEY] === true;
      setView(complete ? 'sessions' : 'onboarding');
      setBooting(false);
      if (complete) void refreshHome();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshHome]);

  const completeOnboarding = useCallback(async () => {
    await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    goSessions();
  }, [goSessions]);

  const handleStartFromExample = useCallback(
    (text: string) => {
      conv.newConversation();
      void conv.sendMessage(text);
      setView('chat');
    },
    [conv],
  );

  const handleNewFromHeader = useCallback(() => {
    conv.newConversation();
    setView('chat-start');
  }, [conv]);

  const handlePickSession = useCallback(
    async (session: SessionSummary) => {
      try {
        await conv.restoreConversation(session.id);
        setView('chat');
      } catch (error) {
        console.warn('[sidepanel] restore conversation failed', error);
      }
    },
    [conv],
  );

  const handleDeleteSession = useCallback(async (id: string) => {
    setSessions((prev) => prev.filter((item) => item.id !== id));
    try {
      await sendRuntime({ type: 'POPUP_DELETE_CONVERSATION', conversationId: id });
      await refreshSessions();
    } catch (error) {
      console.warn('[sidepanel] delete conversation failed', error);
      void refreshSessions();
    }
  }, [refreshSessions]);

  const handleAcceptReminder = useCallback(async () => {
    if (!reminder) return;
    try {
      const res = await sendRuntime<{
        ok: boolean;
        reminder?: ReminderDto | null;
        error?: string;
      }>({ type: 'POPUP_ACCEPT_REMINDER', reminderId: reminder.id });
      if (!res.ok) throw new Error(res.error ?? '리마인드를 수락하지 못했습니다.');
      const prompt = res.reminder?.proposed.prompt ?? reminder.proposed.prompt;
      setReminder(null);
      conv.newConversation();
      setView('chat');
      void conv.sendMessage(prompt);
    } catch (error) {
      console.warn('[sidepanel] accept reminder failed', error);
    }
  }, [conv, reminder]);

  const handleDismissReminder = useCallback(async () => {
    if (!reminder) return;
    setReminder(null);
    try {
      await sendRuntime({ type: 'POPUP_DISMISS_REMINDER', reminderId: reminder.id });
    } catch (error) {
      console.warn('[sidepanel] dismiss reminder failed', error);
      void refreshReminder();
    }
  }, [refreshReminder, reminder]);

  if (booting) {
    return <div className="sidepanel-root" />;
  }

  let screen: React.ReactNode;
  switch (view) {
    case 'onboarding':
      screen = <Onboarding onComplete={completeOnboarding} onSkip={completeOnboarding} />;
      break;

    case 'sessions':
      screen = (
        <SessionList
          sessions={sessions}
          reminder={reminder}
          onPick={(session) => {
            void handlePickSession(session);
          }}
          onNew={() => {
            conv.newConversation();
            goChatStart();
          }}
          onDelete={(id) => {
            void handleDeleteSession(id);
          }}
          onAcceptReminder={() => {
            void handleAcceptReminder();
          }}
          onDismissReminder={() => {
            void handleDismissReminder();
          }}
        />
      );
      break;

    case 'chat-start':
      screen = (
        <ChatStarter onSendStarter={handleStartFromExample} onBack={goSessions} />
      );
      break;

    case 'chat':
      screen = (
        <ChatScene conv={conv} onBack={goSessions} onNew={handleNewFromHeader} />
      );
      break;
  }

  return (
    <div className="sidepanel-root">
      {screen}
      {import.meta.env.DEV && <DevNavigator view={view} onView={setView} />}
    </div>
  );
}
