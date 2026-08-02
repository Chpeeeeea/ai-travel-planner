"use client";

import { useState } from "react";
import styles from "./share-controls.module.css";

type ShareRow = { id: string; status: string; expires_at: string | null; created_at: string };

export default function ShareControls({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [expiry, setExpiry] = useState("30");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");

  async function load() {
    const response = await fetch(`/api/trips/shares?run_id=${encodeURIComponent(runId)}`);
    const data = await response.json() as { shares?: ShareRow[]; error?: string };
    if (!response.ok) throw new Error(data.error || "无法读取分享链接");
    setShares(data.shares ?? []);
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    setMessage("");
    if (next) try { await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "无法读取分享链接"); }
  }

  async function createShare() {
    setBusy(true);
    setMessage("");
    setCreatedUrl("");
    try {
      const response = await fetch("/api/trips/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: runId, expires_days: expiry === "never" ? null : Number(expiry) }),
      });
      const data = await response.json() as { path?: string; error?: string };
      if (!response.ok || !data.path) throw new Error(data.error || "创建分享链接失败");
      const url = new URL(data.path, window.location.origin).toString();
      setCreatedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setMessage("只读链接已复制；你可以随时在这里撤销。");
      } catch {
        setMessage("只读链接已创建，请手动复制下方地址。关闭后无法再次查看原始链接。");
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建分享链接失败");
    } finally { setBusy(false); }
  }

  async function revoke(shareId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/trips/shares", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ share_id: shareId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "撤销失败");
      setMessage("分享链接已撤销。 ");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "撤销失败"); }
    finally { setBusy(false); }
  }

  const activeShares = shares.filter((share) => share.status === "active" && (!share.expires_at || share.expires_at > new Date().toISOString()));
  return <div className={styles.root}>
    <button className={styles.trigger} onClick={toggle} aria-expanded={open}>分享行程</button>
    {open && <section className={styles.panel} aria-label="分享行程">
      <header><strong>只读分享</strong><button onClick={() => setOpen(false)} aria-label="关闭分享面板">×</button></header>
      <p>访客只能查看卡片和地图，不能编辑行程或访问你的任务记录。</p>
      <div className={styles.create}><select value={expiry} onChange={(event) => setExpiry(event.target.value)} aria-label="分享有效期"><option value="7">7 天</option><option value="30">30 天</option><option value="90">90 天</option><option value="never">长期有效</option></select><button disabled={busy} onClick={createShare}>{busy ? "处理中…" : "创建并复制"}</button></div>
      {message && <small>{message}</small>}
      {createdUrl && <input className={styles.url} value={createdUrl} readOnly onFocus={(event) => event.currentTarget.select()} aria-label="新创建的只读分享链接" />}
      <div className={styles.list}>{activeShares.map((share) => <div key={share.id}><span>{share.expires_at ? `${new Date(share.expires_at).toLocaleDateString("zh-CN")} 到期` : "长期有效"}</span><button disabled={busy} onClick={() => revoke(share.id)}>撤销</button></div>)}</div>
    </section>}
  </div>;
}
