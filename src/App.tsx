import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Clock3,
  Cloud,
  CloudOff,
  Download,
  Droplets,
  Edit3,
  Home,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  UserRound,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";
import "./App.css";
import { useCloudContext } from "./hooks/useCloudContext";
import { localContext, useFeedings } from "./hooks/useFeedings";
import {
  addDays,
  dayKey,
  formatDayTitle,
  formatElapsed,
  formatFullDate,
  formatTime,
  fromDateTimeInput,
  isSameLocalDay,
  toDateTimeInput,
} from "./lib/dates";
import { clearLocalDatabase } from "./lib/storage";
import { supabase } from "./lib/supabase";
import {
  activeFeedings,
  buildInsights,
  feedingsForDay,
  totalAmount,
} from "./lib/stats";
import type {
  AppTab,
  Feeding,
  FeedingInput,
  InsightRange,
  SyncState,
} from "./lib/types";
import { getModelContext } from "./lib/webmcp";

const quickDefaults = [60, 90, 120];

const MilkMark = ({ small = false }: { small?: boolean }) => (
  <span
    className={`milk-mark ${small ? "milk-mark--small" : ""}`}
    aria-hidden="true"
  >
    <Droplets strokeWidth={2.25} />
  </span>
);

function LoadingScreen() {
  return (
    <main className="centered-screen">
      <MilkMark />
      <LoaderCircle className="spin" aria-hidden="true" />
      <p>Opening Maneli’s log…</p>
    </main>
  );
}

function SignIn({
  onSend,
  onJoinWithCode,
  externalError,
}: {
  onSend: (email: string) => Promise<{ error: Error | null }>;
  onJoinWithCode: (code: string) => Promise<{ error: Error | null }>;
  externalError?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [codeStatus, setCodeStatus] = useState<"idle" | "joining">("idle");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const result = await onSend(email.trim());
    if (result.error) {
      setError(result.error.message);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  };

  const joinWithCode = async (event: FormEvent) => {
    event.preventDefault();
    setCodeStatus("joining");
    setError("");
    const result = await onJoinWithCode(code.trim().toUpperCase());
    if (result.error) {
      setError(result.error.message);
      setCodeStatus("idle");
    }
  };

  const busy = status === "sending" || codeStatus === "joining";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <MilkMark />
        <p className="eyebrow">MANELI’S MILK LOG</p>
        <h1>A little log for every bottle.</h1>
        <p className="auth-copy">
          Sign in to keep Maneli’s feeding history private and in sync.
        </p>
        {status === "sent" ? (
          <div className="auth-success" role="status">
            <span className="success-icon">
              <Check />
            </span>
            <div>
              <strong>Check your inbox</strong>
              <p>We sent a secure sign-in link to {email}.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button className="primary-button" disabled={busy}>
              {status === "sending" ? (
                <LoaderCircle className="spin" />
              ) : (
                <span>Send magic link</span>
              )}
              {status !== "sending" && <ArrowRight />}
            </button>
          </form>
        )}
        {status !== "sent" && (
          <>
            <div className="or-divider">
              <span>or</span>
            </div>
            <form className="join-form code-sign-in" onSubmit={joinWithCode}>
              <label htmlFor="partner-code">Partner invitation code</label>
              <div className="join-row">
                <input
                  id="partner-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\s/g, "").toUpperCase())
                  }
                  placeholder="ABC12345"
                  autoComplete="one-time-code"
                  minLength={8}
                  maxLength={8}
                  pattern="[A-F0-9]{8}"
                  title="Enter the eight-character invitation code"
                  required
                />
                <button className="secondary-button" disabled={busy}>
                  {codeStatus === "joining" ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    "Enter"
                  )}
                </button>
              </div>
              <p className="code-access-note">
                No email needed. Access stays on this device; signing out or clearing
                Safari data requires a new code.
              </p>
            </form>
          </>
        )}
        {(error || externalError) && status !== "sent" && (
          <p className="field-error auth-error">{error || externalError}</p>
        )}
        <p className="privacy-note">
          No password. Only invited family members can see the records.
        </p>
      </section>
    </main>
  );
}

function FamilySetup({
  onCreate,
  onJoin,
  error,
}: {
  onCreate: () => Promise<unknown>;
  onJoin: (code: string) => Promise<{ error: Error | null }>;
  error?: string | null;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [localError, setLocalError] = useState("");

  const create = async () => {
    setBusy("create");
    setLocalError("");
    await onCreate();
    setBusy(null);
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("join");
    setLocalError("");
    const result = await onJoin(code.trim().toUpperCase());
    if (result.error) setLocalError(result.error.message);
    setBusy(null);
  };

  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <MilkMark />
        <p className="eyebrow">ONE LAST STEP</p>
        <h1>Set up your family log.</h1>
        <p className="auth-copy">
          Create Maneli’s log, or join it with an invitation code.
        </p>
        <button
          className="primary-button"
          onClick={create}
          disabled={Boolean(busy)}
        >
          {busy === "create" ? <LoaderCircle className="spin" /> : <Plus />}
          Create Maneli’s log
        </button>
        <div className="or-divider">
          <span>or</span>
        </div>
        <form onSubmit={join} className="join-form">
          <label htmlFor="invite-code">Invitation code</label>
          <div className="join-row">
            <input
              id="invite-code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\s/g, ""))
              }
              placeholder="ABC12345"
              minLength={8}
              maxLength={8}
              pattern="[A-Fa-f0-9]{8}"
              title="Enter the eight-character invitation code"
              required
            />
            <button className="secondary-button" disabled={Boolean(busy)}>
              Join
            </button>
          </div>
        </form>
        {(localError || error) && (
          <p className="field-error">{localError || error}</p>
        )}
      </section>
    </main>
  );
}

function SyncPill({
  state,
  online,
  local,
}: {
  state: SyncState;
  online: boolean;
  local: boolean;
}) {
  if (local) {
    return (
      <span className="sync-pill sync-pill--local">
        <Smartphone /> Local preview
      </span>
    );
  }
  if (!online) {
    return (
      <span className="sync-pill sync-pill--pending">
        <WifiOff /> Offline · saved
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className="sync-pill sync-pill--pending">
        <RefreshCw className="spin" /> Syncing
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="sync-pill sync-pill--error">
        <CloudOff /> Sync issue
      </span>
    );
  }
  return (
    <span className="sync-pill">
      <Cloud /> Synced
    </span>
  );
}

function SummaryCard({ feedings }: { feedings: Feeding[] }) {
  const total = totalAmount(feedings);
  const latest = activeFeedings(feedings)[0];
  return (
    <section className="summary-card" aria-label="Today's feeding summary">
      <div className="summary-topline">
        <span>Today’s total</span>
        <span className="summary-date">
          {new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
          }).format(new Date())}
        </span>
      </div>
      <div className="summary-value">
        <strong>{total}</strong>
        <span>ml</span>
      </div>
      <div className="summary-meta">
        <span>
          <Droplets /> {feedings.length}{" "}
          {feedings.length === 1 ? "feed" : "feeds"}
        </span>
        <span>
          <Clock3 /> {latest ? formatElapsed(latest.fed_at) : "No feeds yet"}
        </span>
      </div>
      <div className="summary-orbit" aria-hidden="true" />
      <div className="summary-bubble summary-bubble--one" aria-hidden="true" />
      <div className="summary-bubble summary-bubble--two" aria-hidden="true" />
    </section>
  );
}

function FeedingForm({
  quickAmounts,
  initial,
  onSave,
  onCancel,
  compact = false,
}: {
  quickAmounts: number[];
  initial?: Feeding;
  onSave: (input: FeedingInput) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [amount, setAmount] = useState(
    initial ? String(initial.amount_ml) : "",
  );
  const initialDateTime = toDateTimeInput(initial?.fed_at ?? new Date());
  const [feedDate, setFeedDate] = useState(initialDateTime.slice(0, 10));
  const [feedTime, setFeedTime] = useState(initialDateTime.slice(11, 16));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      setError("Enter a whole amount between 1 and 1,000 ml.");
      return;
    }
    const fedAt = `${feedDate}T${feedTime}`;
    const parsedDate = new Date(fedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    if (parsedDate.getTime() > Date.now() + 5 * 60_000) {
      setError("The feeding time cannot be in the future.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ amountMl: parsed, fedAt: fromDateTimeInput(fedAt) });
      if (!initial) {
        const now = toDateTimeInput(new Date());
        setAmount("");
        setFeedDate(now.slice(0, 10));
        setFeedTime(now.slice(11, 16));
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "This feeding could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const useCurrentTime = () => {
    const now = toDateTimeInput(new Date());
    setFeedDate(now.slice(0, 10));
    setFeedTime(now.slice(11, 16));
    setError("");
  };

  return (
    <form
      className={`feeding-form ${compact ? "feeding-form--compact" : ""}`}
      onSubmit={submit}
    >
      {!compact && (
        <div className="section-heading">
          <div>
            <p className="eyebrow">QUICK ADD</p>
            <h2>Log a bottle</h2>
          </div>
          <button type="button" className="now-badge" onClick={useCurrentTime}>
            <span /> Use now
          </button>
        </div>
      )}
      <label
        className="amount-label"
        htmlFor={compact ? "edit-amount" : "amount"}
      >
        Amount
      </label>
      <div className="amount-field">
        <input
          id={compact ? "edit-amount" : "amount"}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
          autoFocus={compact}
          aria-describedby={error ? "amount-error" : undefined}
        />
        <span>ml</span>
      </div>
      <div className="quick-amounts" aria-label="Recent amounts">
        {quickAmounts.map((value) => (
          <button
            className={amount === String(value) ? "is-selected" : ""}
            type="button"
            key={value}
            onClick={() => setAmount(String(value))}
          >
            {value} ml
          </button>
        ))}
      </div>
      <div className="date-time-grid">
        <label className="date-time-field">
          <span className="date-time-icon"><CalendarDays /></span>
          <span className="date-time-content">
            <small>Date</small>
            <input
              type="date"
              value={feedDate}
              max={dayKey(new Date())}
              onChange={(event) => setFeedDate(event.target.value)}
              required
            />
          </span>
        </label>
        <label className="date-time-field date-time-field--time">
          <span className="date-time-icon"><Clock3 /></span>
          <span className="date-time-content">
            <small>Time</small>
            <strong className="time-display">{feedTime || "--:--"}</strong>
          </span>
          <input
            className="native-time-input"
            type="time"
            value={feedTime}
            onChange={(event) => setFeedTime(event.target.value)}
            aria-label="Feeding time"
            required
          />
        </label>
      </div>
      {error && (
        <p className="field-error" id="amount-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? <LoaderCircle className="spin" /> : <Plus />}
          {initial ? "Save changes" : "Add feeding"}
        </button>
      </div>
    </form>
  );
}

function FeedingList({
  feedings,
  onEdit,
  onDelete,
  emptyCopy = "No bottles logged for this day.",
}: {
  feedings: Feeding[];
  onEdit: (feeding: Feeding) => void;
  onDelete: (feeding: Feeding) => void;
  emptyCopy?: string;
}) {
  const items = activeFeedings(feedings);
  if (!items.length) {
    return (
      <div className="empty-state">
        <span>
          <Droplets />
        </span>
        <strong>All quiet here</strong>
        <p>{emptyCopy}</p>
      </div>
    );
  }
  return (
    <div className="feeding-list">
      {items.map((feeding, index) => (
        <article className="feeding-row" key={feeding.id}>
          <div className="timeline-rail" aria-hidden="true">
            <span />
            {index < items.length - 1 && <i />}
          </div>
          <div className="bottle-icon">
            <Droplets />
          </div>
          <div className="feeding-main">
            <strong>{feeding.amount_ml} ml</strong>
            <span>{formatTime(feeding.fed_at)}</span>
          </div>
          <span
            className={`row-sync row-sync--${feeding.sync_state}`}
            title={feeding.sync_state}
          >
            {feeding.sync_state === "pending" ? (
              <RefreshCw className="spin" />
            ) : (
              <Check />
            )}
          </span>
          <div className="row-actions">
            <button
              aria-label={`Edit ${feeding.amount_ml} ml feeding`}
              onClick={() => onEdit(feeding)}
            >
              <Edit3 />
            </button>
            <button
              aria-label={`Delete ${feeding.amount_ml} ml feeding`}
              onClick={() => onDelete(feeding)}
            >
              <Trash2 />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function TodayView({
  feedings,
  onSave,
  onEdit,
  onDelete,
}: {
  feedings: Feeding[];
  onSave: (input: FeedingInput) => Promise<void>;
  onEdit: (feeding: Feeding) => void;
  onDelete: (feeding: Feeding) => void;
}) {
  const today = feedingsForDay(feedings, new Date());
  const quickAmounts = useMemo(() => {
    const recent = activeFeedings(feedings).map((feeding) => feeding.amount_ml);
    return [...new Set([...recent, ...quickDefaults])].slice(0, 3);
  }, [feedings]);

  return (
    <div className="today-grid">
      <div className="today-primary">
        <div className="page-intro">
          <p>{formatFullDate(new Date())}</p>
          <h1>
            Good day <span aria-hidden="true">☀</span>
          </h1>
        </div>
        <SummaryCard feedings={today} />
        <section className="surface add-surface">
          <FeedingForm quickAmounts={quickAmounts} onSave={onSave} />
        </section>
      </div>
      <section className="surface timeline-surface">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TODAY</p>
            <h2>Feeding timeline</h2>
          </div>
          <span className="count-badge">{today.length}</span>
        </div>
        <FeedingList feedings={today} onEdit={onEdit} onDelete={onDelete} />
      </section>
    </div>
  );
}

function HistoryView({
  feedings,
  onEdit,
  onDelete,
}: {
  feedings: Feeding[];
  onEdit: (feeding: Feeding) => void;
  onDelete: (feeding: Feeding) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const items = feedingsForDay(feedings, selectedDate);
  const total = totalAmount(items);
  const go = (amount: number) =>
    setSelectedDate((date) => addDays(date, amount));

  return (
    <div className="single-page">
      <div className="page-intro page-intro--row">
        <div>
          <p>Browse every bottle</p>
          <h1>History</h1>
        </div>
        <label className="calendar-button" aria-label="Choose date">
          <CalendarDays />
          <input
            type="date"
            value={dayKey(selectedDate)}
            max={dayKey(new Date())}
            onChange={(event) =>
              setSelectedDate(new Date(`${event.target.value}T12:00:00`))
            }
          />
        </label>
      </div>
      <section className="surface history-surface">
        <div className="date-navigator">
          <button aria-label="Previous day" onClick={() => go(-1)}>
            <ArrowLeft />
          </button>
          <div>
            <strong>{formatDayTitle(selectedDate)}</strong>
            <span>{formatFullDate(selectedDate)}</span>
          </div>
          <button
            aria-label="Next day"
            onClick={() => go(1)}
            disabled={isSameLocalDay(selectedDate, new Date())}
          >
            <ArrowRight />
          </button>
        </div>
        <div className="history-total">
          <div>
            <span>Total</span>
            <strong>
              {total}
              <small> ml</small>
            </strong>
          </div>
          <div>
            <span>Bottles</span>
            <strong>{items.length}</strong>
          </div>
        </div>
        <FeedingList feedings={items} onEdit={onEdit} onDelete={onDelete} />
      </section>
    </div>
  );
}

function InsightsView({ feedings }: { feedings: Feeding[] }) {
  const [range, setRange] = useState<InsightRange>("week");
  const summary = useMemo(
    () => buildInsights(feedings, range),
    [feedings, range],
  );
  const max = Math.max(...summary.buckets.map((bucket) => bucket.amount), 1);

  return (
    <div className="single-page">
      <div className="page-intro">
        <p>Patterns at a glance</p>
        <h1>Insights</h1>
      </div>
      <div
        className="segment-control"
        role="tablist"
        aria-label="Insights range"
      >
        {(["week", "month", "year"] as InsightRange[]).map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={range === item}
            className={range === item ? "is-active" : ""}
            onClick={() => setRange(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <section className="insight-summary">
        <p>{summary.periodLabel}</p>
        <strong>
          {summary.total.toLocaleString()} <small>ml</small>
        </strong>
        <span>Total milk</span>
      </section>
      <section className="surface chart-surface">
        <div className="section-heading">
          <div>
            <p className="eyebrow">INTAKE</p>
            <h2>{range === "year" ? "Monthly totals" : "Daily totals"}</h2>
          </div>
          <BarChart3 className="heading-icon" />
        </div>
        <div
          className={`bar-chart bar-chart--${range}`}
          aria-label={`${range} feeding chart`}
        >
          {summary.buckets.map((bucket) => (
            <div
              className="bar-column"
              key={bucket.key}
              title={`${bucket.label}: ${bucket.amount} ml`}
            >
              <span className="bar-value">{bucket.amount || ""}</span>
              <div className="bar-track">
                <i
                  style={{
                    height: `${Math.max(bucket.amount ? 8 : 2, (bucket.amount / max) * 100)}%`,
                  }}
                />
              </div>
              <span className="bar-label">{bucket.label}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="metric-grid">
        <article>
          <span>Daily average</span>
          <strong>
            {summary.average}
            <small> ml</small>
          </strong>
        </article>
        <article>
          <span>Total bottles</span>
          <strong>{summary.count}</strong>
        </article>
      </div>
    </div>
  );
}

function SettingsView({
  local,
  email,
  onSignOut,
  onToast,
}: {
  local: boolean;
  email?: string;
  onSignOut: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  const makeInvite = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_household_invite");
    setBusy(false);
    if (error) {
      onToast(error.message);
      return;
    }
    setInviteCode(String(data));
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteCode);
    onToast("Invitation code copied");
  };

  const clearPreview = async () => {
    if (!window.confirm("Remove all local preview entries from this browser?"))
      return;
    await clearLocalDatabase();
    window.location.reload();
  };

  return (
    <div className="single-page settings-page">
      <div className="page-intro">
        <p>Your family space</p>
        <h1>Settings</h1>
      </div>
      <section className="surface profile-card">
        <span className="profile-icon">
          <UserRound />
        </span>
        <div>
          <strong>{local ? "Local preview" : "Maneli's family"}</strong>
          <p>{email ?? "Data saved in this browser"}</p>
        </div>
        <span className="status-dot">
          <span /> {local ? "Local" : "Active"}
        </span>
      </section>

      {!local && (
        <section className="surface settings-section">
          <div className="settings-icon">
            <UsersRound />
          </div>
          <div className="settings-copy">
            <h2>Invite your partner</h2>
            <p>Create a one-time code that expires in seven days.</p>
          </div>
          {inviteCode ? (
            <div className="invite-result">
              <code>{inviteCode}</code>
              <button className="secondary-button" onClick={copyInvite}>
                Copy
              </button>
            </div>
          ) : (
            <button
              className="secondary-button settings-action"
              onClick={makeInvite}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="spin" /> : "Create code"}
            </button>
          )}
        </section>
      )}

      <section className="surface settings-section install-section">
        <div className="settings-icon">
          <Download />
        </div>
        <div className="settings-copy">
          <h2>Add to iPhone</h2>
          <p>In Safari, tap Share, then choose “Add to Home Screen.”</p>
        </div>
        <div className="install-steps" aria-label="iPhone installation steps">
          <span>
            <b>1</b> Open in Safari
          </span>
          <i />
          <span>
            <b>2</b> Tap Share
          </span>
          <i />
          <span>
            <b>3</b> Add to Home Screen
          </span>
        </div>
      </section>

      {local ? (
        <section className="surface settings-section local-note">
          <div className="settings-icon">
            <Smartphone />
          </div>
          <div className="settings-copy">
            <h2>Preview mode</h2>
            <p>Add Supabase keys to enable private sign-in and shared sync.</p>
          </div>
          <button className="text-button danger-text" onClick={clearPreview}>
            Clear preview data
          </button>
        </section>
      ) : (
        <button className="sign-out-button" onClick={() => void onSignOut()}>
          <LogOut /> Sign out
        </button>
      )}
      <p className="version-note">Maneli Milk Log · Private family tracker</p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function App() {
  const cloud = useCloudContext();
  const context = cloud.context ?? localContext;
  const data = useFeedings(context);
  const [tab, setTab] = useState<AppTab>("today");
  const [editing, setEditing] = useState<Feeding | null>(null);
  const [deleting, setDeleting] = useState<Feeding | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (cloud.isLoading || (cloud.isCloudConfigured && !cloud.context)) return;
    const modelContext = getModelContext();
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();

    const register = async () => {
      await modelContext.registerTool(
        {
          name: "log_milk_feeding",
          title: "Log milk feeding",
          description:
            "Add one milk feeding for Maneli and update the visible feeding log.",
          inputSchema: {
            type: "object",
            properties: {
              amountMl: { type: "integer", minimum: 1, maximum: 1000 },
              fedAt: {
                type: "string",
                description:
                  "Optional ISO 8601 date and time. Defaults to the current time.",
              },
            },
            required: ["amountMl"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const candidate = input as {
              amountMl?: unknown;
              fedAt?: unknown;
            };
            if (
              !Number.isInteger(candidate.amountMl) ||
              Number(candidate.amountMl) < 1 ||
              Number(candidate.amountMl) > 1000
            ) {
              throw new Error(
                "amountMl must be a whole number between 1 and 1000",
              );
            }
            const fedAt = candidate.fedAt
              ? new Date(String(candidate.fedAt))
              : new Date();
            if (
              Number.isNaN(fedAt.getTime()) ||
              fedAt.getTime() > Date.now() + 5 * 60_000
            ) {
              throw new Error(
                "fedAt must be a valid time that is not in the future",
              );
            }
            const feeding = await data.saveFeeding({
              amountMl: Number(candidate.amountMl),
              fedAt: fedAt.toISOString(),
            });
            setToast(`${feeding.amount_ml} ml added`);
            return {
              id: feeding.id,
              amountMl: feeding.amount_ml,
              fedAt: feeding.fed_at,
              status: "saved",
            };
          },
        },
        { signal: lifecycle.signal },
      );

      await modelContext.registerTool(
        {
          name: "get_today_milk_summary",
          title: "Get today's milk summary",
          description:
            "Read Maneli's total milk, bottle count, and latest feeding for today.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute() {
            const today = feedingsForDay(data.feedings, new Date());
            const latest = activeFeedings(today)[0];
            return {
              date: dayKey(new Date()),
              totalMl: totalAmount(today),
              bottleCount: today.length,
              latestFedAt: latest?.fed_at ?? null,
            };
          },
        },
        { signal: lifecycle.signal },
      );
    };

    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [cloud.context, cloud.isCloudConfigured, cloud.isLoading, data]);

  if (cloud.isLoading) return <LoadingScreen />;
  if (cloud.isCloudConfigured && !cloud.session)
    return (
      <SignIn
        onSend={cloud.sendMagicLink}
        onJoinWithCode={cloud.joinWithCode}
        externalError={cloud.error}
      />
    );
  if (cloud.isCloudConfigured && cloud.session && !cloud.context) {
    return (
      <FamilySetup
        onCreate={cloud.createFamily}
        onJoin={cloud.joinFamily}
        error={cloud.error}
      />
    );
  }

  const save = async (input: FeedingInput, existing?: Feeding) => {
    await data.saveFeeding(input, existing);
    setEditing(null);
    setToast(existing ? "Feeding updated" : `${input.amountMl} ml added`);
  };

  const remove = async () => {
    if (!deleting) return;
    await data.deleteFeeding(deleting);
    setDeleting(null);
    setToast("Feeding removed");
  };

  const quickAmounts = [
    ...new Set([
      ...activeFeedings(data.feedings).map((item) => item.amount_ml),
      ...quickDefaults,
    ]),
  ].slice(0, 3);
  const tabs: { id: AppTab; label: string; icon: ReactNode }[] = [
    { id: "today", label: "Today", icon: <Home /> },
    { id: "history", label: "History", icon: <CalendarDays /> },
    { id: "insights", label: "Insights", icon: <BarChart3 /> },
    { id: "settings", label: "Settings", icon: <MoreHorizontal /> },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <MilkMark small />
          <div>
            <strong>Maneli</strong>
            <span>Milk log</span>
          </div>
        </div>
        <SyncPill
          state={data.syncState}
          online={data.isOnline}
          local={context.mode === "local"}
        />
      </header>

      <main className="app-main" aria-busy={data.isLoading}>
        {tab === "today" && (
          <TodayView
            feedings={data.feedings}
            onSave={(input) => save(input)}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        )}
        {tab === "history" && (
          <HistoryView
            feedings={data.feedings}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        )}
        {tab === "insights" && <InsightsView feedings={data.feedings} />}
        {tab === "settings" && (
          <SettingsView
            local={context.mode === "local"}
            email={context.email}
            onSignOut={cloud.signOut}
            onToast={setToast}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {editing && (
        <Modal title="Edit feeding" onClose={() => setEditing(null)}>
          <FeedingForm
            compact
            initial={editing}
            quickAmounts={quickAmounts}
            onSave={(input) => save(input, editing)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title="Remove this feeding?" onClose={() => setDeleting(null)}>
          <div className="delete-dialog">
            <span className="delete-icon">
              <Trash2 />
            </span>
            <p>
              {deleting.amount_ml} ml at {formatTime(deleting.fed_at)} will be
              removed from Maneli’s history.
            </p>
            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => setDeleting(null)}
              >
                Keep it
              </button>
              <button className="danger-button" onClick={() => void remove()}>
                Remove
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check /> {toast}
        </div>
      )}
      {data.syncError && (
        <button
          className="sync-error-banner"
          onClick={() => void data.retrySync()}
        >
          <CloudOff /> {data.syncError} <span>Retry</span>
        </button>
      )}
    </div>
  );
}

export default App;
