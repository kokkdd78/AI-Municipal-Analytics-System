"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Archive, ChevronLeft, Download, FileCheck2, RefreshCw, Search, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  archiveClientErrorMessage,
  createArchive,
  getArchiveDetail,
  getArchiveDocument,
  getArchives,
  getEligibleArchiveReports,
  verifyArchive,
} from "@/lib/ecm/client"
import type { ArchiveDetailDto, ArchiveListDto, EligibleArchiveReportDto } from "@/lib/ecm/dto"

interface ArchiveLoadState {
  eligible: EligibleArchiveReportDto[]
  archives: ArchiveListDto[]
  page: number
  totalPages: number
  total: number
  isLoading: boolean
  error: string | null
}

export default function ArchiveScreen() {
  const [queryInput, setQueryInput] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [state, setState] = useState<ArchiveLoadState>({ eligible: [], archives: [], page: 1, totalPages: 0, total: 0, isLoading: true, error: null })
  const [detail, setDetail] = useState<ArchiveDetailDto | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const actionGate = useRef(false)

  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), [])

  useEffect(() => {
    const sequence = ++requestSequence.current
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState((current) => ({ ...current, isLoading: true, error: null }))
    })
    Promise.all([getEligibleArchiveReports(controller.signal), getArchives({ q: query || undefined, page, pageSize: 10 }, controller.signal)])
      .then(([eligible, archives]) => {
        if (sequence !== requestSequence.current) return
        setState({ eligible, archives: archives.archives, page: archives.page, totalPages: archives.totalPages, total: archives.total, isLoading: false, error: null })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (sequence !== requestSequence.current) return
        setState((current) => ({ ...current, isLoading: false, error: archiveClientErrorMessage(error) }))
      })
    return () => controller.abort()
  }, [page, query, refreshVersion])

  async function archiveReport(reportId: string) {
    if (actionGate.current) return
    actionGate.current = true
    setPendingId(reportId)
    setFeedback(null)
    try {
      const archive = await createArchive(reportId)
      setFeedback(`Archive ${archive.ecmRecordNumber} is stored and ready for verification.`)
      refresh()
    } catch (error) {
      setFeedback(archiveClientErrorMessage(error))
    } finally {
      actionGate.current = false
      setPendingId(null)
    }
  }

  async function loadDetail(id: string) {
    setDetailError(null)
    try { setDetail(await getArchiveDetail(id)) } catch (error) { setDetailError(archiveClientErrorMessage(error)) }
  }

  async function verify(id: string) {
    if (actionGate.current) return
    actionGate.current = true
    setPendingId(id)
    setFeedback(null)
    try {
      const result = await verifyArchive(id)
      setFeedback(result.valid ? "Archive checksum verified successfully." : "Archive integrity verification failed.")
      await loadDetail(id)
    } catch (error) {
      setFeedback(archiveClientErrorMessage(error))
    } finally {
      actionGate.current = false
      setPendingId(null)
    }
  }

  async function openDocument(id: string) {
    if (actionGate.current) return
    actionGate.current = true
    setPendingId(id)
    try {
      const { documentUrl } = await getArchiveDocument(id)
      window.open(documentUrl, "_blank", "noopener,noreferrer")
    } catch (error) {
      setFeedback(archiveClientErrorMessage(error))
    } finally {
      actionGate.current = false
      setPendingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-blue-700"><Archive className="h-6 w-6" /><span className="text-sm font-semibold uppercase tracking-wide">ECM Archive</span></div><h1 className="mt-1 text-3xl font-bold text-slate-950">Electronic records archive</h1><p className="mt-2 text-sm text-slate-600">Resolved municipal reports are captured as immutable, checksum-protected archive packages.</p></div><Link href="/manager"><Button variant="outline"><ChevronLeft className="mr-2 h-4 w-4" />Manager area</Button></Link></div>
        {state.error && <Alert text={state.error} onRetry={refresh} />}
        {feedback && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{feedback}</div>}

        <Card className="border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-green-600" /><div><h2 className="font-semibold text-slate-900">Eligible resolved reports</h2><p className="text-xs text-slate-500">Only terminal resolved reports can be archived.</p></div></div>{state.isLoading && state.eligible.length === 0 ? <Loading label="Loading eligible reports…" /> : state.eligible.length === 0 ? <Empty label="No resolved reports are awaiting archive." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{state.eligible.map((report) => <div key={report.id} className="rounded-lg border border-slate-200 p-4"><p className="font-medium text-slate-900">{report.title}</p><p className="mt-1 text-xs text-slate-500">{report.category} · {report.district.name}</p><p className="mt-1 text-xs text-slate-500">Resolved {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : "date unavailable"}</p><Button className="mt-4 w-full" size="sm" onClick={() => void archiveReport(report.id)} disabled={pendingId !== null}>{pendingId === report.id ? "Archiving…" : "Archive report"}</Button></div>)}</div>}</Card>

        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Archive records</h2><p className="text-xs text-slate-500">{state.total} stored archive records</p></div><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()) }}><label className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} maxLength={120} placeholder="ECM number, report, district" className="h-9 w-64 rounded-md border border-slate-300 pl-8 pr-2 text-sm" /></label><Button size="sm" type="submit">Search</Button></form></div>{state.isLoading && state.archives.length === 0 ? <Loading label="Loading archive records…" /> : state.archives.length === 0 ? <Empty label="No archive records match this search." /> : <ArchiveTable archives={state.archives} onOpen={loadDetail} />}{state.totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3"><Button size="sm" variant="outline" disabled={state.page <= 1 || state.isLoading} onClick={() => setPage(state.page - 1)}>Previous</Button><span className="text-xs text-slate-500">Page {state.page} of {state.totalPages}</span><Button size="sm" variant="outline" disabled={state.page >= state.totalPages || state.isLoading} onClick={() => setPage(state.page + 1)}>Next</Button></div>}</Card>
        {detailError && <Alert text={detailError} onRetry={() => detail && void loadDetail(detail.id)} />}
        {detail && <ArchiveDetail detail={detail} pendingId={pendingId} onClose={() => setDetail(null)} onVerify={verify} onOpenDocument={openDocument} />}
      </div>
    </main>
  )
}

function ArchiveTable({ archives, onOpen }: { archives: ArchiveListDto[]; onOpen: (id: string) => void }) { return <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">ECM record</th><th className="px-5 py-3">Report</th><th className="px-5 py-3">District</th><th className="px-5 py-3">Archived</th><th className="px-5 py-3">Retention</th><th className="px-5 py-3">Checksum</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{archives.map((archive) => <tr key={archive.id}><td className="px-5 py-4 font-medium text-blue-700">{archive.ecmRecordNumber}</td><td className="px-5 py-4"><p>{archive.reportTitle}</p><p className="text-xs text-slate-500">{archive.reportId}</p></td><td className="px-5 py-4">{archive.districtName}</td><td className="px-5 py-4">{new Date(archive.archivedAt).toLocaleDateString()}</td><td className="px-5 py-4">{new Date(archive.retentionUntil).toLocaleDateString()}</td><td className="px-5 py-4 font-mono text-xs">{archive.checksum.slice(0, 12)}…</td><td className="px-5 py-4"><Button size="sm" variant="outline" onClick={() => void onOpen(archive.id)}>View</Button></td></tr>)}</tbody></table></div> }

function ArchiveDetail({ detail, pendingId, onClose, onVerify, onOpenDocument }: { detail: ArchiveDetailDto; pendingId: string | null; onClose: () => void; onVerify: (id: string) => Promise<void>; onOpenDocument: (id: string) => Promise<void> }) {
  const manifest = detail.manifest
  return <Card className="border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Archive detail</p><h2 className="mt-1 text-xl font-bold text-slate-950">{detail.ecmRecordNumber}</h2><p className="mt-1 text-sm text-slate-600">{manifest.report.title} · {manifest.report.district.name}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void onOpenDocument(detail.id)} disabled={pendingId !== null}><Download className="mr-2 h-4 w-4" />Open package</Button><Button size="sm" onClick={() => void onVerify(detail.id)} disabled={pendingId !== null}><ShieldCheck className="mr-2 h-4 w-4" />{pendingId === detail.id ? "Verifying…" : "Verify integrity"}</Button><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><DetailSection title="Report metadata"><Meta label="Status" value={manifest.report.status} /><Meta label="Category" value={manifest.report.category} /><Meta label="Severity" value={manifest.report.severity ?? "Unclassified"} /><Meta label="Votes" value={String(manifest.report.voteCount)} /><Meta label="Coordinates" value={`${manifest.report.coordinates.latitude}, ${manifest.report.coordinates.longitude}`} /><Meta label="Retention" value={new Date(detail.retentionUntil).toLocaleString()} /></DetailSection><DetailSection title="Integrity"><Meta label="Provider" value={detail.provider} /><Meta label="Checksum" value={detail.checksum} mono /><Meta label="Archived" value={new Date(detail.archivedAt).toLocaleString()} /><Meta label="Package" value="Canonical JSON document" /></DetailSection></div><p className="mt-5 whitespace-pre-wrap text-sm text-slate-700">{manifest.report.description}</p><DetailSection title="Status timeline"><Timeline entries={manifest.statusHistory.map((entry) => ({ id: entry.id, title: `${entry.fromStatus ?? "Submitted"} → ${entry.toStatus}`, detail: entry.note, time: entry.createdAt }))} /></DetailSection><DetailSection title={`Attachments (${manifest.attachments.length})`}>{manifest.attachments.length === 0 ? <p className="text-sm text-slate-500">No report attachments.</p> : <ul className="space-y-2">{manifest.attachments.map((attachment) => <li key={attachment.id} className="text-sm"><a href={attachment.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{attachment.name}</a><span className="ml-2 text-xs text-slate-500">{attachment.kind}</span></li>)}</ul>}</DetailSection><DetailSection title={`Work orders (${manifest.workOrders.length})`}>{manifest.workOrders.length === 0 ? <p className="text-sm text-slate-500">No related work orders.</p> : <div className="space-y-3">{manifest.workOrders.map((workOrder) => <div key={workOrder.id} className="rounded-md border border-slate-200 p-3 text-sm"><p className="font-medium">{workOrder.title}</p><p className="text-slate-600">{workOrder.status} · {workOrder.priority}</p><p className="mt-1 text-xs text-slate-500">Crew: {workOrder.assignments.map((assignment) => assignment.crewUser.name).join(", ") || "Unassigned"}</p><p className="mt-1 text-xs text-slate-500">Completion evidence: {workOrder.attachments.filter((attachment) => attachment.kind === "completion-evidence").length}</p></div>)}</div>}</DetailSection><DetailSection title="Archive audit events"><Timeline entries={detail.auditEvents.map((event) => ({ id: event.id, title: event.type, detail: null, time: event.createdAt }))} /></DetailSection></Card>
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section className="mt-6"><h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3><div className="rounded-lg border border-slate-200 bg-slate-50 p-4">{children}</div></section> }
function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="flex gap-3 py-1 text-sm"><span className="w-28 shrink-0 text-slate-500">{label}</span><span className={`break-all font-medium text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</span></div> }
function Timeline({ entries }: { entries: { id: string; title: string; detail: string | null; time: string }[] }) { return entries.length === 0 ? <p className="text-sm text-slate-500">No events recorded.</p> : <ol className="space-y-3">{entries.map((entry) => <li key={entry.id} className="border-l-2 border-blue-200 pl-3"><p className="text-sm font-medium text-slate-800">{entry.title}</p>{entry.detail && <p className="text-xs text-slate-600">{entry.detail}</p>}<p className="text-xs text-slate-500">{new Date(entry.time).toLocaleString()}</p></li>)}</ol> }
function Alert({ text, onRetry }: { text: string; onRetry: () => void }) { return <div role="alert" className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{text}</span><Button size="sm" variant="outline" onClick={onRetry}>Retry</Button></div> }
function Loading({ label }: { label: string }) { return <div className="flex min-h-24 items-center justify-center p-6 text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{label}</div> }
function Empty({ label }: { label: string }) { return <div className="min-h-24 p-8 text-center text-sm text-slate-500">{label}</div> }
