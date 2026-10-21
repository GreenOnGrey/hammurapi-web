import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  approverKind,
  type Area,
  type ContextType,
  type ExpertKind,
  type Me,
  type Profile,
  type PublicConfig,
} from "../api/types";

// Roles (FTR.HMR.CMN-0002 §5): product and technical experts of domains, owners of
// services, area administrators and the global administrator. Everybody reads
// everything and creates issues.
export interface Session {
  me: Me;
  profile: Profile;
  config: PublicConfig;
  isExpertOf: (domain: string) => boolean;
  hasExpert: (domain: string, kind: ExpertKind) => boolean;
  canApprove: (domain: string, area: Area) => boolean;
  isAnyExpert: boolean;
  isAreaAdmin: (area: Area) => boolean;
  isAnyAdmin: boolean;
  owns: (service: string) => boolean;
}

const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({
  me,
  profile,
  config,
  children,
}: {
  me: Me;
  profile: Profile;
  config: PublicConfig;
  children: ReactNode;
}) {
  const value = useMemo<Session>(() => {
    const kinds = (domain: string) =>
      me.experts.find((e) => e.domain === domain)?.kinds ?? [];
    const hasExpert = (domain: string, kind: ExpertKind) =>
      kinds(domain).includes(kind);
    return {
      me,
      profile,
      config,
      hasExpert,
      isExpertOf: (domain) => kinds(domain).length > 0,
      canApprove: (domain, area) => hasExpert(domain, approverKind(area)),
      isAnyExpert: me.experts.some((e) => e.kinds.length > 0),
      isAreaAdmin: (area) => me.areaAdmin.includes(area),
      isAnyAdmin: me.globalAdmin || me.areaAdmin.length > 0,
      owns: (service) => me.ownedServices.includes(service),
    };
  }, [me, profile, config]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

// ─── Chat context: the issue, feature or release open on the screen ──

export interface ChatSubject {
  type: ContextType;
  key: string;
  title: string;
}

export interface ChatContextValue {
  subject: ChatSubject | null;
  area: Area | null;
  setSubject: (s: ChatSubject | null, area?: Area | null) => void;
  open: boolean; // mobile overlay
  setOpen: (v: boolean) => void;
  /** Desktop: the panel is folded into a rail at the right edge (FTR.HMR.SPEC-0001 R8, R9). */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** The agent wrote while the panel was folded (R10). */
  unread: boolean;
  markUnread: () => void;
  /** Queue a message to send from outside the chat (e.g. "Ask the agent"). */
  outbox: string | null;
  send: (text: string) => void;
  takeOutbox: () => string | null;
}

const ChatCtx = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [subject, setS] = useState<ChatSubject | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const collapsedRef = useRef(collapsed);
  const [unread, setUnread] = useState(false);
  const [outbox, setOutbox] = useState<string | null>(null);
  // setCollapsed and markUnread do not change between renders: the adapters
  // name markUnread in their event handlers without subscribing again.
  const setCollapsed = useCallback((v: boolean) => {
    collapsedRef.current = v;
    setCollapsedState(v);
    if (!v) setUnread(false);
    writeCollapsed(v);
  }, []);
  const markUnread = useCallback(() => {
    if (collapsedRef.current) setUnread(true);
  }, []);
  // setSubject and send do not change between renders: pages name them in
  // the dependencies of their effects.
  const setSubject = useCallback<ChatContextValue["setSubject"]>((s, a = null) => {
    setS((prev) =>
      prev?.key === s?.key &&
      prev?.title === s?.title &&
      prev?.type === s?.type
        ? prev
        : s,
    );
    setArea(a);
  }, []);
  const send = useCallback((text: string) => {
    setOutbox(text);
    setOpen(true);
    setCollapsed(false);
  }, [setCollapsed]);
  const value = useMemo<ChatContextValue>(
    () => ({
      subject,
      area,
      open,
      setOpen,
      collapsed,
      setCollapsed,
      unread,
      markUnread,
      outbox,
      setSubject,
      send,
      takeOutbox: () => {
        const o = outbox;
        if (o !== null) setOutbox(null);
        return o;
      },
    }),
    [subject, area, open, collapsed, setCollapsed, unread, markUnread, outbox, setSubject, send],
  );
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

const COLLAPSED_KEY = "hmr-chat-collapsed";

/** The folded chat is remembered in the browser; storage that throws (a private
 * window, blocked site data) leaves the chat open (FTR.HMR.SPEC-0001 R9). */
export function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    // the state lives until the page is reloaded
  }
}

export function useChatContext(): ChatContextValue {
  const c = useContext(ChatCtx);
  if (!c) throw new Error("useChatContext outside ChatProvider");
  return c;
}
