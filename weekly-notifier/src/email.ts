import { Resend } from 'resend';
import { ExpiredPermit, ReceiverGroup } from './types';

export const EMAIL_FROM = 'Permit System <no-reply@workpermits.doctorquesero.com>';
export const MASTER_EMAIL = 'dietrich.truchsess@easternbusway.nz';
const APP_ORIGIN = 'https://eba-digital-permits.web.app/';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ?mode=live makes the app switch out of a stale DEMO setting before the hash route loads.
const permitLink = (id: string): string => `${APP_ORIGIN}?mode=live#/permit/${encodeURIComponent(id)}`;

const fmtExpiry = (iso: string): string =>
  new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });

const cell = 'padding:8px;border:1px solid #d1d5db;font-size:13px;';

const permitsTable = (permits: ExpiredPermit[], showReceiver = false): string => `
  <table style="border-collapse:collapse;width:100%;margin-bottom:8px;">
    <thead><tr style="text-align:left;background:#f3f4f6;">
      <th style="${cell}">Ref</th>${showReceiver ? `<th style="${cell}">Receiver Name</th>` : ''}<th style="${cell}">Type</th><th style="${cell}">Location</th>
      <th style="${cell}">Expiry</th><th style="${cell}">Days Overdue</th><th style="${cell}">Link</th>
    </tr></thead>
    <tbody>${permits.map(p => `<tr>
      <td style="${cell}font-weight:bold;">      ${esc(p.permitRef)}</td>${showReceiver ? `
            <td style="${cell}">${esc(p.receiverName || '(none typed)')}<br/><span style="color:#b45309;font-size:11px;">${esc(p.unassignedReason || '')}</span></td>` : ''}
            <td style="${cell}">${esc(p.permitType)}</td>
      <td style="${cell}">${esc(p.location)}</td>
      <td style="${cell}">${esc(fmtExpiry(p.expiredAt))}</td>
      <td style="${cell}color:#b91c1c;font-weight:bold;text-align:center;">${esc(p.daysOverdue)}</td>
      <td style="${cell}"><a href="${esc(permitLink(p.id))}">Close permit</a></td>
    </tr>`).join('')}</tbody>
  </table>`;

export const buildReceiverHtml = (displayName: string, permits: ExpiredPermit[]): string => {
  const n = permits.length;
  const greeting = displayName.trim() ? `Hi ${esc(displayName)},` : 'Hi Team,';
  return `<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto;color:#111827;">
    <h2>Action required: close your expired permits</h2>
    <p>${greeting}</p>
    <p>You are the Permit Receiver for <b>${n}</b> permit${n === 1 ? '' : 's'} that ${n === 1 ? 'has' : 'have'} expired and not been closed. Please open each permit and complete the closure as soon as possible.</p>
    ${permitsTable(permits)}
    <p style="font-size:12px;color:#6b7280;">Automated weekly reminder from Can You Dig It - Eastern Busway.</p>
  </div>`;
};

export const buildMasterHtml = (
  receivers: ReceiverGroup[],
  unassigned: ExpiredPermit[],
  totalExpired: number,
  generatedAt: string
): string => {
  let sections = receivers.map(r => `
    <h3 style="margin:20px 0 6px;">${esc(r.displayName.trim() ? `${r.displayName.trim()} (${r.receiverEmail})` : r.receiverEmail)} - ${r.permits.length} permit${r.permits.length === 1 ? '' : 's'}</h3>
    ${permitsTable(r.permits)}`).join('');
  if (unassigned.length) {
    sections += `<h3 style="margin:20px 0 6px;color:#b45309;">No receiver email found - ${unassigned.length} permit${unassigned.length === 1 ? '' : 's'}</h3>${permitsTable(unassigned, true)}`;
  }
  return `<div style="font-family:Arial,sans-serif;max-width:860px;margin:auto;color:#111827;">
    <h2>Weekly Master Report: Expired Permits</h2>
    <p><b>${totalExpired}</b> expired permit${totalExpired === 1 ? '' : 's'} not yet closed, across <b>${receivers.length}</b> receiver${receivers.length === 1 ? '' : 's'}.</p>
    ${totalExpired === 0 ? '<p>No expired permits are awaiting closure.</p>' : sections}
    <p style="font-size:12px;color:#6b7280;">Generated ${esc(fmtExpiry(generatedAt))}.</p>
  </div>`;
};

/** Sends one email. Resend returns { error } rather than throwing, so both paths are normalised to a throw. */
export const sendMail = async (
  resend: Resend,
  msg: { to: string; subject: string; html: string }
): Promise<void> => {
  const { error } = await resend.emails.send({ from: EMAIL_FROM, ...msg });
  if (error) throw new Error(`${error.name}: ${error.message}`);
};
