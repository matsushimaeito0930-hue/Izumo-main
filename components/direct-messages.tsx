"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, MessageCircle, Send, X } from "lucide-react";
import { Panel } from "@/components/panel";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { formatDateTime } from "@/lib/datetime";
import type { DirectMessage, DirectMessageContact, UserRole } from "@/lib/types";

type Viewer = { login: string; displayName: string; role: UserRole };

const ROLE_LABEL: Record<UserRole, string> = {
  participant: "参加者",
  mentor: "メンター",
  admin: "運営",
  judge: "審査員"
};

/**
 * チーム共通の運営相談とは切り分けた、メンター・運営との個人DM。
 * 受信者も送信者もAPIでログイン中の本人に限定して取得する。
 */
export function DirectMessages({ viewer }: { viewer: Viewer | null }) {
  const [contacts, setContacts] = useState<DirectMessageContact[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selectedLogin, setSelectedLogin] = useState("");
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const load = async (quiet = false) => {
    if (!viewer) return;
    if (!quiet) setIsLoading(true);
    try {
      const response = await fetch("/api/direct-messages", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        contacts?: DirectMessageContact[];
        messages?: DirectMessage[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "DMを読み込めませんでした。");
      setContacts(payload.contacts ?? []);
      setMessages(payload.messages ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "DMを読み込めませんでした。");
    } finally {
      if (!quiet) setIsLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const supabase = createBrowserSupabaseClient();

    // Supabaseが未設定のローカルでは、これまで通り短い間隔で取り直す。
    if (!supabase) {
      const interval = window.setInterval(() => void load(true), 5000);
      return () => {
        window.clearTimeout(initialLoad);
        window.clearInterval(interval);
      };
    }

    // 立て続けの更新でAPIを叩きすぎないよう、少しだけまとめる。
    let pending: number | undefined;
    const scheduleReload = () => {
      if (pending) window.clearTimeout(pending);
      pending = window.setTimeout(() => void load(true), 120);
    };

    const channel = supabase
      .channel("hackverse-direct-messages")
      .on(
        "postgres_changes",
        // 流れてくるのは時刻だけ。DMの本文はここには載せず、APIから取り直す。
        { event: "UPDATE", schema: "public", table: "app_change_signal" },
        scheduleReload
      )
      .subscribe();

    // 接続が切れていても取り残されないための保険。通常はWebSocketが先に届く。
    const safetyPoll = window.setInterval(() => void load(true), 15000);

    return () => {
      window.clearTimeout(initialLoad);
      if (pending) window.clearTimeout(pending);
      window.clearInterval(safetyPoll);
      void supabase.removeChannel(channel);
    };
    // viewer のログインが切り替わった時だけDMを読み直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.login]);

  const activeLogin = contacts.some((contact) => contact.github_username === selectedLogin)
    ? selectedLogin
    : contacts[0]?.github_username ?? "";
  const selected = contacts.find((contact) => contact.github_username === activeLogin) ?? null;
  const groupedContacts = useMemo(
    () => ({
      admins: contacts.filter((contact) => contact.role === "admin"),
      mentors: contacts.filter((contact) => contact.role === "mentor"),
      participants: contacts.filter((contact) => contact.role === "participant")
    }),
    [contacts]
  );
  const conversation = useMemo(
    () =>
      selected
        ? messages.filter((message) => {
            // GitHubのアカウント名は大文字小文字を区別しない。
            // ここで厳密に比べると、記録された綴りが違うだけで会話が消える。
            const partner = selected.github_username.toLowerCase();
            return (
              message.sender_login.toLowerCase() === partner ||
              message.recipient_login.toLowerCase() === partner
            );
          })
        : [],
    [messages, selected]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || (!text.trim() && !attachment)) return;
    setIsSending(true);
    setError("");
    try {
      const response = await fetch("/api/direct-messages", {
        method: "POST",
        body: (() => {
          const formData = new FormData();
          formData.set("recipientLogin", selected.github_username);
          formData.set("body", text);
          if (attachment) formData.set("attachment", attachment);
          return formData;
        })()
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: DirectMessage;
        error?: string;
      };
      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "DMを送信できませんでした。");
      }
      setMessages((current) => [...current, payload.message as DirectMessage]);
      setText("");
      setAttachment(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      // 添付画像には期限付きURLが必要なので、送信直後もサーバーから最新状態を取り直す。
      void load(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "DMを送信できませんでした。");
    } finally {
      setIsSending(false);
    }
  }

  if (!viewer || viewer.role === "judge") return null;

  const contactGroups = [
    { title: "運営", contacts: groupedContacts.admins },
    { title: "メンター", contacts: groupedContacts.mentors },
    { title: "参加者", contacts: groupedContacts.participants }
  ].filter((group) => group.contacts.length > 0);

  return (
    <Panel
      title="個人DM"
      description="運営・メンターとは別々の会話です。選んだ相手とだけメッセージをやり取りできます。"
    >
      <div className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-line bg-paper p-2 shadow-inset">
          {isLoading ? (
            <p className="px-2 py-3 text-sm text-muted">読み込み中…</p>
          ) : contactGroups.length > 0 ? (
            <div className="space-y-3">
              {contactGroups.map((group) => (
                <section key={group.title}>
                  <h3 className="px-2 pb-1 text-xs font-bold text-muted">{group.title}</h3>
                  <div className="space-y-1">
                    {group.contacts.map((contact) => {
                      const active = contact.github_username === activeLogin;
                      return (
                        <button
                          key={contact.github_username}
                          type="button"
                          onClick={() => setSelectedLogin(contact.github_username)}
                          className={`w-full rounded-lg px-2 py-2 text-left transition-colors ${
                            active ? "bg-pulse/10 text-ink" : "text-ink2 hover:bg-surface"
                          }`}
                        >
                          <span className="block truncate text-sm font-bold">{contact.display_name}</span>
                          <span className="block truncate text-xs text-muted">
                            {contact.specialty || ROLE_LABEL[contact.role]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="px-2 py-3 text-sm leading-6 text-muted">
              連絡できる運営・メンターがまだ登録されていません。運営・メンターがこのページを一度開くと表示されます。
            </p>
          )}
        </aside>

        <div className="flex min-h-[22rem] flex-col rounded-xl border border-line bg-paper p-3 shadow-inset">
          {selected ? (
            <>
              <div className="border-b border-line pb-2">
                <p className="font-bold text-ink">{selected.display_name}</p>
                <p className="text-xs text-muted">
                  {ROLE_LABEL[selected.role]}
                  {selected.specialty ? ` ・ 得意：${selected.specialty}` : ""}
                </p>
              </div>
              <div className="flex flex-1 flex-col justify-end gap-3 py-3">
                {conversation.length > 0 ? (
                  conversation.map((message) => {
                    // 相手が送ったもの以外は自分のもの、と決める。
                    // viewer.login はセッションの作り方によって実際のGitHub名と
                    // ずれることがあり、それで突き合わせると左右が全部片側に寄る。
                    // APIは自分が関わるDMしか返さないので、この判定なら狂わない。
                    const own =
                      message.sender_login.toLowerCase() !==
                      selected.github_username.toLowerCase();
                    return (
                      <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] ${own ? "text-right" : "text-left"}`}>
                          <p className={`mb-1 text-xs font-bold ${own ? "text-pulse" : "text-hot"}`}>
                            {own ? "あなた" : message.sender_name}
                          </p>
                          <div
                            className={`rounded-2xl border-2 px-3 py-2 text-left text-sm leading-6 shadow-soft ${
                              own
                                ? "border-pulse/55 bg-pulse/10 text-ink"
                                : "border-hot/55 bg-hot/10 text-ink"
                            }`}
                          >
                            {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                            {message.attachment_url && (
                              <a
                                href={message.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className={`block ${message.body ? "mt-2" : ""}`}
                              >
                                <img
                                  src={message.attachment_url}
                                  alt={message.attachment_name ?? "添付画像"}
                                  className="max-h-64 max-w-full rounded-xl border border-line object-contain"
                                  loading="lazy"
                                />
                                <span className="mt-1 block text-xs underline">画像を開く</span>
                              </a>
                            )}
                          </div>
                          <time className="mt-1 block text-xs text-muted">
                            {formatDateTime(message.created_at)}
                          </time>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid flex-1 place-items-center text-center text-muted">
                    <div>
                      <MessageCircle className="mx-auto size-6" />
                      <p className="mt-2 text-sm">まだメッセージはありません。</p>
                    </div>
                  </div>
                )}
              </div>
              <form onSubmit={submit} className="border-t border-line pt-3">
                {attachment && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-pulse/35 bg-pulse/10 px-3 py-2 text-xs text-ink">
                    <span className="truncate">画像: {attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachment(null);
                        if (attachmentInputRef.current) attachmentInputRef.current.value = "";
                      }}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-paper"
                      aria-label="添付画像を取り消す"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && file.size > 5 * 1024 * 1024) {
                        setAttachment(null);
                        event.target.value = "";
                        setError("画像は5MB以下にしてください。");
                        return;
                      }
                      setAttachment(file);
                      setError("");
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:border-pulse hover:text-pulse"
                    title="画像を添付（PNG・JPEG・GIF・WebP、5MBまで）"
                    aria-label="画像を添付"
                  >
                    <ImagePlus className="size-5" />
                  </button>
                  <input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    maxLength={1000}
                    placeholder={`${selected.display_name} さんにメッセージを書く`}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-pulse"
                  />
                  <button
                    type="submit"
                    disabled={isSending || (!text.trim() && !attachment)}
                    className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white shadow-btn transition hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="size-4" />
                    <span className="hidden sm:inline">送信</span>
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">画像はPNG・JPEG・GIF・WebP、5MBまで添付できます。</p>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-center text-muted">
              <div>
                <MessageCircle className="mx-auto size-6" />
                <p className="mt-2 text-sm">左からDMの相手を選んでください。</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-hot">{error}</p>}
    </Panel>
  );
}
